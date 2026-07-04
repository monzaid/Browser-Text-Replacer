/**
 * 替换栏 - 替换输入框 + 替换/预览按钮
 */
import { UIConstants, Icons } from '../../shared/constants.js';
import { proxy } from '../message-proxy.js';
import { getHistory, savePreset, getPresets, deletePreset, exportPresets, importPresets, updatePreset, getTheme, saveTheme, deleteHistoryItem } from '../../storage/store.js';
import { applyTheme, initTheme, applyCustomColors } from './theme-picker.js';

// ============================================================
// Toast 提示
// ============================================================
let toastTimer = null;

function showToast(message) {
  const panel = _getPanelElement ? _getPanelElement() : null;
  if (!panel) return;
  
  const oldToast = panel.querySelector('#tr-toast');
  if (oldToast) oldToast.remove();
  if (toastTimer) clearTimeout(toastTimer);
  
  const toast = document.createElement('div');
  toast.id = 'tr-toast';
  toast.style.cssText = 'position:absolute;top:-30px;left:50%;transform:translateX(-50%);padding:4px 14px;font-size:12px;color:var(--tr-success,#4ec9b0);background:var(--tr-bg,#252526);border:1px solid var(--tr-border,#454545);border-radius:4px;z-index:100;white-space:nowrap;pointer-events:none;';
  toast.textContent = message;
  panel.appendChild(toast);
  
  toastTimer = setTimeout(() => {
    toast.remove();
    toastTimer = null;
  }, 1000);
}

// ============================================================
// 自定义确认弹窗（替代 confirm）
// ============================================================
function showConfirm(message) {
  return new Promise((resolve) => {
    const panel = _getPanelElement ? _getPanelElement() : null;
    if (!panel) { resolve(false); return; }
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:50;display:flex;align-items:center;justify-content:center;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--tr-bg,#252526);border:1px solid var(--tr-border,#454545);border-radius:4px;padding:16px 20px;max-width:300px;text-align:center;';
    box.innerHTML = `
      <div style="font-size:13px;color:var(--tr-text,#ccc);margin-bottom:12px;">${message}</div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button id="tr-confirm-ok" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-accent,#0e639c);border:none;color:var(--tr-accent-text,#fff);border-radius:2px;">确认</button>
        <button id="tr-confirm-cancel" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">取消</button>
      </div>
    `;
    overlay.appendChild(box);
    panel.appendChild(overlay);
    
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    
    box.querySelector('#tr-confirm-ok').addEventListener('click', () => cleanup(true));
    box.querySelector('#tr-confirm-cancel').addEventListener('click', () => cleanup(false));
  });
}

// ============================================================
// 自定义输入弹窗（替代 prompt）
// ============================================================
function showPrompt(title, defaultValue) {
  return new Promise((resolve) => {
    const panel = _getPanelElement ? _getPanelElement() : null;
    if (!panel) { resolve(null); return; }
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:50;display:flex;align-items:center;justify-content:center;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--tr-bg,#252526);border:1px solid var(--tr-border,#454545);border-radius:4px;padding:16px 20px;max-width:300px;';
    box.innerHTML = `
      <div style="font-size:13px;color:var(--tr-text,#ccc);margin-bottom:8px;">${title}</div>
      <input id="tr-prompt-input" type="text" value="${escapeHtml(defaultValue || '')}" autocomplete="off" style="width:100%;height:28px;padding:0 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;box-sizing:border-box;margin-bottom:12px;">
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="tr-prompt-ok" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-accent,#0e639c);border:none;color:var(--tr-accent-text,#fff);border-radius:2px;">确认</button>
        <button id="tr-prompt-cancel" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">取消</button>
      </div>
    `;
    overlay.appendChild(box);
    panel.appendChild(overlay);
    
    const input = box.querySelector('#tr-prompt-input');
    setTimeout(() => { input.focus(); input.select(); }, 50);
    
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    
    box.querySelector('#tr-prompt-ok').addEventListener('click', () => cleanup(input.value.trim()));
    box.querySelector('#tr-prompt-cancel').addEventListener('click', () => cleanup(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input.value.trim());
      if (e.key === 'Escape') cleanup(null);
    });
  });
}

/** 预览模式标记 */
let isPreviewMode = false;

/** overlay 事件处理器引用（用于解绑） */
let overlayClickHandler = null;

/** 面板元素引用（辅助函数需要） */
let _getPanelElement = null;
let _historyPanel = null;
let _customPanel = null;

/** 自定义弹窗引用（模块级函数需要） */
let _modalState = null;

/**
 * 渲染替换栏到指定容器
 * @param {HTMLElement} container
 * @param {Object} searchOptions - 共享搜索选项 { matchCase, matchWord, useRegex }
 * @param {Function} getPanelElement - 获取面板 DOM 引用
 */
