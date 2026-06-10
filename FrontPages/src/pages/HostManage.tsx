import React, {useEffect, useState} from 'react'
import {
    Button,
    Modal,
    Form,
    Input,
    Select,
    InputNumber,
    message,
    Card,
    Row,
    Col,
    Tabs,
    Space,
    Tag,
    Tooltip,
    Progress,
    Table
} from 'antd'
import {
    PlusOutlined,
    ReloadOutlined,
    DeleteOutlined,
    EditOutlined,
    PlayCircleOutlined,
    StopOutlined,
    ScanOutlined,
    CloudSyncOutlined,
    InfoCircleOutlined,
    CloudServerOutlined,
    GlobalOutlined,
    SettingOutlined,
    FolderOutlined,
    DatabaseOutlined,
    CopyOutlined,
    ExclamationCircleOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
} from '@ant-design/icons'
import {useNavigate} from 'react-router-dom'
import api from '@/utils/apis.ts'
import PageHeader from '@/components/PageHeader'

// 主机配置接口
// OS镜像配置项（system_maps/images_maps通用结构）
interface OSConfigItem {
    sys_name: string   // 显示名称
    sys_file: string   // 文件存储名称
    sys_size: string   // 最低磁盘大小(GB)
    sys_type: string   // WinNT/Linux/macOS
    sys_flag?: boolean // 是否启用此镜像
}

interface HostConfig {
    server_type?: string
    server_addr?: string
    server_user?: string
    server_pass?: string
    filter_name?: string
    images_path?: string
    dvdrom_path?: string
    system_path?: string
    backup_path?: string
    extern_path?: string
    launch_path?: string
    server_port?: number
    network_nat?: string
    network_pub?: string
    i_kuai_addr?: string
    i_kuai_user?: string
    i_kuai_pass?: string
    ports_start?: number
    ports_close?: number
    remote_port?: number
    limits_nums?: number
    system_maps?: OSConfigItem[]
    images_maps?: OSConfigItem[]
    ipaddr_maps?: Record<string, any>
    ipaddr_ddns?: string[]
    public_addr?: string[]
    extend_data?: any
    server_area?: string
    n_cpu_price?: number
    n_mem_price?: number
    n_hdd_price?: number
    n_net_price?: number
    server_plan?: Record<string, any>
}

// 套餐配置行接口
interface ServerPlanRow {
    id: string
    planName: string
    cpu_num: number
    cpu_per: number
    gpu_mem: number
    mem_num: number
    hdd_num: number
    hdd_iop: number
    bak_num: number
    iso_num: number
    pci_num: number
    usb_num: number
    dat_num: number
    dat_all: number
    speed_u: number
    speed_d: number
    nat_num: number
    web_num: number
    flu_num: number
    flu_rst: number[]
    nic_pub: number
    nic_pri: number
    ip4_max: number
    ip6_max: number
}

// 主机数据接口
interface Host {
    name: string
    type: string
    addr: string
    status: string
    vm_count: number
    config?: HostConfig
}

// 主机状态接口
interface HostStatus {
    cpu_usage?: number
    cpu_total?: number
    cpu_model?: string
    cpu_heats?: number
    cpu_power?: number
    mem_usage?: number
    mem_total?: number
    hdd_usage?: number
    hdd_total?: number
    ext_usage?: Record<string, [number, number]>
    network_a?: number
    network_u?: number
    network_d?: number
    gpu_usage?: Record<string, number>
    gpu_total?: number
    status?: string
}

// 引擎类型配置接口
interface EngineTypeConfig {
    enabled: boolean
    description: string
    messages?: string[]
    options?: Record<string, string>
}

// 系统镜像行接口
interface SystemMapRow {
    id: string
    sys_name: string
    sys_file: string
    sys_size: string
    sys_type: string
    sys_flag: boolean
}

// 光盘镜像行接口
interface ImageMapRow {
    id: string
    sys_name: string
    sys_file: string
    sys_size: string
    sys_type: string
    sys_flag: boolean
}

// IP地址池配置行接口
interface IpaddrMapRow {
    id: string
    setName: string
    vers: string
    type: string
    gate: string
    mask: string
    fromIp: string
    nums: number
}

// 主机列表视图组件
function HostTableView({ hosts, hostsStatus, engineTypes, navigate, handleEdit, handleToggle }: {
    hosts: Record<string, Host>
    hostsStatus: Record<string, HostStatus>
    engineTypes: Record<string, EngineTypeConfig>
    navigate: any
    handleEdit: (name: string) => void
    handleToggle: (name: string, enable: boolean) => void
}) {
    const [visiblePublicAddr, setVisiblePublicAddr] = useState<Record<string, boolean>>({})

    const togglePublicAddr = (name: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setVisiblePublicAddr(prev => ({ ...prev, [name]: !prev[name] }))
    }

    const dataSource = Object.entries(hosts).map(([name, host]) => ({
        key: name,
        name,
        host,
        status: hostsStatus[name],
    }))

    const columns = [
        {
            title: '主机名称',
            key: 'name',
            width: 160,
            fixed: 'left' as const,
            render: (_: any, record: any) => {
                const isActive = record.host.status === 'active'
                const dotColor = isActive ? '#10b981' : '#ef4444'
                return (
                    <div>
                        <div className="flex items-center gap-2">
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, boxShadow: isActive ? '0 0 4px #10b981' : undefined }} />
                            <CloudServerOutlined className="text-blue-500" />
                            <a className="font-medium text-blue-600 hover:underline cursor-pointer" onClick={() => navigate(`/hosts/${record.name}/vms`)}>{record.name}</a>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <Tag color={isActive ? 'success' : 'error'} style={{ margin: 0, fontSize: 11 }}>
                                {isActive ? '已启用' : '已禁用'}
                            </Tag>
                        </div>
                    </div>
                )
            },
        },
        {
            title: '类型',
            key: 'type',
            width: 100,
            render: (_: any, record: any) => {
                const typeInfo = engineTypes[record.host.type] || {}
                return <span className="text-xs">{typeInfo.description || record.host.type}</span>
            },
        },
        {
            title: 'IP地址',
            key: 'ip',
            width: 140,
            render: (_: any, record: any) => (
                <span className="text-xs">{record.host.addr || record.host.config?.server_addr || '未配置'}</span>
            ),
        },
        {
            title: '公网地址',
            key: 'public',
            width: 160,
            render: (_: any, record: any) => {
                const publicAddrs = record.host.config?.public_addr || []
                const showPublic = visiblePublicAddr[record.name]
                if (publicAddrs.length === 0) return <span className="text-xs" style={{ color: '#999' }}>-</span>
                return (
                    <div className="flex items-center gap-1">
                        {showPublic ? (
                            <span className="text-xs">{publicAddrs.join(', ')}</span>
                        ) : (
                            <span className="text-xs" style={{ color: '#999' }}>••••••</span>
                        )}
                        <Tooltip title={showPublic ? '隐藏' : '查看'}>
                            <Button
                                type="text"
                                size="small"
                                icon={showPublic ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                                onClick={(e) => togglePublicAddr(record.name, e)}
                                style={{ fontSize: 12 }}
                            />
                        </Tooltip>
                    </div>
                )
            },
        },
        {
            title: '虚拟机',
            key: 'vms',
            width: 80,
            render: (_: any, record: any) => (
                <span className="text-xs">{record.host.vm_count || 0} / {record.host.config?.limits_nums || 0}</span>
            ),
        },
        {
            title: 'CPU',
            key: 'cpu',
            width: 130,
            render: (_: any, record: any) => {
                const status = record.status
                const cpuPercent = status ? Math.min(status.cpu_usage || 0, 100) : 0
                return (
                    <div>
                        <div className="text-xs mb-1">
                            {status?.cpu_total || 0}核 {cpuPercent.toFixed(1)}%
                        </div>
                        <Progress
                            percent={Number(cpuPercent.toFixed(0))}
                            size="small"
                            showInfo={false}
                            strokeColor={cpuPercent > 80 ? '#ef4444' : cpuPercent > 50 ? '#f59e0b' : '#3b82f6'}
                        />
                    </div>
                )
            },
        },
        {
            title: '内存',
            key: 'mem',
            width: 130,
            render: (_: any, record: any) => {
                const status = record.status
                const memPercent = status && status.mem_total ? Math.min((status.mem_usage || 0) / status.mem_total * 100, 100) : 0
                const fmtMem = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`
                return (
                    <div>
                        <div className="text-xs mb-1">
                            {status ? `${fmtMem(status.mem_usage || 0)}/${fmtMem(status.mem_total || 0)}` : '-'}
                        </div>
                        <Progress
                            percent={Number(memPercent.toFixed(0))}
                            size="small"
                            showInfo={false}
                            strokeColor={memPercent > 80 ? '#ef4444' : memPercent > 50 ? '#f59e0b' : '#8b5cf6'}
                        />
                    </div>
                )
            },
        },
        {
            title: '磁盘',
            key: 'hdd',
            width: 130,
            render: (_: any, record: any) => {
                const status = record.status
                const hddPercent = status && status.hdd_total ? Math.min((status.hdd_usage || 0) / status.hdd_total * 100, 100) : 0
                const fmtDisk = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`
                return (
                    <div>
                        <div className="text-xs mb-1">
                            {status?.hdd_total ? `${fmtDisk(status.hdd_usage || 0)}/${fmtDisk(status.hdd_total)}` : '-'}
                        </div>
                        <Progress
                            percent={Number(hddPercent.toFixed(0))}
                            size="small"
                            showInfo={false}
                            strokeColor={hddPercent > 80 ? '#ef4444' : hddPercent > 50 ? '#f59e0b' : '#10b981'}
                        />
                    </div>
                )
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 140,
            fixed: 'right' as const,
            render: (_: any, record: any) => {
                const isActive = record.host.status === 'active'
                return (
                    <Space size="small">
                        <Tooltip title="管理虚拟机">
                            <Button type="text" size="small" icon={<CloudServerOutlined />} onClick={() => navigate(`/hosts/${record.name}/vms`)} disabled={!isActive} />
                        </Tooltip>
                        <Tooltip title="编辑">
                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record.name)} disabled={!isActive} />
                        </Tooltip>
                        <Tooltip title={isActive ? '禁用' : '启用'}>
                            <Button
                                type="text"
                                size="small"
                                icon={isActive ? <StopOutlined style={{ color: '#faad14' }} /> : <PlayCircleOutlined style={{ color: '#52c41a' }} />}
                                onClick={() => handleToggle(record.name, !isActive)}
                            />
                        </Tooltip>
                    </Space>
                )
            },
        },
    ]

    return (
        <Table
            dataSource={dataSource}
            columns={columns}
            pagination={false}
            size="small"
            scroll={{ x: 1200 }}
        />
    )
}

