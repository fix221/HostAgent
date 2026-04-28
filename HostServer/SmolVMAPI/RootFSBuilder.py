################################################################################
# RootFSBuilder - 基于 Docker 镜像构建 ext4 rootfs 镜像
# 流程: docker create -> docker export | tar -x -> mkfs.ext4 -d <dir> <rootfs>
# 同时支持从本地 .tar/.tar.gz 文件直接构建（离线场景）
################################################################################
import os
import uuid
import shutil
import subprocess
from loguru import logger


# 最小化 init 脚本（busybox 镜像无 /sbin/init 时使用）==========================
DEFAULT_INIT_SCRIPT = r"""#!/bin/sh
# SmolVM minimal init
mount -t proc proc /proc 2>/dev/null
mount -t sysfs sys /sys 2>/dev/null
mount -t devtmpfs dev /dev 2>/dev/null || true
mkdir -p /dev/pts && mount -t devpts devpts /dev/pts 2>/dev/null || true
ip link set lo up 2>/dev/null || true
# 自动获取 IP（若无静态网络配置）
if [ -x /sbin/udhcpc ]; then
    udhcpc -i eth0 -q -f -n 2>/dev/null &
fi
# 启动 sshd（若安装了）
if [ -x /usr/sbin/sshd ]; then
    mkdir -p /var/run/sshd
    /usr/bin/ssh-keygen -A 2>/dev/null || true
    /usr/sbin/sshd -D &
fi
# 落入 shell（异常时保留控制台）
exec /bin/sh
"""

SSHD_SAFE_CONFIG = """Port 22
PermitRootLogin yes
PasswordAuthentication yes
PermitEmptyPasswords no
UsePAM no
"""


