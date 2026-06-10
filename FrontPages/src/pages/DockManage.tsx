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
    Table,
    Tag,
    Tooltip,
    Space,
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
            }
        } catch (error) {
            console.error('加载主机列表失败:', error)
        }
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
            ) : Object.keys(vms).length === 0 ? (
                <Empty description="暂无虚拟机" />
            ) : viewMode === 'card' ? (
                <Row gutter={[16, 16]}>
                    {Object.entries(vms).map(([key, vm]) => {
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
                    dataSource={Object.entries(vms).map(([key, vm]) => ({
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
                            render: (uuid: string, record: any) => (
                                <div className="flex items-center gap-2">
                                    <DesktopOutlined className="text-purple-500" />
                                    <span className="font-medium">{uuid}</span>
                                </div>
                            ),
                        },
                        {
                            title: '所有者',
                            key: 'owner',
                            width: 120,
                            render: (_: any, record: any) => {
                                const ownAll = record.vm?.config?.own_all || {}
                                const ownerNames = Object.keys(ownAll)
                                const primaryOwner = ownerNames.length > 0 ? ownerNames[0] : '-'
                                return (
                                    <Tooltip title={ownerNames.length > 1 ? `共享: ${ownerNames.join(', ')}` : undefined}>
                                        <span><UserOutlined className="mr-1" />{primaryOwner}</span>
                                    </Tooltip>
                                )
                            },
                        },
                        {
                            title: '主机',
                            dataIndex: 'hostName',
                            key: 'hostName',
                            width: 120,
                            render: (host: string) => <Tag color="blue">{host}</Tag>,
                        },
                        {
                            title: '系统',
                            key: 'os',
                            width: 300,
                            render: (_: any, record: any) => record.vm?.config?.os_name || '未知',
                        },
                        {
                            title: '状态',
                            key: 'status',
                            width: 100,
                            render: (_: any, record: any) => {
                                const statusList = record.vm?.status || []
                                const firstStatus = statusList.length > 0 ? statusList[0] : { ac_status: 'UNKNOWN' }
                                const powerStatus = firstStatus.ac_status || 'UNKNOWN'
                                const statusInfo = VM_STATUS_MAP[powerStatus] || VM_STATUS_MAP.UNKNOWN
                                return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
                            },
                        },
                        {
                            title: 'CPU',
                            key: 'cpu',
                            width: 80,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                return `${config.cpu_num || 0} 核`
                            },
                        },
                        {
                            title: '内存',
                            key: 'mem',
                            width: 80,
                            render: (_: any, record: any) => {
                                const config = record.vm?.config || {}
                                const mem = config.mem_num || 0
                                return mem >= 1024 ? `${(mem / 1024).toFixed(1)} GB` : `${mem} MB`
                            },
                        },
                        {
                            title: 'IP地址',
                            key: 'ip',
                            width: 140,
                            render: (_: any, record: any) => {
                                const nicAll = record.vm?.config?.nic_all || {}
                                const firstNic: any = Object.values(nicAll)[0] || {}
                                return firstNic.ip4_addr || '-'
                            },
                        },
                        {
                            title: '操作',
                            key: 'actions',
                            width: 180,
                            render: (_: any, record: any) => {
                                const isHostDisabled = record.hostName ? availableHosts[record.hostName]?.enabled === false : false
                                const perms = record.vm?.user_permissions ?? VM_PERMISSION.FULL_MASK
                                return (
                                    <Space size="small">
                                        <Tooltip title="查看详情">
                                            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleOpenDetail(record.uuid, record.vm?._host)} />
                                        </Tooltip>
                                        <Tooltip title="VNC">
                                            <Button type="text" size="small" icon={<DesktopOutlined />} onClick={() => handleOpenVnc(record.uuid, record.vm?._host)} disabled={isHostDisabled || !hasPermission(perms, VM_PERMISSION.VNC_EDITS)} />
                                        </Tooltip>
                                        <Tooltip title="电源">
                                            <Button type="text" size="small" icon={<PoweroffOutlined />} onClick={() => handleOpenPower(record.uuid, record.vm?._host)} disabled={isHostDisabled || !hasPermission(perms, VM_PERMISSION.PWR_EDITS)} />
                                        </Tooltip>
                                        <Tooltip title="编辑">
                                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record.uuid, record.vm?._host)} disabled={isHostDisabled || !hasPermission(perms, VM_PERMISSION.VM_MODIFY)} />
                                        </Tooltip>
                                        <Tooltip title="删除">
                                            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.uuid, record.vm?._host)} disabled={isHostDisabled || !hasPermission(perms, VM_PERMISSION.VM_DELETE)} />
                                        </Tooltip>
                                    </Space>
                                )
                            },
                        },
                    ]}
                    pagination={false}
                    size="middle"
                    scroll={{ x: 'max-content' }}
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
