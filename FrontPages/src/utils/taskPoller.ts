/**
 * 异步任务轮询工具
 * 封装通用的任务轮询逻辑（3秒间隔、自动停止、状态回调）
 */
import { http } from './axio';
import { message } from 'antd';

/** 任务状态类型 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

/** 任务详情 */
export interface AsyncTask {
  id: number;
  task_id: string;
  hs_name: string;
  vm_uuid: string;
  task_type: string;
  status: TaskStatus;
  params: Record<string, any>;
  result: Record<string, any>;
  error_message: string;
  username: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** 任务列表响应 */
export interface TaskListResponse {
  total: number;
  items: AsyncTask[];
}

/** 任务统计 */
export interface TaskStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  stopped: number;
}

/** 轮询配置 */
export interface PollOptions {
  /** 轮询间隔（毫秒），默认3000 */
  interval?: number;
  /** 最大轮询时长（毫秒），默认600000（10分钟），超时后自动停止轮询 */
  timeout?: number;
  /** 任务完成回调 */
  onCompleted?: (task: AsyncTask) => void;
  /** 任务失败回调 */
  onFailed?: (task: AsyncTask) => void;
  /** 超时回调 */
  onTimeout?: (taskId: string) => void;
  /** 状态变更回调（每次轮询都会触发） */
  onStatusChange?: (task: AsyncTask) => void;
  /** 是否显示消息提示，默认true */
  showMessage?: boolean;
}

// ==================== API方法 ====================

/** 查询单个任务状态 */
export async function getTaskStatus(taskId: string): Promise<AsyncTask | null> {
  try {
    const res = await http.get<AsyncTask>(`/api/system/async_task/${taskId}`, { silent: true });
    return res.code === 200 ? res.data ?? null : null;
  } catch {
    return null;
  }
}

/** 获取任务列表 */
export async function getTaskList(params?: {
  hs_name?: string;
  status?: string;
  task_type?: string;
  vm_uuid?: string;
  page?: number;
  page_size?: number;
}): Promise<TaskListResponse> {
  const query = new URLSearchParams();
  if (params?.hs_name) query.set('hs_name', params.hs_name);
  if (params?.status) query.set('status', params.status);
  if (params?.task_type) query.set('task_type', params.task_type);
  if (params?.vm_uuid) query.set('vm_uuid', params.vm_uuid);
  if (params?.page) query.set('page', String(params.page));
  if (params?.page_size) query.set('page_size', String(params.page_size));

  const res = await http.get<TaskListResponse>(`/api/system/async_task/list?${query.toString()}`);
  return res.data!;
}

/** 获取任务统计 */
export async function getTaskStats(): Promise<TaskStats> {
  const res = await http.get<TaskStats>('/api/system/async_task/stats');
  return res.data ?? { pending: 0, running: 0, completed: 0, failed: 0, stopped: 0 };
}

/** 强行结束任务 */
export async function stopTask(taskId: string) {
  return http.post(`/api/system/async_task/${taskId}/stop`);
}

/** 重新运行任务 */
export async function retryTask(taskId: string) {
  return http.post<{ task_id: string }>(`/api/system/async_task/${taskId}/retry`);
}

// ==================== 轮询器 ====================

/** 活跃的轮询器集合 */
const activePollers = new Map<string, number>();
/** 轮询超时定时器集合 */
const pollerTimeouts = new Map<string, number>();

/**
 * 开始轮询任务状态
 * @param taskId 任务ID
 * @param options 轮询配置
 * @returns 停止轮询的函数
 */
export function startTaskPolling(taskId: string, options: PollOptions = {}): () => void {
  const {
    interval = 3000,
    timeout = 600000,
    onCompleted,
    onFailed,
    onTimeout,
    onStatusChange,
    showMessage = true,
  } = options;

  // 如果已有该任务的轮询器，先停止
  stopTaskPolling(taskId);

  const poll = async () => {
    const task = await getTaskStatus(taskId);
    if (!task) return;

    // 触发状态变更回调
    onStatusChange?.(task);

    // 检查终态
    if (task.status === 'completed') {
      stopTaskPolling(taskId);
      if (showMessage) message.success('任务执行完成');
      onCompleted?.(task);
    } else if (task.status === 'failed') {
      stopTaskPolling(taskId);
      if (showMessage) message.error(`任务执行失败: ${task.error_message || '未知错误'}`);
      onFailed?.(task);
    } else if (task.status === 'stopped') {
      stopTaskPolling(taskId);
      if (showMessage) message.warning('任务已停止');
    }
  };

  // 立即执行一次
  poll();

  // 设置定时轮询
  const timerId = window.setInterval(poll, interval);
  activePollers.set(taskId, timerId);

  // 设置超时定时器，防止无限轮询
  if (timeout > 0) {
    const timeoutId = window.setTimeout(() => {
      stopTaskPolling(taskId);
      if (showMessage) message.warning('任务轮询超时，请手动刷新查看状态');
      onTimeout?.(taskId);
    }, timeout);
    pollerTimeouts.set(taskId, timeoutId);
  }

  // 返回停止函数
  return () => stopTaskPolling(taskId);
}

