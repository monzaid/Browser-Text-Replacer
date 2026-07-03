/**
 * 历史/预设下拉面板 — 数据加载 + 事件绑定
 * 不创建独立菜单 DOM，由 toolbar.js 统一管理菜单结构
 *
 * 注意：所有 DOM 元素位于 Shadow Root 内，document.getElementById() 不可用。
 * 必须通过 text-replacer-host → shadowRoot → .tr-panel 路径查找。
 */
import { UIConstants } from '../../shared/constants.js';
import { getHistory, getPresets, savePreset, deletePreset, exportPresets, importPresets } from '../../storage/store.js';

let presetSearchTerm = '';

/** 预设上限 */
const PRESET_MAX = 100;

// ============================================================
// Shadow DOM 元素查找辅助
// ============================================================

/** 获取 Shadow Root 内的面板元素 */
function getPanelEl() {
  const host = document.getElementById('text-replacer-host');
  return host?.shadowRoot?.querySelector('.tr-panel') || null;
}

/** 获取更多菜单元素 */
function getMenuEl() {
  return getPanelEl()?.querySelector('#tr-more-menu') || null;
}

/**
 * 在 Shadow Root 内按选择器查找元素
 * 优先从更多菜单查找，找不到再从面板查找
 */
function getShadowElement(selector) {
  const menu = getMenuEl();
  if (menu) {
    const el = menu.querySelector(selector);
    if (el) return el;
  }
  const panel = getPanelEl();
  return panel?.querySelector(selector) || null;
}

// ============================================================
// 公共 API — 由 toolbar.js 在创建菜单 DOM 后调用
// ============================================================

/**
 * 绑定预设相关事件（保存、导出、导入、搜索）
 * @param {HTMLElement} [menuElement] - 菜单 DOM 元素，优先从该元素查询
 */
export function bindPresetEvents(menuElement) {
  if (!menuElement) {
    console.warn('[history-menu] menuElement 为空，跳过事件绑定');
    return;
  }

  const saveBtn = menuElement.querySelector('#tr-preset-save-btn');
  const exportBtn = menuElement.querySelector('#tr-preset-export-btn');
  const importBtn = menuElement.querySelector('#tr-preset-import-btn');

  if (!saveBtn || !exportBtn || !importBtn) {
    console.warn('[history-menu] 部分预设按钮未找到，跳过事件绑定', {
      saveBtn: !!saveBtn,
      exportBtn: !!exportBtn,
      importBtn: !!importBtn,
    });
    return;
  }

  saveBtn.addEventListener('click', handleSaveCurrentAsPreset);
  exportBtn.addEventListener('click', handleExportPresets);
  importBtn.addEventListener('click', () => {
    const fileInput = menuElement.querySelector('#tr-preset-file-input');
    if (fileInput) fileInput.click();
  });

  const fileInput = menuElement.querySelector('#tr-preset-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleImportPresets);
  }

  const searchInput = menuElement.querySelector('#tr-preset-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      presetSearchTerm = (e.target.value || '').toLowerCase();
      loadPresetItems(menuElement);
    });
  }
}

/**
 * 加载并渲染历史记录列表
 * @param {HTMLElement} [menuElement] - 菜单 DOM 元素，优先从该元素查询
 */
export async function loadHistoryItems(menuElement) {
  const listEl = menuElement
    ? menuElement.querySelector('#tr-history-list')
    : getShadowElement('#tr-history-list');
  if (!listEl) return;

  try {
    const history = await getHistory();
    listEl.innerHTML = '';

    if (history.length === 0) {
      listEl.innerHTML =
        '<div style="padding:4px 12px 8px;font-size:11px;color:var(--tr-placeholder,#858585);">暂无历史记录</div>';
      return;
    }

    for (const entry of history) {
      const item = createHistoryItem(entry);
      listEl.appendChild(item);
    }
  } catch {
    // chrome.storage 不可用时静默失败
  }
}

/**
 * 加载并渲染预设列表
 * @param {HTMLElement} [menuElement] - 菜单 DOM 元素，优先从该元素查询
 */