class RootFSBuilder:
    """
    将 Docker 镜像转换为可被 microVM 直接使用的 ext4 rootfs 镜像。

    用法::

        builder = RootFSBuilder(hs_config)
        ok, msg, rootfs_path = builder.build(
            image="alpine:3.19",
            out_rootfs="/data/smolvm/vm-uuid/rootfs.ext4",
            size_mb=2048,
            root_pass="RootPass@123")
    """

    DEFAULT_SIZE_MB = 8 * 1024  # 8GB

    # 初始化 ####################################################################
    def __init__(self, hs_config):
        self.hs_config = hs_config

    # 判断是否远程 ##############################################################
    def is_remote(self) -> bool:
        addr = self.hs_config.server_addr or ""
        return addr.startswith("ssh://") or (
            addr not in ["", "localhost", "127.0.0.1"])

    # 统一执行命令（本地/远程）##################################################
    def _exec(self, cmd: str, check: bool = False,
              timeout: int = 600) -> tuple[bool, str, str]:
        if self.is_remote():
            try:
                from HostModule.SSHDManager import SSHDManager
            except Exception as e:
                return False, "", f"SSH 模块不可用: {e}"
            ssh = SSHDManager()
            addr = (self.hs_config.server_addr or "").replace("ssh://", "")
            ok, msg = ssh.connect(
                hostname=addr,
                username=self.hs_config.server_user,
                password=self.hs_config.server_pass,
                port=self.hs_config.server_port or 22)
            if not ok:
                return False, "", f"SSH 连接失败: {msg}"
            try:
                ok, out, err = ssh.execute_command(cmd)
                return ok, out or "", err or ""
            finally:
                try:
                    ssh.close()
                except Exception:
                    pass
        else:
            try:
                r = subprocess.run(cmd, shell=True,
                                   capture_output=True, text=True,
                                   timeout=timeout)
                if check and r.returncode != 0:
                    raise RuntimeError(f"{cmd} failed: {r.stderr}")
                return r.returncode == 0, r.stdout or "", r.stderr or ""
            except Exception as e:
                return False, "", str(e)

    # 拉取 docker 镜像 ##########################################################
    def ensure_docker_image(self, image: str) -> tuple[bool, str]:
        ok, out, err = self._exec(f"docker image inspect {image} >/dev/null 2>&1 && echo YES || echo NO")
        if ok and "YES" in out:
            logger.info(f"[RootFSBuilder] 镜像 {image} 已存在于本地")
            return True, ""
        logger.info(f"[RootFSBuilder] 拉取镜像 {image}")
        ok, out, err = self._exec(f"docker pull {image}", timeout=900)
        if not ok:
            return False, f"docker pull 失败: {err}"
        return True, ""

    # 从本地 tar 文件加载镜像 ###################################################
    def load_image_from_tar(self, tar_path: str) -> tuple[bool, str, str]:
        """返回 (ok, msg, image_name)"""
        if not tar_path:
            return False, "tar 路径为空", ""
        # 推断镜像名：去掉 .tar / .tar.gz
        base = os.path.basename(tar_path)
        image_name = base.replace(".tar.gz", "").replace(".tar", "")

        # 若已存在同名镜像，跳过加载
        ok, out, _ = self._exec(
            f"docker image inspect {image_name} >/dev/null 2>&1 && echo YES || echo NO")
        if ok and "YES" in out:
            return True, "image already exists", image_name

        # 加载
        cmd = f"docker load -i \"{tar_path}\""
        if tar_path.endswith(".tar.gz"):
            cmd = f"gunzip -c \"{tar_path}\" | docker load"
        ok, out, err = self._exec(cmd, timeout=900)
        if not ok:
            return False, f"docker load 失败: {err}", ""
        return True, "ok", image_name

    # 构建 rootfs ###############################################################
    def build(self, image: str, out_rootfs: str,
              size_mb: int = 0, root_pass: str = "",
              inject_init: bool = True) -> tuple[bool, str, str]:
        """
        :param image: Docker 镜像名或 tar 文件名（位于 hs_config.images_path）
        :param out_rootfs: 输出 rootfs.ext4 绝对路径
        :param size_mb: rootfs 大小 (MB)；默认 8GB
        :param root_pass: 注入的 root 密码
        :param inject_init: 是否注入最小 init 脚本与 sshd 配置
        :return: (ok, 消息, rootfs 路径)
        """
        if size_mb <= 0:
            size_mb = self.DEFAULT_SIZE_MB

        # 处理 tar 镜像 ========================================================
        if image.endswith(".tar") or image.endswith(".tar.gz"):
            tar_path = image if os.path.isabs(image) else os.path.join(
                self.hs_config.images_path or "", image)
            ok, msg, image_name = self.load_image_from_tar(tar_path)
            if not ok:
                return False, msg, ""
            image = image_name
        else:
            ok, msg = self.ensure_docker_image(image)
            if not ok:
                return False, msg, ""

        # 生成临时工作目录（以 uuid 后缀避免冲突）================================
        work_tag = uuid.uuid4().hex[:8]
        out_dir = os.path.dirname(out_rootfs) or "."
        work_dir = os.path.join(out_dir, f".build-{work_tag}")
        export_tar = os.path.join(out_dir, f".export-{work_tag}.tar")
        container_name = f"smolvm-build-{work_tag}"
        cleanup_cmds = []

        try:
            # 1) docker create 临时容器 =========================================
            self._exec(f"mkdir -p \"{out_dir}\" \"{work_dir}\"", check=False)
            ok, out, err = self._exec(
                f"docker create --name {container_name} {image} /bin/sh", timeout=120)
            if not ok:
                return False, f"docker create 失败: {err}", ""
            cleanup_cmds.append(f"docker rm -f {container_name} >/dev/null 2>&1 || true")

            # 2) docker export ===================================================
            ok, out, err = self._exec(
                f"docker export {container_name} -o \"{export_tar}\"", timeout=600)
            if not ok:
                return False, f"docker export 失败: {err}", ""
            cleanup_cmds.append(f"rm -f \"{export_tar}\"")

            # 3) 解压到 work_dir =================================================
            ok, out, err = self._exec(
                f"tar -xf \"{export_tar}\" -C \"{work_dir}\"", timeout=600)
            if not ok:
                return False, f"解压 rootfs 失败: {err}", ""
            cleanup_cmds.append(f"rm -rf \"{work_dir}\"")

            # 4) 注入 init/SSHD/默认密码 ========================================
            if inject_init:
                self._inject_bootstrap(work_dir, root_pass)

            # 5) 使用 mkfs.ext4 -d 直接构建镜像（需 e2fsprogs >= 1.43）=========
            #    若系统不支持 -d，回退到 mount + cp 方式
            mk_ok, mk_msg = self._mkfs_ext4(work_dir, out_rootfs, size_mb)
            if not mk_ok:
                return False, mk_msg, ""

            logger.success(
                f"[RootFSBuilder] rootfs 构建完成: {out_rootfs} ({size_mb}MB, {image})")
            return True, "ok", out_rootfs

        except Exception as e:
            logger.error(f"[RootFSBuilder] 构建失败: {e}")
            return False, str(e), ""
        finally:
            # 清理临时资源 ======================================================
            for c in cleanup_cmds:
                try:
                    self._exec(c, check=False)
                except Exception:
                    pass

    # 注入启动脚本与密码 ########################################################
    def _inject_bootstrap(self, work_dir: str, root_pass: str):
        # 默认 init 脚本（若镜像无 /sbin/init）===================================
        init_path = os.path.join(work_dir, "sbin/init")
        init_local = os.path.join(work_dir, "init")
        # 若没有 /sbin/init，则写入 /init
        check_cmd = f"test -x \"{init_path}\" && echo YES || echo NO"
        ok, out, _ = self._exec(check_cmd)
        if not (ok and "YES" in out):
            # 把脚本写到 work_dir/init
            try:
                if self.is_remote():
                    # 远端: 通过 here-doc 写文件
                    hd = DEFAULT_INIT_SCRIPT.replace("'", "'\\''")
                    self._exec(
                        f"sh -c 'cat >\"{init_local}\" <<\"EOF_INIT\"\n"
                        f"{DEFAULT_INIT_SCRIPT}\nEOF_INIT\n"
                        f"chmod 0755 \"{init_local}\"'")
                else:
                    with open(init_local, "w", encoding="utf-8", newline="\n") as f:
                        f.write(DEFAULT_INIT_SCRIPT)
                    os.chmod(init_local, 0o755)
            except Exception as e:
                logger.warning(f"[RootFSBuilder] 写入 /init 失败: {e}")

        # 写入 sshd_config（覆盖默认）===========================================
        sshd_conf = os.path.join(work_dir, "etc/ssh/sshd_config")
        try:
            self._exec(f"mkdir -p \"{os.path.dirname(sshd_conf)}\"", check=False)
            if self.is_remote():
                self._exec(
                    f"sh -c 'cat >\"{sshd_conf}\" <<\"EOF_SSHD\"\n"
                    f"{SSHD_SAFE_CONFIG}\nEOF_SSHD'")
            else:
                with open(sshd_conf, "w", encoding="utf-8", newline="\n") as f:
                    f.write(SSHD_SAFE_CONFIG)
        except Exception as e:
            logger.warning(f"[RootFSBuilder] 写入 sshd_config 失败: {e}")

        # 设置 root 密码（写 /etc/shadow）=======================================
        if root_pass:
            # openssl passwd -6 生成 SHA-512 密文（常见 Linux 支持）
            cmd = (f"openssl passwd -6 '{root_pass}' 2>/dev/null || "
                   f"openssl passwd -1 '{root_pass}'")
            ok, out, err = self._exec(cmd)
            hashed = (out or "").strip().splitlines()[-1] if out else ""
            if hashed:
                shadow = os.path.join(work_dir, "etc/shadow")
                # 更新或插入 root 行
                edit_cmd = (
                    f"sh -c 'if [ -f \"{shadow}\" ]; then "
                    f"sed -i -E \"s|^root:[^:]*:|root:{hashed}:|\" \"{shadow}\"; "
                    f"else echo \"root:{hashed}:0:0:99999:7:::\" > \"{shadow}\"; fi'")
                self._exec(edit_cmd, check=False)

        # 允许空密码登录（保底）保证控制台可用 =================================
        try:
            self._exec(f"sed -i -E 's/root:x:/root::/' \"{work_dir}/etc/passwd\" 2>/dev/null || true")
        except Exception:
            pass

    # 生成 ext4 镜像 ############################################################
    def _mkfs_ext4(self, work_dir: str, out_rootfs: str,
                   size_mb: int) -> tuple[bool, str]:
        # 创建稀疏文件 ==========================================================
        ok, out, err = self._exec(
            f"truncate -s {size_mb}M \"{out_rootfs}\"")
        if not ok:
            return False, f"创建镜像文件失败: {err}"

        # 尝试 mkfs.ext4 -d ======================================================
        cmd = f"mkfs.ext4 -F -L rootfs -d \"{work_dir}\" \"{out_rootfs}\""
        ok, out, err = self._exec(cmd, timeout=600)
        if ok:
            return True, "ok"

        logger.warning(f"[RootFSBuilder] mkfs.ext4 -d 不可用，回退到 mount+cp: {err}")

        # 回退：mkfs + mount + cp ==============================================
        mnt = out_rootfs + ".mnt"
        self._exec(f"mkfs.ext4 -F -L rootfs \"{out_rootfs}\"")
        self._exec(f"mkdir -p \"{mnt}\"")
        ok_mnt, _, m_err = self._exec(
            f"mount -o loop \"{out_rootfs}\" \"{mnt}\"")
        if not ok_mnt:
            return False, f"挂载 rootfs 失败: {m_err}"
        try:
            self._exec(f"cp -a \"{work_dir}\"/. \"{mnt}\"/", timeout=1200)
        finally:
            self._exec(f"sync && umount \"{mnt}\" || umount -l \"{mnt}\"")
            self._exec(f"rmdir \"{mnt}\" 2>/dev/null || true")
        return True, "ok"
