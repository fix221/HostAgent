import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
    Button,
    message,
    Spin,
    Empty,
    Row,
    Col,
    Modal,
    Input,
    Select,
    Table,
    Tag,
    Tooltip,
    Space,
    Progress,
} from 'antd'
import {
    PlusOutlined,
    ReloadOutlined,
    ArrowLeftOutlined,
    RadarChartOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
    DesktopOutlined,
    EyeOutlined,
    PoweroffOutlined,
    PlayCircleOutlined,
    PauseCircleOutlined,
    ThunderboltOutlined,
    EditOutlined,
    DeleteOutlined,
    UserOutlined,
} from '@ant-design/icons'
import { VM_STATUS_MAP } from '@/constants/status'
import { VM_PERMISSION, hasPermission } from '@/types'
import api, { getHosts } from '@/utils/apis.ts'
import { startTaskWithNotification } from '@/utils/taskPoller'
import { useUserStore } from '@/utils/data.ts'
import DockCard from '@/components/dock/DockCard'
import DockCreateModal from '@/components/dock/DockCreateModal'
import DockPowerModal from '@/components/dock/DockPowerModal'
import PageHeader from '@/components/PageHeader'
import { openVNCConsole } from '@/utils/vncHelper'

function DockManage() {
    const navigate = useNavigate()
    const { hostName } = useParams<{ hostName: string }>()
    const { user } = useUserStore()
    const isAdmin = user?.is_admin || false
    
    // State
    const [vms, setVMs] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(false)
    const [availableHosts, setAvailableHosts] = useState<Record<string, any>>({})
    const [userQuota, setUserQuota] = useState<any>(null)
    const [hostSystemMaps, setHostSystemMaps] = useState<Record<string, any[]>>({})
    
    // 搜索筛选
    const [searchText, setSearchText] = useState('')
    const [hostFilter, setHostFilter] = useState('')
    const [ownerFilter, setOwnerFilter] = useState('')
    const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
        return (localStorage.getItem('dockManage_viewMode') as 'card' | 'table') || 'card'
    })
    
    // Modals state
    const [createModalOpen, setCreateModalOpen] = useState(false)
    const [editVmUuid, setEditVmUuid] = useState<string | undefined>(undefined)
    
    const [powerModalOpen, setPowerModalOpen] = useState(false)
    const [powerVmUuid, setPowerVmUuid] = useState<string>('')
    const [powerHostName, setPowerHostName] = useState<string>('')
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deleteVmUuid, setDeleteVmUuid] = useState<string>('')
    const [deleteHostName, setDeleteHostName] = useState<string>('')
    const [deleteConfirmInput, setDeleteConfirmInput] = useState<string>('')
    const [deleteRequireOwner, setDeleteRequireOwner] = useState<boolean>(false)
    const [deletePrimaryOwner, setDeletePrimaryOwner] = useState<string>('')

    // 筛选后的虚拟机列表
    const filteredVMs = Object.entries(vms).reduce((acc, [key, vm]) => {
        const uuid = vm._realUuid || key
        const vmHost = vm._host || hostName || ''
        const ownAll = vm.config?.own_all || {}
        const ownerNames = Object.keys(ownAll)
        const primaryOwner = ownerNames.length > 0 ? ownerNames[0] : ''

        // 实例名称搜索
        if (searchText && !uuid.toLowerCase().includes(searchText.toLowerCase())) {
            return acc
        }
        // 主机筛选
        if (hostFilter && vmHost !== hostFilter) {
            return acc
        }
        // 所有者筛选
        if (ownerFilter && primaryOwner !== ownerFilter) {
            return acc
        }
        acc[key] = vm
        return acc
    }, {} as Record<string, any>)

    // Initial data loading
    useEffect(() => {
        loadUserQuota()
        loadVMs()
        loadAvailableHosts()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hostName])

    const loadUserQuota = async () => {
        try {
            const result = await api.getCurrentUser()
            if (result.code === 200) {
                setUserQuota(result.data)
            }
        } catch (error) {
            console.error('获取用户配额失败:', error)
        }
    }

    const loadAvailableHosts = async () => {
        try {
            const result = await getHosts()
            if (result.code === 200 && result.data) {
                // 将enable_host字段映射为enabled
                const hostsWithEnabled = Object.entries(result.data).reduce((acc, [key, host]: [string, any]) => {
                    acc[key] = {
                        ...host,
                        enabled: host.enable_host !== false
                    }
                    return acc
                }, {} as Record<string, any>)
                setAvailableHosts(hostsWithEnabled)
                // 加载各主机的system_maps
                const enabledHosts = Object.keys(hostsWithEnabled).filter(h => hostsWithEnabled[h].enabled !== false)
                const maps: Record<string, any[]> = {}
                await Promise.all(enabledHosts.map(async (h) => {
                    try {
                        const osRes = await api.getOSImages(h)
                        if (osRes.code === 200 && osRes.data) {
                            const raw = (osRes.data as any).system_maps
                            if (raw) {
                                maps[h] = Array.isArray(raw)
                                    ? raw
                                    : Object.entries(raw).map(([name, val]: [string, any]) =>
                                        Array.isArray(val) ? { sys_name: name, sys_file: val[0] }
                                            : (val && typeof val === 'object' ? { sys_name: name, ...val } : { sys_name: name, sys_file: val }))
                            }
                        }
                    } catch (e) { /* ignore */ }
                }))
                setHostSystemMaps(maps)
            }
        } catch (error) {
            console.error('加载主机列表失败:', error)
        }
    }

    // 根据主机的system_maps将镜像文件名转换为系统显示名称
    const getOSDisplayName = (osName: string, vmHost: string): string => {
        if (!osName) return '未知'
        const maps = hostSystemMaps[vmHost]
        if (!maps) return osName
        for (const it of maps) {
            if (it && it.sys_file === osName) return it.sys_name || osName
        }
        return osName
    }

    const loadVMs = async () => {
        try {
            setLoading(true)
            let allVMs: Record<string, any> = {}

            if (hostName) {
                // Single host view
                const result = await api.getVMs(hostName)
                if (result.code === 200) {
                    allVMs = result.data || {}
                }
            } else {
                // All hosts view (System or User)
                const hostsRes = await getHosts()
                if (hostsRes.code === 200 && hostsRes.data) {
                    // 过滤掉禁用的主机，不请求其虚拟机列表
                    const hostsData = hostsRes.data!
                    const hosts = Object.keys(hostsData).filter(
                        (host) => hostsData[host].enable_host !== false
                    )
                    await Promise.all(hosts.map(async (host) => {
                        try {
                            const vmsRes = await api.getVMs(host)
                            if (vmsRes.code === 200 && vmsRes.data) {
                                Object.entries(vmsRes.data).forEach(([uuid, vm]) => {
                                    allVMs[`${host}-${uuid}`] = { ...vm, _host: host, _realUuid: uuid }
                                })
                            }
                        } catch (err) {
                            console.error(`获取主机 ${host} 的虚拟机失败`, err)
                        }
                    }))
                }
            }
            setVMs(allVMs)
        } catch (error) {
            message.error('加载虚拟机列表失败')
        } finally {
            setLoading(false)
        }
    }

    const handleScan = async () => {
        if (!hostName) return
        // 检查主机是否被禁用
        if (availableHosts[hostName]?.enabled === false) {
            message.error('该主机已被禁用，无法扫描虚拟机')
            return
        }
        const hide = message.loading('正在扫描虚拟机...', 0)
        try {
            const result = await api.scanVMs(hostName)
            hide()
            if (result.code === 200) {
                message.success('扫描完成')
                loadVMs()
            } else {
                message.error(result.msg || '扫描失败')
            }
        } catch (error) {
            hide()
            message.error('扫描虚拟机失败')
        }
    }

    // Handlers
    const handleCreate = () => {
        // 检查主机是否被禁用
        if (hostName && availableHosts[hostName]?.enabled === false) {
            message.error('该主机已被禁用，无法创建虚拟机')
            return
        }
        setEditVmUuid(undefined)
        setCreateModalOpen(true)
    }

    const handleEdit = (uuid: string, host?: string) => {
        const targetHost = host || hostName
        if (!targetHost) {
            message.error('无法确定主机信息')
            return
        }

        // 检查主机是否被禁用
        if (availableHosts[targetHost]?.enabled === false) {
            message.error('该主机已被禁用，无法修改虚拟机')
            return
        }

        setPowerHostName(targetHost)
        setEditVmUuid(uuid)
        setCreateModalOpen(true)
    }

    const handleDelete = (uuid: string, host?: string) => {
        const targetHost = host || hostName
        if (!targetHost) return
        
        // 检查主机是否被禁用
        if (availableHosts[targetHost]?.enabled === false) {
            message.error('该主机已被禁用，无法删除虚拟机')
            return
        }
        
        // 判断是否是管理员删除非自己的虚拟机
        const vmData = vms[uuid] || Object.values(vms).find((v: any) => (v._realUuid || '') === uuid)
        const ownAll = (vmData as any)?.config?.own_all || {}
        const ownerNames = Object.keys(ownAll)
        const primaryOwner = ownerNames.length > 0 ? ownerNames[0] : ''
        const currentUsername = user?.username || ''
        const needOwnerConfirm = isAdmin && primaryOwner && primaryOwner !== currentUsername
        
        setDeleteVmUuid(uuid)
        setDeleteHostName(targetHost)
        setDeleteConfirmInput('')
        setDeleteRequireOwner(!!needOwnerConfirm)
        setDeletePrimaryOwner(needOwnerConfirm ? primaryOwner : '')
        setDeleteModalOpen(true)
    }

    const executeDelete = async () => {
        if (deleteRequireOwner) {
            if (deleteConfirmInput !== deletePrimaryOwner) {
                message.error('输入的用户名不匹配')
                return
            }
        } else {
            if (deleteConfirmInput !== deleteVmUuid) {
                message.error('输入的虚拟机名称不匹配')
                return
            }
        }
        
        setDeleteModalOpen(false)
        try {
            const result = await api.deleteVM(deleteHostName, deleteVmUuid, false, deleteRequireOwner ? deleteConfirmInput : undefined)
            startTaskWithNotification(result, '删除虚拟机', {
                onCompleted: () => loadVMs(),
                onFailed: () => loadVMs(),
            })
        } catch (error) {
            message.error('删除失败')
        }
    }

    const handleOpenPower = (uuid: string, host?: string) => {
        const targetHost = host || hostName
        if (!targetHost) return
        
        // 检查主机是否被禁用
        if (availableHosts[targetHost]?.enabled === false) {
            message.error('该主机已被禁用，无法控制虚拟机电源')
            return
        }
        
        setPowerVmUuid(uuid)
        setPowerHostName(targetHost)
        setPowerModalOpen(true)
    }

    const handlePowerAction = async (action: string) => {
        if (!powerHostName || !powerVmUuid) return
        setPowerModalOpen(false)

        const actionMap: Record<string, string> = {
            start: '启动',
            stop: '关机',
            hard_stop: '强制关机',
            reset: '重启',
            hard_reset: '强制重启',
            pause: '暂停',
            resume: '恢复',
        }

        const hide = message.loading(`正在${actionMap[action]}虚拟机...`, 0)
        try {
            const result = await api.vmPower(powerHostName, powerVmUuid, action as any)
            hide()
            if (result.code === 200) {
                message.success(`${actionMap[action]}操作成功`)
                loadVMs()
            } else {
                message.error(result.msg || '操作失败')
            }
        } catch (error) {
            hide()
            message.error('操作失败')
        }
    }

    const handleOpenVnc = async (uuid: string, host?: string) => {
        const targetHost = host || hostName
        if (!targetHost) return

        const hide = message.loading('获取VNC地址...', 0)
        try {
            const result = await api.getVMConsole(targetHost, uuid)
            hide()
            if (result.code === 200 && result.data) {
                openVNCConsole(result.data, `vnc_${uuid}`)
            } else {
                message.error('无法获取VNC地址')
            }
        } catch (error) {
            hide()
            message.error('连接失败')
        }
    }

    const handleOpenDetail = (uuid: string, host?: string) => {
        const targetHost = host || hostName
        if (!targetHost) return
        
        // 跳转到详情页面
        navigate(`/hosts/${targetHost}/vms/${uuid}`)
    }

    const handleQuickPower = (uuid: string, host: string | undefined, action: string) => {
        const targetHost = host || hostName
        if (!targetHost) return
        const actionMap: Record<string, string> = {
            start: '启动', stop: '关机', hard_stop: '强制关机',
            hard_reset: '强制重启', pause: '暂停', resume: '恢复',
        }
        const dangerActions = ['stop', 'hard_stop', 'hard_reset', 'pause']
        const isDanger = dangerActions.includes(action)
        
        Modal.confirm({
            title: `确认${actionMap[action]}`,
            content: `确定要对虚拟机 "${uuid}" 执行${actionMap[action]}操作吗？`,
            okText: '确认',
            cancelText: '取消',
            okType: isDanger ? 'danger' : 'primary',
            mask: false,
            onOk: async () => {
                const hide = message.loading(`正在${actionMap[action]}...`, 0)
                try {
                    const result = await api.vmPower(targetHost, uuid, action as any)
                    hide()
                    if (result.code === 200) {
                        message.success(`${actionMap[action]}成功`)
                        setTimeout(loadVMs, 1500)
                    } else {
                        message.error(result.msg || '操作失败')
                    }
                } catch (error) {
                    hide()
                    message.error('操作失败')
                }
            }
        })
    }

    return (
        <div className="p-6">
            <PageHeader
                icon={<RadarChartOutlined />}
                title={hostName ? `虚拟机管理 - ${hostName}` : '所有虚拟机'}
                subtitle="管理和监控虚拟机实例"
                actions={
                    <>
                        <Button.Group>
                            <Tooltip title="卡片视图">
                                <Button
                                    icon={<AppstoreOutlined />}
                                    type={viewMode === 'card' ? 'primary' : 'default'}
                                    onClick={() => { setViewMode('card'); localStorage.setItem('dockManage_viewMode', 'card') }}
                                />
                            </Tooltip>
                            <Tooltip title="列表视图">
                                <Button
                                    icon={<UnorderedListOutlined />}
                                    type={viewMode === 'table' ? 'primary' : 'default'}
                                    onClick={() => { setViewMode('table'); localStorage.setItem('dockManage_viewMode', 'table') }}
                                />
                            </Tooltip>
                        </Button.Group>
                        {hostName && (
                            <Button 
                                icon={<RadarChartOutlined />} 
                                onClick={handleScan}
                                disabled={availableHosts[hostName]?.enabled === false}
                            >
                                扫描
                            </Button>
                        )}
                        <Input
                            placeholder="搜索实例名称..."
                            style={{ width: 180 }}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        {!hostName && (
                            <Select
                                placeholder="所有主机"
                                style={{ width: 140 }}
                                value={hostFilter || undefined}
                                onChange={(v) => setHostFilter(v || '')}
                                allowClear
                            >
                                {Object.keys(availableHosts).map(h => (
                                    <Select.Option key={h} value={h}>{h}</Select.Option>
                                ))}
                            </Select>
                        )}
                        {!isAdmin ? null : (
                            <Select
                                placeholder="所有者"
                                style={{ width: 120 }}
                                value={ownerFilter || undefined}
                                onChange={(v) => setOwnerFilter(v || '')}
                                allowClear
                            >
                                {Array.from(new Set(Object.values(vms).map((vm: any) => {
                                    const ownAll = vm.config?.own_all || {}
                                    const names = Object.keys(ownAll)
                                    return names.length > 0 ? names[0] : ''
                                }).filter(Boolean))).map(owner => (
                                    <Select.Option key={owner} value={owner}>{owner}</Select.Option>
                                ))}
                            </Select>
                        )}
                        <Button icon={<ReloadOutlined />} onClick={loadVMs}>
                            刷新
                        </Button>
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={handleCreate}
                            disabled={hostName ? availableHosts[hostName]?.enabled === false : false}
                        >
                            创建虚拟机
                        </Button>
                        {hostName && (
                            <Button 
                                icon={<ArrowLeftOutlined />} 
                                onClick={() => navigate(-1)}
                            >
                                返回
                            </Button>
                        )}
                    </>
                }
            />

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Spin size="large" />
                </div>
            ) : Object.keys(filteredVMs).length === 0 ? (
                <Empty description="暂无虚拟机" />
            ) : viewMode === 'card' ? (
                <Row gutter={[16, 16]}>
                    {Object.entries(filteredVMs).map(([key, vm]) => {
                        const vmHost = vm._host || hostName
                        const isHostDisabled = vmHost ? availableHosts[vmHost]?.enabled === false : false
                        return (
                    <Col key={key} xs={24} sm={24} md={12} lg={8} xl={6} style={{ minWidth: 500 }}>
                                <DockCard
                                    uuid={vm._realUuid || key}
                                    vm={vm}
                                    hostName={vmHost}
                                    hostDisabled={isHostDisabled}
                                    userPermissions={vm.user_permissions}
                                    onEdit={(uuid) => handleEdit(uuid, vm._host)}
                                    onDelete={(uuid) => handleDelete(uuid, vm._host)}
                                    onPower={(uuid) => handleOpenPower(uuid, vm._host)}
                                    onVnc={(uuid) => handleOpenVnc(uuid, vm._host)}
                                    onDetail={(uuid) => handleOpenDetail(uuid, vm._host)}
                                />
                            </Col>
                        )
                    })}
                </Row>
            ) : (
                <Table
                    dataSource={Object.entries(filteredVMs).map(([key, vm]: [string, any]) => ({
                        key,
                        uuid: vm._realUuid || key,
                        vm,
                        hostName: vm._host || hostName,
                    }))}
                    columns={[
                        {
                            title: '虚拟机',
                            dataIndex: 'uuid',
                            key: 'uuid',
                            width: 160,
                            fixed: 'left',
                            render: (uuid: string, record: any) => {
                                const statusList = record.vm?.status || []
                                const firstStatus = statusList.length > 0 ? statusList[0] : { ac_status: 'UNKNOWN' }
                                const powerStatus = firstStatus.ac_status || 'UNKNOWN'
                                const statusInfo = VM_STATUS_MAP[powerStatus] || VM_STATUS_MAP.UNKNOWN
                                const dotColor = powerStatus === 'STARTED' ? '#10b981' : powerStatus === 'STOPPED' ? '#ef4444' : powerStatus === 'PAUSED' ? '#f59e0b' : '#9ca3af'
                                return (
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, boxShadow: powerStatus === 'STARTED' ? '0 0 4px #10b981' : undefined }} />
                                            <DesktopOutlined className="text-purple-500" />
                                            <a onClick={() => handleOpenDetail(uuid, record.vm?._host)} className="font-medium text-blue-600 cursor-pointer hover:underline">{uuid}</a>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1">
                                            <Tag color={statusInfo.color} style={{ margin: 0, fontSize: 11 }}>{statusInfo.text}</Tag>
                                            {record.hostName && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{record.hostName}</Tag>}
                                        </div>
                                    </div>
                                )
                            },
                        },
                        {
                            title: '所有者',
                            key: 'owner',
                            width: 90,
                            render: (_: any, record: any) => {
                                const ownAll = record.vm?.config?.own_all || {}
                                const ownerNames = Object.keys(ownAll)
                                const primaryOwner = ownerNames.length > 0 ? ownerNames[0] : '未知'
                                return (
                                    <Tooltip title={ownerNames.length > 1 ? `共享: ${ownerNames.join(', ')}` : undefined}>
                                        <span className="text-xs"><UserOutlined className="mr-1" />{primaryOwner}</span>
                                    </Tooltip>
                                )
                            },
                        },
                        {
                            title: '系统',
                            key: 'os',
                            width: 160,
                            ellipsis: true,
                            render: (_: any, record: any) => {
                                const osFile = record.vm?.config?.os_name || ''
                                const vmHost = record.hostName || ''
                                const displayName = getOSDisplayName(osFile, vmHost)
                                const showImage = displayName !== osFile && osFile
                                return (
                                    <Tooltip title={osFile || '未知'}>
                                        <div>
                                            <div className="text-xs font-medium">{displayName || '未知'}</div>
                                            {showImage && <div className="text-xs text-gray-400" style={{ fontSize: 10 }}>{osFile}</div>}
                                        </div>
                                    </Tooltip>
                                )
                            },
                        },
                        {
                            title: 'CPU',
                            key: 'cpu',
                            width: 80,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                const statusList = record.vm?.status || []
                                const st = statusList.length > 0 ? statusList[0] : {}
                                const total = st.cpu_total || config.cpu_num || 0
                                const usage = st.cpu_usage || 0
                                const percent = total > 0 ? Math.round((usage / total) * 100) : 0
                                return (
                                    <div>
                                        <div className="text-xs mb-1">{total}核 {percent}%</div>
                                        <Progress percent={percent} size="small" showInfo={false} strokeColor={percent > 80 ? '#ef4444' : percent > 50 ? '#f59e0b' : '#3b82f6'} />
                                    </div>
                                )
                            },
                        },
                        {
                            title: '内存',
                            key: 'mem',
                            width: 80,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                const statusList = record.vm?.status || []
                                const st = statusList.length > 0 ? statusList[0] : {}
                                const total = st.mem_total || config.mem_num || 0
                                const usage = st.mem_usage || 0
                                const percent = total > 0 ? Math.round((usage / total) * 100) : 0
                                const fmtMem = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`
                                return (
                                    <div>
                                        <div className="text-xs mb-1">{fmtMem(usage)}/{fmtMem(total)}</div>
                                        <Progress percent={percent} size="small" showInfo={false} strokeColor={percent > 80 ? '#ef4444' : percent > 50 ? '#f59e0b' : '#8b5cf6'} />
                                    </div>
                                )
                            },
                        },
                        {
                            title: '硬盘',
                            key: 'hdd',
                            width: 80,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                const statusList = record.vm?.status || []
                                const st = statusList.length > 0 ? statusList[0] : {}
                                const total = st.hdd_total || config.hdd_num || 0
                                const usage = st.hdd_usage || 0
                                const percent = total > 0 ? Math.round((usage / total) * 100) : 0
                                const fmtDisk = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`
                                return (
                                    <div>
                                        <div className="text-xs mb-1">{fmtDisk(usage)}/{fmtDisk(total)}</div>
                                        <Progress percent={percent} size="small" showInfo={false} strokeColor={percent > 80 ? '#ef4444' : percent > 50 ? '#f59e0b' : '#10b981'} />
                                    </div>
                                )
                            },
                        },
                        {
                            title: '流量',
                            key: 'traffic',
                            width: 140,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                const statusList = record.vm?.status || []
                                const st = statusList.length > 0 ? statusList[0] : {}
                                const fluTotal = st.flu_total || config.flu_num || 0
                                const fluUsage = st.flu_usage || 0
                                const fluPercent = fluTotal > 0 ? Math.round((fluUsage / fluTotal) * 100) : 0
                                const fmtTraffic = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`
                                return (
                                    <div>
                                        <div className="text-xs mb-1">
                                            {fluTotal > 0 ? `${fmtTraffic(fluUsage)}/${fmtTraffic(fluTotal)}` : '无限制'}
                                            <span style={{ color: '#888', marginLeft: 4 }}>↑{config.speed_u || 0}M ↓{config.speed_d || 0}M</span>
                                        </div>
                                        {fluTotal > 0 && <Progress percent={fluPercent} size="small" showInfo={false} strokeColor={fluPercent > 80 ? '#ef4444' : '#10b981'} />}
                                    </div>
                                )
                            },
                        },
                        {
                            title: '网卡/IP',
                            key: 'network',
                            width: 120,
                            render: (_: any, record: any) => {
                                const nicAll = record.vm?.config?.nic_all || {}
                                const nics = Object.entries(nicAll)
                                if (nics.length === 0) return <span className="text-xs" style={{ color: '#999' }}>-</span>
                                return (
                                    <div>
                                        {nics.slice(0, 2).map(([name, nic]: [string, any]) => (
                                            <div key={name} className="text-xs" style={{ lineHeight: '1.6' }}>
                                                <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px' }} color={nic.nic_type === 'pub' ? 'green' : 'default'}>{nic.nic_type === 'pub' ? '公' : '内'}</Tag>
                                                <span className="ml-1">{nic.ip4_addr || '-'}</span>
                                                {!nic.ip6_addr && nic.mac_addr && (
                                                    <div style={{ color: '#999', fontSize: 10, marginLeft: 2 }}>{nic.mac_addr}</div>
                                                )}
                                            </div>
                                        ))}
                                        {nics.length > 2 && <span className="text-xs" style={{ color: '#999' }}>+{nics.length - 2}张</span>}
                                    </div>
                                )
                            },
                        },
                        {
                            title: '端口',
                            key: 'nat',
                            width: 50,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                const natUsed = Array.isArray(config.nat_all) ? config.nat_all.length : (config.nat_all ? Object.keys(config.nat_all).length : 0)
                                const natTotal = config.nat_num || 0
                                const natPercent = natTotal > 0 ? Math.round((natUsed / natTotal) * 100) : 0
                                return (
                                    <div>
                                        <div className="text-xs mb-1">{natUsed}/{natTotal}</div>
                                        <Progress percent={natPercent} size={[undefined as any, 4]} showInfo={false} strokeColor="#06b6d4" />
                                    </div>
                                )
                            },
                        },
                        {
                            title: '反代',
                            key: 'proxy',
                            width: 50,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                const webUsed = Array.isArray(config.web_all) ? config.web_all.length : (config.web_all ? Object.keys(config.web_all).length : 0)
                                const webTotal = config.web_num || 0
                                const webPercent = webTotal > 0 ? Math.round((webUsed / webTotal) * 100) : 0
                                return (
                                    <div>
                                        <div className="text-xs mb-1">{webUsed}/{webTotal}</div>
                                        <Progress percent={webPercent} size={[undefined as any, 4]} showInfo={false} strokeColor="#a855f7" />
                                    </div>
                                )
                            },
                        },
                        {
                            title: '有效期',
                            key: 'created',
                            width: 80,
                            render: (_: any, record: any) => {
                                const created = record.vm?.config?.created_time || record.vm?.created_time
                                if (!created) return <span className="text-xs" style={{ color: '#999' }}>-</span>
                                const d = new Date(typeof created === 'number' ? created * 1000 : created)
                                return <span className="text-xs">{d.toLocaleDateString()}</span>
                            },
                        },
                        {
                            title: '电源',
                            key: 'power',
                            width: 100,
                            render: (_: any, record: any) => {
                                const isHostDisabled = record.hostName ? availableHosts[record.hostName]?.enabled === false : false
                                const perms = record.vm?.user_permissions ?? VM_PERMISSION.FULL_MASK
                                const disabled = isHostDisabled || !hasPermission(perms, VM_PERMISSION.PWR_EDITS)
                                const statusList = record.vm?.status || []
                                const st = statusList.length > 0 ? statusList[0] : { ac_status: 'UNKNOWN' }
                                const isRunning = st.ac_status === 'STARTED'
                                const isStopped = st.ac_status === 'STOPPED'
                                const isPaused = st.ac_status === 'PAUSED'
                                return (
                                    <Space size={2} wrap>
                                        {isStopped ? (
                                            <Tooltip title="开机"><Button type="text" size="small" disabled={disabled} icon={<PlayCircleOutlined style={{ color: '#10b981' }} />} onClick={() => handleQuickPower(record.uuid, record.vm?._host, 'start')} /></Tooltip>
                                        ) : (
                                            <Tooltip title="关机"><Button type="text" size="small" disabled={disabled} icon={<PoweroffOutlined style={{ color: '#f59e0b' }} />} onClick={() => handleQuickPower(record.uuid, record.vm?._host, 'stop')} /></Tooltip>
                                        )}
                                        {isRunning ? (
                                            <Tooltip title="强制重启"><Button type="text" size="small" disabled={disabled} icon={<ThunderboltOutlined style={{ color: '#3b82f6' }} />} onClick={() => handleQuickPower(record.uuid, record.vm?._host, 'hard_reset')} /></Tooltip>
                                        ) : (
                                            <Tooltip title="强制关机"><Button type="text" size="small" disabled={disabled || isStopped} danger icon={<ThunderboltOutlined />} onClick={() => handleQuickPower(record.uuid, record.vm?._host, 'hard_stop')} /></Tooltip>
                                        )}
                                        {isPaused ? (
                                            <Tooltip title="恢复"><Button type="text" size="small" disabled={disabled} icon={<PlayCircleOutlined style={{ color: '#8b5cf6' }} />} onClick={() => handleQuickPower(record.uuid, record.vm?._host, 'resume')} /></Tooltip>
                                        ) : (
                                            <Tooltip title="暂停"><Button type="text" size="small" disabled={disabled || !isRunning} icon={<PauseCircleOutlined style={{ color: '#6b7280' }} />} onClick={() => handleQuickPower(record.uuid, record.vm?._host, 'pause')} /></Tooltip>
                                        )}
                                    </Space>
                                )
                            },
                        },
                        {
                            title: '操作',
                            key: 'actions',
                            width: 120,
                            fixed: 'right',
                            render: (_: any, record: any) => {
                                const isHostDisabled = record.hostName ? availableHosts[record.hostName]?.enabled === false : false
                                const perms = record.vm?.user_permissions ?? VM_PERMISSION.FULL_MASK
                                return (
                                    <Space size="small">
                                        <Tooltip title="详情">
                                            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleOpenDetail(record.uuid, record.vm?._host)} />
                                        </Tooltip>
                                        <Tooltip title="VNC">
                                            <Button type="text" size="small" icon={<DesktopOutlined />} onClick={() => handleOpenVnc(record.uuid, record.vm?._host)} disabled={isHostDisabled || !hasPermission(perms, VM_PERMISSION.VNC_EDITS)} />
                                        </Tooltip>
                        <Tooltip title="编辑">
                                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record.uuid, record.vm?._host)} disabled={isHostDisabled || !user?.can_modify_vm || !hasPermission(perms, VM_PERMISSION.VM_MODIFY)} />
                                        </Tooltip>
                                        <Tooltip title="删除">
                                            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.uuid, record.vm?._host)} disabled={isHostDisabled || !user?.can_delete_vm || !hasPermission(perms, VM_PERMISSION.VM_DELETE)} />
                                        </Tooltip>
                                    </Space>
                                )
                            },
                        },
                    ]}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1600 }}
                />
            )}

            <DockCreateModal
                open={createModalOpen}
                onCancel={() => setCreateModalOpen(false)}
                onSuccess={() => {
                    setCreateModalOpen(false)
                    loadVMs()
                }}
                hostName={editVmUuid ? powerHostName : hostName} // Pass correct host context
                vmUuid={editVmUuid}
                isAdmin={isAdmin}
                userQuota={userQuota}
                availableHosts={availableHosts}
            />

            <DockPowerModal
                open={powerModalOpen}
                onCancel={() => setPowerModalOpen(false)}
                vmUuid={powerVmUuid}
                onAction={handlePowerAction}
            />

            <Modal
                title="确认删除"
                open={deleteModalOpen}
                onCancel={() => setDeleteModalOpen(false)}
                onOk={executeDelete}
                okText="确认删除"
                okType="danger"
                cancelText="取消"
                mask={false}
                okButtonProps={{ disabled: deleteRequireOwner ? deleteConfirmInput !== deletePrimaryOwner : deleteConfirmInput !== deleteVmUuid }}
            >
                <div>
                    <p>此操作将永久删除虚拟机 "<strong style={{ color: '#ef4444' }}>{deleteVmUuid}</strong>" 且不可恢复</p>
                    {deleteRequireOwner ? (
                        <>
                            <p className="mt-2 mb-2 text-xs">该虚拟机属于用户 "<strong>{deletePrimaryOwner}</strong>"，请输入主所有者用户名以确认删除：</p>
                            <Input
                                placeholder="请输入主所有者用户名"
                                value={deleteConfirmInput}
                                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                            />
                        </>
                    ) : (
                        <>
                            <p className="mt-2 mb-2 text-xs">请输入虚拟机名称以确认删除：</p>
                            <Input
                                placeholder="请输入虚拟机名称"
                                value={deleteConfirmInput}
                                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                            />
                        </>
                    )}
                </div>
            </Modal>
        </div>
    )
}

export default DockManage
