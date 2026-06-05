/**
 * 二次元主题配置
 * 支持预设主题和自定义主题，支持手机/PC端使用不同图片
 */

export interface AnimeTheme {
  id: string;
  name: string;
  /** 主题描述 */
  description: string;
  /** PC端背景图片URL */
  pcBackground: string;
  /** 手机端背景图片URL */
  mobileBackground: string;
  /** 主题主色调 */
  primaryColor: string;
  /** 主题强调色 */
  accentColor: string;
  /** 预览缩略图（小图） */
  thumbnail: string;
  /** 是否为内置主题（内置主题不可删除） */
  builtin: boolean;
  /** 纯色背景色（设置后使用纯色而非图片壁纸） */
  solidColor?: string;
}

// 预设纯色主题
export const builtinSolidThemes: AnimeTheme[] = [
  {
    id: 'solid-white',
    name: '纯白简约',
    description: '纯白简约',
    pcBackground: '',
    mobileBackground: '',
    primaryColor: '#666666',
    accentColor: '#999999',
    thumbnail: '',
    builtin: true,
    solidColor: '#ffffff',
  },
  {
    id: 'solid-tech-green',
    name: '暗黑护眼',
    description: '科技暗黑绿',
    pcBackground: '',
    mobileBackground: '',
    primaryColor: '#51dd2a',
    accentColor: '#23b96f',
    thumbnail: '',
    builtin: true,
    solidColor: '#0a1a14',
  },
  {
    id: 'solid-klein-blue',
    name: '克莱因蓝',
    description: '克莱因蓝',
    pcBackground: '',
    mobileBackground: '',
    primaryColor: '#002fa7',
    accentColor: '#1a47c2',
    thumbnail: '',
    builtin: true,
    solidColor: '#002fa7',
  },

  {
    id: 'solid-warm-sunset',
    name: '暖橙落日',
    description: '暖橙落日',
    pcBackground: '',
    mobileBackground: '',
    primaryColor: '#ff6b35',
    accentColor: '#ff8c42',
    thumbnail: '',
    builtin: true,
    solidColor: '#ff8c42',
  },
];

// 预设二次元主题列表
export const builtinAnimeThemes: AnimeTheme[] = [
  {
    id: 'march7th',
    name: '三月七',
    description: '崩坏：星穹铁道 - 三月七',
    pcBackground: 'https://patchwiki.biligame.com/images/sr/e/e6/57h91ahf93rtqa7hn2x7d0rgehtcdg9.png',
    mobileBackground: 'https://patchwiki.biligame.com/images/sr/3/31/9fa1lelfm2d1mn0g7i9gys0d2zmia44.png',
    primaryColor: '#ff6b9d',
    accentColor: '#c44dff',
    thumbnail: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTywOK8tr6cp3mM9Hfbc_I1oNPj-ZUf5HHngw&s',
    builtin: true,
  },  {
    id: 'firefly',
    name: '流萤',
    description: '崩坏：星穹铁道 - 流萤',
    pcBackground: 'https://embed.pixiv.net/pixivision/zh/a/9928/ogimage.jpg',
    mobileBackground: 'https://embed.pixiv.net/pixivision/zh/a/9928/ogimage.jpg',
    primaryColor: '#2579f8',
    accentColor: '#4cafaa',
    thumbnail: 'https://upload-os-bbs.hoyolab.com/upload/2024/04/28/239277358/1f45886f507dca9cab2ecb82c72b1485_8645800139836415002.png?x-oss-process=image%2Fresize%2Cs_600%2Fauto-orient%2C0%2Finterlace%2C1%2Fformat%2Cwebp%2Fquality%2Cq_70',
    builtin: true,
  },{
    id: 'nahida',
    name: '纳西妲',
    description: '原神 - 纳西妲',
    pcBackground: 'https://haowallpaper.com/link/common/file/previewFileImg/17945425755164032',
    mobileBackground: 'https://haowallpaper.com/link/common/file/previewFileImg/17945425755164032',
    primaryColor: '#7bc862',
    accentColor: '#4caf50',
    thumbnail: 'https://i.pinimg.com/736x/f4/76/c0/f476c094676686716af87430efe020a6.jpg',
    builtin: true,
  }, {
    id: 'columbina',
    name: '哥伦比亚',
    description: '原神 - 哥伦比亚',
    pcBackground: 'https://patchwiki.biligame.com/images/ys/7/7c/d4lmgkm6twg4wr7o1qitzecyga7gzkj.png',
    mobileBackground: 'https://patchwiki.biligame.com/images/ys/7/7c/d4lmgkm6twg4wr7o1qitzecyga7gzkj.png',
    primaryColor: '#7bc862',
    accentColor: '#4caf50',
    thumbnail: 'https://static.wikia.nocookie.net/gensin-impact/images/3/35/Columbina_Icon.png',
    builtin: true,
  }, {
    id: 'pikachu',
    name: '皮卡丘',
    description: '宝可梦 - 皮卡丘',
    pcBackground: 'https://i.imgur.com/6QX2a1c.jpg',
    mobileBackground: 'https://i.pinimg.com/736x/b5/d3/94/b5d3942429c0ebde0f82f918c586a2d1.jpg',
    primaryColor: '#ffcb05',
    accentColor: '#ff8c00',
    thumbnail: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQVttVRVkCIB_sqN7hqn47u--NFfrBHc_LFxA&s',
    builtin: true,
  },
    {
    id: 'gawr-gura',
    name: 'Gawr Gura',
    description: 'Gawr Gura',
    pcBackground: 'https://scrmbl.imgix.net/posts-images/2025/04/gawr-gura-a.jpg',
    mobileBackground: 'https://scrmbl.imgix.net/posts-images/2025/04/gawr-gura-a.jpg',
    primaryColor: '#041a2e',
    accentColor: '#f0faff',
    thumbnail: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQoByJtauITQ6MxDMLQtqPHm1nVOekqlplF-w&s',
    builtin: true,
  },
  {
    id: 'umaru',
    name: 'Umaru Doma',
    description: 'Umaru Doma',
    pcBackground: 'https://haowallpaper.com/link/common/file/previewFileImg/15063312094498112',
    mobileBackground: 'https://haowallpaper.com/link/common/file/previewFileImg/15063312094498112',
    primaryColor: '#ffbb6e',
    accentColor: '#f3db21',
    thumbnail: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS5ahJ78xqViDQM_CW3j_GicdAp3T2iRqyzRQ&s',
    builtin: true,
  },
  {
    id: 'random-bing',
    name: '随机必应',
    description: '每次加载随机获取必应壁纸',
    pcBackground: 'https://images.524228.xyz/',
    mobileBackground: 'https://images.524228.xyz/',
    primaryColor: '#6968fd',
    accentColor: '#8b8aff',
    thumbnail: 'https://images.524228.xyz/',
    builtin: true,
  },
];

