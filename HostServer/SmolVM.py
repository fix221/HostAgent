################################################################################
# SmolVM - 轻量级 microVM 宿主机驱动
# 参考 CelestoAI/SmolVM 设计：基于 KVM + Firecracker 启动最小化 Linux 内核，
# 使用 Docker 镜像作为 rootfs 来源，提供完整内核体验与 SSH 端口转发。
# 仿照 OCInterface.py 结构，继承 BasicServer 以保持统一平台能力矩阵。
################################################################################
import os
import json
import time
import signal
import shutil
import datetime
import traceback
import subprocess
from loguru import logger
from HostServer.BasicServer import BasicServer
from MainObject.Config.HSConfig import HSConfig
from MainObject.Config.IMConfig import IMConfig
from MainObject.Config.SDConfig import SDConfig
from MainObject.Config.USBInfos import USBInfos
from MainObject.Config.VFConfig import VFConfig
from MainObject.Config.VMBackup import VMBackup
from MainObject.Config.VMPowers import VMPowers
from MainObject.Public.ZMessage import ZMessage
from MainObject.Config.VMConfig import VMConfig
from MainObject.Config.PortData import PortData
from MainObject.Public.HWStatus import HWStatus
from HostServer.OCInterfaceAPI.PortForward import PortForward
from HostServer.SmolVMAPI.FCClient import FCClient
from HostServer.SmolVMAPI.KVMDetector import KVMDetector
from HostServer.SmolVMAPI.RootFSBuilder import RootFSBuilder
from HostModule.CommandSafe import HostExecutor, safe_shell_exec


# 默认内核启动参数（ttyS0 控制台、禁用 PCI/ACPI 加速启动）====================
DEFAULT_BOOT_ARGS = (
    "console=ttyS0 reboot=k panic=1 pci=off "
    "init=/sbin/init ip=dhcp"
)


