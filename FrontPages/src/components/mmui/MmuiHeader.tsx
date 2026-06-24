import React, { useEffect, useState, useRef } from 'react';
import { Button, Tooltip } from 'antd';
import { MenuOutlined, SunOutlined, MoonOutlined, CloudServerOutlined } from '@ant-design/icons';
import type { UseMmuiThemeReturn } from '@/hooks/useMmuiTheme';

interface MmuiHeaderProps {
  theme: UseMmuiThemeReturn;
  sidebarCollapsed: boolean;
  onToggleMobileMenu?: () => void;
  title?: string;
  extra?: React.ReactNode;
}

/** MMUI 风格顶部栏组件 */
export default function MmuiHeader({
  theme, sidebarCollapsed, onToggleMobileMenu, extra
}: MmuiHeaderProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // 监听滚动计算背景模糊进度
  useEffect(() => {
    const handleScroll = () => {
      const container = headerRef.current?.parentElement?.querySelector('.mmui-layout__content');
      if (container) {
        const progress = Math.min(container.scrollTop / 100, 1);
        setScrollProgress(progress);
      }
    };

    const container = headerRef.current?.parentElement?.querySelector('.mmui-layout__content');
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <header
      ref={headerRef}
      className="mmui-header"
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      style={{
        backdropFilter: `blur(${8 + scrollProgress * 4}px)`,
        WebkitBackdropFilter: `blur(${8 + scrollProgress * 4}px)`,
      }}
    >
      {/* 左侧：移动端汉堡菜单 + 品牌图标 + 标题 */}
      <div className="mmui-header__left">
        <button
          className="mmui-header__hamburger"
          onClick={onToggleMobileMenu}
          aria-label="切换菜单"
        >
          <MenuOutlined />
        </button>
        <CloudServerOutlined style={{ fontSize: 18, color: 'var(--mmui-accent-blue)' }} />
        <span className="mmui-header__title">云管理系统</span>
      </div>

      {/* 右侧：主题切换 + 额外操作 */}
      <div className="mmui-header__right">
        {extra}
        <Tooltip title={theme.isDark ? '切换到亮色模式' : '切换到暗色模式'}>
          <Button
            type="text"
            className="mmui-header__theme-btn"
            icon={theme.isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={(e) => theme.toggleTheme(e as unknown as MouseEvent)}
          />
        </Tooltip>
      </div>
    </header>
  );
}