export function renderReplaceBar(container, searchOptions, getPanelElement) {
  _getPanelElement = getPanelElement;

  const replaceRow = document.createElement('div');
  replaceRow.className = 'tr-input-row tr-replace-row tr-replace-visible';
  replaceRow.id = 'tr-replace-row';

  replaceRow.innerHTML = `
    <div class="tr-input-wrapper">
      <textarea id="${UIConstants.REPLACE_INPUT_ID}" placeholder="替换" rows="1" autocomplete="off" spellcheck="false"></textarea>
    </div>
    <div class="tr-toolbar">
      <button class="tr-btn tr-replace-btn" id="${UIConstants.REPLACE_ONE_BTN_ID}" title="替换当前匹配" disabled>${Icons.REPLACE_ONE}</button>
      <button class="tr-btn tr-replace-all-btn" id="${UIConstants.REPLACE_ALL_BTN_ID}" title="替换全部匹配" disabled>${Icons.REPLACE_ALL}</button>
      <button class="tr-btn tr-tool-btn" id="tr-theme-btn" title="切换主题">🔄</button>
      <button class="tr-btn tr-tool-btn" id="tr-history-btn" title="历史/预设">📋</button>
      <button class="tr-btn tr-tool-btn" id="tr-preview-btn" title="预览替换">👁</button>
      <button class="tr-btn tr-tool-btn" id="tr-apply-preview-btn" title="应用预览替换" disabled>✓</button>
    </div>
  `;

  container.appendChild(replaceRow);

  // ============================================================
  // Custom 主题面板（仅 custom 模式展开）
  // ============================================================
  const customPanel = document.createElement('div');
  _customPanel = customPanel;
  customPanel.id = 'tr-custom-panel';
  customPanel.className = 'tr-input-row';
  customPanel.style.cssText = 'display:none;flex-direction:column;gap:6px;padding:6px 0;border-bottom:none;align-items:stretch;';
  customPanel.innerHTML = `
    <div style="display:flex;align-items:center;padding:4px 0;">
      <span style="font-size:12px;font-weight:600;color:var(--tr-text,#ccc);">🎨 自定义主题</span>
      <button id="tr-custom-close" style="margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:16px;color:var(--tr-text,#ccc);padding:0 4px;" title="关闭">&times;</button>
    </div>
    <div style="display:flex;flex-direction:row;gap:10px;align-items:center;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:4px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">面板主色</label>
        <input type="color" id="tr-color-panel" style="width:28px;height:22px;border:none;border-radius:2px;cursor:pointer;padding:0;background:transparent;">
        <span id="tr-color-panel-hex" style="font-size:10px;color:var(--tr-placeholder,#858585);font-family:monospace;">#252526</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">搜索高亮</label>
        <input type="color" id="tr-color-search" style="width:28px;height:22px;border:none;border-radius:2px;cursor:pointer;padding:0;background:transparent;">
        <span id="tr-color-search-hex" style="font-size:10px;color:var(--tr-placeholder,#858585);font-family:monospace;">#ffd700</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">预览高亮</label>
        <input type="color" id="tr-color-preview" style="width:28px;height:22px;border:none;border-radius:2px;cursor:pointer;padding:0;background:transparent;">
        <span id="tr-color-preview-hex" style="font-size:10px;color:var(--tr-placeholder,#858585);font-family:monospace;">#00ff00</span>
      </div>
    </div>
    <div style="height:1px;background:var(--tr-border,#454545);margin:2px 0;"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:10px;font-weight:600;color:var(--tr-placeholder,#858585);text-transform:uppercase;">预设色板</span>
      <div style="display:flex;gap:4px;">
        <button id="tr-preset-save-color-btn" title="保存当前颜色为预设" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">💾</button>
        <button id="tr-preset-batch-del-color-btn" title="批量删除预设" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-error,#f14c4c);border-radius:2px;">🗑</button>
      </div>
    </div>
    <div id="tr-custom-preset-btns" style="display:flex;gap:4px;flex-wrap:wrap;">
      <button class="tr-preset-btn" data-preset="monokai" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Monokai</button>
      <button class="tr-preset-btn" data-preset="nord" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Nord</button>
      <button class="tr-preset-btn" data-preset="solarized-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Dark</button>
      <button class="tr-preset-btn" data-preset="solarized-light" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Light</button>
      <button class="tr-preset-btn" data-preset="one-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">One Dark</button>
    </div>
  `;
  container.appendChild(customPanel);

  // ============================================================
  // 历史/预设面板
  // ============================================================
  const historyPanel = document.createElement('div');
  _historyPanel = historyPanel;
  historyPanel.id = 'tr-history-panel';
  historyPanel.className = 'tr-input-row';
  historyPanel.style.cssText = 'display:none;flex-direction:column;padding:0;border-bottom:none;align-items:stretch;';
  historyPanel.innerHTML = `
    <div style="display:flex;align-items:center;border-bottom:1px solid var(--tr-border,#454545);padding:0;">
      <button class="tr-history-tab active" data-tab="history" style="flex:1;padding:6px 14px;font-size:12px;cursor:pointer;border:none;background:transparent;color:var(--tr-text,#ccc);border-bottom:2px solid var(--tr-accent,#0e639c);margin-bottom:-1px;text-align:center;">历史记录</button>
      <button class="tr-history-tab" data-tab="presets" style="flex:1;padding:6px 14px;font-size:12px;cursor:pointer;border:none;background:transparent;color:var(--tr-placeholder,#858585);border-bottom:2px solid transparent;margin-bottom:-1px;text-align:center;">预设规则</button>
      <button id="tr-history-close" style="margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:16px;color:var(--tr-text,#ccc);padding:0 4px;" title="关闭">&times;</button>
    </div>
    <div id="tr-history-list" style="padding:8px 0;word-break:break-all;overflow-wrap:break-word;"></div>
    <div id="tr-presets-container" style="display:none;flex-direction:column;">
      <div style="padding:8px 0;display:flex;gap:6px;align-items:center;">
        <button id="tr-preset-search" style="display:none;">占位</button>
        <input id="tr-preset-search-input" type="text" placeholder="搜索预设..." style="flex:1;min-width:0;height:24px;padding:0 8px;font-size:12px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;">
        <button id="tr-preset-add-btn" title="新增预设" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">➕</button>
        <button id="tr-preset-import-btn" title="导入预设" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">📥</button>
        <button id="tr-preset-export-btn" title="导出全部预设" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">📤</button>
        <button id="tr-preset-batch-del-btn" title="批量删除" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-error,#f14c4c);border-radius:2px;">🗑</button>
        <input type="file" id="tr-preset-file-input" accept=".json" style="display:none;">
      </div>
      <div id="tr-preset-list" style="padding:0 0 8px;word-break:break-all;overflow-wrap:break-word;"></div>
    </div>
  `;
  container.appendChild(historyPanel);

  // ============================================================
  // 自定义弹窗（用于新增/修改预设）
  // ============================================================
  const presetModal = document.createElement('div');
  presetModal.id = 'tr-preset-modal';
  presetModal.style.cssText = 'display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:var(--tr-bg,#252526);z-index:10;flex-direction:column;padding:12px;gap:8px;';
  presetModal.innerHTML = `
    <div style="display:flex;align-items:center;">
      <span id="tr-modal-title" style="font-size:13px;font-weight:600;color:var(--tr-text,#ccc);">新增预设</span>
      <button id="tr-modal-close" style="margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:18px;color:var(--tr-text,#ccc);padding:0 4px;" title="关闭">&times;</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:var(--tr-placeholder,#858585);">预设名称</label>
      <input id="tr-modal-name" type="text" placeholder="预设名称" autocomplete="off" style="height:28px;padding:0 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;">
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:var(--tr-placeholder,#858585);">搜索文本</label>
      <textarea id="tr-modal-find" placeholder="搜索文本" rows="2" autocomplete="off" spellcheck="false" style="padding:4px 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;resize:vertical;font-family:inherit;line-height:1.4;min-height:28px;box-sizing:border-box;"></textarea>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:var(--tr-placeholder,#858585);">替换文本（可为空）</label>
      <textarea id="tr-modal-replace" placeholder="替换文本（可为空）" rows="2" autocomplete="off" spellcheck="false" style="padding:4px 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;resize:vertical;font-family:inherit;line-height:1.4;min-height:28px;box-sizing:border-box;"></textarea>
    </div>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:4px;">
      <button id="tr-modal-submit" style="height:28px;padding:0 16px;font-size:12px;cursor:pointer;background:var(--tr-accent,#0e639c);border:none;color:var(--tr-accent-text,#fff);border-radius:2px;">提交</button>
      <button id="tr-modal-submit-next" style="height:28px;padding:0 12px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">提交并继续</button>
    </div>
  `;
  container.appendChild(presetModal);

  // 弹窗事件 — 存入模块级变量供 bindPresetEventsForPanel / loadPresetItemsForPanel 使用
  const modalTitle = presetModal.querySelector('#tr-modal-title');
  const modalName = presetModal.querySelector('#tr-modal-name');
  const modalFind = presetModal.querySelector('#tr-modal-find');
  const modalReplace = presetModal.querySelector('#tr-modal-replace');

  _modalState = {
    modal: presetModal,
    modalTitle,
    modalName,
    modalFind,
    modalReplace,
    mode: 'add',
    editingPresetId: null,
  };

  // 搜索文本变化 → 动态更新名称输入框 placeholder
  modalFind.addEventListener('input', () => {
    const text = modalFind.value.trim();
    modalName.placeholder = text || '预设名称（为空取搜索文本）';
  });

  presetModal.querySelector('#tr-modal-close').addEventListener('click', closeModal);

  presetModal.querySelector('#tr-modal-submit').addEventListener('click', () => submitModal(false));
  presetModal.querySelector('#tr-modal-submit-next').addEventListener('click', () => submitModal(true));

  // Tab 切换逻辑
  historyPanel.querySelectorAll('.tr-history-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      // 切换 active 样式
      historyPanel.querySelectorAll('.tr-history-tab').forEach(t => {
        t.style.color = 'var(--tr-placeholder,#858585)';
        t.style.borderBottomColor = 'transparent';
      });
      tab.style.color = 'var(--tr-text,#ccc)';
      tab.style.borderBottomColor = 'var(--tr-accent,#0e639c)';

      // 切换内容（使用 historyPanel.querySelector 而非 document.getElementById，元素在 Shadow DOM 内）
      const historyList = historyPanel.querySelector('#tr-history-list');
      const presetsContainer = historyPanel.querySelector('#tr-presets-container');
      if (historyList) historyList.style.display = tabName === 'history' ? '' : 'none';
      if (presetsContainer) presetsContainer.style.display = tabName === 'presets' ? 'flex' : 'none';

      if (tabName === 'history') loadHistoryItemsForPanel(historyPanel);
      if (tabName === 'presets') {
        loadPresetItemsForPanel(historyPanel);
        bindPresetEventsForPanel(historyPanel);
      }
    });
  });

  // ============================================================
  // 🎨 主题按钮逻辑
  // ============================================================
  const THEME_MODES = ['auto', 'light', 'dark', 'custom'];
  const THEME_ICONS = { auto: '🔄', light: '☀️', dark: '🌙', custom: '🎨' };
  let currentThemeMode = 'auto';

  const themeBtn = replaceRow.querySelector('#tr-theme-btn');

  function openCustomPanel() {
    customPanel.style.display = 'flex';
    // 加载上次保存的 custom 颜色到取色器并应用
    loadAndApplyCustomColors();
    // 刷新预设区（硬编码 + 用户颜色预设）
    renderAllPresetsInCustomPanel(customPanel);
  }
  function closeCustomPanel() { customPanel.style.display = 'none'; }

  async function loadAndApplyCustomColors() {
    try {
      const config = await getTheme();
      const host = document.getElementById('text-replacer-host');
      // 只要存在 custom 配置就应用（不依赖 mode 字段，因为上次保存的可能不是 custom）
      if (config.custom && host) {
        const pc = config.custom.panelBg || '#252526';
        const sc = config.custom.searchHighlight || '#ffd700';
        const pr = config.custom.previewHighlight || '#00ff00';
        applyCustomColors(pc, sc, pr, host);
        // 恢复取色器值
        const pi = customPanel.querySelector('#tr-color-panel');
        const si = customPanel.querySelector('#tr-color-search');
        const vi = customPanel.querySelector('#tr-color-preview');
        if (pi) { pi.value = pc; const hexEl = customPanel.querySelector('#tr-color-panel-hex'); if (hexEl) hexEl.textContent = pc; }
        if (si) { si.value = sc; const hexEl = customPanel.querySelector('#tr-color-search-hex'); if (hexEl) hexEl.textContent = sc; }
        if (vi) { vi.value = pr; const hexEl = customPanel.querySelector('#tr-color-preview-hex'); if (hexEl) hexEl.textContent = pr; }
      }
    } catch (_) { /* storage 不可用时静默 */ }
  }

  class ThemeCycler {
    constructor() {
      this.modes = THEME_MODES;
      this.currentIdx = 0;
      this.load();
    }
    async load() {
      const config = await getTheme();
      this.currentIdx = this.modes.indexOf(config.mode || 'auto');
      if (this.currentIdx < 0) this.currentIdx = 0;
      currentThemeMode = this.modes[this.currentIdx];

      // 重新应用当前主题
      const host = document.getElementById('text-replacer-host');
      // 优先检查 custom 配置（可能上次保存模式非 custom 但 custom 颜色存在）
      if (config.custom) {
        await loadAndApplyCustomColors();
        if (host) {
          applyCustomColors(config.custom.panelBg || '#252526', config.custom.searchHighlight || '#ffd700', config.custom.previewHighlight || '#00ff00', host);
        }
      } else if (host) {
        applyTheme(currentThemeMode, host);
      }

      this.updateUI();
    }
    next() {
      const prevMode = this.modes[this.currentIdx];
      
      // 如果当前是 custom 且面板已关闭 → 直接展示面板，不切换模式
      if (prevMode === 'custom' && customPanel.style.display !== 'flex') {
        console.log('[Theme] custom was hidden → re-showing panel');
        loadAndApplyCustomColors();
        openCustomPanel();
        this.updateUI();
        return;
      }
      
      this.currentIdx = (this.currentIdx + 1) % this.modes.length;
      const mode = this.modes[this.currentIdx];
      console.log('[Theme] next →', mode, '| customPanel visible:', customPanel.style.display === 'flex');
      
      if (mode === 'custom') {
        if (customPanel.style.display === 'flex') {
          console.log('[Theme] custom panel visible → closing + skip to auto');
          closeCustomPanel();
          this.currentIdx = (this.currentIdx + 1) % this.modes.length;
          const nextMode = this.modes[this.currentIdx];
          currentThemeMode = nextMode;
          const host = document.getElementById('text-replacer-host');
          applyTheme(nextMode, host);
        } else {
          console.log('[Theme] custom panel hidden → showing');
          currentThemeMode = mode;
          loadAndApplyCustomColors();
          openCustomPanel();
        }
      } else {
        currentThemeMode = mode;
        const host = document.getElementById('text-replacer-host');
        applyTheme(mode, host);
        closeCustomPanel();
      }
      this.updateUI();
    }
    updateUI() {
      const mode = this.modes[this.currentIdx];
      themeBtn.textContent = THEME_ICONS[mode];
      themeBtn.title = `主题: ${mode}`;
    }
  }

  const themeCycler = new ThemeCycler();
  themeBtn.addEventListener('click', () => themeCycler.next());

  // Custom 面板关闭按钮 — 仅关闭面板，不改变当前 custom 主题
  const closeBtn = customPanel.querySelector('#tr-custom-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeCustomPanel();
    });
  }

  // 取色器 change 事件
  ['tr-color-panel', 'tr-color-search', 'tr-color-preview'].forEach(id => {
    const el = customPanel.querySelector(`#${id}`);
    const hexEl = customPanel.querySelector(`#${id}-hex`);
    if (el) {
      el.addEventListener('input', () => {
        const host = document.getElementById('text-replacer-host');
        if (!host) return;
        const panelColor = customPanel.querySelector('#tr-color-panel')?.value || '#252526';
        const searchColor = customPanel.querySelector('#tr-color-search')?.value || '#ffd700';
        const previewColor = customPanel.querySelector('#tr-color-preview')?.value || '#00ff00';
        applyCustomColors(panelColor, searchColor, previewColor, host);
        saveTheme({ mode: 'custom', custom: { panelBg: panelColor, searchHighlight: searchColor, previewHighlight: previewColor } });
        // 同步 hex 值
        if (hexEl) hexEl.textContent = el.value;
      });
    }
  });

  // 预设色板按钮
  customPanel.querySelectorAll('.tr-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetName = btn.dataset.preset;
      const preset = { monokai: { panelBg: '#272822', searchHighlight: '#a6e22e', previewHighlight: '#f92672' }, nord: { panelBg: '#2e3440', searchHighlight: '#88c0d0', previewHighlight: '#a3be8c' }, 'solarized-dark': { panelBg: '#002b36', searchHighlight: '#268bd2', previewHighlight: '#b58900' }, 'solarized-light': { panelBg: '#fdf6e3', searchHighlight: '#268bd2', previewHighlight: '#cb4b16' }, 'one-dark': { panelBg: '#282c34', searchHighlight: '#e5c07b', previewHighlight: '#c678dd' } }[presetName];
      if (!preset) return;
      const host = document.getElementById('text-replacer-host');
      if (!host) return;
      const panelPicker = customPanel.querySelector('#tr-color-panel');
      const searchPicker = customPanel.querySelector('#tr-color-search');
      const previewPicker = customPanel.querySelector('#tr-color-preview');
      if (panelPicker) panelPicker.value = preset.panelBg;
      if (searchPicker) searchPicker.value = preset.searchHighlight;
      if (previewPicker) previewPicker.value = preset.previewHighlight;
      applyCustomColors(preset.panelBg, preset.searchHighlight, preset.previewHighlight, host);
      saveTheme({ mode: 'custom', custom: { panelBg: preset.panelBg, searchHighlight: preset.searchHighlight, previewHighlight: preset.previewHighlight } });
      // 同步 hex 值
      const hexPanel = customPanel.querySelector('#tr-color-panel-hex');
      const hexSearch = customPanel.querySelector('#tr-color-search-hex');
      const hexPreview = customPanel.querySelector('#tr-color-preview-hex');
      if (hexPanel) hexPanel.textContent = preset.panelBg;
      if (hexSearch) hexSearch.textContent = preset.searchHighlight;
      if (hexPreview) hexPreview.textContent = preset.previewHighlight;
    });
  });

  // 保存颜色预设按钮
  const saveColorPresetBtn = customPanel.querySelector('#tr-preset-save-color-btn');
  if (saveColorPresetBtn) {
    saveColorPresetBtn.addEventListener('click', async () => {
      const pc = customPanel.querySelector('#tr-color-panel')?.value || '#252526';
      const sc = customPanel.querySelector('#tr-color-search')?.value || '#ffd700';
      const pr = customPanel.querySelector('#tr-color-preview')?.value || '#00ff00';
      const name = await showPrompt('预设名称:', `自定义 ${pc}`);
      if (name) {
        try {
          await savePreset(name, `__color_preset__${JSON.stringify({ panelBg: pc, searchHighlight: sc, previewHighlight: pr })}`, '', {});
          showToast(`${name} 保存成功`);
          // 刷新自定义面板预设区 — 展示用户保存的颜色预设
          await renderAllPresetsInCustomPanel(customPanel);
          // 同时刷新历史面板预设Tab列表
          if (_historyPanel) {
            const presetsContainer = _historyPanel.querySelector('#tr-presets-container');
            if (presetsContainer && presetsContainer.style.display !== 'none') {
              loadPresetItemsForPanel(_historyPanel);
            }
          }
        } catch (err) {
          showToast('保存失败: ' + err.message);
        }
      }
    });
  }

  // 自定义面板批量删除颜色预设按钮
  const batchDelColorBtn = customPanel.querySelector('#tr-preset-batch-del-color-btn');
  if (batchDelColorBtn) {
    let colorBatchMode = false;
    let colorSelectedIds = new Set();

    // 退出批量模式并恢复UI
    const exitColorBatchMode = async () => {
      colorBatchMode = false;
      colorSelectedIds.clear();
      batchDelColorBtn.textContent = '🗑';
      batchDelColorBtn.title = '批量删除预设';
      await renderAllPresetsInCustomPanel(customPanel);
    };
    
    batchDelColorBtn.addEventListener('click', async () => {
      if (!colorBatchMode) {
        // 进入批量选择模式 — 只显示颜色预设
        colorBatchMode = true;
        colorSelectedIds.clear();
        batchDelColorBtn.textContent = '✓';
        batchDelColorBtn.title = '确认删除';
        await loadColorPresetsForBatch(customPanel, true, colorSelectedIds);
      } else {
        // 无选中 → 直接退出批量模式，不提示
        if (colorSelectedIds.size === 0) {
          await exitColorBatchMode();
          return;
        }
        const ok = await showConfirm(`确认删除 ${colorSelectedIds.size} 条颜色预设？`);
        if (!ok) {
          // 用户取消 → 也退出批量模式
          await exitColorBatchMode();
          return;
        }
        for (const id of colorSelectedIds) {
          try { await deletePreset(id); } catch (_) {}
        }
        await exitColorBatchMode();
        // 同时刷新历史面板预设Tab列表
        if (_historyPanel) {
          const presetsContainer = _historyPanel.querySelector('#tr-presets-container');
          if (presetsContainer && presetsContainer.style.display !== 'none') {
            loadPresetItemsForPanel(_historyPanel);
          }
        }
        showToast('删除成功');
      }
    });
  }

  // ============================================================
  // 📋 历史/预设按钮逻辑
  // ============================================================
  const historyBtn = replaceRow.querySelector('#tr-history-btn');

  historyBtn.addEventListener('click', () => {
    if (historyPanel.style.display === 'flex') {
      historyPanel.style.display = 'none';
    } else {
      historyPanel.style.display = 'flex';
      // 默认选中"历史记录" Tab
      const historyTab = historyPanel.querySelector('[data-tab="history"]');
      if (historyTab) historyTab.click();
    }
  });

  const historyCloseBtn = historyPanel.querySelector('#tr-history-close');
  if (historyCloseBtn) {
    historyCloseBtn.addEventListener('click', () => {
      historyPanel.style.display = 'none';
    });
  }

  // 绑定替换按钮
  const replaceOneBtn = replaceRow.querySelector(`#${UIConstants.REPLACE_ONE_BTN_ID}`);
  const replaceAllBtn = replaceRow.querySelector(`#${UIConstants.REPLACE_ALL_BTN_ID}`);
  const replaceInput = replaceRow.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
  const previewBtn = replaceRow.querySelector('#tr-preview-btn');
  const applyPreviewBtn = replaceRow.querySelector('#tr-apply-preview-btn');

  // JS 初始化隐藏预览/应用按钮（避免 inline style 与 flex context 交互异常）
  previewBtn.style.display = 'none';
  applyPreviewBtn.style.display = 'none';

  // textarea 内联样式适配
  if (replaceInput) {
    replaceInput.style.cssText =
      'width:100%;padding:4px 8px;font-size:13px;' +
      'color:var(--tr-input-text,#cccccc);background:var(--tr-input-bg,#3c3c3c);' +
      'border:1px solid var(--tr-input-bg,#3c3c3c);border-radius:2px;' +
      'outline:none;box-sizing:border-box;resize:vertical;' +
      'font-family:inherit;line-height:1.4;min-height:22px;';
  }

  // 替换当前匹配的智能跳转标记（当前匹配不可见时首次跳转）
  let hasJumpedToCurrent = false;

  // 搜索/导航更新时重置标记
  const unsubMatches = proxy.on('matches:updated', () => {
    hasJumpedToCurrent = false;
  });

  replaceOneBtn.addEventListener('click', async () => {
    const isMatchVisible = await proxy.command('isCurrentMatchInViewport');
    
    // 匹配不在可视区 且 还没跳转过 → 只跳转居中，不替换
    if (!isMatchVisible && !hasJumpedToCurrent) {
      hasJumpedToCurrent = true;
      const focusResult = await proxy.command('focusCurrentMatch');
      if (focusResult) {
        const panel = getPanelElement();
        if (panel) {
          const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
          if (matchCountEl) {
            matchCountEl.textContent = `${focusResult.current} / ${focusResult.count}`;
          }
        }
      }
      setTimeout(() => replaceInput.focus(), 150);
      return;
    }

    // 执行替换 + 跳下一个匹配居中
    hasJumpedToCurrent = false;
    const result = await proxy.command('replaceOne', { text: replaceInput.value });
    
    if (result) {
      // replaceOne 内部已调用 findMatches → currentMatches 已刷新，currentMatchIndex=0
      // 聚焦新的当前匹配（即下一个匹配），居中滚动
      const focusResult = await proxy.command('focusCurrentMatch');
      
      const panel = getPanelElement();
      if (panel) {
        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl && focusResult) {
          matchCountEl.textContent = `${focusResult.current} / ${focusResult.count}`;
        }
        if (focusResult) {
          proxy.emit('matches:updated', focusResult);
        }
      }
      showStatus(replaceRow, result);
    }
    setTimeout(() => replaceInput.focus(), 150);
  });

  replaceAllBtn.addEventListener('click', async () => {
    const panel = getPanelElement();
    const findInput = panel ? panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`) : null;
    const findText = findInput ? findInput.value : '';
    const replaceText = replaceInput.value;

    const result = await proxy.command('replaceAll', { findText, replaceText, options: { ...searchOptions } });
    showStatus(replaceRow, result);

    // 清除匹配计数
    const matchCountEl = panel ? panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`) : null;
    if (matchCountEl) matchCountEl.textContent = '';
    updateButtonStates(replaceRow, false);
    // 隐藏预览按钮（匹配被清除了）
    if (previewBtn) previewBtn.style.display = 'none';
    if (applyPreviewBtn) applyPreviewBtn.style.display = 'none';
  });

  // 替换输入框回车键 → 替换当前匹配，然后自动导航到下一个
  replaceInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // 执行替换当前匹配
      const result = await proxy.command('replaceOne', { text: replaceInput.value });
      if (result) {
        // 重新搜索以更新匹配计数
        const panel = getPanelElement();
        if (panel) {
          const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
          if (findInput && findInput.value.trim()) {
            await proxy.command('search', { text: findInput.value, options: searchOptions, shouldFocus: false });
          }
        }
        showStatus(replaceRow, result);
        // 自动导航到下一个匹配
        await proxy.command('navigate', { direction: 'next' });
      }
      // 恢复焦点到替换输入框（增加延迟确保 contenteditable 的异步焦点操作完成）
      setTimeout(() => {
        if (document.activeElement !== replaceInput) {
          replaceInput.focus();
        }
      }, 150);
    }
  });

  // === 预览按钮交互 ===

  // 👁 预览按钮：进入/退出预览模式
  previewBtn.addEventListener('click', async () => {
    if (isPreviewMode) {
      // 退出预览模式
      await exitPreview(replaceRow, previewBtn, applyPreviewBtn);
    } else {
      // 进入预览模式
      await enterPreview(replaceRow, previewBtn, applyPreviewBtn, searchOptions);
    }
  });

  // ✓ 应用预览按钮：批量替换所有绿色标记的匹配
  applyPreviewBtn.addEventListener('click', async () => {
    const replaceText = replaceInput.value;
    const result = await proxy.command('applyPreviewedReplacements', { replaceText });
    showStatus(replaceRow, { status: 'success', message: `已替换 ${result.replaced} 处` });

    // 退出预览模式
    isPreviewMode = false;
    previewBtn.textContent = '👁';
    previewBtn.title = '预览替换';
    applyPreviewBtn.style.display = 'none';
    applyPreviewBtn.disabled = true;

    // 重新搜索
    const panel = getPanelElement();
    if (panel) {
      const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
      if (findInput && findInput.value.trim()) {
        const result = await proxy.command('search', { text: findInput.value, options: searchOptions, shouldFocus: false });

        // 手动 emit matches:updated 更新 UI
        if (result) {
          proxy.emit('matches:updated', result);

          const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
          if (matchCountEl) {
            if (result.count === 0) {
              matchCountEl.textContent = result.message || '无结果';
            } else {
              matchCountEl.textContent = `${result.current} / ${result.count}`;
            }
          }
        }
      }
    }
  });

  // 监听匹配更新事件，更新按钮状态
  proxy.on('matches:updated', (data) => {
    const hasMatches = data && data.count > 0;
    updateButtonStates(replaceRow, hasMatches);
    // 有匹配时显示预览按钮，无匹配时隐藏
    if (previewBtn) previewBtn.style.display = hasMatches ? 'inline-flex' : 'none';
    // 非预览模式下隐藏 apply 按钮
    if (!isPreviewMode && applyPreviewBtn) {
      applyPreviewBtn.style.display = 'none';
    }
  });

  // 监听预览状态更新事件
  proxy.on('preview:stateUpdated', (data) => {
    if (applyPreviewBtn && isPreviewMode) {
      applyPreviewBtn.disabled = data.selected === 0;
    }
  });
}

