"""
异步任务执行引擎 (TaskEngine)
负责管理异步任务的提交、执行、状态流转、并发控制等
"""
import uuid
import threading
import time
from typing import Callable, Dict, Any, Optional
from loguru import logger


class TaskEngine:
    """异步任务执行引擎"""

    # 最大并发运行任务数
    MAX_CONCURRENT = 10

    def __init__(self, data_manager):
        """
        初始化任务引擎
        :param data_manager: DataManager实例，用于数据库操作
        """
        self._data_manager = data_manager
        # 任务执行函数注册表: task_type -> callable
        self._handlers: Dict[str, Callable] = {}
        # 正在运行的任务线程: task_id -> Thread
        self._running_threads: Dict[str, threading.Thread] = {}
        # 任务取消标志: task_id -> threading.Event (set表示取消)
        self._cancel_flags: Dict[str, threading.Event] = {}
        # 调度锁
        self._lock = threading.Lock()
        # 是否已启动
        self._started = False
        logger.info("[TaskEngine] 任务引擎已初始化")

    def register_handler(self, task_type: str, handler: Callable):
        """
        注册任务处理函数
        :param task_type: 任务类型名称
        :param handler: 处理函数，签名为 handler(params: dict, cancel_event: threading.Event) -> dict
        """
        self._handlers[task_type] = handler
        logger.debug(f"[TaskEngine] 注册任务处理器: {task_type}")

    def startup(self):
        """启动任务引擎：重置未完成任务状态，启动调度"""
        if self._started:
            return
        self._started = True
        # 重置所有running/pending任务为stopped
        affected = self._data_manager.reset_running_tasks_on_startup()
        if affected > 0:
            logger.info(f"[TaskEngine] 启动时重置了 {affected} 个未完成任务")
        logger.info("[TaskEngine] 任务引擎已启动")

    def submit_task(self, hs_name: str, vm_uuid: str, task_type: str,
                    params: dict, username: str = '') -> Dict[str, Any]:
        """
        提交异步任务
        :param hs_name: 主机名称
        :param vm_uuid: 虚拟机UUID
        :param task_type: 任务类型
        :param params: 执行参数
        :param username: 操作人
        :return: {"success": bool, "task_id": str, "message": str}
        """
        # 检查是否有注册的处理器
        if task_type not in self._handlers:
            return {"success": False, "task_id": "", "message": f"未知的任务类型: {task_type}"}

        # 生成任务ID
        task_id = str(uuid.uuid4())

        # 原子性地检查VM冲突并创建任务（在同一事务中完成，避免竞态条件）
        result = self._data_manager.check_and_create_async_task(
            task_id=task_id,
            hs_name=hs_name,
            vm_uuid=vm_uuid,
            task_type=task_type,
            params=params,
            username=username
        )

        if not result["success"]:
            return {"success": False, "task_id": "", "message": result["message"]}

        logger.info(f"[TaskEngine] 任务已提交: task_id={task_id}, type={task_type}, vm={vm_uuid}")

        # 尝试立即调度
        self._try_schedule()

        return {"success": True, "task_id": task_id, "message": "任务已提交"}

    def stop_task(self, task_id: str) -> Dict[str, Any]:
        """
        强行结束任务
        :param task_id: 任务ID
        :return: {"success": bool, "message": str}
        """
        task = self._data_manager.get_async_task(task_id)
        if not task:
            return {"success": False, "message": "任务不存在"}

        status = task.get('status', '')

        if status == 'pending':
            # pending状态直接置为stopped
            self._data_manager.update_async_task_status(task_id, 'stopped')
            logger.info(f"[TaskEngine] 任务已停止(pending): {task_id}")
            return {"success": True, "message": "任务已停止"}

        elif status == 'running':
            # running状态设置取消标志
            cancel_event = self._cancel_flags.get(task_id)
            if cancel_event:
                cancel_event.set()
            # 更新状态为stopped
            self._data_manager.update_async_task_status(task_id, 'stopped')
            # 清理线程引用
            with self._lock:
                self._running_threads.pop(task_id, None)
                self._cancel_flags.pop(task_id, None)
            logger.info(f"[TaskEngine] 任务已强行结束(running): {task_id}")
            # 尝试调度下一个任务
            self._try_schedule()
            return {"success": True, "message": "任务已强行结束"}

        else:
            return {"success": False, "message": f"任务状态为 {status}，无法结束"}

    def retry_task(self, task_id: str) -> Dict[str, Any]:
        """
        重新运行已停止的任务（创建新任务，复用原参数）
        :param task_id: 原任务ID
        :return: {"success": bool, "task_id": str, "message": str}
        """
        task = self._data_manager.get_async_task(task_id)
        if not task:
            return {"success": False, "task_id": "", "message": "任务不存在"}

        if task.get('status') != 'stopped':
            return {"success": False, "task_id": "", "message": "只有已停止的任务才能重新运行"}

        # 复用原任务参数创建新任务
        return self.submit_task(
            hs_name=task['hs_name'],
            vm_uuid=task.get('vm_uuid', ''),
            task_type=task['task_type'],
            params=task.get('params', {}),
            username=task.get('username', '')
        )

    def _try_schedule(self):
        """尝试从pending队列中调度任务执行"""
        with self._lock:
            running_count = self._data_manager.count_running_tasks()
            available_slots = self.MAX_CONCURRENT - running_count

            if available_slots <= 0:
                return

            # 获取pending任务
            pending_tasks = self._data_manager.get_pending_tasks(limit=available_slots)

            for task in pending_tasks:
                task_id = task['task_id']
                vm_uuid = task.get('vm_uuid', '')

                # 再次检查同一VM是否有running任务（避免并发冲突）
                if vm_uuid and self._data_manager.has_running_task_for_vm(vm_uuid):
                    continue

                # 启动执行线程
                self._execute_task(task)

    def _execute_task(self, task: Dict[str, Any]):
        """
        在新线程中执行任务
        :param task: 任务字典
        """
        task_id = task['task_id']
        task_type = task['task_type']

        handler = self._handlers.get(task_type)
        if not handler:
            self._data_manager.update_async_task_status(
                task_id, 'failed', error_message=f"未找到任务处理器: {task_type}"
            )
            return

        # 创建取消标志
        cancel_event = threading.Event()
        self._cancel_flags[task_id] = cancel_event

        def _run():
            try:
                # 更新状态为running
                self._data_manager.update_async_task_status(task_id, 'running')
                logger.info(f"[TaskEngine] 任务开始执行: {task_id} ({task_type})")

                # 执行任务处理函数
                result = handler(task.get('params', {}), cancel_event)

                # 检查是否被取消
                if cancel_event.is_set():
                    logger.info(f"[TaskEngine] 任务被取消: {task_id}")
                    return

                # 执行成功
                self._data_manager.update_async_task_status(task_id, 'completed', result=result or {})
                logger.info(f"[TaskEngine] 任务执行完成: {task_id}")

            except Exception as e:
                # 检查是否被取消
                if cancel_event.is_set():
                    logger.info(f"[TaskEngine] 任务被取消(异常中): {task_id}")
                    return

                error_msg = str(e)
                logger.error(f"[TaskEngine] 任务执行失败: {task_id}, 错误: {error_msg}")
                self._data_manager.update_async_task_status(
                    task_id, 'failed', error_message=error_msg
                )
            finally:
                # 清理线程引用
                with self._lock:
                    self._running_threads.pop(task_id, None)
                    self._cancel_flags.pop(task_id, None)

                # 尝试调度下一个任务
                self._try_schedule()

        thread = threading.Thread(target=_run, name=f"Task-{task_id[:8]}", daemon=True)
        self._running_threads[task_id] = thread
        thread.start()

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        获取任务状态（代理到DataManager）
        :param task_id: 任务ID
        :return: 任务字典或None
        """
        return self._data_manager.get_async_task(task_id)

    def get_task_list(self, **kwargs) -> Dict[str, Any]:
        """
        获取任务列表（代理到DataManager）
        """
        return self._data_manager.get_async_task_list(**kwargs)

    def get_task_stats(self) -> Dict[str, int]:
        """
        获取任务统计（代理到DataManager）
        """
        return self._data_manager.get_async_task_stats()
