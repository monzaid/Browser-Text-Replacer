/**
 * 主题选择器 — 主题定义、应用、持久化 + Custom 取色器
 * 所有操作在 Shadow Root 内，通过 hostElement 设置 CSS 自定义属性
 */

import { getTheme, saveTheme } from '../../storage/store.js';

// ============================================================
// 主题 CSS 变量定义
// ============================================================

/** 预定义主题色表 */
export const themes = {
  dark: {
    '--tr-bg': '#252526',
    '--tr-text': '#cccccc',
    '--tr-border': '#454545',
    '--tr-input-bg': '#3c3c3c',
    '--tr-input-text': '#cccccc',
    '--tr-placeholder': '#858585',
    '--tr-btn-hover': '#3c3c3c',
    '--tr-btn-active-bg': '#454545',
    '--tr-accent': '#0e639c',
    '--tr-accent-text': '#ffffff',
    '--tr-highlight-match': 'rgba(255, 215, 0, 0.3)',
    '--tr-highlight-current': 'rgba(255, 100, 0, 0.5)',
    '--tr-overlay-match': 'rgba(255, 215, 0, 0.4)',
    '--tr-overlay-current': 'rgba(255, 100, 0, 0.6)',
    '--tr-scrollbar-track': '#1e1e1e',
    '--tr-scrollbar-thumb': '#424242',
    '--tr-success': '#4ec9b0',
    '--tr-warning': '#ce9178',
    '--tr-error': '#f14c4c',
  },
  light: {
    '--tr-bg': '#ffffff',
    '--tr-text': '#333333',
    '--tr-border': '#cccccc',
    '--tr-input-bg': '#f3f3f3',
    '--tr-input-text': '#333333',
    '--tr-placeholder': '#999999',
    '--tr-btn-hover': '#e8e8e8',
    '--tr-btn-active-bg': '#d4d4d4',
    '--tr-accent': '#0078d4',
    '--tr-accent-text': '#ffffff',
    '--tr-highlight-match': 'rgba(255, 200, 0, 0.4)',
    '--tr-highlight-current': 'rgba(255, 100, 0, 0.5)',
    '--tr-overlay-match': 'rgba(255, 200, 0, 0.4)',
    '--tr-overlay-current': 'rgba(255, 100, 0, 0.6)',
    '--tr-scrollbar-track': '#f3f3f3',
    '--tr-scrollbar-thumb': '#c1c1c1',
    '--tr-success': '#107c10',
    '--tr-warning': '#d83b01',
    '--tr-error': '#a80000',
  },
  auto: {
    '--tr-bg': '#252526',
    '--tr-text': '#cccccc',
    '--tr-border': '#454545',
    '--tr-input-bg': '#3c3c3c',
    '--tr-input-text': '#cccccc',
    '--tr-placeholder': '#858585',
    '--tr-btn-hover': '#3c3c3c',
    '--tr-btn-active-bg': '#454545',
    '--tr-accent': '#0e639c',
    '--tr-accent-text': '#ffffff',
    '--tr-highlight-match': 'rgba(255, 215, 0, 0.3)',
    '--tr-highlight-current': 'rgba(255, 100, 0, 0.5)',
    '--tr-overlay-match': 'rgba(255, 215, 0, 0.4)',
    '--tr-overlay-current': 'rgba(255, 100, 0, 0.6)',
    '--tr-scrollbar-track': '#1e1e1e',
    '--tr-scrollbar-thumb': '#424242',
    '--tr-success': '#4ec9b0',
    '--tr-warning': '#ce9178',
    '--tr-error': '#f14c4c',
  },
  custom: {
    '--tr-bg': '#252526',
    '--tr-text': '#cccccc',
    '--tr-border': '#454545',
    '--tr-input-bg': '#3c3c3c',
    '--tr-input-text': '#cccccc',
    '--tr-placeholder': '#858585',
    '--tr-btn-hover': '#3c3c3c',
    '--tr-btn-active-bg': '#454545',
    '--tr-accent': '#0e639c',
    '--tr-accent-text': '#ffffff',
    '--tr-highlight-match': 'rgba(255, 215, 0, 0.3)',
    '--tr-highlight-current': 'rgba(255, 100, 0, 0.5)',
    '--tr-overlay-match': 'rgba(255, 215, 0, 0.4)',
    '--tr-overlay-current': 'rgba(255, 100, 0, 0.6)',
    '--tr-scrollbar-track': '#1e1e1e',
    '--tr-scrollbar-thumb': '#424242',
    '--tr-success': '#4ec9b0',
    '--tr-warning': '#ce9178',
    '--tr-error': '#f14c4c',
  },
};

// ============================================================
// 预设色板定义
// ============================================================

