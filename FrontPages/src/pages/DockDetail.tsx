import {useEffect, useState, useMemo, useRef} from 'react'
import {useParams, useNavigate} from 'react-router-dom'
import {
    Card,
    Tabs,
    Button,
    Space,
    Tag,
    Progress,
    message,
    Modal,
    Form,
    Input,
    Select,
    InputNumber,
    Breadcrumb,
    Row,
    Col,
    Descriptions,
    Badge,
    Spin,
    Alert,
    Checkbox,
    Dropdown,
    MenuProps,
    Radio,
    Tooltip,
    Divider,
    Segmented,
    Table
} from 'antd'
import {
    HomeOutlined,
    ReloadOutlined,
    PoweroffOutlined,
    DeleteOutlined,
    DesktopOutlined,
    EyeOutlined,
    CopyOutlined,
    PlusOutlined,
    UsergroupAddOutlined,
    MoreOutlined,
    WindowsOutlined,
    AppleOutlined,
    CodeOutlined,
    CloudSyncOutlined,
    AreaChartOutlined,
    HddOutlined,
    GlobalOutlined,
    SafetyCertificateOutlined,
    PlayCircleOutlined,
    PauseCircleOutlined,
    EditOutlined,
    KeyOutlined,
    DownOutlined,
    AppstoreOutlined,
    UnorderedListOutlined
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import api from '@/utils/apis.ts'
import { useUserStore } from '@/utils/data'
import { startTaskWithNotification, getTaskList } from '@/utils/taskPoller'
import {VM_PERMISSION, hasPermission, TAB_PERMISSION_MAP, VM_PERMISSION_LABELS, PERMISSION_FIELD_MASK, HIDDEN_TABS, OWNER_ONLY_TABS, getTabQuota} from '@/types'

interface VGConfig {
    gpu_uuid: string
    gpu_mdev: string
    gpu_hint: string
}

/**
 * 虚拟机详情数据接口
 */
interface DockDetail {
    vm_uuid: string
    vm_name: string
    os_name: string
    os_pass: string
    vnc_pass: string
    status: any[]
    cpu_num: number
    mem_num: number
    hdd_num: number
    pci_all?: Record<string, VGConfig>
    gpu_mem?: number // 显存大小
    speed_up: number
    speed_down: number
    nat_num: number
    web_num: number
    flu_num: number // 流量限制
    traffic: number
    ipv4_address?: string
    ipv6_address?: string
    public_address?: string
    cpu_usage?: number
    mem_usage?: number
    hdd_usage?: number
    gpu_usage?: number
    net_usage?: number
    nat_usage?: number
    web_usage?: number
    traffic_usage?: number
    config?: any
}

interface VMStatus {
    ac_status: string
    mem_total: number
    mem_usage: number
    hdd_total: number
    hdd_usage: number
    gpu_total: number
    gpu_usage: number
    cpu_usage: number
    network_u: number
    network_d: number
    network_rx?: number
    network_tx?: number
    flu_usage?: number
    ext_usage?: Record<string, [number, number]>
    on_update: number

    [key: string]: any
}


interface NATRule {
    id: number
    protocol: string
    public_port: number
    private_port: number
    internal_ip?: string
    description?: string
    // 老前端字段名兼容
    wan_port?: number | string
    lan_port?: number | string
    lan_addr?: string
    nat_tips?: string
}

interface IPAddress {
    nic_name: string
    ip_address: string
    ip6_address?: string
    ip_type: string
    subnet_mask?: string
    gateway?: string
}

interface ProxyRule {
    id?: number
    domain: string
    backend_port: number
    ssl_enabled: boolean
    backend_ip?: string
    description?: string
}

interface HDDInfo {
    hdd_index?: number
    hdd_num: number
    hdd_path: string
    hdd_type?: number
    hdd_flag?: number
    hdd_size?: number
}

interface ISOInfo {
    iso_index?: number
    iso_path?: string
    iso_name?: string
    iso_file?: string
    iso_hint?: string
    iso_key?: string
}

interface BackupInfo {
    backup_index?: number
    backup_name: string
    backup_path?: string
    created_time: string
    size?: string
    backup_time?: number
    backup_hint?: string
}

interface OwnerInfo {
    username: string
    role: string
    is_admin?: boolean
    email?: string
    permission?: number
}

interface OSConfigItem {
    sys_name: string
    sys_file: string
    sys_size: string
    sys_type: string
    sys_flag?: boolean
}

interface HostConfig {
    system_maps: OSConfigItem[]
    images_maps?: OSConfigItem[]
    tab_lock?: string[]
    server_type?: string
    enable_host?: boolean
    ipaddr_maps?: Record<string, any>
    ipaddr_ddns?: string[]
    public_addr?: string[]
}

function VMDetail() {
    const {hostName, uuid} = useParams<{ hostName: string; uuid: string }>()
    const navigate = useNavigate()
    const { user } = useUserStore()

    // 状态管理
    const [vm, setVM] = useState<DockDetail | null>(null)
    const vmRef = useRef<DockDetail | null>(null)
    const hostConfigRef = useRef<HostConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('overview')
    const [showPassword, setShowPassword] = useState(false)
    const [showVncPassword, setShowVncPassword] = useState(false)
    const [natRules, setNatRules] = useState<NATRule[]>([])
    const [ipAddresses, setIpAddresses] = useState<IPAddress[]>([])
    const [proxyRules, setProxyRules] = useState<ProxyRule[]>([])
    const [timeRange, setTimeRange] = useState(30) // 默认30分钟
    const [chartView, setChartView] = useState<'performance' | 'resource' | 'network'>('performance') // 默认性能视图
    const [monitorData, setMonitorData] = useState<any>({
        cpu: [], memory: [], disk: [], gpu: [], netUp: [], netDown: [], traffic: [], nat: [], proxy: [], labels: []
    })
    const [hostConfig, setHostConfig] = useState<HostConfig | null>(null)
    const [hostEnabled, setHostEnabled] = useState<boolean>(true) // 主机是否启用
    // 用ref跟踪最新hostConfig，避免setInterval闭包读到陈旧值
    const [userPermissions, setUserPermissions] = useState<number>(VM_PERMISSION.FULL_MASK) // 当前用户权限掩码

    // 模态框状态
    const [editModalVisible, setEditModalVisible] = useState(false)
    const [passwordModalVisible, setPasswordModalVisible] = useState(false)
    const [passwordActionType, setPasswordActionType] = useState<'os_password' | 'vnc_password' | 'vnc_port'>('os_password')
    const [randomVncPort, setRandomVncPort] = useState<number>(Math.floor(Math.random() * 1000) + 6000)
    const [vncPortConfirmChecked, setVncPortConfirmChecked] = useState(false)
    const [natModalVisible, setNatModalVisible] = useState(false)
    const [natViewMode, setNatViewMode] = useState<'card' | 'table'>('card')
    const [nicViewMode, setNicViewMode] = useState<'card' | 'table'>('card')
    const [hddViewMode, setHddViewMode] = useState<'card' | 'table'>('card')
    const [isoViewMode, setIsoViewMode] = useState<'card' | 'table'>('card')
    const [proxyViewMode, setProxyViewMode] = useState<'card' | 'table'>('card')
    const [pciViewMode, setPciViewMode] = useState<'card' | 'table'>('card')
    const [usbViewMode, setUsbViewMode] = useState<'card' | 'table'>('card')
    const [backupViewMode, setBackupViewMode] = useState<'card' | 'table'>('card')
    const [efiViewMode, setEfiViewMode] = useState<'card' | 'table'>('card')
    const [ownerViewMode, setOwnerViewMode] = useState<'card' | 'table'>('card')
    const [ipModalVisible, setIpModalVisible] = useState(false)
    const [proxyModalVisible, setProxyModalVisible] = useState(false)
    const [gpuModalVisible, setGpuModalVisible] = useState(false)
    const [hddModalVisible, setHddModalVisible] = useState(false)
    const [isoModalVisible, setIsoModalVisible] = useState(false)
    const [backupModalVisible, setBackupModalVisible] = useState(false)
    const [ownerModalVisible, setOwnerModalVisible] = useState(false)
    const [reinstallModalVisible, setReinstallModalVisible] = useState(false)
    const [transferHddModalVisible, setTransferHddModalVisible] = useState(false)
    const [transferOwnershipModalVisible, setTransferOwnershipModalVisible] = useState(false)
    const [mountHddModalVisible, setMountHddModalVisible] = useState(false)
    const [editPermModalVisible, setEditPermModalVisible] = useState(false)
    const [editPermOwner, setEditPermOwner] = useState('')
    const [editPermMask, setEditPermMask] = useState<number>(VM_PERMISSION.FULL_MASK)
    const [unmountHddModalVisible, setUnmountHddModalVisible] = useState(false)
    const [remoteModalVisible, setRemoteModalVisible] = useState(false) // 远程桌面模态框

    const [ipQuota, setIpQuota] = useState<any>(null)
    const [hdds, setHdds] = useState<HDDInfo[]>([])
    const [currentTransferHdd, setCurrentTransferHdd] = useState<HDDInfo | null>(null)
    const [currentMountHdd, setCurrentMountHdd] = useState<HDDInfo | null>(null)
    const [currentUnmountHdd, setCurrentUnmountHdd] = useState<HDDInfo | null>(null)
    const [transferTargetUuid, setTransferTargetUuid] = useState('')
    const [transferOwnerUsername, setTransferOwnerUsername] = useState('')
    const [transferOwnerConfirmChecked, setTransferOwnerConfirmChecked] = useState(false)
    const [keepAccessChecked, setKeepAccessChecked] = useState(false)

    const [saveConfirmModalVisible, setSaveConfirmModalVisible] = useState(false)
    const [saveConfirmChecked, setSaveConfirmChecked] = useState(false)
    const [pendingEditValues, setPendingEditValues] = useState<any>(null)

    // 通用确认动作状态
    const [actionConfirmModalVisible, setActionConfirmModalVisible] = useState(false)
    const [currentAction, setCurrentAction] = useState<{
        title: string;
        content: string;
        onConfirm: (confirmInput?: string) => Promise<void>;
        requireShutdown?: boolean;
        confirmChecked?: boolean;
        requireInput?: boolean;
        confirmInput?: string;
        expectedInput?: string;
    } | null>(null)

    const [isos, setIsos] = useState<ISOInfo[]>([])
    const [backups, setBackups] = useState<BackupInfo[]>([])
    const [owners, setOwners] = useState<OwnerInfo[]>([])

    const [form] = Form.useForm()
    const [ipForm] = Form.useForm()
    const [proxyForm] = Form.useForm()
    const [hddForm] = Form.useForm()
    const [isoForm] = Form.useForm()
    const [ownerForm] = Form.useForm()
    const [reinstallForm] = Form.useForm()
    const [backupForm] = Form.useForm()
    const [editVmForm] = Form.useForm()

    const [editNicList, setEditNicList] = useState<any[]>([])
    
    // USB State
    const [usbList, setUsbList] = useState<any[]>([])
    const [usbModalVisible, setUsbModalVisible] = useState(false)
    const [usbActionLoading, setUsbActionLoading] = useState(false)

    // PCI/USB 设备列表State（直通选择用）
    const [pciDeviceList, setPciDeviceList] = useState<Record<string, any>>({})
    const [usbDeviceList, setUsbDeviceList] = useState<Record<string, any>>({})
    const [pciListLoading, setPciListLoading] = useState(false)
    const [usbListLoading, setUsbListLoading] = useState(false)
    const [selectedPciKey, setSelectedPciKey] = useState<string>('')
    const [selectedUsbKey, setSelectedUsbKey] = useState<string>('')
    const [pciShutdownConfirmVisible, setPciShutdownConfirmVisible] = useState(false)
    const [pciShutdownConfirmChecked, setPciShutdownConfirmChecked] = useState(false)
    const [addPciConfirmChecked, setAddPciConfirmChecked] = useState(false)
    const [pendingPciAction, setPendingPciAction] = useState<(() => Promise<void>) | null>(null)
    const [addHddConfirmChecked, setAddHddConfirmChecked] = useState(false)
    const [usbShutdownConfirmChecked, setUsbShutdownConfirmChecked] = useState(false)

    // EFI State
    const [efiList, setEfiList] = useState<{efi_type: boolean; efi_name: string}[]>([])
    const [efiEditing, setEfiEditing] = useState(false)
    const [efiEditList, setEfiEditList] = useState<{efi_type: boolean; efi_name: string}[]>([])
    const [efiLoading, setEfiLoading] = useState(false)
    const [efiActionLoading, setEfiActionLoading] = useState(false)

    // 当前用户是否为管理员（跳过权限和配额检查）
    const [isAdminUser, setIsAdminUser] = useState(false)
    // 当前用户是否为主所有者或管理员（用于控制owners tab可见性）
    const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false)

    // New Confirmation States
    const [isoMountConfirmChecked, setIsoMountConfirmChecked] = useState(false)
    const [unmountIsoConfirmVisible, setUnmountIsoConfirmVisible] = useState(false)
    const [currentUnmountIso, setCurrentUnmountIso] = useState<string>('')
    const [unmountIsoConfirmChecked, setUnmountIsoConfirmChecked] = useState(false)

    const [unmountHddConfirmChecked, setUnmountHddConfirmChecked] = useState(false)
    const [mountHddConfirmChecked, setMountHddConfirmChecked] = useState(false)
    const [transferHddConfirmChecked, setTransferHddConfirmChecked] = useState(false)

    const [backupCreateConfirmChecked, setBackupCreateConfirmChecked] = useState(false)
    const [restoreConfirmChecked1, setRestoreConfirmChecked1] = useState(false)
    const [restoreConfirmChecked2, setRestoreConfirmChecked2] = useState(false)
    const [currentRestoreBackup, setCurrentRestoreBackup] = useState<string>('')
    const [restoreBackupModalVisible, setRestoreBackupModalVisible] = useState(false)

    const [reinstallConfirmChecked, setReinstallConfirmChecked] = useState(false)

    // Loading States
    const [isoActionLoading, setIsoActionLoading] = useState(false)
    const [hddActionLoading, setHddActionLoading] = useState(false)
    const [backupActionLoading, setBackupActionLoading] = useState(false)
    const [ownerActionLoading, setOwnerActionLoading] = useState(false)
    const [reinstallActionLoading, setReinstallActionLoading] = useState(false)
    // 端口转发和反向代理操作加载状态
    const [natActionLoading, setNatActionLoading] = useState(false)
    const [proxyActionLoading, setProxyActionLoading] = useState(false)
    const [gpuActionLoading, setGpuActionLoading] = useState(false)
    // 截图状态
    const [vmScreenshot, setVmScreenshot] = useState<string>('')
    const [loadingScreenshot, setLoadingScreenshot] = useState<boolean>(false)
    const [screenshotError, setScreenshotError] = useState<boolean>(false)
    const isFirstScreenshotLoadRef = useRef<boolean>(true)

    // 当前虚拟机状态 - 用于避免使用未初始化的变量
    const [currentStatus, setCurrentStatus] = useState<VMStatus>({
        ac_status: 'UNKNOWN',
        mem_total: 0,
        mem_usage: 0,
        hdd_total: 0,
        hdd_usage: 0,
        gpu_total: 0,
        gpu_usage: 0,
        cpu_usage: 0,
        network_u: 0,
        network_d: 0,
        ext_usage: {},
        on_update: 0
    })

    // 临时状态管理 - 用于显示操作中的状态
    const [tempStatus, setTempStatus] = useState<string | null>(null)
    
    // 操作锁定状态 - 执行操作时禁用所有按钮
    const [operationLocked, setOperationLocked] = useState<boolean>(false)
const [operationTimeoutId, setOperationTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null)

    // 异步任务提交包装：自动锁定操作，任务完成/失败后解锁
    const submitAsyncTask = (
        result: { code: number; msg?: string; data?: { task_id?: string } },
        taskLabel: string,
        options: { onCompleted?: () => void; onFailed?: () => void } = {}
    ) => {
        setOperationLocked(true)
        startTaskWithNotification(result, taskLabel, {
            onCompleted: (_task) => {
                setOperationLocked(false)
                options.onCompleted?.()
            },
            onFailed: (_task) => {
                setOperationLocked(false)
                options.onFailed?.()
            },
        })
    }

    // 页面加载时检查当前虚拟机是否有正在执行的异步任务
    const checkRunningTasks = async () => {
        if (!uuid) return
        try {
            const taskList = await getTaskList({ vm_uuid: uuid, status: 'running', page: 1, page_size: 1 })
            if (taskList && taskList.items && taskList.items.length > 0) {
                const runningTask = taskList.items[0]
                setOperationLocked(true)
                // 启动轮询跟踪该任务
                startTaskWithNotification(
                    { code: 200, data: { task_id: runningTask.task_id } },
                    runningTask.task_type ? (runningTask.task_type.replace(/_/g, ' ')) : '异步任务',
                    {
                        onCompleted: () => { setOperationLocked(false); loadVMDetail() },
                        onFailed: () => { setOperationLocked(false); loadVMDetail() },
                    }
                )
            } else {
                // 再检查pending状态
                const pendingList = await getTaskList({ vm_uuid: uuid, status: 'pending', page: 1, page_size: 1 })
                if (pendingList && pendingList.items && pendingList.items.length > 0) {
                    const pendingTask = pendingList.items[0]
                    setOperationLocked(true)
                    startTaskWithNotification(
                        { code: 200, data: { task_id: pendingTask.task_id } },
                        pendingTask.task_type ? (pendingTask.task_type.replace(/_/g, ' ')) : '异步任务',
                        {
                            onCompleted: () => { setOperationLocked(false); loadVMDetail() },
                            onFailed: () => { setOperationLocked(false); loadVMDetail() },
                        }
                    )
                }
            }
        } catch (e) {
            // 检查失败不影响页面正常使用
        }
    }

    // 计算所有可用的IP地址
    const availableIPs = useMemo(() => {
        if (!vm || !vm.config || typeof vm.config !== 'object') return []
        const ipList: string[] = []

        // 优先从网卡配置获取确定的IP
        if (vm.config.nic_all) {
            Object.values(vm.config.nic_all).forEach((nic: any) => {
                if (nic.ip4_addr && nic.ip4_addr !== '-' && nic.ip4_addr !== '0.0.0.0') ipList.push(nic.ip4_addr)
                if (nic.ip6_addr && nic.ip6_addr !== '-' && nic.ip6_addr !== '::') ipList.push(nic.ip6_addr)
            })
        }

        // 补充ip_all
        if (vm.config.ip_all && Array.isArray(vm.config.ip_all)) {
            vm.config.ip_all.forEach((ip: any) => {
                if (ip.address) ipList.push(ip.address)
            })
        }

        return Array.from(new Set(ipList))
    }, [vm])

    // 获取OS图标
    const getOSIcon = (osName: string) => {
        const name = (osName || '').toLowerCase()
        const iconStyle = {fontSize: '60px', marginRight: '0px'}
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

        if (name.includes('windows')) return <WindowsOutlined style={{...iconStyle, color: '#1890ff'}}/>
        if (name.includes('macos')) return <AppleOutlined style={{...iconStyle, color: isDark ? '#ffffff' : '#000000'}}/>
        if (name.includes('ubuntu')) return <span className="anticon" style={{...iconStyle, color: '#E95420'}}><i
            className="fab fa-ubuntu"></i><CodeOutlined/></span>
        if (name.includes('centos')) return <span className="anticon"
                                                  style={{...iconStyle, color: isDark ? '#7B7FFF' : '#262577'}}><CodeOutlined/></span>
        if (name.includes('debian')) return <span className="anticon"
                                                  style={{...iconStyle, color: isDark ? '#FF6B8A' : '#A81D33'}}><CodeOutlined/></span>
        if (name.includes('fedora')) return <span className="anticon"
                                                  style={{...iconStyle, color: isDark ? '#6B9FFF' : '#294172'}}><CodeOutlined/></span>
        if (name.includes('linux')) return <span className="anticon"
                                                 style={{...iconStyle, color: isDark ? '#999' : '#333'}}><DesktopOutlined/></span>

        return <DesktopOutlined style={{...iconStyle, color: isDark ? '#999' : undefined}}/>
    }

    // 获取操作系统显示名称
    const getOSDisplayName = (osName: string) => {
        if (!hostConfig || !hostConfig.system_maps) return osName;
        const list: any[] = Array.isArray(hostConfig.system_maps)
            ? hostConfig.system_maps
            : Object.entries(hostConfig.system_maps as any).map(([name, val]: [string, any]) => (
                Array.isArray(val)
                    ? { sys_name: name, sys_file: val[0] }
                    : (val && typeof val === 'object' ? { sys_name: name, ...val } : { sys_name: name, sys_file: val })
            ));
        for (const it of list) {
            if (it && it.sys_file === osName) {
                return it.sys_name || osName;
            }
        }
        return osName;
    }

    // 加载数据
    const loadHostInfo = async () => {
        if (!hostName) return
        try {
            // 加载主机配置（含enable_host等用户态必要字段）
            const result = await api.getOSImages(hostName)
            if (result.code === 200) {
                const config = result.data as unknown as HostConfig
                setHostConfig(config)
                hostConfigRef.current = config
                // 从同一接口获取主机启用状态
                const enabled = config.enable_host !== false
                setHostEnabled(enabled)
            }
        } catch (error: any) {
            console.error('加载主机配置失败:', error)
            // 主机不存在时不显示错误消息，避免重复提示
        }
    }

    // 获取虚拟机截图
    const loadVMScreenshot = async () => {
        const currentVm = vmRef.current
        if (!hostName || !uuid || !currentVm) return

        const serverType = (hostConfigRef.current ?? hostConfig)?.server_type || '';
        if (serverType === 'OCInterface' || serverType === 'LxContainer') return;

        // 直接从vm对象获取最新状态，而不是依赖currentStatus
        const latestStatus = currentVm.status && currentVm.status.length > 0 ? currentVm.status[currentVm.status.length - 1] : null;
        if (latestStatus && latestStatus.ac_status === 'STARTED') {
            // 只在首次加载时显示加载状态
            if (isFirstScreenshotLoadRef.current) {
                setLoadingScreenshot(true);
            }
            setScreenshotError(false);
            try {
                const response = await api.getVMScreenshot(hostName, uuid);
                if (response.data && response.data.screenshot) {
                    setVmScreenshot(`data:image/png;base64,${response.data.screenshot}`);
                    setScreenshotError(false);
                } else {
                    setScreenshotError(true);
                    setVmScreenshot('');
                }
            } catch (error) {
                console.error('获取截图失败:', error);
                setScreenshotError(true);
                setVmScreenshot('');
            } finally {
                if (isFirstScreenshotLoadRef.current) {
                    setLoadingScreenshot(false);
                    isFirstScreenshotLoadRef.current = false;
                }
            }
        }
    }

    const loadVMDetail = async (isPolling = false) => {
        if (!hostName || !uuid) return
        try {
            // 不显示全屏loading，只在首次加载显示
            if (!isPolling && !vm) setLoading(true)

            const [detailRes, statusRes] = await Promise.all([
                api.getVMDetail(hostName, uuid),
                api.getVMStatus(hostName, uuid)
            ])

            if (detailRes.data) {
                const vmData = detailRes.data as unknown as DockDetail
                if (statusRes.data) {
                    // 新API返回格式: {power_status: "STARTED", history: [...]}
                    if (statusRes.data.power_status && statusRes.data.history) {
                        // 使用历史数据作为status数组
                        vmData.status = Array.isArray(statusRes.data.history) ? statusRes.data.history : []
                        // 如果历史数据为空或最新状态与power_status不一致，添加当前电源状态
                        if (vmData.status.length === 0 || vmData.status[vmData.status.length - 1]?.ac_status !== statusRes.data.power_status) {
                            vmData.status.push({
                                ac_status: statusRes.data.power_status,
                                mem_total: 0,
                                mem_usage: 0,
                                hdd_total: 0,
                                hdd_usage: 0,
                                gpu_total: 0,
                                gpu_usage: 0,
                                cpu_usage: 0,
                                network_u: 0,
                                network_d: 0,
                                ext_usage: {},
                                on_update: Date.now() / 1000
                            })
                        }
                    } else {
                        // 兼容旧API格式
                        const statusData = Array.isArray(statusRes.data) ? statusRes.data : [statusRes.data]
                        vmData.status = statusData
                    }
                }

                // 修正IPv4显示
                if (!vmData.ipv4_address || vmData.ipv4_address === '-') {
                    if (vmData.config?.nic_all) {
                        const firstNic: any = Object.values(vmData.config.nic_all)[0]
                        if (firstNic) vmData.ipv4_address = firstNic.ip4_addr
                    }
                }

                // Load USB List
                if (vmData.config && vmData.config.usb_all) {
                    setUsbList(Object.entries(vmData.config.usb_all).map(([key, value]: [string, any]) => ({
                        key: key,
                        ...value
                    })))
                } else {
                    setUsbList([])
                }

                setVM(vmData)
                vmRef.current = vmData

                // 获取用户权限掩码
                if (detailRes.data && typeof (detailRes.data as any).user_permissions === 'number') {
                    setUserPermissions((detailRes.data as any).user_permissions)
                }

                // 判断当前用户是否为主所有者或管理员（用于控制owners tab可见性）
                const isAdmin = !!(detailRes.data as any)?.is_admin
                const ownerList = vmData.config?.own_all || {}
                const currentUsername = (detailRes.data as any)?.current_user || ''
                const ownerNames = Object.keys(ownerList)
                const isFirst = ownerNames.length > 0 && ownerNames[0] === currentUsername
                setIsAdminUser(isAdmin)
                setIsOwnerOrAdmin(isAdmin || isFirst)
            }
        } catch (error: any) {
            console.error('加载虚拟机详情失败:', error)
            if (!isPolling) {
                // 只在首次加载时显示错误消息
                message.error(error?.message || '加载虚拟机详情失败')
                // 如果是主机不存在，可以考虑跳转回列表页
                if (error?.message?.includes('主机不存在')) {
                    setTimeout(() => {
                        navigate('/hosts')
                    }, 2000)
                }
            }
        } finally {
            if (!isPolling) setLoading(false)
        }
    }

    // 加载各种列表
    const loadNATRules = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getNATRules(hostName, uuid)
            if (response.data) setNatRules(Array.isArray(response.data) ? response.data as unknown as NATRule[] : [])
        } catch (error: any) {
            console.error('加载NAT规则失败:', error)
            // 主机不存在时不显示错误消息
        }
    }

    const loadIPAddresses = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getVMIPAddresses(hostName, uuid)
            if (response.data) setIpAddresses(Array.isArray(response.data) ? response.data as unknown as IPAddress[] : [])
            const userResponse = await api.getCurrentUser()
            if (userResponse.data) {
                const user = userResponse.data
                setIpQuota({
                    ip_num: user.quota_nat_ports || 0,
                    ip_used: 0,
                    user_data: user
                })
            }
        } catch (error: any) {
            console.error('加载IP地址失败:', error)
            // 主机不存在时不显示错误消息
        }
    }

    const loadProxyRules = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getProxyConfigs(hostName, uuid)
            if (response.data) setProxyRules(Array.isArray(response.data) ? response.data as unknown as ProxyRule[] : [])
        } catch (error: any) {
            console.error('加载代理规则失败:', error)
            // 主机不存在时不显示错误消息
        }
    }

    // 加载EFI启动项列表
    const loadEFIList = async () => {
        if (!hostName || !uuid) return
        setEfiLoading(true)
        try {
            const response = await api.getEFIList(hostName, uuid)
            if (response.data && Array.isArray(response.data)) {
                setEfiList(response.data)
            } else {
                setEfiList([])
            }
        } catch (error: any) {
            console.error('加载启动项列表失败:', error)
        } finally {
            setEfiLoading(false)
        }
    }

    // 保存EFI启动项顺序
    const handleSaveEFI = async () => {
        if (!hostName || !uuid) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setEfiActionLoading(true)
        try {
            const response = await api.setupEFI(hostName, uuid, efiEditList)
            if (response.code === 200) {
                message.success('启动顺序保存成功')
                setEfiEditing(false)
                await loadEFIList()
            } else {
                message.error(response.msg || '保存启动顺序失败')
            }
        } catch (error: any) {
            message.error(error?.message || '保存启动顺序失败')
        } finally {
            setEfiActionLoading(false)
        }
    }

    // EFI启动项上移
    const handleEfiMoveUp = (index: number) => {
        if (index <= 0) return
        const newList = [...efiEditList]
        const temp = newList[index - 1]
        newList[index - 1] = newList[index]
        newList[index] = temp
        setEfiEditList(newList)
    }

    // EFI启动项下移
    const handleEfiMoveDown = (index: number) => {
        if (index >= efiEditList.length - 1) return
        const newList = [...efiEditList]
        const temp = newList[index + 1]
        newList[index + 1] = newList[index]
        newList[index] = temp
        setEfiEditList(newList)
    }

    const handleAddUSB = async () => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        try {
            if (!selectedUsbKey) {
                message.error('请选择一个USB设备')
                return
            }
            const device = usbDeviceList[selectedUsbKey]
            if (!device) {
                message.error('所选USB设备无效')
                return
            }
            setUsbActionLoading(true)
            const result = await api.setupUSB(hostName!, uuid!, {
                usb_key: selectedUsbKey,
                vid_uuid: device.vid_uuid,
                pid_uuid: device.pid_uuid,
                usb_hint: device.usb_hint,
                action: 'add'
            })
            setUsbModalVisible(false)
            setSelectedUsbKey('')
            submitAsyncTask(result, '添加USB设备', {
                onCompleted: () => loadVMDetail(),
                onFailed: () => loadVMDetail(),
            })
        } catch (error: any) {
            console.error('添加USB设备失败:', error)
            message.error(error.message || '添加USB设备失败')
        } finally {
            setUsbActionLoading(false)
        }
    }

    const handleDeleteUSB = async (usbKey: string) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        const usbConfig = vm?.config?.usb_all?.[usbKey]
        showConfirmAction(
            '删除USB设备确认',
            `确定要移除USB直通设备 "${usbConfig?.usb_hint || usbKey}" 吗？此操作需要关闭虚拟机。`,
            async () => {
                try {
                    setUsbActionLoading(true)
                    const result = await api.setupUSB(hostName!, uuid!, {
                        usb_key: usbKey,
                        vid_uuid: usbConfig?.vid_uuid || '',
                        pid_uuid: usbConfig?.pid_uuid || '',
                        usb_hint: usbConfig?.usb_hint || '',
                        action: 'remove'
                    })
                    submitAsyncTask(result, '移除USB设备', {
                        onCompleted: () => loadVMDetail(),
                        onFailed: () => loadVMDetail(),
                    })
                } catch (error: any) {
                    console.error('删除USB设备失败:', error)
                    message.error(error.message || '删除USB设备失败')
                } finally {
                    setUsbActionLoading(false)
                }
            },
            true
        )
    }

    // 打开USB设备添加Modal时加载可用设备列表
    const handleOpenUsbModal = async () => {
        setUsbModalVisible(true)
        setUsbListLoading(true)
        setSelectedUsbKey('')
        try {
            const res = await api.getUSBList(hostName!)
            if (res.code === 200 && res.data) {
                setUsbDeviceList(res.data)
            } else {
                setUsbDeviceList({})
            }
        } catch (e) {
            setUsbDeviceList({})
            message.error('获取USB设备列表失败')
        } finally {
            setUsbListLoading(false)
        }
    }

    // 处理监控数据
    const processMonitorData = (statusList: any[], timeRangeMinutes: number) => {
        const data = {
            cpu: [],
            memory: [],
            disk: [],
            gpu: [],
            netUp: [],
            netDown: [],
            traffic: [],
            nat: [],
            proxy: [],
            labels: []
        } as any
        if (!statusList || statusList.length === 0) return data

        let latestTimestamp = 0
        statusList.forEach(status => {
            if (status.on_update && status.on_update > latestTimestamp) latestTimestamp = status.on_update
        })
        if (!latestTimestamp) latestTimestamp = Math.floor(Date.now() / 1000)

        const latestMinuteTimestamp = Math.floor(latestTimestamp / 60) * 60
        let sampleInterval = 1
        if (timeRangeMinutes > 60 && timeRangeMinutes <= 360) sampleInterval = 5
        else if (timeRangeMinutes > 360 && timeRangeMinutes <= 1440) sampleInterval = 10
        else if (timeRangeMinutes > 1440 && timeRangeMinutes <= 4320) sampleInterval = 30
        else if (timeRangeMinutes > 4320 && timeRangeMinutes <= 10080) sampleInterval = 60
        else if (timeRangeMinutes > 10080 && timeRangeMinutes <= 21600) sampleInterval = 120
        else if (timeRangeMinutes > 21600) sampleInterval = 240

        const totalPoints = Math.ceil(timeRangeMinutes / sampleInterval)
        const dataMap = new Map()
        statusList.forEach(status => {
            if (status.on_update) {
                const minuteTimestamp = Math.floor(status.on_update / 60) * 60
                dataMap.set(minuteTimestamp, status)
            }
        })

        for (let i = 0; i < totalPoints; i++) {
            const minuteOffset = (totalPoints - 1 - i) * sampleInterval
            const minuteTimestamp = latestMinuteTimestamp - minuteOffset * 60
            const status = dataMap.get(minuteTimestamp)

            const time = new Date(minuteTimestamp * 1000)
            const hours = String(time.getHours()).padStart(2, '0')
            const minutes = String(time.getMinutes()).padStart(2, '0')
            data.labels.push(`${hours}:${minutes}`)

            if (status) {
                data.cpu.push(status.cpu_usage || 0)
                data.memory.push(Number((status.mem_total > 0 ? (status.mem_usage / status.mem_total * 100) : 0).toFixed(2)))
                data.disk.push(Number((status.hdd_total > 0 ? (status.hdd_usage / status.hdd_total * 100) : 0).toFixed(2)))
                data.gpu.push(status.gpu_total || 0)
                data.netUp.push(status.network_u || 0)
                data.netDown.push(status.network_d || 0)
                data.traffic.push(Number(((status.flu_usage || 0) / 1024).toFixed(2)))
                data.nat.push(status.nat_usage || 0)
                data.proxy.push(status.web_usage || 0)
            } else {
                data.cpu.push(0);
                data.memory.push(0);
                data.disk.push(0);
                data.gpu.push(0);
                data.netUp.push(0);
                data.netDown.push(0)
                data.traffic.push(0);
                data.nat.push(0);
                data.proxy.push(0)
            }
        }
        return data
    }

    const loadMonitorData = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getVMMonitorData(hostName, uuid, timeRange)
            const history = response.data?.history
            if (history && Array.isArray(history)) {
                setMonitorData(processMonitorData(history, timeRange))
            }
        } catch (error: any) {
            console.error('加载监控数据失败:', error)
            // 主机不存在时不显示错误消息
        }
    }

    const loadHDDs = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getVMDetail(hostName, uuid)
            if (response.data && (response.data as any).config) {
                const data = response.data as any
                const hddAll = data.config.hdd_all || {}
                const hddList = Object.entries(hddAll).map(([key, value]: [string, any]) => ({
                    hdd_path: key,
                    hdd_size: value.hdd_size || 0,
                    hdd_type: value.hdd_type || 0,
                    hdd_flag: value.hdd_flag || 0,
                    hdd_num: value.hdd_size || 0,
                    ...value
                }))
                setHdds(hddList)
            }
        } catch (error: any) {
            console.error('加载硬盘信息失败:', error)
            // 主机不存在时不显示错误消息
        }
    }

    const loadISOs = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getVMDetail(hostName, uuid)
            if (response.data && (response.data as any).config) {
                const data = response.data as any
                const isoAll = data.config.iso_all || {}
                const isoList = Object.entries(isoAll).map(([key, value]: [string, any]) => ({
                    iso_name: key,
                    iso_file: value.iso_file || '',
                    iso_hint: value.iso_hint || '',
                    ...value
                }))
                setIsos(isoList)
            }
        } catch (error: any) {
            console.error('加载ISO信息失败:', error)
            // 主机不存在时不显示错误消息
        }
    }

    const loadBackups = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getVMBackups(hostName, uuid)
            if (response.data) {
                const data = response.data as any
                // 处理不同的数据结构
                if (Array.isArray(data)) {
                    // 如果直接返回数组
                    setBackups(data)
                } else if (data.config && Array.isArray(data.config.backups)) {
                    // 旧的数据结构，包含config.backups
                    setBackups(data.config.backups)
                } else if (Array.isArray(data.backups)) {
                    // 新的数据结构，直接包含backups数组
                    setBackups(data.backups)
                } else {
                    // 其他情况，使用空数组
                    setBackups([])
                }
            } else {
                setBackups([])
            }
        } catch (error: any) {
            console.error('加载备份失败:', error)
            setBackups([])
            // 主机不存在时不显示错误消息
        }
    }

    const loadOwners = async () => {
        if (!hostName || !uuid) return
        try {
            const response = await api.getVMOwners(hostName, uuid)
            if (response.data) {
                const data = response.data as any
                // 处理不同的数据结构
                if (Array.isArray(data)) {
                    // 如果直接返回数组
                    setOwners(data)
                } else if (data.owners && Array.isArray(data.owners)) {
                    // 如果返回的是包含owners数组的对象
                    setOwners(data.owners)
                } else {
                    // 其他情况，使用空数组
                    setOwners([])
                }
            } else {
                setOwners([])
            }
        } catch (error: any) {
            console.error('加载用户失败:', error)
            setOwners([])
            // 主机不存在时不显示错误消息
        }
    }

    useEffect(() => {
        loadHostInfo();
        loadVMDetail();
        loadMonitorData()
        checkRunningTasks()
        const interval = setInterval(() => {
            loadVMDetail(true);
            loadMonitorData()
            loadVMScreenshot()
        }, 10000)
        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hostName, uuid])

    // 当虚拟机状态变为运行中时，获取截图
    useEffect(() => {
        if (currentStatus.ac_status === 'STARTED') {
            loadVMScreenshot();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStatus.ac_status])

    // 更新当前状态
    useEffect(() => {
        if (vm && vm.status && vm.status.length > 0) {
            setCurrentStatus(vm.status[vm.status.length - 1])
        }
    }, [vm])

    useEffect(() => {
        // 无论切换到哪个标签页，都预加载所有数据，确保切换时数据已准备好
        loadNATRules()
        loadIPAddresses()
        loadProxyRules()
        loadHDDs()
        loadISOs()
        loadBackups()
        loadOwners()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        // 标签页切换时刷新对应数据
        if (activeTab === 'nat') loadNATRules()
        else if (activeTab === 'ip') loadIPAddresses()
        else if (activeTab === 'proxy') loadProxyRules()
        else if (activeTab === 'hdd') loadHDDs()
        else if (activeTab === 'iso') loadISOs()
        else if (activeTab === 'backup') loadBackups()
        else if (activeTab === 'owners') loadOwners()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab])

    useEffect(() => {
        loadMonitorData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeRange])

    useEffect(() => {
        if (natModalVisible && ipAddresses.length === 0) loadIPAddresses()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [natModalVisible])

    // 通用确认弹窗逻辑
    const showConfirmAction = (
        title: string,
        content: string,
        onConfirm: (confirmInput?: string) => Promise<void>,
        requireShutdown: boolean = false,
        requireInput: boolean = false,
        expectedInput: string = ''
    ) => {
        setCurrentAction({
            title,
            content,
            onConfirm,
            requireShutdown,
            confirmChecked: false,
            requireInput,
            confirmInput: '',
            expectedInput
        })
        setActionConfirmModalVisible(true)
    }

    const executeAction = async () => {
        if (!currentAction) return
        
        // 如果需要输入验证，检查输入是否匹配
        if (currentAction.requireInput && currentAction.confirmInput !== currentAction.expectedInput) {
            message.error('输入内容不匹配')
            return
        }
        
        setActionConfirmModalVisible(false)
        
        // 锁定操作
        setOperationLocked(true)
        
        try {
            await currentAction.onConfirm(currentAction.confirmInput)
            message.success('操作成功')
            // 操作成功后刷新状态
            setTimeout(loadVMDetail, 1500)
        } catch (error: any) {
            message.error(error.message || '操作失败')
            // 操作失败也刷新状态
            setTimeout(loadVMDetail, 1000)
        } finally {
            // 解锁操作
            setOperationLocked(false)
            // 清除超时定时器
            if (operationTimeoutId) {
                clearTimeout(operationTimeoutId)
                setOperationTimeoutId(null)
            }
        }
    }

    // 操作处理函数
    const handlePowerAction = async (action: string) => {
        if (!hostName || !uuid) return
        
        // 检查主机是否被禁用
        if (!hostEnabled) {
            message.error('该主机已被禁用，无法控制虚拟机电源')
            return
        }
        
        const actionMap: any = {
            stop: '软关机',
            hard_stop: '强制关机',
            hard_reset: '强制重启',
            reset: '软重启',
            start: '启动',
            pause: '暂停',
            resume: '恢复'
        }
        const statusMap: any = {
            start: 'ON_OPEN',
            stop: 'ON_STOP',
            hard_stop: 'ON_STOP',
            reset: 'ON_STOP',
            hard_reset: 'ON_STOP',
            pause: 'ON_SAVE',
            resume: 'ON_WAKE'
        }
        const requireShutdown = ['stop', 'hard_stop', 'hard_reset'].includes(action)

        showConfirmAction(
            `${actionMap[action]}确认`,
            `确定要执行${actionMap[action]}操作吗？${requireShutdown ? '此操作可能导致数据丢失！' : ''}`,
            async () => {
                // 设置临时状态为中间状态
                setTempStatus(statusMap[action])
                
                // 设置10分钟超时
                const timeoutId = setTimeout(() => {
                    setTempStatus(null)
                    setOperationLocked(false)
                    message.error('操作超时，请检查虚拟机状态')
                    loadVMDetail()
                }, 10 * 60 * 1000) // 10分钟
                setOperationTimeoutId(timeoutId)
                
                try {
                    await api.vmPower(hostName, uuid, action as any)
                    // 操作成功后，清除临时状态，让真实状态重新显示
                    setTempStatus(null)
                } catch (error) {
                    // 操作失败，清除临时状态
                    setTempStatus(null)
                    throw error
                }
            },
            requireShutdown
        )
    }

    const handleDelete = () => {
        // 检查主机是否被禁用
        if (!hostEnabled) {
            message.error('该主机已被禁用，无法删除虚拟机')
            return
        }

        // 判断管理员是否在删除非自己的虚拟机
        const ownerList = vm?.config?.own_all || {}
        const ownerNames = Object.keys(ownerList)
        const primaryOwner = ownerNames.length > 0 ? ownerNames[0] : ''
        const currentUsername = user?.username || ''
        const isOwnVM = primaryOwner === currentUsername

        if (isAdminUser && !isOwnVM && primaryOwner) {
            // 管理员删除非自己的虚拟机，需要输入主所有者用户名确认
            showConfirmAction(
                '确认删除',
                `此操作将永久删除虚拟机 "${uuid}" 且不可恢复。该虚拟机属于用户 "${primaryOwner}"，请输入主所有者用户名以确认删除：`,
                async (confirmInput) => {
                    await api.deleteVM(hostName!, uuid!, false, confirmInput)
                    navigate(`/hosts/${hostName}/vms`)
                },
                true,
                true,
                primaryOwner
            )
        } else {
            // 普通删除流程，输入虚拟机名称确认
            showConfirmAction(
                '确认删除',
                `此操作将永久删除虚拟机 "${uuid}" 且不可恢复，请输入虚拟机名称以确认删除：`,
                async () => {
                    await api.deleteVM(hostName!, uuid!)
                    navigate(`/hosts/${hostName}/vms`)
                },
                true,
                true,
                uuid || ''
            )
        }
    }

    const handleOpenVNC = async () => {
        if (!hostName || !uuid) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法打开控制台'); return }
        const hide = message.loading('正在获取控制台地址...', 0)
        try {
            const response = await api.getVMConsole(hostName, uuid)
            hide()

            const url = response.data?.console_url || (typeof response.data === 'string' ? response.data : null)
            if (url && url.startsWith('http')) {
                window.open(url, '_blank')
            } else {
                message.error('获取的控制台地址无效')
            }
        } catch (error) {
            hide()
            message.error('打开控制台失败')
        }
    }

    const handleCopyPassword = (password: string, type: string) => {
        navigator.clipboard.writeText(password);
        message.success(`${type}密码已复制`)
    }

    const handleChangePassword = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法修改密码'); return }
        const actionLabels: Record<string, string> = { os_password: '修改系统密码', vnc_password: '修改VNC密码', vnc_port: '修改VNC端口' }
        const actionLabel = actionLabels[passwordActionType] || '操作'

        // 立即关闭模态框，显示执行中
        setPasswordModalVisible(false)
        form.resetFields()
        setTempStatus('ON_PASSWD')
        message.loading({ content: `${actionLabel}执行中...`, key: 'pwd_action', duration: 0 })

        // 构建请求数据
        let requestData: any = { type: passwordActionType }
        if (passwordActionType === 'os_password') {
            requestData.password = _values.new_password
        } else if (passwordActionType === 'vnc_password') {
            requestData.vnc_password = _values.new_password
        } else if (passwordActionType === 'vnc_port') {
            requestData.vnc_port = randomVncPort
        }

        // 后台异步执行
        try {
            await api.changeVMPassword(hostName!, uuid!, requestData)
            setTempStatus(null)
            message.success({ content: `${actionLabel}成功`, key: 'pwd_action' })
            loadVMDetail()
        } catch (error: any) {
            setTempStatus(null)
            message.error({ content: `${actionLabel}失败: ${error?.message || '未知错误'}`, key: 'pwd_action' })
            loadVMDetail()
        }
    }

    const handleAddIPAddress = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        // 显示确认对话框，提示需要重启虚拟机
        Modal.confirm({
            title: '添加网卡确认',
            content: (
                <div>
                    <p className="mb-3">确定要添加网卡吗？</p>
                    <Alert message="添加网卡后需要重启虚拟机才能生效" type="warning" showIcon className="mb-3"/>
                <div className="p-3 rounded">
                        <p className="text-sm mb-1">网卡类型：{_values.nic_type === 'pub' ? '公网' : '内网'}</p>
                        {_values.ip4_addr && <p className="text-sm mb-1">IPv4地址：{_values.ip4_addr}</p>}
                        {_values.ip6_addr && <p className="text-sm">IPv6地址：{_values.ip6_addr}</p>}
                    </div>
                </div>
            ),
            okText: '确认添加',
            cancelText: '取消',
            mask: false,
            onOk: async () => {
                // 设置临时状态为配置中
                setTempStatus('configuring')
                const hide = message.loading('正在添加网卡...', 0)
                try {
                    await api.addIPAddress(hostName!, uuid!, _values)
                    hide()
                    message.success('网卡添加成功，请重启虚拟机使其生效')
                    setIpModalVisible(false);
                    ipForm.resetFields();
                    loadIPAddresses()
                    loadVMDetail() // 刷新虚拟机信息以更新网卡列表
                    // 操作完成后，清除临时状态
                    setTimeout(() => {
                        setTempStatus(null)
                    }, 1500)
                } catch (error) {
                    // 操作失败，清除临时状态
                    setTempStatus(null)
                    hide()
                    message.error('添加失败')
                }
            }
        })
    }

    const handleDeleteIPAddress = async (nicName: string) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        Modal.confirm({
            title: '删除网卡确认',
            content: (
                <div>
                    <p className="mb-3">确定要删除网卡 "{nicName}" 吗？</p>
                    <Alert message="删除网卡后需要重启虚拟机才能生效" type="warning" showIcon/>
                </div>
            ),
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            mask: false,
            onOk: async () => {
                // 设置临时状态为配置中
                setTempStatus('configuring')
                const hide = message.loading('正在删除网卡...', 0)
                try {
                    await api.deleteIPAddress(hostName!, uuid!, nicName)
                    hide()
                    message.success('网卡删除成功，请重启虚拟机使其生效')
                    loadIPAddresses()
                    loadVMDetail() // 刷新虚拟机信息以更新网卡列表
                    // 操作完成后，清除临时状态
                    setTimeout(() => {
                        setTempStatus(null)
                    }, 1500)
                } catch (error) {
                    // 操作失败，清除临时状态
                    setTempStatus(null)
                    hide()
                    message.error('删除失败')
                }
            }
        })
    }

    const handleAddProxy = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setProxyActionLoading(true)
        setOperationLocked(true)
        const hide = message.loading('正在添加反向代理...', 0)
        try {
            const data = {
                domain: _values.domain,
                backend_ip: _values.backend_ip || '',
                backend_port: parseInt(_values.backend_port),
                ssl_enabled: _values.ssl_enabled || false,
                description: _values.description || ''
            }
            await api.addProxyConfig(hostName!, uuid!, data)
            message.success('反向代理添加成功')
            setProxyModalVisible(false)
            proxyForm.resetFields()
            loadProxyRules()
        } catch (error: any) {
            message.error(error?.message || '添加失败')
        } finally {
            hide()
            setProxyActionLoading(false)
            setOperationLocked(false)
        }
    }

    const handleDeleteProxy = async (proxyId: number) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        showConfirmAction('删除代理确认', '确定要删除这个反向代理吗？', async () => {
            setProxyActionLoading(true)
            setOperationLocked(true)
            const hide = message.loading('正在删除反向代理...', 0)
            try {
                await api.deleteProxyConfig(hostName!, uuid!, proxyId)
                message.success('反向代理已删除')
                loadProxyRules()
            } catch (error: any) {
                message.error(error?.message || '删除失败')
            } finally {
                hide()
                setProxyActionLoading(false)
                setOperationLocked(false)
            }
        }, true)
    }

    const handleAddNATRule = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setNatActionLoading(true)
        setOperationLocked(true)
        const hide = message.loading('正在添加NAT规则...', 0)
        try {
            const data: any = {
                wan_port: _values.wan_port || '',
                lan_port: parseInt(_values.lan_port),
                lan_addr: _values.lan_addr || '',
                nat_tips: _values.nat_tips || ''
            }

            await api.addNATRule(hostName!, uuid!, data)
            message.success('NAT规则添加成功')
            setNatModalVisible(false)
            form.resetFields()
            loadNATRules()
        } catch (error: any) {
            message.error(error?.message || '添加失败')
        } finally {
            hide()
            setNatActionLoading(false)
            setOperationLocked(false)
        }
    }

    const handleDeleteNAT = async (index: number) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        showConfirmAction('删除NAT规则', '确定要删除该规则吗？', async () => {
            setNatActionLoading(true)
            setOperationLocked(true)
            const hide = message.loading('正在删除NAT规则...', 0)
            try {
                await api.deleteNATRule(hostName!, uuid!, index)
                message.success('NAT规则已删除')
                loadNATRules()
            } catch (error: any) {
                message.error(error?.message || '删除失败')
            } finally {
                hide()
                setNatActionLoading(false)
                setOperationLocked(false)
            }
        }, false)
    }

    const handleAddHDD = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        const regex = /^[a-zA-Z0-9_]+$/
        if (!regex.test(_values.hdd_name)) {
            message.error('磁盘名称只能包含数字、字母和下划线');
            return
        }
        // 设置临时状态为配置中
        setTempStatus('configuring')
        setHddActionLoading(true)
        try {
            const result = await api.addHDD(hostName!, uuid!, {
                hdd_size: _values.hdd_size * 1024,
                hdd_name: _values.hdd_name,
                hdd_type: _values.hdd_type
            })
            setHddModalVisible(false);
            hddForm.resetFields();
            submitAsyncTask(result, '添加数据盘', {
                onCompleted: () => loadHDDs(),
                onFailed: () => loadHDDs(),
            })
        } catch (error) {
            message.error('添加失败')
        } finally {
            setHddActionLoading(false)
        }
    }

    const handleMountHDD = async () => {
        if (!currentMountHdd) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setHddActionLoading(true)
        try {
            const result = await api.post(`/api/client/hdd/mount/${hostName}/${uuid}`, {
                hdd_name: currentMountHdd.hdd_path,
                hdd_size: currentMountHdd.hdd_num,
                hdd_type: currentMountHdd.hdd_type
            })
            setMountHddModalVisible(false);
            setMountHddConfirmChecked(false);
            submitAsyncTask(result, '挂载数据盘', {
                onCompleted: () => loadHDDs(),
                onFailed: () => loadHDDs(),
            })
        } catch (error) {
            message.error('挂载失败')
        } finally {
            setHddActionLoading(false)
        }
    }

    const handleUnmountHDD = async () => {
        if (!currentUnmountHdd) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setHddActionLoading(true)
        try {
            const result = await api.post(`/api/client/hdd/unmount/${hostName}/${uuid}`, {hdd_name: currentUnmountHdd.hdd_path})
            setUnmountHddModalVisible(false);
            setUnmountHddConfirmChecked(false);
            submitAsyncTask(result, '卸载数据盘', {
                onCompleted: () => loadHDDs(),
                onFailed: () => loadHDDs(),
            })
        } catch (error) {
            message.error('卸载失败')
        } finally {
            setHddActionLoading(false)
        }
    }

    const handleDeleteHDD = async (hddPath: string) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        showConfirmAction('删除数据盘确认', `确定要删除数据盘 "${hddPath}" 吗？此操作不可恢复！`, async () => {
            const result = await api.delete(`/api/client/hdd/delete/${hostName}/${uuid}`, {data: {hdd_name: hddPath}})
            submitAsyncTask(result, '删除数据盘', {
                onCompleted: () => loadHDDs(),
                onFailed: () => loadHDDs(),
            })
        }, true)
    }

    const handleAddGpu = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        // PCI直通需要关机检查
        const isRunning = vm?.config?.vm_flag === 'ON_START' || currentStatus?.ac_status === 'RUNNING'
        if (isRunning) {
            // 弹出关机确认
            setPendingPciAction(() => async () => {
                await executePciAdd(_values)
            })
            setPciShutdownConfirmChecked(false)
            setPciShutdownConfirmVisible(true)
            return
        }
        await executePciAdd(_values)
    }

    const executePciAdd = async (_values: any) => {
        setGpuActionLoading(true)
        try {
            const pciKey = _values.pci_key || selectedPciKey
            const device = pciDeviceList[pciKey]
            if (!device) {
                message.error('请选择一个PCI设备')
                setGpuActionLoading(false)
                return
            }
            const result = await api.setupPCI(hostName!, uuid!, {
                pci_key: pciKey,
                gpu_uuid: device.gpu_uuid,
                gpu_mdev: device.gpu_mdev,
                gpu_hint: device.gpu_hint,
                action: 'add'
            })
            setGpuModalVisible(false)
            setSelectedPciKey('')
            submitAsyncTask(result, '添加PCI直通设备', {
                onCompleted: () => loadVMDetail(),
                onFailed: () => loadVMDetail(),
            })
        } catch (error: any) {
            message.error(error?.message || 'PCI直通添加失败')
        } finally {
            setGpuActionLoading(false)
        }
    }

    const handleDeleteGpu = async (gpuKey: string) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        const gpuConfig = vm?.config?.pci_all?.[gpuKey]
        const isRunning = vm?.config?.vm_flag === 'ON_START' || currentStatus?.ac_status === 'RUNNING'
        if (isRunning) {
            setPendingPciAction(() => async () => {
                await executePciRemove(gpuKey, gpuConfig)
            })
            setPciShutdownConfirmChecked(false)
            setPciShutdownConfirmVisible(true)
            return
        }
        showConfirmAction('删除PCI设备确认', `确定要移除PCI直通设备 "${gpuConfig?.gpu_hint || gpuKey}" 吗？`, async () => {
            await executePciRemove(gpuKey, gpuConfig)
        }, true)
    }

    const executePciRemove = async (gpuKey: string, gpuConfig: any) => {
        try {
            const result = await api.setupPCI(hostName!, uuid!, {
                pci_key: gpuKey,
                gpu_uuid: gpuConfig?.gpu_uuid || '',
                gpu_mdev: gpuConfig?.gpu_mdev || '',
                gpu_hint: gpuConfig?.gpu_hint || '',
                action: 'remove'
            })
            submitAsyncTask(result, '移除PCI直通设备', {
                onCompleted: () => loadVMDetail(),
                onFailed: () => loadVMDetail(),
            })
        } catch (error: any) {
            message.error(error?.message || '移除失败')
        }
    }

    // 打开PCI设备添加Modal时加载可用设备列表
    const handleOpenPciModal = async () => {
        setGpuModalVisible(true)
        setPciListLoading(true)
        setSelectedPciKey('')
        try {
            const res = await api.getPCIList(hostName!)
            if (res.code === 200 && res.data) {
                setPciDeviceList(res.data)
            } else {
                setPciDeviceList({})
            }
        } catch (e) {
            setPciDeviceList({})
            message.error('获取PCI设备列表失败')
        } finally {
            setPciListLoading(false)
        }
    }

    // PCI关机确认后执行
    const handlePciShutdownConfirm = async () => {
        setPciShutdownConfirmVisible(false)
        setPciShutdownConfirmChecked(false)
        // 先关机
        try {
            const hide = message.loading('正在关闭虚拟机...', 0)
await api.vmPower(hostName!, uuid!, 'H_CLOSE')
            hide()
            message.success('虚拟机已关闭，正在执行PCI直通操作...')
            // 等待一小段时间让状态更新
            await new Promise(resolve => setTimeout(resolve, 3000))
            if (pendingPciAction) {
                await pendingPciAction()
            }
        } catch (e: any) {
            message.error(e?.message || '关闭虚拟机失败，请手动关机后重试')
        }
        setPendingPciAction(null)
    }

    const handleOpenTransferHDD = (hdd: HDDInfo) => {
        setCurrentTransferHdd(hdd);
        setTransferTargetUuid('');
        setTransferHddConfirmChecked(false);
        setTransferHddModalVisible(true)
    }

    const handleTransferHDD = async () => {
        if (!currentTransferHdd) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setHddActionLoading(true)
        const hide = message.loading('正在移交数据盘，请稍候...', 0)
        try {
            await api.post(`/api/client/hdd/transfer/${hostName}/${uuid}`, {
                hdd_name: currentTransferHdd.hdd_path,
                target_vm: transferTargetUuid
            })
            hide()
            message.success('数据盘移交成功，页面将自动刷新')
            setTransferHddModalVisible(false);
            setTransferHddConfirmChecked(false);
            // 移交成功后刷新页面
            setTimeout(() => {
                loadHDDs()
                loadVMDetail()
            }, 1500)
        } catch (error) {
            hide()
            message.error('数据盘移交失败')
        } finally {
            setHddActionLoading(false)
        }
    }

    const handleAddISO = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setIsoActionLoading(true)
        try {
            const result = await api.addISO(hostName!, uuid!, {
                iso_name: _values.iso_name,
                iso_file: _values.iso_file,
                iso_hint: _values.iso_hint
            })
            setIsoModalVisible(false);
            isoForm.resetFields();
            setIsoMountConfirmChecked(false);
            submitAsyncTask(result, '挂载ISO镜像', {
                onCompleted: () => loadISOs(),
                onFailed: () => loadISOs(),
            })
        } catch (error) {
            message.error('挂载失败')
        } finally {
            setIsoActionLoading(false)
        }
    }

    const executeUnmountISO = async () => {
        if (!currentUnmountIso) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setIsoActionLoading(true)
        try {
            const result = await api.deleteISO(hostName!, uuid!, currentUnmountIso)
            setUnmountIsoConfirmVisible(false);
            setUnmountIsoConfirmChecked(false);
            submitAsyncTask(result, '卸载ISO镜像', {
                onCompleted: () => loadISOs(),
                onFailed: () => loadISOs(),
            })
        } catch (error) {
            message.error('卸载失败')
        } finally {
            setIsoActionLoading(false)
        }
    }

    const handleCreateBackup = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setBackupActionLoading(true)
        setBackupModalVisible(false)
        backupForm.resetFields()
        setBackupCreateConfirmChecked(false)
        try {
            const result = await api.createVMBackup(hostName!, uuid!, {vm_tips: _values.backup_name})
            submitAsyncTask(result, '创建备份', {
                onCompleted: () => loadBackups(),
                onFailed: () => loadBackups(),
            })
        } catch (error) {
            message.error('创建备份失败')
        } finally {
            setBackupActionLoading(false)
        }
    }

    const executeRestoreBackup = async () => {
        if (!currentRestoreBackup) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        
        setBackupActionLoading(true)
        setRestoreBackupModalVisible(false)
        setRestoreConfirmChecked1(false)
        setRestoreConfirmChecked2(false)
        try {
            const result = await api.restoreVMBackup(hostName!, uuid!, currentRestoreBackup)
            submitAsyncTask(result, '还原备份', {
                onCompleted: () => {
                    loadBackups()
                    loadVMDetail()
                },
                onFailed: () => loadVMDetail(),
            })
        } catch (error) {
            message.error('还原备份失败')
        } finally {
            setBackupActionLoading(false)
        }
    }

    const handleDeleteBackup = async (backupName: string) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        showConfirmAction('删除备份确认', '确定要删除这个备份吗？此操作不可恢复！', async () => {
            await api.deleteVMBackup(hostName!, uuid!, backupName)
            loadBackups()
        }, true)
    }

    const handleAddOwner = async (_values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setOwnerActionLoading(true)
        try {
            await api.addVMOwner(hostName!, uuid!, {username: _values.username})
            message.success('用户添加成功')
            setOwnerModalVisible(false);
            ownerForm.resetFields();
            loadOwners()
        } catch (error) {
            message.error('添加失败')
        } finally {
            setOwnerActionLoading(false)
        }
    }

    const handleDeleteOwner = async (username: string) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        showConfirmAction('删除用户确认', `确定要移除用户 "${username}" 吗？`, async () => {
            await api.deleteVMOwner(hostName!, uuid!, username)
            loadOwners()
        }, false)
    }

    // 更新用户虚拟机权限
    const handleUpdatePermission = async () => {
        if (!editPermOwner || !hostEnabled) return
        setOwnerActionLoading(true)
        try {
            await api.updateVMOwnerPermission(hostName!, uuid!, editPermOwner, editPermMask)
            message.success('权限更新成功')
            setEditPermModalVisible(false)
            loadOwners()
        } catch (error: any) {
            message.error(error?.message || '权限更新失败')
        } finally {
            setOwnerActionLoading(false)
        }
    }

    const handleTransferOwnership = async () => {
        if (!transferOwnerUsername) return
        if (!hostEnabled) { message.error('该主机已被禁用，无法操作'); return }
        setOwnerActionLoading(true)
        const hide = message.loading('正在移交所有权，请稍候...', 0)
        try {
            await api.post(`/api/client/owners/${hostName}/${uuid}/transfer`, {
                new_owner: transferOwnerUsername,
                keep_access: keepAccessChecked,
                confirm_transfer: transferOwnerConfirmChecked
            })
            hide()
            message.success('所有权移交成功，页面将自动刷新')
            setTransferOwnershipModalVisible(false);
            setTransferOwnerUsername('');
            setKeepAccessChecked(false);
            setTransferOwnerConfirmChecked(false);
            setTimeout(() => window.location.reload(), 1500)
        } catch (error: any) {
            hide()
            message.error(error?.message || '移交失败')
        } finally {
            setOwnerActionLoading(false)
        }
    }

    const handleReinstall = async (values: any) => {
        if (!hostEnabled) { message.error('该主机已被禁用，无法重装系统'); return }
        showConfirmAction('重装系统确认', '确定要重装系统吗？此操作将清空所有数据！', async () => {
            // 设置临时状态为安装中
            setTempStatus('ON_INSTALL')
            setReinstallActionLoading(true)
            
            // 设置10分钟超时
            const timeoutId = setTimeout(() => {
                setTempStatus(null)
                setOperationLocked(false)
                setReinstallActionLoading(false)
                message.error('操作超时，请检查虚拟机状态')
                loadVMDetail()
            }, 10 * 60 * 1000)
            setOperationTimeoutId(timeoutId)
            
            try {
                await api.reinstallVM(hostName!, uuid!, values)
                // 操作完成后，清除临时状态
                setTempStatus(null)
                setReinstallModalVisible(false);
                reinstallForm.resetFields()
            } catch (error) {
                // 操作失败，清除临时状态
                setTempStatus(null)
                throw error
            } finally {
                setReinstallActionLoading(false)
            }
        }, true)
    }

    const handleUpdateVM = async (values: any) => {
        // 检查主机是否被禁用
        if (!hostEnabled) {
            message.error('该主机已被禁用，无法修改虚拟机配置')
            return
        }
        
        if (values.os_pass && !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(values.os_pass)) {
            message.error('系统密码必须至少8位，且包含字母和数字');
            return
        }
        if (values.vc_pass && !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(values.vc_pass)) {
            message.error('VNC密码必须至少8位，且包含字母和数字');
            return
        }
        setPendingEditValues(values);
        setSaveConfirmChecked(false);
        setSaveConfirmModalVisible(true)
    }

    const handleConfirmUpdateVM = async () => {
        if (!pendingEditValues) return
        
        // 设置临时状态为修改中
        setTempStatus('ON_CONFIG')
        setOperationLocked(true)
        
        try {
            const nicAll: any = {}
            editNicList.forEach(nic => {
                if (nic.name) nicAll[nic.name] = {nic_type: nic.type, ip4_addr: nic.ip, ip6_addr: nic.ip6}
            })
            const updateData = {
                ...pendingEditValues,
                speed_u: pendingEditValues.speed_up,
                speed_d: pendingEditValues.speed_down,
                nic_all: nicAll
            }
            delete updateData.speed_up;
            delete updateData.speed_down
            const result = await api.updateVM(hostName!, uuid!, updateData)
            
            // 异步任务模式：收到task_id后启动轮询并锁定操作
            setSaveConfirmModalVisible(false);
            setEditModalVisible(false);
            setPendingEditValues(null);
            submitAsyncTask(result, '修改虚拟机配置', {
                onCompleted: () => {
                    setTempStatus(null)
                    loadVMDetail()
                },
                onFailed: () => {
                    setTempStatus(null)
                },
            })
        } catch (error) {
            setTempStatus(null)
            setOperationLocked(false)
            message.error('配置更新失败')
        }
    }

    const addEditNic = () => {
        const newId = editNicList.length > 0 ? Math.max(...editNicList.map(n => n.id)) + 1 : 0
        setEditNicList([...editNicList, {id: newId, name: `ethernet${newId}`, type: 'nat', ip: '', ip6: ''}])
    }
    const removeEditNic = (id: number) => setEditNicList(editNicList.filter(n => n.id !== id))
    const updateEditNic = (id: number, field: string, value: any) => setEditNicList(editNicList.map(n => n.id === id ? {
        ...n,
        [field]: value
    } : n))

    const getStatusText = (status: string | undefined) => {
        if (!status) return '未知'
        return ({
            running: '运行中', started: '运行中', STARTED: '运行中',
            stopped: '已停止', STOPPED: '已停止',
            paused: '已暂停', suspend: '已暂停', SUSPEND: '已暂停',
            starting: '启动中',
            stopping: '关机中',
            restarting: '重启中',
            resuming: '恢复中',
            pausing: '暂停中',
            configuring: '配置中',
            backing_up: '备份中',
            restoring: '还原中',
            reinstalling: '重装中',
            error: '错误',
            unknown: '未知', UNKNOWN: '未知',
            // 新的中间状态
            ON_OPEN: '启动中',
            ON_STOP: '关机中',
            ON_SAVE: '暂停中',
            ON_WAKE: '唤醒中',
            ON_PASSWD: '改密中',
            ON_CONFIG: '修改中',
            ON_INSTALL: '安装中',
            ON_BACKUP: '备份中',
            ON_RESTORE: '还原中',
            // 旧的中间状态（兼容）
            on_open: '启动中',
            on_stop: '关机中',
            on_save: '暂停中',
            on_wake: '唤醒中'
        }[status] || status)
    }

    // 根据状态获取Badge颜色
    const getStatusColor = (status: string | undefined) => {
        if (!status) return 'default'
        const lowerStatus = status.toLowerCase()
        // 中间状态显示黄色（processing）
        if (['starting', 'stopping', 'restarting', 'resuming', 'pausing', 'configuring', 'backing_up', 'restoring',
             'on_open', 'on_stop', 'on_save', 'on_wake',
             'ON_OPEN', 'ON_STOP', 'ON_SAVE', 'ON_WAKE', 'ON_PASSWD', 'ON_CONFIG', 'ON_INSTALL', 'ON_BACKUP', 'ON_RESTORE'].includes(status)) {
            return 'processing'
        }
        // 已关机显示灰色
        if (['stopped', 'STOPPED'].includes(status)) {
            return 'default'
        }
        // 重装中显示红色
        if (['reinstalling'].includes(status)) {
            return 'error'
        }
        // 运行中显示绿色
        if (['running', 'started'].includes(lowerStatus)) {
            return 'success'
        }
        // 已暂停显示灰色
        if (['paused', 'suspend'].includes(lowerStatus)) {
            return 'default'
        }
        // 错误显示红色
        if (['error'].includes(lowerStatus)) {
            return 'error'
        }
        // 其他状态显示灰色
        return 'default'
    }

    const getChartOption = (title: string, data: number[], color: string, labels?: string[], unit: string = '%') => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
        return ({
        title: {text: title, left: 'center', textStyle: {fontSize: 12, fontWeight: 'normal', color: isDark ? '#ccc' : '#666'}},
        tooltip: {
            trigger: 'axis',
            formatter: (params: any[]) => `${params[0].axisValue}<br/>${params[0].marker}${params[0].seriesName}: ${params[0].value}${unit}`
        },
        grid: {left: '3%', right: '4%', bottom: '3%', top: '30px', containLabel: true},
        xAxis: {type: 'category', boundaryGap: false, data: labels},
        yAxis: {
            type: 'value',
            max: unit === '%' ? 100 : undefined,
            axisLabel: {formatter: `{value}${unit}`, fontSize: 10}
        },
        series: [{
            name: title,
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: data,
            areaStyle: {
                color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [{offset: 0, color: color + '80'}, {offset: 1, color: color + '10'}]
                }
            },
            lineStyle: {color: color, width: 2},
            itemStyle: {color: color}
        }]
    })}

    // 计算最终显示的状态，优先使用临时状态
    const displayStatus = tempStatus || currentStatus.ac_status

    if (loading || !vm) return <div className="p-20 flex justify-center"><Spin size="large">
        <div style={{marginTop: 8}}>加载虚拟机详情...</div>
    </Spin></div>

    const config = vm.config || {}

    const actionMenu: MenuProps = {
        items: [
            {
                key: 'power', label: '电源操作', icon: <PoweroffOutlined/>, children: [
                    {
                        key: 'start',
                        label: '启动系统',
                        onClick: () => handlePowerAction('start'),
                        disabled: currentStatus.ac_status === 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)
                    },
                    {
                        key: 'stop',
                        label: '关闭系统',
                        onClick: () => handlePowerAction('stop'),
                        disabled: currentStatus.ac_status !== 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)
                    },
                    {
                        key: 'pause',
                        label: '暂停运行',
                        onClick: () => handlePowerAction('pause'),
                        disabled: currentStatus.ac_status !== 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)
                    },
                    {
                        key: 'resume',
                        label: '恢复运行',
                        onClick: () => handlePowerAction('resume'),
                        disabled: currentStatus.ac_status !== 'SUSPEND' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)
                    },
                    {key: 'force_stop', label: '强制关机', onClick: () => handlePowerAction('hard_stop'), danger: true, disabled: !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)},
                    {
                        key: 'force_reset',
                        label: '强制重启',
                        onClick: () => handlePowerAction('hard_reset'),
                        danger: true,
                        disabled: !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)
                    },
                ]
            },
{key: 'delete', label: '删除实例', icon: <DeleteOutlined/>, danger: true, onClick: handleDelete, disabled: !hasPermission(userPermissions, VM_PERMISSION.VM_DELETE) || !user?.can_delete_vm}
        ]
    };

    const ResourceCard = ({title, icon, value, percent, color}: any) => (
                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded-lg p-3 border border-white/20 dark:border-gray-700/30 h-full flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-[15px]">
                {icon}
                <span className="text-base">{title}</span>
            </div>
            <div>
                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-mediu">{value}</span>
                    <span>{percent}%</span>
                </div>
                <Progress percent={Math.min(percent, 100)} size="small" showInfo={false} strokeColor={color}/>
            </div>
        </div>
    )

    const formatMemory = (mb: number) => {
        if (mb < 1024) return mb + ' MB'
        if (mb < 1024 * 1024) return (mb / 1024).toFixed(2) + ' GB'
        return (mb / 1024 / 1024).toFixed(2) + ' TB'
    }

    const formatDisk = (mb: number) => {
        if (mb < 1024) return mb + ' MB'
        if (mb < 1024 * 1024) return (mb / 1024).toFixed(2) + ' GB'
        return (mb / 1024 / 1024).toFixed(2) + ' TB'
    }

    const getProgressBarColor = (percent: number) => {
        if (percent < 50) return '#10b981'
        if (percent < 70) return '#f59e0b'
        if (percent < 90) return '#f97316'
        return '#ef4444'
    }

    const overviewTab = (
        <Row gutter={24}>
            {/* 左侧面板：信息 + 配置 */}
            <Col span={16}>
                <div className="space-y-6">
                    {/* 机器信息区域 */}
                    <Card title="实例信息" size="small" variant="borderless" className="shadow-sm glass-card-transparent">
                        <Row gutter={24}>
                            <Col span={16}>
                                <Descriptions column={2} bordered size="small" styles={{
                                    label: {width: '100px', fontWeight: 500},
                                    content: {fontWeight: 500}
                                }}>
                                    <Descriptions.Item label="实例名称">{config.vm_uuid}</Descriptions.Item>
                                    <Descriptions.Item label="系统密码">
                                        {hasPermission(userPermissions, VM_PERMISSION.PWD_EDITS) ? (
                                            <Space size="small">
                                                <span
                                                    className="font-mono">{showPassword ? config.os_pass : '••••••••'}</span>
                                                <EyeOutlined className="cursor-pointer"
                                                             onClick={() => setShowPassword(!showPassword)}/>
                                                <CopyOutlined className="cursor-pointer"
                                                              onClick={() => handleCopyPassword(config.os_pass || '', '系统')}/>
                                                <EditOutlined className="cursor-pointer text-blue-500"
                                                              onClick={() => { setPasswordActionType('os_password'); setPasswordModalVisible(true) }}/>
                                            </Space>
                                        ) : (
                                            <span className="text-gray-400">无权限查看</span>
                                        )}
                                    </Descriptions.Item>

                                    <Descriptions.Item label="实例状态"><Badge
                                        status={getStatusColor(displayStatus)}
                                        text={getStatusText(displayStatus)}/></Descriptions.Item>
                                    <Descriptions.Item label="远程密码">
                                        {hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS) ? (
                                            <Space size="small">
                                                <span
                                                    className="font-mono">{showVncPassword ? config.vc_pass : '••••••••'}</span>
                                                <EyeOutlined className="cursor-pointer"
                                                             onClick={() => setShowVncPassword(!showVncPassword)}/>
                                                <CopyOutlined className="cursor-pointer"
                                                              onClick={() => handleCopyPassword(config.vc_pass || '', 'VNC')}/>
                                                <EditOutlined className="cursor-pointer text-blue-500"
                                                              onClick={() => { setPasswordActionType('vnc_password'); setPasswordModalVisible(true) }}/>
                                            </Space>
                                        ) : (
                                            <span className="text-gray-400">无权限查看</span>
                                        )}
                                    </Descriptions.Item>

                                    <Descriptions.Item label="主机名称">{hostName}</Descriptions.Item>
                                    <Descriptions.Item
                                        label="主机类型">{hostConfig?.server_type || vm.config?.virt_type || 'Hyper-V'}</Descriptions.Item>
                                    <Descriptions.Item label="操作系统">
                                        <Space>
                                            {/*{getOSIcon(config.os_name || '')}*/}
                                            <span>{getOSDisplayName(config.os_name || '')}</span>
                                        </Space>
                                    </Descriptions.Item>
                                    {vm.config?.nic_all && Object.values(vm.config.nic_all).some((nic: any) => nic.nic_type !== 'pub') && hostConfig?.public_addr?.length ? (
                                        <Descriptions.Item label="公网IP">{hostConfig.public_addr[0]}</Descriptions.Item>
                                    ) : null}
                                    <Descriptions.Item label="端口数量">{config.nat_num || 0} 个</Descriptions.Item>
                                    <Descriptions.Item
                                        label="IPv4地址">{vm.ipv4_address || '未分配'}</Descriptions.Item>
                                    <Descriptions.Item
                                        label="IPv6地址">{vm.ipv6_address || '未分配'}</Descriptions.Item>
                                    <Descriptions.Item label="VNC 端口">{config.vc_port || '未设置'}</Descriptions.Item>
                                    <Descriptions.Item label="上行带宽">{config.speed_u || 0} Mbps</Descriptions.Item>
                                    <Descriptions.Item label="下行带宽">{config.speed_d || 0} Mbps</Descriptions.Item>
                                    {/*<Descriptions.Item label="主所有者">{config.own_all ? Object.keys(config.own_all)[0] || '未知' : '未知'}</Descriptions.Item>*/}

                                </Descriptions>
                            </Col>
                            <Col span={8} className="flex flex-col justify-between">
                                <div className="rounded-lg flex items-center justify-center mb-4"
                                     style={{height: 170}}>
                                    {(() => {
                                        const serverType = hostConfig?.server_type || '';
                                        if (serverType === 'OCInterface' || serverType === 'LxContainer') {
                                            return (
                                                <div className="text-center flex flex-col items-center justify-center">
                                                    <div style={{
                                                        width: 240, height: 120,
                                                        background: 'var(--bg-secondary, #1a1a2e)',
                                                        borderRadius: 8,
                                                        display: 'flex', flexDirection: 'column',
                                                        alignItems: 'center', justifyContent: 'center',
                                                        border: '2px solid var(--border-color, #333)',
                                                        position: 'relative',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            position: 'absolute', top: 0, left: 0, right: 0,
                                                            height: 16, background: 'var(--border-color, #333)',
                                                            display: 'flex', alignItems: 'center', paddingLeft: 6, gap: 3
                                                        }}>
                                                            <span style={{width: 6, height: 6, borderRadius: '50%', background: '#ff5f57'}}/>
                                                            <span style={{width: 6, height: 6, borderRadius: '50%', background: '#febc2e'}}/>
                                                            <span style={{width: 6, height: 6, borderRadius: '50%', background: '#28c840'}}/>
                                                        </div>
                                                        <CodeOutlined style={{fontSize: 28, color: '#52c41a', marginTop: 8}}/>
                                                        <div style={{fontSize: 9, color: '#52c41a', fontFamily: 'monospace', marginTop: 2}}>Shell</div>
                                                    </div>
                                                    <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>此虚拟机所属的物理机不提供桌面截图</div>
                                                </div>
                                            );
                        } else if (currentStatus.ac_status === 'STARTED') {
                            return (
                                <div
                                    className="w-full h-full flex items-center justify-center relative overflow-hidden">
                                    <Spin spinning={loadingScreenshot} tip={<span style={{whiteSpace: 'nowrap'}}>获取截图中...</span>}>
                                        {screenshotError ? (
                                            <div className="text-center">
                                                <div className="text-4xl mb-2">📷</div>
                                                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>无法获取截图</div>
                                            </div>
                                        ) : (
                                            vmScreenshot && (
                                                <img
                                                    src={vmScreenshot}
                                                    alt="虚拟机截图"
                                                    style={{
                                                        maxWidth: '320px',
                                                        maxHeight: '180px',
                                                        aspectRatio: '16/9',
                                                        objectFit: 'contain'
                                                    }}
                                                />
                                            )
                                        )}
                                    </Spin>
                                </div>
                            );
                                        } else {
                                            return (
                                                <div className="text-center">
                                                    <div
                                                        className="text-4xl mb-2">{getOSIcon(config.os_name || '')}</div>
                                                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>虚拟机未运行，无法获取截图
                                                    </div>
                                                </div>
                                            );
                                        }
                                    })()}
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    <Tooltip title="启动"><Button size="small" icon={<PlayCircleOutlined/>}
                                                                  onClick={() => handlePowerAction('start')}
                                                                  disabled={currentStatus.ac_status === 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}
                                                                  block><span
                                        className="hidden md:inline">启动</span></Button></Tooltip>
                                    <Tooltip title="关机"><Button size="small" icon={<PoweroffOutlined/>}
                                                                  onClick={() => handlePowerAction('stop')}
                                                                  disabled={currentStatus.ac_status !== 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}
                                                                  block><span
                                        className="hidden md:inline">关机</span></Button></Tooltip>
                                    <Tooltip title="重启"><Button size="small" icon={<ReloadOutlined/>}
                                                                  onClick={() => handlePowerAction('reset')}
                                                                  disabled={!hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}
                                                                  block><span
                                        className="hidden md:inline">重启</span></Button></Tooltip>
                                    <Tooltip title="暂停"><Button size="small" icon={<PauseCircleOutlined/>}
                                                                  onClick={() => handlePowerAction('pause')}
                                                                  disabled={currentStatus.ac_status !== 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}
                                                                  block><span
                                        className="hidden md:inline">暂停</span></Button></Tooltip>

                                    <Tooltip title="恢复"><Button size="small" icon={<PlayCircleOutlined/>}
                                                                  onClick={() => handlePowerAction('resume')}
                                                                  disabled={currentStatus.ac_status !== 'SUSPEND' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}
                                                                  block><span
                                        className="hidden md:inline">恢复</span></Button></Tooltip>
                                    <Tooltip title="强制关机"><Button size="small" danger icon={<PoweroffOutlined/>}
                                                                      onClick={() => handlePowerAction('hard_stop')}
                                                                      disabled={!hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}
                                                                      block><span
                                        className="hidden md:inline">强关</span></Button></Tooltip>
                                    <Tooltip title="强制重启"><Button size="small" danger icon={<ReloadOutlined/>}
                                                                      onClick={() => handlePowerAction('hard_reset')}
                                                                      disabled={!hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}
                                                                      block><span
                                        className="hidden md:inline">重置</span></Button></Tooltip>
                                    <Tooltip title="编辑配置"><Button size="small" icon={<EditOutlined/>}
                                                                      onClick={() => setEditModalVisible(true)}
                                                                      disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.VM_MODIFY) || !user?.can_modify_vm}
                                                                      block><span
                                        className="hidden md:inline">编辑</span></Button></Tooltip>

                                    <Tooltip title="重装系统"><Button size="small" danger icon={<CloudSyncOutlined/>}
                                                                      onClick={() => setReinstallModalVisible(true)}
                                                                      disabled={!hasPermission(userPermissions, VM_PERMISSION.SYS_EDITS)}
                                                                      block><span
                                        className="hidden md:inline">重装</span></Button></Tooltip>
                                    <Tooltip title="删除"><Button size="small" danger icon={<DeleteOutlined/>}
                                                                  onClick={handleDelete}
                                                                  disabled={!hasPermission(userPermissions, VM_PERMISSION.VM_DELETE) || !user?.can_delete_vm}
                                                                  block><span
                                        className="hidden md:inline">删除</span></Button></Tooltip>
                                    <Tooltip title="VNC控制台"><Button size="small" type="primary"
                                                                       icon={<DesktopOutlined/>} onClick={handleOpenVNC}
                                                                       disabled={!hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)}
                                                                       block><span
                                        className="hidden md:inline">VNC</span></Button></Tooltip>
                                    <Tooltip title="修改密码"><Button size="small" icon={<KeyOutlined/>}
                                                                      onClick={() => setPasswordModalVisible(true)}
                                                                      disabled={!hasPermission(userPermissions, VM_PERMISSION.PWD_EDITS)}
                                                                      block><span
                                        className="hidden md:inline">改密</span></Button></Tooltip>
                                </div>
                            </Col>
                        </Row>
                    </Card>

                    {/* 实例配置区域 */}
                    <Card title="实例配置" size="small" variant="borderless" className="shadow-sm glass-card-transparent" style={{minHeight: '780px'}}>
                        <Row gutter={[16, 16]}>
                            <Col span={8}>
                                <div className="space-y-4">
                                    <ResourceCard title="CPU" icon={<AreaChartOutlined className="text-blue-500"/>}
                                                  value={`${config.cpu_num || 0} 核`} subValue="利用率"
                                                  percent={currentStatus.cpu_usage || 0}
                                                  color={getProgressBarColor(currentStatus.cpu_usage || 0)}/>
                                    <ResourceCard title="RAM" icon={<DesktopOutlined className="text-green-500"/>}
                                                  value={`已用 ${formatMemory(currentStatus.mem_usage || 0)} / ${formatMemory(config.mem_num || 0)}`}
                                                  subValue="使用率"
                                                  percent={config.mem_num > 0 ? Math.round((currentStatus.mem_usage || 0) / config.mem_num * 100) : 0}
                                                  color={getProgressBarColor(config.mem_num > 0 ? Math.round((currentStatus.mem_usage || 0) / config.mem_num * 100) : 0)}/>
                                    <ResourceCard title="GPU" icon={<DesktopOutlined className="text-purple-500"/>}
                                                  value={`已用 ${formatMemory(currentStatus.gpu_total || 0)} / ${formatMemory(config.gpu_mem || 0)}`}
                                                  subValue="使用率"
                                                  percent={config.gpu_mem > 0 ? Math.round((currentStatus.gpu_total || 0) / config.gpu_mem * 100) : 0}
                                                  color={getProgressBarColor(config.gpu_mem > 0 ? Math.round((currentStatus.gpu_total || 0) / config.gpu_mem * 100) : 0)}/>
                                </div>
                            </Col>
                            <Col span={8}>
                                <div className="space-y-4">
                                    <ResourceCard title="系统盘" icon={<HddOutlined className="text-yellow-500"/>}
                                                  value={`已用 ${formatDisk(currentStatus.hdd_usage || 0)} / ${formatDisk(config.hdd_num || 0)}`}
                                                  subValue="使用率"
                                                  percent={config.hdd_num > 0 ? Math.round((currentStatus.hdd_usage || 0) / config.hdd_num * 100) : 0}
                                                  color={getProgressBarColor(config.hdd_num > 0 ? Math.round((currentStatus.hdd_usage || 0) / config.hdd_num * 100) : 0)}/>
                                    <ResourceCard title="流量" icon={<AreaChartOutlined className="text-red-500"/>}
                                                  value={`已用 ${formatDisk(currentStatus.flu_usage || 0)} / ${config.flu_num > 0 ? formatDisk(config.flu_num) : '∞'}`}
                                                  subValue="使用率"
                                                  percent={config.flu_num > 0 ? Math.round((currentStatus.flu_usage || 0) / config.flu_num * 100) : 0}
                                                  color={getProgressBarColor(config.flu_num > 0 ? Math.round((currentStatus.flu_usage || 0) / config.flu_num * 100) : 0)}/>
                                    <ResourceCard title="端口" icon={<GlobalOutlined className="text-indigo-500"/>}
                                                  value={`已用 ${config.nat_all ? Object.keys(config.nat_all).length : 0} / ${config.nat_num || 0} 个`}
                                                  subValue="使用率"
                                                  percent={config.nat_num > 0 ? Math.round((config.nat_all ? Object.keys(config.nat_all).length : 0) / config.nat_num * 100) : 0}
                                                  color={getProgressBarColor(config.nat_num > 0 ? Math.round((config.nat_all ? Object.keys(config.nat_all).length : 0) / config.nat_num * 100) : 0)}/>
                                </div>
                            </Col>
                            <Col span={8}>
                                <div className="space-y-4">
                                    <ResourceCard title="上行带宽" icon={<CloudSyncOutlined className="text-cyan-500"/>}
                                                  value={`已用 ${currentStatus.network_u || 0} / ${config.speed_u || 0} Mbps`}
                                                  subValue="使用率"
                                                  percent={config.speed_u > 0 ? Math.round((currentStatus.network_u || 0) / config.speed_u * 100) : 0}
                                                  color={getProgressBarColor(config.speed_u > 0 ? Math.round((currentStatus.network_u || 0) / config.speed_u * 100) : 0)}/>
                                    <ResourceCard title="下行带宽" icon={<CloudSyncOutlined className="text-cyan-600"/>}
                                                  value={`已用 ${currentStatus.network_d || 0} / ${config.speed_d || 0} Mbps`}
                                                  subValue="使用率"
                                                  percent={config.speed_d > 0 ? Math.round((currentStatus.network_d || 0) / config.speed_d * 100) : 0}
                                                  color={getProgressBarColor(config.speed_d > 0 ? Math.round((currentStatus.network_d || 0) / config.speed_d * 100) : 0)}/>
                                    <ResourceCard title="反向代理" icon={<GlobalOutlined className="text-pink-500"/>}
                                                  value={`已用 ${config.web_all ? Object.keys(config.web_all).length : 0} / ${config.web_num || 0} 个`}
                                                  subValue="使用率"
                                                  percent={config.web_num > 0 ? Math.round((config.web_all ? Object.keys(config.web_all).length : 0) / config.web_num * 100) : 0}
                                                  color={getProgressBarColor(config.web_num > 0 ? Math.round((config.web_all ? Object.keys(config.web_all).length : 0) / config.web_num * 100) : 0)}/>
                                </div>
                            </Col>
                        </Row>

                        {/* 网络配置 */}
                        <Divider style={{margin: '12px 0 8px'}}/>
                        <Descriptions title="网络配置" size="small" column={4} bordered style={{tableLayout: 'fixed'}} labelStyle={{width: '150px'}} contentStyle={{width: '100px'}}>
                            <Descriptions.Item label="上行带宽">{config.speed_u || 0} Mbps</Descriptions.Item>
                            <Descriptions.Item label="下行带宽">{config.speed_d || 0} Mbps</Descriptions.Item>
                            <Descriptions.Item label="端口配额">{config.nat_num || 0} 个</Descriptions.Item>
                            <Descriptions.Item label="代理配额">{config.web_num || 0} 个</Descriptions.Item>
                            <Descriptions.Item label="流量配额">{config.flu_num > 0 ? formatDisk(config.flu_num) : '无限制'}</Descriptions.Item>
                            <Descriptions.Item label="重置周期">{config.flu_rst?.[0] || 31} 天</Descriptions.Item>
                            <Descriptions.Item label="超限速率">{config.flu_rst?.[1] || 0} Mbps</Descriptions.Item>
                            <Descriptions.Item label="上次重置">{config.flu_rst?.[2] ? (config.flu_rst[2] > 100 ? new Date(config.flu_rst[2] * 1000).toLocaleDateString() : '-') : '-'}</Descriptions.Item>
                        </Descriptions>
                        <br></br>
                        {/* 配额配置 */}
                        <Divider style={{margin: '12px 0 8px'}}/>
                        <Descriptions title="配额配置" size="small" column={4} bordered style={{tableLayout: 'fixed'}} labelStyle={{width: '150px'}} contentStyle={{width: '100px'}}>
                            <Descriptions.Item label="备份配额">{config.bak_num ?? 1}</Descriptions.Item>
                            <Descriptions.Item label="光盘配额">{config.iso_num ?? 1}</Descriptions.Item>
                            <Descriptions.Item label="PCI 配额">{config.pci_num ?? 0}</Descriptions.Item>
                            <Descriptions.Item label="USB 配额">{config.usb_num ?? 0}</Descriptions.Item>
                            <Descriptions.Item label="数据盘配额">{config.dat_num ?? 1}</Descriptions.Item>
                            <Descriptions.Item label="数据盘容量">{config.dat_all ? formatDisk(config.dat_all) : 'N/A'}</Descriptions.Item>
                            <Descriptions.Item label="处理器配额">{config.cpu_per ? `${config.cpu_per}%` : 'N/A'}</Descriptions.Item>
                            <Descriptions.Item label="系统盘IOPS">{config.hdd_iop || 0}</Descriptions.Item>
                        </Descriptions>
                    </Card>
                </div>
            </Col>

            {/* 右侧面板：历史资源用量 */}
            <Col span={8} style={{padding: '0'}}>
                <Card title="资源用量" size="small" variant="borderless" className="shadow-sm glass-card-transparent h-full" style={{padding: '0', minHeight: '780px'}}
                      extra={
                          <Radio.Group value={timeRange} onChange={e => setTimeRange(e.target.value)} size="small"
                                       optionType="button" buttonStyle="solid">
                              <Radio.Button value={30}>30分</Radio.Button>
                              <Radio.Button value={180}>3时</Radio.Button>
                              <Radio.Button value={360}>6时</Radio.Button>
                              <Radio.Button value={1440}>24时</Radio.Button>
                              <Radio.Button value={4320}>3天</Radio.Button>
                              <Radio.Button value={10080}>7天</Radio.Button>
                              <Radio.Button value={21600}>15天</Radio.Button>
                              <Radio.Button value={43200}>30天</Radio.Button>
                          </Radio.Group>
                      }
                >
                    <div className="mb-4 text-center">
                        <Radio.Group value={chartView} onChange={e => setChartView(e.target.value)} size="small">
                            <Radio.Button value="performance">性能</Radio.Button>
                            <Radio.Button value="resource">资源</Radio.Button>
                            <Radio.Button value="network">网络</Radio.Button>
                        </Radio.Group>
                    </div>

                    <div className="space-y-4 flex flex-col" style={{padding: '0'}}>
                        {chartView === 'performance' && (
                            <>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '344px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('CPU使用率', monitorData.cpu, '#3b82f6', monitorData.labels)}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '343px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('RAM使用率', monitorData.memory, '#f59e0b', monitorData.labels)}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '343px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('GPU使用率', monitorData.gpu, '#8b5cf6', monitorData.labels, 'MB')}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                            </>
                        )}
                        {chartView === 'resource' && (
                            <>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '344px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('硬盘使用率', monitorData.disk, '#10b981', monitorData.labels)}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '343px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('流量使用率', monitorData.traffic, '#ef4444', monitorData.labels, 'GB')}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '343px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('端口使用数', monitorData.nat, '#6366f1', monitorData.labels, '个')}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                            </>
                        )}
                        {chartView === 'network' && (
                            <>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '344px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('上行带宽率', monitorData.netUp, '#06b6d4', monitorData.labels, 'Mbps')}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '343px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('下行带宽率', monitorData.netDown, '#0891b2', monitorData.labels, 'Mbps')}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                                <div className="backdrop-blur-md bg-white/10 dark:bg-black/10 rounded p-2 overflow-hidden flex-shrink-0" style={{height: '343px', borderRadius: '20px'}}>
                                    <ReactECharts
                                        option={getChartOption('反向代理数', monitorData.proxy, '#ec4899', monitorData.labels, '个')}
                                        style={{height: '100%', width: '100%'}}
                                        notMerge={true}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </Card>
            </Col>
        </Row>
    );

    const tabItems = [
        {key: 'overview', label: '实例概览', children: overviewTab},
        {
            key: 'ip',
            label: '网卡管理',
            children: <Card title="网卡列表" extra={<Space>
                                <Segmented
                                    value={nicViewMode}
                                    onChange={(val) => setNicViewMode(val as 'card' | 'table')}
                                    options={[
                                        { value: 'card', icon: <AppstoreOutlined /> },
                                        { value: 'table', icon: <UnorderedListOutlined /> },
                                    ]}
                                    size="small"
                                />
                                <Button type="primary" icon={<PlusOutlined/>}
                                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.NIC_EDITS) || (config.nic_num !== undefined && config.nic_all && Object.keys(config.nic_all).length >= (config.nic_num || 0))}
                                                            onClick={() => setIpModalVisible(true)}>添加网卡</Button>
                            </Space>}
                            variant="borderless">
                {vm && vm.config && vm.config.nic_all && Object.keys(vm.config.nic_all).length > 0 ? (
                    nicViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(vm.config.nic_all).map(([nicName, nicConfig]: [string, any]) => (
                            <div key={nicName} className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-400 dark:hover:border-blue-500">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded">
                                            {nicName}
                                        </span>
                                        <Tag color={nicConfig.nic_type === 'pub' ? 'blue' : 'green'}>
                                            {nicConfig.nic_type === 'pub' ? '公网' : '内网'}
                                        </Tag>
                                    </div>
                                    <Button danger size="small"
                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.NIC_EDITS)}
                                            onClick={() => handleDeleteIPAddress(nicName)}>删除</Button>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span style={{ color: 'var(--text-secondary)' }}>IPv4</span>
                                        <span className="font-mono">{nicConfig.ip4_addr || '-'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span style={{ color: 'var(--text-secondary)' }}>IPv6</span>
                                        <span className="font-mono text-xs break-all">{nicConfig.ip6_addr || '-'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span style={{ color: 'var(--text-secondary)' }}>MAC</span>
                                        <span className="font-mono text-xs">{nicConfig.mac_addr || '-'}</span>
                                    </div>
                                    {nicConfig.nic_bridge && (
                                        <div className="flex items-center justify-between">
                                            <span style={{ color: 'var(--text-secondary)' }}>网桥</span>
                                            <span className="font-mono text-xs">{nicConfig.nic_bridge}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    ) : (
                    <Table
                        dataSource={Object.entries(vm.config.nic_all).map(([nicName, nicConfig]: [string, any]) => ({ key: nicName, nicName, ...nicConfig }))}
                        pagination={false}
                        size="small"
                        columns={[
                            { title: '网卡名称', dataIndex: 'nicName', key: 'nicName', render: (text: string) => <code className="text-xs">{text}</code> },
                            { title: '类型', dataIndex: 'nic_type', key: 'nic_type', render: (text: string) => <Tag color={text === 'pub' ? 'blue' : 'green'}>{text === 'pub' ? '公网' : '内网'}</Tag> },
                            { title: 'IPv4', dataIndex: 'ip4_addr', key: 'ip4_addr', render: (text: string) => <span className="font-mono text-xs">{text || '-'}</span> },
                            { title: 'IPv6', dataIndex: 'ip6_addr', key: 'ip6_addr', render: (text: string) => <span className="font-mono text-xs">{text || '-'}</span> },
                            { title: 'MAC', dataIndex: 'mac_addr', key: 'mac_addr', render: (text: string) => <span className="font-mono text-xs">{text || '-'}</span> },
                            { title: '操作', key: 'action', render: (_: any, record: any) => (
                                <Button danger size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.NIC_EDITS)} onClick={() => handleDeleteIPAddress(record.nicName)}>删除</Button>
                            )},
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>暂无网卡配置</div>
                )}
            </Card>
        },
        {
            key: 'hdd',
            label: '数据磁盘',
            children: <Card title="数据盘管理" extra={<Space>
                                <Segmented
                                    value={hddViewMode}
                                    onChange={(val) => setHddViewMode(val as 'card' | 'table')}
                                    options={[
                                        { value: 'card', icon: <AppstoreOutlined /> },
                                        { value: 'table', icon: <UnorderedListOutlined /> },
                                    ]}
                                    size="small"
                                />
                                <Button type="primary" icon={<PlusOutlined/>}
                                                              disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS) || (config.dat_num > 0 && hdds.length >= config.dat_num)}
                                                              onClick={() => setHddModalVisible(true)}>挂载数据盘</Button>
                            </Space>}
                            variant="borderless">
                {hdds && hdds.length > 0 ? (
                    hddViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {hdds.map((hdd, index) => {
                            const hddName = hdd.hdd_path || `hdd-${index}`
                            const isMounted = hdd.hdd_flag === 1
                            const sizeGB = ((hdd.hdd_size || 0) / 1024).toFixed(1)
                            const typeText = hdd.hdd_type === 1 ? 'SSD' : 'HDD'
                            return (
                                <div key={hddName}
                                     className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-400 dark:hover:border-purple-500">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex gap-2">
                                            <span
                                                className="px-2 py-0.5 text-xs font-medium text-blue-700 rounded">
                                                {typeText}
                                            </span>
                                            <Tag color={isMounted ? 'green' : 'orange'}>
                                                {isMounted ? '已挂载' : '未挂载'}
                                            </Tag>
                                        </div>
                                        <Space>
                                            {isMounted ? (
                                                <>
                                                    <Button size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)} onClick={() => {
                                                        setCurrentUnmountHdd(hdd);
                                                        setUnmountHddConfirmChecked(false);
                                                        setUnmountHddModalVisible(true)
                                                    }}>卸载</Button>
                                                    <Button danger size="small"
                                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)}
                                                            onClick={() => handleDeleteHDD(hddName)}>删除</Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button type="primary" size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)} onClick={() => {
                                                        setCurrentMountHdd(hdd);
                                                        setMountHddConfirmChecked(false);
                                                        setMountHddModalVisible(true)
                                                    }}>挂载</Button>
                                                    <Button size="small"
                                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)}
                                                            onClick={() => handleOpenTransferHDD(hdd)}>移交</Button>
                                                    <Button danger size="small"
                                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)}
                                                            onClick={() => handleDeleteHDD(hddName)}>删除</Button>
                                                </>
                                            )}
                                        </Space>
                                    </div>
                                    <div className="rounded-lg p-3 mb-2">
                                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>磁盘名称</p>
                                        <code className="text-sm font-mono break-all">{hddName}</code>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span style={{ color: 'var(--text-secondary)' }}>容量</span>
                                        <code
                                            className="px-2 py-0.5 font-medium font-mono dark:bg-gray-700/50 rounded">{sizeGB} GB</code>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    ) : (
                    <Table
                        dataSource={hdds.map((hdd, index) => ({ key: hdd.hdd_path || `hdd-${index}`, ...hdd, _index: index }))}
                        pagination={false}
                        size="small"
                        columns={[
                            { title: '磁盘名称', dataIndex: 'hdd_path', key: 'hdd_path', render: (text: string, _r: any, i: number) => <code className="text-xs font-mono">{text || `hdd-${i}`}</code> },
                            { title: '类型', dataIndex: 'hdd_type', key: 'hdd_type', render: (val: number) => <Tag color={val === 1 ? 'blue' : 'default'}>{val === 1 ? 'SSD' : 'HDD'}</Tag> },
                            { title: '容量', dataIndex: 'hdd_size', key: 'hdd_size', render: (val: number) => <span className="font-mono text-xs">{((val || 0) / 1024).toFixed(1)} GB</span> },
                            { title: '状态', dataIndex: 'hdd_flag', key: 'hdd_flag', render: (val: number) => <Tag color={val === 1 ? 'green' : 'orange'}>{val === 1 ? '已挂载' : '未挂载'}</Tag> },
                            { title: '操作', key: 'action', render: (_: any, record: any) => {
                                const hddName = record.hdd_path || `hdd-${record._index}`
                                const isMounted = record.hdd_flag === 1
                                return (
                                    <Space size="small">
                                        {isMounted ? (
                                            <>
                                                <Button size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)} onClick={() => { setCurrentUnmountHdd(record); setUnmountHddConfirmChecked(false); setUnmountHddModalVisible(true) }}>卸载</Button>
                                                <Button danger size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)} onClick={() => handleDeleteHDD(hddName)}>删除</Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button type="primary" size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)} onClick={() => { setCurrentMountHdd(record); setMountHddConfirmChecked(false); setMountHddModalVisible(true) }}>挂载</Button>
                                                <Button size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)} onClick={() => handleOpenTransferHDD(record)}>移交</Button>
                                                <Button danger size="small" disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)} onClick={() => handleDeleteHDD(hddName)}>删除</Button>
                                            </>
                                        )}
                                    </Space>
                                )
                            }},
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>暂无数据盘</div>
                )}
            </Card>
        },
        {
            key: 'iso',
            label: '光盘镜像',
            children: <Card title="ISO镜像管理" extra={<Space>
                                <Segmented
                                    value={isoViewMode}
                                    onChange={(val) => setIsoViewMode(val as 'card' | 'table')}
                                    options={[
                                        { value: 'card', icon: <AppstoreOutlined /> },
                                        { value: 'table', icon: <UnorderedListOutlined /> },
                                    ]}
                                    size="small"
                                />
                                <Button type="primary" icon={<PlusOutlined/>}
                                                               disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.ISO_EDITS) || (config.iso_num > 0 && isos.length >= config.iso_num)}
                                                               onClick={() => setIsoModalVisible(true)}>挂载ISO</Button>
                            </Space>}
                            variant="borderless">
                {isos && isos.length > 0 ? (
                    isoViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {isos.map((iso, index) => (
                            <div key={iso.iso_name || `iso-${index}`}
                                 className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-400 dark:hover:border-purple-500">
                                <div className="flex items-center justify-between mb-3">
                                    <span
                                        className="px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded">
                                        ISO
                                    </span>
                                    <Button danger size="small" icon={<span className="iconify" data-icon="mdi:eject"/>}
                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.ISO_EDITS)}
                                            onClick={() => {
                                                setCurrentUnmountIso(iso.iso_name!);
                                                setUnmountIsoConfirmChecked(false);
                                                setUnmountIsoConfirmVisible(true)
                                            }}>卸载</Button>
                                </div>
                                <div className="space-y-2">
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>挂载名称</p>
                                        <code
                                            className="text-sm font-mono break-all">{iso.iso_name || '-'}</code>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>文件名</p>
                                        <code
                                            className="text-sm font-mono break-all">{iso.iso_file || '-'}</code>
                                    </div>
                                    {iso.iso_hint && (
                                        <div className=" rounded-lg p-3">
                                            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>备注</p>
                                            <p className="text-sm">{iso.iso_hint}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    ) : (
                    <Table
                        dataSource={isos.map((iso, index) => ({ key: iso.iso_name || `iso-${index}`, ...iso, _index: index }))}
                        pagination={false}
                        size="small"
                        columns={[
                            { title: '挂载名称', dataIndex: 'iso_name', key: 'iso_name', render: (text: string) => <code className="text-xs font-mono">{text || '-'}</code> },
                            { title: '文件名', dataIndex: 'iso_file', key: 'iso_file', render: (text: string) => <code className="text-xs font-mono break-all">{text || '-'}</code> },
                            { title: '备注', dataIndex: 'iso_hint', key: 'iso_hint', render: (text: string) => <span>{text || '-'}</span> },
                            { title: '操作', key: 'action', render: (_: any, record: any) => (
                                <Button danger size="small" icon={<span className="iconify" data-icon="mdi:eject"/>}
                                        disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.ISO_EDITS)}
                                        onClick={() => {
                                            setCurrentUnmountIso(record.iso_name!);
                                            setUnmountIsoConfirmChecked(false);
                                            setUnmountIsoConfirmVisible(true)
                                        }}>卸载</Button>
                            )},
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>暂无ISO挂载</div>
                )}
            </Card>
        },
        {
            key: 'nat',
            label: '端口映射',
            children: <Card title="NAT端口转发规则"
                            extra={<Space>
                                <Segmented
                                    value={natViewMode}
                                    onChange={(val) => setNatViewMode(val as 'card' | 'table')}
                                    options={[
                                        { value: 'card', icon: <AppstoreOutlined /> },
                                        { value: 'table', icon: <UnorderedListOutlined /> },
                                    ]}
                                    size="small"
                                />
                                <Button type="primary" icon={<PlusOutlined/>} disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.NET_EDITS) || (config.nat_num > 0 && natRules.length >= config.nat_num)} onClick={() => {
                                    setNatModalVisible(true);
                                    form.setFieldsValue({lan_addr: availableIPs[0]})
                                }}>添加规则</Button>
                            </Space>} variant="borderless">
                {natRules && natRules.length > 0 ? (
                    natViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {natRules.map((rule, index) => (
                            <div key={`nat-${index}`}
                                 className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-400 dark:hover:border-blue-500">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded">
                                        端口转发
                                    </span>
                                    <Button danger size="small"
                                            icon={<DeleteOutlined/>}
                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.NET_EDITS)}
                                            onClick={() => handleDeleteNAT(index)}>删除</Button>
                                </div>
                                <div className="space-y-2">
                                    {/* 外网信息 */}
                                    <div className="rounded-lg p-3" style={{ background: 'var(--bg-secondary, rgba(59,130,246,0.08))' }}>
                                        <p className="text-xs mb-1 font-medium text-blue-600 dark:text-blue-400">外网 (WAN)</p>
                                        <div className="flex items-center justify-between text-sm">
                                            <code className="font-mono text-blue-700 dark:text-blue-300">{hostConfig?.public_addr?.[0] || hostName || '-'}</code>
                                            <span className="font-mono font-medium">:{rule.wan_port || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
                                        <span className="iconify" data-icon="mdi:arrow-down" style={{width: '20px', height: '20px'}}></span>
                                    </div>
                                    {/* 内网信息 */}
                                    <div className="rounded-lg p-3" style={{ background: 'var(--bg-secondary, rgba(34,197,94,0.08))' }}>
                                        <p className="text-xs mb-1 font-medium text-green-600 dark:text-green-400">内网 (LAN)</p>
                                        <div className="flex items-center justify-between text-sm">
                                            <code className="font-mono text-green-700 dark:text-green-300">{rule.lan_addr || '-'}</code>
                                            <span className="font-mono font-medium">:{rule.lan_port || '-'}</span>
                                        </div>
                                    </div>
                                    {rule.nat_tips && (
                                        <div className="rounded-lg p-3 mt-2" style={{ background: 'var(--bg-secondary, rgba(234,179,8,0.08))' }}>
                                            <p className="text-xs mb-1">备注</p>
                                            <p className="text-sm">{rule.nat_tips}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    ) : (
                    <Table
                        dataSource={natRules.map((rule, index) => ({ ...rule, _index: index }))}
                        rowKey={(record) => `nat-${record._index}`}
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: '外网IP',
                                key: 'wan_ip',
                                render: () => <code className="px-1.5 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">{hostConfig?.public_addr?.[0] || hostName || '-'}</code>,
                            },
                            {
                                title: '外网端口',
                                dataIndex: 'wan_port',
                                key: 'wan_port',
                                render: (text: any) => <span className="font-mono">{text || '-'}</span>,
                            },
                            {
                                title: '内网IP',
                                dataIndex: 'lan_addr',
                                key: 'lan_addr',
                                render: (text: string) => <code className="px-1.5 py-0.5 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">{text || '-'}</code>,
                            },
                            {
                                title: '内网端口',
                                dataIndex: 'lan_port',
                                key: 'lan_port',
                                render: (text: any) => <span className="font-mono">{text || '-'}</span>,
                            },
                            {
                                title: '备注',
                                dataIndex: 'nat_tips',
                                key: 'nat_tips',
                                render: (text: string) => <span>{text || '-'}</span>,
                            },
                            {
                                title: '操作',
                                key: 'action',
                                render: (_: any, record: any) => (
                                    <Button danger size="small" icon={<DeleteOutlined/>}
                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.NET_EDITS)}
                                            onClick={() => handleDeleteNAT(record._index)}>删除</Button>
                                ),
                            },
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center  py-8">暂无NAT端口转发规则</div>
                )}
            </Card>
        },
        {
            key: 'proxy',
            label: '反向代理',
            children: <Card title="反向代理配置" extra={<Space>
                <Segmented
                    value={proxyViewMode}
                    onChange={(val) => setProxyViewMode(val as 'card' | 'table')}
                    options={[
                        { value: 'card', icon: <AppstoreOutlined /> },
                        { value: 'table', icon: <UnorderedListOutlined /> },
                    ]}
                    size="small"
                />
                <Button type="primary" icon={<PlusOutlined/>} disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.WEB_EDITS) || (config.web_num > 0 && proxyRules.length >= config.web_num)} onClick={() => {
                setProxyModalVisible(true);
                proxyForm.setFieldsValue({backend_ip: availableIPs[0]})
            }}>添加代理</Button>
            </Space>} variant="borderless">
                {proxyRules && proxyRules.length > 0 ? (
                    proxyViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {proxyRules.map((proxy, index) => (
                            <div key={proxy.id || `proxy-${index}`}
                                 className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-pink-400 dark:hover:border-pink-500">
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                        proxy.ssl_enabled
                                            ? 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40'
                                            : 'bg-gray-100 dark:bg-gray-700/40'
                                    }`}>
                                        {proxy.ssl_enabled ? 'HTTPS' : 'HTTP'}
                                    </span>
                                    <Button danger size="small"
                                            icon={<DeleteOutlined/>}
                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.WEB_EDITS)}
                                            onClick={() => handleDeleteProxy(index)}>删除</Button>
                                </div>
                                <div className="rounded-lg p-3 mb-2">
                                    <p className="text-xs mb-1">域名</p>
                                    <code className="text-sm font-mono break-all">{proxy.domain}</code>
                                </div>
                                <div className="flex items-center justify-between text-xs mb-2">
                                    <span className="">后端地址</span>
                                    <code className="px-2 py-0.5 font-medium font-mono dark:bg-gray-700/50 rounded">
                                        {proxy.backend_ip || '默认'}:{proxy.backend_port}
                                    </code>
                                </div>
                                {proxy.description && (
                                    <p className="text-xs  mt-2">{proxy.description}</p>
                                )}
                            </div>
                        ))}
                    </div>
                    ) : (
                    <Table
                        dataSource={proxyRules.map((proxy, index) => ({ ...proxy, _index: index }))}
                        rowKey={(record) => `proxy-${record._index}`}
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: '域名',
                                dataIndex: 'domain',
                                key: 'domain',
                                render: (text: string) => <code className="text-sm font-mono break-all">{text}</code>,
                            },
                            {
                                title: '协议',
                                key: 'protocol',
                                render: (_: any, record: any) => (
                                    <Tag color={record.ssl_enabled ? 'green' : 'default'}>
                                        {record.ssl_enabled ? 'HTTPS' : 'HTTP'}
                                    </Tag>
                                ),
                            },
                            {
                                title: '后端地址',
                                key: 'backend',
                                render: (_: any, record: any) => <code className="font-mono text-xs">{record.backend_ip || '默认'}:{record.backend_port}</code>,
                            },
                            {
                                title: '描述',
                                dataIndex: 'description',
                                key: 'description',
                                render: (text: string) => <span>{text || '-'}</span>,
                            },
                            {
                                title: '操作',
                                key: 'action',
                                render: (_: any, record: any) => (
                                    <Button danger size="small" icon={<DeleteOutlined/>}
                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.WEB_EDITS)}
                                            onClick={() => handleDeleteProxy(record._index)}>删除</Button>
                                ),
                            },
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center  py-8">暂无反向代理配置</div>
                )}
            </Card>
        },
        {
            key: 'pci',
            label: 'PCI设备',
            children: <Card title="PCI设备直通" extra={<Space>
                <Segmented
                    value={pciViewMode}
                    onChange={(val) => setPciViewMode(val as 'card' | 'table')}
                    options={[
                        { value: 'card', icon: <AppstoreOutlined /> },
                        { value: 'table', icon: <UnorderedListOutlined /> },
                    ]}
                    size="small"
                />
                <Button type="primary" icon={<PlusOutlined/>}
                                                            disabled={operationLocked || (config.pci_num > 0 && vm && vm.config && vm.config.pci_all && Object.keys(vm.config.pci_all).length >= config.pci_num)}
                                                            onClick={handleOpenPciModal}>添加PCI设备</Button>
            </Space>}
                            variant="borderless">
                {vm && vm.config && vm.config.pci_all && Object.keys(vm.config.pci_all).length > 0 ? (
                    pciViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(vm.config.pci_all).map(([gpuKey, gpuConfig]: [string, any]) => (
                            <div key={gpuKey} className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-orange-400 dark:hover:border-orange-500">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 rounded">
                                        PCI设备
                                    </span>
                                    <Space>
                                        <Tag color={gpuConfig.gpu_mdev === 'PV' ? 'blue' : gpuConfig.gpu_mdev === 'DDA' ? 'orange' : 'green'}>{gpuConfig.gpu_mdev || '直通'}</Tag>
                                        <Button danger size="small" disabled={operationLocked} onClick={() => handleDeleteGpu(gpuKey)}>删除</Button>
                                    </Space>
                                </div>
                                <div className="rounded-lg p-3 mb-2">
                                    <p className="text-xs mb-1">设备名称</p>
                                    <code className="text-sm font-mono break-all">{gpuConfig.gpu_hint || gpuKey}</code>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span>设备ID</span>
                                    <code className="px-2 py-0.5 font-medium font-mono dark:bg-gray-700/50 rounded">{gpuConfig.gpu_uuid || '-'}</code>
                                </div>
                            </div>
                        ))}
                    </div>
                    ) : (
                    <Table
                        dataSource={Object.entries(vm.config.pci_all).map(([gpuKey, gpuConfig]: [string, any]) => ({ gpuKey, ...gpuConfig }))}
                        rowKey="gpuKey"
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: '设备名称',
                                key: 'name',
                                render: (_: any, record: any) => <span className="font-medium">{record.gpu_hint || record.gpuKey}</span>,
                            },
                            {
                                title: '设备ID',
                                dataIndex: 'gpu_uuid',
                                key: 'gpu_uuid',
                                render: (text: string) => <code className="font-mono text-xs">{text || '-'}</code>,
                            },
                            {
                                title: '类型',
                                dataIndex: 'gpu_mdev',
                                key: 'gpu_mdev',
                                render: (text: string) => <Tag color={text === 'PV' ? 'blue' : text === 'DDA' ? 'orange' : 'green'}>{text || '直通'}</Tag>,
                            },
                            {
                                title: '操作',
                                key: 'action',
                                render: (_: any, record: any) => (
                                    <Button danger size="small" disabled={operationLocked} onClick={() => handleDeleteGpu(record.gpuKey)}>删除</Button>
                                ),
                            },
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center  py-8">暂无PCI直通设备</div>
                )}
            </Card>
        },
        {
            key: 'usb',
            label: 'USB设备',
            children: <Card title="USB设备管理" extra={<Space>
                <Segmented
                    value={usbViewMode}
                    onChange={(val) => setUsbViewMode(val as 'card' | 'table')}
                    options={[
                        { value: 'card', icon: <AppstoreOutlined /> },
                        { value: 'table', icon: <UnorderedListOutlined /> },
                    ]}
                    size="small"
                />
                <Button type="primary" icon={<PlusOutlined/>} disabled={operationLocked || (config.usb_num > 0 && usbList.length >= config.usb_num)} onClick={handleOpenUsbModal}>添加USB设备</Button>
            </Space>} variant="borderless">
                {usbList && usbList.length > 0 ? (
                    usbViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {usbList.map((usb, index) => (
                            <div key={usb.key || `usb-${index}`}
                                 className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-400 dark:hover:border-blue-500">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded">
                                        USB设备
                                    </span>
                                    <Button danger size="small" icon={<DeleteOutlined/>} disabled={operationLocked} onClick={() => handleDeleteUSB(usb.key)} loading={usbActionLoading}>删除</Button>
                                </div>
                                <div className="rounded-lg p-3 mb-2">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-xs ">VID</span>
                                        <code className="text-sm font-mono">{usb.vid_uuid || '-'}</code>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-xs ">PID</span>
                                        <code className="text-sm font-mono">{usb.pid_uuid || '-'}</code>
                                    </div>
                                </div>
                                {usb.usb_hint && (
                                    <p className="text-xs  mt-2">{usb.usb_hint}</p>
                                )}
                            </div>
                        ))}
                    </div>
                    ) : (
                    <Table
                        dataSource={usbList.map((usb, index) => ({ ...usb, _index: index }))}
                        rowKey={(record) => record.key || `usb-${record._index}`}
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: 'VID',
                                dataIndex: 'vid_uuid',
                                key: 'vid_uuid',
                                render: (text: string) => <code className="font-mono text-xs">{text || '-'}</code>,
                            },
                            {
                                title: 'PID',
                                dataIndex: 'pid_uuid',
                                key: 'pid_uuid',
                                render: (text: string) => <code className="font-mono text-xs">{text || '-'}</code>,
                            },
                            {
                                title: '备注',
                                dataIndex: 'usb_hint',
                                key: 'usb_hint',
                                render: (text: string) => <span>{text || '-'}</span>,
                            },
                            {
                                title: '操作',
                                key: 'action',
                                render: (_: any, record: any) => (
                                    <Button danger size="small" icon={<DeleteOutlined/>} disabled={operationLocked} onClick={() => handleDeleteUSB(record.key)} loading={usbActionLoading}>删除</Button>
                                ),
                            },
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center  py-8">暂无USB直通设备</div>
                )}
            </Card>
        },
        {
            key: 'backup',
            label: '备份管理',
            children: <Card title="备份管理" extra={<Space>
                <Segmented
                    value={backupViewMode}
                    onChange={(val) => setBackupViewMode(val as 'card' | 'table')}
                    options={[
                        { value: 'card', icon: <AppstoreOutlined /> },
                        { value: 'table', icon: <UnorderedListOutlined /> },
                    ]}
                    size="small"
                />
                <Button type="primary" icon={<PlusOutlined/>}
                                                            disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP) || (config.bak_num > 0 && backups.length >= config.bak_num)}
                                                            onClick={() => setBackupModalVisible(true)}>创建备份</Button>
            </Space>}
                            variant="borderless">
                {backups && backups.length > 0 ? (
                    backupViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {backups.map((backup, index) => {
                            const backupDate = backup.backup_time ? new Date(backup.backup_time * 1000).toLocaleString('zh-CN') : (backup.created_time || '未知时间')
                            const backupHint = backup.backup_hint || ''
                            return (
                                <div key={backup.backup_name || `backup-${index}`}
                                     className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-400 dark:hover:border-purple-500">
                                    <div className="flex items-center justify-between mb-3">
                                        <span
                      className="px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 rounded">
                                            备份
                                        </span>
                                        <Space>
                                            <Button size="small"
                                                    icon={<span className="iconify" data-icon="mdi:restore"/>}
                                                    disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                                                    onClick={() => {
                                                        setCurrentRestoreBackup(backup.backup_name!);
                                                        setRestoreConfirmChecked1(false);
                                                        setRestoreConfirmChecked2(false);
                                                        setRestoreBackupModalVisible(true)
                                                    }}>恢复</Button>
                                            <Button danger size="small"
                                                    icon={<span className="iconify" data-icon="mdi:delete"/>}
                                                    disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                                                    onClick={() => handleDeleteBackup(backup.backup_name!)}>删除</Button>
                                        </Space>
                                    </div>
                                    <div className="rounded-lg p-3 mb-2">
                                        <p className="text-xs mb-1">备份名称</p>
                                        <code
                                            className="text-sm font-mono break-all">{backup.backup_name || '-'}</code>
                                    </div>
                                    {backupHint && (
                                        <div className="mb-2">
                                            <p className="text-xs mb-1">备份注释</p>
                                            <p className="text-sm">{backupHint}</p>
                                        </div>
                                    )}
                                    <div className="text-xs  ">
                                        <span className="iconify inline" data-icon="mdi:clock-outline"
                                              style={{width: '14px'}}></span>
                                        {' '}{backupDate}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    ) : (
                    <Table
                        dataSource={backups.map((backup, index) => ({ ...backup, _index: index }))}
                        rowKey={(record) => record.backup_name || `backup-${record._index}`}
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: '备份名称',
                                dataIndex: 'backup_name',
                                key: 'backup_name',
                                render: (text: string) => <code className="font-mono text-xs break-all">{text || '-'}</code>,
                            },
                            {
                                title: '备份时间',
                                key: 'backup_time',
                                render: (_: any, record: any) => {
                                    const t = record.backup_time ? new Date(record.backup_time * 1000).toLocaleString('zh-CN') : (record.created_time || '-')
                                    return <span className="text-xs">{t}</span>
                                },
                            },
                            {
                                title: '备注',
                                dataIndex: 'backup_hint',
                                key: 'backup_hint',
                                render: (text: string) => <span>{text || '-'}</span>,
                            },
                            {
                                title: '操作',
                                key: 'action',
                                render: (_: any, record: any) => (
                                    <Space size="small">
                                        <Button size="small"
                                                disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                                                onClick={() => {
                                                    setCurrentRestoreBackup(record.backup_name!);
                                                    setRestoreConfirmChecked1(false);
                                                    setRestoreConfirmChecked2(false);
                                                    setRestoreBackupModalVisible(true)
                                                }}>恢复</Button>
                                        <Button danger size="small"
                                                disabled={operationLocked || !hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                                                onClick={() => handleDeleteBackup(record.backup_name!)}>删除</Button>
                                    </Space>
                                ),
                            },
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center  py-8">暂无备份</div>
                )}
            </Card>
        },
        {
            key: 'efi',
            label: '启动顺序',
            children: <Card title="启动顺序管理" extra={
                <Space>
                    <Segmented
                        value={efiViewMode}
                        onChange={(val) => setEfiViewMode(val as 'card' | 'table')}
                        options={[
                            { value: 'card', icon: <AppstoreOutlined /> },
                            { value: 'table', icon: <UnorderedListOutlined /> },
                        ]}
                        size="small"
                    />
                    {!efiEditing ? (
                        <>
                            <Button icon={<ReloadOutlined/>} onClick={loadEFIList} loading={efiLoading}>刷新</Button>
                            <Button type="primary" icon={<EditOutlined/>}
                                    disabled={!hasPermission(userPermissions, VM_PERMISSION.EFI_EDITS) || efiList.length === 0}
                                    onClick={() => { setEfiEditList([...efiList]); setEfiEditing(true) }}>编辑顺序</Button>
                        </>
                    ) : (
                        <>
                            <Button onClick={() => setEfiEditing(false)}>取消</Button>
                            <Button type="primary" loading={efiActionLoading}
                                    onClick={handleSaveEFI}>保存</Button>
                        </>
                    )}
                </Space>
            } variant="borderless">
                {efiLoading ? (
                    <div className="text-center py-8"><Spin tip="加载启动项..."/></div>
                ) : (efiEditing ? efiEditList : efiList).length > 0 ? (
                    efiViewMode === 'card' ? (
                    <div className="space-y-2">
                        {(efiEditing ? efiEditList : efiList).map((item, index) => (
                            <div key={`efi-${index}`}
                                 className="glass-card flex items-center justify-between px-4 py-3 hover:shadow-md transition-all duration-200">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-bold text-blue-500 w-8 text-center">#{index + 1}</span>
                                    <span className="iconify text-xl" data-icon={item.efi_type ? 'mdi:disc' : 'mdi:harddisk'} style={{color: item.efi_type ? '#f59e0b' : '#3b82f6'}}></span>
                                    <div>
                                        <div className="font-medium">{item.efi_name || (item.efi_type ? 'CD/DVD' : '硬盘')}</div>
                                        <div className="text-xs" style={{color: 'var(--text-secondary)'}}>
                                            {item.efi_type ? '光盘/网络启动' : '硬盘启动'}
                                        </div>
                                    </div>
                                </div>
                                {efiEditing && (
                                    <Space>
                                        <Button size="small" icon={<span className="iconify" data-icon="mdi:arrow-up"/>}
                                                disabled={index === 0}
                                                onClick={() => handleEfiMoveUp(index)}>上移</Button>
                                        <Button size="small" icon={<span className="iconify" data-icon="mdi:arrow-down"/>}
                                                disabled={index === efiEditList.length - 1}
                                                onClick={() => handleEfiMoveDown(index)}>下移</Button>
                                    </Space>
                                )}
                            </div>
                        ))}
                    </div>
                    ) : (
                    <Table
                        dataSource={(efiEditing ? efiEditList : efiList).map((item, index) => ({ ...item, _index: index }))}
                        rowKey={(record) => `efi-${record._index}`}
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: '顺序',
                                key: 'order',
                                width: 60,
                                render: (_: any, __: any, index: number) => <span className="font-bold text-blue-500">#{index + 1}</span>,
                            },
                            {
                                title: '启动项名称',
                                key: 'name',
                                render: (_: any, record: any) => <span className="font-medium">{record.efi_name || (record.efi_type ? 'CD/DVD' : '硬盘')}</span>,
                            },
                            {
                                title: '类型',
                                key: 'type',
                                render: (_: any, record: any) => (
                                    <Tag color={record.efi_type ? 'orange' : 'blue'}>
                                        {record.efi_type ? '光盘/网络启动' : '硬盘启动'}
                                    </Tag>
                                ),
                            },
                            ...(efiEditing ? [{
                                title: '操作',
                                key: 'action',
                                render: (_: any, record: any) => (
                                    <Space size="small">
                                        <Button size="small" disabled={record._index === 0} onClick={() => handleEfiMoveUp(record._index)}>上移</Button>
                                        <Button size="small" disabled={record._index === efiEditList.length - 1} onClick={() => handleEfiMoveDown(record._index)}>下移</Button>
                                    </Space>
                                ),
                            }] : []),
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center py-8" style={{color: 'var(--text-secondary)'}}>
                        暂无启动项数据，请点击刷新获取
                    </div>
                )}
            </Card>
        },
        {
            key: 'owners',
            label: '用户权限',
            children: <Card title="用户管理" extra={
                <Space>
                    <Segmented
                        value={ownerViewMode}
                        onChange={(val) => setOwnerViewMode(val as 'card' | 'table')}
                        options={[
                            { value: 'card', icon: <AppstoreOutlined /> },
                            { value: 'table', icon: <UnorderedListOutlined /> },
                        ]}
                        size="small"
                    />
                    <Button type="primary" icon={<UsergroupAddOutlined/>}
                            disabled={!isOwnerOrAdmin}
                            onClick={() => setOwnerModalVisible(true)}>添加用户</Button>
                    {owners && owners.length > 0 && (
                        <Button icon={<KeyOutlined/>}
                                disabled={!isOwnerOrAdmin}
                                onClick={() => setTransferOwnershipModalVisible(true)}>移交所有权</Button>
                    )}
                </Space>
            }
                            variant="borderless">
                {owners && owners.length > 0 ? (
                    ownerViewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {owners.map((owner, index) => {
                            const isFirstOwner = index === 0
                            const roleText = isFirstOwner ? '所有者' : '使用者'
                const roleClass = isFirstOwner ? 'dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'dark:bg-gray-700/40 dark:'
                            const ownerMask = typeof owner.permission === 'number' ? owner.permission : VM_PERMISSION.FULL_MASK
                            return (
                                <div key={owner.username || `owner-${index}`}
                                     className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-400 dark:hover:border-blue-500">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="iconify text-blue-600" data-icon="mdi:account"
                                                  style={{fontSize: '24px'}}></span>
                                            <span className="font-medium">{owner.username}</span>
                                            {isFirstOwner &&
                                                <span className="text-xs  ml-1">(主所有者)</span>}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {!isFirstOwner && isOwnerOrAdmin && (
                                                <>
                                                    <Button size="small" icon={<EditOutlined/>}
                                                            onClick={() => {
                                                                setEditPermOwner(owner.username);
                                                                setEditPermMask(ownerMask);
                                                                setEditPermModalVisible(true);
                                                            }}>编辑权限</Button>
                                                    <Button type="primary" size="small" icon={<KeyOutlined/>}
                                                            onClick={() => {
                                                                setTransferOwnerUsername(owner.username);
                                                                setTransferOwnershipModalVisible(true);
                                                            }}>移交所有权</Button>
                                                    <Button danger size="small" icon={<span className="iconify"
                                                                                            data-icon="mdi:account-remove"/>}
                                                            onClick={() => handleDeleteOwner(owner.username)}>移除</Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div>
                                            <span className={`px-2 py-0.5 text-xs font-medium ${roleClass} rounded`}>
                                                {roleText}
                                            </span>
                                            {!isFirstOwner && (
                                                <span className="text-xs ml-2" style={{color: 'var(--text-secondary)'}}>
                                                    权限: {ownerMask === VM_PERMISSION.FULL_MASK ? '全部' : `${Object.entries(PERMISSION_FIELD_MASK).filter(([, bit]) => (ownerMask & bit) !== 0).length}/16`}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    ) : (
                    <Table
                        dataSource={owners.map((owner, index) => ({ ...owner, _index: index }))}
                        rowKey={(record) => record.username || `owner-${record._index}`}
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: '用户名',
                                dataIndex: 'username',
                                key: 'username',
                                render: (text: string, record: any) => (
                                    <div className="flex items-center gap-2">
                                        <span className="iconify text-blue-600" data-icon="mdi:account" style={{fontSize: '18px'}}></span>
                                        <span className="font-medium">{text}</span>
                                        {record._index === 0 && <Tag color="purple">主所有者</Tag>}
                                    </div>
                                ),
                            },
                            {
                                title: '角色',
                                key: 'role',
                                render: (_: any, record: any) => (
                                    <Tag color={record._index === 0 ? 'purple' : 'default'}>
                                        {record._index === 0 ? '所有者' : '使用者'}
                                    </Tag>
                                ),
                            },
                            {
                                title: '权限',
                                key: 'permission',
                                render: (_: any, record: any) => {
                                    if (record._index === 0) return <span className="text-xs">全部权限</span>
                                    const mask = typeof record.permission === 'number' ? record.permission : VM_PERMISSION.FULL_MASK
                                    return <span className="text-xs">{mask === VM_PERMISSION.FULL_MASK ? '全部' : `${Object.entries(PERMISSION_FIELD_MASK).filter(([, bit]) => (mask & bit) !== 0).length}/16`}</span>
                                },
                            },
                            ...(isOwnerOrAdmin ? [{
                                title: '操作',
                                key: 'action',
                                render: (_: any, record: any) => {
                                    if (record._index === 0) return null
                                    const ownerMask = typeof record.permission === 'number' ? record.permission : VM_PERMISSION.FULL_MASK
                                    return (
                                        <Space size="small">
                                            <Button size="small" icon={<EditOutlined/>}
                                                    onClick={() => {
                                                        setEditPermOwner(record.username);
                                                        setEditPermMask(ownerMask);
                                                        setEditPermModalVisible(true);
                                                    }}>编辑权限</Button>
                                            <Button type="primary" size="small" icon={<KeyOutlined/>}
                                                    onClick={() => {
                                                        setTransferOwnerUsername(record.username);
                                                        setTransferOwnershipModalVisible(true);
                                                    }}>移交所有权</Button>
                                            <Button danger size="small" onClick={() => handleDeleteOwner(record.username)}>移除</Button>
                                        </Space>
                                    )
                                },
                            }] : []),
                        ]}
                    />
                    )
                ) : (
                    <div className="text-center  py-8">暂无使用者</div>
                )}
            </Card>
        },
    ];

    const powerMenuProps: MenuProps = {
        items: [
            {key: 'start', label: '启动', icon: <PlayCircleOutlined/>, disabled: currentStatus.ac_status === 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)},
            {
                key: 'stop',
                label: '关机',
                icon: <PoweroffOutlined/>,
                disabled: currentStatus.ac_status !== 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS),
                danger: true
            },
            {key: 'reset', label: '重启', icon: <ReloadOutlined/>, disabled: currentStatus.ac_status !== 'STARTED' || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)},
            {key: 'hard_stop', label: '强制关机', icon: <PoweroffOutlined/>, danger: true, disabled: !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)},
            {key: 'hard_reset', label: '强制重启', icon: <ReloadOutlined/>, danger: true, disabled: !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)},
        ],
        onClick: (e) => handlePowerAction(e.key)
    }

    // 默认电源操作按钮
    const defaultPowerAction = currentStatus.ac_status === 'STARTED'
        ? {key: 'stop', label: '关机', icon: <PoweroffOutlined/>}
        : {key: 'start', label: '启动', icon: <PlayCircleOutlined/>}

    return (
        <div className="h-auto">
            <div className="">
                <div className="px-6 py-2 border-b border-gray-100 ">
                    <Breadcrumb separator="/" items={[
                        {title: <HomeOutlined/>},
                        {title: 'VPS'},
                        {title: config.vm_uuid}
                    ]}/>
                </div>
                <div className="px-6 py-4">
                    {!hostEnabled && (
                        <Alert
                            message="主机已被禁用"
                            description="该主机已被管理员禁用，所有虚拟机操作（创建、删除、修改、电源控制）均已被禁止。"
                            type="warning"
                            showIcon
                            closable
                            className="mb-4"
                        />
                    )}
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div
                                className="p-3 rounded text-8xl flex items-center justify-center w-30 h-30">
                                {getOSIcon(config.os_name || '')}
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-3xl font-bold dark:text-white m-0">{config.vm_uuid}</h1>
                                    <Tag color="blue">{hostConfig?.server_type || vm.config?.virt_type || 'Hyper-V'}</Tag>
                                    <Badge status={getStatusColor(displayStatus)}
                                           text={getStatusText(displayStatus)}/>
                                    <span
                                        className="text-sm border-l pl-3 ml-1">
                                        IPv4 : {vm.ipv4_address || '未分配'} <CopyOutlined className="cursor-pointer"
                                                                                           onClick={() => handleCopyPassword(vm.ipv4_address || '', 'IPv4')}/>
                                        &nbsp;| IPv6 : {vm.ipv6_address || '未分配'} <CopyOutlined
                                        className="cursor-pointer"
                                        onClick={() => handleCopyPassword(vm.ipv6_address || '', 'IPv6')}/>
                                    </span>
                                </div>
                                <div className="flex gap-4 mt-2 text-sm ">
                                    <span>主机名称: {hostName}</span>
                                    <span>主机类型: {hostConfig?.server_type || vm.config?.virt_type || 'Hyper-V'}</span>
                                    <span>系统: {getOSDisplayName(config.os_name || '')}</span>
                                    {vm.config?.nic_all && Object.values(vm.config.nic_all).some((nic: any) => nic.nic_type !== 'pub') && hostConfig?.public_addr?.length ? (
                                        <span>公网IP: {hostConfig.public_addr[0]}</span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <Space>
                            <Button type="primary" style={{background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none'}} onClick={() => navigate(`/hosts/${hostName}/vms/${uuid}/v2`)}>新版面板</Button>
            <Button type="primary" className="bg-blue-600" onClick={() => setRemoteModalVisible(true)} disabled={!hostEnabled || operationLocked || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)}>远程桌面</Button>
                            <Button onClick={() => setPasswordModalVisible(true)} disabled={!hostEnabled || operationLocked || !hasPermission(userPermissions, VM_PERMISSION.PWD_EDITS)}>设置密码</Button>
                            <Dropdown menu={powerMenuProps}>
                                <Button icon={defaultPowerAction.icon}
                                        onClick={() => handlePowerAction(defaultPowerAction.key)}
                                        disabled={!hostEnabled || operationLocked || !hasPermission(userPermissions, VM_PERMISSION.PWR_EDITS)}>
                                    {defaultPowerAction.label} <DownOutlined/>
                                </Button>
                            </Dropdown>

                            <Button onClick={() => setReinstallModalVisible(true)} disabled={!hostEnabled || operationLocked || !hasPermission(userPermissions, VM_PERMISSION.SYS_EDITS)}>重装系统</Button>
                            <Button icon={<ReloadOutlined/>} onClick={() => loadVMDetail(false)}/>
                            <Dropdown menu={actionMenu}><Button icon={<MoreOutlined/>} disabled={!hostEnabled || operationLocked}/></Dropdown>
                        </Space>
                    </div>
                </div>
                <div className="px-6">
                    <Tabs activeKey={activeTab} onChange={setActiveTab}
                          items={tabItems.filter(i => {
                              const requiredPerm = TAB_PERMISSION_MAP[i.key];
                              // owners tab 仅管理员/主所有者可见
                              if (OWNER_ONLY_TABS.has(i.key)) return isOwnerOrAdmin;
                              if (!requiredPerm) return true; // overview等无需权限的Tab始终显示
                              // 仅管理员跳过配额和权限限制（主所有者仍受user_permission约束）
                              if (isAdminUser) return true;
                              // 配额为0时直接隐藏Tab（该虚拟机不支持此功能）
                              const quota = getTabQuota(config, i.key);
                              if (quota === 0) return false;
                              // HIDDEN_TABS：权限不足时直接隐藏
                              if (HIDDEN_TABS.has(i.key)) return hasPermission(userPermissions, requiredPerm);
                              return true;
                          }).map(i => ({key: i.key, label: i.label}))} tabBarStyle={{marginBottom: 0}}/>
                </div>
            </div>
            <div className="p-6">
                {tabItems.filter(i => {
                    const requiredPerm = TAB_PERMISSION_MAP[i.key];
                    // owners tab 仅管理员/主所有者可见
                    if (OWNER_ONLY_TABS.has(i.key)) return isOwnerOrAdmin;
                    if (!requiredPerm) return true;
                    // 仅管理员跳过配额和权限限制
                    if (isAdminUser) return true;
                    // 配额为0时直接隐藏Tab
                    const quota = getTabQuota(config, i.key);
                    if (quota === 0) return false;
                    if (HIDDEN_TABS.has(i.key)) return hasPermission(userPermissions, requiredPerm);
                    return true;
                }).find(i => i.key === activeTab)?.children}
            </div>

            <Modal title="编辑虚拟机配置" open={editModalVisible} onCancel={() => setEditModalVisible(false)}
                   onOk={() => editVmForm.submit()} width={700}>
                <Form form={editVmForm} onFinish={handleUpdateVM} layout="vertical">
                    <Form.Item name="vm_uuid" hidden><Input/></Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="操作系统" name="os_name" initialValue={config.os_name || ''}>
                                <Select>
                                    <Select.Option key="__no_change__" value="">不变更系统</Select.Option>
                                    {hostConfig?.system_maps && (Array.isArray(hostConfig.system_maps) ? hostConfig.system_maps : Object.entries(hostConfig.system_maps as any).map(([name, val]: [string, any]) => Array.isArray(val) ? { sys_name: name, sys_file: val[0] } : (val && typeof val === 'object' ? { sys_name: name, ...val } : { sys_name: name, sys_file: val }))).filter((it: any) => it && it.sys_flag !== false).map((it: any) => (
                                    it && it.sys_file ? <Select.Option key={it.sys_name || it.sys_file} value={it.sys_file}>{it.sys_name || it.sys_file}</Select.Option> : null
                                ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}><Form.Item label="VNC 端口" name="vc_port"
                                                  initialValue={config.vc_port}><InputNumber min={6000} max={6999}
                                                                                             disabled style={{width: '100%'}}/></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item label="系统密码" name="os_pass"
                                                  initialValue={config.os_pass}><Input.Password
                            placeholder="留空则不修改"/></Form.Item></Col>
                        <Col span={12}><Form.Item label="VNC密码" name="vc_pass"
                                                  initialValue={config.vc_pass}><Input.Password
                            placeholder="留空则不修改"/></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item label="CPU核心" name="cpu_num"
                                                 initialValue={config.cpu_num}><InputNumber min={1} max={64}
                                                                                            style={{width: '100%'}}/></Form.Item></Col>
                        <Col span={8}><Form.Item label="内存(MB)" name="mem_num"
                                                 initialValue={config.mem_num}><InputNumber min={512} max={1048576}
                                                                                            style={{width: '100%'}}/></Form.Item></Col>
                        <Col span={8}><Form.Item label="硬盘(GB)" name="hdd_num"
                                                 initialValue={config.hdd_num}><InputNumber min={1} max={10240}
                                                                                            style={{width: '100%'}}/></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item label="GPU数量" name="gpu_num"
                                                 initialValue={config.gpu_num || 0}><InputNumber min={0} max={8}
                                                                                                 style={{width: '100%'}}/></Form.Item></Col>
                        <Col span={8}><Form.Item label="上行带宽(Mbps)" name="speed_up"
                                                 initialValue={config.speed_up || 100}><InputNumber min={1} max={10000}
                                                                                                    style={{width: '100%'}}/></Form.Item></Col>
                        <Col span={8}><Form.Item label="下行带宽(Mbps)" name="speed_down"
                                                 initialValue={config.speed_down || 100}><InputNumber min={1}
                                                                                                      max={10000}
                                                                                                      style={{width: '100%'}}/></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item label="NAT端口数" name="nat_num"
                                                 initialValue={config.nat_num || 0}><InputNumber min={0} max={100}
                                                                                                 style={{width: '100%'}}/></Form.Item></Col>
                        <Col span={8}><Form.Item label="Web代理数" name="web_num"
                                                 initialValue={config.web_num || 0}><InputNumber min={0} max={100}
                                                                                                 style={{width: '100%'}}/></Form.Item></Col>
                        <Col span={8}><Form.Item label="流量限制(GB)" name="flu_num" initialValue={config.flu_num || 0}><InputNumber
                            min={0} max={100000} style={{width: '100%'}}/></Form.Item></Col>
                    </Row>
                    <Divider orientation="left">
                        <div className="flex justify-between items-center w-full"><span>网卡配置</span><Button
                            type="dashed" size="small" onClick={addEditNic} icon={<PlusOutlined/>}>添加网卡</Button>
                        </div>
                    </Divider>
                    {editNicList.map((nic) => (
                <div key={nic.id} className="mb-4 p-3  rounded border border-gray-200 dark:border-gray-700 relative">
                            <div className="absolute top-2 right-2"><Button type="text" danger size="small"
                                                                            icon={<DeleteOutlined/>}
                                                                            onClick={() => removeEditNic(nic.id)}/>
                            </div>
                            <Row gutter={8}>
                                <Col span={8}>
                                    <div className="mb-2"><span
                                        className="text-xs  block">网卡名称</span><Input value={nic.name}
                                                                                                      onChange={e => updateEditNic(nic.id, 'name', e.target.value)}
                                                                                                      size="small"/>
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <div className="mb-2"><span
                                        className="text-xs  block">类型</span><Select value={nic.type}
                                                                                                   onChange={val => updateEditNic(nic.id, 'type', val)}
                                                                                                   size="small"
                                                                                                   style={{width: '100%'}}><Select.Option
                                        value="nat">NAT</Select.Option><Select.Option
                                        value="bridge">Bridge</Select.Option></Select></div>
                                </Col>
                                <Col span={8}>
                                    <div className="mb-2"><span
                                        className="text-xs  block">IPv4地址</span><Input value={nic.ip}
                                                                                                      onChange={e => updateEditNic(nic.id, 'ip', e.target.value)}
                                                                                                      placeholder="自动分配"
                                                                                                      size="small"/>
                                    </div>
                                </Col>
                                <Col span={24}>
                                    <div><span className="text-xs  block">IPv6地址 (可选)</span><Input
                                        value={nic.ip6} onChange={e => updateEditNic(nic.id, 'ip6', e.target.value)}
                                        placeholder="自动分配" size="small"/></div>
                                </Col>
                            </Row>
                        </div>
                    ))}
                </Form>
            </Modal>

            <Modal title="保存确认" open={saveConfirmModalVisible} onCancel={() => setSaveConfirmModalVisible(false)}
                   onOk={handleConfirmUpdateVM} okText="确认保存" okButtonProps={{disabled: !saveConfirmChecked}}
                   width={400}>
                <div className="mb-4"><p>确定要保存对虚拟机 "<strong>{uuid}</strong>" 的配置修改吗？</p></div>
                <div className="p-3  border border-gray-200 dark:border-gray-700 rounded flex items-center justify-center">
                    <Space><input type="checkbox" id="saveConfirmCheck" checked={saveConfirmChecked}
                                  onChange={(e) => setSaveConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-blue-600"/><label htmlFor="saveConfirmCheck"
                                                                            className="cursor-pointer select-none text-sm ">我已确认关闭虚拟机</label></Space>
                </div>
            </Modal>

            <Modal title={currentAction?.title} open={actionConfirmModalVisible}
                   onCancel={() => setActionConfirmModalVisible(false)} onOk={executeAction}
                   okButtonProps={{
                       disabled: (currentAction?.requireShutdown && !currentAction?.confirmChecked) ||
                                 (currentAction?.requireInput && currentAction?.confirmInput !== currentAction?.expectedInput)
                   }}
                   mask={false}
                   width={400}>
                <div className="mb-4"><p>{currentAction?.content}</p></div>
                {currentAction?.requireInput && (
                    <div className="mb-4">
                        <Input
                            placeholder={currentAction.expectedInput === uuid ? "请输入虚拟机名称" : "请输入主所有者用户名"}
                            value={currentAction.confirmInput}
                            onChange={(e) => setCurrentAction({
                                ...currentAction,
                                confirmInput: e.target.value
                            })}
                        />
                    </div>
                )}
                {currentAction?.requireShutdown && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded flex items-center justify-center">
                        <Space><input type="checkbox" id="actionConfirmCheck" checked={currentAction.confirmChecked}
                                      onChange={(e) => setCurrentAction({
                                          ...currentAction,
                                          confirmChecked: e.target.checked
                                      })} className="w-4 h-4 text-blue-600"/><label htmlFor="actionConfirmCheck"
                                                                                    className="cursor-pointer select-none text-sm ">我已确认关闭虚拟机</label></Space>
                    </div>
                )}
            </Modal>

            <Modal title="修改密码/端口" open={passwordModalVisible} onCancel={() => { setPasswordModalVisible(false); form.resetFields(); setVncPortConfirmChecked(false) }}
                   onOk={() => form.submit()} okButtonProps={{disabled: passwordActionType === 'vnc_port' && !vncPortConfirmChecked}}>
                <Form form={form} onFinish={handleChangePassword} layout="vertical">
                    <Form.Item label="操作类型">
                        <Select value={passwordActionType} onChange={(val) => { setPasswordActionType(val); form.resetFields(['new_password', 'confirm_password']); if (val === 'vnc_port') setRandomVncPort(Math.floor(Math.random() * 1000) + 6000) }}>
                            <Select.Option value="os_password">修改系统密码</Select.Option>
                            <Select.Option value="vnc_password">修改VNC 密码</Select.Option>
                            <Select.Option value="vnc_port">修改VNC 端口</Select.Option>
                        </Select>
                    </Form.Item>
                    {passwordActionType !== 'vnc_port' && (<>
                        <Form.Item label="新密码" name="new_password"
                                   rules={[{required: true, message: '请输入新密码'}]}><Input.Password
                            autoComplete="new-password"/></Form.Item>
                        <Form.Item label="确认密码" name="confirm_password" dependencies={['new_password']} rules={[{
                            required: true,
                            message: '请确认密码'
                        }, ({getFieldValue}) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                                return Promise.reject(new Error('两次输入的密码不一致'))
                            }
                        })]}><Input.Password/></Form.Item>
                    </>)}
                    {passwordActionType === 'vnc_port' && (<>
                        <Form.Item label="新VNC端口">
                            <Space>
                                <InputNumber value={randomVncPort} disabled style={{width: 120}}/>
                                <Button onClick={() => setRandomVncPort(Math.floor(Math.random() * 1000) + 6000)}>随机生成</Button>
                                <Alert message="仅限随机分配可用的端口" type="info" showIcon />
                            </Space>
                        </Form.Item>

                        <Alert message="修改VNC端口需要强制关闭并重启服务器" type="warning" showIcon className="mb-3"/>
                        <div className="p-3 border border-gray-200 rounded flex items-center justify-center">
                            <Space><input type="checkbox" id="vncPortConfirmCheck" checked={vncPortConfirmChecked}
                                          onChange={(e) => setVncPortConfirmChecked(e.target.checked)}
                                          className="w-4 h-4 text-blue-600"/><label htmlFor="vncPortConfirmCheck"
                                                                                    className="cursor-pointer select-none text-sm">我已同意强制关闭服务器</label></Space>
                        </div>
                    </>)}
                </Form>
            </Modal>

            <Modal title="添加NAT规则" open={natModalVisible} onCancel={() => setNatModalVisible(false)}
                   onOk={() => form.submit()} confirmLoading={natActionLoading}>
                <Form form={form} onFinish={handleAddNATRule} layout="vertical">
                    <Form.Item label="外网端口 (WAN)" name="wan_port" initialValue={""}
                               help="留空或填0表示自动分配"><InputNumber min={0} max={65535}
                                                                         style={{width: '100%'}}/></Form.Item>
                    <Form.Item label="内网端口 (LAN)" name="lan_port"
                               rules={[{required: true, message: '请输入内网端口'}]}><InputNumber min={1} max={65535}
                                                                                                  style={{width: '100%'}}/></Form.Item>
                    <Form.Item label="内网地址" name="lan_addr" initialValue={availableIPs[0]}
                               rules={[{required: true, message: '请选择IP地址'}]}><Select
                        placeholder="请选择IP地址">{availableIPs.map(ip => <Select.Option key={ip}
                                                                                          value={ip}>{ip}</Select.Option>)}</Select></Form.Item>
                    <Form.Item label="备注" name="nat_tips"><Input.TextArea rows={3}
                                                                            placeholder="端口用途说明"/></Form.Item>
                </Form>
            </Modal>

            <Modal title="添加IP地址" open={ipModalVisible} onCancel={() => setIpModalVisible(false)}
                   onOk={() => ipForm.submit()}>
                {ipQuota && (<div className="mb-4 p-3  rounded text-sm">
                    <div className="flex justify-between mb-1"><span>内网IP配额:</span><span
                        className="font-mono">{ipQuota.ip_used}/{ipQuota.ip_num}</span></div>
                    <div className="flex justify-between"><span>公网IP配额:</span><span
                        className="font-mono">{ipQuota.user_data?.used_pub_ips || 0}/{ipQuota.user_data?.quota_pub_ips || 0}</span>
                    </div>
                </div>)}
                <Form form={ipForm} onFinish={handleAddIPAddress} layout="vertical">
                    <Form.Item label="网卡类型" name="nic_type" initialValue="nat"><Select><Select.Option
                        value="nat">内网(NAT)</Select.Option><Select.Option
                        value="pub">公网(Public)</Select.Option></Select></Form.Item>
                    <Form.Item label="IPv4地址" name="ip4_addr"><Input placeholder="留空自动分配"/></Form.Item>
                    <Form.Item label="IPv6地址" name="ip6_addr"><Input placeholder="可选"/></Form.Item>
                    <Form.Item label="网关" name="nic_gate"><Input placeholder="可选"/></Form.Item>
                    <Form.Item label="子网掩码" name="nic_mask" initialValue="255.255.255.0"><Input/></Form.Item>
                </Form>
            </Modal>

            <Modal title="添加反向代理" open={proxyModalVisible} onCancel={() => setProxyModalVisible(false)}
                   onOk={() => proxyForm.submit()} confirmLoading={proxyActionLoading}>
                <Form form={proxyForm} onFinish={handleAddProxy} layout="vertical">
                    <Form.Item label="域名" name="domain" rules={[{required: true, message: '请输入域名'}]}
                               help="例如: www.example.com"><Input placeholder="example.com"/></Form.Item>
                    <Form.Item label="后端IP" name="backend_ip" initialValue={availableIPs[0]}
                               rules={[{required: true, message: '请选择后端IP'}]} help="选择要代理的内网IP地址"><Select
                        placeholder="请选择">{availableIPs.map(ip => <Select.Option key={ip}
                                                                                    value={ip}>{ip}</Select.Option>)}</Select></Form.Item>
                    <Form.Item label="后端端口" name="backend_port" rules={[{required: true, message: '请输入端口'}]}
                               help="后端服务运行的端口"><InputNumber min={1} max={65535}
                                                                      style={{width: '100%'}}/></Form.Item>
                    <Form.Item name="ssl_enabled" valuePropName="checked">
                        <div className="flex items-center gap-2"><input type="checkbox"/><span>启用SSL (HTTPS)</span>
                        </div>
                    </Form.Item>
                    <Form.Item label="备注" name="description"><Input.TextArea/></Form.Item>
                </Form>
            </Modal>

            <Modal title="添加PCI直通设备" open={gpuModalVisible} onCancel={() => { setGpuModalVisible(false); setSelectedPciKey(''); setAddPciConfirmChecked(false); }}
                   onOk={() => handleAddGpu({ pci_key: selectedPciKey })} confirmLoading={gpuActionLoading}
                   okButtonProps={{ disabled: !selectedPciKey || !addPciConfirmChecked }}>
                {pciListLoading ? (
                    <div className="text-center py-8"><Spin tip="正在获取可用PCI设备列表..."/></div>
                ) : Object.keys(pciDeviceList).length > 0 ? (
                    <>
                        <div className="mb-3">请选择要直通的PCI设备：</div>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="选择PCI设备"
                            value={selectedPciKey || undefined}
                            onChange={(val) => setSelectedPciKey(val)}
                            optionLabelProp="label"
                        >
                            {Object.entries(pciDeviceList).map(([key, dev]: [string, any]) => (
                                <Select.Option key={key} value={key} label={dev.gpu_hint}>
                                    <div className="flex justify-between items-center">
                                        <span>{dev.gpu_hint}</span>
                                        <Tag color={dev.gpu_mdev === 'PV' ? 'blue' : dev.gpu_mdev === 'DDA' ? 'orange' : 'green'} className="ml-2">{dev.gpu_mdev}</Tag>
                                    </div>
                                    <div className="text-xs text-gray-400">{dev.gpu_uuid}</div>
                                </Select.Option>
                            ))}
                        </Select>
                    </>
                ) : (
                    <div className="text-center py-8 text-gray-400">当前主机无可用PCI直通设备</div>
                )}
                <Alert message="注意：PCI直通操作需要虚拟机处于关机状态。" type="warning" showIcon className="mt-4"/>
                <div className="p-3 rounded flex items-center mt-4" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="addPciConfirmCheck" checked={addPciConfirmChecked}
                                  onChange={(e) => setAddPciConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-blue-600"/><label htmlFor="addPciConfirmCheck"
                                                                            className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            {/* PCI关机确认对话框 */}
            <Modal title="需要关闭虚拟机" open={pciShutdownConfirmVisible}
                   onCancel={() => { setPciShutdownConfirmVisible(false); setPendingPciAction(null); setPciShutdownConfirmChecked(false); }}
                   onOk={handlePciShutdownConfirm}
                   okText="确认关机并继续" okType="danger"
                   okButtonProps={{disabled: !pciShutdownConfirmChecked}}>
                <Alert message="PCI直通操作需要先关闭虚拟机，确认后将自动关闭虚拟机并执行操作。" type="warning" showIcon />
                <div className="p-3 rounded flex items-center mt-4" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="pciShutdownCheck" checked={pciShutdownConfirmChecked}
                                  onChange={(e) => setPciShutdownConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-blue-600"/><label htmlFor="pciShutdownCheck"
                                                                            className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            <Modal title="添加数据盘" open={hddModalVisible} onCancel={() => { setHddModalVisible(false); setAddHddConfirmChecked(false); }}
                   onOk={() => hddForm.submit()} confirmLoading={hddActionLoading}
                   okButtonProps={{disabled: !addHddConfirmChecked}}>
                <Form form={hddForm} onFinish={handleAddHDD} layout="vertical">
                    <Form.Item label="磁盘名称" name="hdd_name" rules={[{required: true, message: '请输入磁盘名称'}, {
                        pattern: /^[a-zA-Z0-9_]+$/,
                        message: '只能包含字母、数字和下划线'
                    }]} help="仅支持英文、数字和下划线"><Input placeholder="例如: data_disk_1"/></Form.Item>
                    <Form.Item label="容量 (GB)" name="hdd_size" initialValue={10}
                               rules={[{required: true, message: '请输入容量'}]} help="最小 1 GB"><InputNumber min={1}
                                                                                                               max={10240}
                                                                                                               style={{width: '100%'}}/></Form.Item>
                    <Form.Item label="类型" name="hdd_type" initialValue={0}><Select><Select.Option
                        value={0}>HDD</Select.Option><Select.Option value={1}>SSD</Select.Option></Select></Form.Item>
                </Form>
                <Alert message="注意：添加数据盘需要重启虚拟机才能生效。" type="warning" showIcon className="mt-4"/>
                <div className="p-3 rounded flex items-center mt-4" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="addHddCheck" checked={addHddConfirmChecked}
                                  onChange={(e) => setAddHddConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-blue-600"/><label htmlFor="addHddCheck"
                                                                            className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            <Modal title="挂载数据盘" open={mountHddModalVisible} onCancel={() => setMountHddModalVisible(false)}
                   onOk={handleMountHDD} okText="确认挂载" okButtonProps={{disabled: !mountHddConfirmChecked}}
                   confirmLoading={hddActionLoading}>
                <p>确定要挂载数据盘 "<strong>{currentMountHdd?.hdd_path}</strong>" 吗？</p>
                <p className=" text-sm mt-2 mb-4">挂载后需要在系统内进行配置才能使用。</p>
                <div className="p-3 rounded flex items-center" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="mountHddCheck" checked={mountHddConfirmChecked}
                                  onChange={(e) => setMountHddConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-blue-600"/><label htmlFor="mountHddCheck"
                                                                            className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            <Modal title="卸载数据盘" open={unmountHddModalVisible} onCancel={() => setUnmountHddModalVisible(false)}
                   onOk={handleUnmountHDD} okText="确认卸载" okType="danger"
                   okButtonProps={{disabled: !unmountHddConfirmChecked}} confirmLoading={hddActionLoading}>
                <p>确定要卸载数据盘 "<strong>{currentUnmountHdd?.hdd_path}</strong>" 吗？</p>
                <p className="text-red-500 text-sm mt-2 mb-4">请确保在系统内已卸载该磁盘，否则可能导致数据丢失。</p>
                <div className="p-3 rounded flex items-center" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="unmountHddCheck" checked={unmountHddConfirmChecked}
                                  onChange={(e) => setUnmountHddConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-blue-600"/><label htmlFor="unmountHddCheck"
                                                                            className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            <Modal title="挂载ISO" open={isoModalVisible} onCancel={() => setIsoModalVisible(false)}
                   onOk={() => isoForm.submit()} okButtonProps={{disabled: !isoMountConfirmChecked}}
                   confirmLoading={isoActionLoading}>
                <Form form={isoForm} onFinish={handleAddISO} layout="vertical">
                    <Form.Item label="ISO镜像" name="iso_file" rules={[{required: true, message: '请选择镜像'}]}
                               help="从服务器可用的ISO镜像中选择"><Select
                        placeholder="请选择">{hostConfig?.images_maps && (Array.isArray(hostConfig.images_maps) ? hostConfig.images_maps : Object.entries(hostConfig.images_maps as any).map(([name, file]: [string, any]) => (file && typeof file === 'object' ? { sys_name: name, ...file } : { sys_name: name, sys_file: file }))).filter((it: any) => it && it.sys_flag !== false).map((it: any) => (
                        it && it.sys_file ? <Select.Option key={it.sys_name || it.sys_file} value={it.sys_file}>{it.sys_name || it.sys_file} ({it.sys_file})</Select.Option> : null
                        ))}</Select></Form.Item>
                    <Form.Item label="挂载名称" name="iso_name" rules={[{required: true, message: '请输入名称'}, {
                        pattern: /^[a-zA-Z0-9]+$/,
                        message: '只能包含英文字母和数字'
                    }]} help="仅支持英文和数字"><Input placeholder="例如: system_iso"/></Form.Item>
                    <Form.Item label="备注" name="iso_hint" help="可选，用于说明此ISO的用途"><Input
                        placeholder="例如: 系统安装盘"/></Form.Item>
                </Form>
                <div className="p-3 rounded flex items-center mt-4" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="isoMountCheck" checked={isoMountConfirmChecked}
                                  onChange={(e) => setIsoMountConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-purple-600"/><label htmlFor="isoMountCheck"
                                                                              className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            <Modal title="卸载ISO镜像" open={unmountIsoConfirmVisible}
                   onCancel={() => setUnmountIsoConfirmVisible(false)} onOk={executeUnmountISO} okText="确认卸载"
                   okType="danger" okButtonProps={{disabled: !unmountIsoConfirmChecked}}
                   confirmLoading={isoActionLoading}>
                <p>确定要卸载ISO镜像 "<strong>{currentUnmountIso}</strong>" 吗？</p>
                <div className="p-3 rounded flex items-center mt-4" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="unmountIsoCheck" checked={unmountIsoConfirmChecked}
                                  onChange={(e) => setUnmountIsoConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-orange-600"/><label htmlFor="unmountIsoCheck"
                                                                              className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            <Modal title="重装系统" open={reinstallModalVisible} onCancel={() => setReinstallModalVisible(false)}
                   onOk={() => reinstallForm.submit()} okType="danger" okText="确认重装"
                   okButtonProps={{disabled: !reinstallConfirmChecked}} confirmLoading={reinstallActionLoading}>
                <Alert message="警告：重装系统将清除所有数据！" description="此操作不可逆，请确保已备份重要数据。"
                       type="warning" showIcon style={{marginBottom: 16}}/>
                <Form form={reinstallForm} onFinish={handleReinstall} layout="vertical">
                    <Form.Item label="操作系统" name="os_name"
                               rules={[{required: true, message: '请选择操作系统'}]}><Select
                        placeholder="请选择">{hostConfig?.system_maps && (Array.isArray(hostConfig.system_maps) ? hostConfig.system_maps : Object.entries(hostConfig.system_maps as any).map(([name, val]: [string, any]) => Array.isArray(val) ? { sys_name: name, sys_file: val[0] } : (val && typeof val === 'object' ? { sys_name: name, ...val } : { sys_name: name, sys_file: val }))).filter((it: any) => it && it.sys_flag !== false).map((it: any) => (
                        it && it.sys_file ? <Select.Option key={it.sys_name || it.sys_file} value={it.sys_file}>{it.sys_name || it.sys_file}</Select.Option> : null
                    ))}</Select></Form.Item>
                    <Form.Item label="系统密码" name="password" rules={[{required: true, message: '请输入新系统密码'}]}><Input.Password/></Form.Item>
                </Form>
                <div className="p-3 bg-red-50 border border-red-200 rounded flex items-center mt-4">
                    <Space><input type="checkbox" id="reinstallCheck" checked={reinstallConfirmChecked}
                                  onChange={(e) => setReinstallConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-red-600"/><label htmlFor="reinstallCheck"
                                                                           className="cursor-pointer select-none text-sm ">我已备份数据，确认重装系统将清空系统盘数据</label></Space>
                </div>
            </Modal>

            <Modal title="创建备份" open={backupModalVisible} onCancel={() => setBackupModalVisible(false)}
                   onOk={() => backupForm.submit()} okButtonProps={{disabled: !backupCreateConfirmChecked}}
                   confirmLoading={backupActionLoading}>
                <Form form={backupForm} onFinish={handleCreateBackup} layout="vertical">
                    <Form.Item label="备份说明" name="backup_name" rules={[{required: true, message: '请输入备份说明'}]}
                               help="请输入备份的说明信息"><Input placeholder="例如: 系统更新前备份"/></Form.Item>
                </Form>
                <Alert message="备份可能需要数十分钟，取决于虚拟机硬盘大小，请耐心等待！" type="info" showIcon
                       className="mb-4 mt-2"/>
                <div className="p-3 rounded flex items-center" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="backupCreateCheck" checked={backupCreateConfirmChecked}
                                  onChange={(e) => setBackupCreateConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-purple-600"/><label htmlFor="backupCreateCheck"
                                                                              className="cursor-pointer select-none text-sm ">我已确认停止当前虚拟机进行备份操作（未保存的数据将丢失）</label></Space>
                </div>
            </Modal>

            <Modal title="还原备份" open={restoreBackupModalVisible}
                   onCancel={() => setRestoreBackupModalVisible(false)} onOk={executeRestoreBackup} okText="确认还原"
                   okButtonProps={{disabled: !restoreConfirmChecked1 || !restoreConfirmChecked2}}
                   confirmLoading={backupActionLoading}>
                <p className="mb-4">为虚拟机 "<strong>{uuid}</strong>" 还原备份</p>
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-sm  mb-1">备份名称：<span
                        className="font-mono text-blue-700">{currentRestoreBackup}</span></p>
                </div>
                <div className="space-y-3 mb-6">
                    <div className="p-3 rounded flex items-center" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                        <Space><input type="checkbox" id="restoreCheck1" checked={restoreConfirmChecked1}
                                      onChange={(e) => setRestoreConfirmChecked1(e.target.checked)}
                                      className="w-4 h-4 text-blue-600"/><label htmlFor="restoreCheck1"
                                                                                className="cursor-pointer select-none text-sm ">我已确认停止当前虚拟机进行还原操作</label></Space>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded flex items-center">
                        <Space><input type="checkbox" id="restoreCheck2" checked={restoreConfirmChecked2}
                                      onChange={(e) => setRestoreConfirmChecked2(e.target.checked)}
                                      className="w-4 h-4 text-red-600"/><label htmlFor="restoreCheck2"
                                                                               className="cursor-pointer select-none text-sm ">我已确认备份数据，将丢失系统盘数据</label></Space>
                    </div>
                </div>
            </Modal>

            <Modal title="添加用户" open={ownerModalVisible} onCancel={() => setOwnerModalVisible(false)}
                   onOk={() => ownerForm.submit()} confirmLoading={ownerActionLoading}>
                <Form form={ownerForm} onFinish={handleAddOwner} layout="vertical">
                    <Form.Item label="用户名" name="username" rules={[{required: true, message: '请输入用户名'}]}
                               help="添加后该用户将共享此虚拟机的访问权限，但不会占用资源配额"><Input
                        placeholder="请输入用户名"/></Form.Item>
                </Form>
                <div className="flex items-start space-x-2 mt-2 text-sm text-orange-600">
                    <SafetyCertificateOutlined className="mt-1"/>
                    <p>新的共享者必须拥有<strong>对应主机的访问权限</strong>才能看到该虚拟机!</p>
                </div>
            </Modal>

            <Modal title="移交所有权" open={transferOwnershipModalVisible}
                   onCancel={() => setTransferOwnershipModalVisible(false)} onOk={handleTransferOwnership}
                   okText="确认移交" okButtonProps={{disabled: !transferOwnerConfirmChecked || !transferOwnerUsername}}
                   confirmLoading={ownerActionLoading}>
                <div className="mb-4"><p>移交所有权将把当前虚拟机的所有权转让给另一个用户。</p></div>
                <div className="mb-4"><label className="block mb-2 text-sm font-medium">新所有者用户名</label><Input
                    value={transferOwnerUsername} onChange={(e) => setTransferOwnerUsername(e.target.value)}
                    placeholder="请输入用户名"/>
                    <p className="text-xs  mt-1">移交后该用户将成为虚拟机的所有者，占用资源配额，您将不再占用此虚拟机资源配额</p>
                </div>
                <div className="mb-4"><Space direction="vertical">
                    <Checkbox checked={keepAccessChecked} onChange={(e) => setKeepAccessChecked(e.target.checked)}>保留我的访问权限
                        (作为使用者)</Checkbox>
                    <div className="ml-6 text-xs text-blue-600 mb-2">勾选将继续保留此虚拟机的访问权限，但不再是所有者
                    </div>
                    <Checkbox checked={transferOwnerConfirmChecked}
                              onChange={(e) => setTransferOwnerConfirmChecked(e.target.checked)}>我确认移交此虚拟机所有者权限</Checkbox>
                    <div className="ml-6 space-y-1">
                        <div
                            className="text-xs text-red-600 font-bold">此操作将立即执行且不可撤销，请谨慎确认所有者转移
                        </div>
                        <div className="text-xs text-orange-600">新的所有者必须拥有足够的可用资源配额才能完成移交</div>
                        <div className="text-xs text-orange-600">新的所有者必须拥有对应主机的访问权限才能完成移交</div>
                    </div>
                </Space></div>
            </Modal>

            {/* 编辑用户权限模态框 */}
            <Modal title={`编辑权限 - ${editPermOwner}`} open={editPermModalVisible}
                   onCancel={() => setEditPermModalVisible(false)} onOk={handleUpdatePermission}
                   confirmLoading={ownerActionLoading} okText="保存" width={560}>
                <div style={{marginBottom: 12}}>
                    <Space>
                        <Button size="small" onClick={() => setEditPermMask(VM_PERMISSION.FULL_MASK)}>全选</Button>
                        <Button size="small" onClick={() => setEditPermMask(0)}>全不选</Button>
                    </Space>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px'}}>
                    {Object.entries(PERMISSION_FIELD_MASK).map(([field, bit]) => (
                        <label key={field} style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0'}}>
                            <input type="checkbox" checked={(editPermMask & bit) !== 0}
                                   onChange={(e) => {
                                       if (e.target.checked) {
                                           setEditPermMask(prev => prev | bit)
                                       } else {
                                           setEditPermMask(prev => prev & ~bit)
                                       }
                                   }}/>
                            <span>{VM_PERMISSION_LABELS[field] || field}</span>
                        </label>
                    ))}
                </div>
                <div style={{marginTop: 12, fontSize: 12, color: '#888'}}>
                    当前掩码值: {editPermMask} / {VM_PERMISSION.FULL_MASK}
                </div>
            </Modal>

            <Modal title={<div style={{display: 'flex', alignItems: 'center', gap: 8, color: '#1890ff'}}>
                <CloudSyncOutlined/><span>移交数据盘</span></div>} open={transferHddModalVisible}
                   onCancel={() => setTransferHddModalVisible(false)} onOk={handleTransferHDD} okText="确认移交"
                   okButtonProps={{disabled: !transferHddConfirmChecked}} confirmLoading={hddActionLoading}>
                <div style={{marginBottom: 24}}><p>确定要移交数据盘 "<strong>{currentTransferHdd?.hdd_path}</strong>" 吗？
                </p></div>
                <div style={{marginBottom: 16}}><label style={{display: 'block', marginBottom: 8, fontWeight: 500}}>目标虚拟机UUID
                    *</label><Input placeholder="输入目标虚拟机UUID" value={transferTargetUuid}
                                    onChange={(e) => setTransferTargetUuid(e.target.value)}/>
                    <div style={{fontSize: 12, color: '#666', marginTop: 4}}>数据盘将从当前虚拟机移交到目标虚拟机</div>
                </div>
                <Alert message="目标机器不会自动挂载转移硬盘" type="info" showIcon style={{marginBottom: 16}}/>
                <div className="p-3 rounded" style={{ background: 'var(--bg-secondary, rgba(250,204,21,0.08))', border: '1px solid var(--border-color, rgba(250,204,21,0.3))' }}>
                    <Space><input type="checkbox" id="transferConfirm" checked={transferHddConfirmChecked}
                                  onChange={(e) => setTransferHddConfirmChecked(e.target.checked)}/><label
                        htmlFor="transferConfirm"
                        style={{cursor: 'pointer', userSelect: 'none'}}>我同意关闭当前虚拟机执行操作</label></Space>
                </div>
            </Modal>

            <Modal title="添加USB设备" open={usbModalVisible} onCancel={() => { setUsbModalVisible(false); setSelectedUsbKey(''); setUsbShutdownConfirmChecked(false); }}
                   onOk={handleAddUSB} confirmLoading={usbActionLoading}
                   okButtonProps={{ disabled: !selectedUsbKey || !usbShutdownConfirmChecked }}>
                {usbListLoading ? (
                    <div className="text-center py-8"><Spin tip="正在获取可用USB设备列表..."/></div>
                ) : Object.keys(usbDeviceList).length > 0 ? (
                    <>
                        <div className="mb-3">请选择要直通的USB设备：</div>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="选择USB设备"
                            value={selectedUsbKey || undefined}
                            onChange={(val) => setSelectedUsbKey(val)}
                            optionLabelProp="label"
                        >
                            {Object.entries(usbDeviceList).map(([key, dev]: [string, any]) => (
                                <Select.Option key={key} value={key} label={dev.usb_hint}>
                                    <div>{dev.usb_hint}</div>
                                    <div className="text-xs text-gray-400">VID: {dev.vid_uuid} | PID: {dev.pid_uuid}</div>
                                </Select.Option>
                            ))}
                        </Select>
                    </>
                ) : (
                    <div className="text-center py-8 text-gray-400">当前主机无可用USB设备</div>
                )}
                <div className="p-3 rounded flex items-center mt-4" style={{ background: "var(--bg-secondary, rgba(250,204,21,0.08))", border: "1px solid var(--border-color, rgba(250,204,21,0.3))" }}>
                    <Space><input type="checkbox" id="usbShutdownCheck" checked={usbShutdownConfirmChecked}
                                  onChange={(e) => setUsbShutdownConfirmChecked(e.target.checked)}
                                  className="w-4 h-4 text-blue-600"/><label htmlFor="usbShutdownCheck"
                                                                            className="cursor-pointer select-none text-sm ">我已同意强制关机此虚拟机</label></Space>
                </div>
            </Modal>

            {/* 远程桌面模态框 */}
            <Modal
                title="远程桌面"
                open={remoteModalVisible}
                onCancel={() => setRemoteModalVisible(false)}
                footer={null}
                width={560}
            >

                <div className="remote-modal-cards" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
                    {/* 1. VNC/TTY 一键连接 - 所有非docker+lxc系统都有 */}
                    {hostConfig?.server_type !== 'OCInterface' && hostConfig?.server_type !== 'LxContainer' && (
                        <div className="remote-card" style={{ borderRadius: 8, padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                                        <DesktopOutlined style={{ marginRight: 8, color: '#6366f1' }} />
                                        VNC / TTY 控制台
                                    </div>
                                    <div className="remote-card-desc" style={{ fontSize: 13, marginTop: 4 }}>网页远程控制台，适合救援排障</div>
                                </div>
                                <Button type="primary" onClick={handleOpenVNC} disabled={!hostEnabled}>
                                    一键连接
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* 2. ToDesk远程桌面 - 仅Windows+非docker+lxc */}
                    {hostConfig?.server_type !== 'OCInterface' && hostConfig?.server_type !== 'LxContainer' &&
                     (config.os_name || '').toLowerCase().includes('win') && (
                        <div className="remote-card" style={{ borderRadius: 8, padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                                        <GlobalOutlined style={{ marginRight: 8, color: '#10b981' }} />
                                        ToDesk 远程桌面
                                    </div>
                                    <div className="remote-card-desc" style={{ fontSize: 13, marginTop: 4 }}>高性能远程桌面，适合日常使用</div>
                                </div>
                                {config.rdp_info?.todesk?.code ? (
                                    <Tag color="green">已就绪</Tag>
                                ) : (
                                    <Tag color="default">未就绪</Tag>
                                )}
                            </div>
                            {config.rdp_info?.todesk?.code ? (
                                <div className="remote-card-info" style={{ marginTop: 12, borderRadius: 6, padding: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span className="remote-card-label" style={{ fontSize: 13 }}>设备代码</span>
                                        <Space>
                                            <code style={{ fontSize: 14, fontWeight: 600 }}>{config.rdp_info.todesk.code}</code>
                                            <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword(config.rdp_info.todesk.code, 'ToDesk设备代码')} />
                                        </Space>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="remote-card-label" style={{ fontSize: 13 }}>临时密码</span>
                                        <Space>
                                            <code style={{ fontSize: 14, fontWeight: 600 }}>{config.rdp_info.todesk.password}</code>
                                            <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword(config.rdp_info.todesk.password, 'ToDesk临时密码')} />
                                        </Space>
                                    </div>
                                </div>
                            ) : (
                                <div className="remote-card-hint" style={{ marginTop: 12, fontSize: 13 }}>
                                    ToDesk服务未就绪，请等待虚拟机上报连接信息
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. RDP 一键连接 - 仅Windows+非docker+lxc */}
                    {hostConfig?.server_type !== 'OCInterface' && hostConfig?.server_type !== 'LxContainer' &&
                     (config.os_name || '').toLowerCase().includes('win') && (
                        <div className="remote-card" style={{ borderRadius: 8, padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                                        <WindowsOutlined style={{ marginRight: 8, color: '#3b82f6' }} />
                                        Microsoft RDP 远程桌面
                                    </div>
                                    <div className="remote-card-desc" style={{ fontSize: 13, marginTop: 4 }}>Windows原生远程桌面协议</div>
                                </div>
                            </div>
                            <div className="remote-card-info" style={{ marginTop: 12, borderRadius: 6, padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span className="remote-card-label" style={{ fontSize: 13 }}>连接地址</span>
                                    <Space>
                                        <code style={{ fontSize: 13 }}>{(hostConfig?.public_addr?.[0] || vm?.ipv4_address || '未知')}:{natRules.find(r => Number(r.lan_port) === 3389)?.wan_port || 3389}</code>
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword(`${hostConfig?.public_addr?.[0] || vm?.ipv4_address || ''}:${natRules.find(r => Number(r.lan_port) === 3389)?.wan_port || 3389}`, 'RDP地址')} />
                                    </Space>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span className="remote-card-label" style={{ fontSize: 13 }}>用户名</span>
                                    <Space>
                                        <code style={{ fontSize: 13 }}>{config.rdp_info?.ms_rdp?.user || 'Administrator'}</code>
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword(config.rdp_info?.ms_rdp?.user || 'Administrator', 'RDP用户名')} />
                                    </Space>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <span className="remote-card-label" style={{ fontSize: 13 }}>密码</span>
                                    <Space>
                                        <code style={{ fontSize: 13 }}>{config.os_pass || '未设置'}</code>
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword(config.os_pass || '', 'RDP密码')} />
                                    </Space>
                                </div>
                                <Button block onClick={() => {
                                    const addr = hostConfig?.public_addr?.[0] || vm?.ipv4_address || ''
                                    const user = config.rdp_info?.ms_rdp?.user || 'Administrator'
                                    const rdpPort = natRules.find(r => Number(r.lan_port) === 3389)?.wan_port || 3389
                                    const rdpContent = `full address:s:${addr}:${rdpPort}\r\nusername:s:${user}\r\nprompt for credentials:i:1\r\nadministrative session:i:1`
                                    const blob = new Blob([rdpContent], { type: 'application/x-rdp' })
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = `${config.vm_uuid || uuid}.rdp`
                                    a.click()
                                    URL.revokeObjectURL(url)
                                    message.success('RDP文件已下载')
                                }}>
                                    下载 RDP 文件
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* 4. SSH 一键连接 - 仅Linux和macOS+非docker+lxc */}
                    {hostConfig?.server_type !== 'OCInterface' && hostConfig?.server_type !== 'LxContainer' &&
                     !(config.os_name || '').toLowerCase().includes('win') && (
                        <div className="remote-card" style={{ borderRadius: 8, padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                                        <CodeOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
                                        SSH 远程连接
                                    </div>
                                    <div className="remote-card-desc" style={{ fontSize: 13, marginTop: 4 }}>命令行远程连接，适合Linux/macOS</div>
                                </div>
                            </div>
                            <div className="remote-card-info" style={{ marginTop: 12, borderRadius: 6, padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span className="remote-card-label" style={{ fontSize: 13 }}>连接地址</span>
                                    <Space>
                                        <code style={{ fontSize: 13 }}>{hostConfig?.public_addr?.[0] || vm?.ipv4_address || '未知'}:{natRules.find(r => Number(r.lan_port) === 22)?.wan_port || 22}</code>
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword(`${hostConfig?.public_addr?.[0] || vm?.ipv4_address || ''}:${natRules.find(r => Number(r.lan_port) === 22)?.wan_port || 22}`, 'SSH地址')} />
                                    </Space>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span className="remote-card-label" style={{ fontSize: 13 }}>用户名</span>
                                    <Space>
                                        <code style={{ fontSize: 13 }}>root</code>
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword('root', 'SSH用户名')} />
                                    </Space>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <span className="remote-card-label" style={{ fontSize: 13 }}>密码</span>
                                    <Space>
                                        <code style={{ fontSize: 13 }}>{config.os_pass || '未设置'}</code>
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyPassword(config.os_pass || '', 'SSH密码')} />
                                    </Space>
                                </div>
                                <Button block onClick={() => {
                                    const addr = hostConfig?.public_addr?.[0] || vm?.ipv4_address || ''
                                    const sshPort = natRules.find(r => Number(r.lan_port) === 22)?.wan_port || 22
                                    const sshCmd = sshPort === 22 ? `ssh root@${addr}` : `ssh -p ${sshPort} root@${addr}`
                                    navigator.clipboard.writeText(sshCmd)
                                    message.success('SSH命令已复制')
                                }}>
                                    复制 SSH 命令
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    )
}

export default VMDetail
