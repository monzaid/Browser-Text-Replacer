/**
 * 文本替换器 - 执行全局文本替换的核心逻辑
 * 支持 VSCode 风格的查找替换功能
 * 支持 iframe 和动态元素检测 (ESM)
 */

import { findAllEditableElements, getElementValue, setElementValue, startObserving, stopObserving } from './element-finder.js';
import { ReplaceStatus, UIConstants } from '../../shared/constants.js';
import { highlightElement, clearHighlight, clearAllHighlights, highlightPreviewElement } from './text-highlighter.js';
import { saveHistory } from '../../storage/store.js';
import { proxy } from '../message-proxy.js';

// 通过 Shadow Root 获取面板内的 UI 元素
function getPanelUIElement(id) {
  const host = document.getElementById('text-replacer-host');
  if (!host || !host.shadowRoot) return null;
  return host.shadowRoot.querySelector(`#${id}`);
}

function isPanelElement(target) {
  const host = document.getElementById('text-replacer-host');
  if (!host || !host.shadowRoot) return false;
  const panel = host.shadowRoot.querySelector(`#${UIConstants.PANEL_ID}`);
  if (!panel) return false;
  return panel.contains(target);
}

// 当前匹配状态
let currentMatches = [];
let currentMatchIndex = -1;
let searchOptions = {
  matchCase: false,
  matchWord: false,
  useRegex: false,
};

// 当前搜索文本和监听器状态
let currentSearchText = '';
let inputListener = null;

// DOM 变化监听状态
let isDOMListening = false;

/**
 * 在所有可编辑元素中查找匹配项
 * @param {string} findText - 要查找的文本
 * @param {Object} options - 搜索选项
 * @param {boolean} shouldFocus - 是否聚焦到匹配元素
 * @returns {Object} 查找结果
 */
export function findMatches(findText, options = {}, shouldFocus = false) {
  // 合并选项
  searchOptions = { ...searchOptions, ...options };

  // 验证输入
  if (!findText || findText.trim() === '') {
    currentMatches = [];
    currentMatchIndex = -1;
    return {
      status: ReplaceStatus.EMPTY_FIND,
      message: '',
      count: 0,
      current: 0,
    };
  }

  // 查找所有可编辑元素（包括 iframe 中的）
  const elementsWithFrame = findAllEditableElements();

  if (elementsWithFrame.length === 0) {
    currentMatches = [];
    currentMatchIndex = -1;
    return {
      status: ReplaceStatus.NO_MATCH,
      message: '无可编辑元素',
      count: 0,
      current: 0,
    };
  }

  // 清除之前的高亮
  clearAllHighlights();

  // 搜索所有匹配
  currentMatches = [];
  elementsWithFrame.forEach((item, elemIndex) => {
    const element = item.element;
    const frame = item.frame;
    const value = getElementValue(element);
    const matches = findInText(value, findText, searchOptions);

    matches.forEach((match) => {
      currentMatches.push({
        element,
        frame,        // 保存 frame 引用，用于后续操作
        elemIndex,
        ...match,
      });
    });
  });

  currentMatchIndex = currentMatches.length > 0 ? 0 : -1;

  // 清除所有旧高亮
  clearAllHighlights();

  // 高亮所有匹配
  currentMatches.forEach((match, index) => {
    const isCurrent = (index === currentMatchIndex);
    highlightElement(match.element, findText, isCurrent ? index : -1, searchOptions);
  });

  // 高亮当前匹配（只在需要聚焦时才聚焦）
  if (currentMatches.length > 0 && shouldFocus) {
    highlightCurrentMatch(true);
  }

  // 保存当前搜索文本
  currentSearchText = findText;

  return {
    status: currentMatches.length > 0 ? ReplaceStatus.SUCCESS : ReplaceStatus.NO_MATCH,
    count: currentMatches.length,
    current: currentMatchIndex + 1,
  };
}

/**
 * 开始监听页面输入变化和 DOM 变化
 */
