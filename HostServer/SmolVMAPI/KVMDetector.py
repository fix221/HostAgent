################################################################################
# KVMDetector - KVM 与 Firecracker 环境检测器
# 检测 /dev/kvm 可访问性与 hypervisor 可执行文件，支持本地与 SSH 远端两种模式
################################################################################
import os
import re
import shutil
import subprocess
from loguru import logger
from HostModule.CommandSafe import HostExecutor


class KVMDetector:
    """
    检测宿主机 KVM 虚拟化与 firecracker 可用性

    用法::

        det = KVMDetector(hs_config)
        ok, info = det.detect()
        # info = { 'kvm_ok': True, 'hypervisor': 'firecracker',
        #          'path': '/usr/bin/firecracker', 'version': '1.7.0' }
    """

    CANDIDATE_BINS = ("firecracker", "cloud-hypervisor", "qemu-system-x86_64")

    # 初始化 ####################################################################
    def __init__(self, hs_config):
        self.hs_config = hs_config
        self._executor = None

    # 判断是否为远程 ############################################################
    def is_remote(self) -> bool:
        addr = self.hs_config.server_addr or ""
        return addr.startswith("ssh://") or (
            addr not in ["", "localhost", "127.0.0.1"])

    # 统一执行命令（本地/SSH）##################################################
    def _exec(self, cmd: str) -> tuple[bool, str, str]:
        if self._executor is None:
            self._executor = HostExecutor(self.hs_config, reuse_ssh=True)
        return self._executor.exec(cmd, timeout=10, allow_pipe=True)

    # 关闭 SSH ##################################################################
    def close(self):
        if self._executor is not None:
            try:
                self._executor.close()
            except Exception:
                pass
            self._executor = None

    # 检查 /dev/kvm ############################################################
    def check_kvm(self) -> bool:
        ok, out, err = self._exec(
            "test -r /dev/kvm && test -w /dev/kvm && echo YES || echo NO")
        return ok and "YES" in out

    # 查找 hypervisor 可执行文件 ################################################
    def find_hypervisor(self) -> tuple[str, str]:
        """
        返回 (hypervisor 名称, 绝对路径)；未找到返回 ("", "")
        优先级：hs_config.launch_path > PATH 中的 firecracker/cloud-hypervisor/qemu
        """
        # 1) 优先 launch_path ==================================================
        launch_path = (self.hs_config.launch_path or "").strip()
        if launch_path:
            for name in self.CANDIDATE_BINS:
                p = os.path.join(launch_path, name)
                ok, out, _ = self._exec(f"test -x \"{p}\" && echo YES || echo NO")
                if ok and "YES" in out:
                    return name, p

        # 2) PATH 搜索 ==========================================================
        for name in self.CANDIDATE_BINS:
            ok, out, _ = self._exec(f"command -v {name} 2>/dev/null || true")
            path = (out or "").strip().splitlines()[0] if out else ""
            if path:
                return name, path

        return "", ""

    # 获取版本 ##################################################################
    def get_version(self, bin_path: str, name: str) -> str:
        flag = "--version"
        ok, out, err = self._exec(f"{bin_path} {flag} 2>&1 | head -n 3")
        text = (out or "") + (err or "")
        m = re.search(r"(\d+\.\d+(?:\.\d+)?)", text)
        return m.group(1) if m else ""

    # 综合检测 ##################################################################
    def detect(self) -> tuple[bool, dict]:
        info = {
            "kvm_ok": False,
            "hypervisor": "",
            "path": "",
            "version": "",
            "message": "",
            "is_remote": self.is_remote(),
        }
        try:
            # 检查 KVM ============================================================
            kvm_ok = self.check_kvm()
            info["kvm_ok"] = kvm_ok
            if not kvm_ok:
                info["message"] = (
                    "KVM不可用：请确认宿主机已启用硬件虚拟化并加载 kvm 模块")
                return False, info

            # 查找 hypervisor =====================================================
            name, path = self.find_hypervisor()
            if not name:
                info["message"] = (
                    "未找到 firecracker/cloud-hypervisor/qemu，"
                    "请先安装 microVM hypervisor 并确保在 PATH 中")
                return False, info

            info["hypervisor"] = name
            info["path"] = path
            info["version"] = self.get_version(path, name)
            info["message"] = "ok"
            return True, info

        finally:
            # 不主动关闭 SSH，调用方可能复用；如需在外层 close()
            pass

    # 保存缓存到 hs_config.extend_data ##########################################
    def save_to_config(self, info: dict):
        try:
            ext = self.hs_config.extend_data or {}
            ext["smolvm_hv"] = info.get("hypervisor", "")
            ext["smolvm_hv_path"] = info.get("path", "")
            ext["smolvm_hv_version"] = info.get("version", "")
            ext["smolvm_kvm_ok"] = bool(info.get("kvm_ok", False))
            self.hs_config.extend_data = ext
        except Exception as e:
            logger.warning(f"[KVMDetector] 保存检测结果到 extend_data 失败: {e}")