/**
 * 从 localStorage 获取用户自定义主题列表
 */
export function getCustomAnimeThemes(): AnimeTheme[] {
  try {
    const saved = localStorage.getItem('customAnimeThemes');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('读取自定义主题失败:', e);
  }
  return [];
}

/**
 * 保存用户自定义主题列表到 localStorage
 */
export function saveCustomAnimeThemes(themes: AnimeTheme[]): void {
  localStorage.setItem('customAnimeThemes', JSON.stringify(themes));
}

/**
 * 获取所有主题（内置 + 自定义）
 */
export function getAllAnimeThemes(): AnimeTheme[] {
  return [...builtinSolidThemes, ...builtinAnimeThemes, ...getCustomAnimeThemes()];
}

/**
 * 判断主题是否为纯色主题
 */
export function isSolidTheme(theme: AnimeTheme): boolean {
  return !!theme.solidColor;
}

/**
 * 添加自定义主题
 */
export function addCustomAnimeTheme(theme: Omit<AnimeTheme, 'id' | 'builtin'>): AnimeTheme {
  const customs = getCustomAnimeThemes();
  const newTheme: AnimeTheme = {
    ...theme,
    id: `custom-${Date.now()}`,
    builtin: false,
  };
  customs.push(newTheme);
  saveCustomAnimeThemes(customs);
  return newTheme;
}

/**
 * 更新自定义主题
 */
export function updateCustomAnimeTheme(id: string, updates: Partial<AnimeTheme>): void {
  const customs = getCustomAnimeThemes();
  const index = customs.findIndex(t => t.id === id);
  if (index !== -1) {
    customs[index] = { ...customs[index], ...updates, id, builtin: false };
    saveCustomAnimeThemes(customs);
  }
}

/**
 * 删除自定义主题
 */
export function deleteCustomAnimeTheme(id: string): void {
  const customs = getCustomAnimeThemes();
  saveCustomAnimeThemes(customs.filter(t => t.id !== id));
}

/**
 * 获取当前激活的二次元主题ID
 */
export function getActiveAnimeThemeId(): string | null {
  return localStorage.getItem('activeAnimeTheme');
}

/**
 * 设置当前激活的二次元主题ID
 */
export function setActiveAnimeThemeId(id: string | null): void {
  if (id) {
    localStorage.setItem('activeAnimeTheme', id);
  } else {
    localStorage.removeItem('activeAnimeTheme');
  }
}

/**
 * 判断当前是否为移动端
 */
export function isMobileDevice(): boolean {
  return window.innerWidth <= 768;
}

/**
 * 获取当前设备对应的背景图片URL
 */
export function getThemeBackground(theme: AnimeTheme): string {
  return isMobileDevice() ? theme.mobileBackground : theme.pcBackground;
}
