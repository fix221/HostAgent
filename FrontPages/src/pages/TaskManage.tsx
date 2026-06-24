import { useEffect, useState, useCallback } from 'react'
import { message, Modal, Select, Popconfirm, Pagination } from 'antd'
import PageHeader from '@/components/PageHeader'
import {
  getTaskList,
  getTaskStats,
  stopTask,
  retryTask,
  TASK_TYPE_LABELS,
  type AsyncTask,
  type TaskListResponse,
  type TaskStats,
} from '@/utils/taskPoller'
import { http } from '@/utils/axio'

/**
 * 任务管理页面（增强版）
 * 支持异步任务列表、强行结束、重新运行、任务类型筛选、分页等
 */
function TaskManage() {
  // 状态管理
  const [tasks, setTasks] = useState<AsyncTask[]>([])
  const [total, setTotal] = useState(0)
  const [hosts, setHosts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedHost, setSelectedHost] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [selectedType, setSelectedType] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [selectedTask, setSelectedTask] = useState<AsyncTask | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [stats, setStats] = useState<TaskStats>({ pending: 0, running: 0, completed: 0, failed: 0, stopped: 0 })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  /**
   * 加载主机列表
   */
  const loadHosts = async () => {
    try {
      const result = await http.get<Record<string, any>>('/api/server/detail')
      if (result && result.code === 200) {
        const hostNames = Object.keys(result.data || {})
        setHosts(hostNames)
      }
    } catch (error) {
      console.error('加载主机列表失败:', error)
    }
  }

  /**
   * 加载任务列表（使用新的异步任务API）
   */
  const loadTasks = useCallback(async () => {
    try {
      setLoading(true)
      const result: TaskListResponse = await getTaskList({
        hs_name: selectedHost || undefined,
        status: selectedStatus || undefined,
        task_type: selectedType || undefined,
        page,
        page_size: pageSize,
      })
      setTasks(result.items || [])
      setTotal(result.total || 0)
    } catch (error) {
      console.error('加载任务失败:', error)
      message.error('加载任务失败')
    } finally {
      setLoading(false)
    }
  }, [selectedHost, selectedStatus, selectedType, page, pageSize])

  /**
   * 加载任务统计
   */
  const loadStats = useCallback(async () => {
    try {
      const result = await getTaskStats()
      setStats(result)
    } catch (error) {
      console.error('加载统计失败:', error)
    }
  }, [])

  /**
   * 初始化加载
   */
  useEffect(() => {
    loadHosts()
  }, [])

  useEffect(() => {
    loadTasks()
    loadStats()
  }, [loadTasks, loadStats])

  /**
   * 自动刷新
   */
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (autoRefresh) {
      interval = setInterval(() => {
        loadTasks()
        loadStats()
      }, 5000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh, loadTasks, loadStats])

  /**
   * 强行结束任务
   */
  const handleStopTask = async (taskId: string) => {
    try {
      await stopTask(taskId)
      message.success('任务已停止')
      loadTasks()
      loadStats()
    } catch (error) {
      message.error('停止任务失败')
    }
  }

  /**
   * 重新运行任务
   */
  const handleRetryTask = async (taskId: string) => {
    try {
      await retryTask(taskId)
      message.success('任务已重新提交')
      loadTasks()
      loadStats()
    } catch (error) {
      message.error('重新运行失败')
    }
  }

  /**
   * 获取状态信息
   */
  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { text: string; icon: string; bgColor: string; textColor: string }> = {
      pending: { text: '等待中', icon: 'mdi:clock-outline', bgColor: 'rgba(234,179,8,0.15)', textColor: '#ca8a04' },
      running: { text: '执行中', icon: 'mdi:play-circle', bgColor: 'rgba(59,130,246,0.15)', textColor: '#3b82f6' },
      completed: { text: '已完成', icon: 'mdi:check-circle', bgColor: 'rgba(34,197,94,0.15)', textColor: '#22c55e' },
      failed: { text: '已失败', icon: 'mdi:close-circle', bgColor: 'rgba(239,68,68,0.15)', textColor: '#ef4444' },
      stopped: { text: '已停止', icon: 'mdi:stop-circle', bgColor: 'rgba(249,115,22,0.15)', textColor: '#f97316' },
    }
    return statusMap[status?.toLowerCase()] || { text: '未知', icon: 'mdi:help-circle', bgColor: 'rgba(107,114,128,0.15)', textColor: '#6b7280' }
  }

  /**
   * 格式化时间
   */
  const formatTime = (timestamp?: string | null) => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  /**
   * 显示任务详情
   */
  const showTaskDetail = (task: AsyncTask) => {
    setSelectedTask(task)
    setModalVisible(true)
  }

  // 任务类型选项
  const taskTypeOptions = Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ label, value }))

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <PageHeader
        icon={<span className="iconify" data-icon="mdi:playlist-check" style={{ width: '24px', height: '24px' }}></span>}
        title="任务管理"
        subtitle="查看和管理异步任务执行情况"
      />

      {/* 过滤器 */}
      <div className="glass-card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>主机筛选</label>
            <Select
              className="w-full"
              placeholder="全部主机"
              value={selectedHost || undefined}
              onChange={(v) => { setSelectedHost(v || ''); setPage(1) }}
              allowClear
              options={[{ label: '全部主机', value: '' }, ...hosts.map(host => ({ label: host, value: host }))]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>任务状态</label>
            <Select
              className="w-full"
              placeholder="全部状态"
              value={selectedStatus || undefined}
              onChange={(v) => { setSelectedStatus(v || ''); setPage(1) }}
              allowClear
              options={[
                { label: '全部状态', value: '' },
                { label: '等待中', value: 'pending' },
                { label: '执行中', value: 'running' },
                { label: '已完成', value: 'completed' },
                { label: '已失败', value: 'failed' },
                { label: '已停止', value: 'stopped' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>任务类型</label>
            <Select
              className="w-full"
              placeholder="全部类型"
              value={selectedType || undefined}
              onChange={(v) => { setSelectedType(v || ''); setPage(1) }}
              allowClear
              options={[{ label: '全部类型', value: '' }, ...taskTypeOptions]}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { loadTasks(); loadStats() }}
              className="w-full text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #6968fd, #8b8aff)' }}
            >
              <span className="iconify" data-icon="mdi:refresh" style={{ width: '18px', height: '18px' }}></span>
              刷新
            </button>
          </div>
        </div>
      </div>

      {/* 任务统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {([
          { key: 'pending', label: '等待中', icon: 'mdi:clock-outline', color: '#ca8a04', bg: 'rgba(234,179,8,0.15)' },
          { key: 'running', label: '执行中', icon: 'mdi:play-circle', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
          { key: 'completed', label: '已完成', icon: 'mdi:check-circle', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
          { key: 'failed', label: '已失败', icon: 'mdi:close-circle', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
          { key: 'stopped', label: '已停止', icon: 'mdi:stop-circle', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
        ] as const).map(item => (
          <div key={item.key} className="glass-card p-4 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: item.bg }}>
                <span className="iconify" data-icon={item.icon} style={{ color: item.color, width: '20px', height: '20px' }}></span>
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats[item.key]}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 任务列表 */}
      <div className="glass-card">
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-primary)' }}>
          <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span className="iconify text-purple-600" data-icon="mdi:format-list-bulleted" style={{ width: '20px', height: '20px' }}></span>
            任务列表 ({total})
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-xs px-3 py-1 rounded-lg transition-all duration-200"
              style={autoRefresh
                ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' }
                : { background: 'rgba(107,114,128,0.12)', color: 'var(--text-secondary)' }}
            >
              <span className="iconify" data-icon={autoRefresh ? 'mdi:pause' : 'mdi:play'} style={{ width: '14px', height: '14px' }}></span>
              {autoRefresh ? ' 停止刷新' : ' 自动刷新'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="iconify animate-spin" data-icon="mdi:loading" style={{ width: '20px', height: '20px' }}></span>
              <span className="ml-2">加载任务中...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="iconify" data-icon="mdi:playlist-remove" style={{ width: '20px', height: '20px' }}></span>
              <span className="ml-2">暂无任务记录</span>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
              {tasks.map((task) => {
                const statusInfo = getStatusInfo(task.status)
                const taskTypeLabel = TASK_TYPE_LABELS[task.task_type] || task.task_type
                const canStop = task.status === 'running' || task.status === 'pending'
                const canRetry = task.status === 'stopped'

                return (
                  <div
                    key={task.task_id}
                    className="p-4 transition-colors duration-200"
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="flex items-center gap-3">
                      {/* 状态图标 */}
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: statusInfo.bgColor }}>
                        <span className="iconify" style={{ color: statusInfo.textColor, width: '20px', height: '20px' }} data-icon={statusInfo.icon}></span>
                      </div>

                      {/* 任务信息 */}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => showTaskDetail(task)}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{taskTypeLabel}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: statusInfo.textColor, background: statusInfo.bgColor }}>
                            {statusInfo.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="flex items-center gap-1">
                            <span className="iconify" data-icon="mdi:server" style={{ width: '14px', height: '14px' }}></span>
                            {task.hs_name}
                          </span>
                          {task.vm_uuid && (
                            <span className="flex items-center gap-1">
                              <span className="iconify" data-icon="mdi:cube-outline" style={{ width: '14px', height: '14px' }}></span>
                              {task.vm_uuid}
                            </span>
                          )}
                          {task.username && (
                            <span className="flex items-center gap-1">
                              <span className="iconify" data-icon="mdi:account" style={{ width: '14px', height: '14px' }}></span>
                              {task.username}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <span className="iconify" data-icon="mdi:clock-outline" style={{ width: '14px', height: '14px' }}></span>
                            {formatTime(task.created_at)}
                          </span>
                          {task.finished_at && (
                            <span className="flex items-center gap-1">
                              <span className="iconify" data-icon="mdi:clock-check" style={{ width: '14px', height: '14px' }}></span>
                              {formatTime(task.finished_at)}
                            </span>
                          )}
                        </div>
                        {task.error_message && (
                          <p className="text-xs mt-1 truncate" style={{ color: '#ef4444' }}>{task.error_message}</p>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {canStop && (
                          <Popconfirm title="确定要强行结束此任务吗？" onConfirm={() => handleStopTask(task.task_id)} okText="确定" cancelText="取消">
                            <button
                              className="text-xs px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1"
                              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                            >
                              <span className="iconify" data-icon="mdi:stop" style={{ width: '14px', height: '14px' }}></span>
                              结束
                            </button>
                          </Popconfirm>
                        )}
                        {canRetry && (
                          <Popconfirm title="确定要重新运行此任务吗？" onConfirm={() => handleRetryTask(task.task_id)} okText="确定" cancelText="取消">
                            <button
                              className="text-xs px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1"
                              style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}
                            >
                              <span className="iconify" data-icon="mdi:replay" style={{ width: '14px', height: '14px' }}></span>
                              重试
                            </button>
                          </Popconfirm>
                        )}
                        <button
                          onClick={() => showTaskDetail(task)}
                          className="text-xs px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1"
                          style={{ background: 'rgba(107,114,128,0.12)', color: 'var(--text-secondary)' }}
                        >
                          <span className="iconify" data-icon="mdi:information-outline" style={{ width: '14px', height: '14px' }}></span>
                          详情
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 分页 */}
        {total > pageSize && (
          <div className="p-4 border-t flex justify-end" style={{ borderColor: 'var(--border-primary)' }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p, ps) => { setPage(p); setPageSize(ps) }}
              showSizeChanger
              showTotal={(t) => `共 ${t} 条`}
              size="small"
            />
          </div>
        )}
      </div>

      {/* 任务详情模态框 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <span className="iconify text-purple-600" data-icon="mdi:information" style={{ width: '20px', height: '20px' }}></span>
            任务详情
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedTask && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>任务ID</label>
                <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{selectedTask.task_id}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>状态</label>
                {(() => {
                  const statusInfo = getStatusInfo(selectedTask.status)
                  return (
                    <span className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full font-medium" style={{ color: statusInfo.textColor, background: statusInfo.bgColor }}>
                      <span className="iconify" data-icon={statusInfo.icon} style={{ width: '16px', height: '16px' }}></span>
                      {statusInfo.text}
                    </span>
                  )
                })()}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>任务类型</label>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>操作人</label>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{selectedTask.username || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>主机</label>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{selectedTask.hs_name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>虚拟机</label>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{selectedTask.vm_uuid || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>创建时间</label>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatTime(selectedTask.created_at)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>开始时间</label>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatTime(selectedTask.started_at)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>完成时间</label>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatTime(selectedTask.finished_at)}</p>
              </div>
            </div>

            {selectedTask.error_message && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>错误信息</label>
                <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p className="text-sm font-mono" style={{ color: '#ef4444' }}>{selectedTask.error_message}</p>
                </div>
              </div>
            )}

            {selectedTask.params && Object.keys(selectedTask.params).length > 0 && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>执行参数</label>
                <div className="rounded-lg p-3 max-h-40 overflow-y-auto" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                  <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{JSON.stringify(selectedTask.params, null, 2)}</pre>
                </div>
              </div>
            )}

            {selectedTask.result && Object.keys(selectedTask.result).length > 0 && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>执行结果</label>
                <div className="rounded-lg p-3 max-h-40 overflow-y-auto" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{JSON.stringify(selectedTask.result, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default TaskManage