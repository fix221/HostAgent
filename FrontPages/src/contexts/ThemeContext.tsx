import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ThemeConfig, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { lightTheme, darkTheme, lightTransparentTheme, darkTransparentTheme } from '../config/theme.config';
import {
  AnimeTheme,
  getAllAnimeThemes,
  getActiveAnimeThemeId,
  setActiveAnimeThemeId,
  getThemeBackground,
  isSolidTheme,
} from '../config/animeThemes.config';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  transparentMode: boolean;
  toggleTransparentMode: () => void;
  roundedMode: boolean;
  toggleRoundedMode: () => void;
  liquidMode: boolean;
  toggleLiquidMode: () => void;
  getThemeConfig: () => ThemeConfig;
  // 二次元主题相关
  animeThemeId: string | null;
  setAnimeTheme: (id: string | null) => void;
  currentAnimeTheme: AnimeTheme | null;
  animeThemes: AnimeTheme[];
  refreshAnimeThemes: () => void;
  // 二次元底层模糊开关
  animeBlurMode: boolean;
  toggleAnimeBlurMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // 从 localStorage 读取保存的主题，默认为浅色
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    return savedTheme || 'light';
  });

  // 从 localStorage 读取透明模式状态，默认为关闭
  const [transparentMode, setTransparentMode] = useState<boolean>(() => {
    const savedMode = localStorage.getItem('transparentMode');
    return savedMode === 'true';
  });

  // 从 localStorage 读取圆角模式状态，默认为关闭
  const [roundedMode, setRoundedMode] = useState<boolean>(() => {
    const savedMode = localStorage.getItem('roundedMode');
    return savedMode === 'true';
  });

  // 从 localStorage 读取液态玻璃模式状态，默认为关闭
  const [liquidMode, setLiquidMode] = useState<boolean>(() => {
    const savedMode = localStorage.getItem('liquidMode');
    return savedMode === 'true';
  });

  // 二次元底层模糊开关，默认关闭
  const [animeBlurMode, setAnimeBlurMode] = useState<boolean>(() => {
    const savedMode = localStorage.getItem('animeBlurMode');
    return savedMode === 'true';
  });

  // 二次元主题状态
  const [animeThemeId, setAnimeThemeIdState] = useState<string | null>(() => {
    return getActiveAnimeThemeId();
  });

  const [animeThemes, setAnimeThemes] = useState<AnimeTheme[]>(() => getAllAnimeThemes());

  // 刷新主题列表（添加/删除自定义主题后调用）
  const refreshAnimeThemes = useCallback(() => {
    setAnimeThemes(getAllAnimeThemes());
  }, []);

  // 当前激活的二次元主题对象
  const currentAnimeTheme = animeThemeId
    ? animeThemes.find(t => t.id === animeThemeId) || null
    : null;

  // 设置二次元主题
  const setAnimeTheme = useCallback((id: string | null) => {
    setAnimeThemeIdState(id);
    setActiveAnimeThemeId(id);
    if (id) {
      const selectedTheme = getAllAnimeThemes().find(t => t.id === id);
      if (selectedTheme) {
        // 选择二次元壁纸主题时自动开启透明模式（用户可手动关闭）
        if (!isSolidTheme(selectedTheme)) {
          setTransparentMode(true);
        }
        // 选择纯白主题时自动切换为白天模式
        if (selectedTheme.solidColor === '#ffffff') {
          setThemeState('light');
        }
        // 选择科技绿主题时自动切换为暗黑模式
        if (selectedTheme.id === 'solid-tech-green') {
          setThemeState('dark');
        }
      }
    }
  }, []);

  // 当主题变化时，更新 DOM 和 localStorage
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 当透明模式或二次元主题变化时，更新背景
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (currentAnimeTheme) {
      // 设置主题主色调CSS变量
      root.style.setProperty('--anime-primary', currentAnimeTheme.primaryColor);
      root.style.setProperty('--anime-accent', currentAnimeTheme.accentColor);
      root.setAttribute('data-anime-theme', currentAnimeTheme.id);

      if (isSolidTheme(currentAnimeTheme)) {
        // 纯色主题：深色模式下使用深色背景色，亮色模式下使用主题的solidColor
        body.style.backgroundImage = '';
        body.style.backgroundSize = '';
        body.style.backgroundPosition = '';
        body.style.backgroundAttachment = '';
        body.style.backgroundColor = theme === 'dark' ? '#0f172a' : currentAnimeTheme.solidColor!;
      } else {
        // 壁纸主题：用图片背景
        const bgUrl = getThemeBackground(currentAnimeTheme);
        body.style.backgroundImage = `url(${bgUrl})`;
        body.style.backgroundSize = 'cover';
        body.style.backgroundPosition = 'center';
        body.style.backgroundAttachment = 'fixed';
        body.style.backgroundColor = 'transparent';
      }

      // 壁纸主题标记：让 Layout 透明以显示壁纸
      if (!isSolidTheme(currentAnimeTheme)) {
        root.setAttribute('data-wallpaper', 'true');
      } else {
        root.removeAttribute('data-wallpaper');
      }
      // 透明模式完全由用户开关独立控制
      if (transparentMode) {
        root.setAttribute('data-transparent', 'true');
      } else {
        root.removeAttribute('data-transparent');
      }
    } else if (transparentMode) {
      root.setAttribute('data-transparent', 'true');
      root.removeAttribute('data-anime-theme');
      root.removeAttribute('data-wallpaper');
      root.style.removeProperty('--anime-primary');
      root.style.removeProperty('--anime-accent');
      body.style.backgroundImage = 'url(https://images.524228.xyz/)';
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundAttachment = 'fixed';
      body.style.backgroundColor = 'transparent';
    } else {
      root.removeAttribute('data-transparent');
      root.removeAttribute('data-anime-theme');
      root.removeAttribute('data-wallpaper');
      root.style.removeProperty('--anime-primary');
      root.style.removeProperty('--anime-accent');
      body.style.backgroundImage = '';
      body.style.backgroundSize = '';
      body.style.backgroundPosition = '';
      body.style.backgroundAttachment = '';
      body.style.backgroundColor = '';
    }
    localStorage.setItem('transparentMode', String(transparentMode));
  }, [transparentMode, currentAnimeTheme, theme]);

  // 监听窗口大小变化，切换手机/PC端背景（仅壁纸主题）
  useEffect(() => {
    if (!currentAnimeTheme || isSolidTheme(currentAnimeTheme)) return;
    // 二次元主题下无论透明模式是否开启都监听resize

    const handleResize = () => {
      const bgUrl = getThemeBackground(currentAnimeTheme);
      document.body.style.backgroundImage = `url(${bgUrl})`;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentAnimeTheme]);

  // 当圆角模式变化时，更新 DOM 和 localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (roundedMode) {
      root.setAttribute('data-rounded', 'true');
    } else {
      root.removeAttribute('data-rounded');
    }
    localStorage.setItem('roundedMode', String(roundedMode));
  }, [roundedMode]);

  // 当液态玻璃模式变化时，更新 DOM 和 localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (liquidMode) {
      root.setAttribute('data-liquid', 'true');
    } else {
      root.removeAttribute('data-liquid');
    }
    localStorage.setItem('liquidMode', String(liquidMode));
  }, [liquidMode]);

  const toggleTheme = () => {
    setThemeState(prevTheme => {
      const next = prevTheme === 'light' ? 'dark' : 'light';
      // 纯色主题下，白天切暗黑自动切换科技绿，暗黑切白天自动切换纯白；壁纸主题下不联动
      const isWallpaper = currentAnimeTheme && !isSolidTheme(currentAnimeTheme);
      if (!isWallpaper) {
        if (next === 'dark') {
          setAnimeThemeIdState('solid-tech-green');
          setActiveAnimeThemeId('solid-tech-green');
        }
        if (next === 'light') {
          setAnimeThemeIdState('solid-white');
          setActiveAnimeThemeId('solid-white');
        }
      }
      return next;
    });
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    // 纯色主题下，切换暗黑自动切换科技绿，切换白天自动切换纯白；壁纸主题下不联动
    const isWallpaper = currentAnimeTheme && !isSolidTheme(currentAnimeTheme);
    if (!isWallpaper) {
      if (newTheme === 'dark') {
        setAnimeThemeIdState('solid-tech-green');
        setActiveAnimeThemeId('solid-tech-green');
      }
      if (newTheme === 'light') {
        setAnimeThemeIdState('solid-white');
        setActiveAnimeThemeId('solid-white');
      }
    }
  };

  const toggleTransparentMode = () => {
    setTransparentMode(prev => {
      const next = !prev;
      // 开启透明模式时，如果当前没有壁纸主题或是纯色主题，自动切换到随机必应
      if (next && (!currentAnimeTheme || currentAnimeTheme.solidColor)) {
        setAnimeThemeIdState('random-bing');
        setActiveAnimeThemeId('random-bing');
      }
      return next;
    });
  };

  const toggleRoundedMode = () => {
    setRoundedMode(prev => !prev);
  };

  const toggleLiquidMode = () => {
    setLiquidMode(prev => !prev);
  };

  const toggleAnimeBlurMode = () => {
    setAnimeBlurMode(prev => !prev);
  };

  // 当二次元底层模糊模式变化时，更新 DOM 和 localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (animeBlurMode) {
      root.setAttribute('data-anime-blur', 'true');
    } else {
      root.removeAttribute('data-anime-blur');
    }
    localStorage.setItem('animeBlurMode', String(animeBlurMode));
  }, [animeBlurMode]);

  const getThemeConfig = (): ThemeConfig => {
    let base: ThemeConfig;
    // 二次元主题下根据透明模式决定使用哪套主题配置
    if (transparentMode) {
      base = theme === 'light' ? lightTransparentTheme : darkTransparentTheme;
    } else {
      base = theme === 'light' ? lightTheme : darkTheme;
    }
    // 关闭圆角模式时：统一设为 2px
    if (!roundedMode) {
      return {
        ...base,
        token: {
          ...base.token,
          borderRadius: 2,
          borderRadiusLG: 2,
          borderRadiusSM: 2,
          borderRadiusXS: 2,
          borderRadiusOuter: 2,
        },
      };
    }
    // 开启圆角模式时：统一设为 20px
    return {
      ...base,
      token: {
        ...base.token,
        borderRadius: 20,
        borderRadiusLG: 20,
        borderRadiusSM: 20,
        borderRadiusXS: 20,
        borderRadiusOuter: 20,
      },
    };
  };

  return (
    <ThemeContext.Provider value={{
      theme, toggleTheme, setTheme,
      transparentMode, toggleTransparentMode,
      roundedMode, toggleRoundedMode,
      liquidMode, toggleLiquidMode,
      getThemeConfig,
      animeThemeId, setAnimeTheme, currentAnimeTheme, animeThemes, refreshAnimeThemes,
      animeBlurMode, toggleAnimeBlurMode,
    }}>
      <ConfigProvider 
        theme={getThemeConfig()}
        locale={zhCN}
        getPopupContainer={(node) => node?.parentElement || document.body}
        modal={{
          mask: false
        } as any}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