export async function loadPresetItems(menuElement) {
  const listEl = menuElement
    ? menuElement.querySelector('#tr-preset-list')
    : getShadowElement('#tr-preset-list');
  if (!listEl) return;

  try {
    let presets = await getPresets();

    if (presetSearchTerm) {
      presets = presets.filter((p) =>
        (p.name || '').toLowerCase().includes(presetSearchTerm)
      );
    }

    listEl.innerHTML = '';

    if (presets.length === 0) {
      const msg = presetSearchTerm
        ? '无匹配的预设'
        : '暂无预设规则';
      listEl.innerHTML =
        `<div style="padding:4px 12px 8px;font-size:11px;color:var(--tr-placeholder,#858585);">${msg}</div>`;
      return;
    }

    for (const preset of presets) {
      const item = createPresetItem(preset);
      listEl.appendChild(item);
    }
  } catch {
    // chrome.storage 不可用时静默失败
  }
}

// ============================================================
// 事件处理器
// ============================================================

async function handleSaveCurrentAsPreset() {
  try {
    const presets = await getPresets();
    if (presets.length >= PRESET_MAX) {
      alert(`预设已满（上限${PRESET_MAX}条），请先删除不需要的预设`);
      return;
    }

    const findInput = getShadowElement(`#${UIConstants.FIND_INPUT_ID}`);
    const replaceInput = getShadowElement(`#${UIConstants.REPLACE_INPUT_ID}`);
    const findText = findInput ? findInput.value : '';
    const replaceText = replaceInput ? replaceInput.value : '';

    if (!findText.trim()) {
      alert('查找内容不能为空');
      return;
    }

    const name = prompt('请输入预设名称：', '');
    if (name === null) return;
    if (!name.trim()) {
      alert('预设名称不能为空');
      return;
    }

    await savePreset(name.trim(), findText, replaceText, {});
    await loadPresetItems(getMenuEl());
  } catch (err) {
    alert('保存预设失败：' + (err.message || '未知错误'));
  }
}

async function handleDeletePreset(id, name) {
  if (!confirm(`确定要删除预设「${name}」吗？`)) return;

  try {
    await deletePreset(id);
    await loadPresetItems(getMenuEl());
  } catch (err) {
    alert('删除预设失败：' + (err.message || '未知错误'));
  }
}

