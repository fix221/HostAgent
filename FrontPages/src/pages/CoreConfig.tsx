import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Switch, message, InputNumber, Checkbox, Alert, Tooltip } from 'antd'
import { EyeOutlined, EyeInvisibleOutlined, CopyOutlined, ReloadOutlined, SaveOutlined, FolderOpenOutlined, MailOutlined, SettingOutlined, SafetyCertificateOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { VM_PERMISSION, VM_PERMISSION_LABELS, PERMISSION_FIELD_MASK, hasPermission } from '@/types'
import api from '@/utils/apis.ts'
import { SystemStats } from '@/types'
import PageHeader from '@/components/PageHeader'

const { TextArea } = Input

/**
 * 系统设置页面
 */
function CoreConfig() {
  const [loading, setLoading] = useState(false)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [currentToken, setCurrentToken] = useState('')
  const [systemInfo, setSystemInfo] = useState<SystemStats>({ hosts_count: 0, vms_count: 0, running_vms: 0, stopped_vms: 0 })
  const [registrationForm] = Form.useForm()
  const [emailForm] = Form.useForm()
  const [testEmailForm] = Form.useForm()
  const [turnstileForm] = Form.useForm()

  /**
   * 页面加载时获取数据
   */
  useEffect(() => {
    loadCurrentToken()
    loadSystemInfo()
    loadSystemSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 加载当前Token
   */
  const loadCurrentToken = async () => {
    try {
      const res = await api.getCurrentToken()
      if (res.code === 200 && res.data) {
        setCurrentToken(res.data.token)
      }
    } catch (error) {
      console.error('加载Token失败:', error)
    }
  }

  /**
   * 加载系统信息
   */
  const loadSystemInfo = async () => {
    try {
      const res = await api.getSystemStats()
      if (res.code === 200 && res.data) {
        setSystemInfo(res.data)
      }
    } catch (error) {
      console.error('加载系统信息失败:', error)
    }
  }

  /**
   * 加载系统设置
   */
  const loadSystemSettings = async () => {
    try {
      const res = await api.getSystemSettings()
      if (res.code === 200) {
        const settings = res.data
        // 设置注册表单
        registrationForm.setFieldsValue({
          registration_enabled: settings.registration_enabled === '1',
          email_verification_enabled: settings.email_verification_enabled === '1',
          default_allowed_hosts: settings.default_allowed_hosts || '',
          default_user_permission: parseInt(settings.default_user_permission) || 56791,
          default_free_config: settings.default_free_config !== '0',
          default_quota_cpu: parseInt(settings.default_quota_cpu) || 2,
          default_quota_ram: parseInt(settings.default_quota_ram) || 4,
          default_quota_sys_disk: parseInt(settings.default_quota_sys_disk) || 20,
          default_quota_data_disk: parseInt(settings.default_quota_data_disk) || 50,
          default_quota_gpu: parseInt(settings.default_quota_gpu) || 0,
          default_quota_nat_ports: parseInt(settings.default_quota_nat_ports) || 5,
          default_quota_internal_ip: parseInt(settings.default_quota_internal_ip) || 5,
          default_quota_web_proxy: parseInt(settings.default_quota_web_proxy) || 2,
          default_quota_public_ip: parseInt(settings.default_quota_public_ip) || 2,
          default_quota_bandwidth_up: parseInt(settings.default_quota_bandwidth_up) || 100,
          default_quota_bandwidth_down: parseInt(settings.default_quota_bandwidth_down) || 100,
          default_quota_traffic: parseInt(settings.default_quota_traffic) || 0,
          default_can_create_vm: settings.default_can_create_vm !== '0',
          default_can_modify_vm: settings.default_can_modify_vm !== '0',
          default_can_delete_vm: settings.default_can_delete_vm !== '0',
        })
        // 设置邮件表单
        emailForm.setFieldsValue({
          base_url: settings.base_url || '',
          resend_email: settings.resend_email || '',
          resend_domain: settings.resend_domain || '',
          resend_apikey: settings.resend_apikey || '',
        })
        // 设置Turnstile表单
        turnstileForm.setFieldsValue({
          turnstile_enabled: settings.turnstile_enabled === '1',
          turnstile_site_key: settings.turnstile_site_key || '',
          turnstile_secret_key: settings.turnstile_secret_key || '',
        })
      }
    } catch (error) {
      console.error('加载系统设置失败:', error)
    }
  }

  /**
   * 切换Token可见性
   */
  const toggleTokenVisibility = () => {
    setTokenVisible(!tokenVisible)
  }

  /**
   * 复制Token
   */
  const copyToken = () => {
    navigator.clipboard.writeText(currentToken)
    message.success('Token已复制到剪贴板')
  }

  /**
   * 设置新Token
   */
  const setNewToken = async (values: { newToken: string }) => {
    try {
      setLoading(true)
      const res = await api.setToken(values.newToken)
      if (res.code === 200 && res.data) {
        setCurrentToken(res.data.token)
        message.success('Token设置成功')
      } else {
        message.error(res.msg || '设置失败')
      }
    } catch (error) {
      message.error('设置Token失败')
    } finally {
      setLoading(false)
    }
  }



  /**
   * 保存Turnstile设置
   */
  const saveTurnstileSettings = async (values: any) => {
    try {
      setLoading(true)
      const data = {
        turnstile_enabled: values.turnstile_enabled ? '1' : '0',
        turnstile_site_key: values.turnstile_site_key || '',
        turnstile_secret_key: values.turnstile_secret_key || '',
      }
      const res = await api.updateSystemSettings(data)
      if (res.code === 200) {
        message.success('Turnstile验证码设置已保存')
      } else {
        message.error(res.msg || '保存失败')
      }
    } catch (error) {
      message.error('保存Turnstile设置失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 保存配置
   */
  const saveConfig = async () => {
    try {
      setLoading(true)
      const res = await api.saveSystemConfig()
      if (res.code === 200) {
        message.success('配置已保存')
      } else {
        message.error(res.msg || '保存失败')
      }
    } catch (error) {
      message.error('保存配置失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 重新加载配置
   */
  const loadConfig = async () => {
    try {
      setLoading(true)
      const res = await api.loadSystemConfig()
      if (res.code === 200) {
        message.success('配置已重新加载')
        loadSystemInfo()
      } else {
        message.error(res.msg || '加载失败')
      }
    } catch (error) {
      message.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 保存注册设置
   */
  const saveRegistrationSettings = async (values: any) => {
    try {
      setLoading(true)
      const data = {
        registration_enabled: values.registration_enabled ? '1' : '0',
        email_verification_enabled: values.email_verification_enabled ? '1' : '0',
        default_allowed_hosts: values.default_allowed_hosts || '',
        default_user_permission: (values.default_user_permission || 56791).toString(),
        default_free_config: values.default_free_config ? '1' : '0',
        default_quota_cpu: values.default_quota_cpu.toString(),
        default_quota_ram: values.default_quota_ram.toString(),
        default_quota_sys_disk: values.default_quota_sys_disk.toString(),
        default_quota_data_disk: values.default_quota_data_disk.toString(),
        default_quota_gpu: values.default_quota_gpu.toString(),
        default_quota_nat_ports: values.default_quota_nat_ports.toString(),
        default_quota_internal_ip: values.default_quota_internal_ip.toString(),
        default_quota_web_proxy: values.default_quota_web_proxy.toString(),
        default_quota_public_ip: values.default_quota_public_ip.toString(),
        default_quota_bandwidth_up: values.default_quota_bandwidth_up.toString(),
        default_quota_bandwidth_down: values.default_quota_bandwidth_down.toString(),
        default_quota_traffic: values.default_quota_traffic.toString(),
        default_can_create_vm: values.default_can_create_vm ? '1' : '0',
        default_can_modify_vm: values.default_can_modify_vm ? '1' : '0',
        default_can_delete_vm: values.default_can_delete_vm ? '1' : '0',
      }
      const res = await api.updateSystemSettings(data)
      if (res.code === 200) {
        message.success('注册设置已保存')
      } else {
        message.error(res.msg || '保存失败')
      }
    } catch (error) {
      message.error('保存注册设置失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 保存邮件设置
   */
  const saveEmailSettings = async (values: any) => {
    try {
      setLoading(true)
      const res = await api.updateSystemSettings(values)
      if (res.code === 200) {
        message.success('邮件配置已保存')
      } else {
        message.error(res.msg || '保存失败')
      }
    } catch (error) {
      message.error('保存邮件配置失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 发送测试邮件
   */
  const sendTestEmail = async (values: any) => {
    try {
      setLoading(true)
      const emailValues = emailForm.getFieldsValue()
      const data = {
        test_email: values.test_email,
        subject: values.subject,
        body: values.body,
        resend_email: emailValues.resend_email,
        resend_apikey: emailValues.resend_apikey,
      }
      const res = await api.sendTestEmail(data)
      if (res.code === 200) {
        message.success('测试邮件发送成功，请查收')
      } else {
        message.error(res.msg || '发送测试邮件失败')
      }
    } catch (error) {
      message.error('发送测试邮件失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 min-h-screen">
      {/* 页面标题 */}
      <PageHeader
        icon={<SettingOutlined />}
        title="平台系统设置"
        subtitle="管理访问Token和系统配置"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token管理 */}
        <Card title={<span><span className="text-blue-600">🔑</span> 访问Token管理</span>} className="shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">当前Token</label>
              <div className="flex gap-2">
                <Input
                  type={tokenVisible ? 'text' : 'password'}
                  value={tokenVisible ? currentToken : '••••••••••••••••'}
                  readOnly
                  className="flex-1"
                />
                <Button icon={tokenVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={toggleTokenVisibility} />
                <Button icon={<CopyOutlined />} onClick={copyToken} />
                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => {
                  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
                  let token = ''
                  for (let i = 0; i < 16; i++) token += chars.charAt(Math.floor(Math.random() * chars.length))
                  setNewToken({ newToken: token })
                }} title="随机生成16位Token" />
              </div>
            </div>

            <Alert
              message="安全提示"
              description="修改Token后，所有使用旧Token的API调用都将失效。请确保更新所有相关配置。"
              type="warning"
              showIcon
            />

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <SafetyCertificateOutlined className="text-green-600" />
                Turnstile 验证码
              </h4>
              <Form form={turnstileForm} onFinish={saveTurnstileSettings} layout="vertical">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium">开启验证码</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>启用后登录、注册、找回密码都需要验证Turnstile</p>
                  </div>
                  <Form.Item name="turnstile_enabled" valuePropName="checked" className="mb-0">
                    <Switch />
                  </Form.Item>
                </div>

                <Form.Item name="turnstile_site_key" label="Turnstile 站点密钥">
                  <Input placeholder="请输入Cloudflare Turnstile Site Key" />
                </Form.Item>

                <Form.Item name="turnstile_secret_key" label="Turnstile 密钥">
                  <Input.Password placeholder="请输入Cloudflare Turnstile Secret Key" />
                </Form.Item>

                <Button type="primary" htmlType="submit" block loading={loading} icon={<SaveOutlined />}>
                  保存验证码设置
                </Button>
              </Form>
            </div>
          </div>
        </Card>

        {/* API文档 */}
        <Card title={<span><span className="text-green-600">🔌</span> API接口说明</span>} className="shadow-sm">
          <div className="space-y-3 text-sm">
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)' }}>
                <p className="font-medium mb-1">认证方式</p>
                <p className="">在请求头中添加：</p>
              <code className="block mt-1 px-2 py-1 rounded text-xs" style={{ background: 'rgba(105,104,253,0.08)', color: 'var(--color-primary, #6968fd)' }}>
                Authorization: Bearer YOUR_TOKEN
              </code>
            </div>

            <div className="border-t pt-3">
                <p className="font-medium mb-2">主要接口</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>GET</span>
                  <code className="text-xs">/api/hosts</code>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>- 获取主机列表</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>POST</span>
                  <code className="text-xs">/api/hosts</code>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>- 添加主机</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>GET</span>
                  <code className="text-xs">/api/hosts/{'{name}'}/vms</code>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>- 获取虚拟机列表</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>POST</span>
                  <code className="text-xs">/api/hosts/{'{name}'}/vms</code>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>- 创建虚拟机</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>POST</span>
                  <code className="text-xs">/api/hosts/{'{name}'}/vms/{'{uuid}'}/power</code>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>- 电源操作</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* 数据管理 */}
        <Card title={<span><span className="text-purple-600">💾</span> 数据管理</span>} className="shadow-sm">
          <div className="space-y-3">
            <Button
              block
              icon={<SaveOutlined />}
              onClick={saveConfig}
              loading={loading}
              className="h-auto py-3 text-left"
            >
              <div className="ml-2">
                <p className="text-sm font-semibold">保存配置</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>将当前配置保存到文件</p>
              </div>
            </Button>

            <Button
              block
              icon={<FolderOpenOutlined />}
              onClick={loadConfig}
              loading={loading}
              className="h-auto py-3 text-left"
            >
              <div className="ml-2">
                <p className="text-sm font-semibold">重新加载配置</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>从文件重新加载配置</p>
              </div>
            </Button>
          </div>
        </Card>

        {/* 系统信息 */}
        <Card title={<span><span>ℹ️</span> 系统信息</span>} className="shadow-sm">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>系统名称</span>
<span className="font-medium">OpenIDCS受控端</span>
            </div>
            <div className="flex items-center justify-between">
<span style={{ color: 'var(--text-secondary)' }}>版本</span>
                    <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
<span style={{ color: 'var(--text-secondary)' }}>主机数量</span>
                    <span className="font-medium">{systemInfo.hosts_count}</span>
            </div>
            <div className="flex items-center justify-between">
<span style={{ color: 'var(--text-secondary)' }}>虚拟机数量</span>
                    <span className="font-medium">{systemInfo.vms_count}</span>
            </div>
          </div>
        </Card>

        {/* 用户注册设置 */}
        <Card title={<span><span className="text-indigo-600">👥</span> 用户注册设置</span>} className="shadow-sm">
          <Form form={registrationForm} onFinish={saveRegistrationSettings} layout="vertical">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
<p className="text-sm font-medium">开放注册</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>允许新用户注册账号</p>
                </div>
                <Form.Item name="registration_enabled" valuePropName="checked" className="mb-0">
                  <Switch />
                </Form.Item>
              </div>

              <div className="flex items-center justify-between">
                <div>
<p className="text-sm font-medium">邮箱验证</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>注册时需要验证邮箱</p>
                </div>
                <Form.Item name="email_verification_enabled" valuePropName="checked" className="mb-0">
                  <Switch />
                </Form.Item>
              </div>

              <div className="border-t pt-4">
<h4 className="text-sm font-medium mb-3">新用户默认配置</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Form.Item name="default_allowed_hosts" label="默认可访问主机" className="mb-3" extra="多个主机用英文逗号分隔，留空表示不限制">
                    <Input placeholder="host1,host2 或留空表示全部" className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_user_permission" label={<span>用户默认权限 <Tooltip title="权限掩码值，控制用户可访问的虚拟机功能Tab。此权限与虚拟机级别权限做AND运算，优先级更高。"><QuestionCircleOutlined style={{color: 'var(--text-secondary)'}}/></Tooltip></span>} className="mb-3" extra="int掩码值，各权限位按位OR组合">
                    <InputNumber min={0} max={65535} className="w-full" placeholder="56791" />
                  </Form.Item>
                </div>
                <div className="mb-3 p-2 rounded text-xs" style={{background: 'var(--bg-card)', border: '1px solid var(--border-hover)'}}>
                  <p className="font-medium mb-1">权限位说明（当前掩码包含的权限）：</p>
                  <div className="grid grid-cols-4 gap-1">
                    {Object.entries(PERMISSION_FIELD_MASK).map(([field, bit]) => (
                      <label key={field} className="flex items-center gap-1 cursor-pointer" onClick={() => {
                        const current = registrationForm.getFieldValue('default_user_permission') || 56791
                        registrationForm.setFieldsValue({ default_user_permission: current ^ bit })
                      }}>
                        <input type="checkbox" readOnly checked={hasPermission(registrationForm.getFieldValue('default_user_permission') || 56791, bit)} className="pointer-events-none" />
                        <span>{VM_PERMISSION_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium">允许自由配置</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>用户可自行调整虚拟机配置</p>
                  </div>
                  <Form.Item name="default_free_config" valuePropName="checked" className="mb-0">
                    <Switch />
                  </Form.Item>
                </div>
              </div>

              <div className="border-t pt-4">
<h4 className="text-sm font-medium mb-3">新用户默认资源配额</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Form.Item name="default_quota_cpu" label="CPU核心(个)" className="mb-2">
                    <InputNumber min={0} max={32} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_ram" label="RAM内存(GB)" className="mb-2">
                    <InputNumber min={0} max={128} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_sys_disk" label="系统磁盘(GB)" className="mb-2">
                    <InputNumber min={0} max={1000} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_data_disk" label="数据磁盘(GB)" className="mb-2">
                    <InputNumber min={0} max={10000} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_gpu" label="GPU显存(GB)" className="mb-2">
                    <InputNumber min={0} max={8} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_nat_ports" label="NAT端口(个)" className="mb-2">
                    <InputNumber min={0} max={100} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_internal_ip" label="内网IP(个)" className="mb-2">
                    <InputNumber min={0} max={50} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_web_proxy" label="WEB代理(个)" className="mb-2">
                    <InputNumber min={0} max={10} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_public_ip" label="公网IP(个)" className="mb-2">
                    <InputNumber min={0} max={10} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_bandwidth_up" label="上行带宽(Mbps)" className="mb-2">
                    <InputNumber min={0} max={1000} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_bandwidth_down" label="下行带宽(Mbps)" className="mb-2">
                    <InputNumber min={0} max={1000} className="w-full" />
                  </Form.Item>
                  <Form.Item name="default_quota_traffic" label="月流量(GB)" className="mb-2">
                    <InputNumber min={0} max={10000} className="w-full" />
                  </Form.Item>
                </div>
              </div>

              <div className="border-t pt-4">
<h4 className="text-sm font-medium mb-3">新用户默认权限</h4>
                <div className="flex gap-4">
                  <Form.Item name="default_can_create_vm" valuePropName="checked" className="mb-0">
                    <Checkbox>允许创建虚拟机</Checkbox>
                  </Form.Item>
                  <Form.Item name="default_can_modify_vm" valuePropName="checked" className="mb-0">
                    <Checkbox>允许修改虚拟机</Checkbox>
                  </Form.Item>
                  <Form.Item name="default_can_delete_vm" valuePropName="checked" className="mb-0">
                    <Checkbox>允许删除虚拟机</Checkbox>
                  </Form.Item>
                </div>
              </div>

              <Button type="primary" htmlType="submit" block loading={loading} icon={<SaveOutlined />}>
                保存设置
              </Button>
            </div>
          </Form>
        </Card>

        {/* 邮件服务配置 */}
        <Card title={<span><span className="text-red-600">📧</span> 邮件服务配置</span>} className="shadow-sm">
          <Alert
            message={
              <span>
                Resend 邮件服务，访问{' '}
                <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline">
                  resend.com
                </a>{' '}
                获取API Key
              </span>
            }
            type="info"
            className="mb-4"
          />

          <Form form={emailForm} onFinish={saveEmailSettings} layout="vertical">
            <Form.Item name="base_url" label="外网URL" extra="用于生成邮件验证链接等回调地址，如：https://example.com">
              <Input placeholder="https://example.com" />
            </Form.Item>

            <Form.Item name="resend_email" label="发件邮箱">
              <Input placeholder="noreply@yourdomain.com" />
            </Form.Item>

            <Form.Item name="resend_domain" label="发送域名">
              <Input placeholder="yourdomain.com" />
            </Form.Item>

            <Form.Item name="resend_apikey" label="API Key">
              <Input.Password placeholder="re_xxxxxxxxxxxxxxxx" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={loading} icon={<SaveOutlined />}>
              保存配置
            </Button>
          </Form>

          <div className="border-t mt-4 pt-4">
<h4 className="text-sm font-medium mb-3">测试邮件发送</h4>
            <Form form={testEmailForm} onFinish={sendTestEmail} layout="vertical">
              <Form.Item name="test_email" label="收件邮箱" rules={[{ required: true, type: 'email', message: '请输入有效的邮箱地址' }]}>
                <Input placeholder="test@example.com" />
              </Form.Item>

              <Form.Item name="subject" label="邮件标题" initialValue="OpenIDCS - 测试邮件">
                <Input placeholder="OpenIDCS - 测试邮件" />
              </Form.Item>

              <Form.Item name="body" label="邮件正文" initialValue="您好，这是一封来自 OpenIDCS 系统的测试邮件。如果您收到这封邮件，说明邮件服务配置正常。————OpenIDCS 系统">
                <TextArea rows={6} placeholder="请输入邮件正文内容..." />
              </Form.Item>

              <Button type="primary" htmlType="submit" block loading={loading} icon={<MailOutlined />}>
                发送测试邮件
              </Button>
            </Form>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default CoreConfig