/**
 * 进入预览模式
 */
async function enterPreview(replaceRow, previewBtn, applyPreviewBtn, searchOptions) {
  const panel = replaceRow.closest('.tr-panel');
  if (!panel) return;

  const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
  const findText = findInput ? findInput.value : '';

  if (!findText || !findText.trim()) return;

  const result = await proxy.command('enterPreview', { text: findText, options: searchOptions });

  if (result && result.count > 0) {
    isPreviewMode = true;
    previewBtn.textContent = '取消预览';
    previewBtn.title = '取消预览';
    applyPreviewBtn.style.display = 'inline-flex';
    applyPreviewBtn.disabled = true; // 初始灰色：未选中任何匹配

    const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
    if (matchCountEl) matchCountEl.textContent = `预览: 0/${result.count} 选中`;

    // 绑定 overlay 单击/双击事件（在 document 上代理）
    bindOverlayEvents(replaceRow, panel);
  }
}

/**
 * 绑定 overlay 交互事件
 */
function bindOverlayEvents(replaceRow, panel) {
  unbindOverlayEvents(); // 先清除旧的

  // 防止双击时触发两次单击
  let clickTimer = null;

  overlayClickHandler = async (e) => {
    let target = e.target;
    
    // 如果点击的是文本节点（nodeType === 3），向上取父元素
    // 在 contenteditable 中双击可能选中文本节点而非 span
    if (target.nodeType === 3) {
      target = target.parentElement;
    }
    
    // 确保 target 有 classList（防御性检查）
    if (!target || !target.classList) return;
    
    // 检查是否点击在高亮 span 上
    if (!target.classList.contains('tr-highlight-match') &&
        !target.classList.contains('tr-preview-selected')) {
      return;
    }

    // 确定来源：overlay 还是 contenteditable
    const overlay = target.closest('.tr-highlight-overlay');
    const isContentEditable = !overlay && target.closest('[contenteditable="true"]');

    if (!overlay && !isContentEditable) return;

    // 对于 contenteditable，阻止默认行为防止聚焦到富文本框
    if (isContentEditable) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 获取预览索引
    const previewIndex = parseInt(target.dataset.previewIndex, 10);
    if (isNaN(previewIndex)) return;

    // 单击：延迟执行（如果短时间内有双击则取消）
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      // 双击
      const replaceInput = replaceRow.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
      const replaceText = replaceInput ? replaceInput.value : '';
      const dblResult = await proxy.command('executeDoubleReplace', { index: previewIndex, replaceText });

      if (dblResult && dblResult.replaced) {
        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl) {
          const state = await proxy.command('getPreviewState');
          matchCountEl.textContent = `预览: ${state.selected}/${state.total} 选中`;
        }

        if (dblResult.remaining === 0) {
          // 所有匹配已处理，自动退出预览
          const previewBtn = replaceRow.querySelector('#tr-preview-btn');
          const applyPreviewBtn = replaceRow.querySelector('#tr-apply-preview-btn');
          await exitPreview(replaceRow, previewBtn, applyPreviewBtn);
        }
      }
      return;
    }

    // 单击：300ms 后执行
    clickTimer = setTimeout(async () => {
      clickTimer = null;
      const result = await proxy.command('togglePreviewMatch', { index: previewIndex });

      if (result) {
        proxy.emit('preview:stateUpdated', result);

        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl) {
          const state = await proxy.command('getPreviewState');
          matchCountEl.textContent = `预览: ${state.selected}/${state.total} 选中`;
        }
      }
    }, 300);
  };

  // 绑定到主文档
  document.addEventListener('click', overlayClickHandler, true);

  // 绑定到所有同源 iframe 文档
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      if (iframe.contentDocument) {
        iframe.contentDocument.addEventListener('click', overlayClickHandler, true);
      }
    } catch (_) {
      // 跨域 iframe 忽略
    }
  });
}

