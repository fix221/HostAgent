#!/bin/bash
# ============================================================================
# OpenIDCS-Client 管理脚本
# 支持: 安装 | 卸载 | 更新 | 启动 | 停止 | 重启 | 状态查看
# 用法: sudo bash setup.sh [install|uninstall|update|start|stop|restart|status]
# ============================================================================
set -e

# ======================== 配置 ========================
DOWNLOAD_URL="https://github.com/OpenIDCSTeam/HostAgent/releases/download/alpha/openidcs-client-pyinst-linux-x64.tar.gz"
INSTALL_DIR="/opt/openidcs"
SERVICE_NAME="openidcs"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
BIN_NAME="OpenIDCS-Client"
TMP_DIR="/tmp/openidcs-setup-$$"
ARCHIVE_NAME="openidcs-client-pyinst-linux-x64.tar.gz"

# ======================== 颜色 ========================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ======================== 工具函数 ========================
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "${CYAN}[STEP]${NC} $*"; }

show_banner() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  OpenIDCS-Client 管理工具 (pyinst-linux-x64)${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo ""
}

# ======================== 检查 ========================
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        error "请使用 root 权限运行此脚本 (sudo bash setup.sh <命令>)"
    fi
}

check_systemd() {
    if ! command -v systemctl &>/dev/null; then
        error "未检测到 systemd，此脚本仅支持 systemd 系统"
    fi
}

