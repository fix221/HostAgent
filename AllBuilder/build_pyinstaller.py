#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PyInstaller打包脚本 - OpenIDCS Client
使用PyInstaller将Flask应用打包成单个可执行二进制文件（--onefile）
"""

import os
import sys
import subprocess
import shutil

# 设置控制台编码（Windows）
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 项目配置
PROJECT_NAME = "OpenIDCS-Client"
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAIN_SCRIPT = os.path.join(PROJECT_ROOT, "MainServer.py")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "BuildCache", "pyinstaller")
ICON_FILE = os.path.join(PROJECT_ROOT, "HostConfig/HostManage.ico")

# 前端构建产物目录（BuildCache/frontend -> static）
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "BuildCache", "frontend")

# 需要包含的数据目录
DATA_DIRS = [
    ("VNCConsole/Sources", "VNCConsole/Sources"),
    ("HostConfig", "HostConfig"),
]

# 需要包含的数据文件
DATA_FILES = [
    ("HostConfig/HostManage.sql", "HostConfig"),
]

# 需要包含的Python包（隐式导入）
HIDDEN_IMPORTS = [
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
    
    # 远程连接
    "proxmoxer",
    "proxmoxer.backends",
    "proxmoxer.backends.https",
    "proxmoxer.backends.ssh_paramiko",
    "proxmoxer.backends.openssh",
    "proxmoxer.backends.local",
    "proxmoxer.backends.command_base",
    "paramiko",
    
    # 认证加密
    "bcrypt",
    
    # 编码支持
    "encodings",
    "encodings.utf_8",
    "encodings.ascii",
    "encodings.latin_1",
    "encodings.idna",
    
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

# 可选包（如果已安装则包含）
OPTIONAL_PACKAGES = [
    "pythonnet",  # Windows .NET 支持
    "pyvmomi",    # VMware vSphere 支持
    "pyVim",      # VMware vSphere 连接支持
    "pylxd",      # LXD 容器支持
    "docker",     # Docker 容器支持
    "winrm",      # Windows WinRM 远程管理
]

# 需要排除的包（减小体积）
# 注意: 不要排除 setuptools、distutils、pip、wheel，PyInstaller 内部 hook 依赖它们
EXCLUDE_PACKAGES = [
    "tkinter",
    "test",
    "unittest",
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


def check_package_installed(package_name):
    """检查包是否已安装"""
    try:
        __import__(package_name)
        return True
    except ImportError:
        return False


def get_installed_packages():
    """获取已安装的可选包列表"""
    installed = []
    for package in OPTIONAL_PACKAGES:
        if check_package_installed(package):
            installed.append(package)
    return installed


def build_frontend():
    """构建React前端，直接输出到BuildCache/frontend目录"""
    frontend_dir = os.path.join(PROJECT_ROOT, "FrontPages")
    out_dir = FRONTEND_DIR
    
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
    
    # 执行 Vite 构建
    print(f"[INFO] 构建前端 (输出目录: {out_dir})...")
    result = subprocess.run(
        ["npx", "vite", "build", "--outDir", out_dir, "--emptyOutDir"],
        cwd=frontend_dir,
        shell=(sys.platform == "win32"),
    )
    if result.returncode != 0:
        print("[ERROR] 前端构建失败")
        return False
    
    print("============================================================")
    print("前端构建完成!")
    print("============================================================")
    print("")
    return True


def build_pyinstaller_command():
    """构建PyInstaller命令行参数"""
    
    # 获取已安装的可选包
    installed_optional = get_installed_packages()
    all_hidden_imports = HIDDEN_IMPORTS + installed_optional
    
    print("包含的隐式导入:")
    print(f"  核心模块: {len(HIDDEN_IMPORTS)} 个")
    
    if installed_optional:
        print(f"  可选包: {len(installed_optional)} 个")
        for pkg in installed_optional:
            print(f"    - {pkg} [已安装]")
    
    skipped = [pkg for pkg in OPTIONAL_PACKAGES if pkg not in installed_optional]
    if skipped:
        print(f"  跳过的包（未安装）: {len(skipped)} 个")
        for pkg in skipped:
            print(f"    - {pkg} (未安装)")
    print()
    
    # 确定输出文件名
    if sys.platform == "win32":
        output_name = PROJECT_NAME
    else:
        output_name = PROJECT_NAME
    
    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--onefile",           # 单文件模式（生成单个可执行二进制）
        "--clean",             # 清理临时文件
        "--noconfirm",         # 不确认覆盖
        f"--name={output_name}",
        f"--distpath={OUTPUT_DIR}",
        f"--workpath={os.path.join(PROJECT_ROOT, 'BuildCache', 'pyinstaller_work')}",
        f"--specpath={os.path.join(PROJECT_ROOT, 'BuildCache')}",
        "--console",           # 控制台模式（显示日志）
    ]
    
    # 图标（仅Windows）
    if sys.platform == "win32" and os.path.exists(ICON_FILE):
        cmd.append(f"--icon={ICON_FILE}")
    
    # 添加隐式导入
    for module in all_hidden_imports:
        cmd.append(f"--hidden-import={module}")
    
    # 添加排除包
    for package in EXCLUDE_PACKAGES:
        cmd.append(f"--exclude-module={package}")
    
    # 添加数据目录
    for src_dir, dest_dir in DATA_DIRS:
        full_path = os.path.join(PROJECT_ROOT, src_dir)
        if os.path.exists(full_path):
            # PyInstaller 格式: source:dest（Windows用;分隔，其他用:分隔）
            sep = ";" if sys.platform == "win32" else ":"
            cmd.append(f"--add-data={full_path}{sep}{dest_dir}")
    
    # 添加前端构建产物（BuildCache/frontend -> static）
    if os.path.isdir(FRONTEND_DIR):
        sep = ";" if sys.platform == "win32" else ":"
        cmd.append(f"--add-data={FRONTEND_DIR}{sep}static")
        print(f"[OK] 包含前端产物: {FRONTEND_DIR} -> static")
    else:
        print("[WARN] 前端构建产物不存在，打包将不包含前端")
    
    # 添加数据文件
    for src_file, dest_dir in DATA_FILES:
        full_path = os.path.join(PROJECT_ROOT, src_file)
        if os.path.exists(full_path):
            sep = ";" if sys.platform == "win32" else ":"
            cmd.append(f"--add-data={full_path}{sep}{dest_dir}")
    
    # 添加项目路径
    cmd.append(f"--paths={PROJECT_ROOT}")
    
    # 主脚本
    cmd.append(MAIN_SCRIPT)
    
    return cmd


def check_pyinstaller_installed():
    """检查PyInstaller是否已安装"""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "PyInstaller", "--version"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"[OK] PyInstaller已安装: {result.stdout.strip()}")
            return True
        else:
            print("[ERROR] PyInstaller未安装")
            return False
    except Exception as e:
        print(f"[ERROR] 检查PyInstaller时出错: {e}")
        return False


def install_pyinstaller():
    """安装PyInstaller"""
    print("正在安装PyInstaller...")
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-U", "pyinstaller"],
            check=True
        )
        print("[OK] PyInstaller安装成功")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] PyInstaller安装失败: {e}")
        return False


def clean_build_dir():
    """清理构建目录"""
    for d in [OUTPUT_DIR, os.path.join(PROJECT_ROOT, "BuildCache", "pyinstaller_work")]:
        if os.path.exists(d):
            print(f"清理构建目录: {d}")
            shutil.rmtree(d)


def main():
    """主函数"""
    print("=" * 60)
    print(f"OpenIDCS Client - PyInstaller 单文件打包工具")
    print("=" * 60)
    print()
    print(f"项目根目录: {PROJECT_ROOT}")
    print(f"输出目录: {OUTPUT_DIR}")
    print()
    
    # 切换到项目根目录
    os.chdir(PROJECT_ROOT)
    
    # 检查主脚本是否存在
    if not os.path.exists(MAIN_SCRIPT):
        print(f"[ERROR] 错误: 找不到主脚本 {MAIN_SCRIPT}")
        sys.exit(1)
    
    # 检查PyInstaller
    if not check_pyinstaller_installed():
        # CI环境自动安装
        if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
            if not install_pyinstaller():
                sys.exit(1)
        else:
            response = input("是否安装PyInstaller? (y/n): ")
            if response.lower() == 'y':
                if not install_pyinstaller():
                    sys.exit(1)
            else:
                print("取消打包")
                sys.exit(1)
    
    # 构建前端（如果未设置跳过）
    if os.environ.get("SKIP_FRONTEND_BUILD"):
        if os.path.isdir(FRONTEND_DIR):
            print("[INFO] 检测到 SKIP_FRONTEND_BUILD，跳过前端构建（使用预构建产物）")
        else:
            print("[WARN] 设置了 SKIP_FRONTEND_BUILD 但未找到预构建前端产物，尝试构建...")
            build_frontend()
    else:
        build_frontend()
    
    # 清理旧的构建
    clean_build_dir()
    
    # 构建命令
    cmd = build_pyinstaller_command()
    
    print()
    print("=" * 60)
    print("开始打包（单文件模式）...")
    print("=" * 60)
    print()
    print("执行命令:")
    print(" ".join(cmd))
    print()
    
    # 执行打包
    try:
        result = subprocess.run(cmd)
        print()
        if result.returncode == 0:
            # 检查输出文件
            if sys.platform == "win32":
                output_file = os.path.join(OUTPUT_DIR, f"{PROJECT_NAME}.exe")
            else:
                output_file = os.path.join(OUTPUT_DIR, PROJECT_NAME)
            
            if os.path.exists(output_file):
                file_size = os.path.getsize(output_file)
                if file_size > 1024 * 1024:
                    size_str = f"{file_size / 1024 / 1024:.1f} MB"
                else:
                    size_str = f"{file_size / 1024:.1f} KB"
                
                print("=" * 60)
                print("[SUCCESS] 打包成功!")
                print(f"输出文件: {output_file}")
                print(f"文件大小: {size_str}")
                print("=" * 60)
            else:
                print("=" * 60)
                print("[ERROR] 打包似乎成功但找不到输出文件")
                print(f"期望路径: {output_file}")
                print("=" * 60)
                sys.exit(1)
        else:
            print("=" * 60)
            print(f"[ERROR] 打包失败，退出码: {result.returncode}")
            print("请查看上方的详细错误信息")
            print("=" * 60)
            sys.exit(1)
    except KeyboardInterrupt:
        print()
        print("打包已取消")
        sys.exit(1)


if __name__ == "__main__":
    main()