/**
 * 解绑 overlay 事件
 */
function unbindOverlayEvents() {
  if (overlayClickHandler) {
    document.removeEventListener('click', overlayClickHandler, true);
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.removeEventListener('click', overlayClickHandler, true);
        }
      } catch (_) {}
    });
    overlayClickHandler = null;
  }
}

/**
 * 退出预览模式
 */
async function exitPreview(replaceRow, previewBtn, applyPreviewBtn) {
  unbindOverlayEvents();
  await proxy.command('exitPreview');
  isPreviewMode = false;
  previewBtn.textContent = '👁';
  previewBtn.title = '预览替换';
  applyPreviewBtn.style.display = 'none';
  applyPreviewBtn.disabled = true;

  // 重新搜索恢复黄色高亮
  const panel = replaceRow.closest('.tr-panel');
  if (panel) {
    const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
    if (findInput && findInput.value.trim()) {
      const searchOptions = getSearchOptionsFromPanel(panel);
      const result = await proxy.command('search', { text: findInput.value, options: searchOptions, shouldFocus: false });

      // 手动 emit matches:updated 事件更新 UI
      if (result) {
        proxy.emit('matches:updated', result);

        // 直接更新匹配计数显示
        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl) {
          if (result.count === 0) {
            matchCountEl.textContent = result.message || '无结果';
          } else {
            matchCountEl.textContent = `${result.current} / ${result.count}`;
          }
        }
      }
    }
  }
}