export const presets = {
  monokai: {
    panelBg: '#272822',
    searchHighlight: '#a6e22e',
    previewHighlight: '#f92672',
  },
  nord: {
    panelBg: '#2e3440',
    searchHighlight: '#88c0d0',
    previewHighlight: '#a3be8c',
  },
  'solarized-dark': {
    panelBg: '#002b36',
    searchHighlight: '#268bd2',
    previewHighlight: '#b58900',
  },
  'solarized-light': {
    panelBg: '#fdf6e3',
    searchHighlight: '#268bd2',
    previewHighlight: '#cb4b16',
  },
  'one-dark': {
    panelBg: '#282c34',
    searchHighlight: '#e5c07b',
    previewHighlight: '#c678dd',
  },
};

// ============================================================
// 工具函数
// ============================================================

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  return `rgb(${Math.min(255, Math.round(r * factor))}, ${Math.min(255, Math.round(g * factor))}, ${Math.min(255, Math.round(b * factor))})`;
}

function darkenColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - percent / 100;
  return `rgb(${Math.max(0, Math.round(r * factor))}, ${Math.max(0, Math.round(g * factor))}, ${Math.max(0, Math.round(b * factor))})`;
}

// ============================================================
// 主题应用
// ============================================================

/**
 * 将主题变量应用到 hostElement
 * @param {string} mode - 'dark' | 'light' | 'auto' | 'custom'
 * @param {HTMLElement} hostElement - Shadow DOM host
 */
export function applyTheme(mode, hostElement) {
  if (!hostElement) return;

  const vars = themes[mode] || themes['dark'];
  for (const [key, value] of Object.entries(vars)) {
    hostElement.style.setProperty(key, value);
  }

  // Auto 模式：根据系统偏好
  if (mode === 'auto') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      for (const [key, value] of Object.entries(themes['dark'])) {
        hostElement.style.setProperty(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(themes['light'])) {
        hostElement.style.setProperty(key, value);
      }
    }
  }

  // 保存模式，同时保留已有的 custom 配置（避免 saveTheme({ mode }) 覆盖 custom）
  getTheme().then(existing => {
    const config = { mode };
    if (existing.custom) config.custom = existing.custom;
    saveTheme(config);
  });
}

/**
 * 初始化主题：从存储加载并应用
 * @param {HTMLElement} hostElement
 */
export async function initTheme(hostElement) {
  const config = await getTheme();
  const mode = config.mode || 'auto';

  if (mode === 'custom' && config.custom) {
    applyCustomColors(
      config.custom.panelBg || '#252526',
      config.custom.searchHighlight || '#ffd700',
      config.custom.previewHighlight || '#00ff00',
      hostElement
    );
    saveTheme({ mode: 'custom', custom: config.custom });
  } else {
    applyTheme(mode, hostElement);
  }
}

// ============================================================
// Custom 模式取色器
// ============================================================

/**
 * 应用自定义取色器颜色到 hostElement
 * @param {string} panelColor - 面板主色
 * @param {string} searchColor - 搜索高亮色
 * @param {string} previewColor - 预览高亮色
 * @param {HTMLElement} hostElement
 */
export function applyCustomColors(panelColor, searchColor, previewColor, hostElement) {
  if (!hostElement) return;

  const panelRGB = hexToRgb(panelColor);
  const isDark = (panelRGB.r * 0.299 + panelRGB.g * 0.587 + panelRGB.b * 0.114) < 128;

  hostElement.style.setProperty('--tr-bg', panelColor);
  hostElement.style.setProperty('--tr-text', isDark ? '#e0e0e0' : '#222222');
  hostElement.style.setProperty('--tr-border', isDark ? '#454545' : '#cccccc');
  hostElement.style.setProperty('--tr-input-bg', isDark ? lightenColor(panelColor, 10) : darkenColor(panelColor, 5));
  hostElement.style.setProperty('--tr-input-text', isDark ? '#e0e0e0' : '#222222');
  hostElement.style.setProperty('--tr-placeholder', isDark ? '#858585' : '#999999');
  hostElement.style.setProperty('--tr-btn-hover', isDark ? lightenColor(panelColor, 8) : darkenColor(panelColor, 8));
  hostElement.style.setProperty('--tr-btn-active-bg', isDark ? lightenColor(panelColor, 16) : darkenColor(panelColor, 16));
  hostElement.style.setProperty('--tr-accent', '#0e639c');
  hostElement.style.setProperty('--tr-accent-text', '#ffffff');

  // 搜索高亮色
  hostElement.style.setProperty('--tr-highlight-match', hexToRgba(searchColor, 0.3));
  hostElement.style.setProperty('--tr-highlight-current', hexToRgba(searchColor, 0.5));
  hostElement.style.setProperty('--tr-overlay-match', hexToRgba(searchColor, 0.4));
  hostElement.style.setProperty('--tr-overlay-current', hexToRgba(searchColor, 0.6));

  // 预览高亮色
  hostElement.style.setProperty('--tr-preview-selected', hexToRgba(previewColor, 0.4));

  // 滚动条
  hostElement.style.setProperty('--tr-scrollbar-track', isDark ? '#1e1e1e' : '#f3f3f3');
  hostElement.style.setProperty('--tr-scrollbar-thumb', isDark ? '#424242' : '#c1c1c1');

  hostElement.style.setProperty('--tr-success', isDark ? '#4ec9b0' : '#107c10');
  hostElement.style.setProperty('--tr-warning', isDark ? '#ce9178' : '#d83b01');
  hostElement.style.setProperty('--tr-error', isDark ? '#f14c4c' : '#a80000');
}

