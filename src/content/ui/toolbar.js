/**
 * 工具栏 - 更多菜单（主题 + 历史记录 / 预设入口）
 * 统一管理 #tr-more-menu 的 DOM 创建和事件
 */
import { bindPresetEvents, loadHistoryItems, loadPresetItems } from './history-menu.js';
import { applyTheme, initTheme, renderCustomPicker } from './theme-picker.js';

let hostElementRef = null;
let moreMenuElement = null;
let menuVisible = false;

/**
 * 渲染工具栏到指定容器
 * @param {HTMLElement} container
 * @param {HTMLElement} [hostElement] - Shadow DOM host，用于主题应用
 */
export function renderToolbar(container, hostElement) {
  if (hostElement) {
    hostElementRef = hostElement;
  }

  const toolbarRow = document.createElement('div');
  toolbarRow.className = 'tr-input-row';
  toolbarRow.id = 'tr-toolbar-row';

  toolbarRow.innerHTML = `
    <div class="tr-toolbar" style="position: relative;">
      <button class="tr-btn tr-tool-btn" id="tr-more-btn" title="更多">⋯</button>
    </div>
  `;

  container.appendChild(toolbarRow);

  // 渲染更多菜单
  const toolbarContainer = toolbarRow.querySelector('.tr-toolbar');
  renderMoreMenu(toolbarContainer);

  // 绑定更多按钮
  const moreBtn = toolbarRow.querySelector('#tr-more-btn');
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMoreMenu();
  });

  // 点击外部关闭下拉菜单（使用 composedPath 处理 Shadow DOM 事件重定向）
  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    if (!path.some(el => el === toolbarRow)) {
      toggleMoreMenu(false);
    }
  }, true);

  // 初始化主题
  if (hostElementRef) {
    initTheme(hostElementRef);
  }
}

// ============================================================
// 更多菜单渲染
// ============================================================

function renderMoreMenu(container) {
  if (moreMenuElement) return moreMenuElement;

  moreMenuElement = document.createElement('div');
  moreMenuElement.className = 'tr-more-menu';
  moreMenuElement.id = 'tr-more-menu';
  moreMenuElement.style.cssText =
    'position:absolute;top:100%;left:0;margin-top:2px;' +
    'background:var(--tr-bg,#252526);border:1px solid var(--tr-border,#454545);' +
    'border-radius:4px;min-width:260px;max-height:400px;overflow-y:auto;z-index:20;display:none;';

  moreMenuElement.innerHTML = `
    <div class="tr-menu-section">
      <div class="tr-menu-title" style="padding:8px 12px 4px;font-size:11px;font-weight:600;color:var(--tr-placeholder,#858585);text-transform:uppercase;letter-spacing:0.5px;">
        🎨 主题
      </div>
      <button class="tr-menu-item" data-theme="dark" style="display:block;width:100%;text-align:left;padding:4px 12px;font-size:12px;cursor:pointer;color:var(--tr-text,#cccccc);background:transparent;border:none;">🌙 Dark</button>
      <button class="tr-menu-item" data-theme="light" style="display:block;width:100%;text-align:left;padding:4px 12px;font-size:12px;cursor:pointer;color:var(--tr-text,#cccccc);background:transparent;border:none;">☀️ Light</button>
      <button class="tr-menu-item" data-theme="auto" style="display:block;width:100%;text-align:left;padding:4px 12px;font-size:12px;cursor:pointer;color:var(--tr-text,#cccccc);background:transparent;border:none;">🔄 Auto</button>
      <button class="tr-menu-item" id="tr-theme-custom-btn" data-theme="custom" style="display:block;width:100%;text-align:left;padding:4px 12px;font-size:12px;cursor:pointer;color:var(--tr-text,#cccccc);background:transparent;border:none;">🎨 Custom</button>
      <div id="tr-custom-picker-container" style="display:none;"></div>
    </div>
    <div class="tr-menu-divider" style="height:1px;background:var(--tr-border,#454545);margin:4px 0;"></div>
    <div class="tr-menu-section">
      <div class="tr-menu-title" style="padding:8px 12px 4px;font-size:11px;font-weight:600;color:var(--tr-placeholder,#858585);text-transform:uppercase;letter-spacing:0.5px;">
        历史记录
      </div>
      <div id="tr-history-list" style="max-height:150px;overflow-y:auto;"></div>
    </div>
    <div class="tr-menu-section">
      <div class="tr-menu-title" style="padding:8px 12px 4px;font-size:11px;font-weight:600;color:var(--tr-placeholder,#858585);text-transform:uppercase;letter-spacing:0.5px;">
        预设规则
      </div>
      <div id="tr-preset-toolbar" style="padding:2px 12px 4px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
        <input id="tr-preset-search" type="text" placeholder="搜索预设..." style="flex:1;min-width:0;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);padding:2px 6px;font-size:11px;border-radius:3px;outline:none;">
        <button id="tr-preset-save-btn" title="保存当前为预设" style="background:var(--tr-btn,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:3px;white-space:nowrap;">💾保存</button>
        <button id="tr-preset-export-btn" title="导出全部预设" style="background:var(--tr-btn,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:3px;">📤</button>
        <button id="tr-preset-import-btn" title="导入预设" style="background:var(--tr-btn,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#cccccc);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:3px;">📥</button>
      </div>
      <div id="tr-preset-list" style="max-height:150px;overflow-y:auto;"></div>
    </div>
  `;

  // 隐藏的文件导入 input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.id = 'tr-preset-file-input';
  fileInput.style.display = 'none';
  moreMenuElement.appendChild(fileInput);

  container.appendChild(moreMenuElement);

  // 绑定主题按钮事件
  bindThemeEvents();
  // 绑定预设事件（直接传入 moreMenuElement）
  bindPresetEvents(moreMenuElement);

  return moreMenuElement;
}

// ============================================================
// 主题事件绑定
// ============================================================

function bindThemeEvents() {
  const menu = moreMenuElement;
  if (!menu) return;

  menu.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--tr-btn-hover,#3c3c3c)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = btn.dataset.theme;

      if (mode === 'custom') {
        const pickerContainer = menu.querySelector('#tr-custom-picker-container');
        if (pickerContainer) {
          const isVisible = pickerContainer.style.display !== 'none';
          if (isVisible) {
            pickerContainer.style.display = 'none';
          } else {
            pickerContainer.style.display = 'block';
            if (hostElementRef) {
              renderCustomPicker(pickerContainer, hostElementRef);
            }
          }
        }
      } else {
        const pickerContainer = menu.querySelector('#tr-custom-picker-container');
        if (pickerContainer) pickerContainer.style.display = 'none';

        if (hostElementRef) {
          applyTheme(mode, hostElementRef);
        }
      }
    });
  });
}

// ============================================================
// 菜单切换
// ============================================================

/**
 * 切换更多菜单显示/隐藏
 * @param {boolean} [force]
 */
export function toggleMoreMenu(force) {
  const menu = moreMenuElement;
  if (!menu) return;

  const shouldShow = force !== undefined ? force : !menuVisible;

  if (shouldShow) {
    menu.style.display = 'block';
    menuVisible = true;
    // 刷新历史/预设数据（传入 menu 元素避免 Shadow Root 查找失败）
    loadHistoryItems(menu);
    loadPresetItems(menu);
  } else {
    menu.style.display = 'none';
    menuVisible = false;
  }
}

/**
 * 获取菜单 DOM 引用
 * @returns {HTMLElement|null}
 */
export function getMoreMenuElement() {
  return moreMenuElement;
}
