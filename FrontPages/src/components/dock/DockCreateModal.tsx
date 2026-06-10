import React, { useEffect, useState } from 'react'
import {
    Modal,
    Form,
    Input,
    Select,
    InputNumber,
    message,
    Row,
    Col,
    Button,
    Space,
    Slider,
    Alert,
    Divider
} from 'antd'
import {
    PlusOutlined,
    DeleteOutlined,
    RadarChartOutlined,
    ThunderboltOutlined,
    DesktopOutlined,
    GlobalOutlined,
    ReloadOutlined,
    AppstoreOutlined
} from '@ant-design/icons'
import api from '@/utils/apis.ts'
import { VM_PERMISSION, hasPermission } from '@/types'
import { startTaskWithNotification } from '@/utils/taskPoller'

// Interfaces
interface UserQuota {
    quota_cpu: number
    used_cpu: number
    quota_ram: number
    used_ram: number
    quota_ssd: number
    used_ssd: number
    quota_nat_ips: number
    used_nat_ips: number
    quota_pub_ips: number
    used_pub_ips: number
    quota_traffic: number
    used_traffic: number
    quota_upload_bw: number
    used_upload_bw: number
    quota_download_bw: number
    used_download_bw: number
    quota_nat: number
    used_nat: number
    quota_web: number
    used_web: number
    can_free_config?: number
}

// 操作系统镜像配置
interface OSConfigItem {
    sys_name: string  // 显示名称
    sys_file: string  // 文件名
    sys_size: string  // 最低磁盘GB
    sys_type: string  // WinNT/Linux/macOS
    sys_flag?: boolean // 是否启用此镜像
}

interface HostConfig {
    filter_name: string
    system_maps: OSConfigItem[]
    images_maps: OSConfigItem[]
    server_type: string
    ban_init: string[]
    ban_edit: string[]
    messages: string[]
}

interface DockCreateModalProps {
    open: boolean
    onCancel: () => void
    onSuccess: () => void
    hostName?: string
    vmUuid?: string
    isAdmin: boolean
    userQuota: UserQuota | null
    availableHosts: Record<string, any>
    userPermissions?: number
}

interface NicItem {
    key: number
    name: string
    type: string
}