# ======================== 安装 ========================
do_install() {
    step "开始安装 OpenIDCS-Client..."

    # 检查是否已安装
    if [ -f "${INSTALL_DIR}/${BIN_NAME}" ]; then
        warn "检测到已有安装，将进行覆盖更新"
        # 停止服务（如果正在运行）
        if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
            systemctl stop "${SERVICE_NAME}"
            info "已停止运行中的服务"
        fi
    fi

    # 创建临时目录
    mkdir -p "${TMP_DIR}"
    trap "rm -rf ${TMP_DIR}" EXIT

    # 下载
    step "下载安装包..."
    info "URL: ${DOWNLOAD_URL}"
    if command -v wget &>/dev/null; then
        wget -q --show-progress -O "${TMP_DIR}/${ARCHIVE_NAME}" "${DOWNLOAD_URL}" || error "下载失败"
    elif command -v curl &>/dev/null; then
        curl -fSL --progress-bar -o "${TMP_DIR}/${ARCHIVE_NAME}" "${DOWNLOAD_URL}" || error "下载失败"
    else
        error "未找到 wget 或 curl，请先安装"
    fi
    info "下载完成"

    # 解压安装
    step "解压并安装文件..."
    mkdir -p "${INSTALL_DIR}"
    tar -xzf "${TMP_DIR}/${ARCHIVE_NAME}" -C "${INSTALL_DIR}" --strip-components=1
    info "文件安装完成"

    # 设置权限
    step "设置权限..."
    chmod +x "${INSTALL_DIR}/${BIN_NAME}" 2>/dev/null || true
    find "${INSTALL_DIR}" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
    info "权限设置完成"

    # 注册 systemd 服务
    step "注册 systemd 服务..."
    cat > "${SERVICE_FILE}" << EOF
[Unit]
Description=OpenIDCS Client - IDC Virtualization Management Platform
Documentation=https://github.com/OpenIDCSTeam/HostAgent
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${BIN_NAME}
Restart=on-failure
RestartSec=10
StartLimitInterval=60
StartLimitBurst=3

Environment=PYTHONUNBUFFERED=1
Environment=LANG=en_US.UTF-8

StandardOutput=journal
StandardError=journal
SyslogIdentifier=openidcs

LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" 2>/dev/null
    info "服务已注册并设为开机自启"

    # 记录安装信息
    cat > "${INSTALL_DIR}/.install_info" << EOF
INSTALL_TYPE=binary
INSTALL_DATE=$(date '+%Y-%m-%d %H:%M:%S')
INSTALL_VERSION=alpha
INSTALL_DIR=${INSTALL_DIR}
EOF

    # 启动服务
    step "启动服务..."
    systemctl start "${SERVICE_NAME}"
    sleep 2
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        info "服务启动成功"
    else
        warn "服务启动可能失败，请检查: systemctl status ${SERVICE_NAME}"
    fi

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✅ 安装完成！${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "  安装目录: ${CYAN}${INSTALL_DIR}${NC}"
    echo -e "  服务名称: ${CYAN}${SERVICE_NAME}${NC}"
    echo -e "  管理命令: ${CYAN}bash setup.sh [start|stop|restart|status]${NC}"
    echo ""
}

# ======================== 卸载 ========================
do_uninstall() {
    step "开始卸载 OpenIDCS-Client..."

    # 停止服务
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        systemctl stop "${SERVICE_NAME}"
        info "服务已停止"
    fi

    # 禁用并删除服务
    if [ -f "${SERVICE_FILE}" ]; then
        systemctl disable "${SERVICE_NAME}" 2>/dev/null || true
        rm -f "${SERVICE_FILE}"
        systemctl daemon-reload
        info "服务已移除"
    fi

    # 删除安装目录
    if [ -d "${INSTALL_DIR}" ]; then
        rm -rf "${INSTALL_DIR}"
        info "安装目录已删除: ${INSTALL_DIR}"
    fi

    echo ""
    echo -e "${GREEN}  ✅ 卸载完成！${NC}"
    echo ""
}

# ======================== 启动 ========================
do_start() {
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        warn "服务已在运行中"
        return
    fi

    if [ ! -f "${SERVICE_FILE}" ]; then
        error "服务未安装，请先执行: sudo bash setup.sh install"
    fi

    systemctl start "${SERVICE_NAME}"
    sleep 1
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        info "服务启动成功"
    else
        error "服务启动失败，请检查: journalctl -u ${SERVICE_NAME} -n 20"
    fi
}

# ======================== 停止 ========================
do_stop() {
    if ! systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        warn "服务未在运行"
        return
    fi

    systemctl stop "${SERVICE_NAME}"
    info "服务已停止"
}

# ======================== 更新 ========================
do_update() {
    if [ ! -d "${INSTALL_DIR}" ] || [ ! -f "${INSTALL_DIR}/${BIN_NAME}" ]; then
        error "未检测到已安装的 OpenIDCS-Client，请先执行: sudo bash setup.sh install"
    fi

    step "开始更新 OpenIDCS-Client..."

    # 创建临时目录
    mkdir -p "${TMP_DIR}"
    trap "rm -rf ${TMP_DIR}" EXIT

    # 下载
    step "下载更新包..."
    info "URL: ${DOWNLOAD_URL}"
    if command -v wget &>/dev/null; then
        wget -q --show-progress -O "${TMP_DIR}/${ARCHIVE_NAME}" "${DOWNLOAD_URL}" || error "下载失败"
    elif command -v curl &>/dev/null; then
        curl -fSL --progress-bar -o "${TMP_DIR}/${ARCHIVE_NAME}" "${DOWNLOAD_URL}" || error "下载失败"
    else
        error "未找到 wget 或 curl，请先安装"
    fi
    info "下载完成"

    # 停止服务
    step "停止服务..."
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        systemctl stop "${SERVICE_NAME}"
        info "服务已停止"
    else
        warn "服务未运行"
    fi

    # 备份当前版本
    step "备份当前版本..."
    BACKUP_NAME="${INSTALL_DIR}.bak.$(date +%Y%m%d%H%M%S)"
    cp -a "${INSTALL_DIR}" "${BACKUP_NAME}"
    info "已备份到: ${BACKUP_NAME}"

    # 解压替换
    step "解压并替换文件..."
    tar -xzf "${TMP_DIR}/${ARCHIVE_NAME}" -C "${INSTALL_DIR}" --strip-components=1
    info "文件替换完成"

    # 设置权限
    chmod +x "${INSTALL_DIR}/${BIN_NAME}" 2>/dev/null || true
    find "${INSTALL_DIR}" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

    # 更新安装信息
    sed -i "s/^INSTALL_DATE=.*/INSTALL_DATE=$(date '+%Y-%m-%d %H:%M:%S')/" "${INSTALL_DIR}/.install_info" 2>/dev/null || true

    # 启动服务
    step "启动服务..."
    systemctl daemon-reload
    systemctl start "${SERVICE_NAME}"
    sleep 2
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        info "服务启动成功"
    else
        warn "服务启动可能失败，请检查: systemctl status ${SERVICE_NAME}"
    fi

    echo ""
    echo -e "${GREEN}  ✅ 更新完成！${NC}"
    echo ""
}

# ======================== 重启 ========================
do_restart() {
    if [ ! -f "${SERVICE_FILE}" ]; then
        error "服务未安装，请先执行: sudo bash setup.sh install"
    fi

    systemctl restart "${SERVICE_NAME}"
    sleep 1
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        info "服务重启成功"
    else
        error "服务重启失败，请检查: journalctl -u ${SERVICE_NAME} -n 20"
    fi
}

# ======================== 状态 ========================
do_status() {
    echo -e "${CYAN}[服务状态]${NC}"
    echo ""

    if [ ! -f "${SERVICE_FILE}" ]; then
        warn "服务未安装"
        return
    fi

    # 显示服务状态
    systemctl status "${SERVICE_NAME}" --no-pager 2>/dev/null || true

    echo ""
    echo -e "${CYAN}[安装信息]${NC}"
    if [ -f "${INSTALL_DIR}/.install_info" ]; then
        cat "${INSTALL_DIR}/.install_info"
    else
        warn "未找到安装信息文件"
    fi
}

# ======================== 帮助 ========================
show_help() {
    show_banner
    echo -e "${CYAN}用法:${NC}"
    echo -e "  sudo bash setup.sh ${GREEN}<命令>${NC}"
    echo ""
    echo -e "${CYAN}可用命令:${NC}"
    echo -e "  ${GREEN}install${NC}     下载并安装，注册为 systemd 服务"
    echo -e "  ${GREEN}uninstall${NC}   停止服务并完全卸载"
    echo -e "  ${GREEN}update${NC}      下载最新版本并替换更新"
    echo -e "  ${GREEN}start${NC}       启动服务"
    echo -e "  ${GREEN}stop${NC}        停止服务"
    echo -e "  ${GREEN}restart${NC}     重启服务"
    echo -e "  ${GREEN}status${NC}      查看服务状态"
    echo -e "  ${GREEN}help${NC}        显示此帮助信息"
    echo ""
}

# ======================== 主入口 ========================
main() {
    show_banner
    check_root
    check_systemd

    case "${1}" in
        install)
            do_install
            ;;
        uninstall|remove)
            do_uninstall
            ;;
        update|upgrade)
            do_update
            ;;
        start)
            do_start
            ;;
        stop)
            do_stop
            ;;
        restart)
            do_restart
            ;;
        status)
            do_status
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            show_help
            ;;
    esac
}

main "$@"