/**
 * 主机管理页面
 */
function HostManage() {
    // 路由导航
    const navigate = useNavigate()

    // 状态管理
    const [hosts, setHosts] = useState<Record<string, Host>>({})
    const [hostsStatus, setHostsStatus] = useState<Record<string, HostStatus>>({})
    const [engineTypes, setEngineTypes] = useState<Record<string, EngineTypeConfig>>({})
    const [loading, setLoading] = useState(false)
    const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
        return (localStorage.getItem('hostManage_viewMode') as 'card' | 'table') || 'card'
    })
    const [modalVisible, setModalVisible] = useState(false)
    const [editMode, setEditMode] = useState<'add' | 'edit'>('add')
    const [currentHost, setCurrentHost] = useState<string>('')
    const [form] = Form.useForm()

    // 用于跟踪最新的主机列表，避免闭包问题
    const hostsRef = React.useRef(hosts)

    useEffect(() => {
        hostsRef.current = hosts
    }, [hosts])

    // 动态配置状态
    const [systemMaps, setSystemMaps] = useState<SystemMapRow[]>([])
    const [imageMaps, setImageMaps] = useState<ImageMapRow[]>([])
    const [ipaddrMaps, setIpaddrMaps] = useState<IpaddrMapRow[]>([])
    const [serverPlans, setServerPlans] = useState<ServerPlanRow[]>([])
    const [selectedHostType, setSelectedHostType] = useState<string>('')

    // 加载引擎类型
    const loadEngineTypes = async () => {
        try {
            const result = await api.getEngineTypes()
            if (result.code === 200) {
                // 后端返回格式: { current_platform, current_arch, engine_types: {...} }
                const data = result.data as any || {}
                const engineData = data.engine_types || {}
                if (typeof engineData === 'object' && !Array.isArray(engineData)) {
                    setEngineTypes(engineData as Record<string, EngineTypeConfig>)
                }
            }
        } catch (error) {
            console.error('加载引擎类型失败:', error)
        }
    }

    // 加载主机列表
    const loadHosts = async () => {
        try {
            setLoading(true)
            const result = await api.getHosts()
            if (result.code === 200 && result.data) {
                setHosts(result.data as unknown as Record<string, Host>)

                // 仅对已启用的主机加载状态，禁用主机不调用getHostStatus
                const enabledNames = Object.keys(result.data).filter(name =>
                    (result.data as any)[name].status === 'active'
                )
                const statusPromises = enabledNames.map(name =>
                    api.getHostStatus(name).catch(() => null)
                )
                const statusResults = await Promise.all(statusPromises)

                // 构建状态映射
                const statusMap: Record<string, HostStatus> = {}
                enabledNames.forEach((name, index) => {
                    const statusResult = statusResults[index] as any
                    if (statusResult && statusResult.code === 200 && statusResult.data?.status) {
                        statusMap[name] = statusResult.data.status
                    }
                })
                setHostsStatus(statusMap)
            }
        } catch (error) {
            message.error('加载主机列表失败')
        } finally {
            setLoading(false)
        }
    }

    // 初始加载
    useEffect(() => {
        loadEngineTypes()
        loadHosts()
    }, [])

    // 定时刷新状态 - 刷新主机列表和状态，确保enable_host等字段实时更新
    useEffect(() => {
        const refreshHostsAndStatus = async () => {
            try {
                // 1. 刷新主机列表（包含is_enabled状态）
                const hostsResult = await api.getHosts()
                if (hostsResult.code === 200 && hostsResult.data) {
                    setHosts(hostsResult.data as unknown as Record<string, Host>)
                    
                    // 2. 仅对已启用的主机刷新状态，禁用主机不调用getHostStatus
                    const enabledNames = Object.keys(hostsResult.data).filter(name =>
                        (hostsResult.data as any)[name].status === 'active'
                    )
                    if (enabledNames.length > 0) {
                        const statusPromises = enabledNames.map(name =>
                            api.getHostStatus(name).catch(() => null)
                        )
                        const statusResults = await Promise.all(statusPromises)

                        // 构建状态映射
                        const statusMap: Record<string, HostStatus> = {}
                        enabledNames.forEach((name, index) => {
                            const statusResult = statusResults[index] as any
                            if (statusResult && statusResult.code === 200 && statusResult.data?.status) {
                                statusMap[name] = statusResult.data.status
                            }
                        })
                        setHostsStatus(statusMap)
                    }
                }
            } catch (error) {
                console.error('刷新主机数据失败:', error)
            }
        }

        // 只通过定时器执行，不立即执行
        const interval = setInterval(refreshHostsAndStatus, 10000)

        return () => clearInterval(interval)
    }, [])

    // 复制到剪贴板
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            message.success(`已复制: ${text}`)
        }).catch(() => {
            message.error('复制失败')
        })
    }

    // 打开添加主机对话框
    const handleAdd = () => {
        setEditMode('add')
        setCurrentHost('')
        setSelectedHostType('')
        form.resetFields()
        setSystemMaps([{id: Date.now().toString(), sys_name: '', sys_file: '', sys_size: '', sys_type: '', sys_flag: true}])
        setImageMaps([{id: Date.now().toString(), sys_name: '', sys_file: '', sys_size: '', sys_type: '', sys_flag: true}])
        setIpaddrMaps([{
            id: Date.now().toString(),
            setName: '',
            vers: 'ipv4',
            type: 'nat',
            gate: '',
            mask: '',
            fromIp: '',
            nums: 0
        }])
        setServerPlans([])
        setModalVisible(true)
    }

    // 打开编辑主机对话框
    const handleEdit = async (name: string) => {
        try {
            const result = await api.getHostDetail(name)
            if (result.code === 200 && result.data) {
                const hostData = result.data as unknown as Host
                setEditMode('edit')
                setCurrentHost(name)
                setSelectedHostType(hostData.type)

                const config = hostData.config || {}

                // 先重置表单，防止残留上次编辑的字段值
                form.resetFields()

                // 设置表单值
                form.setFieldsValue({
                    name: name,
                    type: hostData.type,
                    server_addr: config.server_addr,
                    server_user: config.server_user,
                    server_pass: config.server_pass,
                    filter_name: config.filter_name,
                    images_path: config.images_path,
                    dvdrom_path: config.dvdrom_path,
                    system_path: config.system_path,
                    backup_path: config.backup_path,
                    extern_path: config.extern_path,
                    launch_path: config.launch_path,
                    server_port: config.server_port,
                    network_nat: config.network_nat,
                    network_pub: config.network_pub,
                    i_kuai_addr: config.i_kuai_addr,
                    i_kuai_user: config.i_kuai_user,
                    i_kuai_pass: config.i_kuai_pass,
                    ports_start: config.ports_start,
                    ports_close: config.ports_close,
                    remote_port: config.remote_port,
                    limits_nums: config.limits_nums,
                    ipaddr_ddns: (config.ipaddr_ddns || []).join(', '),
                    public_addr: (config.public_addr || []).join(', '),
                    extend_data: config.extend_data ? JSON.stringify(config.extend_data, null, 2) : '',
                    // server_area 存储为 "代码,名称"（如 "CN,成都"），回显时拆为两个字段
                    area_code: ((config.server_area || '').split(',', 2)[0] || '').trim(),
                    area_name: ((config.server_area || '').split(',', 2)[1] || '').trim(),
                    // 售价配置
                    n_cpu_price: config.n_cpu_price ?? 0,
                    n_mem_price: config.n_mem_price ?? 0,
                    n_hdd_price: config.n_hdd_price ?? 0,
                    n_net_price: config.n_net_price ?? 0
                })

                // 加载系统镜像列表
                const systemMapsData: SystemMapRow[] = []
                if (Array.isArray(config.system_maps)) {
                    config.system_maps.forEach((item: OSConfigItem) => {
                        systemMapsData.push({
                            id: Date.now().toString() + Math.random(),
                                sys_name: item.sys_name || '',
                                sys_file: item.sys_file || '',
                                sys_size: item.sys_size || '',
                                sys_type: item.sys_type || '',
                                sys_flag: item.sys_flag !== false
                            })
                        })
                    }
                    setSystemMaps(systemMapsData.length > 0 ? systemMapsData : [{
                        id: Date.now().toString(),
                        sys_name: '',
                        sys_file: '',
                        sys_size: '',
                        sys_type: '',
                        sys_flag: true
                }])

                // 加载光盘镜像列表
                const imageMapsData: ImageMapRow[] = []
                if (Array.isArray(config.images_maps)) {
                    config.images_maps.forEach((item: OSConfigItem) => {
                        imageMapsData.push({
                            id: Date.now().toString() + Math.random(),
                                sys_name: item.sys_name || '',
                                sys_file: item.sys_file || '',
                                sys_size: item.sys_size || '',
                                sys_type: item.sys_type || '',
                                sys_flag: item.sys_flag !== false
                            })
                        })
                    }
                    setImageMaps(imageMapsData.length > 0 ? imageMapsData : [{
                        id: Date.now().toString(),
                        sys_name: '',
                        sys_file: '',
                        sys_size: '',
                        sys_type: '',
                        sys_flag: true
                }])

                // 加载IP地址池配置
                const ipaddrMapsData: IpaddrMapRow[] = []
                if (config.ipaddr_maps) {
                    Object.entries(config.ipaddr_maps).forEach(([setName, ipConfig]: [string, any]) => {
                        ipaddrMapsData.push({
                            id: Date.now().toString() + Math.random(),
                            setName,
                            vers: ipConfig.vers || 'ipv4',
                            type: ipConfig.type || 'nat',
                            gate: ipConfig.gate || '',
                            mask: ipConfig.mask || '',
                            fromIp: ipConfig.from || '',
                            nums: ipConfig.nums || 0
                        })
                    })
                }
                setIpaddrMaps(ipaddrMapsData.length > 0 ? ipaddrMapsData : [{
                    id: Date.now().toString(),
                    setName: '',
                    vers: 'ipv4',
                    type: 'nat',
                    gate: '',
                    mask: '',
                    fromIp: '',
                    nums: 0
                }])

                // 加载套餐配置
                const serverPlansData: ServerPlanRow[] = []
                if (config.server_plan) {
                    Object.entries(config.server_plan).forEach(([planName, planCfg]: [string, any]) => {
                        serverPlansData.push({
                            id: Date.now().toString() + Math.random(),
                            planName,
                            cpu_num: planCfg.cpu_num ?? 2,
                            cpu_per: planCfg.cpu_per ?? 0,
                            gpu_mem: planCfg.gpu_mem ?? 0,
                            mem_num: planCfg.mem_num ?? 2048,
                            hdd_num: planCfg.hdd_num ?? 8192,
                            hdd_iop: planCfg.hdd_iop ?? 1000,
                            bak_num: planCfg.bak_num ?? 1,
                            iso_num: planCfg.iso_num ?? 1,
                            pci_num: planCfg.pci_num ?? 0,
                            usb_num: planCfg.usb_num ?? 0,
                            dat_num: planCfg.dat_num ?? 1,
                            dat_all: planCfg.dat_all ?? 0,
                            speed_u: planCfg.speed_u ?? 100,
                            speed_d: planCfg.speed_d ?? 100,
                            nat_num: planCfg.nat_num ?? 100,
                            web_num: planCfg.web_num ?? 100,
                            flu_num: planCfg.flu_num ?? 102400,
                            flu_rst: Array.isArray(planCfg.flu_rst) ? planCfg.flu_rst : [31, 10, 10],
                            nic_pub: planCfg.nic_pub ?? 0,
                            nic_pri: planCfg.nic_pri ?? 1,
                            ip4_max: planCfg.ip4_max ?? 1,
                            ip6_max: planCfg.ip6_max ?? 0,
                        })
                    })
                }
                setServerPlans(serverPlansData)

                setModalVisible(true)
            }
        } catch (error) {
            console.error('加载主机信息失败:', error)
            message.error('加载主机信息失败:' + (error as Error).message)
        }
    }

    // 提交表单
    const handleSubmit = async (values: any) => {
        try {
            // 构建系统镜像列表
            const system_maps: OSConfigItem[] = []
            systemMaps.forEach(row => {
                if (row.sys_name && row.sys_file) {
                    system_maps.push({
                        sys_name: row.sys_name,
                        sys_file: row.sys_file,
                        sys_size: row.sys_size || '0',
                        sys_type: row.sys_type || '',
                        sys_flag: row.sys_flag !== false
                    })
                }
            })

            // 构建光盘镜像列表
            const images_maps: OSConfigItem[] = []
            imageMaps.forEach(row => {
                if (row.sys_name && row.sys_file) {
                    images_maps.push({
                        sys_name: row.sys_name,
                        sys_file: row.sys_file,
                        sys_size: row.sys_size || '0',
                        sys_type: row.sys_type || '',
                        sys_flag: row.sys_flag !== false
                    })
                }
            })

            // 构建IP地址池配置
            const ipaddr_maps: Record<string, any> = {}
            ipaddrMaps.forEach(row => {
                if (row.setName && row.fromIp && row.nums > 0) {
                    ipaddr_maps[row.setName] = {
                        vers: row.vers,
                        type: row.type,
                        gate: row.gate,
                        mask: row.mask,
                        from: row.fromIp,
                        nums: row.nums
                    }
                }
            })

            // 解析扩展数据
            let extend_data = {}
            if (values.extend_data) {
                try {
                    extend_data = JSON.parse(values.extend_data)
                } catch (e) {
                    message.error('扩展数据JSON格式错误')
                    return
                }
            }

            // 构建套餐配置
            const server_plan: Record<string, any> = {}
            serverPlans.forEach(row => {
                if (row.planName) {
                    server_plan[row.planName] = {
                        cpu_num: row.cpu_num,
                        cpu_per: row.cpu_per,
                        gpu_mem: row.gpu_mem,
                        mem_num: row.mem_num,
                        hdd_num: row.hdd_num,
                        hdd_iop: row.hdd_iop,
                        bak_num: row.bak_num,
                        iso_num: row.iso_num,
                        pci_num: row.pci_num,
                        usb_num: row.usb_num,
                        dat_num: row.dat_num,
                        dat_all: row.dat_all,
                        speed_u: row.speed_u,
                        speed_d: row.speed_d,
                        nat_num: row.nat_num,
                        web_num: row.web_num,
                        flu_num: row.flu_num,
                        flu_rst: Array.isArray(row.flu_rst) && row.flu_rst.length === 3 ? row.flu_rst : [31, 10, 10],
                        nic_pub: row.nic_pub,
                        nic_pri: row.nic_pri,
                        ip4_max: row.ip4_max,
                        ip6_max: row.ip6_max,
                    }
                }
            })

            const config: HostConfig = {
                server_type: values.type,
                server_addr: values.server_addr,
                server_user: values.server_user,
                server_pass: values.server_pass,
                filter_name: values.filter_name,
                images_path: values.images_path,
                dvdrom_path: values.dvdrom_path,
                system_path: values.system_path,
                backup_path: values.backup_path,
                extern_path: values.extern_path,
                launch_path: values.launch_path,
                server_port: values.server_port,
                network_nat: values.network_nat,
                network_pub: values.network_pub,
                i_kuai_addr: values.i_kuai_addr,
                i_kuai_user: values.i_kuai_user,
                i_kuai_pass: values.i_kuai_pass,
                ports_start: values.ports_start,
                ports_close: values.ports_close,
                remote_port: values.remote_port,
                limits_nums: values.limits_nums,
                system_maps,
                images_maps,
                ipaddr_maps,
                ipaddr_ddns: values.ipaddr_ddns ? values.ipaddr_ddns.split(',').map((s: string) => s.trim()).filter((s: string) => s) : [],
                public_addr: values.public_addr ? values.public_addr.split(',').map((s: string) => s.trim()).filter((s: string) => s) : [],
                extend_data,
                // 将 area_code + area_name 合并为 "代码,名称" 格式；只有一个时只传一个；都空则为空串
                server_area: (() => {
                    const code = (values.area_code || '').trim()
                    const name = (values.area_name || '').trim()
                    if (code && name) return `${code},${name}`
                    return code || name || ''
                })(),
                n_cpu_price: Number(values.n_cpu_price) || 0,
                n_mem_price: Number(values.n_mem_price) || 0,
                n_hdd_price: Number(values.n_hdd_price) || 0,
                n_net_price: Number(values.n_net_price) || 0,
                server_plan,
            }

            if (editMode === 'add') {
                await api.createHost({
                    name: values.name,
                    type: values.type,
                    config: config,
                    server_pass: values.server_pass
                } as any)
                message.success('主机添加成功')
            } else {
                await api.updateHost(currentHost, { config } as any)
                message.success('主机更新成功')
            }

            setModalVisible(false)
            loadHosts()
        } catch (error: any) {
            message.error(error.message || '操作失败')
        }
    }

    // 删除主机
    const handleDelete = async (name: string) => {
        try {
            await api.deleteHost(name)
            message.success('主机删除成功')
            loadHosts()
        } catch (error) {
            message.error('删除主机失败')
        }
    }

    // 切换主机状态（启用/禁用）
    const handleToggle = async (name: string, enable: boolean) => {
        // 如果是禁用操作，弹出确认对话框
        if (!enable) {
            Modal.confirm({
                title: '确认禁用主机',
                icon: <ExclamationCircleOutlined style={{color: '#faad14'}}/>,
                content: (
                    <div>
                        <p>确定要禁用主机 <strong>"{name}"</strong> 吗？</p>
                        <p style={{marginTop: 8}}>
                            禁用后：
                        </p>
                        <ul style={{marginTop: 4, paddingLeft: 20}}>
                            <li>该主机的虚拟机操作将不可用</li>
                            <li>系统不再自动更新该主机状态</li>
                            <li>但运行中的虚拟机不会被关闭</li>
                        </ul>
                    </div>
                ),
                okText: '确认禁用',
                okType: 'danger',
                cancelText: '取消',
                mask: false,
                onOk: async () => {
                    try {
                        await api.setHostEnabled(name, enable)
                        message.success('主机已禁用')
                        loadHosts()
                    } catch (error) {
                        message.error('禁用失败')
                    }
                }
            })
        } else {
            // 启用操作也需要二次确认
            Modal.confirm({
                title: '确认启用主机',
                icon: <ExclamationCircleOutlined style={{color: '#52c41a'}}/>,
                content: (
                    <div>
                        <p>确定要启用主机 <strong>"{name}"</strong> 吗？</p>
                        <p style={{marginTop: 8}}>
                            启用后：
                        </p>
                        <ul style={{marginTop: 4, paddingLeft: 20}}>
                            <li>系统将恢复对该主机的状态监控</li>
                            <li>该主机的虚拟机操作将恢复可用</li>
                        </ul>
                    </div>
                ),
                okText: '确认启用',
                cancelText: '取消',
                mask: false,
                onOk: async () => {
                    try {
                        await api.setHostEnabled(name, enable)
                        message.success('主机已启用')
                        loadHosts()
                    } catch (error) {
                        message.error('启用失败')
                    }
                }
            })
        }
    }

    // 扫描虚拟机
    const handleScanVMs = async (name: string) => {
        try {
            const result = await api.scanVMs(name)
            if (result.code === 200) {
                const data = result.data || {}
                message.success(`扫描完成：扫描到 ${data.scanned || 0} 台虚拟机，新增 ${data.added || 0} 台`)
                loadHosts()
            } else {
                message.error(result.msg || '扫描失败')
            }
        } catch (error) {
            message.error('扫描失败')
        }
    }

    // 扫描备份
    const handleScanBackups = async (name: string) => {
        try {
            await api.scanBackups(name)
            message.success('备份扫描成功')
            loadHosts()
        } catch (error) {
            message.error('扫描失败')
        }
    }

    // 获取进度条颜色
    const getProgressColor = (percent: number) => {
        if (percent >= 90) return '#ef4444'
        if (percent >= 75) return '#f97316'
        if (percent >= 50) return '#eab308'
        return '#22c55e'
    }

    // 渲染主机卡片
    const renderHostCard = (name: string, host: Host) => {
        const status = hostsStatus[name]
        const typeInfo = engineTypes[host.type] || {}

        // 计算资源使用率
        const cpuPercent = status ? Math.min(status.cpu_usage || 0, 100) : 0
        const memPercent = status && status.mem_total ? Math.min((status.mem_usage || 0) / status.mem_total * 100, 100) : 0
        const memUsageGB = status ? ((status.mem_usage || 0) / 1024).toFixed(1) : '0.0'
        const memTotalGB = status ? ((status.mem_total || 0) / 1024).toFixed(1) : '0.0'

        // 获取磁盘使用率：优先使用 hdd_total/hdd_usage，备用 ext_usage
        let diskPercent = 0
        let diskUsageGB = 0
        let diskTotalGB = 0
        if (status?.hdd_total && status.hdd_total > 0) {
            diskTotalGB = (status.hdd_total / 1024)
            diskUsageGB = ((status.hdd_usage || 0) / 1024)
            diskPercent = Math.min((status.hdd_usage || 0) / status.hdd_total * 100, 100)
        } else if (status?.ext_usage) {
            const disks = Object.entries(status.ext_usage)
            if (disks.length > 0) {
                const [_name, [total, used]] = disks[0]
                diskTotalGB = (total / 1024)
                diskUsageGB = (used / 1024)
                diskPercent = total > 0 ? Math.min((used / total * 100), 100) : 0
            }
        }

        // 网络带宽
        const networkA = status?.network_a || 1000 // Mbps
        const maxBandwidth = networkA * 1024 / 8 // KB/s
        const networkU = status?.network_u || 0 // KB/s
        const networkD = status?.network_d || 0 // KB/s
        const networkUPercent = Math.min((networkU / maxBandwidth * 100), 100)
        const networkDPercent = Math.min((networkD / maxBandwidth * 100), 100)

        // GPU使用率
        let gpuPercent = 0
        if (status?.gpu_usage) {
            const gpuKeys = Object.keys(status.gpu_usage)
            if (gpuKeys.length > 0) {
                gpuPercent = Math.min(status.gpu_usage[gpuKeys[0]] || 0, 100)
            }
        }

        // CPU温度和功耗
        // const cpuTemp = status?.cpu_heats || 0  // 暂未使用
        // const cpuPower = status?.cpu_power || 0  // 暂未使用
        // const cpuTempPercent = Math.min((cpuTemp / 100 * 100), 100)  // 暂未使用

        return (
            <Card
                key={name}
                className="glass-card mb-4 hover:shadow-lg transition-shadow"
                title={
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                <CloudServerOutlined className="text-white text-2xl"/>
                            </div>
                            <div>
                                <div className="font-semibold">{name}</div>
                                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{typeInfo.description || host.type}</div>
                            </div>
                        </div>
                        <Tag color={host.status === 'active' ? 'success' : 'error'}>
                            {host.status === 'active' ? '已启用' : '已禁用'}
                        </Tag>
                    </div>
                }
                extra={
                    <Space>
                        <Button
                            icon={<EditOutlined/>}
                            onClick={() => handleEdit(name)}
                            disabled={host.status !== 'active'}
                        >
                            编辑
                        </Button>
                        <Button
                            type="primary"
                            onClick={() => navigate(`/hosts/${name}/vms`)}
                            title="虚拟机管理"
                            disabled={host.status !== 'active'}
                        >
                            管理
                        </Button>
                    </Space>
                }
            >
                <Row gutter={16} style={{display: 'flex', flexWrap: 'nowrap'}}>
                    {/* 左侧：基本信息 */}
                    <Col span={8} style={{minWidth: '240px', flexShrink: 0, flexGrow: 0}}>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>主机连接IP:</span>
                                <span className="truncate ">{host.addr || '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-start">
                                <span style={{ color: 'var(--text-secondary)' }}>公共公共IP:</span>
                                <div className="text-right max-w-[60%]">
                                    {host.config?.public_addr && host.config.public_addr.length > 0 ? (
                                        host.config.public_addr.map((ip, idx) => (
                                            <div key={idx} className="flex items-center justify-end gap-1 mb-1">
                                                <span className="truncate ">{ip}</span>
                                                <Tooltip title="复制">
                                                    <CopyOutlined
                                                        className="hover:text-blue-600 cursor-pointer text-xs"
                                                        onClick={() => copyToClipboard(ip)}/>
                                                </Tooltip>
                                            </div>
                                        ))
                                    ) : (
                                        <span>未配置</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>访问端口:</span>
                                <span className="">{host.config?.server_port && host.config.server_port > 0 ? host.config.server_port : '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>桌面端口:</span>
                                <span className="">{host.config?.remote_port || '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>虚拟机前缀:</span>
                                <span className="truncate ">{host.config?.filter_name || '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>虚拟机数量:</span>
                                <span className=""
                                >{host.vm_count || 0} / {host.config?.limits_nums || 0} 台</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>内网网桥:</span>
                                <span className="">{host.config?.network_nat || '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>公网网桥:</span>
                                <span className="">{host.config?.network_pub || '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>端口范围:</span>
                                <span className=""
                                >{host.config?.ports_start && host.config?.ports_close ? `${host.config.ports_start}-${host.config.ports_close}` : '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>爱快地址:</span>
                                <span className="truncate ">{host.config?.i_kuai_addr || '未配置'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span style={{ color: 'var(--text-secondary)' }}>模板数:</span>
                                <span className=""
                                >系统盘 {Array.isArray(host.config?.system_maps) ? host.config.system_maps.length : 0} / 光盘 {Array.isArray(host.config?.images_maps) ? host.config.images_maps.length : 0} 个</span>
                            </div>

                        </div>
                    </Col>

                    {/* 右侧：资源状态 */}
                    <Col span={16} style={{overflow: 'hidden', flexGrow: 1, flexShrink: 1, minWidth: 0}}>
                        {status ? (
                            <div className="space-y-5" style={{width: '100%'}}>
                                {/* CPU */}
                                <div style={{minWidth: 0}}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span style={{ color: 'var(--text-secondary)' }} className="truncate"
                                              title={status.cpu_model || '核心使用率'}>{status.cpu_model || '核心使用率'}</span>
                                        <span
                                            className="font-bold whitespace-nowrap">{status.cpu_total || 0}核 {cpuPercent.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div className="h-2 transition-all"
                                             style={{width: `${cpuPercent}%`, backgroundColor: getProgressColor(cpuPercent)}}></div>
                                    </div>
                                </div>

                                {/* 内存 */}
                                <div style={{minWidth: 0}}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span style={{ color: 'var(--text-secondary)' }} className="truncate">内存使用率</span>
                                        <span
                                            className="font-bold whitespace-nowrap">{memUsageGB}GB/{memTotalGB}GB {memPercent.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div className="h-2 transition-all"
                                             style={{width: `${memPercent}%`, backgroundColor: getProgressColor(memPercent)}}></div>
                                    </div>
                                </div>

                                {/* 磁盘 */}
                                <div style={{minWidth: 0}}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span style={{ color: 'var(--text-secondary)' }} className="truncate">硬盘使用率</span>
                                        <span
                                            className="font-bold whitespace-nowrap">{diskUsageGB.toFixed(1)}GB/{diskTotalGB.toFixed(1)}GB {diskPercent.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div className="h-2 transition-all"
                                             style={{width: `${diskPercent}%`, backgroundColor: getProgressColor(diskPercent)}}></div>
                                    </div>
                                </div>

                                {/* 网络 */}
                                <div style={{minWidth: 0}}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span style={{ color: 'var(--text-secondary)' }} className="truncate">网络使用率</span>
                                        <span className="font-bold whitespace-nowrap">↑{(networkU / 1024).toFixed(1)}MB/s ↓{(networkD / 1024).toFixed(1)}MB/s</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 flex gap-0.5 overflow-hidden">
                                        <div className="bg-blue-500 h-2 transition-all"
                                             style={{width: `${networkUPercent / 2}%`}}></div>
                                        <div className="bg-green-500 h-2 transition-all"
                                             style={{width: `${networkDPercent / 2}%`}}></div>
                                    </div>
                                </div>

                                {/* GPU */}
                                <div style={{minWidth: 0}}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span style={{ color: 'var(--text-secondary)' }} className="truncate">显卡使用率</span>
                                        <span
                                            className="font-bold whitespace-nowrap">{status.gpu_total || 0}个 {gpuPercent.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div className="h-2 transition-all"
                                             style={{width: `${gpuPercent}%`, backgroundColor: getProgressColor(gpuPercent)}}></div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-xs" style={{ color: 'var(--text-tertiary)' }}>暂无状态数据</div>
                        )}
                    </Col>
                </Row>

                {/* 底部操作栏 */}
                <div style={{borderTop: '1px solid var(--border-color, #f0f0f0)', marginTop: 16, paddingTop: 12, display: 'flex', justifyContent: 'flex-end'}}>
                    <Space>
                        <Button
                            icon={<CloudSyncOutlined/>}
                            onClick={() => handleScanBackups(name)}
                            disabled={host.status !== 'active'}
                            style={{backgroundColor: '#d9d9d9', borderColor: '#d9d9d9', color: '#333'}}
                        >
                            扫描备份
                        </Button>
                        <Button
                            icon={<ScanOutlined/>}
                            onClick={() => handleScanVMs(name)}
                            disabled={host.status !== 'active'}
                            style={{backgroundColor: '#d9d9d9', borderColor: '#d9d9d9', color: '#333'}}
                        >
                            扫描虚拟机
                        </Button>
                        <Button
                            icon={host.status === 'active' ? <StopOutlined/> : <PlayCircleOutlined/>}
                            onClick={() => handleToggle(name, host.status !== 'active')}
                            style={host.status === 'active' ? {backgroundColor: '#faad14', borderColor: '#faad14', color: '#fff'} : {backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff'}}
                        >
                            {host.status === 'active' ? '禁用' : '启用'}
                        </Button>
                        <Button
                            danger
                            type="primary"
                            icon={<DeleteOutlined/>}
                            onClick={() => {
                                Modal.confirm({
                                    title: '确认删除',
                                    icon: <DeleteOutlined style={{color: 'red'}}/>,
                                    content: `确定要删除主机 "${name}" 吗？此操作不可恢复。`,
                                    okText: '确认删除',
                                    okType: 'danger',
                                    cancelText: '取消',
                                    mask: false,
                                    onOk: () => handleDelete(name)
                                })
                            }}
                        >
                            删除
                        </Button>
                    </Space>
                </div>
            </Card>
        )
    }

    return (
        <div className="p-6">
            {/* 页面标题 */}
            <PageHeader
                icon={<CloudServerOutlined />}
                title="物理主机管理"
                subtitle="管理所有虚拟化主机"
                actions={
                    <>
                        <Button.Group>
                            <Tooltip title="卡片视图">
                                <Button
                                    icon={<AppstoreOutlined />}
                                    type={viewMode === 'card' ? 'primary' : 'default'}
                                    onClick={() => { setViewMode('card'); localStorage.setItem('hostManage_viewMode', 'card') }}
                                />
                            </Tooltip>
                            <Tooltip title="列表视图">
                                <Button
                                    icon={<UnorderedListOutlined />}
                                    type={viewMode === 'table' ? 'primary' : 'default'}
                                    onClick={() => { setViewMode('table'); localStorage.setItem('hostManage_viewMode', 'table') }}
                                />
                            </Tooltip>
                        </Button.Group>
                        <Button icon={<ReloadOutlined/>} onClick={loadHosts}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<PlusOutlined/>} onClick={handleAdd}>
                            添加主机
                        </Button>
                    </>
                }
            />

            {/* 主机列表 */}
            {loading ? (
                <div className="text-center py-16">
                    <div className=" text-4xl mb-4">⏳</div>
                    <p className=" ">加载中...</p>
                </div>
            ) : Object.keys(hosts).length === 0 ? (
                <div className="text-center py-16">
                    <div className=" text-6xl mb-4">📦</div>
                    <p className=" mb-4">暂无主机</p>
                    <Button type="primary" onClick={handleAdd}>添加第一个主机</Button>
                </div>
            ) : viewMode === 'card' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(500px,1fr))] gap-4">
                    {Object.entries(hosts).map(([name, host]) => (
                        <div key={name}>
                            {renderHostCard(name, host)}
                        </div>
                    ))}
                </div>
            ) : (
                <HostTableView
                    hosts={hosts}
                    hostsStatus={hostsStatus}
                    engineTypes={engineTypes}
                    navigate={navigate}
                    handleEdit={handleEdit}
                    handleToggle={handleToggle}
                />
            )}

            {/* 添加/编辑主机对话框 */}
            <Modal
                title={editMode === 'add' ? '添加主机' : '编辑主机'}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
                width={900}
                okText="保存"
                cancelText="取消"
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Tabs
                        items={[
                            {
                                key: 'basic',
                                label: <span><SettingOutlined/> 基本配置</span>,
                                children: (
                                    <div className="max-h-[500px] overflow-y-auto pr-2">
                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="name" label="服务器名称"
                                                           rules={[{required: true, message: '请输入服务器名称'}]}>
                                                    <Input placeholder="例如: host1" disabled={editMode === 'edit'}/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="type" label="服务器类型"
                                                           rules={[{required: true, message: '请选择服务器类型'}]}>
                                                    <Select
                                                        placeholder="请选择类型"
                                                        onChange={(value) => setSelectedHostType(value)}
                                                    >
                                                        {Object.entries(engineTypes).map(([type, config]) =>
                                                            config.enabled ? (
                                                                <Select.Option key={type} value={type}>
                                                                    {config.description} ({type})
                                                                </Select.Option>
                                                            ) : null
                                                        )}
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        {/* 主机类型信息提示 */}
                                        {selectedHostType && engineTypes[selectedHostType] && (
                                            <div className="mb-4">
                                                {engineTypes[selectedHostType].messages && engineTypes[selectedHostType].messages!.length > 0 && (
                                                    <div
                                                        className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                                                        <h5 className="text-sm font-medium text-yellow-800 mb-2">注意事项</h5>
                                                        <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                                                            {engineTypes[selectedHostType].messages!.map((msg, idx) => (
                                                                <li key={idx}>{msg}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {engineTypes[selectedHostType].options && Object.keys(engineTypes[selectedHostType].options!).length > 0 && (
                                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                        <h5 className="text-sm font-medium text-blue-800 mb-2">可选配置项</h5>
                                                        <div className="text-sm text-blue-700 space-y-1">
                                                            {Object.entries(engineTypes[selectedHostType].options!).map(([key, desc]) => (
                                                                <div key={key}>
                                                                    <strong>{key}:</strong> {desc}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="server_addr" label="服务器地址">
                                                    <Input placeholder="例如: localhost:8697"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="server_user" label="服务器用户">
                                                    <Input placeholder="例如: root"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="server_pass" label="服务器密码">
                                                    <Input.Password placeholder="服务器密码"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="filter_name" label="虚拟机前缀">
                                                    <Input placeholder="过滤器名称"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="server_port" label="服务访问端口">
                                                    <InputNumber placeholder="例如: 443" min={0} max={65535}
                                                                 className="w-full"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="public_addr" label="服务器公网IP">
                                                    <Input placeholder="例如: 192.168.1.1, 2001:db8::1"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="network_nat" label="共享IP设备名">
                                                    <Input placeholder="例如: nat"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="network_pub" label="独立IP设备名">
                                                    <Input placeholder="例如: pub"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <Row gutter={16}>
                                            <Col span={8}>
                                                <Form.Item name="area_code" label="区域代码" extra="例如：CN、US、HK">
                                                    <Input placeholder="例如: CN"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={16}>
                                                <Form.Item name="area_name" label="区域名称" extra="例如：成都、华南区">
                                                    <Input placeholder="例如: 成都"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>
                                )
                            },
                            {
                                key: 'storage',
                                label: <span><FolderOutlined/> 存储路径</span>,
                                children: (
                                    <div className="max-h-[500px] overflow-y-auto pr-2">
                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="images_path" label="模板存储路径">
                                                    <Input placeholder="例如: /data/images"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="dvdrom_path" label="光盘存储路径">
                                                    <Input placeholder="例如: /data/iso"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="system_path" label="系统存储路径">
                                                    <Input placeholder="例如: /data/system"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="backup_path" label="备份存储路径">
                                                    <Input placeholder="例如: /data/backup"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <Row gutter={16}>
                                            <Col span={12}>
                                                <Form.Item name="extern_path" label="数据存储路径">
                                                    <Input placeholder="例如: /data/extern"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="launch_path" label="程序启动路径">
                                                    <Input placeholder="虚拟化程序路径"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>
                                )
                            },
                            {
                                key: 'network',
                                label: <span><GlobalOutlined/> 网络配置</span>,
                                children: (
                                    <div className="max-h-[500px] overflow-y-auto pr-2">
                                        <h4 className="font-medium mb-3">爱快OS配置</h4>
                                        <Row gutter={16}>
                                            <Col span={8}>
                                                <Form.Item name="i_kuai_addr" label="爱快OS地址">
                                                    <Input placeholder="例如: http://192.168.1.1"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={8}>
                                                <Form.Item name="i_kuai_user" label="爱快OS用户名">
                                                    <Input placeholder="爱快OS管理员用户名"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={8}>
                                                <Form.Item name="i_kuai_pass" label="爱快OS密码">
                                                    <Input.Password placeholder="爱快OS管理员密码"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <h4 className="font-medium mb-3 mt-4">端口配置</h4>
                                        <Row gutter={16}>
                                            <Col span={6}>
                                                <Form.Item name="ports_start" label="TCP端口起始">
                                                    <InputNumber placeholder="例如: 10000" min={0} max={65535}
                                                                 className="w-full"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item name="ports_close" label="TCP端口结束">
                                                    <InputNumber placeholder="例如: 20000" min={0} max={65535}
                                                                 className="w-full"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item name="remote_port" label="VNC服务端口">
                                                    <InputNumber placeholder="例如: 5900" min={0} max={65535}
                                                                 className="w-full"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item name="limits_nums" label="虚拟机数量限制">
                                                    <InputNumber placeholder="例如: 100" min={0} className="w-full"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        <h4 className="font-medium mb-3 mt-4">DNS服务器配置</h4>
                                        <Form.Item name="ipaddr_ddns" label="DNS服务器（多个用逗号分隔）">
                                            <Input placeholder="例如: 8.8.8.8, 8.8.4.4"/>
                                        </Form.Item>
                                    </div>
                                )
                            },
                            {
                                key: 'advanced',
                                label: <span><DatabaseOutlined/> 高级配置</span>,
                                children: (
                                    <div className="max-h-[500px] overflow-y-auto pr-2">
                                        <h4 className="font-medium mb-3">售价配置</h4>
                                        <Row gutter={8} className="mb-4">
                                            <Col span={6}>
                                                <div className="text-xs text-gray-500 mb-1">处理器核心单价</div>
                                                <Form.Item name="n_cpu_price" noStyle>
                                                    <InputNumber min={0} step={0.01} className="w-full" placeholder="0.00"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <div className="text-xs text-gray-500 mb-1">虚拟机内存单价</div>
                                                <Form.Item name="n_mem_price" noStyle>
                                                    <InputNumber min={0} step={0.01} className="w-full" placeholder="0.00"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <div className="text-xs text-gray-500 mb-1">虚拟机硬盘单价</div>
                                                <Form.Item name="n_hdd_price" noStyle>
                                                    <InputNumber min={0} step={0.01} className="w-full" placeholder="0.00"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <div className="text-xs text-gray-500 mb-1">虚拟机带宽单价</div>
                                                <Form.Item name="n_net_price" noStyle>
                                                    <InputNumber min={0} step={0.01} className="w-full" placeholder="0.00"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                        <h4 className="font-medium mb-3">系统镜像配置</h4>
                                        <div className="space-y-2 mb-4">
                                            {systemMaps.map((row, index) => (
                                                <div key={row.id} className="p-3 rounded-lg">
                                                    <Row gutter={8}>
                                                        <Col span={6}>
                                                            <Input
                                                                placeholder="系统名称"
                                                                value={row.sys_name}
                                                                onChange={(e) => {
                                                                    const newMaps = [...systemMaps]
                                                                    newMaps[index].sys_name = e.target.value
                                                                    setSystemMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={8}>
                                                            <Input
                                                                placeholder="镜像文件"
                                                                value={row.sys_file}
                                                                onChange={(e) => {
                                                                    const newMaps = [...systemMaps]
                                                                    newMaps[index].sys_file = e.target.value
                                                                    setSystemMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={2}>
                                                            <Input
                                                                placeholder="最低大小(GB)"
                                                                value={row.sys_size}
                                                                onChange={(e) => {
                                                                    const newMaps = [...systemMaps]
                                                                    newMaps[index].sys_size = e.target.value
                                                                    setSystemMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={3}>
                                                            <Select
                                                                placeholder="类型"
                                                                value={row.sys_type || undefined}
                                                                onChange={(value) => {
                                                                    const newMaps = [...systemMaps]
                                                                    newMaps[index].sys_type = value
                                                                    setSystemMaps(newMaps)
                                                                }}
                                                                style={{width: '100%'}}
                                                                allowClear
                                                            >
                                                                <Select.Option value="WinNT">WinNT</Select.Option>
                                                                <Select.Option value="Linux">Linux</Select.Option>
                                                                <Select.Option value="macOS">macOS</Select.Option>
                                                            </Select>
                                                        </Col>
                                                        <Col span={3}>
                                                            <Select
                                                                value={row.sys_flag ? 1 : 0}
                                                                onChange={(value) => {
                                                                    const newMaps = [...systemMaps]
                                                                    newMaps[index].sys_flag = value === 1
                                                                    setSystemMaps(newMaps)
                                                                }}
                                                                style={{width: '100%'}}
                                                            >
                                                                <Select.Option value={1}>启用</Select.Option>
                                                                <Select.Option value={0}>禁用</Select.Option>
                                                            </Select>
                                                        </Col>
                                                        <Col span={2}>
                                                            <Button
                                                                danger
                                                                icon={<DeleteOutlined/>}
                                                                onClick={() => setSystemMaps(systemMaps.filter(m => m.id !== row.id))}
                                                            />
                                                        </Col>
                                                    </Row>
                                                </div>
                                            ))}
                                            <Button
                                                type="dashed"
                                                icon={<PlusOutlined/>}
                                                onClick={() => setSystemMaps([...systemMaps, {
                                                    id: Date.now().toString(),
                                                    sys_name: '',
                                                    sys_file: '',
                                                    sys_size: '',
                                                    sys_type: '',
                                                    sys_flag: true
                                                }])}
                                                block
                                            >
                                                添加系统镜像
                                            </Button>
                                        </div>

                                        <h4 className="font-medium mb-3 mt-4">光盘镜像配置</h4>
                                        <div className="space-y-2 mb-4">
                                            {imageMaps.map((row, index) => (
                                                <div key={row.id} className="p-3 rounded-lg">
                                                    <Row gutter={8}>
                                                        <Col span={6}>
                                                            <Input
                                                                placeholder="显示名称"
                                                                value={row.sys_name}
                                                                onChange={(e) => {
                                                                    const newMaps = [...imageMaps]
                                                                    newMaps[index].sys_name = e.target.value
                                                                    setImageMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={8}>
                                                            <Input
                                                                placeholder="ISO文件名"
                                                                value={row.sys_file}
                                                                onChange={(e) => {
                                                                    const newMaps = [...imageMaps]
                                                                    newMaps[index].sys_file = e.target.value
                                                                    setImageMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={2}>
                                                            <Input
                                                                placeholder="最低大小(GB)"
                                                                value={row.sys_size}
                                                                onChange={(e) => {
                                                                    const newMaps = [...imageMaps]
                                                                    newMaps[index].sys_size = e.target.value
                                                                    setImageMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={3}>
                                                            <Select
                                                                placeholder="类型"
                                                                value={row.sys_type || undefined}
                                                                onChange={(value) => {
                                                                    const newMaps = [...imageMaps]
                                                                    newMaps[index].sys_type = value
                                                                    setImageMaps(newMaps)
                                                                }}
                                                                style={{width: '100%'}}
                                                                allowClear
                                                            >
                                                                <Select.Option value="WinNT">WinNT</Select.Option>
                                                                <Select.Option value="Linux">Linux</Select.Option>
                                                                <Select.Option value="macOS">macOS</Select.Option>
                                                            </Select>
                                                        </Col>
                                                        <Col span={3}>
                                                            <Select
                                                                value={row.sys_flag ? 1 : 0}
                                                                onChange={(value) => {
                                                                    const newMaps = [...imageMaps]
                                                                    newMaps[index].sys_flag = value === 1
                                                                    setImageMaps(newMaps)
                                                                }}
                                                                style={{width: '100%'}}
                                                            >
                                                                <Select.Option value={1}>启用</Select.Option>
                                                                <Select.Option value={0}>禁用</Select.Option>
                                                            </Select>
                                                        </Col>
                                                        <Col span={2}>
                                                            <Button
                                                                danger
                                                                icon={<DeleteOutlined/>}
                                                                onClick={() => setImageMaps(imageMaps.filter(m => m.id !== row.id))}
                                                            />
                                                        </Col>
                                                    </Row>
                                                </div>
                                            ))}
                                            <Button
                                                type="dashed"
                                                icon={<PlusOutlined/>}
                                                onClick={() => setImageMaps([...imageMaps, {
                                                    id: Date.now().toString(),
                                                    sys_name: '',
                                                    sys_file: '',
                                                    sys_size: '',
                                                    sys_type: '',
                                                    sys_flag: true
                                                }])}
                                                block
                                            >
                                                添加光盘镜像
                                            </Button>
                                        </div>

                                        <h4 className="font-medium mb-3 mt-4">IP地址池配置</h4>
                                        <div className="space-y-2 mb-4">
                                            {ipaddrMaps.map((row, index) => (
                                                <div key={row.id} className="p-3 rounded-lg">
                                                    <Row gutter={8} className="mb-2">
                                                        <Col span={6}>
                                                            <Input
                                                                placeholder="配置名称"
                                                                value={row.setName}
                                                                onChange={(e) => {
                                                                    const newMaps = [...ipaddrMaps]
                                                                    newMaps[index].setName = e.target.value
                                                                    setIpaddrMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={4}>
                                                            <Select
                                                                value={row.vers}
                                                                onChange={(value) => {
                                                                    const newMaps = [...ipaddrMaps]
                                                                    newMaps[index].vers = value
                                                                    setIpaddrMaps(newMaps)
                                                                }}
                                                                className="w-full"
                                                            >
                                                                <Select.Option value="ipv4">IPv4</Select.Option>
                                                                <Select.Option value="ipv6">IPv6</Select.Option>
                                                            </Select>
                                                        </Col>
                                                        <Col span={4}>
                                                            <Select
                                                                value={row.type}
                                                                onChange={(value) => {
                                                                    const newMaps = [...ipaddrMaps]
                                                                    newMaps[index].type = value
                                                                    setIpaddrMaps(newMaps)
                                                                }}
                                                                className="w-full"
                                                            >
                                                                <Select.Option value="nat">NAT</Select.Option>
                                                                <Select.Option value="pub">PUB</Select.Option>
                                                            </Select>
                                                        </Col>
                                                        <Col span={8}>
                                                            <InputNumber
                                                                placeholder="数量"
                                                                value={row.nums}
                                                                onChange={(value) => {
                                                                    const newMaps = [...ipaddrMaps]
                                                                    newMaps[index].nums = value || 0
                                                                    setIpaddrMaps(newMaps)
                                                                }}
                                                                min={1}
                                                                className="w-full"
                                                            />
                                                        </Col>
                                                        <Col span={2}>
                                                            <Button
                                                                danger
                                                                icon={<DeleteOutlined/>}
                                                                onClick={() => setIpaddrMaps(ipaddrMaps.filter(m => m.id !== row.id))}
                                                            />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={8}>
                                                        <Col span={8}>
                                                            <Input
                                                                placeholder="起始IP地址"
                                                                value={row.fromIp}
                                                                onChange={(e) => {
                                                                    const newMaps = [...ipaddrMaps]
                                                                    newMaps[index].fromIp = e.target.value
                                                                    setIpaddrMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={8}>
                                                            <Input
                                                                placeholder="网关地址"
                                                                value={row.gate}
                                                                onChange={(e) => {
                                                                    const newMaps = [...ipaddrMaps]
                                                                    newMaps[index].gate = e.target.value
                                                                    setIpaddrMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={8}>
                                                            <Input
                                                                placeholder="子网掩码"
                                                                value={row.mask}
                                                                onChange={(e) => {
                                                                    const newMaps = [...ipaddrMaps]
                                                                    newMaps[index].mask = e.target.value
                                                                    setIpaddrMaps(newMaps)
                                                                }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                </div>
                                            ))}
                                            <Button
                                                type="dashed"
                                                icon={<PlusOutlined/>}
                                                onClick={() => setIpaddrMaps([...ipaddrMaps, {
                                                    id: Date.now().toString(),
                                                    setName: '',
                                                    vers: 'ipv4',
                                                    type: 'nat',
                                                    gate: '',
                                                    mask: '',
                                                    fromIp: '',
                                                    nums: 0
                                                }])}
                                                block
                                            >
                                                添加IP地址池
                                            </Button>
                                        </div>

                                        <h4 className="font-medium mb-3 mt-4">API扩展选项</h4>
                                        <Form.Item name="extend_data" label="扩展数据 (JSON格式)">
                                            <Input.TextArea rows={4} placeholder='{"key": "value"}'/>
                                        </Form.Item>
                                    </div>
                                )
                            },
                            {
                                key: 'plan',
                                label: <span><DatabaseOutlined/> 套餐配置</span>,
                                children: (
                                    <div className="max-h-[500px] overflow-y-auto pr-2">
                                        <h4 className="font-medium mb-3">套餐列表（套餐名称 → 虚拟机资源配置）</h4>
                                        <div className="space-y-3 mb-4">
                                            {serverPlans.map((row, index) => (
                                                <div key={row.id} className="border border-gray-200 rounded-lg p-3">
                                                    <Row gutter={8} className="mb-2">
                                                        <Col span={22}>
                                                            <Input
                                                                placeholder="套餐名称（例如：基础套餐）"
                                                                value={row.planName}
                                                                onChange={(e) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].planName = e.target.value
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={2}>
                                                            <Button
                                                                danger
                                                                icon={<DeleteOutlined/>}
                                                                onClick={() => setServerPlans(serverPlans.filter(p => p.id !== row.id))}
                                                            />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={8}>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">CPU核心数</div>
                                                            <InputNumber
                                                                value={row.cpu_num}
                                                                min={1}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].cpu_num = v ?? 2
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">内存(MB)</div>
                                                            <InputNumber
                                                                value={row.mem_num}
                                                                min={512}
                                                                step={512}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].mem_num = v ?? 2048
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">硬盘(MB)</div>
                                                            <InputNumber
                                                                value={row.hdd_num}
                                                                min={1024}
                                                                step={1024}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].hdd_num = v ?? 8192
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">流量(MB)</div>
                                                            <InputNumber
                                                                value={row.flu_num}
                                                                min={0}
                                                                step={1024}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].flu_num = v ?? 102400
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={8} className="mt-2">
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">上行带宽(Mbps)</div>
                                                            <InputNumber
                                                                value={row.speed_u}
                                                                min={1}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].speed_u = v ?? 100
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">下行带宽(Mbps)</div>
                                                            <InputNumber
                                                                value={row.speed_d}
                                                                min={1}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].speed_d = v ?? 100
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">NAT端口数</div>
                                                            <InputNumber
                                                                value={row.nat_num}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].nat_num = v ?? 100
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">代理数量</div>
                                                            <InputNumber
                                                                value={row.web_num}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].web_num = v ?? 100
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={8} className="mt-2">
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">CPU可用比例(%)</div>
                                                            <InputNumber
                                                                value={row.cpu_per}
                                                                min={0}
                                                                max={100}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].cpu_per = v ?? 0
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">虚拟显存(MB)</div>
                                                            <InputNumber
                                                                value={row.gpu_mem}
                                                                min={0}
                                                                step={128}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].gpu_mem = v ?? 0
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">硬盘IOPS</div>
                                                            <InputNumber
                                                                value={row.hdd_iop}
                                                                min={0}
                                                                step={100}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].hdd_iop = v ?? 1000
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">备份数量</div>
                                                            <InputNumber
                                                                value={row.bak_num}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].bak_num = v ?? 1
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={8} className="mt-2">
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">光盘数量</div>
                                                            <InputNumber
                                                                value={row.iso_num}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].iso_num = v ?? 1
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">PCIe数量</div>
                                                            <InputNumber
                                                                value={row.pci_num}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].pci_num = v ?? 0
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">USB数量</div>
                                                            <InputNumber
                                                                value={row.usb_num}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].usb_num = v ?? 0
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">数据盘数量</div>
                                                            <InputNumber
                                                                value={row.dat_num}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].dat_num = v ?? 1
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={8} className="mt-2">
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">数据盘总容量(MB)</div>
                                                            <InputNumber
                                                                value={row.dat_all}
                                                                min={0}
                                                                step={1024}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].dat_all = v ?? 0
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">流量重置(天)</div>
                                                            <InputNumber
                                                                value={row.flu_rst?.[0] ?? 31}
                                                                min={1}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    const cur = Array.isArray(newPlans[index].flu_rst) ? [...newPlans[index].flu_rst] : [31, 10, 10]
                                                                    cur[0] = v ?? 31
                                                                    newPlans[index].flu_rst = [cur[0], cur[1] ?? 10, cur[2] ?? 10]
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">超限阈值(MB)</div>
                                                            <InputNumber
                                                                value={row.flu_rst?.[1] ?? 10}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    const cur = Array.isArray(newPlans[index].flu_rst) ? [...newPlans[index].flu_rst] : [31, 10, 10]
                                                                    cur[1] = v ?? 10
                                                                    newPlans[index].flu_rst = [cur[0] ?? 31, cur[1], cur[2] ?? 10]
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">上次重置时间戳</div>
                                                            <InputNumber
                                                                value={row.flu_rst?.[2] ?? 10}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    const cur = Array.isArray(newPlans[index].flu_rst) ? [...newPlans[index].flu_rst] : [31, 10, 10]
                                                                    cur[2] = v ?? 10
                                                                    newPlans[index].flu_rst = [cur[0] ?? 31, cur[1] ?? 10, cur[2]]
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={8} className="mt-2">
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">公网网卡数量</div>
                                                            <InputNumber
                                                                value={row.nic_pub}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].nic_pub = v ?? 0
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">内网网卡数量</div>
                                                            <InputNumber
                                                                value={row.nic_pri}
                                                                min={0}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].nic_pri = v ?? 1
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">IPv4最大数量</div>
                                                            <InputNumber
                                                                value={row.ip4_max}
                                                                min={0}
                                                                max={(row.nic_pub || 0) + (row.nic_pri || 0)}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].ip4_max = v ?? 1
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                        <Col span={6}>
                                                            <div className="text-xs text-gray-500 mb-1">IPv6最大数量</div>
                                                            <InputNumber
                                                                value={row.ip6_max}
                                                                min={0}
                                                                max={(row.nic_pub || 0) + (row.nic_pri || 0)}
                                                                className="w-full"
                                                                onChange={(v) => {
                                                                    const newPlans = [...serverPlans]
                                                                    newPlans[index].ip6_max = v ?? 0
                                                                    setServerPlans(newPlans)
                                                                }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                </div>
                                            ))}
                                            <Button
                                                type="dashed"
                                                icon={<PlusOutlined/>}
                                                onClick={() => setServerPlans([...serverPlans, {
                                                    id: Date.now().toString(),
                                                    planName: '',
                                                    cpu_num: 2,
                                                    cpu_per: 0,
                                                    gpu_mem: 0,
                                                    mem_num: 2048,
                                                    hdd_num: 8192,
                                                    hdd_iop: 1000,
                                                    bak_num: 1,
                                                    iso_num: 1,
                                                    pci_num: 0,
                                                    usb_num: 0,
                                                    dat_num: 1,
                                                    dat_all: 0,
                                                    speed_u: 100,
                                                    speed_d: 100,
                                                    nat_num: 100,
                                                    web_num: 100,
                                                    flu_num: 102400,
                                                    flu_rst: [31, 10, 10],
                                                    nic_pub: 0,
                                                    nic_pri: 1,
                                                    ip4_max: 1,
                                                    ip6_max: 0,
                                                }])}
                                                block
                                            >
                                                添加套餐
                                            </Button>
                                        </div>
                                    </div>
                                )
                            }
                        ]}
                    />
                </Form>
            </Modal>
        </div>
    )
}

export default HostManage