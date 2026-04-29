import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Button, Space, Tag, Progress, message, Modal, Form, Input, Select, InputNumber,
    Badge, Spin, Alert, Tooltip, Dropdown, Skeleton
} from 'antd'
import type { MenuProps } from 'antd'
import {
    ReloadOutlined, PoweroffOutlined, DesktopOutlined, EyeOutlined, CopyOutlined,
    PlusOutlined, MoreOutlined, PlayCircleOutlined, PauseCircleOutlined,
    EditOutlined, KeyOutlined, DownOutlined, CloudSyncOutlined, DeleteOutlined,
    SettingOutlined, GlobalOutlined, SafetyCertificateOutlined, DatabaseOutlined,
    SwapOutlined, CameraOutlined, HddOutlined, ArrowLeftOutlined, ThunderboltOutlined,
    RightOutlined, LockOutlined, AppstoreOutlined
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import api from '@/utils/apis.ts'
import { VM_PERMISSION, hasPermission } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────
interface VMStatus {
    ac_status: string; mem_total: number; mem_usage: number; hdd_total: number;
    hdd_usage: number; gpu_total: number; gpu_usage: number; cpu_usage: number;
    network_u: number; network_d: number; network_rx?: number; network_tx?: number;
    flu_usage?: number; on_update: number; [key: string]: any
}

interface NATRule {
    id: number; protocol: string; wan_port?: number | string; lan_port?: number | string;
    lan_addr?: string; nat_tips?: string;
}

interface BackupInfo {
    backup_name: string; backup_path?: string; created_time: string;
    backup_time?: number; backup_hint?: string;
}

interface HostConfig {
    system_maps: any[]; images_maps?: any[]; server_type?: string;
    enable_host?: boolean; ipaddr_maps?: Record<string, any>
}

// ─── Utility ────────────────────────────────────────────────────────────
const formatMem = (mb: number) => {
    if (!mb) return '0 MB'
    if (mb < 1024) return `${mb} MB`
    if (mb < 1024 * 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${(mb / 1024 / 1024).toFixed(1)} TB`
}

const formatSpeed = (mbps: number) => {
    if (!mbps) return '0 KBps'
    if (mbps < 1) return `${(mbps * 1024).toFixed(0)} KBps`
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
    return `${mbps.toFixed(0)} Mbps`
}

// ─── Gauge Ring Component ───────────────────────────────────────────────
function GaugeRing({ percent, color, size = 100, label, subLabel }: {
    percent: number; color: string; size?: number; label: string; subLabel?: string
}) {
    const radius = (size - 12) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (Math.min(percent, 100) / 100) * circumference
    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                    stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                    stroke={color} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize={size * 0.22} fontWeight="700">
                    {percent > 999 ? `${(percent / 1000).toFixed(0)}k` : Math.round(percent)}
                </text>
                {percent <= 100 && (
                    <text x="50%" y="68%" textAnchor="middle" dominantBaseline="central"
                        fill="rgba(255,255,255,0.4)" fontSize={size * 0.11}>%</text>
                )}
            </svg>
            <div className="text-center">
                <div className="text-xs font-semibold" style={{ color }}>{label}</div>
                {subLabel && <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{subLabel}</div>}
            </div>
        </div>
    )
}

// ─── Card Wrapper ───────────────────────────────────────────────────────
function DashCard({ title, extra, children, className = '', style }: {
    title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode;
    className?: string; style?: React.CSSProperties
}) {
    return (
        <div className={`rounded-xl border border-white/[0.06] ${className}`}
            style={{
                background: 'linear-gradient(145deg, rgba(20,24,36,0.95) 0%, rgba(15,18,28,0.98) 100%)',
                backdropFilter: 'blur(20px)', ...style
            }}>
            {(title || extra) && (
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                    <span className="text-sm font-semibold text-white/90">{title}</span>
                    {extra && <span>{extra}</span>}
                </div>
            )}
            <div className="p-5">{children}</div>
        </div>
    )
}

// ─── Sidebar Nav Item ───────────────────────────────────────────────────
function NavItem({ icon, label, active, badge, onClick }: {
    icon: React.ReactNode; label: string; active?: boolean; badge?: string; onClick?: () => void
}) {
    return (
        <div
            onClick={onClick}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-all duration-200 group ${active
                ? 'bg-gradient-to-r from-blue-600/30 to-blue-500/10 border border-blue-500/30'
                : 'hover:bg-white/[0.04] border border-transparent'
                }`}
        >
            <span className={`text-base ${active ? 'text-blue-400' : 'text-white/40 group-hover:text-white/60'}`}>
                {icon}
            </span>
            <span className={`text-sm flex-1 ${active ? 'text-white font-medium' : 'text-white/50 group-hover:text-white/70'}`}>
                {label}
            </span>
            {badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
                    {badge}
                </span>
            )}
            {active && <RightOutlined className="text-[10px] text-blue-400" />}
        </div>
    )
}

