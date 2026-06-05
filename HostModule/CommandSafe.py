"""
命令执行安全工具模块
提供命令注入防护、SSH连接池、统一的本地/远程命令执行接口
"""
import re
import shlex
import subprocess
import threading
import time
from typing import Optional, Tuple
from loguru import logger


# 命令注入检测的危险字符/模式
_DANGEROUS_PATTERNS = re.compile(
    r'[;&|`$]|'           # Shell元字符
    r'\$\(|'              # 命令替换 $(...)
    r'>\s*/|'             # 重定向到根目录
    r'\.\./\.\.',         # 路径遍历
    flags=re.MULTILINE
)

# 允许的安全命令前缀白名单（用于shell=True场景的额外校验）
_SAFE_CMD_PREFIXES = (
    "docker ", "firecracker ", "cloud-hypervisor ", "qemu-",
    "socat ", "nohup socat ", "kill ", "ps ", "test ", "echo ",
    "mkdir ", "rm ", "cp ", "mv ", "cat ", "ls ", "chmod ", "chown ",
    "ip ", "iptables ", "nft ", "mount ", "umount ", "sync",
    "tar ", "truncate ", "mkfs.", "sed ", "head ", "nproc",
    "qm ", "pvesh ", "virsh ", "VBoxManage", "vmrest",
    "openssl ", "ssh-keygen", "gunzip ", "gzip ",
    "sh -c ", "bash -c ",
    "command -v ", "which ", "dpkg ", "apt ", "yum ",
    "systemctl ", "service ",
    "df ", "free ", "top ", "uptime", "uname",
    "lsblk", "blkid", "fdisk", "parted",
    "brctl ", "bridge ", "tc ",
    "curl ", "wget ",
)


def sanitize_cmd_arg(arg: str) -> str:
    """
    对单个命令参数进行安全转义（用于拼接到shell命令中）
    使用shlex.quote确保参数被正确引用
    """
    if not arg:
        return "''"
    return shlex.quote(str(arg))


def validate_shell_cmd(cmd: str, allow_pipe: bool = False) -> Tuple[bool, str]:
    """
    验证shell命令是否安全（用于必须使用shell=True的场景）
    
    Args:
        cmd: 待验证的命令字符串
        allow_pipe: 是否允许管道符（某些场景如docker export | tar需要）
    
    Returns:
        (是否安全, 错误原因)
    """
    if not cmd or not cmd.strip():
        return False, "命令为空"
    
    # 检查是否以安全命令前缀开头
    cmd_stripped = cmd.strip()
    is_whitelisted = any(cmd_stripped.startswith(prefix) for prefix in _SAFE_CMD_PREFIXES)
    
    if not is_whitelisted:
        # 非白名单命令，进行严格检查
        if _DANGEROUS_PATTERNS.search(cmd):
            return False, f"命令包含危险字符: {cmd[:80]}"
    
    # 即使白名单命令，也检查明显的注入模式
    # 检测反引号命令替换
    if '`' in cmd:
        return False, f"命令包含反引号命令替换: {cmd[:80]}"
    
    # 检测 $(...) 命令替换（允许 ${VAR} 变量引用）
    if re.search(r'\$\([^)]*\)', cmd):
        return False, f"命令包含$()命令替换: {cmd[:80]}"
    
    # 如果不允许管道但包含管道符
    if not allow_pipe and '|' in cmd:
        # 检查是否在引号内的管道符（安全的）
        in_quote = False
        quote_char = ''
        for i, ch in enumerate(cmd):
            if ch in ('"', "'") and (i == 0 or cmd[i-1] != '\\'):
                if not in_quote:
                    in_quote = True
                    quote_char = ch
                elif ch == quote_char:
                    in_quote = False
            elif ch == '|' and not in_quote:
                return False, f"命令包含管道符（未启用allow_pipe）: {cmd[:80]}"
    
    return True, ""


def safe_shell_exec(cmd: str, timeout: int = 30,
                    allow_pipe: bool = False,
                    cwd: str = None) -> Tuple[bool, str, str]:
    """
    安全的本地shell命令执行（带注入检查）
    
    Args:
        cmd: 命令字符串
        timeout: 超时秒数
        allow_pipe: 是否允许管道
        cwd: 工作目录
    
    Returns:
        (success, stdout, stderr)
    """
    # 验证命令安全性
    is_safe, reason = validate_shell_cmd(cmd, allow_pipe=allow_pipe)
    if not is_safe:
        logger.warning(f"[CommandSafe] 命令安全检查未通过: {reason}")
        return False, "", f"命令安全检查未通过: {reason}"
    
    try:
        r = subprocess.run(
            cmd, shell=True,
            capture_output=True, text=True,
            timeout=timeout, cwd=cwd
        )
        return r.returncode == 0, r.stdout or "", r.stderr or ""
    except subprocess.TimeoutExpired:
        return False, "", f"命令执行超时({timeout}s)"
    except Exception as e:
        return False, "", str(e)