/**
 * 从面板获取当前搜索选项
 */
function getSearchOptionsFromPanel(panel) {
  const matchCaseBtn = panel.querySelector(`#${UIConstants.MATCH_CASE_ID}`);
  const matchWordBtn = panel.querySelector(`#${UIConstants.MATCH_WORD_ID}`);
  const useRegexBtn = panel.querySelector(`#${UIConstants.USE_REGEX_ID}`);

  return {
    matchCase: matchCaseBtn ? matchCaseBtn.classList.contains(UIConstants.ACTIVE_CLASS) : false,
    matchWord: matchWordBtn ? matchWordBtn.classList.contains(UIConstants.ACTIVE_CLASS) : false,
    useRegex: useRegexBtn ? useRegexBtn.classList.contains(UIConstants.ACTIVE_CLASS) : false,
  };
}

/**
 * 更新按钮启用/禁用状态
 */
function updateButtonStates(row, hasMatches) {
  const replaceOneBtn = row.querySelector(`#${UIConstants.REPLACE_ONE_BTN_ID}`);
  const replaceAllBtn = row.querySelector(`#${UIConstants.REPLACE_ALL_BTN_ID}`);
  if (replaceOneBtn) replaceOneBtn.disabled = !hasMatches;
  if (replaceAllBtn) replaceAllBtn.disabled = !hasMatches;
}