/**
 * 应用预设色板
 * @param {string} presetName - 预设名
 * @param {HTMLElement} hostElement
 */
function applyPreset(presetName, hostElement) {
  const preset = presets[presetName];
  if (!preset) return;

  applyCustomColors(preset.panelBg, preset.searchHighlight, preset.previewHighlight, hostElement);
  saveTheme({
    mode: 'custom',
    custom: {
      panelBg: preset.panelBg,
      searchHighlight: preset.searchHighlight,
      previewHighlight: preset.previewHighlight,
    },
  });
}

/**
 * 在容器中渲染 Custom 取色器面板
 * @param {HTMLElement} container - 取色器容器元素
 * @param {HTMLElement} hostElement - Shadow DOM host
 */
export function renderCustomPicker(container, hostElement) {
  const pickerHTML = `
    <div class="tr-custom-picker" style="padding:8px 12px;">
      <div class="tr-picker-item" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">面板主色</label>
        <input type="color" id="tr-color-panel" value="#252526" style="width:32px;height:22px;border:none;border-radius:2px;cursor:pointer;background:transparent;padding:0;">
      </div>
      <div class="tr-picker-item" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">搜索高亮色</label>
        <input type="color" id="tr-color-search-hl" value="#ffd700" style="width:32px;height:22px;border:none;border-radius:2px;cursor:pointer;background:transparent;padding:0;">
      </div>
      <div class="tr-picker-item" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">预览高亮色</label>
        <input type="color" id="tr-color-preview-hl" value="#00ff00" style="width:32px;height:22px;border:none;border-radius:2px;cursor:pointer;background:transparent;padding:0;">
      </div>
      <div class="tr-picker-presets">
        <label style="font-size:11px;font-weight:600;color:var(--tr-placeholder,#858585);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">预设色板</label>
        <div class="tr-preset-grid" style="display:flex;flex-wrap:wrap;gap:4px;">
          <button class="tr-preset-btn" data-preset="monokai" style="background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 8px;border-radius:3px;">Monokai</button>
          <button class="tr-preset-btn" data-preset="nord" style="background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 8px;border-radius:3px;">Nord</button>
          <button class="tr-preset-btn" data-preset="solarized-dark" style="background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 8px;border-radius:3px;">Solarized Dark</button>
          <button class="tr-preset-btn" data-preset="solarized-light" style="background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 8px;border-radius:3px;">Solarized Light</button>
          <button class="tr-preset-btn" data-preset="one-dark" style="background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 8px;border-radius:3px;">One Dark</button>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = pickerHTML;

  // 获取取色器元素
  const panelPicker = container.querySelector('#tr-color-panel');
  const searchHlPicker = container.querySelector('#tr-color-search-hl');
  const previewHlPicker = container.querySelector('#tr-color-preview-hl');

  // 从已保存的自定义配置加载初始值
  getTheme().then(config => {
    if (config.mode === 'custom' && config.custom) {
      panelPicker.value = config.custom.panelBg || '#252526';
      searchHlPicker.value = config.custom.searchHighlight || '#ffd700';
      previewHlPicker.value = config.custom.previewHighlight || '#00ff00';
      applyCustomColors(panelPicker.value, searchHlPicker.value, previewHlPicker.value, hostElement);
    }
  });

  // 取色器变更事件
  const updateCustom = () => {
    applyCustomColors(panelPicker.value, searchHlPicker.value, previewHlPicker.value, hostElement);
    saveTheme({
      mode: 'custom',
      custom: {
        panelBg: panelPicker.value,
        searchHighlight: searchHlPicker.value,
        previewHighlight: previewHlPicker.value,
      },
    });
  };

  panelPicker.addEventListener('input', updateCustom);
  searchHlPicker.addEventListener('input', updateCustom);
  previewHlPicker.addEventListener('input', updateCustom);

  // 预设色板事件
  container.querySelectorAll('.tr-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetName = btn.dataset.preset;
      const preset = presets[presetName];
      if (!preset) return;

      // 更新取色器显示值
      panelPicker.value = preset.panelBg;
      searchHlPicker.value = preset.searchHighlight;
      previewHlPicker.value = preset.previewHighlight;

      applyPreset(presetName, hostElement);
    });
  });

  // 预设按钮 hover 效果
  container.querySelectorAll('.tr-preset-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--tr-btn-hover,#3c3c3c)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'var(--tr-input-bg,#3c3c3c)';
    });
  });
}