def safe_list_exec(cmd_list: list, timeout: int = 30,
                   cwd: str = None) -> Tuple[bool, str, str]:
    """
    安全的本地命令执行（列表形式，无shell注入风险）
    
    Args:
        cmd_list: 命令参数列表 如 ["docker", "ps", "-a"]
        timeout: 超时秒数
        cwd: 工作目录
    
    Returns:
        (success, stdout, stderr)
    """
    try:
        r = subprocess.run(
            cmd_list, shell=False,
            capture_output=True, text=True,
            timeout=timeout, cwd=cwd
        )
        return r.returncode == 0, r.stdout or "", r.stderr or ""
    except subprocess.TimeoutExpired:
        return False, "", f"命令执行超时({timeout}s)"
    except FileNotFoundError:
        return False, "", f"命令未找到: {cmd_list[0] if cmd_list else ''}"
    except Exception as e:
        return False, "", str(e)


class HostExecutor:
    """
    统一的宿主机命令执行器（本地/远程SSH）
    支持SSH连接复用，自动重连，命令安全检查
    
    用法::
        executor = HostExecutor(hs_config)
        ok, out, err = executor.exec("docker ps -a")
        executor.close()
        
        # 或使用上下文管理器
        with HostExecutor(hs_config) as exe:
            ok, out, err = exe.exec("docker ps -a")
    """

    def __init__(self, hs_config, reuse_ssh: bool = True):
        """
        Args:
            hs_config: 主机配置对象（HSConfig）
            reuse_ssh: 是否复用SSH连接（默认True）
        """
        self.hs_config = hs_config
        self._ssh = None
        self._reuse_ssh = reuse_ssh
        self._lock = threading.Lock()

    def is_remote(self) -> bool:
        """判断是否为远程主机"""
        addr = self.hs_config.server_addr or ""
        return addr.startswith("ssh://") or (
            addr not in ["", "localhost", "127.0.0.1"])

    def _get_ssh(self):
        """获取SSH连接（支持复用和自动重连）"""
        from HostModule.SSHDManager import SSHDManager
        
        with self._lock:
            # 检查现有连接是否可用
            if self._ssh and self._ssh.is_connected():
                return self._ssh
            
            # 创建新连接
            ssh = SSHDManager()
            addr = (self.hs_config.server_addr or "").replace("ssh://", "")
            ok, msg = ssh.connect(
                hostname=addr,
                username=self.hs_config.server_user,
                password=self.hs_config.server_pass,
                port=self.hs_config.server_port or 22
            )
            if not ok:
                raise ConnectionError(f"SSH 连接失败: {msg}")
            
            if self._reuse_ssh:
                self._ssh = ssh
            return ssh

    def exec(self, cmd: str, timeout: int = 30,
             allow_pipe: bool = False,
             check: bool = False) -> Tuple[bool, str, str]:
        """
        执行命令（自动判断本地/远程）
        
        Args:
            cmd: 命令字符串
            timeout: 超时秒数
            allow_pipe: 是否允许管道符
            check: 失败时是否抛出异常
        
        Returns:
            (success, stdout, stderr)
        """
        if self.is_remote():
            return self._exec_remote(cmd, timeout)
        else:
            return self._exec_local(cmd, timeout, allow_pipe)

    def _exec_local(self, cmd: str, timeout: int = 30,
                    allow_pipe: bool = False) -> Tuple[bool, str, str]:
        """本地执行（带安全检查）"""
        return safe_shell_exec(cmd, timeout=timeout, allow_pipe=allow_pipe)

    def _exec_remote(self, cmd: str, timeout: int = 30) -> Tuple[bool, str, str]:
        """远程SSH执行"""
        try:
            ssh = self._get_ssh()
            ok, out, err = ssh.execute_command(cmd, timeout=timeout)
            return ok, out or "", err or ""
        except ConnectionError as e:
            return False, "", str(e)
        except Exception as e:
            # 连接可能已断开，清除缓存
            with self._lock:
                if self._ssh:
                    try:
                        self._ssh.close()
                    except Exception:
                        pass
                    self._ssh = None
            return False, "", str(e)

    def close(self):
        """关闭SSH连接"""
        with self._lock:
            if self._ssh:
                try:
                    self._ssh.close()
                except Exception:
                    pass
                self._ssh = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def __del__(self):
        self.close()
