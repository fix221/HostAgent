import React, { useEffect, useState } from 'react';
import { Card, Table, Button, message, Tag, Modal, Form, Input, Select, InputNumber, Space, Segmented } from 'antd';
import { ReloadOutlined, PlusOutlined, DeleteOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/PageHeader';
import api from '@/utils/apis.ts';
import { NATRule } from '@/types';

interface UserNATRule extends NATRule {
  hostName: string;
  vmUuid: string;
  rule_index: number;
  wan_ip: string; // 外网IP
}

const PortManage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<UserNATRule[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  
  // 主机和虚拟机列表，用于添加规则时的选择
  const [hosts, setHosts] = useState<string[]>([]);
  const [vms, setVms] = useState<{label: string, value: string}[]>([]);
  const [selectedHost, setSelectedHost] = useState<string>('');

  useEffect(() => {
    fetchNATRules();
    loadHosts();
  }, []);

  const loadHosts = async () => {
    try {
      const res = await api.getHosts();
      if (res.code === 200 && res.data) {
        setHosts(Object.keys(res.data));
      }
    } catch (e) {
      console.error('加载主机列表失败', e);
    }
  };

  const loadVMs = async (hostName: string) => {
    try {
      const res = await api.getVMs(hostName);
      if (res.code === 200 && res.data) {
        const vmList = Array.isArray(res.data) 
          ? res.data.map((vm: any) => ({ label: vm.config?.vm_uuid || vm.uuid, value: vm.config?.vm_uuid || vm.uuid }))
          : Object.values(res.data).map((vm: any) => ({ label: vm.config?.vm_uuid || vm.uuid, value: vm.config?.vm_uuid || vm.uuid }));
        setVms(vmList);
      }
    } catch (e) {
      console.error('加载虚拟机列表失败', e);
      setVms([]);
    }
  };

  const handleHostChange = (value: string) => {
    setSelectedHost(value);
    form.setFieldsValue({ vmUuid: undefined });
    loadVMs(value);
  };

  const fetchNATRules = async () => {
    setLoading(true);
    try {
      // 1. 获取所有主机
      const hostsRes = await api.getHosts();
      if (hostsRes.code !== 200 || !hostsRes.data) {
        throw new Error('获取主机列表失败');
      }
      const hostsData = hostsRes.data as any;
      const hostNames = Object.keys(hostsData);

      const allRules: UserNATRule[] = [];

      // 2. 遍历主机获取VMs
      for (const hostName of hostNames) {
        // 获取主机的外网IP
        const hostConfig = hostsData[hostName]?.config || {};
        const publicAddrs = hostConfig.public_addr || hostConfig.ipaddr_ddns || [];
        const wanIp = Array.isArray(publicAddrs) && publicAddrs.length > 0 ? publicAddrs[0] : (hostsData[hostName]?.addr || '-');

        try {
          const vmsRes = await api.getVMs(hostName);
          if (vmsRes.code === 200 && vmsRes.data) {
             const vms = Array.isArray(vmsRes.data) ? vmsRes.data : Object.values(vmsRes.data);
             
             // 3. 遍历VMs获取NAT规则
             await Promise.all(vms.map(async (vm: any) => {
                 const vmUuid = vm.config?.vm_uuid || vm.uuid;
                 try {
                    const natRes = await api.getNATRules(hostName, vmUuid);
                    if (natRes.code === 200 && natRes.data) {
                        natRes.data.forEach((r: NATRule, index: number) => {
                             allRules.push({
                                 ...r,
                                 hostName,
                                 vmUuid,
                                 rule_index: index,
                                 wan_ip: wanIp
                             });
                         });
                     }
                 } catch (e) {
                     // 忽略错误
                 }
             }));
          }
        } catch (e) {
          console.error(`获取主机 ${hostName} 数据失败`, e);
        }
      }

      setRules(allRules);
    } catch (error) {
      console.error('获取端口转发规则失败', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleDelete = async (record: UserNATRule) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这条端口转发规则吗？',
      mask: false,
      onOk: async () => {
        try {
          const res = await api.deleteNATRule(record.hostName, record.vmUuid, record.rule_index);
          if (res.code === 200) {
            message.success('删除成功');
            fetchNATRules();
          } else {
            message.error(res.msg || '删除失败');
          }
        } catch (e) {
          message.error('删除失败');
        }
      }
    });
  };

  const handleSubmit = async (values: any) => {
    try {
      const data = {
        lan_port: values.vm_port,
        wan_port: values.host_port,
        nat_tips: values.description || '',
        lan_addr: ''
      };
      
      // @ts-expect-error - API接口类型定义与实际使用的数据结构不完全匹配
      const res = await api.addNATRule(values.hostName, values.vmUuid, data);
      if (res.code === 200) {
        message.success('添加成功');
        setModalVisible(false);
        fetchNATRules();
      } else {
        message.error(res.msg || '添加失败');
      }
    } catch (e) {
      message.error('添加失败');
    }
  };

  const columns = [
    {
      title: '主机',
      dataIndex: 'hostName',
      key: 'hostName',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '虚拟机',
      dataIndex: 'vmUuid',
      key: 'vmUuid',
      render: (text: string) => <span className="dark:text-white">{text}</span>,
    },
    {
      title: '外网IP',
      dataIndex: 'wan_ip',
      key: 'wan_ip',
      render: (text: string) => <code className="px-1.5 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">{text || '-'}</code>,
    },
    {
      title: '外网端口',
      dataIndex: 'wan_port',
      key: 'wan_port',
      render: (text: number) => <span className="font-mono dark:text-white">{text || '-'}</span>,
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
      render: (text: number) => <span className="font-mono dark:text-white">{text || '-'}</span>,
    },
    {
      title: '备注',
      dataIndex: 'nat_tips',
      key: 'nat_tips',
      render: (text: string) => <span className="dark:text-white">{text || '-'}</span>,
    },
    {
        title: '操作',
        key: 'action',
        render: (_: any, record: UserNATRule) => (
            <Button 
                type="text" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={() => handleDelete(record)}
            >
                删除
            </Button>
        )
    }
  ];

  // 卡片视图渲染
  const renderCardView = () => {
    if (rules.length === 0) {
      return <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>暂无端口转发规则</div>;
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rules.map((rule, index) => (
          <div key={`${rule.hostName}-${rule.vmUuid}-${rule.rule_index}-${index}`}
               className="glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-400 dark:hover:border-blue-500 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag color="blue" className="m-0">{rule.hostName}</Tag>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{rule.vmUuid}</span>
              </div>
              <Button danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(rule)}>删除</Button>
            </div>
            <div className="space-y-2">
              {/* 外网信息 */}
              <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
                <p className="text-xs mb-1 font-medium text-blue-600 dark:text-blue-400">外网 (WAN)</p>
                <div className="flex items-center justify-between text-sm">
                  <code className="font-mono text-blue-700 dark:text-blue-300">{rule.wan_ip || '-'}</code>
                  <span className="font-mono font-medium">:{rule.wan_port || '-'}</span>
                </div>
              </div>
              {/* 箭头 */}
              <div className="flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
                <span className="iconify" data-icon="mdi:arrow-down" style={{width: '20px', height: '20px'}}></span>
              </div>
              {/* 内网信息 */}
              <div className="rounded-lg p-3 bg-green-50 dark:bg-green-900/20">
                <p className="text-xs mb-1 font-medium text-green-600 dark:text-green-400">内网 (LAN)</p>
                <div className="flex items-center justify-between text-sm">
                  <code className="font-mono text-green-700 dark:text-green-300">{rule.lan_addr || '-'}</code>
                  <span className="font-mono font-medium">:{rule.lan_port || '-'}</span>
                </div>
              </div>
              {/* 备注 */}
              {rule.nat_tips && (
                <div className="rounded-lg p-2 bg-yellow-50 dark:bg-yellow-900/20">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">{rule.nat_tips}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <PageHeader
        icon={<ArrowsRightLeftIcon style={{ width: '24px', height: '24px' }} />}
        title="端口转发管理"
        subtitle="管理您的NAT端口转发规则"
        actions={
          <Space>
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as 'table' | 'card')}
              options={[
                { value: 'table', icon: <UnorderedListOutlined /> },
                { value: 'card', icon: <AppstoreOutlined /> },
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              添加规则
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchNATRules} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      />

      <Card className="glass-card">
        {viewMode === 'table' ? (
          <Table
            dataSource={rules}
            columns={columns}
            rowKey={(record) => `${record.hostName}-${record.vmUuid}-${record.rule_index}`}
            loading={loading}
            locale={{ emptyText: '暂无端口转发规则' }}
          />
        ) : (
          loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : renderCardView()
        )}
      </Card>

      <Modal
        title="添加端口转发规则"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="hostName" label="选择主机" rules={[{ required: true }]}>
            <Select onChange={handleHostChange} placeholder="请选择主机">
              {hosts.map(h => <Select.Option key={h} value={h}>{h}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="vmUuid" label="选择虚拟机" rules={[{ required: true }]}>
            <Select placeholder="请选择虚拟机" disabled={!selectedHost}>
               {vms.map(v => <Select.Option key={v.value} value={v.value}>{v.label}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="host_port" label="公网端口 (外部)" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="例如：8080" />
          </Form.Item>
          <Form.Item name="vm_port" label="虚拟机端口 (内部)" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="例如：80" />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PortManage;