/**
 * 停止轮询任务状态
 * @param taskId 任务ID
 */
export function stopTaskPolling(taskId: string) {
  const timerId = activePollers.get(taskId);
  if (timerId !== undefined) {
    window.clearInterval(timerId);
    activePollers.delete(taskId);
  }
  // 同时清理超时定时器
  const timeoutId = pollerTimeouts.get(taskId);
  if (timeoutId !== undefined) {
    window.clearTimeout(timeoutId);
    pollerTimeouts.delete(taskId);
  }
}

/**
 * 停止所有活跃的轮询器
 */
export function stopAllPolling() {
  activePollers.forEach((timerId) => {
    window.clearInterval(timerId);
  });
  activePollers.clear();
  pollerTimeouts.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  pollerTimeouts.clear();
}

/**
 * 提交异步操作并自动开始轮询
 * 适用于前端发起操作后自动跟踪任务状态的场景
 * @param response API响应（包含task_id）
 * @param options 轮询配置
 * @returns 停止轮询的函数，如果没有task_id则返回null
 */
export function pollAfterSubmit(
  response: { code: number; data?: { task_id?: string } },
  options: PollOptions = {}
): (() => void) | null {
  if (response.code !== 200 || !response.data?.task_id) {
    return null;
  }

  return startTaskPolling(response.data.task_id, options);
}

/** 任务类型中文映射 */
export const TASK_TYPE_LABELS: Record<string, string> = {
  create_vm: '创建虚拟机',
  delete_vm: '删除虚拟机',
  update_vm: '修改虚拟机',
  add_nic: '新增网卡',
  update_nic: '修改网卡',
  delete_nic: '删除网卡',
  add_hdd: '新增数据盘',
  update_hdd: '修改数据盘',
  delete_hdd: '删除数据盘',
  add_pcie: '新增PCIE',
  update_pcie: '修改PCIE',
  delete_pcie: '删除PCIE',
  mount_usb: '挂载USB',
  unmount_usb: '卸载USB',
  create_backup: '创建备份',
  restore_backup: '还原备份',
  mount_iso: '挂载光盘',
  unmount_iso: '卸载光盘',
};

/** 任务状态中文映射 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '等待中',
  running: '执行中',
  completed: '已完成',
  failed: '已失败',
  stopped: '已停止',
};

/** 任务状态颜色映射 */
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'default',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  stopped: 'warning',
};

// ==================== 全局顶部通知轮询 ====================

/**
 * 提交异步操作并显示顶部loading强提醒，持续轮询直到完成
 * 顶部会显示转圈圈+消息，直到任务执行完成/失败/停止
 * @param response API响应（包含task_id）
 * @param taskLabel 任务描述文本（如"创建虚拟机"、"删除网卡"）
 * @param options 额外回调配置
 * @returns 是否成功启动轮询
 */
export function startTaskWithNotification(
  response: { code: number; msg?: string; data?: { task_id?: string } },
  taskLabel: string,
  options: {
    onCompleted?: (task: AsyncTask) => void;
    onFailed?: (task: AsyncTask) => void;
  } = {}
): boolean {
  if (response.code !== 200 || !response.data?.task_id) {
    message.error(response.msg || `${taskLabel}失败`);
    return false;
  }

  const taskId = response.data.task_id;
  // 显示顶部loading消息（不自动关闭）
  const hideLoading = message.loading(`${taskLabel}执行中，请稍候...`, 0);

  startTaskPolling(taskId, {
    interval: 3000,
    showMessage: false, // 我们自己控制消息
    onCompleted: (task) => {
      hideLoading();
      message.success(`${taskLabel}完成`);
      options.onCompleted?.(task);
    },
    onFailed: (task) => {
      hideLoading();
      message.error(`${taskLabel}失败: ${task.error_message || '未知错误'}`);
      options.onFailed?.(task);
    },
    onStatusChange: (task) => {
      // stopped状态也需要关闭loading
      if (task.status === 'stopped') {
        hideLoading();
        message.warning(`${taskLabel}已停止`);
      }
    },
  });

  return true;
}