class HostServer(BasicServer):
    """SmolVM microVM 宿主机驱动（Firecracker + Docker rootfs）"""

    # 初始化 ###################################################################
    def __init__(self, config: HSConfig, **kwargs):
        super().__init__(config, **kwargs)
        # 与 OCInterface 对齐的通用组件 ======================================
        self.web_terminal = None
        self.http_manager = None
        self.port_forward = None
        # SmolVM 专有 =========================================================
        self.kvm_detector: KVMDetector | None = None
        self.fs_builder: RootFSBuilder | None = None
        # socket 根目录 =======================================================
        self._sock_root = "/run/smolvm"

    # ==========================================================================
    # 内部工具方法 ##############################################################
    # ==========================================================================

    # 判断是否远程主机 ##########################################################
    def _is_remote(self) -> bool:
        addr = self.hs_config.server_addr or ""
        return addr.startswith("ssh://") or (
            addr not in ["", "localhost", "127.0.0.1"])

    # 获取 vm 工作目录 ##########################################################
    def _vm_dir(self, vm_uuid: str) -> str:
        base = self.hs_config.extern_path or "/var/lib/smolvm"
        return f"{base}/{vm_uuid}"

    # 获取 vm 的 FC socket 路径 #################################################
    def _vm_sock(self, vm_uuid: str) -> str:
        return f"{self._sock_root}/{vm_uuid}.sock"

    # 获取 vm 的 pid 文件路径 ##################################################
    def _vm_pid_file(self, vm_uuid: str) -> str:
        return f"{self._sock_root}/{vm_uuid}.pid"

    # 生成 tap 设备名（最长 15 字符）###########################################
    def _tap_name(self, vm_uuid: str) -> str:
        short = str(vm_uuid).replace("-", "")[:10]
        return f"tap{short}"[:15]

    # 执行宿主机命令（本地或远程 SSH）##########################################
    def _host_exec(self, cmd: str,
                   timeout: int = 30) -> tuple[bool, str, str]:
        if not hasattr(self, '_executor') or self._executor is None:
            self._executor = HostExecutor(self.hs_config, reuse_ssh=True)
        return self._executor.exec(cmd, timeout=timeout, allow_pipe=True)

    # 确保目录存在 ##############################################################
    def _ensure_dirs(self):
        self._host_exec(f"mkdir -p \"{self._sock_root}\" && chmod 0700 \"{self._sock_root}\"")
        if self.hs_config.extern_path:
            self._host_exec(f"mkdir -p \"{self.hs_config.extern_path}\"")
        if self.hs_config.backup_path:
            self._host_exec(f"mkdir -p \"{self.hs_config.backup_path}\"")

    # 获取 hypervisor 可执行文件 ###############################################
    def _hv_bin(self) -> str:
        ext = self.hs_config.extend_data or {}
        return ext.get("smolvm_hv_path", "") or "firecracker"

    # 获取 hypervisor 名称 ######################################################
    def _hv_name(self) -> str:
        ext = self.hs_config.extend_data or {}
        return ext.get("smolvm_hv", "") or "firecracker"

    # 获取默认 kernel 路径 ######################################################
    def _kernel_path(self) -> str:
        # 允许用户通过 extend_data["smolvm_kernel"] 覆盖
        ext = self.hs_config.extend_data or {}
        k = ext.get("smolvm_kernel", "").strip()
        if k:
            return k
        base = self.hs_config.images_path or "/var/lib/smolvm/images"
        return f"{base}/vmlinux-smolvm"

    # FC 客户端 #################################################################
    def _fc(self, vm_uuid: str) -> FCClient:
        return FCClient(self._vm_sock(vm_uuid))

    # 读取 pid 文件 #############################################################
    def _read_pid(self, vm_uuid: str) -> int:
        pid_file = self._vm_pid_file(vm_uuid)
        ok, out, _ = self._host_exec(f"cat \"{pid_file}\" 2>/dev/null || true")
        try:
            return int((out or "").strip())
        except Exception:
            return 0

    # 进程是否存活 ##############################################################
    def _pid_alive(self, pid: int) -> bool:
        if pid <= 0:
            return False
        ok, out, _ = self._host_exec(f"kill -0 {pid} 2>/dev/null && echo YES || echo NO")
        return ok and "YES" in out

    # 杀死进程 ##################################################################
    def _kill_pid(self, pid: int, force: bool = False):
        if pid <= 0:
            return
        sig = "-9" if force else "-15"
        self._host_exec(f"kill {sig} {pid} 2>/dev/null || true")

    # 持久化 vm.json ############################################################
    def _save_vm_json(self, vm_conf: VMConfig):
        vm_dir = self._vm_dir(vm_conf.vm_uuid)
        path = f"{vm_dir}/vm.json"
        try:
            data = json.dumps(vm_conf.__save__(), ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"[SmolVM] 序列化 VMConfig 失败: {e}")
            return
        if self._is_remote():
            # 写远端
            safe = data.replace("'", "'\\''")
            self._host_exec(
                f"mkdir -p \"{vm_dir}\" && cat >\"{path}\" <<'EOF_VMJSON'\n"
                f"{data}\nEOF_VMJSON")
        else:
            os.makedirs(vm_dir, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(data)

    # 加载 vm.json ##############################################################
    def _load_vm_json(self, vm_uuid: str) -> dict | None:
        path = f"{self._vm_dir(vm_uuid)}/vm.json"
        ok, out, _ = self._host_exec(f"cat \"{path}\" 2>/dev/null || true")
        if not ok or not out.strip():
            return None
        try:
            return json.loads(out)
        except Exception:
            return None

    # ==========================================================================
    # 生命周期：HSLoader/HSStatus/HSCreate/HSDelete/HSUnload ==================
    # ==========================================================================

    # 加载主机 ##################################################################
    def HSLoader(self) -> ZMessage:
        # 初始化 detector/builder ==============================================
        if self.kvm_detector is None:
            self.kvm_detector = KVMDetector(self.hs_config)
        if self.fs_builder is None:
            self.fs_builder = RootFSBuilder(self.hs_config)

        # 环境检测 ==============================================================
        ok, info = self.kvm_detector.detect()
        self.kvm_detector.save_to_config(info)
        if not ok:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 环境检测失败: {info.get('message')}")
            return ZMessage(
                success=False, action="HSLoader",
                message=info.get("message", "SmolVM 环境检测失败"))

        # 确保目录存在 ==========================================================
        self._ensure_dirs()

        # 通用加载 ==============================================================
        result = super().HSLoader()

        # 初始化 TTY/端口转发链路 ===============================================
        self.VMLoader_TTY()

        # 同步端口映射（TTY 方式复用）==========================================
        try:
            self.syn_port_TTY()
        except Exception as e:
            logger.warning(f"[{self.hs_config.server_name}] 同步端口映射失败: {e}")

        logger.success(
            f"[{self.hs_config.server_name}] SmolVM 驱动加载完成: "
            f"hv={info.get('hypervisor')} ver={info.get('version')}")
        return result

    # 卸载主机 ##################################################################
    def HSUnload(self) -> ZMessage:
        if self.kvm_detector is not None:
            try:
                self.kvm_detector.close()
            except Exception:
                pass
            self.kvm_detector = None
        self.web_terminal = None
        return super().HSUnload()

    # 初始宿主机 ################################################################
    def HSCreate(self) -> ZMessage:
        self._ensure_dirs()
        return super().HSCreate()

    # 还原宿主机 ################################################################
    def HSDelete(self) -> ZMessage:
        # 删除所有 vm 子目录 / socket / pid
        try:
            self._host_exec(f"rm -rf \"{self._sock_root}\"")
        except Exception:
            pass
        return super().HSDelete()

    # 宿主机状态 ################################################################
    def HSStatus(self) -> HWStatus:
        """优先 SSH 采集宿主机真实状态，失败回退基础信息"""
        addr = self.hs_config.server_addr or ""
        is_remote = addr.startswith("ssh://") or (
            addr not in ["", "localhost", "127.0.0.1"])

        if is_remote:
            ssh_addr = addr.replace("ssh://", "")
            orig_addr = self.hs_config.server_addr
            self.hs_config.server_addr = ssh_addr
            try:
                hw_status = self.ssh_get_hw_status()
            finally:
                self.hs_config.server_addr = orig_addr
            if hw_status and (hw_status.cpu_total > 0 or hw_status.mem_total > 0):
                return hw_status
            logger.warning(f"[{self.hs_config.server_name}] SmolVM SSH 状态采集失败，降级")

        # 本地回退 ==============================================================
        try:
            return self.local_get_hw_status()
        except Exception as e:
            logger.warning(f"[{self.hs_config.server_name}] 本地状态采集失败: {e}")
            return super().HSStatus()

    # ==========================================================================
    # 同步端口映射 / 初始化 TTY ================================================
    # ==========================================================================
    def syn_port(self):
        return self.syn_port_TTY()

    # ==========================================================================
    # 网络检查（仿 OCInterface，但不依赖 Docker API）============================
    # ==========================================================================
    def NetCheck(self, vm_conf: VMConfig) -> tuple:
        """按 ipaddr_maps 分配 IP/网关/掩码/MAC，语义与 OCInterface 一致"""
        logger.info(f"[{self.hs_config.server_name}] SmolVM 网络检查: {vm_conf.vm_uuid}")
        try:
            # 禁止同一 VM 分配多个相同类型网卡 ===================================
            nic_types: dict = {}
            for nic_name, nic_conf in vm_conf.nic_all.items():
                if nic_conf.nic_type in nic_types:
                    return vm_conf, ZMessage(
                        success=False, action="NetCheck",
                        message=(
                            f"禁止为同一 microVM 分配多个相同类型的网卡："
                            f"{nic_name} 与 {nic_types[nic_conf.nic_type]} "
                            f"均为 {nic_conf.nic_type}"))
                nic_types[nic_conf.nic_type] = nic_name

            # 排除当前 VM 自己的 IP，避免误判冲突 =================================
            all_alloc = self.ip_check()
            cur_ips = set()
            for _, nic in vm_conf.nic_all.items():
                if nic.ip4_addr:
                    cur_ips.add(nic.ip4_addr.strip())
            other_ips = all_alloc - cur_ips

            # 逐网卡分配 ==========================================================
            import ipaddress
            for nic_name, nic_conf in vm_conf.nic_all.items():
                if nic_conf.ip4_addr and nic_conf.ip4_addr.strip():
                    if nic_conf.ip4_addr.strip() in other_ips:
                        return vm_conf, ZMessage(
                            success=False, action="NetCheck",
                            message=f"网卡 {nic_name} IP {nic_conf.ip4_addr} 已被占用")
                    continue

                # 从 ipaddr_maps 查找对应配置 ====================================
                ipaddr_cfg = None
                for _, cfg in self.hs_config.ipaddr_maps.items():
                    if cfg.get("type") == nic_conf.nic_type:
                        ipaddr_cfg = cfg
                        break
                if not ipaddr_cfg:
                    return vm_conf, ZMessage(
                        success=False, action="NetCheck",
                        message=f"网卡 {nic_name} 类型 {nic_conf.nic_type} 未在 ipaddr_maps 中配置")

                ip_from = ipaddr_cfg.get("from", "")
                ip_nums = int(ipaddr_cfg.get("nums", 0) or 0)
                ip_gate = ipaddr_cfg.get("gate", "")
                ip_mask = ipaddr_cfg.get("mask", "")
                if not ip_from or ip_nums <= 0:
                    return vm_conf, ZMessage(
                        success=False, action="NetCheck",
                        message=f"网卡 {nic_name} 的 ipaddr_maps 配置不完整（缺少 from/nums）")

                # 生成候选 IP 并挑选第一个空闲 ====================================
                start_ip = ipaddress.ip_address(ip_from)
                assigned = False
                for i in range(ip_nums):
                    cand = str(start_ip + i)
                    if cand == ip_gate or cand in other_ips:
                        continue
                    nic_conf.ip4_addr = cand
                    if ip_gate:
                        nic_conf.nic_gate = ip_gate
                    if ip_mask:
                        nic_conf.nic_mask = ip_mask
                    if self.hs_config.ipaddr_ddns:
                        nic_conf.dns_addr = self.hs_config.ipaddr_ddns
                    try:
                        nic_conf.send_mac()
                    except Exception:
                        pass
                    other_ips.add(cand)
                    cur_ips.add(cand)
                    assigned = True
                    logger.info(
                        f"[{self.hs_config.server_name}] 为 {vm_conf.vm_uuid}/{nic_name} 分配 IP {cand}")
                    break
                if not assigned:
                    return vm_conf, ZMessage(
                        success=False, action="NetCheck",
                        message=f"无法为网卡 {nic_name} 分配 IP，范围已满")

            return vm_conf, ZMessage(success=True, action="NetCheck", message="网络配置检查完成")

        except Exception as e:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 网络检查异常: {e}")
            traceback.print_exc()
            return vm_conf, ZMessage(
                success=False, action="NetCheck", message=f"网络检查失败: {e}")

    # ==========================================================================
    # 网络动态绑定（创建/销毁 tap 设备并挂到 bridge）===========================
    # ==========================================================================
    def IPBinder_MAN(self, vm_conf: VMConfig, flag: bool = True) -> ZMessage:
        """
        为 microVM 创建 / 销毁 tap 设备并附加到配置的 Linux bridge

        :param vm_conf: 虚拟机配置
        :param flag: True=创建并 up；False=销毁
        """
        tap = self._tap_name(vm_conf.vm_uuid)
        try:
            if flag:
                # 创建 tap 设备 ==================================================
                self._host_exec(f"ip tuntap add dev {tap} mode tap 2>/dev/null || true")
                self._host_exec(f"ip link set {tap} up")

                # 绑定到第一个网卡对应的 bridge ================================
                bridge = ""
                for _, nic in vm_conf.nic_all.items():
                    bridge = getattr(self.hs_config, f"network_{nic.nic_type}", "")
                    if bridge:
                        break
                if bridge:
                    self._host_exec(
                        f"ip link set {tap} master {bridge} 2>/dev/null || "
                        f"brctl addif {bridge} {tap} 2>/dev/null || true")
                return ZMessage(success=True, action="NCCreate",
                                message=f"tap {tap} 已创建并绑定 {bridge}")
            else:
                self._host_exec(f"ip link set {tap} down 2>/dev/null || true")
                self._host_exec(f"ip tuntap del dev {tap} mode tap 2>/dev/null || true")
                return ZMessage(success=True, action="NCCreate",
                                message=f"tap {tap} 已删除")
        except Exception as e:
            logger.warning(f"[{self.hs_config.server_name}] tap 操作失败: {e}")
            return ZMessage(success=False, action="NCCreate", message=str(e))

    # ==========================================================================
    # 虚拟机安装 - 构建 rootfs ==================================================
    # ==========================================================================
    def VMSetups(self, vm_conf: VMConfig) -> ZMessage:
        """调用 RootFSBuilder 从 docker 镜像生成 ext4 rootfs"""
        if self.fs_builder is None:
            self.fs_builder = RootFSBuilder(self.hs_config)

        vm_dir = self._vm_dir(vm_conf.vm_uuid)
        rootfs = f"{vm_dir}/rootfs.ext4"
        self._host_exec(f"mkdir -p \"{vm_dir}\"")

        size_mb = int(vm_conf.hdd_num or 0) * 1024
        if size_mb <= 0:
            size_mb = RootFSBuilder.DEFAULT_SIZE_MB

        ok, msg, path = self.fs_builder.build(
            image=vm_conf.os_name,
            out_rootfs=rootfs,
            size_mb=size_mb,
            root_pass=vm_conf.os_pass or "",
            inject_init=True)
        if not ok:
            return ZMessage(success=False, action="VInstall",
                            message=f"rootfs 构建失败: {msg}")
        return ZMessage(success=True, action="VInstall",
                        message=f"rootfs 已生成: {path}")

    # ==========================================================================
    # 虚拟机创建 ###############################################################
    # ==========================================================================
    def VMCreate(self, vm_conf: VMConfig) -> ZMessage:
        logger.info(f"[{self.hs_config.server_name}] 开始创建 SmolVM: {vm_conf.vm_uuid}")

        # 1) 网络检查 ==========================================================
        vm_conf, net_res = self.NetCheck(vm_conf)
        if not net_res.success:
            return net_res

        vm_uuid = vm_conf.vm_uuid
        vm_dir = self._vm_dir(vm_uuid)
        sock = self._vm_sock(vm_uuid)
        pid_file = self._vm_pid_file(vm_uuid)
        tap = self._tap_name(vm_uuid)
        rollback: list = []

        try:
            # 2) 安装 rootfs ===================================================
            inst = self.VMSetups(vm_conf)
            if not inst.success:
                raise Exception(inst.message)
            rollback.append(lambda: self._host_exec(f"rm -rf \"{vm_dir}\""))

            # 3) 创建 tap ======================================================
            bind_res = self.IPBinder_MAN(vm_conf, flag=True)
            if not bind_res.success:
                raise Exception(bind_res.message)
            rollback.append(lambda: self.IPBinder_MAN(vm_conf, flag=False))

            # 4) 启动 firecracker 进程 =========================================
            self._host_exec(
                f"mkdir -p \"{self._sock_root}\" && rm -f \"{sock}\"")
            hv = self._hv_bin()
            # 注意：Firecracker 要求 socket 不可预先存在
            start_cmd = (
                f"setsid {hv} --api-sock \"{sock}\" "
                f">\"{vm_dir}/fc.log\" 2>&1 & echo $! > \"{pid_file}\"")
            ok, out, err = self._host_exec(start_cmd, timeout=10)
            if not ok:
                raise Exception(f"启动 firecracker 失败: {err}")
            # 收紧权限
            self._host_exec(f"sleep 0.3; chmod 0600 \"{sock}\" 2>/dev/null || true")
            rollback.append(lambda: self._kill_pid(self._read_pid(vm_uuid), force=True))
            rollback.append(lambda: self._host_exec(f"rm -f \"{sock}\" \"{pid_file}\""))

            # 5) 通过 FC API 装配虚拟机 ========================================
            fc = self._fc(vm_uuid)
            if not fc.wait_socket_ready(timeout=10):
                raise Exception("firecracker socket 未就绪")

            # 5.1 boot source =====================================================
            code, resp = fc.put_boot_source(
                kernel_path=self._kernel_path(),
                boot_args=DEFAULT_BOOT_ARGS)
            if code >= 400 or code < 0:
                raise Exception(f"PUT /boot-source 失败: {code} {resp}")

            # 5.2 rootfs drive ====================================================
            code, resp = fc.put_rootfs_drive(
                rootfs_path=f"{vm_dir}/rootfs.ext4", is_read_only=False)
            if code >= 400 or code < 0:
                raise Exception(f"PUT /drives/rootfs 失败: {code} {resp}")

            # 5.3 network iface ===================================================
            mac = ""
            for _, nic in vm_conf.nic_all.items():
                mac = nic.mac_addr or ""
                break
            code, resp = fc.put_network_iface("eth0", tap, mac)
            if code >= 400 or code < 0:
                raise Exception(f"PUT /network-interfaces/eth0 失败: {code} {resp}")

            # 5.4 machine config ==================================================
            vcpu = max(1, int(vm_conf.cpu_num or 1))
            mem_mib = max(128, int(vm_conf.mem_num or 512))
            code, resp = fc.put_machine_config(vcpu=vcpu, mem_mib=mem_mib)
            if code >= 400 or code < 0:
                raise Exception(f"PUT /machine-config 失败: {code} {resp}")

            # 5.5 InstanceStart ===================================================
            code, resp = fc.action("InstanceStart")
            if code >= 400 or code < 0:
                raise Exception(f"InstanceStart 失败: {code} {resp}")

            # 6) 保存 vm.json ==================================================
            self._save_vm_json(vm_conf)

            logger.success(
                f"[{self.hs_config.server_name}] SmolVM 创建成功: {vm_uuid} "
                f"(vcpu={vcpu}, mem={mem_mib}MiB)")
            hs_result = ZMessage(success=True, action="VMCreate",
                                 message=f"microVM {vm_uuid} 创建成功")
            self.logs_set(hs_result)

        except Exception as e:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 创建失败: {e}", exc_info=True)
            # 失败回滚 ==========================================================
            for rb in reversed(rollback):
                try:
                    rb()
                except Exception:
                    pass
            hs_result = ZMessage(success=False, action="VMCreate",
                                 message=f"microVM 创建失败: {e}")
            self.logs_set(hs_result)
            return hs_result

        return super().VMCreate(vm_conf)

    # ==========================================================================
    # 虚拟机更新 ###############################################################
    # ==========================================================================
    def VMUpdate(self, vm_conf: VMConfig, vm_last: VMConfig) -> ZMessage:
        logger.info(f"[{self.hs_config.server_name}] 开始更新 SmolVM: {vm_conf.vm_uuid}")

        # 重新网络检查 ==========================================================
        vm_conf, net_res = self.NetCheck(vm_conf)
        if not net_res.success:
            return net_res

        vm_uuid = vm_conf.vm_uuid
        os_changed = bool(vm_conf.os_name and vm_last.os_name and
                          vm_conf.os_name != vm_last.os_name)
        cpu_changed = int(vm_conf.cpu_num or 0) != int(vm_last.cpu_num or 0)
        mem_changed = int(vm_conf.mem_num or 0) != int(vm_last.mem_num or 0)

        try:
            # 停机（microVM 不支持热变更）=====================================
            self.VMPowers(vm_uuid, VMPowers.H_CLOSE)

            if os_changed:
                logger.info(f"[{self.hs_config.server_name}] 镜像变更，重建 rootfs: {vm_uuid}")
                # 删除旧实例数据后重建 =========================================
                self._host_exec(f"rm -f \"{self._vm_dir(vm_uuid)}/rootfs.ext4\"")
                return self.VMCreate(vm_conf)

            if cpu_changed or mem_changed:
                # 仅重启以应用新配置 ===========================================
                logger.info(f"[{self.hs_config.server_name}] 资源变更 cpu={cpu_changed} mem={mem_changed}")

            # 更新网络 ==========================================================
            self.IPUpdate(vm_conf, vm_last)

            # 保存 vm.json 并重新启动 ==========================================
            self._save_vm_json(vm_conf)
            self.VMPowers(vm_uuid, VMPowers.S_START)

            # 更新密码 ==========================================================
            if vm_conf.os_pass:
                self.VMPasswd(vm_uuid, vm_conf.os_pass)

            hs_result = ZMessage(success=True, action="VMUpdate",
                                 message=f"microVM {vm_uuid} 更新成功")
            self.logs_set(hs_result)
            return hs_result

        except Exception as e:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 更新失败: {e}", exc_info=True)
            return ZMessage(success=False, action="VMUpdate",
                            message=f"microVM 更新失败: {e}")

    # ==========================================================================
    # 虚拟机删除 ###############################################################
    # ==========================================================================
    def VMDelete(self, vm_name: str, rm_back: bool = True) -> ZMessage:
        logger.info(f"[{self.hs_config.server_name}] 开始删除 SmolVM: {vm_name} (rm_back={rm_back})")
        vm_conf = self.vm_finds(vm_name)
        if vm_conf is None:
            return ZMessage(success=False, action="VMDelete",
                            message=f"microVM {vm_name} 不存在")

        try:
            # 1) 停止 firecracker 进程 =========================================
            pid = self._read_pid(vm_name)
            if pid > 0 and self._pid_alive(pid):
                self._kill_pid(pid, force=True)

            # 2) 删除 socket/pid ===============================================
            self._host_exec(
                f"rm -f \"{self._vm_sock(vm_name)}\" \"{self._vm_pid_file(vm_name)}\"")

            # 3) 删除 tap ======================================================
            self.IPBinder_MAN(vm_conf, flag=False)

            # 4) 删除工作目录 ==================================================
            self._host_exec(f"rm -rf \"{self._vm_dir(vm_name)}\"")

            # 5) 清理端口映射 ==================================================
            try:
                for p in list(vm_conf.nat_all or []):
                    self.PortsMap(p, flag=False)
            except Exception as e:
                logger.warning(f"[{self.hs_config.server_name}] 清理端口映射失败: {e}")

            # 6) 备份 / 挂载清理 ===============================================
            if rm_back:
                self.RMBackup(vm_name, "")

            logger.success(f"[{self.hs_config.server_name}] SmolVM 已删除: {vm_name}")
        except Exception as e:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 删除失败: {vm_name} - {e}", exc_info=True)
            return ZMessage(success=False, action="VMDelete",
                            message=f"microVM 删除失败: {e}")

        return super().VMDelete(vm_name)

    # ==========================================================================
    # 虚拟机扫描 ###############################################################
    # ==========================================================================
    def VMDetect(self) -> ZMessage:
        logger.info(f"[{self.hs_config.server_name}] 开始扫描 SmolVM microVMs")
        base = self.hs_config.extern_path
        if not base:
            return ZMessage(success=False, action="VScanner",
                            message="extern_path 未配置，无法扫描")

        filter_prefix = self.hs_config.filter_name or ""
        ok, out, _ = self._host_exec(
            f"ls -1 \"{base}\" 2>/dev/null || true")
        if not ok:
            return ZMessage(success=True, action="VScanner",
                            message="扫描完成（目录不存在）",
                            results={"scanned": 0, "added": 0})

        scanned, added = 0, 0
        for name in (out or "").splitlines():
            name = name.strip()
            if not name:
                continue
            if filter_prefix and not name.startswith(filter_prefix):
                continue
            scanned += 1
            if name in self.vm_saving:
                continue
            # 检查是否存在 rootfs ==============================================
            chk, _, _ = self._host_exec(
                f"test -f \"{base}/{name}/rootfs.ext4\" && echo YES || echo NO")
            if "YES" not in (_ or ""):  # 无 rootfs 跳过
                pass
            vm_cfg = VMConfig()
            vm_cfg.vm_uuid = name
            # 如存在 vm.json 用其覆盖 ==========================================
            data = self._load_vm_json(name)
            if isinstance(data, dict):
                try:
                    vm_cfg = VMConfig(**data)
                    vm_cfg.vm_uuid = name
                except Exception:
                    pass
            self.vm_saving[name] = vm_cfg
            added += 1

        if added > 0:
            self.data_set()

        return ZMessage(
            success=True, action="VScanner",
            message=f"扫描完成：共 {scanned} 个，新增 {added} 个",
            results={"scanned": scanned, "added": added,
                     "prefix_filter": filter_prefix})

    # ==========================================================================
    # 电源控制 #################################################################
    # ==========================================================================
    def VMPowers(self, vm_name: str, power: VMPowers) -> ZMessage:
        power_map = {
            VMPowers.S_START: "启动",
            VMPowers.H_CLOSE: "强制关机",
            VMPowers.S_CLOSE: "正常关机",
            VMPowers.S_RESET: "正常重启",
            VMPowers.H_RESET: "强制重启",
            VMPowers.A_PAUSE: "暂停",
            VMPowers.A_WAKED: "恢复",
        }
        logger.info(
            f"[{self.hs_config.server_name}] SmolVM 电源: {vm_name} -> "
            f"{power_map.get(power, '未知')}")

        # 先调用父类设置中间状态 ================================================
        super().VMPowers(vm_name, power)

        vm_conf = self.vm_finds(vm_name)
        try:
            fc = self._fc(vm_name)
            pid = self._read_pid(vm_name)

            if power == VMPowers.S_START:
                # 如果进程已存活，尝试 Resume；否则重新启动 ====================
                if pid > 0 and self._pid_alive(pid):
                    fc.patch_vm_state("Resumed")
                else:
                    # 进程不在，等同于 VMCreate 的 FC 装配流程（沿用已有 rootfs）
                    if vm_conf is not None:
                        self._restart_fc(vm_conf)

            elif power == VMPowers.H_CLOSE:
                # 强制杀进程 =====================================================
                if pid > 0:
                    self._kill_pid(pid, force=True)
                self._host_exec(
                    f"rm -f \"{self._vm_sock(vm_name)}\" \"{self._vm_pid_file(vm_name)}\"")

            elif power == VMPowers.S_CLOSE:
                # 发送 CtrlAltDel 触发来宾软关机，超时后强杀 ====================
                fc.action("SendCtrlAltDel")
                deadline = time.time() + 30
                while time.time() < deadline:
                    if pid > 0 and not self._pid_alive(pid):
                        break
                    time.sleep(1)
                if pid > 0 and self._pid_alive(pid):
                    self._kill_pid(pid, force=True)
                self._host_exec(
                    f"rm -f \"{self._vm_sock(vm_name)}\" \"{self._vm_pid_file(vm_name)}\"")

            elif power in (VMPowers.S_RESET, VMPowers.H_RESET):
                # 停再启 =========================================================
                self.VMPowers(vm_name,
                              VMPowers.S_CLOSE if power == VMPowers.S_RESET
                              else VMPowers.H_CLOSE)
                time.sleep(1)
                self.VMPowers(vm_name, VMPowers.S_START)

            elif power == VMPowers.A_PAUSE:
                fc.patch_vm_state("Paused")
            elif power == VMPowers.A_WAKED:
                fc.patch_vm_state("Resumed")

            hs_result = ZMessage(
                success=True, action="VMPowers",
                message=f"{power_map.get(power, '未知')} 成功")
            self.logs_set(hs_result)

            # 针对软关机/软重启启动监控线程 =====================================
            if power == VMPowers.S_CLOSE:
                self.soft_pwr(vm_name, power, VMPowers.ON_STOP)
            elif power == VMPowers.S_RESET:
                self.soft_pwr(vm_name, power, VMPowers.ON_STOP)

            return hs_result

        except Exception as e:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 电源操作失败: {e}", exc_info=True)
            hs_result = ZMessage(success=False, action="VMPowers",
                                 message=f"电源操作失败: {e}")
            self.logs_set(hs_result)
            return hs_result

    # 重启 FC 进程与装配（内部使用）###########################################
    def _restart_fc(self, vm_conf: VMConfig):
        vm_uuid = vm_conf.vm_uuid
        vm_dir = self._vm_dir(vm_uuid)
        sock = self._vm_sock(vm_uuid)
        pid_file = self._vm_pid_file(vm_uuid)
        tap = self._tap_name(vm_uuid)

        # 确保 tap 存在 =========================================================
        self.IPBinder_MAN(vm_conf, flag=True)

        # 启动 FC 进程 ==========================================================
        self._host_exec(f"rm -f \"{sock}\"")
        hv = self._hv_bin()
        self._host_exec(
            f"setsid {hv} --api-sock \"{sock}\" "
            f">\"{vm_dir}/fc.log\" 2>&1 & echo $! > \"{pid_file}\"")
        self._host_exec(f"sleep 0.3; chmod 0600 \"{sock}\" 2>/dev/null || true")

        fc = self._fc(vm_uuid)
        if not fc.wait_socket_ready(timeout=10):
            raise Exception("firecracker socket 未就绪")

        fc.put_boot_source(self._kernel_path(), DEFAULT_BOOT_ARGS)
        fc.put_rootfs_drive(f"{vm_dir}/rootfs.ext4", is_read_only=False)
        mac = ""
        for _, nic in vm_conf.nic_all.items():
            mac = nic.mac_addr or ""
            break
        fc.put_network_iface("eth0", tap, mac)
        fc.put_machine_config(
            vcpu=max(1, int(vm_conf.cpu_num or 1)),
            mem_mib=max(128, int(vm_conf.mem_num or 512)))
        fc.action("InstanceStart")

    # ==========================================================================
    # 实际电源状态 #############################################################
    # ==========================================================================
    def GetPower(self, vm_name: str) -> str:
        """通过 FC GET / 查询 state，或通过进程存活性推断"""
        pid = self._read_pid(vm_name)
        if pid <= 0 or not self._pid_alive(pid):
            return "已关机"
        try:
            code, resp = self._fc(vm_name).get_instance_info()
            if code == 200 and isinstance(resp, dict):
                state = (resp.get("state") or "").lower()
                m = {
                    "running": "运行中",
                    "not started": "已关机",
                    "paused": "已暂停",
                    "restarting": "重启中",
                }
                return m.get(state, "运行中")
        except Exception:
            pass
        return "运行中"

    # ==========================================================================
    # 网络配置更新 / 端口映射 ===================================================
    # ==========================================================================
    def IPUpdate(self, vm_conf: VMConfig, vm_last: VMConfig) -> ZMessage:
        """重新绑定 tap（microVM 网络变更需要停机重启）"""
        try:
            # 删除旧 tap、创建新 tap ============================================
            self.IPBinder_MAN(vm_last, False)
            self.IPBinder_MAN(vm_conf, True)
            return ZMessage(success=True, action="VMUpdate", message="网络更新完成")
        except Exception as e:
            return ZMessage(success=False, action="VMUpdate",
                            message=f"网络更新失败: {e}")

    def PortsMap(self, map_info: PortData, flag: bool = True) -> ZMessage:
        return self.PortsMap_TTY(map_info, flag)

    # ==========================================================================
    # 密码设置 #################################################################
    # ==========================================================================
    def VMPasswd(self, vm_name: str, os_pass: str) -> ZMessage:
        logger.info(f"[{self.hs_config.server_name}] SmolVM 设置密码: {vm_name}")
        # 运行中：走 SSH chpasswd =================================================
        vm_conf = self.vm_finds(vm_name)
        if vm_conf is None:
            return ZMessage(success=False, action="Password",
                            message=f"microVM {vm_name} 不存在")

        pid = self._read_pid(vm_name)
        if pid > 0 and self._pid_alive(pid):
            # 获取 VM IP
            vm_ip = ""
            for _, nic in vm_conf.nic_all.items():
                if nic.ip4_addr:
                    vm_ip = nic.ip4_addr
                    break
            if not vm_ip:
                return ZMessage(success=False, action="Password",
                                message="虚拟机未分配 IP，无法通过 SSH 修改密码")
            try:
                from HostModule.SSHDManager import SSHDManager
                ssh = SSHDManager()
                ok, msg = ssh.connect(
                    hostname=vm_ip, username="root",
                    password=os_pass, port=22)
                if not ok:
                    # 尝试旧密码（若有）
                    old_pass = getattr(vm_conf, "os_pass", "") or ""
                    if old_pass and old_pass != os_pass:
                        ok, msg = ssh.connect(
                            hostname=vm_ip, username="root",
                            password=old_pass, port=22)
                if not ok:
                    return ZMessage(success=False, action="Password",
                                    message=f"SSH 连接失败: {msg}")
                try:
                    ok_exec, out, err = ssh.execute_command(
                        f"echo 'root:{os_pass}' | chpasswd")
                    if not ok_exec:
                        return ZMessage(success=False, action="Password",
                                        message=f"chpasswd 失败: {err}")
                finally:
                    ssh.close()
                hs_result = ZMessage(success=True, action="Password",
                                     message="密码已更新（在线）")
                self.logs_set(hs_result)
                return hs_result
            except Exception as e:
                return ZMessage(success=False, action="Password",
                                message=f"在线改密失败: {e}")

        # 停机：挂载 rootfs 离线改密 ============================================
        return self._passwd_offline(vm_conf, os_pass)

    # 离线改密 ##################################################################
    def _passwd_offline(self, vm_conf: VMConfig, os_pass: str) -> ZMessage:
        vm_dir = self._vm_dir(vm_conf.vm_uuid)
        rootfs = f"{vm_dir}/rootfs.ext4"
        mnt = f"{vm_dir}/.mnt-passwd"
        try:
            # 确保 mkfs/sed/openssl 可用 =======================================
            self._host_exec(f"mkdir -p \"{mnt}\"")
            ok, _, err = self._host_exec(
                f"mount -o loop \"{rootfs}\" \"{mnt}\"")
            if not ok:
                return ZMessage(success=False, action="Password",
                                message=f"挂载 rootfs 失败: {err}")
            try:
                # 生成哈希并替换 shadow 中 root 行 =============================
                ok, out, err = self._host_exec(
                    f"openssl passwd -6 '{os_pass}' 2>/dev/null || "
                    f"openssl passwd -1 '{os_pass}'")
                hashed = (out or "").strip().splitlines()[-1] if out else ""
                if not hashed:
                    return ZMessage(success=False, action="Password",
                                    message="openssl 生成密文失败")
                self._host_exec(
                    f"sh -c 'if [ -f \"{mnt}/etc/shadow\" ]; then "
                    f"sed -i -E \"s|^root:[^:]*:|root:{hashed}:|\" \"{mnt}/etc/shadow\"; "
                    f"else echo \"root:{hashed}:0:0:99999:7:::\" > \"{mnt}/etc/shadow\"; fi'")
            finally:
                # 强制卸载（异常时 lazy）=====================================
                self._host_exec(
                    f"sync && umount \"{mnt}\" || umount -l \"{mnt}\"")
                self._host_exec(f"rmdir \"{mnt}\" 2>/dev/null || true")
            return ZMessage(success=True, action="Password",
                            message="密码已更新（离线）")
        except Exception as e:
            return ZMessage(success=False, action="Password",
                            message=f"离线改密失败: {e}")

    # ==========================================================================
    # 远程控制台（Web SSH）#####################################################
    # ==========================================================================
    def VMRemote(self, vm_uuid: str, ip_addr: str = "127.0.0.1") -> ZMessage:
        if vm_uuid not in self.vm_saving:
            return ZMessage(success=False, action="VCRemote",
                            message="虚拟机不存在")
        vm_conf = self.vm_saving[vm_uuid]

        # 获取 SSH WAN 端口 ======================================================
        wan_port = None
        try:
            for p in vm_conf.nat_all:
                if int(p.lan_port) == 22:
                    wan_port = int(p.wan_port)
                    break
        except Exception:
            wan_port = None

        if not wan_port and self.hs_config.server_pass == "":
            return ZMessage(
                success=False, action="VCRemote",
                message=("当未设置主机密码时，必须添加一个端口映射到 22 端口<br/>"
                         "未找到当前虚拟机 22 端口对应端口映射信息，无法继续"))

        if len(self.hs_config.public_addr) == 0:
            return ZMessage(success=False, action="VCRemote",
                            message="主机外网 IP 不存在")
        public_ip = self.hs_config.public_addr[0]
        if public_ip in ["localhost", "127.0.0.1", ""]:
            public_ip = "127.0.0.1"

        # 确保 TTY 组件就绪 ======================================================
        self.VMLoader_TTY()

        tty_port, token = self.web_terminal.open_tty(
            self.hs_config, wan_port, vm_uuid, vm_type="smolvm")
        if tty_port <= 0:
            return ZMessage(success=False, action="VCRemote",
                            message="启动 tty 会话失败")

        try:
            ok = self.http_manager.create_vnc(token, "127.0.0.1", tty_port)
            if not ok:
                self.web_terminal.stop_tty(tty_port)
                return ZMessage(success=False, action="VCRemote",
                                message="添加 SSH 代理失败")
        except Exception as e:
            logger.error(f"[SmolVM] SSH 代理失败: {e}")
            self.web_terminal.stop_tty(tty_port)
            return ZMessage(success=False, action="VCRemote",
                            message=f"SSH 代理配置失败: {e}")

        vnc_port = self.hs_config.remote_port
        url = f"http://{public_ip}:{vnc_port}/{token}"
        logger.info(f"VMRemote for {vm_uuid}: {url}")
        return ZMessage(
            success=True, action="VCRemote",
            message=url,
            results={"tty_port": tty_port, "token": token,
                     "vnc_port": vnc_port, "url": url, "ssh_port": wan_port})

    # ==========================================================================
    # 定时任务 & 指标 ##########################################################
    # ==========================================================================
    def Crontabs(self) -> bool:
        # 先执行父类（保存宿主机状态 + 同步电源状态）===========================
        super().Crontabs()

        for vm_uuid, vm_conf in self.vm_saving.items():
            try:
                pid = self._read_pid(vm_uuid)
                if pid <= 0 or not self._pid_alive(pid):
                    continue

                hw = self._collect_metrics(vm_uuid, pid, vm_conf)
                if self.save_data and self.hs_config.server_name:
                    self.save_data.add_vm_status(
                        self.hs_config.server_name, vm_uuid, hw)
            except Exception as e:
                logger.warning(f"[{self.hs_config.server_name}] SmolVM 指标采集失败 {vm_uuid}: {e}")
                continue
        return True

    # 采集单个 microVM 指标 #####################################################
    def _collect_metrics(self, vm_uuid: str, pid: int,
                         vm_conf: VMConfig) -> HWStatus:
        hw = HWStatus()
        hw.on_update = int(time.time())
        hw.ac_status = VMPowers.STARTED

        # CPU/内存：从 /proc/<pid>/stat + /proc/<pid>/status ===================
        try:
            ok, out, _ = self._host_exec(
                f"cat /proc/{pid}/status 2>/dev/null | grep -E '^(VmRSS|VmSize):'")
            vm_rss_mb = 0
            if ok and out:
                for line in out.splitlines():
                    if line.startswith("VmRSS:"):
                        parts = line.split()
                        if len(parts) >= 2:
                            vm_rss_mb = int(int(parts[1]) / 1024)
                            break
            hw.mem_usage = vm_rss_mb
            hw.mem_total = int(vm_conf.mem_num or 0)
        except Exception:
            pass

        # CPU 使用率：两次采样差值 =============================================
        try:
            ok, out, _ = self._host_exec(
                f"ps -p {pid} -o %cpu= 2>/dev/null || true")
            cpu_percent = 0
            if ok and out.strip():
                try:
                    # ps -o %cpu 返回多核总百分比（4核满载=400），除以核心数得到单核百分比（0~100）
                    raw_percent = float(out.strip())
                    cores = max(1, int(vm_conf.cpu_num or 1))
                    cpu_percent = int(raw_percent / cores)
                except Exception:
                    cpu_percent = 0
            hw.cpu_usage = cpu_percent
            hw.cpu_total = max(1, int(vm_conf.cpu_num or 1))
        except Exception:
            pass

        # 网络：从 tap 统计 =====================================================
        try:
            tap = self._tap_name(vm_uuid)
            ok, out, _ = self._host_exec(
                f"cat /sys/class/net/{tap}/statistics/rx_bytes "
                f"/sys/class/net/{tap}/statistics/tx_bytes 2>/dev/null || true")
            lines = (out or "").splitlines()
            rx = int(lines[0]) if len(lines) > 0 else 0
            tx = int(lines[1]) if len(lines) > 1 else 0
            hw.network_d = int(rx / (1024 * 1024))
            hw.network_u = int(tx / (1024 * 1024))
            hw.flu_usage = hw.network_d + hw.network_u
        except Exception:
            pass

        # 磁盘：rootfs 文件大小 =================================================
        try:
            ok, out, _ = self._host_exec(
                f"stat -c %s \"{self._vm_dir(vm_uuid)}/rootfs.ext4\" 2>/dev/null || true")
            size = int((out or "0").strip() or "0")
            hw.hdd_usage = int(size / (1024 * 1024))
        except Exception:
            pass

        return hw

    # ==========================================================================
    # 备份 / 恢复 ##############################################################
    # ==========================================================================
    def VMBackup(self, vm_name: str, vm_tips: str) -> ZMessage:
        logger.info(f"[{self.hs_config.server_name}] SmolVM 备份: {vm_name} ({vm_tips})")
        vm_conf = self.vm_finds(vm_name)
        if vm_conf is None:
            return ZMessage(success=False, action="VMBackup",
                            message=f"microVM {vm_name} 不存在")

        # 先停机以保证一致性 =====================================================
        was_running = False
        pid = self._read_pid(vm_name)
        if pid > 0 and self._pid_alive(pid):
            was_running = True
            self.VMPowers(vm_name, VMPowers.S_CLOSE)

        bak_time = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        bak_file = f"{vm_name}_{bak_time}.tar.gz"
        bak_path = f"{self.hs_config.backup_path}/{bak_file}"

        try:
            self._host_exec(f"mkdir -p \"{self.hs_config.backup_path}\"")
            cmd = (f"tar -C \"{self.hs_config.extern_path}\" "
                   f"-czf \"{bak_path}\" \"{vm_name}\"")
            ok, out, err = self._host_exec(cmd, timeout=3600)
            if not ok:
                return ZMessage(success=False, action="VMBackup",
                                message=f"备份打包失败: {err}")

            vm_conf.backups.append(VMBackup(
                backup_time=datetime.datetime.now(),
                backup_name=bak_file,
                backup_hint=vm_tips,
                old_os_name=vm_conf.os_name))

            if was_running:
                self.VMPowers(vm_name, VMPowers.S_START)

            self.vm_saving[vm_name] = vm_conf
            self.data_set()

            logger.success(f"[{self.hs_config.server_name}] SmolVM 备份成功: {bak_file}")
            hs_result = ZMessage(
                success=True, action="VMBackup",
                message=f"microVM 备份成功: {bak_file}",
                results={"backup_file": bak_file, "backup_path": bak_path})
            self.logs_set(hs_result)
            return hs_result
        except Exception as e:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 备份异常: {e}", exc_info=True)
            return ZMessage(success=False, action="VMBackup",
                            message=f"备份失败: {e}")

    # 恢复 ######################################################################
    def Restores(self, vm_name: str, vm_back: str) -> ZMessage:
        logger.info(f"[{self.hs_config.server_name}] SmolVM 恢复: {vm_name} <- {vm_back}")
        vm_conf = self.vm_finds(vm_name)
        if vm_conf is None:
            return ZMessage(success=False, action="Restores",
                            message=f"microVM {vm_name} 不存在")
        vb = next((v for v in vm_conf.backups if v.backup_name == vm_back), None)
        if vb is None:
            return ZMessage(success=False, action="Restores",
                            message=f"备份 {vm_back} 不存在")

        bak_path = f"{self.hs_config.backup_path}/{vm_back}"
        ok, out, _ = self._host_exec(
            f"test -f \"{bak_path}\" && echo YES || echo NO")
        if "YES" not in (out or ""):
            return ZMessage(success=False, action="Restores",
                            message=f"备份文件不存在: {bak_path}")

        try:
            # 停机 & 删除旧实例 ==================================================
            pid = self._read_pid(vm_name)
            if pid > 0 and self._pid_alive(pid):
                self._kill_pid(pid, force=True)
            self._host_exec(
                f"rm -f \"{self._vm_sock(vm_name)}\" \"{self._vm_pid_file(vm_name)}\"")
            self.IPBinder_MAN(vm_conf, flag=False)
            self._host_exec(f"rm -rf \"{self._vm_dir(vm_name)}\"")

            # 解压 ==================================================================
            ok, out, err = self._host_exec(
                f"tar -C \"{self.hs_config.extern_path}\" -xzf \"{bak_path}\"",
                timeout=3600)
            if not ok:
                return ZMessage(success=False, action="Restores",
                                message=f"恢复解压失败: {err}")

            # 读回 vm.json ==========================================================
            data = self._load_vm_json(vm_name)
            if isinstance(data, dict):
                try:
                    vm_conf = VMConfig(**data)
                    vm_conf.vm_uuid = vm_name
                except Exception:
                    pass
            if vb.old_os_name:
                vm_conf.os_name = vb.old_os_name

            # 启动 ==================================================================
            self.IPBinder_MAN(vm_conf, flag=True)
            self._restart_fc(vm_conf)

            self.vm_saving[vm_name] = vm_conf
            self.data_set()

            hs_result = ZMessage(
                success=True, action="Restores",
                message=f"microVM {vm_name} 恢复成功")
            self.logs_set(hs_result)
            return hs_result
        except Exception as e:
            logger.error(f"[{self.hs_config.server_name}] SmolVM 恢复异常: {e}", exc_info=True)
            return ZMessage(success=False, action="Restores",
                            message=f"恢复失败: {e}")

    # 删除备份 ##################################################################
    def RMBackup(self, vm_name: str, vm_back: str = "") -> ZMessage:
        return self.RMBackup_TTY(vm_name, vm_back)

    # 删除挂载目录 ##############################################################
    def RMMounts(self, vm_name: str, vm_imgs: str = "") -> ZMessage:
        return self.RMMounts_TTY(vm_name, vm_imgs)

    # ==========================================================================
    # 不支持能力占位 ###########################################################
    # ==========================================================================
    def HDDMount(self, vm_name: str, vm_imgs: SDConfig, in_flag: bool = True) -> ZMessage:
        return ZMessage(success=True, action="HDDMount",
                        message="microVM 不支持动态磁盘挂载")

    def ISOMount(self, vm_name: str, vm_imgs: IMConfig, in_flag: bool = True) -> ZMessage:
        return ZMessage(success=True, action="ISOMount",
                        message="microVM 不支持 ISO 挂载")

    def PCISetup(self, vm_name: str, config: VFConfig,
                 pci_key: str, in_flag: bool = True) -> ZMessage:
        return ZMessage(success=True, action="PCISetup",
                        message="microVM 不支持 PCI 直通")

    def USBSetup(self, vm_name: str, ud_info: USBInfos,
                 ud_keys: str, in_flag: bool = True) -> ZMessage:
        return ZMessage(success=True, action="USBSetup",
                        message="microVM 不支持 USB 直通")

    def PCIShows(self) -> dict[str, str]:
        return {}

    def USBShows(self) -> dict[str, USBInfos]:
        return {}

    # ==========================================================================
    # 可选继承默认实现（状态历史 / 截图 / 磁盘交接）===========================
    # ==========================================================================
    def VMStatus(self, vm_name: str = "",
                 s_t: int = None, e_t: int = None) -> dict[str, list[HWStatus]]:
        return super().VMStatus(vm_name, s_t, e_t)

    def VMScreen(self, vm_name: str = "") -> str:
        return super().VMScreen(vm_name)

    def HDDCheck(self, vm_name: str, vm_imgs: SDConfig, ex_name: str) -> ZMessage:
        return super().HDDCheck(vm_name, vm_imgs, ex_name)

    def HDDTrans(self, vm_name: str, vm_imgs: SDConfig, ex_name: str) -> ZMessage:
        return super().HDDTrans(vm_name, vm_imgs, ex_name)
