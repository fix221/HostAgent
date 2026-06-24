import { useEffect, useState } from 'react'
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Select, Card, Row, Col, Checkbox } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, GlobalOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons'
import api from '@/utils/apis.ts'
import PageHeader from '@/components/PageHeader'

/**
 * 反向代理基础配置接口
 */
interface ProxyConfig {
  proxy_index: number
  domain: string
  backend_ip: string
  backend_port: number
  ssl_enabled: boolean
  description: string
  enabled: boolean
}

/**
 * Web代理数据接口（扩展自ProxyConfig）
 */
interface WebProxy extends ProxyConfig {
  hostName: string
  vmUuid: string
  vmName?: string
  ownerName?: string
}

/**
 * 主机数据接口
 */
interface Host {
  server_name: string
  server_type: string
}

/**
 * 虚拟机数据接口
 */
interface VM {
  vm_uuid: string
  vm_name: string
}

/**
 * Web反向代理管理页面
 * userMode=true时为用户模式，通过接口直接获取当前用户的代理列表，支持增删操作
 * userMode=false时为管理员模式，显示所有代理并可编辑
 */
function HttpProxys({ userMode = false }: { userMode?: boolean }) {
  // 状态管理
  const [proxies, setProxies] = useState<WebProxy[]>([])
  const [filteredProxies, setFilteredProxies] = useState<WebProxy[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [vms, setVms] = useState<{ [key: string]: VM[] }>({})
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const [editingProxy, setEditingProxy] = useState<WebProxy | null>(null)
  
  // 筛选条件
  const [searchText, setSearchText] = useState('')
  const [hostFilter, setHostFilter] = useState('')
  const [protocolFilter, setProtocolFilter] = useState('')
  const [vmFilter, setVmFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  
  const [form] = Form.useForm()

  /**
   * 加载主机列表（用于添加代理时选择）
   */
  const loadHosts = async () => {
    try {
      const response = await api.getHosts()
      if (response.code === 200) {
        const hostData = response.data
        if (hostData && typeof hostData === 'object' && !Array.isArray(hostData)) {
          // hostData 是 { hostName: hostInfo } 格式
          const hostList = Object.keys(hostData).map(name => ({ server_name: name, server_type: '' }))
          setHosts(hostList)
        } else {
          setHosts(Array.isArray(hostData) ? hostData : [])
        }
      }
    } catch (error) {
      console.error('加载主机列表失败:', error)
      setHosts([])
    }
  }

  /**
   * 加载指定主机的虚拟机列表
   */
  const loadVMsForHost = async (hostName: string) => {
    try {
      const response = await api.getVMs(hostName)
      if (response.code === 200) {
        const vmData = response.data
        let vmList: VM[] = []
        if (Array.isArray(vmData)) {
          vmList = vmData.map((vm: any) => ({
            vm_uuid: vm.config?.vm_uuid || vm.uuid || vm.vm_uuid,
            vm_name: vm.config?.vm_name || vm.vm_name || vm.uuid || ''
          }))
        } else if (vmData && typeof vmData === 'object') {
          vmList = Object.values(vmData).map((vm: any) => ({
            vm_uuid: vm.config?.vm_uuid || vm.uuid || vm.vm_uuid,
            vm_name: vm.config?.vm_name || vm.vm_name || vm.uuid || ''
          }))
        }
        setVms(prev => ({ ...prev, [hostName]: vmList }))
        return vmList
      }
    } catch (error) {
      console.error('加载虚拟机列表失败:', error)
    }
    return []
  }

  /**
   * 加载代理列表
   * 用户模式：直接调用 /api/client/proxys/list 获取当前用户的所有代理
   * 管理员模式：调用 /api/admin/proxys/list 获取所有代理
   */
  const loadProxys = async () => {
    setLoading(true)
    try {
      let response: any
      if (userMode) {
        // 用户模式：直接获取当前用户的代理列表
        response = await api.getWebProxys()
      } else {
        // 管理员模式：获取所有代理列表
        response = await api.getAdminWebProxys()
      }

      if (response.code === 200 && response.data) {
        const list = response.data.list || response.data || []
        const allProxies: WebProxy[] = list.map((item: any) => ({
          proxy_index: item.proxy_index ?? 0,
          domain: item.domain || '',
          backend_ip: item.backend_ip || '',
          backend_port: item.backend_port || 80,
          ssl_enabled: item.ssl_enabled || false,
          description: item.description || '',
          enabled: item.enabled !== false,
          hostName: item.host_name || '',
          vmUuid: item.vm_uuid || '',
          vmName: item.vm_name || item.vm_uuid || '',
          ownerName: item.owner_name || ''
        }))
        setProxies(allProxies)
        setFilteredProxies(allProxies)
      } else {
        message.error(response.msg || '获取数据失败')
      }
    } catch (error) {
      console.error('获取反向代理失败', error)
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHosts()
    loadProxys()
  }, [])

  /**
   * 筛选代理列表
   */
  useEffect(() => {
    let filtered = [...proxies]
    
    // 搜索筛选（域名、虚拟机名、端口模糊匹配）
    if (searchText) {
      const search = searchText.toLowerCase()
      filtered = filtered.filter(proxy => 
        proxy.domain.toLowerCase().includes(search) ||
        (proxy.vmName && proxy.vmName.toLowerCase().includes(search)) ||
        String(proxy.backend_port || '').includes(search)
      )
    }
    
    // 主机筛选
    if (hostFilter) {
      filtered = filtered.filter(proxy => proxy.hostName === hostFilter)
    }
    
    // 虚拟机筛选
    if (vmFilter) {
      filtered = filtered.filter(proxy => proxy.vmUuid === vmFilter || proxy.vmName === vmFilter)
    }
    
    // 所有者筛选（仅管理员模式）
    if (ownerFilter) {
      filtered = filtered.filter(proxy => proxy.ownerName === ownerFilter)
    }
    
    // 协议筛选
    if (protocolFilter) {
      if (protocolFilter === 'https') {
        filtered = filtered.filter(proxy => proxy.ssl_enabled)
      } else if (protocolFilter === 'http') {
        filtered = filtered.filter(proxy => !proxy.ssl_enabled)
      }
    }
    
    setFilteredProxies(filtered)
  }, [searchText, hostFilter, vmFilter, ownerFilter, protocolFilter, proxies])

  /**
   * 显示添加模态框
   */
  const showAddModal = () => {
    setIsEdit(false)
    setEditingProxy(null)
    form.resetFields()
    setModalVisible(true)
  }

  /**
   * 显示编辑模态框
   */
  const showEditModal = (proxy: WebProxy) => {
    setIsEdit(true)
    setEditingProxy(proxy)
    
    // 加载该主机的虚拟机列表
    loadVMsForHost(proxy.hostName).then(() => {
      form.setFieldsValue({
        host_name: proxy.hostName,
        vm_uuid: proxy.vmUuid,
        domain: proxy.domain,
        backend_ip: proxy.backend_ip,
        backend_port: proxy.backend_port,
        ssl_enabled: proxy.ssl_enabled,
        description: proxy.description
      })
    })
    
    setModalVisible(true)
  }

  /**
   * 处理主机选择变化
   */
  const handleHostChange = (hostName: string) => {
    form.setFieldValue('vm_uuid', undefined)
    if (hostName) {
      loadVMsForHost(hostName)
    }
  }

  /**
   * 创建或更新代理
   */
  const handleSubmit = async (values: any) => {
    try {
      if (isEdit && editingProxy) {
        // 编辑模式
        const response = await api.updateWebProxy(
          editingProxy.hostName,
          editingProxy.vmUuid,
          editingProxy.proxy_index,
          {
            domain: values.domain,
            backend_ip: values.backend_ip || '',
            backend_port: values.backend_port,
            ssl_enabled: values.ssl_enabled || false,
            description: values.description || ''
          }
        )
        if (response.code === 200) {
          message.success('代理更新成功')
          setModalVisible(false)
          form.resetFields()
          loadProxys()
        } else {
          message.error(response.msg || '更新失败')
        }
      } else {
        // 添加模式
        const response = await api.createWebProxy(
          values.host_name,
          values.vm_uuid,
          {
            domain: values.domain,
            backend_ip: values.backend_ip || '',
            backend_port: values.backend_port,
            ssl_enabled: values.ssl_enabled || false,
            description: values.description || ''
          }
        )
        if (response.code === 200) {
          message.success('代理创建成功')
          setModalVisible(false)
          form.resetFields()
          loadProxys()
        } else {
          message.error(response.msg || '创建失败')
        }
      }
    } catch (error) {
      message.error(isEdit ? '更新代理失败' : '创建代理失败')
    }
  }

  /**
   * 删除代理
   */
  const handleDelete = async (proxy: WebProxy) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除域名为 "${proxy.domain}" 的反向代理配置吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      mask: false,
      onOk: async () => {
        try {
          const response = await api.deleteWebProxy(
            proxy.hostName,
            proxy.vmUuid,
            proxy.proxy_index
          )
          if (response.code === 200) {
            message.success('删除成功')
            loadProxys()
          } else {
            message.error(response.msg || '删除失败')
          }
        } catch (error) {
          message.error('删除代理失败')
        }
      }
    })
  }

  /**
   * 表格列配置
   */
  const columns: any[] = [
    {
      title: '域名',
      dataIndex: 'domain',
      key: 'domain',
      render: (domain: string, record: WebProxy) => (
        <a
          href={`http${record.ssl_enabled ? 's' : ''}://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
        >
          {domain}
        </a>
      )
    },
    {
      title: '主机',
      dataIndex: 'hostName',
      key: 'hostName',
      render: (name: string) => <Tag color="blue">{name}</Tag>
    },
    {
      title: '虚拟机',
      dataIndex: 'vmName',
      key: 'vmName',
      render: (name: string) => <Tag color="default">{name || '-'}</Tag>
    },
    {
      title: '后端地址',
      key: 'backend',
      render: (_: any, record: WebProxy) => (
        <code className="text-sm">
          {record.backend_ip || 'auto'}:{record.backend_port}
        </code>
      )
    },
    {
      title: '协议',
      key: 'protocol',
      render: (_: any, record: WebProxy) => (
        <Tag
          icon={record.ssl_enabled ? <LockOutlined /> : <UnlockOutlined />}
          color={record.ssl_enabled ? 'success' : 'default'}
        >
          {record.ssl_enabled ? 'HTTPS' : 'HTTP'}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'success' : 'error'}>
          {enabled ? '已启用' : '已禁用'}
        </Tag>
      )
    },
    // 管理员模式显示所有者列
    ...(!userMode ? [{
      title: '所有者',
      dataIndex: 'ownerName',
      key: 'ownerName',
      render: (name: string) => <span style={{ color: 'var(--text-secondary)' }}>{name || '-'}</span>
    }] : []),
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => <span style={{ color: 'var(--text-secondary)' }}>{desc || '-'}</span>
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: WebProxy) => (
        <Space size="small">
          {!userMode && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => showEditModal(record)}
            >
              编辑
            </Button>
          )}
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <PageHeader
        icon={<GlobalOutlined />}
        title="反向代理管理"
        subtitle={userMode ? '管理您的Web反向代理配置' : '管理所有虚拟机的Web反向代理配置'}
        actions={
          <Space size="middle" style={{ flexWrap: 'wrap' }}>
            <Input
              placeholder="搜索域名、虚拟机、端口..."
              style={{ width: 200 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <Select
              placeholder="所有主机"
              style={{ width: 130 }}
              value={hostFilter || undefined}
              onChange={(v) => setHostFilter(v || '')}
              allowClear
            >
              {[...new Set(proxies.map(p => p.hostName).filter(Boolean))].map(host => (
                <Select.Option key={host} value={host}>
                  {host}
                </Select.Option>
              ))}
            </Select>
            <Select
              placeholder="所有虚拟机"
              style={{ width: 140 }}
              value={vmFilter || undefined}
              onChange={(v) => setVmFilter(v || '')}
              allowClear
            >
              {[...new Set(proxies.map(p => p.vmName || p.vmUuid).filter(Boolean))].map(vm => (
                <Select.Option key={vm} value={vm}>{vm}</Select.Option>
              ))}
            </Select>
            {!userMode && (
              <Select
                placeholder="所有者"
                style={{ width: 120 }}
                value={ownerFilter || undefined}
                onChange={(v) => setOwnerFilter(v || '')}
                allowClear
              >
                {[...new Set(proxies.map(p => p.ownerName).filter(Boolean))].map(owner => (
                  <Select.Option key={owner} value={owner!}>{owner}</Select.Option>
                ))}
              </Select>
            )}
            <Select
              placeholder="协议"
              style={{ width: 100 }}
              value={protocolFilter || undefined}
              onChange={(v) => setProtocolFilter(v || '')}
              allowClear
            >
              <Select.Option value="http">HTTP</Select.Option>
              <Select.Option value="https">HTTPS</Select.Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={loadProxys}>刷新</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={showAddModal}
            >
              添加反向代理
            </Button>
          </Space>
        }
      />

      {/* 代理列表表格 */}
      <Card 
        className="glass-card"
        style={{ borderRadius: '16px' }}
      >
        <Table
          columns={columns}
          dataSource={filteredProxies}
          rowKey={(record) => `${record.hostName}-${record.vmUuid}-${record.proxy_index}`}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <GlobalOutlined style={{ fontSize: '5rem', color: 'var(--text-tertiary)' }} />
                <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>暂无反向代理配置</p>
                <Button 
                  type="primary" 
                  onClick={showAddModal} 
                  style={{ marginTop: '16px' }}
                  className="gradient-button"
                >
                  添加第一个代理
                </Button>
              </div>
            )
          }}
        />
      </Card>

      {/* 添加/编辑代理模态框 */}
      <Modal
        title={isEdit ? '编辑反向代理' : '添加反向代理'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        width={600}
        okText={isEdit ? '保存' : '添加'}
        cancelText="取消"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="host_name"
            label="主机"
            rules={[{ required: true, message: '请选择主机' }]}
          >
            <Select
              placeholder="请选择主机"
              onChange={handleHostChange}
              disabled={isEdit}
            >
              {hosts.map(host => (
                <Select.Option key={host.server_name} value={host.server_name}>
                  {host.server_name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="vm_uuid"
            label="虚拟机"
            rules={[{ required: true, message: '请选择虚拟机' }]}
          >
            <Select
              placeholder="请先选择主机"
              disabled={isEdit || !form.getFieldValue('host_name')}
            >
              {(vms[form.getFieldValue('host_name')] || []).map(vm => (
                <Select.Option key={vm.vm_uuid} value={vm.vm_uuid}>
                  {vm.vm_name || vm.vm_uuid}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="domain"
            label="域名"
            rules={[{ required: true, message: '请输入域名' }]}
          >
            <Input placeholder="example.com" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="backend_ip"
                label="后端IP"
              >
                <Input placeholder="自动获取" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="backend_port"
                label="后端端口"
                rules={[{ required: true, message: '请输入后端端口' }]}
                initialValue={80}
              >
                <InputNumber
                  min={1}
                  max={65535}
                  style={{ width: '100%' }}
                  placeholder="80"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea
              rows={3}
              placeholder="可选的描述信息"
            />
          </Form.Item>

          <Form.Item
            name="ssl_enabled"
            valuePropName="checked"
          >
            <Checkbox>启用HTTPS (SSL/TLS)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default HttpProxys
