# SmolVM 宿主机驱动部署与使用文档

> 适用于 OpenIDCS-Client HostAgent（Python）与 HostAgent-Go（Go）两个工程。
> 驱动参考 [CelestoAI/SmolVM](https://github.com/CelestoAI/SmolVM) 设计理念：
> 基于 **KVM + Firecracker**（或 Cloud-Hypervisor）启动一个最小化内核，
> rootfs 由 **Docker 镜像** 经 `docker export` → `mkfs.ext4` 转换而来，
> 对外呈现为完整 Linux 内核环境（系统调用、cgroup、SSH 等），
> 同时保留接近容器的秒级启动与极低内存开销。

---

## 一、环境依赖

| 组件 | 最低版本 | 说明 |
|------|----------|------|
| Linux 内核 | 5.10+ | 需支持 KVM（`/dev/kvm`） |
| CPU | x86_64 / aarch64 | 开启 VT-x / AMD-V / EL2 |
| Docker Engine | 20.10+ | 构建 rootfs 必需 |
| Firecracker | 1.4+ | 默认 hypervisor |
| e2fsprogs | 1.45+ | 提供 `mkfs.ext4 -d` 一步打包 |
| iproute2 | 任意 | 创建/绑定 tap |
| openssl | 任意 | 生成 shadow 密文 |

### 1.1 一键安装脚本

#### Ubuntu / Debian（apt）

```bash
sudo apt update
sudo apt install -y docker.io e2fsprogs iproute2 openssl curl bridge-utils
sudo modprobe kvm && sudo modprobe kvm_intel   # AMD 用 kvm_amd

# 安装 Firecracker
ARCH=$(uname -m)
FC_VER=1.7.0
curl -fsSL -o firecracker.tgz \
    https://github.com/firecracker-microvm/firecracker/releases/download/v${FC_VER}/firecracker-v${FC_VER}-${ARCH}.tgz
sudo tar -xzf firecracker.tgz -C /usr/local/bin --strip-components=1 \
    release-v${FC_VER}-${ARCH}/firecracker-v${FC_VER}-${ARCH}
sudo mv /usr/local/bin/firecracker-v${FC_VER}-${ARCH} /usr/local/bin/firecracker
sudo chmod +x /usr/local/bin/firecracker
```

#### CentOS / RHEL / Rocky（yum/dnf）

```bash
sudo dnf install -y docker e2fsprogs iproute openssl curl bridge-utils
sudo systemctl enable --now docker
sudo modprobe kvm kvm_intel

# Firecracker 同上（官方未提供 RPM，使用二进制）
```

#### 通用（curl 直接下载）

```bash
# 仅需 Firecracker 二进制
curl -fsSL https://github.com/firecracker-microvm/firecracker/releases/latest/download/firecracker-$(uname -m).tgz \
    -o firecracker.tgz
sudo tar -xzf firecracker.tgz -C /usr/local/bin
```

### 1.2 准备内核镜像

SmolVM 使用一个精简的 Linux 内核。将内核文件放置到 `images_path` 下，
默认名称 `vmlinux-smolvm`（可通过 `hs_config.extend_data["smolvm_kernel"]` 覆盖）。

官方 demo 内核下载：

```bash
sudo mkdir -p /var/lib/smolvm/images
ARCH=$(uname -m)
curl -fsSL https://s3.amazonaws.com/spec.ccfc.min/firecracker-ci/v1.7/${ARCH}/vmlinux-5.10.bin \
    -o /var/lib/smolvm/images/vmlinux-smolvm
sudo chmod 0644 /var/lib/smolvm/images/vmlinux-smolvm
```

### 1.3 验证

```bash
ls -l /dev/kvm                  # crw-rw---- root kvm
firecracker --version           # Firecracker v1.7.0
docker info | head              # Docker 守护进程正常
mkfs.ext4 -V                    # mke2fs 1.45+
```

---

## 二、在 HostAgent 中添加 SmolVM 主机

### 2.1 前端页面

1. 打开 **主机管理** 页面 → **新增主机**。
2. "宿主机类型" 下拉选择 **SmolVM**（`Descript` 为 `SmolVM MicroVM Runtime`）。
3. 根据提示填写字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| `server_name` | 主机名（日志前缀） | `smolvm-01` |
| `server_addr` | 本地填 `localhost`，远程填 `ssh://x.x.x.x` | `ssh://10.0.0.5` |
| `server_user` / `server_pass` | 远程 SSH 账号密码 | `root/xxx` |
| `launch_path` | firecracker 可执行文件所在目录（可留空自动 PATH 查找） | `/usr/local/bin` |
| `images_path` | 内核与离线镜像 tar 目录 | `/var/lib/smolvm/images` |
| `extern_path` | microVM 工作目录（rootfs/vm.json） | `/var/lib/smolvm` |
| `backup_path` | 备份目录 | `/var/lib/smolvm/backup` |
| `network_nat` | 本地 bridge（如 `br0` / `docker0`） | `br0` |
| `ipaddr_maps` | IP 分配规则（同 OCInterface 语义） | 见下文 |

### 2.2 ipaddr_maps 示例

```json
{
  "nat": {
    "type": "nat",
    "from": "172.19.0.10",
    "nums": 240,
    "gate": "172.19.0.1",
    "mask": "255.255.255.0"
  }
}
```

### 2.3 保存后会发生什么？

驱动的 `HSLoader()` 会：

1. 通过 `KVMDetector` 检测 `/dev/kvm`、`firecracker` 可用性（远程通过 SSH）。
2. 将检测结果缓存到 `hs_config.extend_data`（`smolvm_hv`、`smolvm_hv_path`、`smolvm_hv_version` 等）。
3. 创建 `/run/smolvm/`（0700）与 `extern_path/`、`backup_path/`。
4. 初始化 TTY 代理链路（`SSHTerminal` + `HttpManager` + `PortForward`）。

若检测失败会返回对应错误消息（如 "KVM不可用" 或 "未找到 firecracker"）。

---

## 三、创建 microVM 示例

### 3.1 alpine:3.19 最小示例（1C/512M）

通过 HostAgent 的虚拟机创建接口，填入以下关键字段：

```yaml
vm_uuid:   smolvm-alpine-1
os_name:   alpine:3.19       # Docker 镜像名
cpu_num:   1
mem_num:   512               # MiB
hdd_num:   2                 # GiB（rootfs 大小）
os_pass:   RootPass@123
nic_all:
  eth0:
    nic_type: nat
# nat_all 为端口映射（可选）
nat_all:
  - { lan_port: 22, wan_port: 0 }   # wan_port=0 自动分配
```

### 3.2 驱动执行流程

1. `NetCheck`：从 `ipaddr_maps["nat"]` 分配 IP 与网关。
2. `VMSetups`：
   - `docker pull alpine:3.19`
   - `docker create` 临时容器 → `docker export` → tar 解压
   - 注入 `/init` 脚本（挂 `/proc`、`/sys`、`/dev`、启动 `sshd`）、`/etc/ssh/sshd_config`、`/etc/shadow`（SHA-512）
   - `truncate -s 2048M` → `mkfs.ext4 -d <workdir> rootfs.ext4`
3. `IPBinder_MAN`：`ip tuntap add tap-xxx mode tap` → `ip link set tap-xxx master br0`
4. 启动 Firecracker：
   ```
   firecracker --api-sock /run/smolvm/smolvm-alpine-1.sock
   ```
   并把 PID 写入 `/run/smolvm/smolvm-alpine-1.pid`，socket 权限 `0600`。
5. 通过 FC REST API 装配：
   - `PUT /boot-source`（kernel + `console=ttyS0 reboot=k panic=1 pci=off init=/sbin/init ip=dhcp`）
   - `PUT /drives/rootfs`（rootfs.ext4）
   - `PUT /network-interfaces/eth0`（tap 名 + guest MAC）
   - `PUT /machine-config`（vcpu=1，mem_size_mib=512）
   - `PUT /actions {action_type: InstanceStart}`
6. 写入 `extern_path/smolvm-alpine-1/vm.json` 作为元数据。

### 3.3 SSH 登录

通过端口映射（22 → 自动分配的 wan_port，例如 23001）：

```bash
ssh -p 23001 root@<host_public_ip>
# 密码：RootPass@123
```

或打开 Web SSH 控制台（`VMRemote`）：浏览器访问 `http://<public_ip>:<remote_port>/<token>`。

---

## 四、能力矩阵

| 分类 | 方法 | SmolVM 支持 | 备注 |
|------|------|:----------:|------|
| 宿主机 | Crontabs / HSStatus / HSCreate / HSDelete / HSLoader / HSUnload | ✅ | - |
| 生命周期 | VMDetect / VMCreate / VMSetups / VMUpdate / VMDelete / VMPowers / VMPasswd / VMRemote / GetPower | ✅ | cpu/mem 变更需停机 |
| 存储 | HDDMount / ISOMount / RMMounts / HDDCheck / HDDTrans | ❌ | microVM 单 rootfs，不支持动态挂载 |
| 备份 | VMBackup / Restores / LDBackup / RMBackup | ✅ | tar.gz 打包 vm 工作目录 |
| 直通 | PCIShows / PCISetup / USBShows / USBSetup | ❌ | microVM 不支持 PCI/USB 直通 |
| 监控 | 单 VM 指标（CPU/MEM/NET/DISK） | ✅ | 通过 `/proc/<pid>` + `/sys/class/net/tap.../statistics` |
| 截图 | VMScreen | ❌ | 无图形输出 |

---

## 五、目录布局

```
/run/smolvm/                     # socket 与 pid 文件（0700）
  ├── {vm_uuid}.sock            # Firecracker UDS（0600）
  └── {vm_uuid}.pid             # Firecracker 进程 PID
<extern_path>/                   # microVM 工作目录
  └── {vm_uuid}/
        ├── rootfs.ext4         # rootfs 镜像
        ├── fc.log              # Firecracker 输出日志
        └── vm.json             # 虚拟机元数据
<images_path>/
  └── vmlinux-smolvm            # Linux 内核
<backup_path>/
  └── {vm_name}_{timestamp}.tar.gz
```

---

## 六、常见故障排查

| 现象 | 可能原因 | 排查 |
|------|----------|------|
| `HSLoader` 返回 "KVM不可用" | 未加载 kvm / 未开 BIOS 虚拟化 / 当前用户无权限 | `ls -l /dev/kvm`，`lsmod \| grep kvm`，将账户加入 `kvm` 组 |
| `HSLoader` 返回 "未找到 firecracker" | 二进制不在 `launch_path` 或 PATH | `which firecracker`，设置 `launch_path` |
| `VMSetups` 报 `docker pull 失败` | 网络不通 / 无 Docker 权限 | 手动 `docker pull ubuntu:22.04`；远程主机 SSH 用户加入 `docker` 组 |
| `mkfs.ext4 -d` 报不支持选项 | e2fsprogs < 1.43 | 驱动自动回退到 `mount + cp`；如仍失败，升级 e2fsprogs |
| 启动后无网络 | `/init` 未起 DHCP / 镜像未装 `udhcpc` | 给镜像安装 `openssh-server busybox`；或在 `boot_args` 中用静态 `ip=...` |
| SSH 登录密码错误 | shadow 未成功写入 | `mount -o loop rootfs.ext4 /mnt` 检查 `/mnt/etc/shadow` |
| FC 进程启动后立刻退出 | 内核不匹配 / rootfs 缺 `/sbin/init` | 查看 `extern_path/{vm_uuid}/fc.log` |
| 远程主机无法创建 tap | SSH 用户非 root | 使用 `sudo` 或将用户加入对应 capability（CAP_NET_ADMIN）|
| socket 权限问题 | `/run/smolvm` 权限错误 | 驱动会自动 `chmod 0700`；可手动修复 |

---

## 七、与其他平台的差异

- 与 **OCInterface（Docker）**：SmolVM 借用 Docker 镜像但运行在独立内核，
  系统调用隔离更彻底，但启动略慢、占用磁盘更多。
- 与 **QEMU/KVM**：SmolVM 使用极简设备模型（virtio-net + virtio-block），
  启动更快、内存占用更低，代价是无图形、无 PCI/USB 直通。
- 与 **LXC/LXD**：SmolVM 提供真实内核隔离而非共享宿主机内核。

---

## 八、HostAgent-Go 适配

Go 版 HostAgent 在 `internal/driver/smolvm_driver.go` 内提供对等驱动，
通过 `os/exec` 调用 `docker`/`firecracker`，通过 `net.Dial("unix", sock)` 封装
HTTP over UDS 与 FC API 交互。注册表在 `internal/driver/platform_drivers.go`
中以 `"SmolVM"` 键暴露。前端侧通过 `/api/engines` 自动拿到 SmolVM 的元数据。

---

## 九、参考资料

- Firecracker: <https://github.com/firecracker-microvm/firecracker>
- Cloud Hypervisor: <https://www.cloudhypervisor.org>
- Docker to rootfs via mkfs.ext4 -d: <https://ext4.wiki.kernel.org/>
- SmolVM 上游：<https://github.com/CelestoAI/SmolVM>
