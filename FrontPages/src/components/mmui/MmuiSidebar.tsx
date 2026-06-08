import React from 'react';
import { Tooltip } from 'antd';
import {
  AppstoreOutlined, DesktopOutlined, DatabaseOutlined, SettingOutlined,
  HddOutlined, CameraOutlined, GlobalOutlined, SwapOutlined,
  SafetyCertificateOutlined, ArrowLeftOutlined, MenuFoldOutlined,
  MenuUnfoldOutlined, ThunderboltOutlined
} from '@ant-design/icons';

export interface SidebarItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}

interface MmuiSidebarProps {
  activeKey: string;
  collapsed: boolean;
  onSelect: (key: string) => void;
  onCollapse: (collapsed: boolean) => void;
  onBack: () => void;
  items?: SidebarItem[];
}

/** 默认侧边栏导航项 */
export const defaultSidebarItems: SidebarItem[] = [
  { key: 'panel', icon: <AppstoreOutlined />, label: '面板' },
  { key: 'system', icon: <DesktopOutlined />, label: '系统' },
  { key: 'monitor', icon: <DatabaseOutlined />, label: '监控' },
  { key: 'sysadmin', icon: <SettingOutlined />, label: '系统管理' },
  { key: 'vnc', icon: <DesktopOutlined />, label: 'VNC' },
  { key: 'data', icon: <HddOutlined />, label: '数据' },
  { key: 'snapshot', icon: <CameraOutlined />, label: '快照' },
  { key: 'backup', icon: <DatabaseOutlined />, label: '备份' },
  { key: 'network', icon: <GlobalOutlined />, label: '网络' },
  { key: 'nat', icon: <SwapOutlined />, label: '端口映射' },
  { key: 'policy', icon: <SafetyCertificateOutlined />, label: '策略' },
];

/** MMUI 风格侧边栏导航项 */
function SidebarNavItem({ icon, label, active, badge, collapsed, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; badge?: string;
  collapsed?: boolean; onClick?: () => void;
}) {
  const content = (
    <div
      onClick={onClick}
      className="mmui-sidebar-item"
      data-active={active || undefined}
    >
      <span className="mmui-sidebar-item__icon">{icon}</span>
      {!collapsed && (
        <>
          <span className="mmui-sidebar-item__label">{label}</span>
          {badge && <span className="mmui-sidebar-item__badge">{badge}</span>}
        </>
      )}
    </div>
  );

  if (collapsed) {
    return <Tooltip title={label} placement="right">{content}</Tooltip>;
  }
  return content;
}

/** MMUI 风格侧边栏组件 */
export default function MmuiSidebar({
  activeKey, collapsed, onSelect, onCollapse, onBack, items
}: MmuiSidebarProps) {
  const navItems = items || defaultSidebarItems;

  return (
    <aside className="mmui-sidebar" data-collapsed={collapsed || undefined}>
      {/* 品牌区域 */}
      <div className="mmui-sidebar__brand">
        <ThunderboltOutlined className="mmui-sidebar__brand-icon" />
        {!collapsed && <span className="mmui-sidebar__brand-title">云管理系统</span>}
      </div>

      {/* 导航列表 */}
      <nav className="mmui-sidebar__nav">
        {navItems.map(item => (
          <SidebarNavItem
            key={item.key}
            icon={item.icon}
            label={item.label}
            badge={item.badge}
            active={activeKey === item.key}
            collapsed={collapsed}
            onClick={() => onSelect(item.key)}
          />
        ))}
      </nav>

      {/* 底部操作 */}
      <div className="mmui-sidebar__footer">
        <SidebarNavItem
          icon={<ArrowLeftOutlined />}
          label="退出"
          collapsed={collapsed}
          onClick={onBack}
        />
        <SidebarNavItem
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          label={collapsed ? '展开' : '收起'}
          collapsed={collapsed}
          onClick={() => onCollapse(!collapsed)}
        />
      </div>
    </aside>
  );
}