export function startListening() {
  if (inputListener) return; // 已经在监听

  // 使用事件委托监听所有 input 和 change 事件
  inputListener = function(e) {
    // 忽略插件面板内的事件
    if (isPanelElement(e.target)) {
      return;
    }

    // 预览模式下不触发自动搜索 — 预览高亮由 refreshAllPreviewHighlights 管理
    // 否则 findMatches → clearAllHighlights 会摧毁预览 overlay，导致点击穿透
    if (previewMatches.length > 0) return;

    // 只处理可编辑元素
    const target = e.target;
    if (target.matches && target.matches('input, textarea, [contenteditable]')) {
      // 如果有当前搜索文本，延迟后重新搜索
      if (currentSearchText && currentSearchText.trim() !== '') {
        // 防抖处理
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        searchTimeout = setTimeout(() => {
          findMatches(currentSearchText, searchOptions, false);
          updateUIFromSearch();
          // 通知 UI 层更新预览/替换按钮状态
          proxy.emit('matches:updated', {
            count: currentMatches.length,
            current: currentMatchIndex + 1,
          });
        }, 300);
      }
    }
  };

  document.addEventListener('input', inputListener, true);
  document.addEventListener('change', inputListener, true);

  // 启动 DOM 变化监听
  if (!isDOMListening) {
    startObserving(() => {
      // 预览模式下跳过（高亮由 refreshAllPreviewHighlights 管理）
      if (previewMatches.length > 0) return;
      // DOM 变化回调：重新执行搜索
      if (currentSearchText && currentSearchText.trim() !== '') {
        findMatches(currentSearchText, searchOptions, false);
        updateUIFromSearch();
        proxy.emit('matches:updated', {
          count: currentMatches.length,
          current: currentMatchIndex + 1,
        });
      }
    });
    isDOMListening = true;
  }
}

/**
 * 停止监听页面输入变化和 DOM 变化
 */
export function stopListening() {
  if (inputListener) {
    document.removeEventListener('input', inputListener, true);
    document.removeEventListener('change', inputListener, true);
    inputListener = null;
  }

  // 停止 DOM 变化监听
  if (isDOMListening) {
    stopObserving();
    isDOMListening = false;
  }
}

/**
 * 从搜索结果更新 UI
 */
function updateUIFromSearch() {
  const matchCountEl = getPanelUIElement(UIConstants.MATCH_COUNT_ID);
  const prevBtn = getPanelUIElement(UIConstants.PREV_BTN_ID);
  const nextBtn = getPanelUIElement(UIConstants.NEXT_BTN_ID);
  const replaceOneBtn = getPanelUIElement(UIConstants.REPLACE_ONE_BTN_ID);
  const replaceAllBtn = getPanelUIElement(UIConstants.REPLACE_ALL_BTN_ID);

  if (matchCountEl) {
    if (currentMatches.length === 0) {
      matchCountEl.textContent = '无结果';
    } else {
      matchCountEl.textContent = `${currentMatchIndex + 1} / ${currentMatches.length}`;
    }
  }

  const hasMatches = currentMatches.length > 0;
  if (prevBtn) prevBtn.disabled = !hasMatches;
  if (nextBtn) nextBtn.disabled = !hasMatches;
  if (replaceOneBtn) replaceOneBtn.disabled = !hasMatches;
  if (replaceAllBtn) replaceAllBtn.disabled = !hasMatches;
}

let searchTimeout = null;

/**
 * 在文本中查找所有匹配
 * @param {string} text - 要搜索的文本
 * @param {string} pattern - 搜索模式
 * @param {Object} options - 搜索选项
 * @returns {Array} 匹配结果数组
 */
