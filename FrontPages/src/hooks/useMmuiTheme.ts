import { useState, useCallback, useEffect, useRef } from 'react';

const DARK_MODE_KEY = 'mmui-dark-mode';
const TRANSITION_CLASS = 'mmui-theme-transitioning';

type ThemeMode = 'light' | 'dark';

/** 检测系统是否偏好暗色模式 */
function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** 从 localStorage 或系统偏好解析初始主题 */
function resolveInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(DARK_MODE_KEY);
  if (stored === 'enabled') return 'dark';
  if (stored === 'disabled') return 'light';
  return systemPrefersDark() ? 'dark' : 'light';
}

/** 将主题模式应用到 DOM */
function applyMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.body.dataset.mmuiTheme = mode;
  document.documentElement.dataset.mmuiTheme = mode;
}

/** 持久化主题偏好 */
function persistMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DARK_MODE_KEY, mode === 'dark' ? 'enabled' : 'disabled');
}

/** 检测是否偏好减少动画 */
function isReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 获取动画原点坐标 */
function getTransitionOrigin(event?: React.MouseEvent | MouseEvent): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  const fallback = { x: window.innerWidth - 24, y: 28 };

  if (!event) return fallback;

  if (
    Number.isFinite(event.clientX) &&
    Number.isFinite(event.clientY) &&
    (event.clientX || event.clientY)
  ) {
    return { x: event.clientX, y: event.clientY };
  }

  const target = event.currentTarget as HTMLElement | null;
  if (target && typeof target.getBoundingClientRect === 'function') {
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  return fallback;
}

function beginThemeTransition(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add(TRANSITION_CLASS);
  }
}

function endThemeTransition(): void {
  if (typeof document === 'undefined') return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.documentElement.classList.remove(TRANSITION_CLASS);
    });
  });
}

export interface UseMmuiThemeReturn {
  mode: ThemeMode;
  isDark: boolean;
  toggleTheme: (event?: React.MouseEvent | MouseEvent) => void;
}

/**
 * MMUI 主题切换 Hook
 * - 支持 light/dark 双模式
 * - 支持 View Transition API 圆形扩散动画（带降级）
 * - 持久化到 localStorage，页面加载时自动恢复
 */
export function useMmuiTheme(): UseMmuiThemeReturn {
  const [mode, setMode] = useState<ThemeMode>(resolveInitialMode);
  const transitionRunning = useRef(false);

  // 初始化时应用主题
  useEffect(() => {
    applyMode(mode);
  }, []);

  const toggleTheme = useCallback(
    (event?: React.MouseEvent | MouseEvent) => {
      const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
      persistMode(next);

      // 不支持 View Transition 或正在动画中 → 直接切换
      if (
        typeof document === 'undefined' ||
        typeof (document as any).startViewTransition !== 'function' ||
        isReducedMotion() ||
        transitionRunning.current
      ) {
        beginThemeTransition();
        applyMode(next);
        setMode(next);
        endThemeTransition();
        return;
      }

      // 使用 View Transition API 实现圆形扩散动画
      transitionRunning.current = true;
      beginThemeTransition();

      const { x, y } = getTransitionOrigin(event);
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      const transition = (document as any).startViewTransition(async () => {
        applyMode(next);
        setMode(next);
      });

      transition.ready
        .then(() => {
          const revealAnimation = document.documentElement.animate(
            { clipPath },
            {
              duration: 560,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both' as FillMode,
              pseudoElement: '::view-transition-new(root)',
            },
          );
          revealAnimation.finished
            .then(() => revealAnimation.cancel())
            .catch(() => {});
        })
        .catch(() => {});

      transition.finished
        .catch(() => {})
        .finally(() => {
          transitionRunning.current = false;
          endThemeTransition();
        });
    },
    [mode],
  );

  return {
    mode,
    isDark: mode === 'dark',
    toggleTheme,
  };
}