/**
 * 显示状态提示
 */
function showStatus(row, result) {
  const panel = row.closest('.tr-panel');
  if (!panel) return;

  let statusEl = panel.querySelector('#tr-status');
  if (!statusEl) return;

  statusEl.textContent = result.message || '';
  statusEl.className = 'tr-status tr-show';

  if (result.status === 'success') {
    statusEl.classList.add('tr-success');
  } else if (result.status === 'no_match' || result.status === 'empty_find') {
    statusEl.classList.add('tr-warning');
  } else {
    statusEl.classList.add('tr-error');
  }

  setTimeout(() => {
    statusEl.classList.remove('tr-show');
  }, 2000);
}

// ============================================================
// 自定义面板颜色预设批量选择 — 辅助函数
// ============================================================

async function loadColorPresetsForBatch(customPanel, batchMode, selectedIds) {
  const presetBtnsContainer = customPanel.querySelector('#tr-custom-preset-btns');
  if (!presetBtnsContainer) return;

  try {
    const allPresets = await getPresets();
    // 过滤出颜色预设：findText 以 __color_preset__ 开头
    const colorPresets = allPresets.filter(p => p.findText && p.findText.startsWith('__color_preset__'));

    if (batchMode) {
      // 批量模式：显示复选框列表
      presetBtnsContainer.innerHTML = '';
      presetBtnsContainer.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:140px;overflow-y:auto;';
      
      if (colorPresets.length === 0) {
        presetBtnsContainer.innerHTML = '<div style="font-size:11px;color:var(--tr-placeholder,#858585);padding:4px 0;">暂无颜色预设</div>';
        return;
      }

      for (const preset of colorPresets) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px;color:var(--tr-text,#ccc);';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.style.cssText = 'flex-shrink:0;';
        cb.checked = selectedIds.has(preset.id);
        cb.addEventListener('change', () => {
          if (cb.checked) selectedIds.add(preset.id);
          else selectedIds.delete(preset.id);
        });
        row.appendChild(cb);

        // 颜色预览小方块
        try {
          const colorData = JSON.parse(preset.findText.replace('__color_preset__', ''));
          const swatch = document.createElement('span');
          swatch.style.cssText = `display:inline-block;width:14px;height:14px;border-radius:2px;background:${colorData.panelBg || '#252526'};border:1px solid var(--tr-border,#454545);flex-shrink:0;`;
          row.appendChild(swatch);
        } catch (_) {}

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameSpan.textContent = preset.name;
        row.appendChild(nameSpan);
        
        presetBtnsContainer.appendChild(row);
      }
    } else {
      // 非批量模式：委托给统一渲染函数
      await renderAllPresetsInCustomPanel(customPanel);
    }
  } catch (_) {}
}