function findInText(text, pattern, options) {
  const matches = [];
  const { matchCase, matchWord, useRegex } = options;

  let searchPattern = pattern;
  let flags = 'g';
  let regex;

  if (!matchCase) {
    flags += 'i';
  }

  try {
    // 先转义特殊字符
    const escaped = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (useRegex) {
      // 正则表达式模式
      regex = new RegExp(searchPattern, flags);
    } else {
      // 普通模式
      regex = new RegExp(escaped, flags);
    }

    // 全词匹配：始终添加 \b 边界，不受正则表达式开关影响
    if (matchWord) {
      regex = new RegExp(`\\b${searchPattern}\\b`, flags);
    }

    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });

      // 防止零宽度匹配导致无限循环
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  } catch (e) {
    // 正则表达式错误
    console.error('Regex error:', e);
  }

  return matches;
}

/**
 * 导航到上一个匹配
 */
export function goToPrevMatch() {
  if (currentMatches.length === 0) return null;

  // 更新高亮
  updateHighlights();

  currentMatchIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : currentMatches.length - 1;

  // 更新高亮显示
  updateHighlights();

  // 聚焦到当前匹配
  highlightCurrentMatch(true);

  updateUIFromSearch();

  return {
    count: currentMatches.length,
    current: currentMatchIndex + 1,
  };
}

/**
 * 导航到下一个匹配
 */
export function goToNextMatch() {
  if (currentMatches.length === 0) return null;

  // 更新高亮
  updateHighlights();

  currentMatchIndex = currentMatchIndex < currentMatches.length - 1 ? currentMatchIndex + 1 : 0;

  // 更新高亮显示
  updateHighlights();

  // 聚焦到当前匹配
  highlightCurrentMatch(true);

  updateUIFromSearch();

  return {
    count: currentMatches.length,
    current: currentMatchIndex + 1,
  };
}

/**
 * 检查当前匹配元素是否在可视区内
 * @returns {boolean}
 */
