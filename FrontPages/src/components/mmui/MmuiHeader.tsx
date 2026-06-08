import React, { useEffect, useState, useRef } from 'react';
import { Button, Tooltip } from 'antd';
import { MenuOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
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
  theme, sidebarCollapsed, onToggleMobileMenu, title, extra
}: MmuiHeaderProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // 监听滚动计算背景模糊进度
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const progress = Math.min(scrollTop / 100, 1);
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      ref={headerRef}
      className="mmui-header"
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      style={{
        backdropFilter: `blur(${scrollProgress * 12}px)`,
        WebkitBackdropFilter: `blur(${scrollProgress * 12}px)`,
      }}
    >
      {/* 左侧：移动端汉堡菜单 + 标题 */}
      <div className="mmui-header__left">
        <button
          className="mmui-header__hamburger"
          onClick={onToggleMobileMenu}
          aria-label="切换菜单"
        >
          <MenuOutlined />
        </button>
        {title && <span className="mmui-header__title">{title}</span>}
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
