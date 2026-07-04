/**
 * 核心面板渲染 + show/hide 方法
 * 面板存在于 Shadow Root 内，通过 MessageProxy 与 engine 通信
 */
import panelCSS from '../../styles/panel.css';
import { UIConstants } from '../../shared/constants.js';
import { proxy } from '../message-proxy.js';
import { renderSearchBar } from './search-bar.js';
import { renderReplaceBar } from './replace-bar.js';
import { initTheme } from './theme-picker.js';

/** 共享搜索选项 */
export const searchOptions = {
  matchCase: false,
  matchWord: false,
  useRegex: false,
};

let panelElement = null;
let previousActiveElement = null;

/**
 * 在 Shadow Root 内渲染完整面板 HTML + 注入内联 CSS
 * @param {ShadowRoot} shadowRoot
 * @returns {HTMLElement} 面板 DOM 元素
 */
export function render(shadowRoot) {
  // 创建面板容器
  panelElement = document.createElement('div');
  panelElement.className = 'tr-panel tr-hidden';
  panelElement.id = UIConstants.PANEL_ID;

  // 注入内联 CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = panelCSS;
  shadowRoot.appendChild(styleEl);

  // 构建面板结构
  // search-bar 区域
  renderSearchBar(panelElement, searchOptions, hide, toggleReplaceRow);

  // replace-bar 区域
  renderReplaceBar(panelElement, searchOptions, getPanelElement);

  // 状态提示
  const statusEl = document.createElement('div');
  statusEl.className = 'tr-status';
  statusEl.id = 'tr-status';
  panelElement.appendChild(statusEl);

  // 添加到 Shadow Root
  shadowRoot.appendChild(panelElement);

  // 初始化主题
  const hostEl = shadowRoot.host;
  initTheme(hostEl);

  // 全局面板键盘快捷键
  panelElement.addEventListener('keydown', (e) => {
    // Escape → 关闭面板 + 恢复页面焦点
    if (e.key === 'Escape') {
      e.preventDefault();
      hide();
      return;
    }
  });

  return panelElement;
}

/**
 * 显示面板
 */
export function show() {
  if (!panelElement) return;

  // 保存页面原始焦点，用于关闭时恢复
  previousActiveElement = document.activeElement;

  panelElement.classList.remove(UIConstants.HIDDEN_CLASS);

  // 启动页面变化监听（MutationObserver + input 监听）
  proxy.command('startListening');

  // 聚焦查找输入框
  const findInput = panelElement.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
  if (findInput) {
    setTimeout(() => findInput.focus(), 100);
  }

  // 清旧高亮
  proxy.command('clearHighlights');
}

/**
 * 隐藏面板
 */
export function hide() {
  if (!panelElement) return;

  panelElement.classList.add(UIConstants.HIDDEN_CLASS);

  // 停止页面变化监听
  proxy.command('stopListening');

  // 清除所有高亮
  proxy.command('clearHighlights');

  // 清空输入框和状态
  const findInput = panelElement.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
  const replaceInput = panelElement.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
  const matchCount = panelElement.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);

  if (findInput) findInput.value = '';
  if (replaceInput) replaceInput.value = '';
  if (matchCount) matchCount.textContent = '';

  // 重置搜索选项
  searchOptions.matchCase = false;
  searchOptions.matchWord = false;
  searchOptions.useRegex = false;

  // 恢复页面原始焦点
  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    try {
      previousActiveElement.focus();
    } catch (_) {
      // 焦点恢复失败则静默忽略
    }
  }
  previousActiveElement = null;
}

/**
 * 切换替换行 + 工具栏行可见性（折叠时仅保留搜索行）
 */
function toggleReplaceRow() {
  if (!panelElement) return;
  const replaceRow = panelElement.querySelector('#tr-replace-row');

  if (replaceRow) {
    replaceRow.classList.toggle(UIConstants.REPLACE_VISIBLE_CLASS);
    const isVisible = replaceRow.classList.contains(UIConstants.REPLACE_VISIBLE_CLASS);

    // 折叠替换栏时关闭 custom 面板和历史/预设面板
    if (!isVisible) {
      const customPanel = panelElement.querySelector('#tr-custom-panel');
      if (customPanel) customPanel.style.display = 'none';
      const historyPanel = panelElement.querySelector('#tr-history-panel');
      if (historyPanel) historyPanel.style.display = 'none';
    }

    // 更新切换按钮图标
    const toggleBtn = panelElement.querySelector('#tr-toggle-replace-btn');
    if (toggleBtn) {
      toggleBtn.innerHTML = isVisible ? '◄' : '►';
    }
  }
}

/**
 * 获取面板 DOM 引用
 * @returns {HTMLElement|null}
 */
export function getPanelElement() {
  return panelElement;
}