function reBindPresetButtons(customPanel) {
  customPanel.querySelectorAll('.tr-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetName = btn.dataset.preset;
      const preset = { monokai: { panelBg: '#272822', searchHighlight: '#a6e22e', previewHighlight: '#f92672' }, nord: { panelBg: '#2e3440', searchHighlight: '#88c0d0', previewHighlight: '#a3be8c' }, 'solarized-dark': { panelBg: '#002b36', searchHighlight: '#268bd2', previewHighlight: '#b58900' }, 'solarized-light': { panelBg: '#fdf6e3', searchHighlight: '#268bd2', previewHighlight: '#cb4b16' }, 'one-dark': { panelBg: '#282c34', searchHighlight: '#e5c07b', previewHighlight: '#c678dd' } }[presetName];
      if (!preset) return;
      const host = document.getElementById('text-replacer-host');
      if (!host) return;
      const panelPicker = customPanel.querySelector('#tr-color-panel');
      const searchPicker = customPanel.querySelector('#tr-color-search');
      const previewPicker = customPanel.querySelector('#tr-color-preview');
      if (panelPicker) panelPicker.value = preset.panelBg;
      if (searchPicker) searchPicker.value = preset.searchHighlight;
      if (previewPicker) previewPicker.value = preset.previewHighlight;
      applyCustomColors(preset.panelBg, preset.searchHighlight, preset.previewHighlight, host);
      saveTheme({ mode: 'custom', custom: { panelBg: preset.panelBg, searchHighlight: preset.searchHighlight, previewHighlight: preset.previewHighlight } });
      const hexPanel = customPanel.querySelector('#tr-color-panel-hex');
      const hexSearch = customPanel.querySelector('#tr-color-search-hex');
      const hexPreview = customPanel.querySelector('#tr-color-preview-hex');
      if (hexPanel) hexPanel.textContent = preset.panelBg;
      if (hexSearch) hexSearch.textContent = preset.searchHighlight;
      if (hexPreview) hexPreview.textContent = preset.previewHighlight;
    });
  });
}

// 绑定用户颜色预设按钮（click → 应用颜色 + 更新取色器）
function bindUserColorPresetButton(btn, panelBg, searchHighlight, previewHighlight, customPanel) {
  btn.addEventListener('click', () => {
    const host = document.getElementById('text-replacer-host');
    if (!host) return;
    const panelPicker = customPanel.querySelector('#tr-color-panel');
    const searchPicker = customPanel.querySelector('#tr-color-search');
    const previewPicker = customPanel.querySelector('#tr-color-preview');
    if (panelPicker) panelPicker.value = panelBg;
    if (searchPicker) searchPicker.value = searchHighlight;
    if (previewPicker) previewPicker.value = previewHighlight;
    applyCustomColors(panelBg, searchHighlight, previewHighlight, host);
    saveTheme({ mode: 'custom', custom: { panelBg, searchHighlight, previewHighlight } });
    const hp = customPanel.querySelector('#tr-color-panel-hex');
    const hs = customPanel.querySelector('#tr-color-search-hex');
    const hv = customPanel.querySelector('#tr-color-preview-hex');
    if (hp) hp.textContent = panelBg;
    if (hs) hs.textContent = searchHighlight;
    if (hv) hv.textContent = previewHighlight;
  });
}

/**
 * 统一渲染自定义面板预设区：硬编码预设 + 用户保存的颜色预设
 */
async function renderAllPresetsInCustomPanel(customPanel) {
  const presetBtnsContainer = customPanel.querySelector('#tr-custom-preset-btns');
  if (!presetBtnsContainer) return;

  presetBtnsContainer.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';

  // 1. 硬编码预设按钮
  let html = `
    <button class="tr-preset-btn" data-preset="monokai" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Monokai</button>
    <button class="tr-preset-btn" data-preset="nord" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Nord</button>
    <button class="tr-preset-btn" data-preset="solarized-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Dark</button>
    <button class="tr-preset-btn" data-preset="solarized-light" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Light</button>
    <button class="tr-preset-btn" data-preset="one-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">One Dark</button>
  `;

  // 2. 用户保存的颜色预设
  try {
    const allPresets = await getPresets();
    const colorPresets = allPresets.filter(p => p.findText && p.findText.startsWith('__color_preset__'));
    for (const cp of colorPresets) {
      try {
        JSON.parse(cp.findText.replace('__color_preset__', '')); // 仅验证 JSON 有效
        html += `<button class="tr-preset-btn tr-user-preset" data-user-preset-id="${escapeHtml(cp.id)}" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">🖌 ${escapeHtml(cp.name)}</button>`;
      } catch (_) {}
    }
  } catch (_) {}

  presetBtnsContainer.innerHTML = html;

  // 重新绑定事件
  reBindPresetButtons(customPanel);
  // 绑定用户预设按钮事件
  bindUserColorPresetEvents(customPanel);
}

function bindUserColorPresetEvents(customPanel) {
  customPanel.querySelectorAll('.tr-user-preset').forEach(btn => {
    const presetId = btn.dataset.userPresetId;
    if (!presetId) return;
    getPresets().then(allPresets => {
      const found = allPresets.find(p => p.id === presetId);
      if (!found || !found.findText) return;
      try {
        const cd = JSON.parse(found.findText.replace('__color_preset__', ''));
        bindUserColorPresetButton(btn, cd.panelBg, cd.searchHighlight, cd.previewHighlight, customPanel);
      } catch (_) {}
    });
  });
}

// ============================================================
// 历史/预设面板辅助函数
// ============================================================

function truncate(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '\u2026' : text;
}

async function loadHistoryItemsForPanel(panel) {
  const listEl = panel.querySelector('#tr-history-list');
  if (!listEl) return;
  try {
    const history = await getHistory();
    listEl.innerHTML = '';
    if (history.length === 0) {
      listEl.innerHTML = '<div style="padding:5px 0;font-size:11px;color:var(--tr-placeholder,#858585);">暂无历史记录</div>';
      return;
    }
    for (const entry of history) {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 0;min-height:24px;font-size:12px;cursor:pointer;color:var(--tr-text,#ccc);word-break:break-all;overflow-wrap:break-word;';
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--tr-btn-hover,#3c3c3c)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      const span = document.createElement('span');
      span.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      span.textContent = `${truncate(entry.findText, 20)} \u2192 ${truncate(entry.replaceText, 20)}`;
      span.title = `查找: ${entry.findText}\n替换: ${entry.replaceText}`;
      span.addEventListener('click', () => {
        const panelEl = _getPanelElement();
        if (panelEl) {
          const fi = panelEl.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
          const ri = panelEl.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
          if (fi) { fi.value = entry.findText || ''; fi.dispatchEvent(new Event('input', { bubbles: true })); }
          if (ri) ri.value = entry.replaceText || '';
        }
        const tr = panelEl?.querySelector('#tr-replace-row');
        if (tr) tr.classList.add(UIConstants.REPLACE_VISIBLE_CLASS);
      });
      const favBtn = document.createElement('button');
      favBtn.textContent = '\u2B50';
      favBtn.title = '保存为预设';
      favBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;font-size:14px;padding:0 4px;';
      favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const defaultName = entry.findText || '未命名';
        try {
          await savePreset(defaultName, entry.findText || '', entry.replaceText || '', entry.options || {});
          const msg = entry.replaceText
            ? `${entry.findText}→${entry.replaceText} 收藏成功`
            : `${entry.findText} 收藏成功`;
          showToast(msg);
          loadPresetItemsForPanel(panel);
        } catch(err) {
          showToast('收藏失败: ' + err.message);
        }
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑';
      delBtn.title = '删除';
      delBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 4px;';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteHistoryItem(entry.id);
        loadHistoryItemsForPanel(panel);
      });
      item.appendChild(span);
      item.appendChild(favBtn);
      item.appendChild(delBtn);
      listEl.appendChild(item);
    }
  } catch (_) {}
}

