import {useState, useEffect} from 'react'
import {Outlet, useNavigate, useLocation} from 'react-router-dom'
import {Layout, Menu, Avatar, Dropdown, Badge, Button, Input, Tooltip, Modal, Form, Space, Popconfirm, message} from 'antd'
import {
    DashboardOutlined,
    CloudServerOutlined,
    UserOutlined,
    SettingOutlined,
    FileTextOutlined,
    BellOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    GlobalOutlined,
    SwapOutlined,
    TranslationOutlined,
    SunOutlined,
    MoonOutlined,
    BgColorsOutlined,
    RadiusSettingOutlined,
    FormatPainterOutlined,
    CheckOutlined,
    SearchOutlined,
    QuestionCircleOutlined,
    AppstoreOutlined,
    ControlOutlined,
    PictureOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons'
import { addCustomAnimeTheme, updateCustomAnimeTheme, deleteCustomAnimeTheme, AnimeTheme, isSolidTheme } from '@/config/animeThemes.config'
import {useUserStore} from '@/utils/data.ts'
import api from '@/utils/apis.ts'
import { changeLanguage, getAvailableLanguages, getCurrentLanguage } from '@/utils/i18n.ts'
import { useTheme } from '@/contexts/ThemeContext'
import type {MenuProps} from 'antd'

const {Header, Sider, Content} = Layout

/**
 * 主布局组件
 * 包含侧边栏、顶部导航和内容区域
 * 风格对齐小黑云财务前端 AdminLayout
 */
function MainLayout() {
    const navigate = useNavigate()
    const location = useLocation()
    const {user, logout, setUser} = useUserStore()
    const { theme: currentTheme, toggleTheme, transparentMode, toggleTransparentMode, roundedMode, toggleRoundedMode, liquidMode, toggleLiquidMode, animeThemeId, setAnimeTheme, animeThemes, refreshAnimeThemes, animeBlurMode, toggleAnimeBlurMode } = useTheme()
    const [collapsed, setCollapsed] = useState(false)
    const [notifications, setNotifications] = useState(0)
    const [currentLang, setCurrentLang] = useState('zh-cn')
    const [languages, setLanguages] = useState<any[]>([])
    // 二次元主题管理弹窗
    const [animeModalOpen, setAnimeModalOpen] = useState(false)
    const [editingTheme, setEditingTheme] = useState<AnimeTheme | null>(null)
    const [themeForm] = Form.useForm()

    useEffect(() => {
        if (!user || user.is_admin === undefined) {
            api.getCurrentUser().then(res => {
                if (res.code === 200 && res.data) {
                    setUser(res.data)
                }
            }).catch(() => {})
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setCurrentLang(getCurrentLanguage())
        setLanguages(getAvailableLanguages())
        const handleLangChange = (e: any) => { setCurrentLang(e.detail.language) }
        const handleLangsLoaded = (e: any) => {
            setLanguages(e.detail.languages)
            setCurrentLang(getCurrentLanguage())
        }
        window.addEventListener('languageChanged', handleLangChange)
        window.addEventListener('languagesLoaded', handleLangsLoaded)
        return () => {
            window.removeEventListener('languageChanged', handleLangChange)
            window.removeEventListener('languagesLoaded', handleLangsLoaded)
        }
    }, [])

    // 语言菜单项
    const languageMenuItems: MenuProps['items'] = (languages.length > 0 ? languages : [
        { code: 'zh-cn', native: '简体中文' },
        { code: 'en-us', native: 'English' }
    ]).map(lang => ({
        key: lang.code,
        label: lang.native || lang.name,
        icon: lang.code === currentLang ? <CheckOutlined /> : undefined,
    }))

    // 用户界面菜单项
    const userMenuItems: MenuProps['items'] = [
        { key: '/user/dashboard', icon: <DashboardOutlined/>, label: '资源概览' },
        { key: '/user/vms',       icon: <CloudServerOutlined/>, label: '实例管理' },
        { key: '/user/proxys',    icon: <GlobalOutlined/>,      label: '反向代理' },
        { key: '/user/nat',       icon: <SwapOutlined/>,        label: '端口转发' },
        { key: '/profile',        icon: <UserOutlined/>,        label: '个人资料' },
    ]

    // 系统界面菜单项（仅管理员可见）
    const adminMenuItems: MenuProps['items'] = [
        { key: '/dashboard',  icon: <DashboardOutlined/>,   label: '系统概览' },
        { key: '/hosts',      icon: <CloudServerOutlined/>, label: '主机管理' },
        { key: '/vms',        icon: <CloudServerOutlined/>, label: '实例管理' },
        { key: '/web-proxys', icon: <GlobalOutlined/>,      label: '反向代理' },
        { key: '/nat-rules',  icon: <SwapOutlined/>,        label: '端口转发' },
        { key: '/users',      icon: <UserOutlined/>,        label: '用户管理' },
        { key: '/logs',       icon: <FileTextOutlined/>,    label: '日志查看' },
        { key: '/settings',   icon: <SettingOutlined/>,     label: '系统设置' },
    ]

    const menuItems: MenuProps['items'] = user?.is_admin
        ? [
            {
                key: 'user-interface',
                icon: <AppstoreOutlined />,
                label: '用户空间',
                children: userMenuItems,
            },
            {
                key: 'system-interface',
                icon: <ControlOutlined />,
                label: '系统空间',
                children: adminMenuItems,
            },
          ]
        : userMenuItems

    // 用户下拉菜单
    const dropdownMenuItems: MenuProps['items'] = [
        { key: 'profile',  icon: <UserOutlined/>,  label: '个人资料', onClick: () => navigate('/profile') },
        { key: 'settings', icon: <SettingOutlined/>, label: '设置',   onClick: () => navigate('/settings') },
        { type: 'divider' },
        { key: 'logout',   icon: <LogoutOutlined/>, label: '退出登录', onClick: () => { logout(); navigate('/login') } },
    ]

    const handleMenuClick: MenuProps['onClick'] = ({key}) => { navigate(key) }

    // 主题面板下拉内容
    const themePanelContent = (
        <div style={{
            background: currentTheme === 'dark' ? '#1a1d23' : '#fff',
            border: currentTheme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0',
            borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            padding: '10px',
            width: 280,
        }}>
            {/* ── 开关区（图标网格） ── */}
            <div style={{ padding: '2px 6px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: currentTheme === 'dark' ? 'rgba(255,255,255,0.3)' : '#bbb', textTransform: 'uppercase' }}>
                显示
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: '0 2px 4px' }}>
                {[
                    { label: currentTheme === 'dark' ? '浅色' : '深色', active: currentTheme === 'dark', color: '#faad14', icon: currentTheme === 'dark' ? <SunOutlined /> : <MoonOutlined />, onClick: toggleTheme },
                    { label: '透明', active: transparentMode, color: '#6968fd', icon: <BgColorsOutlined />, onClick: toggleTransparentMode },
                    { label: '圆角', active: roundedMode, color: '#52c41a', icon: <RadiusSettingOutlined />, onClick: toggleRoundedMode },
                    { label: '玻璃', active: liquidMode, color: '#13c2c2', icon: <AppstoreOutlined />, onClick: toggleLiquidMode },
                    { label: '模糊', active: animeBlurMode, color: '#eb2f96', icon: <BgColorsOutlined />, onClick: toggleAnimeBlurMode },
                ].map((item, i) => (
                    <div
                        key={i}
                        onClick={item.onClick}
                        className="theme-menu-item"
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            padding: '8px 2px 6px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                            border: item.active ? `2px solid ${item.color}` : `1px solid ${currentTheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#eee'}`,
                            background: item.active ? `${item.color}12` : 'transparent',
                        }}
                    >
                        <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: item.active ? `${item.color}20` : (currentTheme === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f5f5'),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}>
                            <span style={{ fontSize: 15, color: item.active ? item.color : (currentTheme === 'dark' ? '#555' : '#aaa'), transition: 'color 0.2s' }}>{item.icon}</span>
                        </div>
                        <span style={{ fontSize: 9, color: item.active ? item.color : (currentTheme === 'dark' ? '#888' : '#999'), fontWeight: item.active ? 600 : 400, lineHeight: 1 }}>{item.label}</span>
                    </div>
                ))}
            </div>

            {/* ── 分割线 ── */}
            <div style={{ height: 1, background: currentTheme === 'dark' ? 'rgba(255,255,255,0.06)' : '#f0f0f0', margin: '6px 0' }} />

            {/* ── 壁纸背景区 ── */}
            <div style={{ padding: '2px 6px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: currentTheme === 'dark' ? 'rgba(255,255,255,0.3)' : '#bbb', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>壁纸</span>
                <span
                    onClick={(e) => { e.stopPropagation(); setAnimeModalOpen(true); }}
                    style={{ cursor: 'pointer', fontSize: 11, color: '#6968fd', fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}
                >管理</span>
            </div>

            {/* 壁纸网格：缩略图/色块 + 名称 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '2px 2px', maxHeight: 240, overflowY: 'auto' }}>
                {/* 主题列表（纯色 + 壁纸统一显示） */}
                {animeThemes.map(t => (
                    <div
                        key={t.id}
                        onClick={() => setAnimeTheme(t.id)}
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            padding: '8px 2px 6px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                            border: animeThemeId === t.id ? `2px solid ${t.primaryColor}` : `1px solid ${currentTheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#eee'}`,
                            background: animeThemeId === t.id ? `${t.primaryColor}12` : 'transparent',
                        }}
                        className="theme-menu-item"
                    >
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: isSolidTheme(t)
                                ? t.solidColor!
                                : (t.thumbnail
                                    ? `url(${t.thumbnail}) center/cover no-repeat`
                                    : `linear-gradient(135deg, ${t.primaryColor}, ${t.accentColor})`),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: animeThemeId === t.id ? `0 4px 12px ${t.primaryColor}40` : 'none',
                            transition: 'box-shadow 0.2s',
                            overflow: 'hidden',
                            border: isSolidTheme(t) && t.solidColor === '#ffffff' ? '1px solid #e0e0e0' : 'none',
                        }}>
                            {!isSolidTheme(t) && !t.thumbnail && <PictureOutlined style={{ fontSize: 16, color: '#fff' }} />}
                        </div>
                        <span style={{
                            fontSize: 10, color: currentTheme === 'dark' ? '#ccc' : '#555',
                            lineHeight: 1.2, textAlign: 'center',
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontWeight: animeThemeId === t.id ? 600 : 400,
                        }}>{t.name}</span>
                    </div>
                ))}
            </div>
        </div>
    )

    return (
        <Layout style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>

            {/* ===== 顶部导航（全宽深色，对齐小黑云 AdminLayout header） ===== */}
            <Header style={{
                background: 'linear-gradient(135deg, #1a1d23 0%, #2b2f36 50%, #1a1d23 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)',
                color: '#e6e9ef',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '0 20px',
                height: 64,
                position: 'sticky',
                top: 0,
                zIndex: 1000,
                backdropFilter: 'blur(10px)',
            }}>
                {/* 左侧：折叠按钮 + 品牌 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Button
                        type="text"
                        icon={collapsed ? <MenuUnfoldOutlined/> : <MenuFoldOutlined/>}
                        onClick={() => setCollapsed(!collapsed)}
                        style={{
                            width: 40, height: 40,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 8, color: '#e6e9ef',
                            border: 'none', boxShadow: 'none',
                            transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                        }}
                    />
                    {/* 品牌 Logo + 名称 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: 10,
                            background: 'linear-gradient(135deg, #6968fd 0%, #8b8aff 100%)',
                            color: '#fff', fontWeight: 700, fontSize: 15,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(105,104,253,0.4)',
                            transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                            flexShrink: 0,
                        }}>
                            OI
                        </div>
                        {!collapsed && (
                            <span style={{
                                fontWeight: 600, fontSize: 16, letterSpacing: '0.3px',
                                background: 'linear-gradient(135deg, #ffffff 0%, #e6e9ef 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                whiteSpace: 'nowrap',
                            }}>
                                OpenIDCS
                            </span>
                        )}
                    </div>
                </div>

                {/* 右侧操作区 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>

                    {/* 搜索框 */}
                    <Input
                        className="header-search"
                        placeholder="搜索功能..."
                        variant="borderless"
                        prefix={<SearchOutlined style={{ fontSize: 14 }} />}
                        style={{
                            height: 36,
                            width: 220,
                        }}
                    />

                    {/* 主题切换 */}
                    <Dropdown
                        placement="bottomRight"
overlayStyle={{ zIndex: 1050 }}
                        getPopupContainer={() => document.body}
                        popupRender={() => themePanelContent}
                    >
                        <Tooltip title="主题设置">
                            <Button
                                type="text"
                                icon={<FormatPainterOutlined style={{ fontSize: 16 }} />}
                                style={{
                                    color: (currentTheme === 'dark' || transparentMode || roundedMode || liquidMode) ? '#8b8aff' : '#e6e9ef',
                                    border: 'none', boxShadow: 'none',
                                    width: 36, height: 36,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: 8,
                                }}
                            />
                        </Tooltip>
                    </Dropdown>

                    {/* 语言切换 */}
                    <Dropdown
                        menu={{ items: languageMenuItems, onClick: ({key}) => changeLanguage(key) }}
                        placement="bottomRight"
overlayStyle={{ zIndex: 1050 }}
                        getPopupContainer={() => document.body}
                    >
                        <Tooltip title="切换语言">
                            <Button
                                type="text"
                                icon={<TranslationOutlined style={{ fontSize: 16 }} />}
                                style={{
                                    color: '#e6e9ef', border: 'none', boxShadow: 'none',
                                    width: 36, height: 36,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: 8,
                                }}
                            />
                        </Tooltip>
                    </Dropdown>

                    {/* 帮助 */}
                    <Tooltip title="帮助">
                        <Button
                            type="text"
                            icon={<QuestionCircleOutlined style={{ fontSize: 16 }} />}
                            style={{
                                color: '#e6e9ef', border: 'none', boxShadow: 'none',
                                width: 36, height: 36,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 8,
                            }}
                        />
                    </Tooltip>

                    {/* 通知 */}
                    <Tooltip title="消息中心">
                        <Badge count={notifications} size="small">
                            <Button
                                type="text"
                                icon={<BellOutlined style={{ fontSize: 16 }} />}
                                onClick={() => setNotifications(0)}
                                style={{
                                    color: '#e6e9ef', border: 'none', boxShadow: 'none',
                                    width: 36, height: 36,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: 8,
                                }}
                            />
                        </Badge>
                    </Tooltip>

                    {/* 用户信息 */}
                    <Dropdown
                        menu={{ items: dropdownMenuItems }}
                        placement="bottomRight"
overlayStyle={{ zIndex: 1050 }}
                        getPopupContainer={() => document.body}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            cursor: 'pointer', padding: '6px 12px', borderRadius: 6,
                            transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                        }}
                        className="header-user-info"
                        >
                            <Avatar
                                icon={<UserOutlined/>}
                                size="small"
                                style={{
                                    background: 'linear-gradient(135deg, #6968fd, #8b8aff)',
                                    border: '2px solid rgba(105,104,253,0.3)',
                                }}
                            />
                            <span style={{ fontWeight: 500, fontSize: 14, color: '#e6e9ef' }}>
                                {user?.username || '用户'}
                            </span>
                        </div>
                    </Dropdown>
                </div>
            </Header>

            {/* ===== 主体区域（侧栏 + 内容） ===== */}
            <Layout style={{ height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

                {/* 侧边栏（贴边深色，对齐小黑云 sider） */}
                <Sider
                    trigger={null}
                    collapsible
                    collapsed={collapsed}
                    width={230}
                    collapsedWidth={60}
                    className="main-sider"
                    style={{
                        background: '#0f1115',
                        height: '100%',
                        overflow: 'auto',
                    }}
                >
                    <Menu
                        mode="inline"
                        className="main-menu"
                        selectedKeys={[location.pathname]}
                        defaultOpenKeys={user?.is_admin ? ['user-interface', 'system-interface'] : []}
                        items={menuItems}
                        onClick={handleMenuClick}
                        style={{
                            background: '#0f1115',
                            border: 'none',
                            color: 'rgba(255,255,255,0.7)',
                            paddingTop: 8,
                        }}
                    />
                </Sider>

                {/* 内容区域 */}
                <Content
                    className={`main-content main-layout-content ${currentTheme === 'dark' ? 'grid-background' : ''}`}
                    style={{
                        padding: 24,
                        minHeight: 280,
                        overflow: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <Outlet/>
                    </div>
                    {/* 底部 Footer */}
                    <div style={{
                        textAlign: 'center',
                        padding: '16px 0 4px',
                        marginTop: 24,
                        borderTop: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                        color: 'var(--text-secondary, rgba(255,255,255,0.35))',
                        fontSize: 12,
                        lineHeight: 1.8,
                    }}>
                        <div>OpenIDCS 虚拟化管理平台 · v{__APP_VERSION__}</div>
                        <div style={{ opacity: 0.6 }}>© {new Date().getFullYear()} OpenIDCS Team. All rights reserved.</div>
                    </div>
                </Content>
            </Layout>

            {/* 二次元主题管理弹窗 */}
            <Modal
                title="🎨 二次元主题管理"
                open={animeModalOpen}
                onCancel={() => { setAnimeModalOpen(false); setEditingTheme(null); themeForm.resetFields(); }}
                footer={null}
                width={640}
                styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
            >
                {/* 添加/编辑表单 */}
                <div style={{
                    background: currentTheme === 'dark' ? '#1f2937' : '#f9fafb',
                    borderRadius: 12, padding: 16, marginBottom: 16,
                    border: `1px solid ${currentTheme === 'dark' ? '#374151' : '#e5e7eb'}`,
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: currentTheme === 'dark' ? '#e5e7eb' : '#374151' }}>
                        {editingTheme ? '✏️ 编辑主题' : '➕ 添加自定义主题'}
                    </div>
                    <Form
                        form={themeForm}
                        layout="vertical"
                        size="small"
                        onFinish={(values) => {
                            if (editingTheme) {
                                updateCustomAnimeTheme(editingTheme.id, values);
                                message.success('主题已更新');
                            } else {
                                addCustomAnimeTheme(values);
                                message.success('主题已添加');
                            }
                            refreshAnimeThemes();
                            themeForm.resetFields();
                            setEditingTheme(null);
                        }}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Form.Item name="name" label="主题名称" rules={[{ required: true, message: '请输入名称' }]}>
                                <Input placeholder="如：三月七" />
                            </Form.Item>
                            <Form.Item name="description" label="描述">
                                <Input placeholder="如：崩坏：星穹铁道" />
                            </Form.Item>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Form.Item name="pcBackground" label="PC端背景图URL" rules={[{ required: true, message: '请输入URL' }]}>
                                <Input placeholder="https://..." />
                            </Form.Item>
                            <Form.Item name="mobileBackground" label="手机端背景图URL" rules={[{ required: true, message: '请输入URL' }]}>
                                <Input placeholder="https://..." />
                            </Form.Item>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <Form.Item name="primaryColor" label="主色调" rules={[{ required: true }]}>
                                <Input type="color" style={{ height: 32, padding: 2 }} />
                            </Form.Item>
                            <Form.Item name="accentColor" label="强调色" rules={[{ required: true }]}>
                                <Input type="color" style={{ height: 32, padding: 2 }} />
                            </Form.Item>
                            <Form.Item name="thumbnail" label="缩略图URL">
                                <Input placeholder="可选" />
                            </Form.Item>
                        </div>
                        <Space>
                            <Button type="primary" htmlType="submit" icon={editingTheme ? <EditOutlined /> : <PlusOutlined />}>
                                {editingTheme ? '保存修改' : '添加主题'}
                            </Button>
                            {editingTheme && (
                                <Button onClick={() => { setEditingTheme(null); themeForm.resetFields(); }}>
                                    取消编辑
                                </Button>
                            )}
                        </Space>
                    </Form>
                </div>

                {/* 主题列表 */}
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: currentTheme === 'dark' ? '#e5e7eb' : '#374151' }}>
                    📋 主题列表（{animeThemes.length}个）
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                    {animeThemes.map(t => (
                        <div
                            key={t.id}
                            style={{
                                borderRadius: 12, overflow: 'hidden',
                                border: animeThemeId === t.id
                                    ? `2px solid ${t.primaryColor}`
                                    : `1px solid ${currentTheme === 'dark' ? '#374151' : '#e5e7eb'}`,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: currentTheme === 'dark' ? '#1f2937' : '#fff',
                            }}
                            onClick={() => setAnimeTheme(t.id)}
                        >
                            {/* 缩略图预览 */}
                            <div style={{
                                height: 80,
                                background: `linear-gradient(135deg, ${t.primaryColor}40, ${t.accentColor}40)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                position: 'relative',
                            }}>
                                <PictureOutlined style={{ fontSize: 24, color: t.primaryColor }} />
                                {animeThemeId === t.id && (
                                    <div style={{
                                        position: 'absolute', top: 6, right: 6,
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: t.primaryColor, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <CheckOutlined style={{ fontSize: 10, color: '#fff' }} />
                                    </div>
                                )}
                            </div>
                            {/* 信息 */}
                            <div style={{ padding: '8px 10px' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: currentTheme === 'dark' ? '#e5e7eb' : '#333', marginBottom: 2 }}>
                                    {t.name}
                                </div>
                                <div style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {t.description}
                                </div>
                                {/* 操作按钮 */}
                                {!t.builtin && (
                                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }} onClick={e => e.stopPropagation()}>
                                        <Button
                                            size="small" type="text" icon={<EditOutlined />}
                                            style={{ fontSize: 11, height: 22, padding: '0 4px' }}
                                            onClick={() => {
                                                setEditingTheme(t);
                                                themeForm.setFieldsValue(t);
                                            }}
                                        />
                                        <Popconfirm
                                            title="确定删除此主题？"
                                            onConfirm={() => {
                                                if (animeThemeId === t.id) setAnimeTheme(null);
                                                deleteCustomAnimeTheme(t.id);
                                                refreshAnimeThemes();
                                                message.success('已删除');
                                            }}
                                        >
                                            <Button
                                                size="small" type="text" danger icon={<DeleteOutlined />}
                                                style={{ fontSize: 11, height: 22, padding: '0 4px' }}
                                            />
                                        </Popconfirm>
                                    </div>
                                )}
                                {t.builtin && (
                                    <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>内置主题</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Modal>
        </Layout>
    )
}

export default MainLayout