// ─── Login Card ─────────────────────────────────────────────────────────
function LoginMethodCard({ icon, title, badge, desc, buttonText, onClick, disabled }: {
    icon: React.ReactNode; title: string; badge?: { text: string; color: string };
    desc: string; buttonText: string; onClick?: () => void; disabled?: boolean
}) {
    return (
        <div className="rounded-xl p-4 border border-white/[0.06] flex flex-col gap-3"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2">
                <span className="text-2xl">{icon}</span>
                <span className="text-sm font-semibold text-white/90">{title}</span>
                {badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: badge.color + '20', color: badge.color }}>
                        {badge.text}
                    </span>
                )}
            </div>
            <p className="text-xs text-white/40 leading-relaxed m-0">{desc}</p>
            <Button type={badge?.text === '推荐' ? 'primary' : 'default'} size="small" block
                onClick={onClick} disabled={disabled}
                style={badge?.text === '推荐' ? {
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    border: 'none', fontWeight: 600
                } : {
                    background: 'rgba(255,255,255,0.06)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)'
                }}>
                {buttonText}
            </Button>
        </div>
    )
}

// ─── Quick Stat Card ────────────────────────────────────────────────────
function QuickStatCard({ icon, title, count, total, color, onClick }: {
    icon: React.ReactNode; title: string; count: number; total: number;
    color: string; onClick?: () => void
}) {
    return (
        <div className="rounded-xl p-4 border border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-all group"
            style={{ background: `linear-gradient(145deg, ${color}08, ${color}04)` }}
            onClick={onClick}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span style={{ color }} className="text-lg">{icon}</span>
                    <span className="text-sm font-semibold text-white/80">{title}</span>
                </div>
                <RightOutlined className="text-[10px] text-white/20 group-hover:text-white/40 transition-colors" />
            </div>
            <div className="flex items-baseline gap-1 mb-2">
                <span className="text-xs text-white/40">数量: </span>
                <span className="text-sm font-bold text-white/90">{count}/{total}</span>
            </div>
            <Progress percent={total > 0 ? Math.round(count / total * 100) : 0}
                size="small" showInfo={false} strokeColor={color}
                trailColor="rgba(255,255,255,0.06)" />
        </div>
    )
}

