import os
import time
import sys
import shutil
import subprocess
import urllib.parse
from pathlib import Path
from typing import Dict, Optional
from loguru import logger


class WebsocketUI:
    # Websockify 管理器 ##########################################################
    # :param web_port: Websockify 端口
    # ############################################################################
    def __init__(self, web_port: int = 6090, cfg_name: str = "websockify"):
        self.web_port = web_port
        
        # 获取正确的项目根目录（支持打包后的环境）
        # 三种打包方式的区别：
        #   PyInstaller: sys.frozen=True, 有sys._MEIPASS(临时目录), sys.executable=真实exe路径
        #   Nuitka onefile: sys.frozen=True, 有__compiled__, sys.executable指向临时目录, 用sys.argv[0]获取真实路径
        #   cx_Freeze: sys.frozen=True, sys.executable=真实exe路径, 资源在exe同级目录
        #   开发环境: 无sys.frozen
        
        is_nuitka = '__compiled__' in globals() or ('__compiled__' in dir(sys.modules.get('__main__', object())))
        
        if getattr(sys, 'frozen', False):
            if hasattr(sys, '_MEIPASS'):
                # PyInstaller 打包：真实exe路径通过sys.executable获取
                project_root = Path(sys.executable).parent
            elif is_nuitka:
                # Nuitka onefile 打包：sys.executable可能指向临时目录，用sys.argv[0]获取真实路径
                project_root = Path(sys.argv[0]).resolve().parent
            else:
                # cx_Freeze 打包：sys.executable就是真实exe路径
                project_root = Path(sys.executable).parent
        else:
            # 开发环境：使用脚本所在目录的父目录
            project_root = Path(__file__).parent.parent.absolute()
        
        # 配置文件路径
        self.vnc_save = os.path.join(project_root, "DataSaving", f"{cfg_name}.cfg")
        
        # Web 资源路径：需要释放到持久化目录 Websockify/Sources（websockify是独立进程，无法访问临时目录）
        persistent_web = os.path.join(project_root, "Websockify", "Sources")
        
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            # PyInstaller 打包：web资源在_MEIPASS临时目录中，需要复制到持久化位置
            meipass_web = os.path.join(sys._MEIPASS, "VNCConsole", "Sources")
            if os.path.exists(meipass_web):
                try:
                    if os.path.exists(persistent_web):
                        shutil.rmtree(persistent_web)
                    shutil.copytree(meipass_web, persistent_web)
                    logger.success(f"[PyInstaller] 已释放 Web 资源到: {persistent_web}")
                except Exception as e:
                    logger.error(f"释放 Web 资源失败: {e}")
            self.web_path = persistent_web
        elif getattr(sys, 'frozen', False) and is_nuitka:
            # Nuitka onefile 打包：数据文件在临时解压目录中，需要复制到持久化位置
            # Nuitka 的 __file__ 指向临时目录，数据文件相对于该目录
            nuitka_temp = Path(__file__).parent.parent
            nuitka_web = os.path.join(nuitka_temp, "VNCConsole", "Sources")
            if os.path.exists(nuitka_web) and str(nuitka_temp) != str(project_root):
                # 临时目录与真实目录不同，需要释放
                try:
                    if os.path.exists(persistent_web):
                        shutil.rmtree(persistent_web)
                    shutil.copytree(nuitka_web, persistent_web)
                    logger.success(f"[Nuitka] 已释放 Web 资源到: {persistent_web}")
                except Exception as e:
                    logger.error(f"释放 Web 资源失败: {e}")
            self.web_path = persistent_web
        else:
            # cx_Freeze 或开发环境：资源在exe/项目同级目录，直接使用
            local_web = os.path.join(project_root, "VNCConsole", "Sources")
            if os.path.exists(local_web):
                self.web_path = local_web
            else:
                # fallback: 尝试 Websockify/Sources
                self.web_path = persistent_web
        
        # 检测环境：如果不是 Python 解释器，使用可执行文件
        if 'python' in os.path.basename(sys.executable).lower():
            script_name = "websocketproxy.py"
        else:
            script_name = "websocketproxy"
            if os.name == 'nt':
                script_name += '.exe'
        self.bin_path = os.path.join(project_root, "Websockify", script_name)
        self.process = None
        self.storage: Dict[str, str] = {}
        self.cfg_load()

    # 加载配置文件 ###############################################################
    def cfg_load(self):
        if os.path.exists(self.vnc_save):
            with open(self.vnc_save, "r") as f:
                for line in f:
                    if line.strip():
                        token, target = line.strip().split(": ")
                        self.storage[token] = target
                        logger.info(f"已加载 VNC: {token} -> {target}")

    # 将 token 写入配置文件 ######################################################
    def cfg_save(self):
        os.makedirs(os.path.dirname(self.vnc_save), exist_ok=True)
        with open(self.vnc_save, "w") as f:
            for token, target in self.storage.items():
                f.write(f"{token}: {target}\n")

    # 启动 websockify 服务 #######################################################
    def web_open(self) -> Optional[subprocess.Popen]:
        # 调试信息：打印所有关键路径
        logger.info(f"Web 资源路径: {self.web_path}")
        logger.info(f"Websockify 可执行文件: {self.bin_path}")
        logger.info(f"配置文件路径: {self.vnc_save}")
        logger.info(f"是否为打包环境: {getattr(sys, 'frozen', False)}")
        
        if not os.path.exists(self.web_path):
            logger.error(f"Web 资源路径不存在: {self.web_path}")
            return None

        # 构建命令：如果是 .py 文件则用 Python 执行，否则直接执行
        if self.bin_path.endswith('.py'):
            cmd = [sys.executable, self.bin_path]
        else:
            cmd = [self.bin_path]

        cmd += ["--token-plugin", "TokenFile",
                "--token-source", os.path.abspath(self.vnc_save),
                str(self.web_port),
                "--web", os.path.abspath(self.web_path)]

        logger.info(f"启动 websockify: {self.web_port}")
        logger.info(f"执行命令: {' '.join(cmd)}")
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if (os.name == 'nt' and getattr(sys, 'frozen', False)) else 0
            proc = subprocess.Popen(cmd, creationflags=creationflags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            logger.success(f"websockify 已启动 (PID: {proc.pid})，支持 {len(self.storage)} 个连接")
            return proc
        except Exception as e:
            logger.error(f"启动失败: {e}")
            return None

    # 停止 websockify 服务 #######################################################
    def web_stop(self):
        if os.name == 'nt':
            cmd = 'taskkill /f /im websocketproxy.exe'
        else:
            cmd = 'pkill -f websocketproxy'

        os.system(cmd)
        logger.info("websockify 已停止")

    # 添加 VNC 目标 ##############################################################
    def add_port(self, ip: str, port: int, token: str) -> str:
        target = f"{ip}:{port}"
        # 检查是否已存在相同目标的 token
        for existing_token, existing_target in self.storage.items():
            if existing_target == target:
                logger.info(f"VNC 目标 {target} 已存在，token: {existing_token}")
                return existing_token

        self.storage[token] = target
        self.cfg_save()
        logger.success(f"已添加 VNC: {target}, token: {token}")
        return token

    # 删除 VNC 目标 ##############################################################
    def del_port(self, ip, port):
        for token, target in self.storage.items():
            if target == f"{ip}:{port}":
                del self.storage[token]
                self.cfg_save()
                logger.success(f"已删除 VNC: {ip}:{port}")
                return True
        logger.warning(f"未找到 VNC: {ip}:{port}")
        return False

    # 生成指定token的访问URL
    def get_url(self, token: str = None):
        if token and token in self.storage:
            return f"http://localhost:{self.web_port}/vnc.html?autoconnect=true&path=websockify?token={token}"
        elif not token and len(self.storage) > 0:
            # 如果没有指定token，返回第一个可用的URL
            first_token = list(self.storage.keys())[0]
            return f"http://localhost:{self.web_port}/vnc.html?autoconnect=true&path=websockify?token={first_token}"
        else:
            logger.warning("警告: 没有可用的VNC连接")
            return None

    # 列出所有可用的VNC连接
    def list_connections(self):
        if not self.storage:
            logger.info("当前没有VNC连接")
            return

        logger.info("当前VNC连接列表:")
        for token, target in self.storage.items():
            url = self.get_url(token)
            logger.info(f"  Token: {token} -> {target}")
            logger.info(f"  URL: {url}")
            logger.info("")


class VNCSManager:
    """websockify 进程管理器，直接管理 websockify 子进程"""

    def __init__(self, in_exec: WebsocketUI):
        self.exec = in_exec
        self.proc: Optional[subprocess.Popen] = None

    def start(self):
        """启动 websockify 服务"""
        if self.is_running():
            logger.info("websockify 服务已在运行中")
            return

        # 直接启动 websockify 子进程
        self.proc = self.exec.web_open()
        if self.proc:
            logger.success(f"websockify 服务已启动 (PID: {self.proc.pid})")
        else:
            logger.error("websockify 服务启动失败")

    def close(self):
        """关闭 websockify 服务进程"""
        if self.proc is None:
            logger.info("没有运行中的 websockify 服务")
            return

        if self.proc.poll() is None:
            # 进程仍在运行
            logger.info(f"正在关闭 websockify 服务进程 (PID: {self.proc.pid})...")
            self.proc.terminate()  # 发送终止信号
            try:
                self.proc.wait(timeout=5)  # 等待最多5秒
            except subprocess.TimeoutExpired:
                logger.warning("进程未响应，强制关闭...")
                self.proc.kill()
                self.proc.wait()

            logger.success("websockify 服务进程已关闭")
        else:
            logger.info("websockify 服务进程已停止")

        self.proc = None

    def is_running(self) -> bool:
        """检查服务是否正在运行"""
        if self.proc is None:
            return False
        return self.proc.poll() is None


# 使用示例
if __name__ == "__main__":
    web_data = WebsocketUI(web_port=6090)

    # 添加多个VNC目标
    # vnc_pass1 = "server1"
    # vnc_pass2 = "server2"
    # web_data.add_port("127.0.0.1", 5901, vnc_pass1)
    # web_data.add_port("192.168.1.100", 5900, vnc_pass2)

    # 列出所有连接
    web_data.list_connections()
    # 启动服务
    web_data.web_open()

    # 获取特定token的URL
    # url1 = web_data.get_url(vnc_pass1)
    # print(f"Server1 访问 URL: {url1}")
    #
    # 获取第一个可用的URL
    # default_url = web_data.get_url()
    # print(f"默认访问 URL: {default_url}")

    input("按 Enter 键关闭服务...")
    web_data.web_stop()