async function handleExportPresets() {
  try {
    const json = await exportPresets();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const filename = `text-replacer-presets-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('导出失败：' + (err.message || '未知错误'));
  }
}

async function handleImportPresets(event) {
  const fileInput = event.target;
  const file = fileInput.files[0];
  if (!file) return;

  try {
    const text = await readFileAsText(file);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      alert('导入失败：无效的 JSON 格式');
      return;
    }
    if (!Array.isArray(data)) {
      alert('导入失败：数据格式错误，应为数组');
      return;
    }
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item.name || item.findText === undefined || item.replaceText === undefined) {
        alert(`导入失败：第 ${i + 1} 项缺少必需字段（name/findText/replaceText）`);
        return;
      }
    }

    const currentPresets = await getPresets();
    const currentNames = new Set(currentPresets.map((p) => p.name + '|||' + p.findText));
    let newCount = currentPresets.length;
    for (const item of data) {
      const key = item.name + '|||' + item.findText;
      if (!currentNames.has(key)) {
        newCount++;
        currentNames.add(key);
      }
    }
    if (newCount > PRESET_MAX) {
      alert(`导入失败：导入后将超过预设上限（${PRESET_MAX}条），请先删除部分预设`);
      return;
    }

    await importPresets(text);
    presetSearchTerm = '';
    const menu = getMenuEl();
    const searchInput = menu ? menu.querySelector('#tr-preset-search') : getShadowElement('#tr-preset-search');
    if (searchInput) searchInput.value = '';
    await loadPresetItems(menu);
    alert('导入成功！');
  } catch (err) {
    alert('导入失败：' + (err.message || '未知错误'));
  } finally {
    fileInput.value = '';
  }
}

// ============================================================
// 工具函数
// ============================================================

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

function createHistoryItem(entry) {
  const item = document.createElement('div');
  item.className = 'tr-menu-item';
  item.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;' +
    'padding:4px 12px;font-size:12px;cursor:pointer;color:var(--tr-text,#cccccc);';

  const textSpan = document.createElement('span');
  textSpan.style.cssText =
    'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  textSpan.textContent = `${entry.findText || '(空)'} → ${entry.replaceText || '(仅搜索)'}`;
  textSpan.title = `查找: ${entry.findText || ''}\n替换: ${entry.replaceText || ''}`;

  textSpan.addEventListener('click', () => {
    fillInputs(entry.findText, entry.replaceText);
    const menu = getMenuEl();
    if (menu) menu.style.display = 'none';
  });

  textSpan.addEventListener('mouseenter', () => {
    item.style.background = 'var(--tr-btn-hover,#3c3c3c)';
  });
  textSpan.addEventListener('mouseleave', () => {
    item.style.background = '';
  });

  // 收藏按钮
  const favBtn = document.createElement('button');
  favBtn.textContent = '⭐';
  favBtn.title = '保存为预设';
  favBtn.style.cssText =
    'background:transparent;border:none;cursor:pointer;font-size:14px;' +
    'padding:0 4px;color:var(--tr-text,#cccccc);flex-shrink:0;';
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const name = entry.findText ? entry.findText.substring(0, 30) : '未命名';
    const presetName = prompt('预设名称:', name);
    if (presetName) {
      savePreset(presetName, entry.findText || '', entry.replaceText || '', entry.options || {})
        .then(() => {
          loadPresetItems(getMenuEl());
        })
        .catch((err) => {
          alert('保存失败: ' + err.message);
        });
    }
  });

  item.appendChild(textSpan);
  item.appendChild(favBtn);
  return item;
}

function createPresetItem(preset) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tr-preset-item';
  wrapper.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;' +
    'padding:2px 12px;font-size:12px;color:var(--tr-text,#cccccc);';

  const nameEl = document.createElement('span');
  nameEl.textContent = truncate(preset.name, 28);
  nameEl.title = `查找: ${preset.findText}\n替换: ${preset.replaceText}`;
  nameEl.style.cssText =
    'flex:1;min-width:0;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  nameEl.addEventListener('mouseenter', () => {
    wrapper.style.background = 'var(--tr-btn-hover,#3c3c3c)';
  });
  nameEl.addEventListener('mouseleave', () => {
    wrapper.style.background = '';
  });
  nameEl.addEventListener('click', (e) => {
    e.stopPropagation();
    fillInputs(preset.findText, preset.replaceText);
    const menu = getMenuEl();
    if (menu) menu.style.display = 'none';
  });

  const delBtn = document.createElement('button');
  delBtn.textContent = '✕';
  delBtn.title = '删除预设';
  delBtn.style.cssText =
    'background:none;border:none;color:var(--tr-placeholder,#858585);cursor:pointer;' +
    'font-size:12px;padding:0 2px;line-height:1;flex-shrink:0;margin-left:4px;';
  delBtn.addEventListener('mouseenter', () => {
    delBtn.style.color = '#f44747';
  });
  delBtn.addEventListener('mouseleave', () => {
    delBtn.style.color = 'var(--tr-placeholder,#858585)';
  });
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeletePreset(preset.id, preset.name);
  });

  wrapper.appendChild(nameEl);
  wrapper.appendChild(delBtn);
  return wrapper;
}

function createMenuItem(label, onClick) {
  const item = document.createElement('div');
  item.className = 'tr-menu-item';
  item.style.cssText =
    'padding:4px 12px;font-size:12px;cursor:pointer;color:var(--tr-text,#cccccc);' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

  item.textContent = label;

  item.addEventListener('mouseenter', () => {
    item.style.background = 'var(--tr-btn-hover,#3c3c3c)';
  });
  item.addEventListener('mouseleave', () => {
    item.style.background = '';
  });
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
    const menu = getMenuEl();
    if (menu) menu.style.display = 'none';
  });

  return item;
}

function fillInputs(findText, replaceText) {
  const findInput = getShadowElement(`#${UIConstants.FIND_INPUT_ID}`);
  const replaceInput = getShadowElement(`#${UIConstants.REPLACE_INPUT_ID}`);

  if (findInput) {
    findInput.value = findText;
    findInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (replaceInput) {
    replaceInput.value = replaceText;
  }

  if (replaceText) {
    const panel = getPanelEl();
    const replaceRow = panel ? panel.querySelector('#tr-replace-row') : null;
    if (replaceRow) {
      replaceRow.classList.add(UIConstants.REPLACE_VISIBLE_CLASS);
    }
  }
}

function truncate(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}