async function loadPresetItemsForPanel(panel, batchModeOverride) {
  const listEl = panel.querySelector('#tr-preset-list');
  if (!listEl) return;
  const batchMode = batchModeOverride || (window._trBatchState?.batchMode || false);

  try {
    let presets = await getPresets();
    const searchTerm = (panel.querySelector('#tr-preset-search-input')?.value || '').toLowerCase();
    if (searchTerm) presets = presets.filter(p => (p.name || '').toLowerCase().includes(searchTerm));
    listEl.innerHTML = '';
    if (presets.length === 0) {
      listEl.innerHTML = `<div style="padding:5px 0;font-size:11px;color:var(--tr-placeholder,#858585);">${searchTerm ? '无匹配' : '暂无预设'}</div>`;
      return;
    }
    for (const preset of presets) {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 0;min-height:24px;font-size:12px;color:var(--tr-text,#ccc);word-break:break-all;overflow-wrap:break-word;';

      // 批量模式复选框
      if (batchMode) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.style.cssText = 'margin-right:8px;flex-shrink:0;';
        cb.addEventListener('change', () => {
          if (cb.checked) window._trBatchState.selectedIds.add(preset.id);
          else window._trBatchState.selectedIds.delete(preset.id);
          window._trBatchState.updateBatchBtn();
        });
        item.appendChild(cb);
      }

      // 预设名称 + 搜索/替换预览
      const span = document.createElement('span');
      span.style.cssText = 'flex:1;cursor:pointer;overflow:hidden;';
      span.innerHTML = `<div style="font-weight:500;">${escapeHtml(preset.name)}</div><div style="font-size:10px;color:var(--tr-placeholder,#858585);">${escapeHtml(preset.findText || '(空)')}${preset.replaceText ? ' → ' + escapeHtml(preset.replaceText) : ''}</div>`;
      span.addEventListener('click', () => {
        if (batchMode) return;
        const panelEl = _getPanelElement();
        if (panelEl) {
          const fi = panelEl.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
          const ri = panelEl.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
          if (fi) { fi.value = preset.findText || ''; fi.dispatchEvent(new Event('input', { bubbles: true })); }
          if (ri) ri.value = preset.replaceText || '';
        }
      });
      item.appendChild(span);

      if (!batchMode) {
        // 修改按钮
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.title = '修改';
        editBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 4px;flex-shrink:0;';
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); openModal('edit', preset); });
        item.appendChild(editBtn);

        // 删除按钮
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.title = '删除';
        delBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 4px;flex-shrink:0;';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = await showConfirm('确认删除该预设？');
          if (ok) { await deletePreset(preset.id); showToast('删除成功'); loadPresetItemsForPanel(panel); if (_customPanel) renderAllPresetsInCustomPanel(_customPanel); }
        });
        item.appendChild(delBtn);
      }

      listEl.appendChild(item);
    }
  } catch (_) {}
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function openModal(mode, presetData = null) {
  if (!_modalState) return;
  const { modal, modalTitle, modalName, modalFind, modalReplace } = _modalState;
  const submitNextBtn = modal.querySelector('#tr-modal-submit-next');
  const submitBtn = modal.querySelector('#tr-modal-submit');
  _modalState.mode = mode;
  if (mode === 'add') {
    modalTitle.textContent = '新增预设';
    modalName.value = '';
    modalFind.value = '';
    modalReplace.value = '';
    modalName.placeholder = '预设名称（为空取搜索文本）';
    _modalState.editingPresetId = null;
    if (submitNextBtn) submitNextBtn.style.display = '';
    if (submitBtn) submitBtn.textContent = '提交';
  } else if (mode === 'edit' && presetData) {
    modalTitle.textContent = '修改预设';
    modalName.value = presetData.name || '';
    modalFind.value = presetData.findText || '';
    modalReplace.value = presetData.replaceText || '';
    modalName.placeholder = presetData.findText || '预设名称（为空取搜索文本）';
    _modalState.editingPresetId = presetData.id;
    if (submitNextBtn) submitNextBtn.style.display = 'none';
    if (submitBtn) submitBtn.textContent = '修改';
  }
  modal.style.display = 'flex';
  setTimeout(() => modalName.focus(), 50);
}

function closeModal() {
  if (_modalState) _modalState.modal.style.display = 'none';
}

async function submitModal(keepOpen) {
  if (!_modalState) return;
  const { modalName, modalFind, modalReplace } = _modalState;
  const findText = modalFind.value;
  const replaceText = modalReplace.value;
  // 名称为空时自动取搜索文本作为预设名称
  const name = modalName.value.trim() || findText.trim() || '未命名';

  try {
    if (_modalState.mode === 'edit' && _modalState.editingPresetId) {
      // 修改：使用 updatePreset 原地更新
      await updatePreset(_modalState.editingPresetId, name, findText, replaceText);
      const msg = replaceText
        ? `${findText}→${replaceText} 修改成功`
        : `${findText} 修改成功`;
      showToast(msg);
      closeModal();
    } else {
      // 新增
      await savePreset(name, findText, replaceText);
      const msg = replaceText
        ? `${findText}→${replaceText} 新增成功`
        : `${findText} 新增成功`;
      showToast(msg);
      if (!keepOpen) {
        closeModal();
      } else {
        modalName.value = '';
        modalFind.value = '';
        modalReplace.value = '';
        modalName.placeholder = '预设名称（为空取搜索文本）';
        modalName.focus();
      }
    }
    // 立即刷新预设列表
    loadPresetItemsForPanel(_historyPanel);
  } catch (err) {
    showToast('操作失败: ' + err.message);
  }
}

function bindPresetEventsForPanel(panel) {
  const addBtn = panel.querySelector('#tr-preset-add-btn');
  const importBtn = panel.querySelector('#tr-preset-import-btn');
  const exportBtn = panel.querySelector('#tr-preset-export-btn');
  const batchDelBtn = panel.querySelector('#tr-preset-batch-del-btn');
  const fileInput = panel.querySelector('#tr-preset-file-input');
  const searchInput = panel.querySelector('#tr-preset-search-input');

  // 新增按钮
  addBtn?.addEventListener('click', () => openModal('add'));

  // 导入/导出
  exportBtn?.addEventListener('click', async () => {
    const json = await exportPresets();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `text-replacer-presets-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  });

  importBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try { await importPresets(ev.target.result); loadPresetItemsForPanel(panel); showToast('导入成功'); } catch(err) { showToast('导入失败: ' + err.message); }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  // 搜索过滤
  searchInput?.addEventListener('input', () => loadPresetItemsForPanel(panel));

  // 批量删除：选择模式下显示
  let batchMode = false;
  let selectedIds = new Set();

  const exitBatchMode = () => {
    batchMode = false;
    selectedIds.clear();
    batchDelBtn.textContent = '🗑';
    loadPresetItemsForPanel(panel);
    // 同步刷新自定义面板预设区
    if (_customPanel) renderAllPresetsInCustomPanel(_customPanel);
  };

  batchDelBtn?.addEventListener('click', async () => {
    if (!batchMode) {
      // 进入批量选择模式
      batchMode = true;
      selectedIds.clear();
      batchDelBtn.textContent = '✓';
      loadPresetItemsForPanel(panel, true);
    } else {
      // 无选中 → 直接退出批量模式，不提示
      if (selectedIds.size === 0) {
        exitBatchMode();
        return;
      }
      const ok = await showConfirm(`确认删除 ${selectedIds.size} 条预设？`);
      if (!ok) {
        // 用户取消 → 也退出批量模式
        exitBatchMode();
        return;
      }
      for (const id of selectedIds) {
        await deletePreset(id);
      }
      exitBatchMode();
      showToast('删除成功');
    }
  });

  // 暴露给 loadPresetItemsForPanel 使用
  window._trBatchState = { get batchMode() { return batchMode; }, selectedIds, updateBatchBtn() {} };
}




