################################################################################
# FCClient - Firecracker UNIX Socket HTTP 客户端
# 通过 HTTP over Unix Domain Socket 与 firecracker/cloud-hypervisor 交互
################################################################################
import os
import json
import socket
import time
from loguru import logger
from typing import Optional


class FCClient:
    """
    Firecracker REST API 客户端（HTTP over Unix Socket）

    用法::

        fc = FCClient("/run/smolvm/vm-xxxx.sock")
        fc.put_boot_source(kernel_path, "console=ttyS0 reboot=k panic=1 pci=off")
        fc.put_rootfs_drive(rootfs_path, is_read_only=False)
        fc.put_network_iface("eth0", "tap-xxxx", mac_addr)
        fc.put_machine_config(vcpu=1, mem_mib=512)
        fc.action("InstanceStart")
    """

    # 初始化 ####################################################################
    def __init__(self, socket_path: str, timeout: float = 10.0):
        self.socket_path = socket_path
        self.timeout = timeout

    # 底层 HTTP 请求 ############################################################
    def _request(self, method: str, path: str,
                 body: Optional[dict] = None) -> tuple[int, dict]:
        """
        通过 Unix socket 发送 HTTP 请求
        :param method: GET/PUT/PATCH/POST/DELETE
        :param path: URL 路径（以 / 开头）
        :param body: JSON 请求体
        :return: (状态码, 响应 JSON)
        """
        try:
            # 连接 ==============================================================
            if not os.path.exists(self.socket_path):
                return -1, {"error": f"socket 不存在: {self.socket_path}"}

            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            sock.connect(self.socket_path)

            # 构造请求 ===========================================================
            body_bytes = b""
            headers = [
                f"{method} {path} HTTP/1.1",
                "Host: localhost",
                "Accept: application/json",
                "Connection: close",
            ]
            if body is not None:
                body_bytes = json.dumps(body).encode("utf-8")
                headers.append("Content-Type: application/json")
                headers.append(f"Content-Length: {len(body_bytes)}")

            req = "\r\n".join(headers).encode("utf-8") + b"\r\n\r\n" + body_bytes
            sock.sendall(req)

            # 读取响应 ===========================================================
            raw = b""
            while True:
                try:
                    chunk = sock.recv(4096)
                except socket.timeout:
                    break
                if not chunk:
                    break
                raw += chunk
            sock.close()

            # 解析响应 ===========================================================
            if not raw:
                return -1, {"error": "空响应"}

            # 分离头与体 -------------------------------------------------------
            head_sep = raw.find(b"\r\n\r\n")
            if head_sep < 0:
                return -1, {"error": "非法响应", "raw": raw.decode("utf-8", "replace")}

            head_bytes = raw[:head_sep]
            body_raw = raw[head_sep + 4:]

            # 提取状态码 -------------------------------------------------------
            status_line = head_bytes.split(b"\r\n", 1)[0].decode("utf-8", "replace")
            parts = status_line.split(" ", 2)
            status_code = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else -1

            # 处理 Transfer-Encoding: chunked（简易实现）-----------------------
            head_lower = head_bytes.decode("utf-8", "replace").lower()
            if "transfer-encoding: chunked" in head_lower:
                body_raw = self._decode_chunked(body_raw)

            # 解析 JSON 响应 ---------------------------------------------------
            if not body_raw:
                return status_code, {}
            try:
                return status_code, json.loads(body_raw.decode("utf-8"))
            except Exception:
                return status_code, {"raw": body_raw.decode("utf-8", "replace")}

        except Exception as e:
            logger.debug(f"[FCClient] 请求失败 {method} {path}: {e}")
            return -1, {"error": str(e)}

    # 解码 chunked 响应体 ######################################################
    @staticmethod
    def _decode_chunked(data: bytes) -> bytes:
        out = b""
        idx = 0
        while idx < len(data):
            nl = data.find(b"\r\n", idx)
            if nl < 0:
                break
            try:
                size = int(data[idx:nl].strip(), 16)
            except Exception:
                break
            if size == 0:
                break
            idx = nl + 2
            out += data[idx:idx + size]
            idx += size + 2
        return out

    # 带重试的请求 ##############################################################
    def _request_retry(self, method: str, path: str,
                       body: Optional[dict] = None,
                       retries: int = 3) -> tuple[int, dict]:
        last_code, last_resp = -1, {}
        for attempt in range(retries):
            code, resp = self._request(method, path, body)
            last_code, last_resp = code, resp
            if code >= 0 and code < 500:
                return code, resp
            time.sleep(0.2 * (attempt + 1))
        return last_code, last_resp

    # 等待 socket 就绪 ##########################################################
    def wait_socket_ready(self, timeout: float = 10.0) -> bool:
        """等待 firecracker 创建 UDS 并接受连接"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if os.path.exists(self.socket_path):
                try:
                    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    s.settimeout(0.5)
                    s.connect(self.socket_path)
                    s.close()
                    return True
                except Exception:
                    pass
            time.sleep(0.1)
        return False

    # 设置启动源 ################################################################
    def put_boot_source(self, kernel_path: str,
                        boot_args: str = "console=ttyS0 reboot=k panic=1 pci=off",
                        initrd_path: Optional[str] = None) -> tuple[int, dict]:
        body = {
            "kernel_image_path": kernel_path,
            "boot_args": boot_args,
        }
        if initrd_path:
            body["initrd_path"] = initrd_path
        return self._request_retry("PUT", "/boot-source", body)

    # 设置 rootfs 磁盘 #########################################################
    def put_rootfs_drive(self, rootfs_path: str,
                         is_read_only: bool = False,
                         drive_id: str = "rootfs") -> tuple[int, dict]:
        body = {
            "drive_id": drive_id,
            "path_on_host": rootfs_path,
            "is_root_device": True,
            "is_read_only": is_read_only,
        }
        return self._request_retry("PUT", f"/drives/{drive_id}", body)

    # 设置附加磁盘 #############################################################
    def put_data_drive(self, drive_id: str, host_path: str,
                       is_read_only: bool = False) -> tuple[int, dict]:
        body = {
            "drive_id": drive_id,
            "path_on_host": host_path,
            "is_root_device": False,
            "is_read_only": is_read_only,
        }
        return self._request_retry("PUT", f"/drives/{drive_id}", body)

    # 设置网卡 #################################################################
    def put_network_iface(self, iface_id: str, host_tap: str,
                          mac_addr: str = "") -> tuple[int, dict]:
        body = {
            "iface_id": iface_id,
            "host_dev_name": host_tap,
        }
        if mac_addr:
            body["guest_mac"] = mac_addr
        return self._request_retry("PUT", f"/network-interfaces/{iface_id}", body)

    # 设置机器配置 #############################################################
    def put_machine_config(self, vcpu: int, mem_mib: int,
                           ht_enabled: bool = False) -> tuple[int, dict]:
        body = {
            "vcpu_count": vcpu,
            "mem_size_mib": mem_mib,
            "smt": ht_enabled,
        }
        return self._request_retry("PUT", "/machine-config", body)

    # 下发动作 #################################################################
    def action(self, action_type: str) -> tuple[int, dict]:
        """
        :param action_type: InstanceStart / SendCtrlAltDel / FlushMetrics
        """
        body = {"action_type": action_type}
        return self._request_retry("PUT", "/actions", body)

    # 修改虚拟机状态 ###########################################################
    def patch_vm_state(self, state: str) -> tuple[int, dict]:
        """
        :param state: Paused / Resumed
        """
        body = {"state": state}
        return self._request_retry("PATCH", "/vm", body)

    # 查询运行状态 #############################################################
    def get_instance_info(self) -> tuple[int, dict]:
        return self._request_retry("GET", "/", None)

    # 查询指标 #################################################################
    def get_metrics(self) -> tuple[int, dict]:
        code, resp = self._request_retry("GET", "/metrics", None)
        if code >= 0 and "raw" in resp:
            try:
                return code, json.loads(resp["raw"])
            except Exception:
                return code, resp
        return code, resp
