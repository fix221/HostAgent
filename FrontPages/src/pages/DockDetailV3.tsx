import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, message, Modal, Tag, Dropdown, Alert, Spin, Tooltip
} from 'antd'
import type { MenuProps } from 'antd'
import {
  ReloadOutlined, PoweroffOutlined, DesktopOutlined, EyeOutlined, CopyOutlined,
  PlayCircleOutlined, PauseCircleOutlined, MoreOutlined, SwapOutlined,
  CameraOutlined, DatabaseOutlined, SafetyCertificateOutlined, GlobalOutlined,
  SettingOutlined, ThunderboltOutlined
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { useMmuiTheme } from '@/hooks/useMmuiTheme'
import MmuiSidebar, { defaultSidebarItems } from '@/components/mmui/MmuiSidebar'
import MmuiHeader from '@/components/mmui/MmuiHeader'
import MmuiCard, { MmuiGaugeRing, MmuiStatCard, MmuiLoginCard } from '@/components/mmui/MmuiCard'
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

const formatSpeed = (mbps: number) => {
  if (!mbps) return '0 KBps'
  if (mbps < 1) return `${(mbps * 1024).toFixed(0)} KBps`
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  return `${mbps.toFixed(0)} Mbps`
}

// ═════════════════════════════════════════════════════════════════════════
// Main Component - MMUI 风格虚拟机详情页
// ═════════════════════════════════════════════════════════════════════════
export default function DockDetailV3() {
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
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [vmScreenshot, setVmScreenshot] = useState('')
  const [tempStatus, setTempStatus] = useState<string | null>(null)
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
    loadHostInfo(); loadVMDetail(); loadNATRules(); loadBackups(); loadMonitorData()
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

  const goClassicPage = () => navigate(`/hosts/${hostName}/vms/${uuid}/v2`)

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
          title={config.vm_uuid || uuid}
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

          {/* 面板视图 */}
          {activeSection === 'panel' && (
            <div className="mmui-panel-grid">
              {/* 实例状态 + 实时资源 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* 实例状态 */}
                <MmuiCard title={
                  <span>
                    实例状态 &nbsp;
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: statusColor[displayStatus] || '#6b7280' }} />
                    <span style={{ fontSize: 'var(--mmui-text-caption-size)', marginLeft: 6, color: statusColor[displayStatus] }}>
                      {statusText[displayStatus] || displayStatus}
                    </span>
                  </span>
                }>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: '区域线路', value: `${hostName} | ${hostConfig?.server_type || 'CUVIP 优化'}` },
                        { label: '操作系统', value: getOSDisplayName(config.os_name || '') },
                        { label: '配置', value: `${config.cpu_num || 0}核 / ${formatMem(config.mem_num || 0)} / ${formatMem(config.hdd_num || 0)} / ${config.speed_u || 0}Mbps` },
                        { label: '系统密码', value: hasPermission(userPermissions, VM_PERMISSION.PWD_EDITS) ? (showPassword ? config.os_pass : '••••••••••') : '无权限', toggle: hasPermission(userPermissions, VM_PERMISSION.PWD_EDITS) ? () => setShowPassword(!showPassword) : undefined },
                        { label: '到期时间', value: `${expiryDate} (还有 ${daysLeft} 天)` },
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', width: 64, flexShrink: 0 }}>{item.label}</span>
                          <span style={{ fontSize: 'var(--mmui-font-body)', color: 'var(--mmui-text)' }}>{item.value}</span>
                          {item.toggle && (
                            <EyeOutlined
                              style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }}
                              onClick={item.toggle}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {/* 截图 */}
                    <div style={{
                      width: 200, height: 160, borderRadius: 'var(--mmui-radius)',
                      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--mmui-fill-secondary)', border: '1px solid var(--mmui-card-border)'
                    }}>
                      {vmScreenshot ? (
                        <img src={vmScreenshot} alt="VM" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <DesktopOutlined style={{ fontSize: 40, color: 'var(--mmui-accent-blue-soft)' }} />
                          <div style={{ fontSize: 10, color: 'var(--mmui-text-muted)', marginTop: 8 }}>
                            {displayStatus === 'STARTED' ? '获取截图中...' : '虚拟机未运行'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </MmuiCard>

                {/* 实时资源 */}
                <MmuiCard title="实时资源" extra={
                  <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', cursor: 'pointer' }}
                    onClick={() => loadVMDetail(true)}>
                    实时更新 <ReloadOutlined />
                  </span>
                }>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8 }}>
                    <MmuiGaugeRing percent={cpuPercent} color="#4460ff" size={90}
                      label="CPU 占用" subLabel={`规格 ${config.cpu_num || 0} 核`} />
                    <MmuiGaugeRing percent={memPercent} color="#f59e0b" size={90}
                      label="内存占用" subLabel={`规格 ${formatMem(config.mem_num || 0)}`} />
                    <MmuiGaugeRing percent={netLoad > 100 ? 100 : netLoad} color="#10b981" size={90}
                      label="网络负载" subLabel={`峰值 ${formatSpeed(netLoad)}`} />
                  </div>
                </MmuiCard>
              </div>

              {/* 远程登录 + 账户信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
                <MmuiCard title="远程登录" extra={
                  <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-accent-blue)', cursor: 'pointer' }}>
                    查看更多方式 &gt;
                  </span>
                }>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <MmuiLoginCard icon={<DesktopOutlined style={{ color: '#4460ff' }} />}
                      title="网页登录" badge={{ text: '推荐', color: '#4460ff' }}
                      desc="通过网页直达远程控制台，无需本地客户端。"
                      buttonText="登录" onClick={handleOpenVNC}
                      disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)} />
                    <MmuiLoginCard icon={<DesktopOutlined style={{ color: '#8b5cf6' }} />}
                      title="本地 RDP"
                      desc="下载 RDP 文件并打开以直接登录。"
                      buttonText="登录" onClick={() => handleCopy(`${vm.ipv4_address}:3389`, 'RDP地址')} />
                    <MmuiLoginCard icon={<GlobalOutlined style={{ color: '#10b981' }} />}
                      title="Web VNC" badge={{ text: '可用', color: '#10b981' }}
                      desc="使用 Web VNC 登录，适合故障排查。"
                      buttonText="登录" onClick={handleOpenVNC}
                      disabled={!hostEnabled || !hasPermission(userPermissions, VM_PERMISSION.VNC_EDITS)} />
                  </div>
                </MmuiCard>

                {/* 账户信息 */}
                <MmuiCard title="账户信息" extra={
                  <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-accent-blue)', cursor: 'pointer' }}
                    onClick={() => message.info('登录凭据已复制')}>登录凭据</span>
                }>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: '系统类型', value: getOSDisplayName(config.os_name || '') },
                      { label: '远程地址', value: `${vm.ipv4_address || '-'}:3389`, copy: true },
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
                          {item.toggle && (
                            <EyeOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }} onClick={item.toggle} />
                          )}
                          {item.copy && (
                            <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }}
                              onClick={() => handleCopy(item.value || '', item.label)} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </MmuiCard>
              </div>

              {/* 快捷统计 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <MmuiStatCard icon={<SwapOutlined />} title="端口映射" color="#4460ff"
                  count={config.nat_all ? Object.keys(config.nat_all).length : 0}
                  total={config.nat_num || 0}
                  onClick={() => setActiveSection('nat')} />
                <MmuiStatCard icon={<CameraOutlined />} title="快照" color="#8b5cf6"
                  count={config.iso_all ? Object.keys(config.iso_all).length : 0}
                  total={config.iso_num || 3}
                  onClick={() => setActiveSection('snapshot')} />
                <MmuiStatCard icon={<DatabaseOutlined />} title="备份" color="#f59e0b"
                  count={backups.length}
                  total={config.bak_num || 5}
                  onClick={() => setActiveSection('backup')} />
                <MmuiStatCard icon={<SafetyCertificateOutlined />} title="安全策略" color="#10b981"
                  count={config.pci_all ? Object.keys(config.pci_all).length : 0}
                  total={4}
                  onClick={() => setActiveSection('policy')} />
              </div>
            </div>
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

          {/* 系统管理视图 */}
          {activeSection === 'sysadmin' && (
            <MmuiCard title="系统管理">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                <button className="mmui-page-btn" onClick={() => handlePowerAction('start')}
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
                <button className="mmui-page-btn" onClick={() => handlePowerAction('hard_stop')}>
                  <PoweroffOutlined /> 强制关机
                </button>
                <button className="mmui-page-btn" onClick={() => handlePowerAction('hard_reset')}>
                  <ReloadOutlined /> 强制重启
                </button>
              </div>
            </MmuiCard>
          )}

          {/* 快照视图 */}
          {activeSection === 'snapshot' && (
            <MmuiCard title="快照管理">
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                <CameraOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                快照管理开发中...
              </div>
            </MmuiCard>
          )}

          {/* 备份视图 */}
          {activeSection === 'backup' && (
            <MmuiCard title="备份管理">
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                <DatabaseOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                备份管理开发中...
              </div>
            </MmuiCard>
          )}

          {/* 网络视图 */}
          {activeSection === 'network' && (
            <MmuiCard title="网络信息">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', width: 80 }}>IPv4 地址</span>
                  <span style={{ color: 'var(--mmui-text)' }}>{vm.ipv4_address || '未分配'}</span>
                  <CopyOutlined style={{ cursor: 'pointer', color: 'var(--mmui-text-muted)' }}
                    onClick={() => handleCopy(vm.ipv4_address || '', 'IPv4')} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', width: 80 }}>上行带宽</span>
                  <span style={{ color: 'var(--mmui-text)' }}>{config.speed_u || 0} Mbps</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)', width: 80 }}>下行带宽</span>
                  <span style={{ color: 'var(--mmui-text)' }}>{config.speed_d || 0} Mbps</span>
                </div>
              </div>
            </MmuiCard>
          )}

          {/* 端口映射视图 */}
          {activeSection === 'nat' && (
            <MmuiCard title="端口映射" extra={
              <span style={{ fontSize: 'var(--mmui-text-caption-size)', color: 'var(--mmui-text-muted)' }}>
                已用 {config.nat_all ? Object.keys(config.nat_all).length : 0} / {config.nat_num || 0}
              </span>
            }>
              {natRules.length > 0 ? (
                <div className="mmui-subpage-table-wrap">
                  <table className="mmui-subpage-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--mmui-card-title)', borderBottom: '1px solid var(--mmui-divider)' }}>协议</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--mmui-card-title)', borderBottom: '1px solid var(--mmui-divider)' }}>外部端口</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--mmui-card-title)', borderBottom: '1px solid var(--mmui-divider)' }}>内部端口</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--mmui-card-title)', borderBottom: '1px solid var(--mmui-divider)' }}>备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {natRules.map((rule, i) => (
                        <tr key={i}>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.protocol}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.wan_port}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.lan_port}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--mmui-text-muted)', borderBottom: '1px solid var(--mmui-divider)' }}>{rule.nat_tips || '-'}</td>
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

          {/* 其他未实现的视图 */}
          {!['panel', 'monitor', 'sysadmin', 'snapshot', 'backup', 'network', 'nat'].includes(activeSection) && (
            <MmuiCard title={defaultSidebarItems.find(i => i.key === activeSection)?.label || activeSection}>
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--mmui-text-muted)' }}>
                <SettingOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                该功能正在开发中...
              </div>
            </MmuiCard>
          )}
        </div>
      </div>
    </div>
  )
}