const DockCreateModal: React.FC<DockCreateModalProps> = ({
    open,
    onCancel,
    onSuccess,
    hostName,
    vmUuid,
    isAdmin,
    userQuota,
    availableHosts,
    userPermissions
}) => {
    const [form] = Form.useForm()
    const isEditMode = !!vmUuid
    const [loading, setLoading] = useState(false)
    
    // Internal state
    const [nicList, setNicList] = useState<NicItem[]>([])
    const [nicCounter, setNicCounter] = useState(0)
    const [selectedHost, setSelectedHost] = useState<string>('')
    const [hostConfig, setHostConfig] = useState<HostConfig | null>(null)
    const [hostImages, setHostImages] = useState<OSConfigItem[]>([])
    const [gpuList, setGpuList] = useState<Record<string, string>>({})
    const [pciDeviceList, setPciDeviceList] = useState<Record<string, any>>({})
    const [usbDeviceList, setUsbDeviceList] = useState<Record<string, any>>({})
    const [selectedOsMinDisk, setSelectedOsMinDisk] = useState(0)
    const [saveConfirmVisible, setSaveConfirmVisible] = useState(false)
    const [pendingValues, setPendingValues] = useState<any>(null)
    const [vmPerms, setVmPerms] = useState<number>(userPermissions ?? VM_PERMISSION.FULL_MASK)
    // 套餐卡片选择相关状态
    const [serverPlans, setServerPlans] = useState<Record<string, any>>({})
    const [selectedPlanName, setSelectedPlanName] = useState<string>('')

    // 是否可以自由配置（管理员或有自由配置权限）
    const canFreeConfig = isAdmin || !!(userQuota as any)?.can_free_config

    // 编辑模式下的权限控制（管理员拥有全部权限）
    const canEditSys = isAdmin || hasPermission(vmPerms, VM_PERMISSION.SYS_EDITS)
    const canEditPwd = isAdmin || hasPermission(vmPerms, VM_PERMISSION.PWD_EDITS)
    const canEditVnc = isAdmin || hasPermission(vmPerms, VM_PERMISSION.VNC_EDITS)

    // 生成随机字符串
    const generateRandomString = (length: number) => {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
        const numbers = '0123456789'
        let result = ''
        result += letters.charAt(Math.floor(Math.random() * letters.length))
        result += numbers.charAt(Math.floor(Math.random() * numbers.length))
        const allChars = letters + numbers
        for (let i = result.length; i < length; i++) {
            result += allChars.charAt(Math.floor(Math.random() * allChars.length))
        }
        return result.split('').sort(() => Math.random() - 0.5).join('')
    }

    // 生成随机VNC端口
    const generateRandomVncPort = () => {
        return Math.floor(Math.random() * (6999 - 5900 + 1)) + 5900
    }

    // 资源输入子组件（独立组件以合法使用 useWatch Hook）
    const ResourceInput: React.FC<{
        name: string
        label: string
        min: number
        max: number
        step?: number
        unit?: string
        disabled?: boolean
        quotaUsed?: number
        quotaTotal?: number
        showQuota?: boolean
    }> = ({ name, label, min, max, step = 1, unit = '', disabled = false, quotaUsed = 0, quotaTotal = 0, showQuota = false }) => {
        const currentValue = Form.useWatch(name, form)
        
        return (
            <Form.Item label={label} style={{ marginBottom: 24 }}>
                {showQuota && !isAdmin && (
                    <div className="flex justify-between text-xs mb-2">
                        <span>当前: <strong>{currentValue}</strong> {unit}</span>
                        <span>可用: {Math.max(0, quotaTotal - quotaUsed)} {unit}</span>
                    </div>
                )}
                <Row gutter={16} align="middle">
                    <Col span={14}>
                        <Form.Item name={name} noStyle>
                            <Slider
                                min={min}
                                max={max}
                                step={step}
                                disabled={disabled}
                                onChange={(val) => form.setFieldValue(name, val)}
                                value={currentValue}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={10}>
                        <Form.Item name={name} noStyle>
                            <InputNumber
                                min={min}
                                max={max}
                                step={step}
                                disabled={disabled}
                                style={{ width: '100%' }}
                                addonAfter={unit || undefined}
                            />
                        </Form.Item>
                    </Col>
                </Row>
                {/* Special hint for HDD */}
                {name === 'hdd_num' && selectedOsMinDisk > 0 && (
                    <div className="text-xs mt-1">
                        最小要求: {selectedOsMinDisk}GB
                    </div>
                )}
            </Form.Item>
        )
    }

    // Load host data，返回加载到的数据供调用方直接使用（避免依赖 React state 异步更新）
    const loadHostData = async (host: string) => {
        if (!host) {
            setHostImages([])
            setGpuList({})
            setHostConfig(null)
            setServerPlans({})
            return { hostImages: [], gpuList: {}, pciDeviceList: {}, usbDeviceList: {}, hostConfig: null }
        }
        try {
            // 并行加载所有主机配置和套餐列表
            const [imagesResult, gpuResult, pciResult, usbResult, plansResult] = await Promise.all([
                api.getOSImages(host),
                api.getGPUList(host),
                api.getPCIList(host),
                api.getUSBList(host),
                api.getServerPlan(host),
            ])

            const loadedHostConfig = (imagesResult.code === 200 && imagesResult.data) ? imagesResult.data as any : null
            const loadedHostImages: OSConfigItem[] = loadedHostConfig ? ((loadedHostConfig.system_maps || []) as OSConfigItem[]) : []
            const loadedGpuList = (gpuResult.code === 200 && gpuResult.data) ? gpuResult.data : {}
            const loadedPciList = (pciResult.code === 200 && pciResult.data) ? pciResult.data : {}
            const loadedUsbList = (usbResult.code === 200 && usbResult.data) ? usbResult.data : {}

            // 更新 React state（用于后续渲染）
            if (loadedHostConfig) {
                setHostConfig(loadedHostConfig)
                setHostImages(loadedHostImages)
            }
            setGpuList(loadedGpuList)
            setPciDeviceList(loadedPciList)
            setUsbDeviceList(loadedUsbList)

            // 加载套餐列表
            const loadedPlans = (plansResult.code === 200 && plansResult.data) ? plansResult.data : {}
            setServerPlans(loadedPlans)

            return {
                hostImages: loadedHostImages,
                gpuList: loadedGpuList,
                pciDeviceList: loadedPciList,
                usbDeviceList: loadedUsbList,
                hostConfig: loadedHostConfig,
            }
        } catch (error) {
            console.error('加载主机配置失败:', error)
            setHostImages([])
            setGpuList({})
            setPciDeviceList({})
            setUsbDeviceList({})
            setServerPlans({})
            return { hostImages: [], gpuList: {}, pciDeviceList: {}, usbDeviceList: {}, hostConfig: null }
        }
    }

    // Initialize form
    useEffect(() => {
        if (open) {
            if (isEditMode && vmUuid) {
                loadVmDetails()
            } else {
                resetForm()
            }
        } else {
            form.resetFields()
            setNicList([])
            setSaveConfirmVisible(false)
        }
    }, [open, vmUuid])

    const loadVmDetails = async () => {
        const targetHost = hostName
        if (!targetHost || !vmUuid) {
            if (isEditMode && !targetHost) {
                message.error('未指定主机，无法加载虚拟机详情')
            }
            return
        }

        try {
            setLoading(true)
            // 并行加载主机配置和虚拟机详情，避免串行等待
            const [hostData, result] = await Promise.all([
                loadHostData(targetHost),
                api.getVMDetail(targetHost, vmUuid),
            ])
            setSelectedHost(targetHost)

            if (result.code === 200) {
                const vm = result.data as Record<string, any>
                const config = vm?.config || {}

                // 从API返回值更新用户权限
                const apiPerms = typeof vm?.user_permissions === 'number' ? vm.user_permissions : VM_PERMISSION.FULL_MASK
                setVmPerms(apiPerms)
                // 用局部变量判断权限（避免React state异步更新时序问题）
                const localCanEditSys = isAdmin || hasPermission(apiPerms, VM_PERMISSION.SYS_EDITS)
                const localCanEditPwd = isAdmin || hasPermission(apiPerms, VM_PERMISSION.PWD_EDITS)
                const localCanEditVnc = isAdmin || hasPermission(apiPerms, VM_PERMISSION.VNC_EDITS)
                
                const gpuId = config.gpu_id || ''
                let gpuMdev = ''
                let gpuRemark = ''
                if (gpuId && config.pci_all && config.pci_all[gpuId]) {
                    gpuMdev = config.pci_all[gpuId].gpu_mdev || ''
                    gpuRemark = config.pci_all[gpuId].gpu_hint || ''
                }
                const fluRst = config.flu_rst || [31, 10, 0]

                // USB Config
                let usbVid = ''
                let usbPid = ''
                let usbRemark = ''
                if (config.usb_all) {
                    const usbKeys = Object.keys(config.usb_all)
                    if (usbKeys.length > 0) {
                        const usb = config.usb_all[usbKeys[0]]
                        usbVid = usb.vid_uuid || ''
                        usbPid = usb.pid_uuid || ''
                        usbRemark = usb.usb_hint || ''
                    }
                }

                // 计算最小磁盘要求（使用 loadHostData 返回的局部数据，不依赖 React state）
                if (config.os_name && hostData?.hostImages) {
                    const matched = (hostData.hostImages as OSConfigItem[])
                        .find(it => it.sys_file === config.os_name)
                    if (matched) {
                        setSelectedOsMinDisk(parseInt(matched.sys_size || '0', 10) || 0)
                    }
                }

                form.setFieldsValue({
                    host_name: targetHost,
                    vm_uuid_suffix: vmUuid,
                    os_name: localCanEditSys ? config.os_name : '',
                    os_pass: localCanEditPwd ? config.os_pass : '',
                    vc_pass: localCanEditVnc ? config.vc_pass : '',
                    vc_port: config.vc_port,
                    cpu_num: config.cpu_num,
                    cpu_per: config.cpu_per ?? 100,
                    mem_num: config.mem_num,
                    hdd_num: config.hdd_num,
                    hdd_iop: config.hdd_iop ?? 1000,
                    gpu_id: gpuId,
                    gpu_num: config.gpu_num || 0,
                    gpu_mem: config.gpu_mem,
                    gpu_mdev: gpuMdev,
                    gpu_remark: gpuRemark,
                    usb_vid: usbVid,
                    usb_pid: usbPid,
                    usb_remark: usbRemark,
                    speed_u: config.speed_u,
                    speed_d: config.speed_d,
                    nat_num: config.nat_num,
                    flu_num: config.flu_num,
                    flu_rst_day: fluRst[0],
                    flu_rst_limit: fluRst[1],
                    flu_rst_time: fluRst[2],
                    web_num: config.web_num,
                    bak_num: config.bak_num ?? 1,
                    iso_num: config.iso_num ?? 1,
                    pci_num: config.pci_num ?? 0,
                    usb_num: config.usb_num ?? 0,
                    dat_num: config.dat_num ?? 10,
                    dat_all: config.dat_all ?? 0,
                })

                // NICs
                const nicAll = config.nic_all || {}
                const nics = Object.entries(nicAll).map(([name, nicConfig], index) => ({
                    key: index,
                    name,
                    type: (nicConfig as any).nic_type
                }))
                setNicList(nics)
                setNicCounter(nics.length)

                Object.entries(nicAll).forEach(([name, nicConfig], index) => {
                    const typedNic = nicConfig as any
                    form.setFieldsValue({
                        [`nic_name_${index}`]: name,
                        [`nic_type_${index}`]: typedNic.nic_type,
                        [`nic_ip_${index}`]: typedNic.ip4_addr,
                        [`nic_ip6_${index}`]: typedNic.ip6_addr,
                    })
                })
            } else {
                message.error(result.msg || '加载虚拟机详情失败')
            }
        } catch (error) {
            message.error('加载虚拟机详情失败')
            onCancel()
        } finally {
            setLoading(false)
        }
    }


    const isFieldDisabled = (fieldName: string) => {
        if (!hostConfig) return false
        const banList = isEditMode ? hostConfig.ban_edit : hostConfig.ban_init
        return banList && banList.includes(fieldName)
    }

    // 根据套餐自动生成网卡列表
    const autoConfigNicsByPlan = (plan: any) => {
        const nicPub = plan.nic_pub ?? 0
        const nicPri = plan.nic_pri ?? 1
        const newNicList: any[] = []
        let counter = 0
        // 先添加内网网卡
        for (let i = 0; i < nicPri; i++) {
            newNicList.push({ key: counter, name: `ethernet${counter}`, type: 'nat' })
            counter++
        }
        // 再添加公网网卡
        for (let i = 0; i < nicPub; i++) {
            newNicList.push({ key: counter, name: `ethernet${counter}`, type: 'pub' })
            counter++
        }
        setNicList(newNicList)
        setNicCounter(counter)
        // 设置表单值
        setTimeout(() => {
            const formValues: Record<string, any> = {}
            newNicList.forEach(nic => {
                formValues[`nic_name_${nic.key}`] = nic.name
                formValues[`nic_type_${nic.key}`] = nic.type
            })
            form.setFieldsValue(formValues)
        }, 0)
    }

    const handleAddNic = () => {
        // 非自由配置模式下，禁止手动添加网卡
        if (!canFreeConfig && selectedPlanName && serverPlans[selectedPlanName]) {
            message.warning('套餐模式下网卡由套餐自动配置，无法手动添加')
            return
        }

        if (userQuota) {
            const currentNatIps = nicList.filter(n => n.type === 'nat').length
            const currentPubIps = nicList.filter(n => n.type === 'pub').length
            const availableNatIps = userQuota.quota_nat_ips - userQuota.used_nat_ips
            const availablePubIps = userQuota.quota_pub_ips - userQuota.used_pub_ips

            if (currentNatIps >= availableNatIps && currentPubIps >= availablePubIps) {
                message.warning('IP配额已用完')
                return
            }

            let nextType = 'nat'
            if (currentNatIps >= availableNatIps) nextType = 'pub'

            const newNic = { key: nicCounter, name: `ethernet${nicCounter}`, type: nextType }
            setNicList([...nicList, newNic])
            
            setTimeout(() => {
                form.setFieldsValue({
                    [`nic_name_${nicCounter}`]: `ethernet${nicCounter}`,
                    [`nic_type_${nicCounter}`]: nextType
                })
            }, 0)
        } else {
            setNicList([...nicList, { key: nicCounter, name: `ethernet${nicCounter}`, type: 'nat' }])
        }
        setNicCounter(nicCounter + 1)
    }

    const handleRemoveNic = (key: number) => {
        // 非自由配置模式下，禁止手动删除网卡
        if (!canFreeConfig && selectedPlanName && serverPlans[selectedPlanName]) {
            message.warning('套餐模式下网卡由套餐自动配置，无法手动删除')
            return
        }
        setNicList(nicList.filter(n => n.key !== key))
    }

    const processSubmit = async (values: any) => {
        try {
            const targetHost = isEditMode ? hostName : (values.host_name || selectedHost)
            if (!targetHost) {
                message.error('请选择主机')
                return
            }

            const prefix = hostConfig?.filter_name || ''
            // Only add prefix if it's NOT edit mode and prefix isn't already there
            const fullUuid = isEditMode ? vmUuid! : (prefix + values.vm_uuid_suffix)

            const nicAll: Record<string, any> = {}
            if (!isEditMode) {
                nicList.forEach(nic => {
                    const nicName = values[`nic_name_${nic.key}`] || nic.name
                    nicAll[nicName] = {
                        nic_type: values[`nic_type_${nic.key}`] || 'nat',
                        ip4_addr: values[`nic_ip_${nic.key}`] || '',
                        ip6_addr: values[`nic_ip6_${nic.key}`] || ''
                    }
                })
            }

            const vmData: Record<string, any> = {
                vm_uuid: fullUuid,
                vc_port: values.vc_port,
                cpu_num: values.cpu_num,
                cpu_per: values.cpu_per,
                mem_num: values.mem_num,
                hdd_num: values.hdd_num,
                hdd_iop: values.hdd_iop,
                gpu_id: values.gpu_id,
                gpu_num: values.gpu_id ? 1 : 0,
                gpu_mem: values.gpu_mem,
                gpu_mdev: values.gpu_mdev,
                gpu_remark: values.gpu_remark,
                usb_vid: values.usb_vid,
                usb_pid: values.usb_pid,
                usb_remark: values.usb_remark,
                speed_u: values.speed_u,
                speed_d: values.speed_d,
                nat_num: values.nat_num,
                flu_num: values.flu_num,
                flu_rst: [
                    values.flu_rst_day, 
                    values.flu_rst_limit, 
                    values.flu_rst_time || Math.floor(Date.now() / 1000)
                ],
                web_num: values.web_num,
                bak_num: values.bak_num,
                iso_num: values.iso_num,
                pci_num: values.pci_num,
                usb_num: values.usb_num,
                dat_num: values.dat_num,
                dat_all: values.dat_all,
            }

            // 创建模式发送所有字段，编辑模式根据权限选择性发送
            if (!isEditMode) {
                vmData.os_name = values.os_name
                vmData.os_pass = values.os_pass
                vmData.vc_pass = values.vc_pass
                vmData.nic_all = nicAll
                // 非自由配置模式下，附带选中的套餐名称
                if (!canFreeConfig && selectedPlanName) {
                    vmData.plan_name = selectedPlanName
                }
            } else {
            // 编辑模式：有权限则发送用户修改值，无权限不发送（后端从旧配置复制）
                if (canEditSys) vmData.os_name = values.os_name
                if (canEditPwd) vmData.os_pass = values.os_pass
                if (canEditVnc) vmData.vc_pass = values.vc_pass
                // 编辑模式不发送nic_all，网卡管理已移除
                // 编辑模式发送配额字段
                vmData.bak_num = values.bak_num
                vmData.iso_num = values.iso_num
                vmData.pci_num = values.pci_num
                vmData.usb_num = values.usb_num
                vmData.dat_num = values.dat_num
                vmData.dat_all = values.dat_all
            }

            if (isEditMode) {
                const result = await api.updateVM(targetHost, vmUuid!, vmData)
                if (result.code === 200 && result.data?.task_id) {
                    setSaveConfirmVisible(false)
                    startTaskWithNotification(result, '修改虚拟机配置', {
                        onCompleted: () => onSuccess(),
                        onFailed: () => {},
                    })
                } else if (result.code === 200) {
                    message.success('更新成功')
                    setSaveConfirmVisible(false)
                    onSuccess()
                } else {
                    message.error(result.msg || '更新失败')
                }
            } else {
                try {
                    const result = await api.createVM(targetHost, vmData as any)
                    if (result.code === 200 && result.data?.task_id) {
                        // 立即关闭模态框
                        onSuccess()
                        // 顶部转圈圈强提醒，持续轮询直到完成
                        startTaskWithNotification(result, '创建虚拟机', {
                            onCompleted: async () => {
                                // 根据操作系统类型自动添加默认端口映射
                                const selectedOs = hostImages.find(it => it.sys_file === values.os_name)
                                if (selectedOs) {
                                    let defaultPort = 0
                                    let portTips = ''
                                    switch (selectedOs.sys_type) {
                                        case 'WinNT':
                                            defaultPort = 3389
                                            portTips = 'RDP远程桌面'
                                            break
                                        case 'Linux':
                                            defaultPort = 22
                                            portTips = 'SSH远程连接'
                                            break
                                        case 'macOS':
                                            defaultPort = 5900
                                            portTips = 'VNC远程桌面'
                                            break
                                    }
                                    if (defaultPort > 0) {
                                        try {
                                            await api.addNATRule(targetHost, fullUuid, {
                                                wan_port: 0,
                                                lan_port: defaultPort,
                                                lan_addr: '',
                                                nat_tips: portTips,
                                            } as any)
                                        } catch (e) {
                                            console.warn('自动添加默认端口映射失败:', e)
                                        }
                                    }
                                }
                                // 任务完成后刷新列表
                                onSuccess()
                            },
                        })
                    } else {
                        message.error(result.msg || '创建失败')
                    }
                } catch (error) {
                    throw error
                }
            }
        } catch (error) {
            message.error('操作失败')
        }
    }

    const handleSubmit = async (values: any) => {
        if (isEditMode) {
            setPendingValues(values)
            setSaveConfirmVisible(true)
        } else {
        await processSubmit(values)
        }
    }

    const sectionTitleStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
        fontSize: 16,
        fontWeight: 600
    }

    const resetForm = async () => {
        form.resetFields()
        setNicList([])
        
        if (hostName) {
            setSelectedHost(hostName)
            form.setFieldsValue({ host_name: hostName })
            await loadHostData(hostName)
        } else {
            setSelectedHost('')
            setHostImages([])
            setGpuList({})
            setPciDeviceList({})
            setUsbDeviceList({})
        }

        form.setFieldsValue({
            vm_uuid_suffix: generateRandomString(8),
            os_pass: generateRandomString(8),
            vc_pass: generateRandomString(8),
            vc_port: generateRandomVncPort(),
            cpu_num: 2,
            cpu_per: 100,
            mem_num: 2048,
            hdd_num: 20480,
            hdd_iop: 1000,
            gpu_id: '',
            gpu_num: 0,
            gpu_mem: 128,
            gpu_mdev: '',
            gpu_remark: '',
            usb_vid: '',
            usb_pid: '',
            usb_remark: '',
            speed_u: 100,
            speed_d: 100,
            flu_num: 102400,
            flu_rst_day: 31,
            flu_rst_limit: 10,
            flu_rst_time: Math.floor(Date.now() / 1000),
            nat_num: 100,
            web_num: 100,
            bak_num: 1,
            iso_num: 1,
            pci_num: 0,
            usb_num: 0,
            dat_num: 10,
            dat_all: 0,
        })

        if (userQuota) {
            const availableNatIps = userQuota.quota_nat_ips - userQuota.used_nat_ips
            const availablePubIps = userQuota.quota_pub_ips - userQuota.used_pub_ips
            let defaultType = 'nat'
            if (availableNatIps <= 0 && availablePubIps > 0) defaultType = 'pub'
            
            if (availableNatIps > 0 || availablePubIps > 0) {
                const initialNic = { key: 0, name: 'ethernet0', type: defaultType }
                setNicList([initialNic])
                setNicCounter(1)
                form.setFieldsValue({
                    nic_name_0: 'ethernet0',
                    nic_type_0: defaultType
                })
            }
        } else {
            setNicList([{ key: 0, name: 'ethernet0', type: 'nat' }])
            setNicCounter(1)
            form.setFieldsValue({ nic_name_0: 'ethernet0', nic_type_0: 'nat' })
        }
    }

    return (
        <>
            <Modal
                title={
                    <div className="flex items-center gap-2">
                        <DesktopOutlined className="text-purple-600" />
                        <span>{isEditMode ? '编辑虚拟机' : '创建虚拟机'}</span>
                    </div>
                }
                open={open}
                onCancel={onCancel}
                onOk={() => form.submit()}
                width={900}
                maskClosable={false}
                confirmLoading={loading}
                styles={{ body: { padding: '24px 0 0 0' } }}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 24px' }}>
                    {!isEditMode && !hostName && (
                        <Form.Item name="host_name" label="选择主机" rules={[{ required: true }]}>
                            <Select 
                                onChange={(val) => {
                                    setSelectedHost(val)
                                    loadHostData(val)
                                }}
                                placeholder="请选择部署主机"
                            >
                                {Object.keys(availableHosts)
                                    .filter(h => availableHosts[h]?.enabled !== false)
                                    .map(h => (
                                        <Select.Option key={h} value={h}>{h}</Select.Option>
                                    ))}
                            </Select>
                        </Form.Item>
                    )}

                    <div className="modal-section">
                        <div style={sectionTitleStyle}>
                            <div className="w-8 h-8 rounded-lg section-icon-bg-purple flex items-center justify-center">
                                <DesktopOutlined />
                            </div>
                            <span>基本信息</span>
                        </div>

                        <Row gutter={24}>
                            <Col span={12}>
                                <Form.Item 
                                    label="虚拟机UUID" 
                                    required
                                >
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Form.Item
                                            name="vm_uuid_suffix"
                                            noStyle
                                            rules={[{ required: true }]}
                                        >
                                            <Input 
                                                addonBefore={hostConfig?.filter_name} 
                                                disabled={isEditMode}
                                                placeholder="唯一标识符"
                                            />
                                        </Form.Item>
                                        {!isEditMode && (
                                            <Button 
                                                htmlType="button"
                                                icon={<ReloadOutlined />} 
                                                onClick={() => form.setFieldValue('vm_uuid_suffix', generateRandomString(8))}
                                                title="随机生成UUID"
                                            />
                                        )}
                                    </Space.Compact>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="os_name" label="操作系统" rules={[{ required: !isEditMode || canEditSys }]}>
                                    <Select 
                                        placeholder={isEditMode && !canEditSys ? '无权限修改' : '选择系统镜像'}
                                        disabled={isEditMode && !canEditSys}
                                        getPopupContainer={triggerNode => triggerNode.parentNode}
                                        onChange={(val) => {
                                            if (hostImages && hostImages.length > 0) {
                                                const matched = hostImages.find(it => it.sys_file === val)
                                                if (matched) {
                                                    const minDisk = parseInt(matched.sys_size || '0', 10) || 0
                                                    setSelectedOsMinDisk(minDisk)
                                                }
                                            }
                                    }}
                                    >
                                        {hostImages.filter(item => item.sys_flag !== false).map((item) => (
                                            <Select.Option key={item.sys_file} value={item.sys_file}>{item.sys_name}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                        
                        <Row gutter={24}>
                            <Col span={8}>
                                <Form.Item label="系统密码">
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Form.Item name="os_pass" noStyle>
                                            <Input.Password 
                                                placeholder={isEditMode && !canEditPwd ? '无权限查看/修改' : '系统登录密码'}
                                                disabled={isEditMode && !canEditPwd}
                                            />
                                        </Form.Item>
                                        <Button 
                                            htmlType="button"
                                            icon={<ReloadOutlined />} 
                                            onClick={() => form.setFieldValue('os_pass', generateRandomString(8))}
                                            title="随机生成密码"
                                            disabled={isEditMode && !canEditPwd}
                                        />
                                    </Space.Compact>
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="VNC密码">
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Form.Item name="vc_pass" noStyle>
                                            <Input.Password 
                                                placeholder={isEditMode && !canEditVnc ? '无权限查看/修改' : 'VNC连接密码'}
                                                disabled={isEditMode && !canEditVnc}
                                            />
                                        </Form.Item>
                                        <Button 
                                            htmlType="button"
                                            icon={<ReloadOutlined />} 
                                            onClick={() => form.setFieldValue('vc_pass', generateRandomString(8))}
                                            title="随机生成密码"
                                            disabled={isEditMode && !canEditVnc}
                                        />
                                    </Space.Compact>
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="VNC端口">
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Form.Item name="vc_port" noStyle>
                                            <InputNumber style={{ width: '100%' }} min={5900} max={6999} disabled />
                                        </Form.Item>
                                        <Button 
                                            htmlType="button"
                                            icon={<ReloadOutlined />} 
                                            onClick={() => form.setFieldValue('vc_port', generateRandomVncPort())}
                                            title="随机生成端口"
                                        />
                                    </Space.Compact>
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>

                    {/* 套餐卡片选择（非自由配置模式且为创建模式时显示） */}
                    {!canFreeConfig && !isEditMode && (
                        <div className="modal-section">
                            <div style={sectionTitleStyle}>
                                <div className="w-8 h-8 rounded-lg section-icon-bg-orange flex items-center justify-center">
                                    <AppstoreOutlined />
                                </div>
                                <span>选择套餐</span>
                            </div>
                            {Object.keys(serverPlans).length === 0 ? (
                                <Alert message="当前主机暂无可用套餐，请联系管理员" type="warning" showIcon />
                            ) : (
                                <Row gutter={[16, 16]}>
                                    {Object.entries(serverPlans).map(([planName, planCfg]: [string, any]) => {
                                        // 检查套餐是否超出用户配额
                                        const remainCpu = (userQuota?.quota_cpu || 0) - (userQuota?.used_cpu || 0)
                                        const remainRam = (userQuota?.quota_ram || 0) - (userQuota?.used_ram || 0)
                                        const remainSsd = (userQuota?.quota_ssd || 0) - (userQuota?.used_ssd || 0)
                                        const exceedReasons: string[] = []
                                        if (planCfg.cpu_num > remainCpu) exceedReasons.push(`CPU超出${planCfg.cpu_num - remainCpu}核`)
                                        if (planCfg.mem_num > remainRam) exceedReasons.push(`内存超出${planCfg.mem_num - remainRam}MB`)
                                        if (planCfg.hdd_num > remainSsd) exceedReasons.push(`硬盘超出${planCfg.hdd_num - remainSsd}MB`)
                                        const isExceeded = exceedReasons.length > 0

                                        return (
                                        <Col span={8} key={planName}>
                                            <div
                                                onClick={() => {
                                                    if (isExceeded) return
                                                    setSelectedPlanName(planName)
                                                    // 自动填充表单资源字段
                                                    form.setFieldsValue({
                                                        cpu_num: planCfg.cpu_num,
                                                        cpu_per: planCfg.cpu_per ?? 100,
                                                        mem_num: planCfg.mem_num,
                                                        hdd_num: planCfg.hdd_num,
                                                        hdd_iop: planCfg.hdd_iop ?? 1000,
                                                        gpu_mem: planCfg.gpu_mem ?? 0,
                                                        speed_u: planCfg.speed_u,
                                                        speed_d: planCfg.speed_d,
                                                        nat_num: planCfg.nat_num,
                                                        web_num: planCfg.web_num,
                                                        flu_num: planCfg.flu_num,
                                                        bak_num: planCfg.bak_num ?? 1,
                                                        iso_num: planCfg.iso_num ?? 1,
                                                        pci_num: planCfg.pci_num ?? 0,
                                                        usb_num: planCfg.usb_num ?? 0,
                                                        dat_num: planCfg.dat_num ?? 1,
                                                        dat_all: planCfg.dat_all ?? 0,
                                                    })
                                                    // 套餐模式下自动配置网卡
                                                    if (!canFreeConfig) {
                                                        autoConfigNicsByPlan(planCfg)
                                                    }
                                                }}
                                                style={{
                                                    border: selectedPlanName === planName ? '2px solid #1677ff' : isExceeded ? '1px solid #d9d9d9' : '1px solid #d9d9d9',
                                                    borderRadius: 8,
                                                    padding: 16,
                                                    cursor: isExceeded ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s',
                                                    background: isExceeded ? '#f5f5f5' : selectedPlanName === planName ? '#e6f4ff' : 'transparent',
                                                    boxShadow: selectedPlanName === planName ? '0 2px 8px rgba(22,119,255,0.15)' : 'none',
                                                    opacity: isExceeded ? 0.6 : 1,
                                                }}
                                            >
                                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{planName}</div>
                                                <div className="space-y-1 text-xs" style={{ color: isExceeded ? '#999' : '#666' }}>
                                                    <div>CPU: {planCfg.cpu_num}核 {planCfg.cpu_per ? `(可用率${planCfg.cpu_per}%)` : ''}</div>
                                                    <div>RAM: {planCfg.mem_num >= 1024 ? `${Math.round(planCfg.mem_num / 1024)}GB` : `${planCfg.mem_num}MB`} / GPU: {planCfg.gpu_mem ? `${planCfg.gpu_mem}MB` : '无'}</div>
                                                    <div>HDD: {planCfg.hdd_num >= 1024 ? `${Math.round(planCfg.hdd_num / 1024)}GB` : `${planCfg.hdd_num}MB`} / IOPS: {planCfg.hdd_iop ?? 1000}</div>
                                                    <div>带宽: ↑{planCfg.speed_u}Mbps ↓{planCfg.speed_d}Mbps</div>
                                                    <div>流量: {planCfg.flu_num >= 1024 ? `${Math.round(planCfg.flu_num / 1024)}GB` : `${planCfg.flu_num}MB`} / {planCfg.flu_rst?.[0] ?? 31}天 / 超限{planCfg.flu_rst?.[1] ?? 10}M</div>
                                                    <div>端口: {planCfg.nat_num ?? 0}个 / Web: {planCfg.web_num ?? 0}个</div>
                                                    <div>网卡: 公网{planCfg.nic_pub ?? 0} + 内网{planCfg.nic_pri ?? 1} </div>
                                                    <div> IPv4: {planCfg.ip4_max ?? 1} / IPv6: {planCfg.ip6_max ?? 0}</div>
                                                    <div>备份数量: {planCfg.bak_num ?? 1} / ISO光盘数: {planCfg.iso_num ?? 1}</div>
                                                    <div>数据盘: {planCfg.dat_num ?? 1}个 / 可用空间: {planCfg.dat_all ? (planCfg.dat_all >= 1024 ? `${Math.round(planCfg.dat_all / 1024)}GB` : `${planCfg.dat_all}MB`) : '0MB'}</div>
                                                </div>
                                                {isExceeded && (
                                                    <div style={{ marginTop: 6, color: '#ff4d4f', fontSize: 11 }}>
                                                        配额不足: {exceedReasons.join('、')}
                                                    </div>
                                                )}
                                            </div>
                                        </Col>
                                        )
                                    })}
                                </Row>
                            )}
                        </div>
                    )}

                    {/* 资源配置（自由配置模式或编辑模式时显示） */}
                    {(canFreeConfig || isEditMode) && (
                    <>
                    <div className="modal-section">
                        <div style={sectionTitleStyle}>
                            <div className="w-8 h-8 rounded-lg section-icon-bg-orange flex items-center justify-center">
                                <ThunderboltOutlined />
                            </div>
                            <span>资源配置</span>
                        </div>

                        <Row gutter={24}>
                            <Col span={12}>
                                <ResourceInput
                                    name="cpu_num" label="CPU核心" min={1} max={isAdmin ? 128 : (userQuota?.quota_cpu || 4)} step={1} unit="核"
                                    disabled={isFieldDisabled('cpu_num')} quotaUsed={userQuota?.used_cpu || 0} quotaTotal={userQuota?.quota_cpu || 0} showQuota
                                />
                            </Col>
                            <Col span={12}>
                                <ResourceInput
                                    name="cpu_per" label="最大可用率" min={0} max={100} step={1} unit="%"
                                    disabled={isFieldDisabled('cpu_per')}
                                />
                            </Col>
                            <Col span={12}>
                                <ResourceInput
                                    name="mem_num" label="内存" min={512} max={isAdmin ? 131072 : (userQuota?.quota_ram || 4096)} step={512} unit="MB"
                                    disabled={isFieldDisabled('mem_num')} quotaUsed={userQuota?.used_ram || 0} quotaTotal={userQuota?.quota_ram || 0} showQuota
                                />
                            </Col>
                            <Col span={12}>
                                <ResourceInput
                                    name="hdd_num" label="硬盘" min={selectedOsMinDisk * 1024 || 10240} max={isAdmin ? 10485760 : (userQuota?.quota_ssd || 51200)} step={1024} unit="MB"
                                    disabled={isFieldDisabled('hdd_num')} quotaUsed={userQuota?.used_ssd || 0} quotaTotal={userQuota?.quota_ssd || 0} showQuota
                                />
                            </Col>
                            <Col span={12}>
                                <ResourceInput
                                    name="hdd_iop" label="硬盘速率" min={100} max={50000} step={100} unit="IOPS"
                                    disabled={isFieldDisabled('hdd_iop')}
                                />
                            </Col>
                            <Col span={12}>
                                <ResourceInput
                                    name="gpu_mem" label="显存" min={0} max={isAdmin ? 16384 : 128} step={128} unit="MB"
                                    disabled={isFieldDisabled('gpu_mem')}
                                />
                        </Col>
                        </Row>
                    </div>

                    <div className="modal-section">
                        <div style={sectionTitleStyle}>
                            <div className="w-8 h-8 rounded-lg section-icon-bg-purple flex items-center justify-center">
                                <ThunderboltOutlined />
                            </div>
                            <span>配额配置</span>
                        </div>
                        <Row gutter={24}>
                            <Col span={8}>
                                <Form.Item name="bak_num" label="最大备份数" style={{ marginBottom: 16 }}>
                                    <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="个" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="iso_num" label="最大光盘数" style={{ marginBottom: 16 }}>
                                    <InputNumber min={0} max={10} style={{ width: '100%' }} addonAfter="个" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="pci_num" label="最大PCIe数" style={{ marginBottom: 16 }}>
                                    <InputNumber min={0} max={16} style={{ width: '100%' }} addonAfter="个" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="usb_num" label="最大USB数" style={{ marginBottom: 16 }}>
                                    <InputNumber min={0} max={16} style={{ width: '100%' }} addonAfter="个" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="dat_num" label="最大数据盘数" style={{ marginBottom: 16 }}>
                                    <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="个" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="dat_all" label="数据盘总容量" style={{ marginBottom: 16 }}>
                                    <InputNumber min={0} style={{ width: '100%' }} addonAfter="MB" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                    </>
                    )}

                    {(canFreeConfig || isEditMode) && (
                    <div className="modal-section">
                        <div style={sectionTitleStyle}>
                            <div className="w-8 h-8 rounded-lg section-icon-bg-red flex items-center justify-center">
                                <DesktopOutlined />
                            </div>
                            <span>PCI配置</span>
                        </div>
                        <Row gutter={24}>
                            <Col span={12}>
                                <Form.Item label="PCI直通" name="gpu_id">
                                    <Select allowClear placeholder="选择PCI设备" onChange={(val) => {
                                        if (val && pciDeviceList[val]) {
                                            const dev = pciDeviceList[val]
                                            form.setFieldsValue({
                                                gpu_mdev: dev.gpu_mdev || '',
                                                gpu_remark: dev.gpu_hint || ''
                                            })
                                        } else {
                                            form.setFieldsValue({ gpu_mdev: '', gpu_remark: '' })
                                        }
                                    }}>
                                        <Select.Option value="">无PCI直通</Select.Option>
                                        {Object.entries(pciDeviceList).map(([key, dev]: [string, any]) => (
                                            <Select.Option key={key} value={key}>{key} - {dev.gpu_hint || dev.gpu_uuid || ''}</Select.Option>
                                        ))}
                                        {Object.keys(pciDeviceList).length === 0 && Object.entries(gpuList).map(([id, name]) => (
                                            <Select.Option key={id} value={id}>{id} - {name}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item label="MDEV / 备注">
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Form.Item name="gpu_mdev" noStyle>
                                            <Input placeholder="vGPU/MDEV UUID" style={{ width: '60%' }} />
                                        </Form.Item>
                                        <Form.Item name="gpu_remark" noStyle>
                                            <Input placeholder="PCI备注信息" style={{ width: '40%' }} />
                                        </Form.Item>
                                    </Space.Compact>
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                    )}

                    {(canFreeConfig || isEditMode) && (
                    <div className="modal-section">
                        <div style={sectionTitleStyle}>
                            <div className="w-8 h-8 rounded-lg section-icon-bg-blue flex items-center justify-center">
                                <ThunderboltOutlined />
                            </div>
                            <span>USB配置</span>
                        </div>
                        <Row gutter={24}>
                            <Col span={8}>
                                <Form.Item label="USB设备" name="usb_device_key">
                                    <Select allowClear placeholder="选择USB设备" onChange={(val) => {
                                        if (val && usbDeviceList[val]) {
                                            const dev = usbDeviceList[val]
                                            form.setFieldsValue({
                                                usb_vid: dev.vid_uuid || '',
                                                usb_pid: dev.pid_uuid || '',
                                                usb_remark: dev.usb_hint || ''
                                            })
                                        } else {
                                            form.setFieldsValue({ usb_vid: '', usb_pid: '', usb_remark: '' })
                                        }
                                    }}>
                                        <Select.Option value="">无USB直通</Select.Option>
                                        {Object.entries(usbDeviceList).map(([key, dev]: [string, any]) => (
                                            <Select.Option key={key} value={key}>{dev.usb_hint || `${dev.vid_uuid}:${dev.pid_uuid}`}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="VID / PID">
                                    <Space.Compact style={{ width: '100%' }}>
                                        <Form.Item name="usb_vid" noStyle>
                                            <Input placeholder="VID (ex: 0403)" style={{ width: '50%' }} />
                                        </Form.Item>
                                        <Form.Item name="usb_pid" noStyle>
                                            <Input placeholder="PID (ex: 6001)" style={{ width: '50%' }} />
                                        </Form.Item>
                                    </Space.Compact>
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="备注" name="usb_remark">
                                    <Input placeholder="USB备注信息" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                    )}

                    {(canFreeConfig || isEditMode) && (
                    <div className="modal-section">
                        <div style={sectionTitleStyle}>
                            <div className="w-8 h-8 rounded-lg section-icon-bg-green flex items-center justify-center">
                                <GlobalOutlined />
                            </div>
                            <span>网络与配额</span>
                        </div>

                        <Row gutter={24}>
                            <Col span={12}>
                                <ResourceInput
                                    name="speed_u" label="上传带宽" min={1} max={isAdmin ? 10000 : (userQuota?.quota_upload_bw || 100)} step={1} unit="Mbps"
                                    disabled={false} quotaUsed={userQuota?.used_upload_bw || 0} quotaTotal={userQuota?.quota_upload_bw || 0} showQuota
                                />
                            </Col>
                            <Col span={12}>
                                <ResourceInput
                                    name="speed_d" label="下载带宽" min={1} max={isAdmin ? 10000 : (userQuota?.quota_download_bw || 100)} step={1} unit="Mbps"
                                    disabled={false} quotaUsed={userQuota?.used_download_bw || 0} quotaTotal={userQuota?.quota_download_bw || 0} showQuota
                                />
                            </Col>
                        </Row>
                        <Row gutter={24}>
                            <Col span={12}>
                                <ResourceInput
                                    name="flu_num" label="流量限制" min={0} max={1024000} step={1024} unit="MB"
                                    disabled={isFieldDisabled('flu_num')} quotaUsed={userQuota?.used_traffic || 0} quotaTotal={userQuota?.quota_traffic || 0} showQuota
                                />
                            </Col>
                            <Col span={6}>
                                <Form.Item label="重置时间" name="flu_rst_day" style={{ marginBottom: 24 }}>
                                    <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Form.Item label="达标限速" name="flu_rst_limit" style={{ marginBottom: 24 }}>
                                    <InputNumber min={1} max={1000} style={{ width: '100%' }} addonAfter="Mbps" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Divider style={{ margin: '12px 0 24px 0' }} />

                        <Row gutter={24}>
                            <Col span={12}>
                                <ResourceInput
                                    name="nat_num" label="NAT端口数" min={0} max={isAdmin ? 1000 : (userQuota?.quota_nat || 100)} step={1} unit="个"
                                    disabled={isFieldDisabled('nat_num')} quotaUsed={userQuota?.used_nat || 0} quotaTotal={userQuota?.quota_nat || 0} showQuota
                                />
                            </Col>
                            <Col span={12}>
                                <ResourceInput
                                    name="web_num" label="Web代理数" min={0} max={isAdmin ? 1000 : (userQuota?.quota_web || 10)} step={1} unit="个"
                                    disabled={isFieldDisabled('web_num')} quotaUsed={userQuota?.used_web || 0} quotaTotal={userQuota?.quota_web || 0} showQuota
                                />
                            </Col>
                        </Row>
                    </div>
                    )}

                    {/* 非自由配置用户不显示网卡配置（由套餐自动配置）；编辑模式也隐藏 */}
                    {!isEditMode && canFreeConfig && (
                    <div className="modal-section">
                        <div style={sectionTitleStyle}>
                            <div className="w-8 h-8 rounded-lg section-icon-bg-blue flex items-center justify-center">
                                <RadarChartOutlined />
                            </div>
                            <span>网卡配置</span>
                            {!canFreeConfig && selectedPlanName && serverPlans[selectedPlanName] && (
                                <span className="text-xs" style={{ color: '#999', marginLeft: 8 }}>
                                    (公网{serverPlans[selectedPlanName].nic_pub ?? 0}张 + 内网{serverPlans[selectedPlanName].nic_pri ?? 1}张，
                                    IPv4最多{serverPlans[selectedPlanName].ip4_max ?? 1}个，
                                    IPv6最多{serverPlans[selectedPlanName].ip6_max ?? 0}个)
                                </span>
                            )}
                        </div>

                        {nicList.map((nic) => (
                            <Space.Compact key={nic.key} style={{ width: '100%', marginBottom: 12 }}>
                                <Form.Item name={`nic_name_${nic.key}`} initialValue={nic.name} noStyle>
                                    <Input style={{ width: 120 }} disabled />
                                </Form.Item>
                                <Form.Item name={`nic_type_${nic.key}`} initialValue="nat" noStyle>
                                    <Select style={{ width: 100 }} disabled={!canFreeConfig && !!selectedPlanName}>
                                        <Select.Option value="nat">内网</Select.Option>
                                        <Select.Option value="pub">公网</Select.Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item name={`nic_ip_${nic.key}`} noStyle>
                                    <Input placeholder="IPv4 (可选)" style={{ margin: '0 10px' }} disabled={!canFreeConfig && !!selectedPlanName} />
                                </Form.Item>
                                <Form.Item name={`nic_ip6_${nic.key}`} noStyle>
                                    <Input placeholder="IPv6 (可选)" style={{ margin: '0 10px' }} disabled={!canFreeConfig && !!selectedPlanName} />
                                </Form.Item>
                                {(canFreeConfig || !selectedPlanName) && (
                                    <Button danger icon={<DeleteOutlined />} onClick={() => handleRemoveNic(nic.key)} />
                                )}
                            </Space.Compact>
                        ))}
                        
                        {(canFreeConfig || !selectedPlanName) && (
                        <Button type="dashed" onClick={handleAddNic} block icon={<PlusOutlined />}>
                            添加网卡
                        </Button>
                        )}
                    </div>
                    )}
                </Form>
            </Modal>

            <Modal
                title="确认保存"
                open={saveConfirmVisible}
                onCancel={() => setSaveConfirmVisible(false)}
                onOk={() => processSubmit(pendingValues)}
                okText="确认保存"
                cancelText="取消"
            >
                <Alert
                    message="保存确认"
                    description="确定要保存对虚拟机的修改吗？部分修改可能需要重启虚拟机才能生效。"
                    type="warning"
                    showIcon
                />
            </Modal>
        </>
    )
}

export default DockCreateModal