export function isCurrentMatchInViewport() {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return false;
  const element = currentMatches[currentMatchIndex].element;
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * 聚焦当前匹配（不导航，不替换）
 * 用于"替换当前"按钮的第一次点击：只跳转聚焦
 */
export function focusCurrentMatch() {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return null;
  highlightCurrentMatch(true);
  updateUIFromSearch();
  return {
    count: currentMatches.length,
    current: currentMatchIndex + 1,
  };
}

/**
 * 更新所有元素的高亮显示
 */
function updateHighlights() {
  // 清除所有高亮
  clearAllHighlights();

  // 重新高亮所有匹配
  if (currentSearchText && currentMatches.length > 0) {
    currentMatches.forEach((match, index) => {
      const isCurrent = (index === currentMatchIndex);
      highlightElement(match.element, currentSearchText, isCurrent ? index : -1, searchOptions);
    });
  }
}

/**
 * 高亮当前匹配
 * @param {boolean} shouldFocus - 是否聚焦到匹配元素
 */
function highlightCurrentMatch(shouldFocus = false) {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return;

  const match = currentMatches[currentMatchIndex];
  const element = match.element;

  // 只在需要聚焦时才操作元素（聚焦和选中文本）
  // 注意：setSelectionRange 会自动聚焦到元素，所以只在 shouldFocus=true 时才调用
  if (shouldFocus) {
    element.focus();

    // 选中文本
    if (element.isContentEditable) {
      // contenteditable: 跳过 Range 选择（DOM 被高亮 span 包裹后，原始偏移量对应
      // 的文本节点可能已分裂，导致 Range.setEnd 抛出 IndexSizeError）。
      // 仅滚动到元素可视区域。
      try {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {
        // 滚动失败静默忽略
      }
    } else {
      // 对于 input/textarea，使用 setSelectionRange
      // 注意：某些 input 类型（email, number, date 等）不支持选区
      const supportsSelection = (
        element.tagName === 'TEXTAREA' ||
        (element.tagName === 'INPUT' &&
         /^(text|search|url|tel|password)$/i.test(element.type))
      );

      if (supportsSelection) {
        // 这会自动将焦点设置到该元素
        element.setSelectionRange(match.start, match.end);

        // 对于 textarea，执行额外的滚动定位
        if (element.tagName === 'TEXTAREA') {
          scrollToMatch(element, match.start, match.end);
        }
      }
      // 对于不支持选区的元素（email, number 等），只聚焦即可

      // 对所有元素类型都滚动到可视区域居中
      try {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {
        // 滚动失败静默忽略
      }
    }
  }
}

/**
 * 滚动到匹配文本位置
 * @param {HTMLTextAreaElement} element - textarea 元素
 * @param {number} matchStart - 匹配起始位置
 * @param {number} matchEnd - 匹配结束位置
 */
function scrollToMatch(element, matchStart, matchEnd) {
  try {
    // 延迟执行滚动，确保 setSelectionRange 已经完成
    setTimeout(() => {
      // 获取计算样式
      const computedStyle = getComputedStyle(element);

      // 处理 lineHeight 可能是 "normal" 的情况
      let lineHeight = parseFloat(computedStyle.lineHeight);
      if (isNaN(lineHeight) || lineHeight === 0) {
        // 如果 lineHeight 是 normal 或无效值，使用字体大小的 1.2 倍
        const fontSize = parseFloat(computedStyle.fontSize);
        lineHeight = fontSize * 1.2;
      }

      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;

      // 计算匹配文本所在的行号
      const textBeforeMatch = element.value.substring(0, matchStart);
      const lines = textBeforeMatch.split('\n');
      const lineNumber = lines.length;

      // 计算目标滚动位置（使匹配文本在可视区域中心）
      const targetScrollTop = (lineNumber - 1) * lineHeight + paddingTop
        - (element.clientHeight / 2) + (lineHeight / 2);

      // 使用 scrollTop 进行滚动（更可靠）
      element.scrollTop = Math.max(0, targetScrollTop);

    }, 10); // 短暂延迟确保选区已设置
  } catch (e) {
    // 如果滚动失败，不影响其他功能
    console.warn('滚动到匹配位置失败:', e);
  }
}

/**
 * 查找包含指定偏移量的文本节点
 */
function findTextNode(element, offset) {
  if (element.nodeType === Node.TEXT_NODE) {
    return element;
  }

  for (let child of element.childNodes) {
    const result = findTextNode(child, offset);
    if (result) return result;
  }

  return null;
}

/**
 * 替换当前匹配
 * @param {string} replaceText - 替换文本
 */
export async function replaceOne(replaceText) {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) {
    return {
      status: ReplaceStatus.NO_MATCH,
      message: '无匹配项',
    };
  }

  const match = currentMatches[currentMatchIndex];
  const element = match.element;
  const currentValue = getElementValue(element);

  // 执行替换
  const before = currentValue.substring(0, match.start);
  const after = currentValue.substring(match.end);
  const newValue = before + replaceText + after;

  setElementValue(element, newValue);

  // 清除该元素的高亮
  clearHighlight(element);

  // 重新计算匹配（不聚焦）
  // 使用 currentSearchText（已在 findMatches 时保存）而非 document.getElementById
  const newFindText = currentSearchText || '';

  if (newFindText) {
    findMatches(newFindText, searchOptions, false);
  }

  // 保存历史记录
  await saveHistory(
    currentSearchText || '',
    replaceText || '',
    { matchCase: searchOptions.matchCase, matchWord: searchOptions.matchWord, useRegex: searchOptions.useRegex }
  ).catch(() => {});

  // 通知 UI 刷新历史列表
  proxy.emit('history:updated');

  return {
    status: ReplaceStatus.SUCCESS,
    count: currentMatches.length,
    current: currentMatchIndex + 1,
  };
}

/**
 * 替换所有匹配
 * @param {string} findText - 查找文本
 * @param {string} replaceText - 替换文本
 * @param {Object} options - 搜索选项
 */
export async function replaceAll(findText, replaceText, options = {}) {
  searchOptions = { ...searchOptions, ...options };

  if (!findText || findText.trim() === '') {
    return {
      status: ReplaceStatus.EMPTY_FIND,
      message: '请输入要查找的文本',
      total: 0,
      replaced: 0,
      matchCount: 0,
    };
  }

  const elementsWithFrame = findAllEditableElements();

  if (elementsWithFrame.length === 0) {
    return {
      status: ReplaceStatus.NO_MATCH,
      message: '页面上没有找到可编辑的元素',
      total: 0,
      replaced: 0,
      matchCount: 0,
    };
  }

  let totalElements = 0;
  let replacedElements = 0;
  let totalMatches = 0;

  elementsWithFrame.forEach((item) => {
    const element = item.element;
    const currentValue = getElementValue(element);
    const newValue = replaceInText(currentValue, findText, replaceText, searchOptions);

    if (newValue !== currentValue) {
      setElementValue(element, newValue);
      replacedElements++;
      totalMatches += countMatches(currentValue, findText, searchOptions);
    }

    totalElements++;
  });

  // 清除匹配状态
  currentMatches = [];
  currentMatchIndex = -1;

  if (replacedElements === 0) {
    return {
      status: ReplaceStatus.NO_MATCH,
      message: `在 ${totalElements} 个元素中未找到匹配的文本`,
      total: totalElements,
      replaced: 0,
      matchCount: 0,
    };
  }

  // 保存历史记录 (fire-and-forget)
  await saveHistory(
    findText || '',
    replaceText || '',
    { matchCase: searchOptions.matchCase, matchWord: searchOptions.matchWord, useRegex: searchOptions.useRegex }
  ).catch(() => {});

  // 通知 UI 刷新历史列表
  proxy.emit('history:updated');

  return {
    status: ReplaceStatus.SUCCESS,
    message: `已替换 ${totalMatches} 处`,
    total: totalElements,
    replaced: replacedElements,
    matchCount: totalMatches,
  };
}

/**
 * 在文本中执行替换
 */
function replaceInText(text, pattern, replacement, options) {
  const { matchCase, matchWord, useRegex } = options;

  let flags = matchCase ? 'g' : 'gi';
  let regex;

  try {
    if (useRegex) {
      regex = new RegExp(pattern, flags);
    } else {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (matchWord) {
        regex = new RegExp(`\\b${escaped}\\b`, flags);
      } else {
        regex = new RegExp(escaped, flags);
      }
    }

    return text.replace(regex, replacement);
  } catch (e) {
    return text;
  }
}

/**
 * 计算匹配数量
 */
function countMatches(text, pattern, options) {
  const matches = findInText(text, pattern, options);
  return matches.length;
}

// ============================================================
//  预览状态管理
// ============================================================

/** @type {Array<{element, frame, start, end, text, selected: boolean}>} */
let previewMatches = [];
let previewFindText = '';
let previewOptions = {};

/**
 * 重新高亮所有元素的预览匹配（更新所有 data-preview-index）
 * 在 previewMatches 数组被修改后调用，确保 span 上的索引与数组一致
 */
function refreshAllPreviewHighlights() {
  clearAllHighlights();

  const byElement = new Map();
  previewMatches.forEach((match, idx) => {
    const key = match.element;
    if (!byElement.has(key)) byElement.set(key, []);
    byElement.get(key).push({ ...match, _idx: idx });
  });

  byElement.forEach((matches, element) => {
    highlightPreviewElement(element, previewFindText, previewOptions, matches);
  });
}

/**
 * 进入预览模式：对所有匹配建立预览状态，初始全部不选中（selected: false）
 * @param {string} findText - 查找文本
 * @param {Object} options - 搜索选项
 * @returns {number} 预览匹配数量
 */
export function enterPreviewMode(findText, options = {}) {
  previewFindText = findText;
  previewOptions = options;
  previewMatches = currentMatches.map(m => ({ ...m, selected: false }));

  // 用预览模式高亮所有匹配
  refreshAllPreviewHighlights();

  return previewMatches.length;
}

/**
 * 切换预览匹配的选择状态
 * @param {number} index - 匹配索引
 * @returns {{index: number, selected: boolean, totalSelected: number}|undefined}
 */
export function togglePreviewMatch(index) {
  if (index < 0 || index >= previewMatches.length) return;

  previewMatches[index].selected = !previewMatches[index].selected;
  const match = previewMatches[index];

  // 全量刷新高亮（确保所有 span 的 data-preview-index 一致）
  refreshAllPreviewHighlights();

  return {
    index,
    selected: previewMatches[index].selected,
    totalSelected: previewMatches.filter(m => m.selected).length,
  };
}

/**
 * 双击即时替换单个匹配
 * @param {number} index - 匹配索引
 * @param {string} replaceText - 替换文本
 * @returns {{replaced: boolean, remaining: number}|null}
 */
export function executeDoubleReplace(index, replaceText) {
  if (index < 0 || index >= previewMatches.length) return null;

  const match = previewMatches[index];
  const element = match.element;

  // 对于 contenteditable，先清除高亮恢复原始 DOM，再获取值
  // 高亮 span 包裹后 innerText 可能与原始搜索时的偏移量不一致
  if (element.isContentEditable) {
    clearHighlight(element);
  }

  const currentValue = getElementValue(element);
  const safeStart = Math.min(match.start, currentValue.length);
  const safeEnd = Math.min(match.end, currentValue.length);
  const before = currentValue.substring(0, safeStart);
  const after = currentValue.substring(safeEnd);
  const newValue = before + replaceText + after;

  setElementValue(element, newValue);

  // 如果是 input/textarea（非 contenteditable），还需要清除 overlay
  if (!element.isContentEditable) {
    clearHighlight(element);
  }

  // 计算长度差
  const lengthDiff = replaceText.length - (safeEnd - safeStart);

  // 从预览列表移除当前匹配
  previewMatches.splice(index, 1);

  // 更新同元素中剩余匹配的偏移量
  previewMatches.forEach((m) => {
    if (m.element === element && m.start > safeEnd) {
      m.start += lengthDiff;
      m.end += lengthDiff;
    }
  });

  // 重新高亮所有元素（更新所有 data-preview-index）
  // 必须全量刷新，因为 splice 导致全局索引偏移，其他元素的 span 索引也需要更新
  if (previewMatches.length > 0) {
    refreshAllPreviewHighlights();
  } else {
    clearAllHighlights();
  }

  return { replaced: true, remaining: previewMatches.length };
}

/**
 * 应用所有选中的预览替换
 * @param {string} replaceText - 替换文本
 * @returns {{replaced: number}}
 */
export function applyPreviewedReplacements(replaceText) {
  const selected = previewMatches.filter(m => m.selected);
  let count = 0;

  // 按元素分组，从后往前替换以保持偏移量
  const byElement = new Map();
  selected.forEach(match => {
    const key = match.element;
    if (!byElement.has(key)) byElement.set(key, []);
    byElement.get(key).push(match);
  });

  byElement.forEach((matches, element) => {
    // 按 start 降序排列（从后往前替换）
    matches.sort((a, b) => b.start - a.start);
    const currentValue = getElementValue(element);
    let newValue = currentValue;
    matches.forEach(match => {
      newValue = newValue.substring(0, match.start) + replaceText + newValue.substring(match.end);
    });
    setElementValue(element, newValue);
    clearHighlight(element);
    count += matches.length;
  });

  // 退出预览模式
  exitPreviewMode();

  return { replaced: count };
}

/**
 * 退出预览模式
 */
export function exitPreviewMode() {
  previewMatches = [];
  previewFindText = '';
  previewOptions = {};
  clearAllHighlights();
}

/**
 * 获取预览状态（供 UI 查询）
 * @returns {{total: number, selected: number, inPreview: boolean}}
 */
export function getPreviewState() {
  return {
    total: previewMatches.length,
    selected: previewMatches.filter(m => m.selected).length,
    inPreview: previewMatches.length > 0,
  };
}
