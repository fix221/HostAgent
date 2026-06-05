#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cx-Freeze打包脚本 - OpenIDCS Client
使用cx-Freeze将Flask应用打包成独立可执行文件
"""

import sys
import io

# 设置标准输出为 UTF-8 编码，解决 Windows 控制台中文显示问题
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import os
import subprocess
import shutil
from cx_Freeze import setup, Executable

# 项目根目录（提前定义，前端构建需要用到）
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
PROJECT_BASE_DIR = os.path.abspath(os.path.join(PROJECT_ROOT, ".."))

# ============================================================================
# 前端构建（自动构建React前端并复制到static目录）
# ============================================================================

def build_frontend():
    """构建React前端，直接输出到BuildCache/frontend目录"""
    frontend_dir = os.path.join(PROJECT_BASE_DIR, "FrontPages")
    out_dir = os.path.join(PROJECT_BASE_DIR, "BuildCache", "frontend")
    
    if not os.path.isdir(frontend_dir):
        print("[WARN] 前端目录 FrontPages 不存在，跳过前端构建")
        return False
    
    # 检查 node/npm 是否可用
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("[WARN] 未检测到 Node.js，跳过前端构建")
        return False
    
    print("============================================================")
    print("开始构建前端...")
    print("============================================================")
    
    # 清理旧的构建产物
    if os.path.isdir(out_dir):
        print("[INFO] 清理旧的构建产物...")
        shutil.rmtree(out_dir)
    
    # 安装依赖
    print("[INFO] 安装前端依赖 (npm install)...")
    result = subprocess.run(
        ["npm", "install"],
        cwd=frontend_dir,
        shell=(sys.platform == "win32"),
    )
    if result.returncode != 0:
        print("[ERROR] npm install 失败")
        return False
    print("[OK] 前端依赖安装完成")
    
    # 执行 TypeScript 类型检查
    print("[INFO] 执行 TypeScript 类型检查 (tsc)...")
    result = subprocess.run(
        ["npx", "tsc"],
        cwd=frontend_dir,
        shell=(sys.platform == "win32"),
    )
    if result.returncode != 0:
        print("[WARN] TypeScript 类型检查有错误，继续构建...")
    
    # 执行 Vite 构建，直接指定输出目录
    print(f"[INFO] 构建前端 (输出目录: {out_dir})...")
    result = subprocess.run(
        ["npx", "vite", "build", "--outDir", out_dir, "--emptyOutDir"],
        cwd=frontend_dir,
        shell=(sys.platform == "win32"),
    )
    if result.returncode != 0:
        print("[ERROR] 前端构建失败")
        return False
    
    if not os.path.isdir(out_dir):
        print("[ERROR] 前端构建产物目录不存在，构建可能失败")
        return False
    
    print("============================================================")
    print("前端构建完成!")
    print("============================================================")
    print("")
    return True

# 仅在执行 build 命令时触发前端构建
# 如果设置了 SKIP_FRONTEND_BUILD 环境变量，则跳过前端构建（CI 中前端已预先构建）
if "build" in sys.argv:
    if os.environ.get("SKIP_FRONTEND_BUILD"):
        frontend_dir = os.path.join(PROJECT_BASE_DIR, "BuildCache", "frontend")
        if os.path.isdir(frontend_dir):
            print("[INFO] 检测到 SKIP_FRONTEND_BUILD，跳过前端构建（使用预构建产物）")
        else:
            print("[WARN] 设置了 SKIP_FRONTEND_BUILD 但未找到预构建前端产物，尝试构建...")
            build_frontend()
    else:
        build_frontend()

# 项目配置
PROJECT_NAME = "OpenIDCS-Client"
PROJECT_VERSION = "1.0.0"
PROJECT_DESCRIPTION = "OpenIDCS Flask Server - 虚拟机管理平台"
PROJECT_AUTHOR = "OpenIDCS Team"

# 将项目根目录添加到 Python 路径，使 cx_Freeze 能够找到项目模块
# 因为构建脚本在 AllBuilder 目录中运行，但项目模块在根目录
if PROJECT_BASE_DIR not in sys.path:
    sys.path.insert(0, PROJECT_BASE_DIR)

# 调试导入：检查能否正常导入 HostServer.ProxmoxQemu
try:
    print(f"[INFO] 尝试导入 HostServer.ProxmoxQemu (sys.path: {sys.path})")
    import HostServer.ProxmoxQemu
    print("[INFO] 成功导入 HostServer.ProxmoxQemu")
except ImportError as e:
    print(f"[ERROR] 导入 HostServer.ProxmoxQemu 失败: {e}")
    # 不抛出异常，让 cx_Freeze 继续尝试，或者根据需要决定是否终止
    # raise e

# 主脚本
MAIN_SCRIPT = os.path.join(PROJECT_BASE_DIR, "MainServer.py")

# 图标文件
ICON_FILE = os.path.join(PROJECT_BASE_DIR, "HostConfig/HostManage.ico")

# ============================================================================
# 需要包含的包和模块
# ============================================================================

# 核心依赖包（基于 requirements.txt）
PACKAGES = [
    # Web框架
    "flask",
    "werkzeug",
    "jinja2",
    "click",
    "itsdangerous",
    "markupsafe",
    
    # 日志
    "loguru",
    
    # HTTP请求
    "requests",
    "urllib3",
    "certifi",
    "charset_normalizer",
    "idna",
    
    # 系统监控
    "psutil",
    "GPUtil",
    "cpuinfo",
    
    # 压缩工具
    "py7zr",
    
    # 数据库
    "sqlite3",
    
    # 邮件
    "email",
    "smtplib",

    # 认证加密
    "bcrypt",

    # 远程连接
    "proxmoxer",
    "proxmoxer.backends",
    "proxmoxer.backends.https",
    "proxmoxer.backends.ssh_paramiko",
    "proxmoxer.backends.openssh",
    "proxmoxer.backends.local",
    "proxmoxer.backends.command_base",
    "paramiko",
    
    # 标准库（这些通常会自动包含，但显式列出以确保）
    "encodings",  # 必需：Python 编码支持
    "encodings.utf_8",
    "encodings.ascii",
    "encodings.latin_1",
    "encodings.idna",
    "json",
    "threading",
    "traceback",
    "secrets",
    "functools",
    "hashlib",
    "base64",
    "datetime",
    "pathlib",
    "shutil",
    "subprocess",
    "multiprocessing",
    "os",
    "sys",
    "re",
    "time",
    "socket",
    "ssl",
    "collections",
    "io",
    "typing",
    
    # 项目模块
    "HostModule",
    "HostModule.CommandSafe",
    "HostModule.DataManager",
    "HostModule.EmailManager",
    "HostModule.HostManager",
    "HostModule.RestManager",
    "HostModule.UserManager",
    "HostModule.HttpManager",
    "HostModule.NetsManager",
    "HostModule.SSHDManager",
    "HostModule.Translation",
    "HostServer",
    "HostServer.BasicServer",
    "HostServer.ProxmoxQemu",
    "HostServer.LXContainer",
    "HostServer.OCInterface",
    "HostServer.OCInterfaceAPI",
    "HostServer.OCInterfaceAPI.OCIConnects",
    "HostServer.OCInterfaceAPI.PortForward",
    "HostServer.OCInterfaceAPI.IPTablesAPI",
    "HostServer.OCInterfaceAPI.SSHTerminal",
    "HostServer.Workstation",
    "HostServer.WorkstationAPI",
    "HostServer.WorkstationAPI.VMWRestAPI",
    "HostServer.vSphereESXi",
    "HostServer.vSphereESXiAPI",
    "HostServer.vSphereESXiAPI.vSphereAPI",
    "HostServer.Win64HyperV",
    "HostServer.Win64HyperVAPI",
    "HostServer.Win64HyperVAPI.HyperVAPI",
    "HostServer.QEMUService",
    "HostServer.VirtualBoxs",
    "HostServer.MemuAndroid",
    "HostServer.QingzhouYun",
    "HostServer.SmolVM",
    "HostServer.SmolVMAPI",
    "HostServer.SmolVMAPI.FCClient",
    "HostServer.SmolVMAPI.KVMDetector",
    "HostServer.SmolVMAPI.RootFSBuilder",
    "HostServer.VPCTemplate",
    "MainObject",
    "MainObject.Config",
    "MainObject.Config.BootOpts",
    "MainObject.Config.HSConfig",
    "MainObject.Config.IMConfig",
    "MainObject.Config.IPConfig",
    "MainObject.Config.NCConfig",
    "MainObject.Config.OSConfig",
    "MainObject.Config.PortData",
    "MainObject.Config.SDConfig",
    "MainObject.Config.USBInfos",
    "MainObject.Config.UserMask",
    "MainObject.Config.VFConfig",
    "MainObject.Config.VMBackup",
    "MainObject.Config.VMConfig",
    "MainObject.Config.VMPowers",
    "MainObject.Config.WebProxy",
    "MainObject.Config.WebUsers",
    "MainObject.Public",
    "MainObject.Public.HWStatus",
    "MainObject.Public.ZMessage",
    "MainObject.Server",
    "MainObject.Server.HSEngine",
    "MainObject.Server.HSStatus",
    "MainObject.Server.HSTasker",
    "MainObject.Server.VMStatus",
    "VNCConsole",
    "VNCConsole.VNCSManager",
    "Websockify",
    "Websockify.auth_plugins",
]

# 可选包（如果已安装则包含，基于 requirements.txt）
OPTIONAL_PACKAGES = [
    "pyvmomi",    # VMware vSphere 支持
    "pyVim",      # VMware vSphere 连接支持
    "pylxd",      # LXD 容器支持
    "docker",     # Docker 容器支持
    "winrm",      # Windows WinRM 支持（Hyper-V）
    "pywin32",    # Windows API（仅Windows）
    "pythonnet",  # Windows .NET 支持（仅Windows）
]

# 需要排除的包（减小体积）
EXCLUDES = [
    "tkinter",
    "test",
    "unittest",
    "setuptools",
    "pip",
    "wheel",
    "distutils",
    "numpy",
    "pandas",
    "matplotlib",
    "scipy",
    "IPython",
    "jupyter",
    "notebook",
    "pytest",
    "sphinx",
]

# ============================================================================
# 需要包含的数据文件和目录
# ============================================================================

INCLUDE_FILES = [
    # 前端构建产物（从BuildCache/frontend临时目录读取，打包后映射为static目录）
    (os.path.join(PROJECT_BASE_DIR, "BuildCache", "frontend"), "static") if os.path.exists(os.path.join(PROJECT_BASE_DIR, "BuildCache", "frontend")) else None,
    
    # VNC控制台
    (os.path.join(PROJECT_BASE_DIR, "VNCConsole/Sources"), "VNCConsole/Sources"),
    
    # Websockify 二进制文件
    (os.path.join(PROJECT_BASE_DIR, "Websockify/websocketproxy.exe"), "Websockify/websocketproxy.exe"),
    
    # 配置文件和工具
    (os.path.join(PROJECT_BASE_DIR, "HostConfig"), "HostConfig"),
    
    # 数据库初始化脚本
    (os.path.join(PROJECT_BASE_DIR, "HostConfig/HostManage.sql"), "HostConfig/HostManage.sql"),
]

# 过滤掉None值（不存在的文件）
INCLUDE_FILES = [f for f in INCLUDE_FILES if f is not None]

# ============================================================================
# 检查可选包是否已安装
# ============================================================================

def check_package_installed(package_name):
    """检查包是否已安装"""
    try:
        __import__(package_name)
        return True
    except ImportError:
        return False

# 添加已安装的可选包
installed_optional = []
for package in OPTIONAL_PACKAGES:
    if check_package_installed(package):
        PACKAGES.append(package)
        installed_optional.append(package)
        print(f"[INFO] 包含可选包: {package}")

# ============================================================================
# cx-Freeze构建选项
# ============================================================================

build_exe_options = {
    # 包含的包
    "packages": PACKAGES,
    
    # 排除的包
    "excludes": EXCLUDES,
    
    # 包含的文件
    "include_files": INCLUDE_FILES,
    
    # 优化级别（0=无优化，1=基本优化，2=完全优化）
    "optimize": 2,
    
    # 包含所有依赖的DLL
    "include_msvcr": True,
    
    # 构建目录（挪到项目根目录的 BuildCache 下）
    "build_exe": os.path.join(PROJECT_BASE_DIR, "BuildCache", "cxfreeze"),
    
    # 确保 encodings 和资源目录不被压缩到 zip
    "zip_include_packages": "*",
    "zip_exclude_packages": ["encodings", "VNCConsole", "Websockify"],
    
    # 静默模式（不显示警告）
    # "silent": True,
}

# ============================================================================
# 可执行文件配置
# ============================================================================

# Windows平台特定配置
if sys.platform == "win32":
    base = None  # "Win32GUI" 表示无控制台窗口，None 表示有控制台窗口
    
    executables = [
        Executable(
            script=MAIN_SCRIPT,
            base=base,
            target_name=f"{PROJECT_NAME}.exe",
            icon=ICON_FILE if os.path.exists(ICON_FILE) else None,
            # 版权信息
            copyright=f"Copyright (C) 2024 {PROJECT_AUTHOR}",
            # 快捷方式名称
            shortcut_name=PROJECT_NAME,
            # 快捷方式目录
            shortcut_dir="DesktopFolder",
        )
    ]
else:
    # Linux/Mac平台
    executables = [
        Executable(
            script=MAIN_SCRIPT,
            target_name=PROJECT_NAME,
        )
    ]

# ============================================================================
# setup配置
# ============================================================================

setup(
    name=PROJECT_NAME,
    version=PROJECT_VERSION,
    description=PROJECT_DESCRIPTION,
    author=PROJECT_AUTHOR,
    options={
        "build_exe": build_exe_options,
    },
    executables=executables,
)

# ============================================================================
# 后置步骤：确保前端构建产物复制到后端构建输出目录，并打包为单文件
# ============================================================================

if "build" in sys.argv:
    frontend = os.path.join(PROJECT_BASE_DIR, "BuildCache", "frontend")
    target_static = os.path.join(PROJECT_BASE_DIR, "BuildCache", "cxfreeze", "static")
    
    if os.path.isdir(frontend):
        # 如果目标目录已存在则先清理
        if os.path.isdir(target_static):
            shutil.rmtree(target_static)
        
        print("[INFO] 复制前端构建产物到后端输出目录...")
        shutil.copytree(frontend, target_static)
        print(f"[OK] 前端产物已复制到 {target_static}")
    else:
        print("[WARN] 前端构建产物不存在，跳过复制")
    
    # ========================================================================
    # 打包为单文件输出（类似 nuitka --onefile 的效果）
    # ========================================================================
    import zipfile
    import tarfile
    
    cxfreeze_dir = os.path.join(PROJECT_BASE_DIR, "BuildCache", "cxfreeze")
    
    if os.path.isdir(cxfreeze_dir):
        print("")
        print("============================================================")
        print("开始打包为单文件...")
        print("============================================================")
        
        if sys.platform == "win32":
            # Windows: 打包为 zip
            output_file = os.path.join(PROJECT_BASE_DIR, "BuildCache", f"{PROJECT_NAME}-Windows.zip")
            print(f"[INFO] 打包为 ZIP: {output_file}")
            with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for root, dirs, files in os.walk(cxfreeze_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, cxfreeze_dir)
                        zf.write(file_path, arcname)
        elif sys.platform == "darwin":
            # macOS: 打包为 tar.gz
            output_file = os.path.join(PROJECT_BASE_DIR, "BuildCache", f"{PROJECT_NAME}-macOS.tar.gz")
            print(f"[INFO] 打包为 tar.gz: {output_file}")
            with tarfile.open(output_file, "w:gz") as tf:
                for item in os.listdir(cxfreeze_dir):
                    tf.add(os.path.join(cxfreeze_dir, item), arcname=item)
        else:
            # Linux: 打包为 tar.gz
            output_file = os.path.join(PROJECT_BASE_DIR, "BuildCache", f"{PROJECT_NAME}-Linux.tar.gz")
            print(f"[INFO] 打包为 tar.gz: {output_file}")
            with tarfile.open(output_file, "w:gz") as tf:
                for item in os.listdir(cxfreeze_dir):
                    tf.add(os.path.join(cxfreeze_dir, item), arcname=item)
        
        # 计算文件大小
        file_size = os.path.getsize(output_file)
        if file_size > 1024 * 1024:
            size_str = f"{file_size / 1024 / 1024:.1f} MB"
        else:
            size_str = f"{file_size / 1024:.1f} KB"
        
        print(f"[OK] 单文件打包完成: {output_file} ({size_str})")
        print("============================================================")
    else:
        print("[ERROR] cx-Freeze 构建目录不存在，无法打包")