// ═════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════
export default function DockDetailV2() {
    const { hostName, uuid } = useParams<{ hostName: string; uuid: string }>()
    const navigate = useNavigate()

    const [vm, setVM] = useState<any>(null)
    const vmRef = useRef<any>(null)
    const [loading, setLoading] = useState(true)
    const [activeSection, setActiveSection] = useState('panel')
    const [hostConfig, setHostConfig] = useState<HostConfig | null>(null)
    const hostConfigRef = useRef<HostConfig | null>(null)
    const [hostEnabled, setHostEnabled] = useState(true)
    const [userPermissions, setUserPermissions] = useState(VM_PERMISSION.FULL_MASK)
    const [showPassword, setShowPassword] = useState(false)
    const [showVncPassword, setShowVncPassword] = useState(false)
    const [natRules, setNatRules] = useState<NATRule[]>([])
    const [backups, setBackups] = useState<BackupInfo[]>([])
    const [vmScreenshot, setVmScreenshot] = useState('')
    const [operationLocked, setOperationLocked] = useState(false)
    const [tempStatus, setTempStatus] = useState<string | null>(null)

    const [currentStatus, setCurrentStatus] = useState<VMStatus>({
        ac_status: 'UNKNOWN', mem_total: 0, mem_usage: 0, hdd_total: 0, hdd_usage: 0,
        gpu_total: 0, gpu_usage: 0, cpu_usage: 0, network_u: 0, network_d: 0, on_update: 0
    })

    // ── Data Loading ────────────────────────────────────────────────────
    const loadHostInfo = useCallback(async () => {
        if (!hostName) return
        try {
            const result = await api.getOSImages(hostName)
            if (result.code === 200) {
                const config = result.data as unknown as HostConfig
                setHostConfig(config)
                hostConfigRef.current = config
                setHostEnabled(config.enable_host !== false)
            }
        } catch (e) { console.error('加载主机配置失败', e) }
    }, [hostName])

    const loadVMDetail = useCallback(async (isPolling = false) => {
        if (!hostName || !uuid) return
        try {
            if (!isPolling && !vm) setLoading(true)
            const [detailRes, statusRes] = await Promise.all([
                api.getVMDetail(hostName, uuid), api.getVMStatus(hostName, uuid)
            ])
            if (detailRes.data) {
                const vmData = detailRes.data as any
                if (statusRes.data) {
                    if (statusRes.data.power_status && statusRes.data.history) {
                        vmData.status = Array.isArray(statusRes.data.history) ? statusRes.data.history : []
                        if (vmData.status.length === 0 || vmData.status[vmData.status.length - 1]?.ac_status !== statusRes.data.power_status) {
                            vmData.status.push({
                                ac_status: statusRes.data.power_status, mem_total: 0, mem_usage: 0,
                                hdd_total: 0, hdd_usage: 0, gpu_total: 0, gpu_usage: 0, cpu_usage: 0,
                                network_u: 0, network_d: 0, on_update: Date.now() / 1000
                            })
                        }
                    } else {
                        vmData.status = Array.isArray(statusRes.data) ? statusRes.data : [statusRes.data]
                    }
                }
                if (!vmData.ipv4_address || vmData.ipv4_address === '-') {
                    if (vmData.config?.nic_all) {
                        const firstNic: any = Object.values(vmData.config.nic_all)[0]
                        if (firstNic) vmData.ipv4_address = firstNic.ip4_addr
                    }
                }
                setVM(vmData)
                vmRef.current = vmData
                if (typeof (detailRes.data as any).user_permissions === 'number')
                    setUserPermissions((detailRes.data as any).user_permissions)
            }
        } catch (e: any) {
            if (!isPolling) message.error(e?.message || '加载失败')
        } finally {
            if (!isPolling) setLoading(false)
        }
    }, [hostName, uuid])

    const loadNATRules = useCallback(async () => {
        if (!hostName || !uuid) return
        try {
            const r = await api.getNATRules(hostName, uuid)
            if (r.data) setNatRules(Array.isArray(r.data) ? r.data as unknown as NATRule[] : [])
        } catch (e) { }
    }, [hostName, uuid])

    const loadBackups = useCallback(async () => {
        if (!hostName || !uuid) return
        try {
            const r = await api.getVMBackups(hostName, uuid)
            if (r.data) {
                const d = r.data as any
                if (Array.isArray(d)) setBackups(d)
                else if (Array.isArray(d.backups)) setBackups(d.backups)
                else if (d.config && Array.isArray(d.config.backups)) setBackups(d.config.backups)
                else setBackups([])
            } else setBackups([])
        } catch (e) { setBackups([]) }
    }, [hostName, uuid])

    const loadScreenshot = useCallback(async () => {
        if (!hostName || !uuid || !vmRef.current) return
        const st = hostConfigRef.current?.server_type || ''
        if (st === 'OCInterface' || st === 'LxContainer') return
        const latest = vmRef.current.status?.length > 0 ? vmRef.current.status[vmRef.current.status.length - 1] : null
        if (latest?.ac_status === 'STARTED') {
            try {
                const r = await api.getVMScreenshot(hostName, uuid)
                if (r.data?.screenshot) setVmScreenshot(`data:image/png;base64,${r.data.screenshot}`)
            } catch { }
        }
    }, [hostName, uuid])

    // ── Effects ─────────────────────────────────────────────────────────
    useEffect(() => {
        loadHostInfo(); loadVMDetail(); loadNATRules(); loadBackups()
        const interval = setInterval(() => { loadVMDetail(true); loadScreenshot() }, 10000)
        return () => clearInterval(interval)
    }, [hostName, uuid])

    useEffect(() => {
        if (vm?.status?.length > 0) setCurrentStatus(vm.status[vm.status.length - 1])
    }, [vm])

    useEffect(() => {
        if (currentStatus.ac_status === 'STARTED') loadScreenshot()
    }, [currentStatus.ac_status])

    // ── Computed ────────────────────────────────────────────────────────
    const config = vm?.config || {}
    const displayStatus = tempStatus || currentStatus.ac_status

    const cpuPercent = currentStatus.cpu_usage || 0
    const memPercent = config.mem_num > 0 ? Math.round((currentStatus.mem_usage || 0) / config.mem_num * 100) : 0
    const netLoad = (currentStatus.network_u || 0) + (currentStatus.network_d || 0)

    const getOSDisplayName = (osName: string) => {
        if (!hostConfig?.system_maps) return osName
        const list: any[] = Array.isArray(hostConfig.system_maps) ? hostConfig.system_maps
            : Object.entries(hostConfig.system_maps as any).map(([name, val]: [string, any]) =>
                Array.isArray(val) ? { sys_name: name, sys_file: val[0] } :
                    (val && typeof val === 'object' ? { sys_name: name, ...val } : { sys_name: name, sys_file: val }))
        for (const it of list) { if (it?.sys_file === osName) return it.sys_name || osName }
        return osName
    }

    const statusText: Record<string, string> = {
        STARTED: '运行中', STOPPED: '已停止', SUSPEND: '已暂停', UNKNOWN: '未知',
        ON_OPEN: '启动中', ON_STOP: '关机中', ON_SAVE: '暂停中', ON_WAKE: '唤醒中'
    }
    const statusColor: Record<string, string> = {
        STARTED: '#10b981', STOPPED: '#6b7280', SUSPEND: '#f59e0b', UNKNOWN: '#6b7280',
        ON_OPEN: '#3b82f6', ON_STOP: '#3b82f6', ON_SAVE: '#3b82f6', ON_WAKE: '#3b82f6'
    }

    const expiryDate = config.exp_time
        ? new Date(config.exp_time * 1000).toISOString().split('T')[0]
        : '永不过期'
    const daysLeft = config.exp_time
        ? Math.max(0, Math.ceil((config.exp_time * 1000 - Date.now()) / 86400000))
        : 999

    // ── Handlers ────────────────────────────────────────────────────────
    const handlePowerAction = async (action: string) => {
        if (!hostName || !uuid || !hostEnabled) return
        const actionNames: any = {
            start: '启动', stop: '关机', hard_stop: '强制关机', reset: '重启',
            hard_reset: '强制重启', pause: '暂停', resume: '恢复'
        }
        Modal.confirm({
            title: `${actionNames[action]}确认`,
            content: `确定要执行${actionNames[action]}操作吗？`,
            okText: '确认', cancelText: '取消',
            onOk: async () => {
                try {
                    await api.vmPower(hostName, uuid, action as any)
                    message.success(`${actionNames[action]}操作已执行`)
                    setTimeout(() => loadVMDetail(), 2000)
                } catch (e: any) { message.error(e?.message || '操作失败') }
            }
        })
    }

    const handleOpenVNC = async () => {
        if (!hostName || !uuid || !hostEnabled) return
        const hide = message.loading('获取控制台地址...', 0)
        try {
            const r = await api.getVMConsole(hostName, uuid)
            hide()
            const url = r.data?.console_url || (typeof r.data === 'string' ? r.data : null)
            if (url?.startsWith('http')) window.open(url, '_blank')
            else message.error('获取控制台地址无效')
        } catch { hide(); message.error('连接失败') }
    }

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text || '')
        message.success(`${label}已复制`)
    }

    const goOldPage = () => navigate(`/hosts/${hostName}/vms/${uuid}`)

    // ── Sidebar sections ────────────────────────────────────────────────
    const sidebarSections = [
        { key: 'panel', icon: <AppstoreOutlined />, label: '面板' },
        { key: 'system', icon: <DesktopOutlined />, label: '系统' },
        { key: 'monitor', icon: <DatabaseOutlined />, label: '监控' },
        { key: 'sysadmin', icon: <SettingOutlined />, label: '系统管理' },
        { key: 'vnc', icon: <DesktopOutlined />, label: 'VNC' },
        { key: 'data', icon: <HddOutlined />, label: '数据' },
        { key: 'snapshot', icon: <CameraOutlined />, label: '快照' },
        { key: 'backup', icon: <DatabaseOutlined />, label: '备份' },
        { key: 'network', icon: <GlobalOutlined />, label: '网络' },
        { key: 'nat', icon: <SwapOutlined />, label: '端口映射' },
        { key: 'policy', icon: <SafetyCertificateOutlined />, label: '策略' },
    ]

    // ── Power Menu ──────────────────────────────────────────────────────
    const powerMenuItems: MenuProps['items'] = [
        { key: 'start', label: '启动', icon: <PlayCircleOutlined />, disabled: displayStatus === 'STARTED' },
        { key: 'stop', label: '关机', icon: <PoweroffOutlined />, disabled: displayStatus !== 'STARTED', danger: true },
        { key: 'reset', label: '重启', icon: <ReloadOutlined />, disabled: displayStatus !== 'STARTED' },
        { key: 'hard_stop', label: '强制关机', icon: <PoweroffOutlined />, danger: true },
        { key: 'hard_reset', label: '强制重启', icon: <ReloadOutlined />, danger: true },
    ]

    // ── Loading State ───────────────────────────────────────────────────
    if (loading || !vm) return (
        <div className="flex items-center justify-center" style={{ height: '80vh' }}>
            <Spin size="large"><div className="mt-4 text-white/40">加载虚拟机详情...</div></Spin>
        </div>
    )

    // ═════════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════════
    return (
        <div className="flex h-full" style={{ minHeight: 'calc(100vh - 130px)', color: '#e6e9ef' }}>
            {/* ─── Left Sidebar ───────────────────────────────────────── */}
            <div className="w-[180px] flex-shrink-0 flex flex-col border-r border-white/[0.06] py-4 px-2 gap-1"
                style={{ background: 'rgba(10,12,20,0.6)' }}>
                <div className="px-3 mb-3">
                    <div className="flex items-center gap-2 text-white/80 text-sm font-bold">
                        <ThunderboltOutlined className="text-blue-400" />
                        <span>云管理系统</span>
                    </div>
                </div>
                {sidebarSections.map(s => (
                    <NavItem key={s.key} icon={s.icon} label={s.label}
                        active={activeSection === s.key}
                        onClick={() => setActiveSection(s.key)} />
                ))}
                <div className="flex-1" />
                <NavItem icon={<ArrowLeftOutlined />} label="退出" onClick={() => navigate(-1)} />
            </div>

            {/* ─── Main Content ───────────────────────────────────────── */}
            <div className="flex-1 overflow-auto p-6" style={{ background: 'transparent' }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <ThunderboltOutlined className="text-2xl text-blue-400" />
                            <span className="text-2xl font-bold text-white">{config.vm_uuid || uuid}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: statusColor[displayStatus] || '#6b7280' }} />
                            <span className="text-sm" style={{ color: statusColor[displayStatus] || '#6b7280' }}>
                                {statusText[displayStatus] || displayStatus}
                            </span>
                        </div>
                        <span className="text-sm text-white/40">{hostConfig?.server_type || 'Hyper-V'}</span>
                        <span className="text-sm text-white/40">
                            IPv4 | {vm.ipv4_address || '未分配'}
                            <CopyOutlined className="ml-1 cursor-pointer text-white/30 hover:text-white/60"
                                onClick={() => handleCopy(vm.ipv4_address || '', 'IPv4')} />
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="primary" icon={<DesktopOutlined />}
                            onClick={handleOpenVNC}
                            disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)}
                            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}>
                            辅助远程
                        </Button>
                        <Button icon={<SettingOutlined />}
                            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }}>
                            系统管理
                        </Button>
                        <Button icon={<SwapOutlined />}
                            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }}>
                            端口映射
                        </Button>
                        <Button icon={<GlobalOutlined />}
                            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }}>
                            网络信息
                        </Button>
                        <Button danger onClick={goOldPage}
                            style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
                            经典版
                        </Button>
                        <Dropdown menu={{ items: [{ key: 'reinstall', label: '重装系统', danger: true }] }}>
                            <Button icon={<MoreOutlined />}
                                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }} />
                        </Dropdown>
                    </div>
                </div>

                {!hostEnabled && (
                    <Alert message="主机已被禁用" description="该主机已被管理员禁用，所有操作均已被禁止。"
                        type="warning" showIcon closable className="mb-4" />
                )}

                {/* Grid Layout */}
                <div className="grid grid-cols-12 gap-4">
                    {/* ─── Instance Status ─────────────────────────── */}
                    <div className="col-span-7">
                        <DashCard title={<span>实例状态 &nbsp;<span className="inline-block w-2 h-2 rounded-full" style={{ background: statusColor[displayStatus] || '#6b7280' }} /> <span className="text-xs ml-1" style={{ color: statusColor[displayStatus] }}>{statusText[displayStatus] || displayStatus}</span></span>}>
                            <div className="flex gap-6">
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-white/40 w-16">区域线路</span>
                                        <span className="text-sm text-white/80">{hostName} | {hostConfig?.server_type || 'CUVIP 优化'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-white/40 w-16">操作系统</span>
                                        <span className="text-sm text-white/80">{getOSDisplayName(config.os_name || '')}</span>
                                        <Tag color="blue" className="m-0 text-[10px]" style={{ background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)' }}>重装</Tag>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-white/40 w-16">配置</span>
                                        <div className="flex gap-2">
                                            <Tag style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }}>{config.cpu_num || 0}核</Tag>
                                            <Tag style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }}>{formatMem(config.mem_num || 0)}内存</Tag>
                                            <Tag style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }}>{formatMem(config.hdd_num || 0)}存储</Tag>
                                            <Tag style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: '#e6e9ef' }}>{config.speed_u || 0}Mbps</Tag>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-white/40 w-16">系统密码</span>
                                        {hasPermission(userPermissions, VM_PERMISSION.PWD_EDITS) ? (
                                            <span className="text-sm font-mono text-white/80">
                                                {showPassword ? config.os_pass : '••••••••••'}
                                                <EyeOutlined className="ml-2 cursor-pointer text-white/30 hover:text-white/60"
                                                    onClick={() => setShowPassword(!showPassword)} />
                                            </span>
                                        ) : <span className="text-white/30">无权限</span>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-white/40 w-16">到期时间</span>
                                        <span className="text-sm text-white/80">{expiryDate}</span>
                                        <span className="text-xs px-1.5 py-0.5 rounded"
                                            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                                            (还有 {daysLeft} 天到期)
                                        </span>
                                    </div>
                                </div>
                                {/* Screenshot / Illustration */}
                                <div className="w-[200px] h-[160px] rounded-lg overflow-hidden flex items-center justify-center"
                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    {vmScreenshot ? (
                                        <img src={vmScreenshot} alt="VM" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-center">
                                            <DesktopOutlined style={{ fontSize: 40, color: 'rgba(59,130,246,0.4)' }} />
                                            <div className="text-[10px] text-white/20 mt-2">
                                                {displayStatus === 'STARTED' ? '获取截图中...' : '虚拟机未运行'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </DashCard>
                    </div>

                    {/* ─── Realtime Resources ──────────────────────── */}
                    <div className="col-span-5">
                        <DashCard title="实时资源" extra={
                            <span className="text-[10px] text-white/30 cursor-pointer hover:text-white/50"
                                onClick={() => loadVMDetail(true)}>
                                实时更新 <ReloadOutlined />
                            </span>
                        }>
                            <div className="flex items-center justify-around">
                                <GaugeRing percent={cpuPercent} color="#3b82f6" size={90}
                                    label="CPU 占用" subLabel={`规格 ${config.cpu_num || 0} 核`} />
                                <GaugeRing percent={memPercent} color="#f59e0b" size={90}
                                    label="内存占用" subLabel={`规格 ${formatMem(config.mem_num || 0)}`} />
                                <GaugeRing percent={netLoad > 100 ? 100 : netLoad} color="#10b981" size={90}
                                    label="网络负载" subLabel={`峰值 ${formatSpeed(netLoad)}`} />
                            </div>
                        </DashCard>
                    </div>

                    {/* ─── Remote Login ────────────────────────────── */}
                    <div className="col-span-7">
                        <DashCard title="远程登录" extra={
                            <span className="text-[10px] text-blue-400 cursor-pointer">查看更多方式 &gt;</span>
                        }>
                            <div className="grid grid-cols-3 gap-3">
                                <LoginMethodCard icon={<DesktopOutlined style={{ color: '#3b82f6' }} />}
                                    title="网页登录" badge={{ text: '推荐', color: '#3b82f6' }}
                                    desc="通过网页直达远程控制台，无需本地客户端，适合快速查看和临时处理。"
                                    buttonText="登录" onClick={handleOpenVNC}
                                    disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)} />
                                <LoginMethodCard icon={<DesktopOutlined style={{ color: '#8b5cf6' }} />}
                                    title="本地 RDP"
                                    desc="下载 RDP 文件并打开以直接登录，适合长期使用本地客户端的场景。"
                                    buttonText="登录" onClick={() => handleCopy(`${vm.ipv4_address}:3389`, 'RDP地址')} />
                                <LoginMethodCard icon={<GlobalOutlined style={{ color: '#10b981' }} />}
                                    title="Web VNC" badge={{ text: '可用', color: '#10b981' }}
                                    desc="使用 Web VNC 登录服务器，当系统无法正常登录时可用于图形数据与故障排查。"
                                    buttonText="登录" onClick={handleOpenVNC}
                                    disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)} />
                            </div>
                        </DashCard>
                    </div>

                    {/* ─── Account Info ────────────────────────────── */}
                    <div className="col-span-5">
                        <DashCard title="账户信息" extra={
                            <span className="text-[10px] text-blue-400 cursor-pointer"
                                onClick={() => message.info('登录凭据已复制')}>登录凭据</span>
                        }>
                            <div className="space-y-3">
                                {[
                                    { label: '系统类型', value: getOSDisplayName(config.os_name || '') },
                                    { label: '远程地址', value: `${vm.ipv4_address || '-'}:3389`, copy: true },
                                    { label: '系统用户', value: config.os_name?.toLowerCase().includes('windows') ? 'Administrator' : 'root', copy: true },
                                    { label: '系统密码', value: config.os_pass, hidden: !showPassword, copy: true, toggle: () => setShowPassword(!showPassword) },
                                    { label: '面板密码', value: config.vc_pass, hidden: !showVncPassword, copy: true, toggle: () => setShowVncPassword(!showVncPassword) },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span className="text-xs text-white/40">{item.label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono text-white/80">
                                                {item.hidden !== undefined ? (item.hidden ? '••••••••••••' : item.value) : (item.value || '-')}
                                            </span>
                                            {item.toggle && (
                                                <EyeOutlined className="cursor-pointer text-white/30 hover:text-white/60"
                                                    onClick={item.toggle} />
                                            )}
                                            {item.copy && (
                                                <CopyOutlined className="cursor-pointer text-white/30 hover:text-white/60"
                                                    onClick={() => handleCopy(item.value || '', item.label)} />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </DashCard>
                    </div>

                    {/* ─── Quick Stats Row ─────────────────────────── */}
                    <div className="col-span-3">
                        <QuickStatCard icon={<SwapOutlined />} title="端口映射" color="#3b82f6"
                            count={config.nat_all ? Object.keys(config.nat_all).length : 0}
                            total={config.nat_num || 0}
                            onClick={() => setActiveSection('nat')} />
                    </div>
                    <div className="col-span-3">
                        <QuickStatCard icon={<CameraOutlined />} title="快照" color="#8b5cf6"
                            count={config.iso_all ? Object.keys(config.iso_all).length : 0}
                            total={config.iso_num || 3}
                            onClick={() => setActiveSection('snapshot')} />
                    </div>
                    <div className="col-span-3">
                        <QuickStatCard icon={<DatabaseOutlined />} title="备份" color="#f59e0b"
                            count={backups.length}
                            total={config.bak_num || 5}
                            onClick={() => setActiveSection('backup')} />
                    </div>
                    <div className="col-span-3">
                        <QuickStatCard icon={<SafetyCertificateOutlined />} title="安全策略" color="#10b981"
                            count={config.pci_all ? Object.keys(config.pci_all).length : 0}
                            total={4}
                            onClick={() => setActiveSection('policy')} />
                    </div>
                </div>
            </div>
        </div>
    )
}
