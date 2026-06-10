import React from 'react'
import { Modal, Row, Col, Button } from 'antd'
import {
    PlayCircleOutlined,
    PauseCircleOutlined,
    RedoOutlined,
    PoweroffOutlined,
    ThunderboltOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons'

interface DockPowerModalProps {
    open: boolean
    onCancel: () => void
    vmUuid: string
    onAction: (action: string) => void
}

const actionLabels: Record<string, string> = {
    start: '启动',
    stop: '关机',
    reset: '重启',
    pause: '暂停',
    resume: '恢复',
    hard_stop: '强制关机',
    hard_reset: '强制重启',
}

const DockPowerModal: React.FC<DockPowerModalProps> = ({
    open,
    onCancel,
    vmUuid,
    onAction
}) => {
    const confirmAction = (action: string) => {
        const label = actionLabels[action] || action
        const isDanger = ['stop', 'hard_stop', 'hard_reset'].includes(action)
        Modal.confirm({
            title: `确认${label}`,
            icon: <ExclamationCircleOutlined style={{ color: isDanger ? '#ef4444' : '#faad14' }} />,
            content: `确定要对虚拟机 "${vmUuid}" 执行${label}操作吗？`,
            okText: `确认${label}`,
            okType: isDanger ? 'danger' : 'primary',
            cancelText: '取消',
            mask: false,
            onOk: () => onAction(action)
        })
    }

    return (
        <Modal
            title="电源操作"
            open={open}
            onCancel={onCancel}
            footer={null}
            width={400}
        >
            <p className="mb-4">选择对虚拟机 "<strong>{vmUuid}</strong>" 执行的操作：</p>
            <Row gutter={[12, 12]}>
                <Col span={12}>
                    <Button
                        block
                        type="primary"
                        className="bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
                        icon={<PlayCircleOutlined/>}
                        onClick={() => confirmAction('start')}
                    >
                        启动
                    </Button>
                </Col>
                <Col span={12}>
                    <Button
                        block
                        className="bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white"
                        icon={<PauseCircleOutlined/>}
                        onClick={() => confirmAction('stop')}
                    >
                        关机
                    </Button>
                </Col>
                <Col span={12}>
                    <Button
                        block
                        type="primary"
                        icon={<RedoOutlined/>}
                        onClick={() => confirmAction('reset')}
                    >
                        重启
                    </Button>
                </Col>
                <Col span={12}>
                    <Button
                        block
                        className="bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white"
                        icon={<PauseCircleOutlined/>}
                        onClick={() => confirmAction('pause')}
                    >
                        暂停
                    </Button>
                </Col>
                <Col span={12}>
                    <Button
                        block
                        className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white"
                        icon={<PlayCircleOutlined/>}
                        onClick={() => confirmAction('resume')}
                    >
                        恢复
                    </Button>
                </Col>
                <Col span={12}>
                    <Button
                        block
                        danger
                        icon={<PoweroffOutlined/>}
                        onClick={() => confirmAction('hard_stop')}
                    >
                        强制关机
                    </Button>
                </Col>
                <Col span={12}>
                    <Button
                        block
                        danger
                        icon={<ThunderboltOutlined/>}
                        onClick={() => confirmAction('hard_reset')}
                    >
                        强制重启
                    </Button>
                </Col>
            </Row>
        </Modal>
    )
}

export default DockPowerModal
