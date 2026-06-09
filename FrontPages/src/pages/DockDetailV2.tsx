import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, message, Modal, Tag, Dropdown, Alert, Spin
} from 'antd'
import {
  ReloadOutlined, PoweroffOutlined, DesktopOutlined, EyeOutlined, CopyOutlined,
  PlayCircleOutlined, PauseCircleOutlined, SwapOutlined,
  CameraOutlined, DatabaseOutlined, SafetyCertificateOutlined, GlobalOutlined, MoreOutlined
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { useMmuiTheme } from '@/hooks/useMmuiTheme'
import MmuiSidebar from '@/components/mmui/MmuiSidebar'
import MmuiHeader from '@/components/mmui/MmuiHeader'
import MmuiCard, { MmuiGaugeRing, MmuiLoginCard } from '@/components/mmui/MmuiCard'
import api from '@/utils/apis.ts'
import { VM_PERMISSION, hasPermission } from '@/types'
import '@/styles/mmui-theme.css'
import '@/styles/mmui-components.css'

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

// formatSpeed 保留备用
// const formatSpeed = (mbps: number) => {
//   if (!mbps) return '0 KBps'
//   if (mbps < 1) return `${(mbps * 1024).toFixed(0)} KBps`
//   if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
//   return `${mbps.toFixed(0)} Mbps`
// }

// ═════════════════════════════════════════════════════════════════════════
// Main Component - MMUI 风格虚拟机详情页
// ═════════════════════════════════════════════════════════════════════════
export default function DockDetailV2() {
  const { hostName, uuid } = useParams<{ hostName: string; uuid: string }>()
  const navigate = useNavigate()
  const theme = useMmuiTheme()

  // ── UI State ──────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('panel')

  // ── Data State ────────────────────────────────────────────────────────
  const [vm, setVM] = useState<any>(null)
  const vmRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [hostConfig, setHostConfig] = useState<HostConfig | null>(null)
  const hostConfigRef = useRef<HostConfig | null>(null)
  const [hostEnabled, setHostEnabled] = useState(true)
  const [userPermissions, setUserPermissions] = useState(VM_PERMISSION.FULL_MASK)
  const [showPassword, setShowPassword] = useState(false)
  const [showVncPassword, setShowVncPassword] = useState(false)
  const [natRules, setNatRules] = useState<NATRule[]>([])
  const [proxyRules, setProxyRules] = useState<any[]>([])
  const [owners, setOwners] = useState<any[]>([])
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [vmScreenshot, setVmScreenshot] = useState('')
  const [tempStatus, _setTempStatus] = useState<string | null>(null)
  void _setTempStatus // 保留setter备用
  const [reinstallOS, setReinstallOS] = useState('')
  const [reinstallPass, setReinstallPass] = useState('')
  const [timeRange, setTimeRange] = useState(30)
  const [monitorData, setMonitorData] = useState<any>({
    cpu: [], memory: [], disk: [], gpu: [], netUp: [], netDown: [], traffic: [], labels: []
  })

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
    } catch {
      // 忽略NAT规则加载错误
    }
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

  const loadProxyRules = useCallback(async () => {
    if (!hostName || !uuid) return
    try {
      const r = await api.getProxyConfigs(hostName, uuid)
      if (r.data) setProxyRules(Array.isArray(r.data) ? r.data : [])
    } catch {
      // 忽略代理规则加载错误
    }
  }, [hostName, uuid])

  const loadOwners = useCallback(async () => {
    if (!hostName || !uuid) return
    try {
      const r = await api.getVMOwners(hostName, uuid)
      if (r.data) setOwners(Array.isArray(r.data) ? r.data : [])
    } catch {
      // 忽略所有者加载错误
    }
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
      } catch {
        // 忽略截图加载错误
      }
    }
  }, [hostName, uuid])

  const loadMonitorData = useCallback(async () => {
    if (!hostName || !uuid) return
    try {
      const response = await api.getVMMonitorData(hostName, uuid, timeRange)
      const history = response.data?.history
      if (history && Array.isArray(history)) {
        setMonitorData(processMonitorData(history, timeRange))
      }
    } catch (e) { console.error('加载监控数据失败', e) }
  }, [hostName, uuid, timeRange])

  // ── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadHostInfo(); loadVMDetail(); loadNATRules(); loadBackups(); loadMonitorData(); loadProxyRules(); loadOwners()
    const interval = setInterval(() => { loadVMDetail(true); loadScreenshot(); loadMonitorData() }, 10000)
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
    ON_OPEN: '#4460ff', ON_STOP: '#4460ff', ON_SAVE: '#4460ff', ON_WAKE: '#4460ff'
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

  const goClassicPage = () => navigate(`/hosts/${hostName}/vms/${uuid}`)

  const handleSidebarSelect = (key: string) => {
    setActiveSection(key)
    setMobileMenuOpen(false)
  }

  // ── 监控数据处理 ─────────────────────────────────────────────────────
  const processMonitorData = (statusList: any[], timeRangeMinutes: number) => {
    const data = { cpu: [], memory: [], disk: [], gpu: [], netUp: [], netDown: [], traffic: [], labels: [] } as any
    if (!statusList || statusList.length === 0) return data

    let latestTimestamp = 0
    statusList.forEach(s => { if (s.on_update && s.on_update > latestTimestamp) latestTimestamp = s.on_update })
    if (!latestTimestamp) latestTimestamp = Math.floor(Date.now() / 1000)

    const latestMinuteTimestamp = Math.floor(latestTimestamp / 60) * 60
    let sampleInterval = 1
    if (timeRangeMinutes > 60 && timeRangeMinutes <= 360) sampleInterval = 5
    else if (timeRangeMinutes > 360 && timeRangeMinutes <= 1440) sampleInterval = 10
    else if (timeRangeMinutes > 1440 && timeRangeMinutes <= 4320) sampleInterval = 30
    else if (timeRangeMinutes > 4320 && timeRangeMinutes <= 10080) sampleInterval = 60
    else if (timeRangeMinutes > 10080) sampleInterval = 120

    const totalPoints = Math.ceil(timeRangeMinutes / sampleInterval)
    const dataMap = new Map()
    statusList.forEach(s => { if (s.on_update) dataMap.set(Math.floor(s.on_update / 60) * 60, s) })

    for (let i = 0; i < totalPoints; i++) {
      const minuteOffset = (totalPoints - 1 - i) * sampleInterval
      const minuteTimestamp = latestMinuteTimestamp - minuteOffset * 60
      const status = dataMap.get(minuteTimestamp)
      const time = new Date(minuteTimestamp * 1000)
      data.labels.push(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`)

      if (status) {
        data.cpu.push(status.cpu_usage || 0)
        data.memory.push(Number((status.mem_total > 0 ? (status.mem_usage / status.mem_total * 100) : 0).toFixed(2)))
        data.disk.push(Number((status.hdd_total > 0 ? (status.hdd_usage / status.hdd_total * 100) : 0).toFixed(2)))
        data.gpu.push(status.gpu_total || 0)
        data.netUp.push(status.network_u || 0)
        data.netDown.push(status.network_d || 0)
        data.traffic.push(status.flu_usage || 0)
      } else {
        data.cpu.push(0); data.memory.push(0); data.disk.push(0)
        data.gpu.push(0); data.netUp.push(0); data.netDown.push(0); data.traffic.push(0)
      }
    }
    return data
  }

  const renderMonitorChart = (title: string, chartData: number[], labels: string[], color: string, unit: string) => (
    <MmuiCard title={title}>
      <ReactECharts
        style={{ height: 220 }}
        option={{
          tooltip: { trigger: 'axis', backgroundColor: 'var(--mmui-surface)', borderColor: 'var(--mmui-border)' },
          grid: { left: '3%', right: '4%', bottom: '3%', top: '24px', containLabel: true },
          xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { fontSize: 10, color: 'var(--mmui-text-muted)' } },
          yAxis: { type: 'value', max: unit === '%' ? 100 : undefined, axisLabel: { formatter: `{value}${unit}`, fontSize: 10, color: 'var(--mmui-text-muted)' }, splitLine: { lineStyle: { color: 'var(--mmui-divider)' } } },
          series: [{
            name: title, type: 'line', smooth: true, showSymbol: false, data: chartData,
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '60' }, { offset: 1, color: color + '08' }] } },
            lineStyle: { color, width: 2 }, itemStyle: { color }
          }]
        }}
      />
    </MmuiCard>
  )

  // ── Loading State ───────────────────────────────────────────────────
  if (loading || !vm) return (
    <div className="mmui-layout" data-mmui-theme={theme.mode}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100vh' }}>
        <Spin size="large"><div style={{ marginTop: 16, color: 'var(--mmui-text-muted)' }}>加载虚拟机详情...</div></Spin>
      </div>
    </div>
  )

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div className="mmui-layout" data-mmui-theme={theme.mode}>
      {/* 移动端遮罩 */}
      <div
        className="mmui-sidebar-overlay"
        data-visible={mobileMenuOpen || undefined}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* 侧边栏 */}
      <MmuiSidebar
        activeKey={activeSection}
        collapsed={sidebarCollapsed}
        onSelect={handleSidebarSelect}
        onCollapse={setSidebarCollapsed}
        onBack={() => navigate(-1)}
      />

      {/* 主内容区 */}
      <div className="mmui-layout__main" data-sidebar-collapsed={sidebarCollapsed || undefined}>
        {/* Header */}
        <MmuiHeader
          theme={theme}
          sidebarCollapsed={sidebarCollapsed}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          extra={
            <Button
              size="small"
              onClick={goClassicPage}
              style={{
                background: 'var(--mmui-card-action-bg)',
                borderColor: 'var(--mmui-card-action-border)',
                color: 'var(--mmui-card-action-text)',
                borderRadius: 'var(--mmui-radius-btn)',
              }}
            >
              经典版
            </Button>
          }
        />

        {/* 内容区 */}
        <div className="mmui-layout__content">
          {!hostEnabled && (
            <Alert
              message="主机已被禁用"
              description="该主机已被管理员禁用，所有操作均已被禁止。"
              type="warning" showIcon closable
              style={{ marginBottom: 16 }}
            />
          )}

          {/* ═══ 实例概览 ═══ */}
          {activeSection === 'panel' && (
            <div>
              {/* 顶部VM信息栏 - MMUI风格 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, padding: '20px 24px', borderRadius: 'var(--mmui-radius-lg)', background: 'var(--mmui-card-surface)', border: '1px solid var(--mmui-card-border)', boxShadow: 'var(--mmui-card-shadow)' }}>
                <div style={{ width: 60, height: 60, borderRadius: 12, background: 'linear-gradient(135deg, #4460ff 0%, #6b7dff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(68, 96, 255, 0.25)', flexShrink: 0 }}>
                  <DesktopOutlined style={{ fontSize: 28, color: '#fff' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--mmui-heading)', letterSpacing: '0.3px' }}>{config.vm_name || uuid}</span>
                    <Tag color={statusColor[displayStatus]} style={{ borderRadius: 4, fontSize: 12, padding: '0 8px', lineHeight: '22px' }}>{statusText[displayStatus] || displayStatus}</Tag>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--mmui-text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📍 {hostName}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>IPv4 {vm.ipv4_address || '-'}</span>
                    <CopyOutlined style={{ marginLeft: 4, cursor: 'pointer', fontSize: 12, opacity: 0.6 }} onClick={() => handleCopy(vm.ipv4_address || '', 'IP')} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <button className="mmui-page-btn mmui-page-btn--primary" onClick={handleOpenVNC}
                    disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)}
                    style={{ padding: '0 20px', minHeight: 38, borderRadius: 8, fontWeight: 500 }}>
                    <DesktopOutlined style={{ marginRight: 6 }} /> 远程
                  </button>
                  <button className="mmui-page-btn" onClick={() => handlePowerAction('reset')} disabled={displayStatus !== 'STARTED'}
                    style={{ padding: '0 16px', minHeight: 38, borderRadius: 8 }}>
                    <ReloadOutlined style={{ marginRight: 6 }} /> 重启
                  </button>
                  <button className="mmui-page-btn" onClick={() => loadVMDetail(true)} style={{ minWidth: 38, minHeight: 38, padding: 0, borderRadius: 8 }}>
                    <ReloadOutlined />
                  </button>
                  <Dropdown menu={{ items: [
                    { key: 'start', label: '启动', onClick: () => handlePowerAction('start'), disabled: displayStatus === 'STARTED' },
                    { key: 'stop', label: '关机', onClick: () => handlePowerAction('stop'), disabled: displayStatus !== 'STARTED' },
                    { key: 'hard_stop', label: '强制关机', onClick: () => handlePowerAction('hard_stop'), danger: true },
                    { key: 'hard_reset', label: '强制重启', onClick: () => handlePowerAction('hard_reset'), danger: true },
                    { key: 'reinstall', label: '重装系统', onClick: () => {
                      const os = window.prompt('输入系统镜像名称:')
                      if (!os) return
                      const pass = window.prompt('输入新密码:')
                      if (!pass) return
                      Modal.confirm({ title: '重装确认', content: '将清空系统盘数据！', okButtonProps: { danger: true }, onOk: async () => {
                        try { await api.reinstallVM(hostName!, uuid!, { os_name: os, password: pass }); message.success('重装指令已发送') } catch (e: any) { message.error(e?.message || '失败') }
                      }})
                    }, danger: true },
                  ] }}>
                    <button className="mmui-page-btn" style={{ padding: '0 14px', minHeight: 38, borderRadius: 8 }}>
                      <MoreOutlined style={{ marginRight: 4 }} /> 更多操作 <span style={{ fontSize: 10, marginLeft: 4 }}>▾</span>
                    </button>
                  </Dropdown>
                </div>
              </div>

              {/* 实例状态 + 实时资源 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
                <MmuiCard title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>实例状态 <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: statusColor[displayStatus] || '#6b7280' }} /> <span style={{ fontSize: 13, fontWeight: 400, color: statusColor[displayStatus] }}>{statusText[displayStatus]}</span> <span style={{ fontSize: 12, color: 'var(--mmui-accent-blue)', cursor: 'pointer', marginLeft: 8 }}>更改</span></span>}>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {[
                        { icon: '📍', label: '区域线路', value: `${hostName} | ${hostConfig?.server_type || ''}` },
                        { icon: '💻', label: '操作系统', value: getOSDisplayName(config.os_name || ''), extra: <span style={{ color: 'var(--mmui-accent-blue)', cursor: 'pointer', fontSize: 12, marginLeft: 8, fontWeight: 500 }}>重装</span> },
                        { icon: '⚡', label: '配置', value: `${config.cpu_num || 0}核    ${formatMem(config.mem_num || 0)}内存    ${formatMem(config.hdd_num || 0)}存储    ${config.speed_u || 0}Mbps` },
                        { icon: '🔑', label: '系统密码', value: showPassword ? config.os_pass : '••••••••••', toggle: () => setShowPassword(!showPassword), copy: config.os_pass },
                        { icon: '📅', label: '到期时间', value: expiryDate, extra: <span style={{ color: '#10b981', fontSize: 12, marginLeft: 8 }}>(还有 {daysLeft} 天到期)</span> },
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 14 }}>{item.icon}</span>
                          <span style={{ fontSize: 13, color: 'var(--mmui-text-muted)', width: 64, flexShrink: 0 }}>{item.label}</span>
                          <span style={{ fontSize: 14, color: 'var(--mmui-text)', fontWeight: 500 }}>{item.value}</span>
                          {item.extra}
                          {item.toggle && <EyeOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)', fontSize: 13 }} onClick={item.toggle} />}
                          {item.copy && <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)', fontSize: 13 }} onClick={() => handleCopy(item.copy!, '密码')} />}
                        </div>
                      ))}
                    </div>
                    <div style={{ width: 200, height: 180, borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--mmui-fill-secondary)', flexShrink: 0 }}>
                      {vmScreenshot ? <img src={vmScreenshot} alt="VM" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                        <div style={{ textAlign: 'center' }}><DesktopOutlined style={{ fontSize: 48, color: 'var(--mmui-accent-blue-soft)' }} /><div style={{ fontSize: 11, color: 'var(--mmui-text-muted)', marginTop: 10 }}>{displayStatus === 'STARTED' ? '获取截图中...' : '虚拟机未运行'}</div></div>
                      )}
                    </div>
                  </div>
                </MmuiCard>

                <MmuiCard title="实例状态" extra={<span style={{ fontSize: 12, color: 'var(--mmui-text-muted)', cursor: 'pointer' }} onClick={() => loadVMDetail(true)}>实时更新 <ReloadOutlined /></span>}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '16px 0' }}>
                    <MmuiGaugeRing percent={cpuPercent} color="#4460ff" size={96} label="CPU 占用" subLabel={`规格 ${config.cpu_num || 0} 核`} />
                    <MmuiGaugeRing percent={memPercent} color="#f59e0b" size={96} label="内存占用" subLabel={`规格 ${formatMem(config.mem_num || 0)}`} />
                    <MmuiGaugeRing percent={netLoad > 100 ? 100 : netLoad} color="#10b981" size={96} label="网络负载" subLabel={`峰值 ${config.speed_u || 0} Mbps`} />
                  </div>
                </MmuiCard>
              </div>

              {/* 远程登录 + 账号信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
                <MmuiCard title="远程登录" extra={<span style={{ fontSize: 12, color: 'var(--mmui-accent-blue)', cursor: 'pointer', fontWeight: 500 }}>查看更多方式 &gt;</span>}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <MmuiLoginCard icon={<DesktopOutlined style={{ color: '#4460ff' }} />} title="RDP" badge={{ text: '推荐', color: '#4460ff' }}
                      desc="Windows 下载 BAT，手机唤起 Remote App，其他设备下载 RDP 文件。" buttonText="下载文件" onClick={() => handleCopy(`${vm.ipv4_address}:3389`, 'RDP地址')} />
                    <MmuiLoginCard icon={<GlobalOutlined style={{ color: '#10b981' }} />} title="VNC" badge={{ text: '可用', color: '#10b981' }}
                      desc="网页 VNC，适合救援排障。" buttonText="打开 VNC" onClick={handleOpenVNC}
                      disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)} />
                  </div>
                </MmuiCard>

                <MmuiCard title="账号信息" extra={<span style={{ fontSize: 12, color: 'var(--mmui-accent-blue)', cursor: 'pointer', fontWeight: 500 }} onClick={() => message.info('登录凭据已复制')}>登录凭据 &gt;</span>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: '系统类型', value: getOSDisplayName(config.os_name || '') },
                      { label: '远程地址', value: `${vm.ipv4_address || '-'}:${natRules.find(r => r.lan_port === 3389)?.wan_port || 3389}`, copy: true },
                      { label: '系统用户', value: config.os_name?.toLowerCase().includes('windows') ? 'Administrator' : 'root', copy: true },
                      { label: '系统密码', value: config.os_pass, hidden: !showPassword, copy: true, toggle: () => setShowPassword(!showPassword) },
                      { label: '面板密码', value: config.vc_pass, hidden: !showVncPassword, copy: true, toggle: () => setShowVncPassword(!showVncPassword) },
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>{item.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 'var(--mmui-font-body)', fontFamily: 'monospace', color: 'var(--mmui-text)' }}>
                            {item.hidden !== undefined ? (item.hidden ? '••••••••••••' : item.value) : (item.value || '-')}
                          </span>
                          {item.toggle && <EyeOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }} onClick={item.toggle} />}
                          {item.copy && <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }} onClick={() => handleCopy(item.value || '', item.label)} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </MmuiCard>
              </div>
            </div>
          )}

          {/* ═══ 网卡管理 ═══ */}
          {activeSection === 'nic' && (
            <MmuiCard title="网卡管理" extra={
              <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.NIC_EDITS) || (config.nic_num !== undefined && config.nic_all && Object.keys(config.nic_all).length >= (config.nic_num || 99))}
                onClick={() => {
                  const nicName = window.prompt('网卡名称 (如 ethernet1):', `ethernet${config.nic_all ? Object.keys(config.nic_all).length : 0}`)
                  if (!nicName) return
                  const nicType = window.prompt('网卡类型 (nat/pub):', 'nat')
                  if (!nicType) return
                  const ip4 = window.prompt('IPv4地址 (留空自动分配):') || ''
                  Modal.confirm({
                    title: '添加网卡确认',
                    content: `将添加网卡 "${nicName}" (${nicType === 'pub' ? '公网' : '内网'})${ip4 ? `，IP: ${ip4}` : ''}，添加后需重启生效。`,
                    onOk: async () => {
                      try {
                        await api.addIPAddress(hostName!, uuid!, { nic_name: nicName, nic_type: nicType, ip4_addr: ip4 })
                        message.success('网卡添加成功，请重启虚拟机使其生效')
                        loadVMDetail()
                      } catch (e: any) { message.error(e?.message || '添加失败') }
                    }
                  })
                }}>添加网卡</button>
            }>
              {config.nic_all && Object.keys(config.nic_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(config.nic_all).map(([name, nic]: [string, any], i) => (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: 'var(--mmui-heading)', fontWeight: 'var(--mmui-font-weight-semibold)' }}>{name}</span>
                          <Tag color={nic.nic_type === 'pub' ? 'blue' : 'green'}>{nic.nic_type === 'pub' ? '公网' : '内网'}</Tag>
                        </div>
                        <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                          disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.NIC_EDITS)}
                          onClick={() => Modal.confirm({
                            title: '删除网卡确认',
                            content: `确定要删除网卡 "${name}" 吗？删除后需重启虚拟机才能生效。`,
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await api.deleteIPAddress(hostName!, uuid!, name)
                                message.success('网卡删除成功，请重启虚拟机使其生效')
                                loadVMDetail()
                              } catch (e: any) { message.error(e?.message || '删除失败') }
                            }
                          })}>删除</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>
                        <div>IPv4: <span style={{ color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{nic.ip4_addr || '-'}</span></div>
                        <div>IPv6: <span style={{ color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{nic.ip6_addr || '-'}</span></div>
                        <div>MAC: <span style={{ color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{nic.mac_addr || '-'}</span></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 6, fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>
                        <div>网桥: <span style={{ color: 'var(--mmui-text)' }}>{nic.nic_bridge || '-'}</span></div>
                        <div>类型: <span style={{ color: 'var(--mmui-text)' }}>{nic.nic_type || 'virtio'}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无网卡信息</div>
              )}
            </MmuiCard>
          )}

          {/* ═══ 数据磁盘 ═══ */}
          {activeSection === 'disk' && (
            <MmuiCard title="数据磁盘" extra={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--mmui-text-muted)' }}>总容量 {formatMem(config.hdd_num || 0)}</span>
                <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                  disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)}
                  onClick={() => {
                    const size = window.prompt('磁盘大小 (GB):', '20')
                    if (!size || isNaN(Number(size))) return
                    const name = window.prompt('磁盘名称 (可选):', `data_${Date.now()}`) || `data_${Date.now()}`
                    const typeStr = window.prompt('磁盘类型 (0=HDD, 1=SSD):', '0')
                    const hddType = typeStr === '1' ? 1 : 0
                    Modal.confirm({
                      title: '添加磁盘',
                      content: `确定添加 ${size}GB ${hddType === 1 ? 'SSD' : 'HDD'} 磁盘？`,
                      onOk: async () => {
                        try {
                          await api.addHDD(hostName!, uuid!, { hdd_size: Number(size) * 1024, hdd_name: name, hdd_type: hddType })
                          message.success('磁盘添加成功')
                          loadVMDetail()
                        } catch (e: any) { message.error(e?.message || '添加失败') }
                      }
                    })
                  }}>添加磁盘</button>
              </div>
            }>
              {config.hdd_all && Object.keys(config.hdd_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(config.hdd_all).map(([path, info]: [string, any], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div>
                        <div style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{path}</div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          {formatMem(info.hdd_size || 0)} · {info.hdd_type === 1 ? 'SSD' : 'HDD'}{info.hdd_flag === 1 ? ' · 系统盘' : ''}
                        </div>
                      </div>
                      {info.hdd_flag !== 1 && (
                        <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                          disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.HDD_EDITS)}
                          onClick={() => Modal.confirm({
                            title: '删除磁盘',
                            content: `确定删除磁盘 "${path}" 吗？数据将不可恢复！`,
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await api.deleteHDD(hostName!, uuid!, i)
                                message.success('磁盘删除成功，请重启虚拟机使其生效')
                                loadVMDetail()
                              } catch (e: any) { message.error(e?.message || '删除失败') }
                            }
                          })}>删除</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无磁盘信息</div>
              )}
            </MmuiCard>
          )}

          {/* ═══ 光盘镜像 ═══ */}
          {activeSection === 'iso' && (
            <MmuiCard title="光盘镜像" extra={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--mmui-text-muted)' }}>已挂载 {config.iso_all ? Object.keys(config.iso_all).length : 0}</span>
                <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                  disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.ISO_EDITS)}
                  onClick={() => {
                    const isoImages = hostConfig?.images_maps || []
                    if (Array.isArray(isoImages) && isoImages.length > 0) {
                      const isoList = isoImages.map((img: any, idx: number) => `${idx + 1}. ${img.iso_name || img.name || img}`).join('\n')
                      const choice = window.prompt(`选择要挂载的ISO镜像序号:\n${isoList}`)
                      if (!choice || isNaN(Number(choice))) return
                      const selected = isoImages[Number(choice) - 1]
                      if (!selected) { message.error('无效选择'); return }
                      const isoName = selected.iso_name || selected.name || selected
                      const isoFile = selected.iso_file || selected.file || isoName
                      Modal.confirm({
                        title: '挂载ISO',
                        content: `确定挂载 "${isoName}" 吗？`,
                        onOk: async () => {
                          try {
                            await api.addISO(hostName!, uuid!, { iso_name: isoName, iso_file: isoFile })
                            message.success('ISO挂载成功')
                            loadVMDetail()
                          } catch (e: any) { message.error(e?.message || '挂载失败') }
                        }
                      })
                    } else {
                      const isoName = window.prompt('输入ISO镜像名称:')
                      if (!isoName) return
                      const isoFile = window.prompt('输入ISO文件路径:', isoName)
                      if (!isoFile) return
                      Modal.confirm({
                        title: '挂载ISO',
                        content: `确定挂载 "${isoName}" 吗？`,
                        onOk: async () => {
                          try {
                            await api.addISO(hostName!, uuid!, { iso_name: isoName, iso_file: isoFile })
                            message.success('ISO挂载成功')
                            loadVMDetail()
                          } catch (e: any) { message.error(e?.message || '挂载失败') }
                        }
                      })
                    }
                  }}>挂载镜像</button>
              </div>
            }>
              {config.iso_all && Object.keys(config.iso_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(config.iso_all).map(([name, info]: [string, any], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div>
                        <div style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)' }}>{name}</div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          {typeof info === 'object' && info.iso_time ? new Date(info.iso_time * 1000).toLocaleString('zh-CN') : '已挂载'}
                        </div>
                      </div>
                      <button className="mmui-page-btn" style={{ minWidth: 60, minHeight: 28, fontSize: 12, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                        disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.ISO_EDITS)}
                        onClick={() => Modal.confirm({ title: '卸载ISO', content: `确定卸载 "${name}" 吗？`, okButtonProps: { danger: true }, onOk: async () => { try { await api.deleteISO(hostName!, uuid!, name); message.success('已卸载'); loadVMDetail() } catch (e: any) { message.error(e?.message || '失败') } } })}>
                        卸载
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无挂载的ISO镜像</div>
              )}
            </MmuiCard>
          )}

          {/* ═══ 端口映射 ═══ */}
          {activeSection === 'nat' && (
            <MmuiCard title="端口映射" extra={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>已用 {natRules.length} / {config.nat_num || 0}</span>
                <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                  disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.NET_EDITS)}
                  onClick={() => {
                    const protocol = window.prompt('协议 (tcp/udp):', 'tcp'); if (!protocol) return
                    const wanPort = window.prompt('外部端口:'); if (!wanPort) return
                    const lanPort = window.prompt('内部端口:', wanPort); if (!lanPort) return
                    const tips = window.prompt('备注 (可选):') || ''
                    api.addNATRule(hostName!, uuid!, { protocol, wan_port: Number(wanPort), lan_port: Number(lanPort), nat_tips: tips } as any)
                      .then(() => { message.success('添加成功'); loadNATRules() }).catch((e: any) => message.error(e?.message || '失败'))
                  }}>添加规则</button>
              </div>
            }>
              {natRules.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['协议', '外部端口', '内部端口', '备注', '操作'].map(h => (<th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--mmui-card-title)', fontSize: 'var(--mmui-text-caption-size)', fontWeight: 'var(--mmui-font-weight-semibold)', borderBottom: '1px solid var(--mmui-divider)' }}>{h}</th>))}</tr></thead>
                    <tbody>{natRules.map((rule, i) => (
                      <tr key={i}>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--mmui-divider)' }}><Tag color={rule.protocol === 'tcp' ? 'blue' : 'green'}>{rule.protocol?.toUpperCase()}</Tag></td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--mmui-text)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.wan_port}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--mmui-text)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.lan_port}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--mmui-text-muted)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.nat_tips || '-'}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--mmui-divider)' }}>
                          <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                            onClick={() => Modal.confirm({ title: '删除规则', content: `删除 ${rule.protocol}:${rule.wan_port}→${rule.lan_port}？`, okButtonProps: { danger: true }, onOk: async () => { try { await api.deleteNATRule(hostName!, uuid!, rule.id); message.success('已删除'); loadNATRules() } catch (e: any) { message.error(e?.message || '失败') } } })}>删除</button>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (<div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无端口映射规则</div>)}
            </MmuiCard>
          )}

          {/* ═══ 反向代理 ═══ */}
          {activeSection === 'proxy' && (
            <MmuiCard title="反向代理" extra={
              <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                disabled={!hostEnabled}
                onClick={() => {
                  const domain = window.prompt('域名:'); if (!domain) return
                  const port = window.prompt('内部端口:'); if (!port) return
                  api.addProxyConfig(hostName!, uuid!, { domain, port: Number(port) } as any)
                    .then(() => { message.success('添加成功'); loadProxyRules() }).catch((e: any) => message.error(e?.message || '失败'))
                }}>添加代理</button>
            }>
              {proxyRules.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {proxyRules.map((rule: any, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div>
                        <div style={{ color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{rule.domain || rule.proxy_domain}</div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>→ 端口 {rule.port || rule.proxy_port}</div>
                      </div>
                      <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                        onClick={() => Modal.confirm({ title: '删除代理', content: `删除 ${rule.domain || rule.proxy_domain}？`, okButtonProps: { danger: true }, onOk: async () => { try { await api.deleteProxyConfig(hostName!, uuid!, rule.id || rule.proxy_id); message.success('已删除'); loadProxyRules() } catch (e: any) { message.error(e?.message || '失败') } } })}>删除</button>
                    </div>
                  ))}
                </div>
              ) : (<div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无反向代理配置</div>)}
            </MmuiCard>
          )}

          {/* ═══ PCI设备 ═══ */}
          {activeSection === 'pci' && (
            <MmuiCard title="PCI设备直通" extra={
              <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                disabled={!hostEnabled || displayStatus === 'STARTED'}
                onClick={async () => {
                  try {
                    const res = await api.getPCIList(hostName!)
                    if (!res.data || Object.keys(res.data).length === 0) {
                      message.warning('当前主机无可用PCI设备'); return
                    }
                    const existingKeys = config.pci_all ? Object.keys(config.pci_all) : []
                    const available = Object.entries(res.data).filter(([k]) => !existingKeys.includes(k))
                    if (available.length === 0) { message.info('所有PCI设备已分配'); return }
                    const list = available.map(([k, v], idx) => `${idx + 1}. ${v.gpu_hint || k} (${v.gpu_uuid || k})`).join('\n')
                    const choice = window.prompt(`选择要直通的PCI设备序号:\n${list}`)
                    if (!choice || isNaN(Number(choice))) return
                    const idx = Number(choice) - 1
                    if (idx < 0 || idx >= available.length) { message.error('无效选择'); return }
                    const [pciKey, pciInfo] = available[idx]
                    const useMdev = window.confirm('是否使用vGPU模式？（取消则使用完整直通）')
                    await api.setupPCI(hostName!, uuid!, {
                      pci_key: pciKey, gpu_uuid: pciInfo.gpu_uuid, gpu_mdev: useMdev ? pciInfo.gpu_mdev || '' : '',
                      gpu_hint: pciInfo.gpu_hint, action: 'add'
                    })
                    message.success('PCI设备添加成功，请重启虚拟机使其生效')
                    loadVMDetail()
                  } catch (e: any) { message.error(e?.message || '获取PCI列表失败') }
                }}>添加设备</button>
            }>
              {displayStatus === 'STARTED' && (
                <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 'var(--mmui-radius)', background: 'rgba(255, 152, 0, 0.08)', border: '1px solid rgba(255, 152, 0, 0.2)', fontSize: 12, color: 'var(--mmui-warning)' }}>
                  ⚠️ PCI设备直通操作需要先关闭虚拟机
                </div>
              )}
              {config.pci_all && Object.keys(config.pci_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(config.pci_all).map(([key, info]: [string, any], i) => (
                    <div key={i} style={{ padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: 'var(--mmui-heading)', fontWeight: 'var(--mmui-font-weight-semibold)' }}>{info.gpu_hint || key}</div>
                          <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4, fontFamily: 'monospace' }}>UUID: {info.gpu_uuid || '-'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color={info.gpu_mdev ? 'purple' : 'blue'}>{info.gpu_mdev ? 'vGPU' : 'Passthrough'}</Tag>
                          <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                            disabled={displayStatus === 'STARTED'}
                            onClick={() => Modal.confirm({
                              title: '移除PCI设备', content: `确定移除 "${info.gpu_hint || key}" 吗？需要重启虚拟机生效。`,
                              okButtonProps: { danger: true },
                              onOk: async () => {
                                try {
                                  await api.setupPCI(hostName!, uuid!, { pci_key: key, gpu_uuid: info.gpu_uuid || '', gpu_mdev: info.gpu_mdev || '', gpu_hint: info.gpu_hint || '', action: 'remove' })
                                  message.success('PCI设备已移除，请重启虚拟机使其生效')
                                  loadVMDetail()
                                } catch (e: any) { message.error(e?.message || '移除失败') }
                              }
                            })}>移除</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (<div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无PCI设备直通</div>)}
            </MmuiCard>
          )}

          {/* ═══ USB设备 ═══ */}
          {activeSection === 'usb' && (
            <MmuiCard title="USB设备" extra={
              <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                disabled={!hostEnabled}
                onClick={async () => {
                  try {
                    const res = await api.getUSBList(hostName!)
                    if (!res.data || Object.keys(res.data).length === 0) {
                      message.warning('当前主机无可用USB设备'); return
                    }
                    const existingKeys = config.usb_all ? Object.keys(config.usb_all) : []
                    const available = Object.entries(res.data).filter(([k]) => !existingKeys.includes(k))
                    if (available.length === 0) { message.info('所有USB设备已分配'); return }
                    const list = available.map(([k, v], idx) => `${idx + 1}. ${v.usb_hint || k} (${v.vid_uuid}:${v.pid_uuid})`).join('\n')
                    const choice = window.prompt(`选择要添加的USB设备序号:\n${list}`)
                    if (!choice || isNaN(Number(choice))) return
                    const idx = Number(choice) - 1
                    if (idx < 0 || idx >= available.length) { message.error('无效选择'); return }
                    const [usbKey, usbInfo] = available[idx]
                    await api.setupUSB(hostName!, uuid!, {
                      usb_key: usbKey, vid_uuid: usbInfo.vid_uuid, pid_uuid: usbInfo.pid_uuid,
                      usb_hint: usbInfo.usb_hint, action: 'add'
                    })
                    message.success('USB设备添加成功')
                    loadVMDetail()
                  } catch (e: any) { message.error(e?.message || '获取USB列表失败') }
                }}>添加设备</button>
            }>
              {config.usb_all && Object.keys(config.usb_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(config.usb_all).map(([key, info]: [string, any], i) => (
                    <div key={i} style={{ padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: 'var(--mmui-heading)', fontWeight: 'var(--mmui-font-weight-semibold)' }}>{typeof info === 'string' ? info : (info.usb_name || info.usb_hint || key)}</div>
                          <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4, fontFamily: 'monospace' }}>设备ID: {key}{info.vid_uuid ? ` (${info.vid_uuid}:${info.pid_uuid})` : ''}</div>
                        </div>
                        <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                          onClick={() => Modal.confirm({
                            title: '移除USB设备', content: `确定移除 "${typeof info === 'string' ? info : (info.usb_name || info.usb_hint || key)}" 吗？`,
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await api.setupUSB(hostName!, uuid!, { usb_key: key, vid_uuid: info.vid_uuid || '', pid_uuid: info.pid_uuid || '', usb_hint: info.usb_hint || '', action: 'remove' })
                                message.success('USB设备已移除')
                                loadVMDetail()
                              } catch (e: any) { message.error(e?.message || '移除失败') }
                            }
                          })}>移除</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (<div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无USB设备</div>)}
            </MmuiCard>
          )}

          {/* ═══ 备份管理 ═══ */}
          {activeSection === 'backup' && (
            <MmuiCard title="备份管理" extra={
              <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                onClick={() => {
                  const tips = window.prompt('请输入备份说明：')
                  if (tips) Modal.confirm({ title: '创建备份', content: '备份可能需要数十分钟，确定继续？', onOk: async () => { try { await api.createVMBackup(hostName!, uuid!, { vm_tips: tips }); message.success('备份指令已发送'); loadBackups() } catch (e: any) { message.error(e?.message || '失败') } } })
                }}>创建备份</button>
            }>
              {backups.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {backups.map((backup, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div>
                        <div style={{ color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{backup.backup_name}</div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          {backup.backup_hint && <span>{backup.backup_hint} · </span>}
                          {backup.backup_time ? new Date(backup.backup_time * 1000).toLocaleString('zh-CN') : backup.created_time}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11 }}
                          onClick={() => Modal.confirm({ title: '恢复备份', content: '将覆盖当前数据！', okButtonProps: { danger: true }, onOk: async () => { try { await api.restoreVMBackup(hostName!, uuid!, backup.backup_name); message.success('恢复指令已发送'); setTimeout(() => window.location.reload(), 3000) } catch (e: any) { message.error(e?.message || '失败') } } })}>恢复</button>
                        <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                          onClick={() => Modal.confirm({ title: '删除备份', content: '不可恢复！', okButtonProps: { danger: true }, onOk: async () => { try { await api.deleteVMBackup(hostName!, uuid!, backup.backup_name); message.success('已删除'); loadBackups() } catch (e: any) { message.error(e?.message || '失败') } } })}>删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (<div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无备份</div>)}
            </MmuiCard>
          )}

          {/* ═══ 启动顺序 ═══ */}
          {activeSection === 'boot' && (
            <MmuiCard title="启动顺序" extra={
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="mmui-page-btn" style={{ minHeight: 28, fontSize: 12 }}
                  onClick={async () => {
                    try {
                      const r = await api.getEFIList(hostName!, uuid!)
                      if (r.data && Array.isArray(r.data)) {
                        setVM((prev: any) => ({ ...prev, efi_list: r.data }))
                        message.success('已刷新启动项列表')
                      }
                    } catch (e: any) { message.error(e?.message || '获取启动项失败') }
                  }}>
                  <ReloadOutlined /> 刷新
                </button>
                <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                  disabled={!hostEnabled || !vm?.efi_list || vm.efi_list.length === 0}
                  onClick={async () => {
                    try {
                      await api.setupEFI(hostName!, uuid!, vm.efi_list)
                      message.success('启动顺序已保存')
                    } catch (e: any) { message.error(e?.message || '保存失败') }
                  }}>
                  保存顺序
                </button>
              </div>
            }>
              {vm?.efi_list && vm.efi_list.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--mmui-text-muted)', margin: '0 0 8px 0' }}>
                    拖动或使用箭头按钮调整启动顺序，调整后点击"保存顺序"生效。
                  </p>
                  {vm.efi_list.map((item: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? 'var(--mmui-accent-blue)' : 'var(--mmui-text-muted)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--mmui-heading)', fontWeight: 500 }}>{item.efi_name || `启动项 ${i + 1}`}</div>
                        <div style={{ fontSize: 11, color: 'var(--mmui-text-muted)', marginTop: 2 }}>{item.efi_type ? 'UEFI' : 'Legacy'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="mmui-page-btn" style={{ minWidth: 32, minHeight: 28, padding: 0, fontSize: 12 }}
                          disabled={i === 0}
                          onClick={() => {
                            const list = [...vm.efi_list]
                            ;[list[i - 1], list[i]] = [list[i], list[i - 1]]
                            setVM((prev: any) => ({ ...prev, efi_list: list }))
                          }}>↑</button>
                        <button className="mmui-page-btn" style={{ minWidth: 32, minHeight: 28, padding: 0, fontSize: 12 }}
                          disabled={i === vm.efi_list.length - 1}
                          onClick={() => {
                            const list = [...vm.efi_list]
                            ;[list[i], list[i + 1]] = [list[i + 1], list[i]]
                            setVM((prev: any) => ({ ...prev, efi_list: list }))
                          }}>↓</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : config.efi_all && Object.keys(config.efi_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--mmui-text-muted)', margin: '0 0 8px 0' }}>
                    以下为配置中的启动项，点击"刷新"获取实时启动项列表以进行排序。
                  </p>
                  {Object.entries(config.efi_all).map(([key, info]: [string, any], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? 'var(--mmui-accent-blue)' : 'var(--mmui-text-muted)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                      <div>
                        <div style={{ color: 'var(--mmui-heading)' }}>{typeof info === 'string' ? info : (info.boot_name || key)}</div>
                        <div style={{ fontSize: 11, color: 'var(--mmui-text-muted)' }}>{key}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--mmui-accent-blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>1</span>
                    <span style={{ color: 'var(--mmui-heading)' }}>硬盘启动 (默认)</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--mmui-text-muted)', margin: 0 }}>当前使用默认启动顺序，点击"刷新"获取可调整的启动项列表。</p>
                </div>
              )}
            </MmuiCard>
          )}

          {/* ═══ 用户权限 ═══ */}
          {activeSection === 'permission' && (
            <MmuiCard title="用户权限" extra={
              <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                disabled={!hostEnabled}
                onClick={() => {
                  const username = window.prompt('输入要添加的用户名:')
                  if (username) api.addVMOwner(hostName!, uuid!, { username } as any)
                    .then(() => { message.success('用户添加成功'); loadOwners() }).catch((e: any) => message.error(e?.message || '失败'))
                }}>添加用户</button>
            }>
              {owners.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {owners.map((owner: any, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--mmui-radius)', border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)' }}>
                      <div>
                        <div style={{ color: 'var(--mmui-heading)', fontWeight: 'var(--mmui-font-weight-semibold)' }}>{owner.username}</div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          权限: {owner.is_admin ? '管理员' : `${owner.permission || 0}`}
                        </div>
                      </div>
                      {!owner.is_admin && (
                        <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                          onClick={() => Modal.confirm({ title: '移除用户', content: `移除 ${owner.username}？`, okButtonProps: { danger: true }, onOk: async () => { try { await api.deleteVMOwner(hostName!, uuid!, owner.username); message.success('已移除'); loadOwners() } catch (e: any) { message.error(e?.message || '失败') } } })}>移除</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (<div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>暂无分享用户</div>)}
            </MmuiCard>
          )}

          {/* 监控视图 */}
          {activeSection === 'monitor' && (
            <div>
              {/* 时间范围选择 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[{ label: '30分钟', value: 30 }, { label: '1小时', value: 60 }, { label: '6小时', value: 360 },
                  { label: '24小时', value: 1440 }, { label: '3天', value: 4320 }, { label: '7天', value: 10080 }].map(item => (
                  <button key={item.value}
                    className={`mmui-page-btn ${timeRange === item.value ? 'mmui-page-btn--primary' : ''}`}
                    style={{ minWidth: 'auto', padding: '0 12px', minHeight: 32 }}
                    onClick={() => { setTimeRange(item.value); }}
                  >{item.label}</button>
                ))}
              </div>
              {/* 图表网格 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {renderMonitorChart('CPU 使用率', monitorData.cpu, monitorData.labels, '#4460ff', '%')}
                {renderMonitorChart('内存使用率', monitorData.memory, monitorData.labels, '#f59e0b', '%')}
                {renderMonitorChart('上行带宽', monitorData.netUp, monitorData.labels, '#10b981', 'Mbps')}
                {renderMonitorChart('下行带宽', monitorData.netDown, monitorData.labels, '#8b5cf6', 'Mbps')}
                {renderMonitorChart('磁盘使用率', monitorData.disk, monitorData.labels, '#ef4444', '%')}
                {renderMonitorChart('GPU 使用率', monitorData.gpu, monitorData.labels, '#06b6d4', '%')}
              </div>
            </div>
          )}

          {/* 系统信息视图 */}
          {activeSection === 'system' && (
            <MmuiCard title="系统信息">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'UUID', value: uuid },
                    { label: '主机节点', value: hostName },
                    { label: '虚拟化类型', value: hostConfig?.server_type || 'KVM' },
                    { label: '操作系统', value: getOSDisplayName(config.os_name || '') },
                    { label: 'CPU 核心', value: `${config.cpu_num || 0} 核` },
                    { label: '内存大小', value: formatMem(config.mem_num || 0) },
                    { label: '磁盘大小', value: formatMem(config.hdd_num || 0) },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', width: 80, flexShrink: 0 }}>{item.label}</span>
                      <span style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{item.value || '-'}</span>
                      <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)', fontSize: 12 }}
                        onClick={() => handleCopy(String(item.value || ''), item.label)} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: '上行带宽', value: `${config.speed_u || 0} Mbps` },
                    { label: '下行带宽', value: `${config.speed_d || 0} Mbps` },
                    { label: 'NAT 配额', value: `${config.nat_all ? Object.keys(config.nat_all).length : 0} / ${config.nat_num || 0}` },
                    { label: '到期时间', value: expiryDate },
                    { label: '剩余天数', value: daysLeft === 999 ? '永不过期' : `${daysLeft} 天` },
                    { label: 'IPv4 地址', value: vm.ipv4_address || '未分配' },
                    { label: '当前状态', value: statusText[displayStatus] || displayStatus },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', width: 80, flexShrink: 0 }}>{item.label}</span>
                      <span style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)' }}>{item.value || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </MmuiCard>
          )}

          {/* 系统管理视图 */}
          {activeSection === 'sysadmin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 电源操作 */}
              <MmuiCard title="电源操作">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <button className="mmui-page-btn mmui-page-btn--primary" onClick={() => handlePowerAction('start')}
                    disabled={displayStatus === 'STARTED'}>
                    <PlayCircleOutlined /> 启动
                  </button>
                  <button className="mmui-page-btn" onClick={() => handlePowerAction('stop')}
                    disabled={displayStatus !== 'STARTED'}>
                    <PoweroffOutlined /> 关机
                  </button>
                  <button className="mmui-page-btn" onClick={() => handlePowerAction('reset')}
                    disabled={displayStatus !== 'STARTED'}>
                    <ReloadOutlined /> 重启
                  </button>
                  <button className="mmui-page-btn" onClick={() => handlePowerAction('pause')}
                    disabled={displayStatus !== 'STARTED'}>
                    <PauseCircleOutlined /> 暂停
                  </button>
                  <button className="mmui-page-btn" onClick={() => handlePowerAction('resume')}
                    disabled={displayStatus !== 'SUSPEND'}>
                    <PlayCircleOutlined /> 恢复
                  </button>
                  <button className="mmui-page-btn" style={{ borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                    onClick={() => handlePowerAction('hard_stop')}>
                    <PoweroffOutlined /> 强制关机
                  </button>
                  <button className="mmui-page-btn" style={{ borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                    onClick={() => handlePowerAction('hard_reset')}>
                    <ReloadOutlined /> 强制重启
                  </button>
                </div>
              </MmuiCard>

              {/* 重装系统 */}
              <MmuiCard title="重装系统">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', margin: 0 }}>
                    重装系统将清空系统盘数据，请确保已备份重要数据。
                  </p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <select className="mmui-page-field" style={{ width: 240 }}
                      value={reinstallOS} onChange={e => setReinstallOS(e.target.value)}>
                      <option value="">选择操作系统...</option>
                      {hostConfig?.system_maps && (Array.isArray(hostConfig.system_maps) ? hostConfig.system_maps
                        : Object.entries(hostConfig.system_maps as any).map(([name, val]: [string, any]) =>
                          Array.isArray(val) ? { sys_name: name, sys_file: val[0] } :
                            (val && typeof val === 'object' ? { sys_name: name, ...val } : { sys_name: name, sys_file: val }))
                      ).filter((it: any) => it?.sys_flag !== false).map((it: any) => (
                        <option key={it.sys_file} value={it.sys_file}>{it.sys_name || it.sys_file}</option>
                      ))}
                    </select>
                    <input className="mmui-page-field" style={{ width: 200 }} type="password"
                      placeholder="新系统密码" value={reinstallPass} onChange={e => setReinstallPass(e.target.value)} />
                    <button className="mmui-page-btn" style={{ borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                      disabled={!reinstallOS || !reinstallPass || !hostEnabled}
                      onClick={() => {
                        Modal.confirm({
                          title: '重装系统确认', content: '此操作将清空系统盘数据，确定继续？',
                          okText: '确认重装', cancelText: '取消', okButtonProps: { danger: true },
                          onOk: async () => {
                            try {
                              await api.reinstallVM(hostName!, uuid!, { os_name: reinstallOS, password: reinstallPass })
                              message.success('重装指令已发送')
                              setReinstallOS(''); setReinstallPass('')
                            } catch (e: any) { message.error(e?.message || '重装失败') }
                          }
                        })
                      }}>
                      重装系统
                    </button>
                  </div>
                </div>
              </MmuiCard>
            </div>
          )}

          {/* VNC 远程控制台 */}
          {activeSection === 'vnc' && (
            <MmuiCard title="远程控制台">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '24px 0' }}>
                <DesktopOutlined style={{ fontSize: 64, color: 'var(--mmui-accent-blue-soft)' }} />
                <p style={{ color: 'var(--mmui-text-soft)', margin: 0 }}>点击下方按钮打开远程控制台窗口</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="mmui-page-btn mmui-page-btn--primary" onClick={handleOpenVNC}
                    disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)}>
                    <DesktopOutlined /> 打开 VNC 控制台
                  </button>
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 400 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mmui-text-muted)', fontSize: 'var(--mmui-text-caption-size)' }}>VNC 密码</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--mmui-text)' }}>
                        {showVncPassword ? config.vc_pass : '••••••••'}
                      </span>
                      <EyeOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }}
                        onClick={() => setShowVncPassword(!showVncPassword)} />
                      <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }}
                        onClick={() => handleCopy(config.vc_pass || '', 'VNC密码')} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mmui-text-muted)', fontSize: 'var(--mmui-text-caption-size)' }}>远程地址</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--mmui-text)' }}>{vm.ipv4_address || '-'}:3389</span>
                      <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }}
                        onClick={() => handleCopy(`${vm.ipv4_address}:3389`, '远程地址')} />
                    </div>
                  </div>
                </div>
              </div>
            </MmuiCard>
          )}

          {/* 数据（磁盘管理） */}
          {activeSection === 'data' && (
            <MmuiCard title="磁盘管理" extra={
              <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>
                总容量 {formatMem(config.hdd_num || 0)}
              </span>
            }>
              {config.hdd_all && Object.keys(config.hdd_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(config.hdd_all).map(([path, info]: [string, any], i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: 'var(--mmui-radius)',
                      border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)'
                    }}>
                      <div>
                        <div style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{path}</div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          {formatMem(info.hdd_size || 0)} · {info.hdd_type === 1 ? 'SSD' : 'HDD'}
                          {info.hdd_flag === 1 && ' · 系统盘'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                  <DatabaseOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                  暂无磁盘信息
                </div>
              )}
            </MmuiCard>
          )}

          {/* 快照视图 */}
          {activeSection === 'snapshot' && (
            <MmuiCard title="快照管理" extra={
              <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>
                已用 {config.iso_all ? Object.keys(config.iso_all).length : 0} / {config.iso_num || 3}
              </span>
            }>
              {config.iso_all && Object.keys(config.iso_all).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(config.iso_all).map(([name, info]: [string, any], i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: 'var(--mmui-radius)',
                      border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)'
                    }}>
                      <div>
                        <div style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)' }}>{name}</div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          {typeof info === 'object' ? (info.iso_time ? new Date(info.iso_time * 1000).toLocaleString('zh-CN') : '') : ''}
                        </div>
                      </div>
                      <button className="mmui-page-btn" style={{ minWidth: 60, minHeight: 28, fontSize: 12, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                        onClick={() => {
                          Modal.confirm({
                            title: '删除快照', content: `确定删除快照 "${name}" 吗？`,
                            okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await api.deleteISO(hostName!, uuid!, name)
                                message.success('快照已删除'); loadVMDetail()
                              } catch (e: any) { message.error(e?.message || '删除失败') }
                            }
                          })
                        }}>删除</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                  <CameraOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                  暂无快照
                </div>
              )}
            </MmuiCard>
          )}

          {/* 备份视图 */}
          {activeSection === 'backup' && (
            <MmuiCard title="备份管理" extra={
              <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 30, fontSize: 12 }}
                disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                onClick={() => {
                  const tips = window.prompt('请输入备份说明：')
                  if (tips) {
                    Modal.confirm({
                      title: '创建备份', content: '备份可能需要数十分钟，确定继续？',
                      okText: '确认', cancelText: '取消',
                      onOk: async () => {
                        try {
                          await api.createVMBackup(hostName!, uuid!, { vm_tips: tips })
                          message.success('备份创建指令已发送'); loadBackups()
                        } catch (e: any) { message.error(e?.message || '创建失败') }
                      }
                    })
                  }
                }}>创建备份</button>
            }>
              {backups.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {backups.map((backup, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: 'var(--mmui-radius)',
                      border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)'
                    }}>
                      <div>
                        <div style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)', fontFamily: 'monospace' }}>
                          {backup.backup_name}
                        </div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          {backup.backup_hint && <span>{backup.backup_hint} · </span>}
                          {backup.backup_time ? new Date(backup.backup_time * 1000).toLocaleString('zh-CN') : backup.created_time}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="mmui-page-btn" style={{ minWidth: 60, minHeight: 28, fontSize: 12 }}
                          disabled={!hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                          onClick={() => {
                            Modal.confirm({
                              title: '恢复备份', content: '此操作将覆盖当前数据，确定继续？',
                              okText: '确认恢复', cancelText: '取消', okButtonProps: { danger: true },
                              onOk: async () => {
                                try {
                                  await api.restoreVMBackup(hostName!, uuid!, backup.backup_name)
                                  message.success('恢复指令已发送')
                                  setTimeout(() => window.location.reload(), 3000)
                                } catch (e: any) { message.error(e?.message || '恢复失败') }
                              }
                            })
                          }}>恢复</button>
                        <button className="mmui-page-btn" style={{ minWidth: 60, minHeight: 28, fontSize: 12, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                          disabled={!hasPermission(userPermissions, VM_PERMISSION.VM_BACKUP)}
                          onClick={() => {
                            Modal.confirm({
                              title: '删除备份', content: '确定删除此备份？此操作不可恢复！',
                              okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
                              onOk: async () => {
                                try {
                                  await api.deleteVMBackup(hostName!, uuid!, backup.backup_name)
                                  message.success('备份已删除'); loadBackups()
                                } catch (e: any) { message.error(e?.message || '删除失败') }
                              }
                            })
                          }}>删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                  <DatabaseOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                  暂无备份
                </div>
              )}
            </MmuiCard>
          )}

          {/* 网络视图 */}
          {activeSection === 'network' && (
            <MmuiCard title="网络信息">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'IPv4 地址', value: vm.ipv4_address || '未分配', copy: true },
                  { label: 'IPv6 地址', value: vm.ipv6_address || '未分配', copy: true },
                  { label: '公网地址', value: vm.public_address || '未分配', copy: true },
                  { label: '上行带宽', value: `${config.speed_u || 0} Mbps` },
                  { label: '下行带宽', value: `${config.speed_d || 0} Mbps` },
                  { label: '流量限制', value: config.flu_num ? `${config.flu_num} GB` : '无限制' },
                  { label: '已用流量', value: currentStatus.flu_usage ? `${currentStatus.flu_usage.toFixed(2)} GB` : '0 GB' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', width: 80, flexShrink: 0 }}>{item.label}</span>
                    <span style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{item.value}</span>
                    {item.copy && (
                      <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }}
                        onClick={() => handleCopy(String(item.value), item.label)} />
                    )}
                  </div>
                ))}
                {/* 网卡列表 */}
                {config.nic_all && Object.keys(config.nic_all).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-card-title)', marginBottom: 8, fontWeight: 'var(--mmui-font-weight-semibold)' }}>网卡列表</div>
                    {Object.entries(config.nic_all).map(([name, nic]: [string, any], i) => (
                      <div key={i} style={{
                        padding: '10px 14px', borderRadius: 'var(--mmui-radius)',
                        border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)', marginBottom: 8
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--mmui-text)', fontFamily: 'monospace' }}>{name}</span>
                          <span style={{ color: 'var(--mmui-text-muted)', fontSize: 'var(--mmui-text-caption-size)' }}>{nic.nic_type || 'virtio'}</span>
                        </div>
                        <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                          IP: {nic.ip4_addr || '-'} · MAC: {nic.mac_addr || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </MmuiCard>
          )}

          {/* 端口映射视图 */}
          {activeSection === 'nat' && (
            <MmuiCard title="端口映射" extra={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>
                  已用 {natRules.length} / {config.nat_num || 0}
                </span>
                <button className="mmui-page-btn mmui-page-btn--primary" style={{ minHeight: 28, fontSize: 12 }}
                  disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.NET_EDITS)}
                  onClick={() => {
                    const protocol = window.prompt('协议 (tcp/udp):', 'tcp')
                    if (!protocol) return
                    const wanPort = window.prompt('外部端口:')
                    if (!wanPort) return
                    const lanPort = window.prompt('内部端口:', wanPort)
                    if (!lanPort) return
                    const tips = window.prompt('备注 (可选):') || ''
                    api.addNATRule(hostName!, uuid!, { protocol, wan_port: Number(wanPort), lan_port: Number(lanPort), nat_tips: tips } as any)
                      .then(() => { message.success('规则添加成功'); loadNATRules() })
                      .catch((e: any) => message.error(e?.message || '添加失败'))
                  }}>添加规则</button>
              </div>
            }>
              {natRules.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['协议', '外部端口', '内部端口', '备注', '操作'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--mmui-card-title)', fontSize: 'var(--mmui-text-caption-size)', fontWeight: 'var(--mmui-font-weight-semibold)', borderBottom: '1px solid var(--mmui-divider)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {natRules.map((rule, i) => (
                        <tr key={i}>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text)', borderBottom: '1px solid var(--mmui-divider)' }}>
                            <Tag color={rule.protocol === 'tcp' ? 'blue' : 'green'}>{rule.protocol?.toUpperCase()}</Tag>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text)', fontFamily: 'monospace', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.wan_port}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text)', fontFamily: 'monospace', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.lan_port}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text-muted)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.nat_tips || '-'}</td>
                          <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--mmui-divider)' }}>
                            <button className="mmui-page-btn" style={{ minWidth: 50, minHeight: 26, fontSize: 11, borderColor: 'var(--mmui-error)', color: 'var(--mmui-error)' }}
                              disabled={!hasPermission(userPermissions, VM_PERMISSION.NET_EDITS)}
                              onClick={() => {
                                Modal.confirm({
                                  title: '删除规则', content: `确定删除 ${rule.protocol}:${rule.wan_port} → ${rule.lan_port} 吗？`,
                                  okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
                                  onOk: async () => {
                                    try {
                                      await api.deleteNATRule(hostName!, uuid!, rule.id)
                                      message.success('规则已删除'); loadNATRules()
                                    } catch (e: any) { message.error(e?.message || '删除失败') }
                                  }
                                })
                              }}>删除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                  <SwapOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                  暂无端口映射规则
                </div>
              )}
            </MmuiCard>
          )}

          {/* 策略视图 */}
          {activeSection === 'policy' && (
            <MmuiCard title="安全策略">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {config.pci_all && Object.keys(config.pci_all).length > 0 ? (
                  Object.entries(config.pci_all).map(([key, info]: [string, any], i) => (
                    <div key={i} style={{
                      padding: '12px 16px', borderRadius: 'var(--mmui-radius)',
                      border: '1px solid var(--mmui-divider)', background: 'var(--mmui-fill-secondary)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)' }}>{key}</div>
                          <div style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', marginTop: 4 }}>
                            {info.gpu_hint || info.gpu_uuid || '设备直通'}
                          </div>
                        </div>
                        <Tag color="blue">{info.gpu_mdev ? 'vGPU' : 'Passthrough'}</Tag>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                    <SafetyCertificateOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                    暂无安全策略配置
                  </div>
                )}
              </div>
            </MmuiCard>
          )}
        </div>
      </div>
    </div>
  )
}
