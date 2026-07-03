/**
 * 文本高亮器 - 独立的高亮功能模块
 * 使用覆盖层方式实现 input/textarea 的高亮，支持 contenteditable
 * 支持主文档和同源 iframe 中的元素
 * 不会触发焦点转移 (ESM)
 */

import { escapeHTML, generateElementId } from '../../shared/utils.js';

// 高亮覆盖层管理 - 存储结构：Map<elementId, {overlay, frame}>
const highlightOverlays = new Map();

// 存储所有包含高亮的 iframe 文档引用，用于清理
const activeFrames = new Set();
activeFrames.add(document); // 主文档

// 存储已注入 CSS 的 frame，避免重复注入
const cssInjectedFrames = new Set();

/**
 * 为指定元素创建/更新高亮
 * @param {HTMLElement} element - 要高亮的元素
 * @param {string} searchText - 搜索文本
 * @param {number} matchIndex - 当前匹配索引（可选，用于高亮当前项）
 * @param {Object} options - 搜索选项
 * @param {string} mode - 颜色模式:
 *   'default'          - 黄色高亮（搜索匹配）
 *   'preview-selected' - 绿色高亮（预览中被选中，将被替换）
 *   'preview-skipped'  - 黄色高亮（预览中未选中，不替换）
 */
export function highlightElement(element, searchText, matchIndex = -1, options = {}, mode = 'default') {
  if (!searchText || !element) {
    clearHighlight(element);
    return;
  }

  // 确保元素所属的文档注入了高亮样式
  const frame = element.ownerDocument;
  ensureStylesInjected(frame);

  if (element.isContentEditable) {
    highlightContentEditable(element, searchText, matchIndex, options, mode);
  } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    highlightInputOverlay(element, searchText, matchIndex, options, mode);
  }
}

/**
 * 为 input/textarea 创建覆盖层高亮
 */
function highlightInputOverlay(element, searchText, matchIndex, options, mode = 'default') {
  // 先清除旧的高亮
  clearHighlight(element);

  const value = element.value;
  if (!value) return;

  // 查找所有匹配
  const matches = findAllMatches(value, searchText, options);
  if (matches.length === 0) return;

  // 获取元素所属的文档
  const frame = element.ownerDocument;

  // 在正确的文档中创建覆盖层
  const overlay = frame.createElement('div');
  overlay.className = 'tr-highlight-overlay';
  overlay.dataset.targetElement = generateElementId(element);

  // 复制元素样式
  const styles = copyElementStyles(element);
  Object.assign(overlay.style, styles);

  // 设置覆盖层特有样式
  // 预览模式下允许 pointer-events 以支持单击/双击交互
  const pointerEvents = (mode === 'preview-selected' || mode === 'preview-skipped') ? 'auto' : 'none';
  overlay.style.cssText += `
    position: absolute;
    pointer-events: ${pointerEvents};
    z-index: 2147483646;
    white-space: ${element.tagName === 'INPUT' ? 'nowrap' : 'pre-wrap'};
    overflow: hidden;
    background: transparent;
    color: transparent;
    border-style: solid;
    border-color: transparent;
  `.replace(/\s+/g, ' ');

  // 构建高亮 HTML（传入 mode）
  overlay.innerHTML = buildHighlightHTML(value, matches, matchIndex, mode);

  // 插入覆盖层
  insertOverlay(overlay, element, frame);

  // 保存引用和 frame 信息
  highlightOverlays.set(generateElementId(element), { overlay, frame });

  // 记录这个 frame
  if (frame !== document) {
    activeFrames.add(frame);
  }
}

/**
 * 为 contenteditable 元素高亮
 */
function highlightContentEditable(element, searchText, matchIndex, options, mode = 'default') {
  // 获取元素所属的文档
  const frame = element.ownerDocument;

  // 清除旧的高亮
  clearHighlight(element);

  // 在正确的文档中创建 TreeWalker
  const walker = frame.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // 跳过已经在高亮元素内的节点
        if (node.parentElement.classList.contains('tr-highlight-match') ||
            node.parentElement.classList.contains('tr-highlight-current') ||
            node.parentElement.classList.contains('tr-preview-selected')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  // 记录这个 frame
  if (frame !== document) {
    activeFrames.add(frame);
  }

  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeValue && node.nodeValue.trim()) {
      textNodes.push(node);
    }
  }

  // 为每个文本节点添加高亮
  textNodes.forEach(textNode => {
    highlightTextNode(textNode, searchText, matchIndex, options, mode);
  });
}

/**
 * 高亮单个文本节点
 */
function highlightTextNode(textNode, searchText, matchIndex, options, mode = 'default') {
  const text = textNode.nodeValue;
  const matches = findAllMatches(text, searchText, options);

  if (matches.length === 0) return;

  // 在正确的文档中创建 DocumentFragment
  const frame = textNode.ownerDocument;

  const fragment = frame.createDocumentFragment();
  let lastIndex = 0;

  matches.forEach((match, idx) => {
    // 添加匹配前的文本
    if (match.start > lastIndex) {
      fragment.appendChild(frame.createTextNode(text.substring(lastIndex, match.start)));
    }

    // 创建高亮元素（在正确的文档中）
    const span = frame.createElement('span');
    // 根据 mode 选择 CSS class
    if (mode === 'preview-selected') {
      span.className = 'tr-preview-selected';
    } else if (mode === 'preview-skipped') {
      span.className = 'tr-highlight-match';
    } else {
      // default mode
      span.className = 'tr-highlight-match';
      if (idx === matchIndex) {
        span.classList.add('tr-highlight-current');
      }
    }
    span.textContent = match.text;

    fragment.appendChild(span);

    lastIndex = match.end;
  });

  // 添加剩余文本
  if (lastIndex < text.length) {
    fragment.appendChild(frame.createTextNode(text.substring(lastIndex)));
  }

  // 替换原文本节点
  textNode.parentNode.replaceChild(fragment, textNode);
}

/**
 * 查找文本中所有匹配
 */
function findAllMatches(text, pattern, options) {
  const matches = [];
  const { matchCase, matchWord, useRegex } = options;

  let flags = 'g';
  if (!matchCase) flags += 'i';

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

    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });

      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  } catch (e) {
    // 正则表达式错误，返回空数组
  }

  return matches;
}

/**
 * 构建高亮 HTML（用于覆盖层）
 * @param {string} text - 原始文本
 * @param {Array} matches - 匹配结果数组
 * @param {number} currentIndex - 当前匹配索引
 * @param {string} mode - 颜色模式
 */
function buildHighlightHTML(text, matches, currentIndex, mode = 'default') {
  if (matches.length === 0) return escapeHTML(text);

  let result = '';
  let lastIndex = 0;

  matches.forEach((match, idx) => {
    // 添加匹配前的文本（转义 HTML）
    if (match.start > lastIndex) {
      result += escapeHTML(text.substring(lastIndex, match.start));
    }

    // 根据 mode 选择 CSS class
    let className;
    if (mode === 'preview-selected') {
      className = 'tr-preview-selected';
    } else if (mode === 'preview-skipped') {
      className = 'tr-highlight-match';
    } else {
      // default mode
      className = idx === currentIndex ? 'tr-highlight-current' : 'tr-highlight-match';
    }

    result += `<span class="${className}">${escapeHTML(match.text)}</span>`;

    lastIndex = match.end;
  });

  // 添加剩余文本
  if (lastIndex < text.length) {
    result += escapeHTML(text.substring(lastIndex));
  }

  return result;
}

/**
 * 插入覆盖层到正确位置
 * @param {HTMLElement} overlay - 覆盖层元素
 * @param {HTMLElement} targetElement - 目标元素
 * @param {Document} frame - 元素所属文档
 */
function insertOverlay(overlay, targetElement, frame) {
  const wrapper = ensureWrapper(targetElement, frame);
  wrapper.appendChild(overlay);

  // 用 top/left/right/bottom:0 让 overlay 填满 wrapper，不依赖具体尺寸计算
  // 避免 iframe 内 offsetWidth/offsetHeight 与 wrapper 实际尺寸偏差导致的偏移
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
}

/**
 * 确保目标元素有包装容器
 * @param {HTMLElement} element - 目标元素
 * @param {Document} frame - 元素所属文档
 */
function ensureWrapper(element, frame) {
  let wrapper = element.parentElement;

  // 如果父元素不是我们的包装器，创建一个
  if (!wrapper || !wrapper.classList.contains('tr-highlight-wrapper')) {
    wrapper = frame.createElement('div');
    wrapper.className = 'tr-highlight-wrapper';

    // 获取原始元素的 display 属性，确保保持一致的布局行为
    const computed = window.getComputedStyle(element);
    const originalDisplay = computed.display;

    // 设置包装器样式 - 使用原始元素的 display 值以保持布局一致性
    // 如果原始元素是 block，wrapper 也应该是 block
    // 如果是 inline-block，则使用 inline-block
    wrapper.style.position = 'relative';
    wrapper.style.display = originalDisplay === 'inline' ? 'inline-block' : originalDisplay;

    // 使用 offsetWidth 而非 computed.width —— offsetWidth 是元素自身属性，始终正确
    // computed.width 对 iframe 内元素可能因 box-sizing 差异导致偏差
    if (element.offsetWidth > 0) {
      wrapper.style.width = element.offsetWidth + 'px';
    }

    // 转移 margin 从 element 到 wrapper（inline-block 不折叠 margin）
    // 不转移会导致 element 在 wrapper 内向下偏移，overlay 用 top:0 定位在 wrapper 顶部产生偏差
    wrapper.style.marginTop = computed.marginTop;
    wrapper.style.marginBottom = computed.marginBottom;
    wrapper.style.marginLeft = computed.marginLeft;
    wrapper.style.marginRight = computed.marginRight;

    wrapper.style.padding = '0';
    wrapper.style.border = 'none';

    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(element);

    // 清除元素的 margin（已转移到 wrapper）
    element.style.margin = '0';
  }

  return wrapper;
}

/**
 * 更新覆盖层位置（响应窗口滚动等）
 *
 * 使用 offsetWidth/offsetHeight——始终相对于元素所在文档，不受 iframe 偏移影响。
 * 注意：不使用 getBoundingClientRect()，因为 iframe 内元素返回相对于顶级视口的坐标，
 * 而 overlay 定位基准是 wrapper（iframe 文档内），两者不一致导致偏移。
 */
function updateOverlayPosition(overlay, targetElement) {
  // 用 top/left/right/bottom:0 填满 wrapper，无需依赖元素尺寸计算
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
}

/**
 * 复制元素样式
 */
function copyElementStyles(element) {
  const computed = window.getComputedStyle(element);
  const styles = {};

  const styleProps = [
    'font-family', 'font-size', 'font-weight', 'font-style',
    'letter-spacing', 'line-height', 'text-transform',
    'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width',
    'text-align', 'direction', 'writing-mode'
  ];

  styleProps.forEach(prop => {
    styles[prop] = computed.getPropertyValue(prop);
  });

  return styles;
}

/**
 * 清除元素的高亮
 * @param {HTMLElement} element - 元素
 */
export function clearHighlight(element) {
  const id = generateElementId(element);
  const frame = element.ownerDocument;

  if (element.isContentEditable) {
    // 移除所有高亮 span
    const highlights = element.querySelectorAll('.tr-highlight-match, .tr-highlight-current, .tr-preview-selected');
    highlights.forEach(span => {
      const parent = span.parentNode;
      parent.replaceChild(frame.createTextNode(span.textContent), span);
      // 合并相邻文本节点
      parent.normalize();
    });
  } else {
    // 移除覆盖层
    const overlayData = highlightOverlays.get(id);
    if (overlayData && overlayData.overlay && overlayData.overlay.parentNode) {
      overlayData.overlay.parentNode.removeChild(overlayData.overlay);
    }
    highlightOverlays.delete(id);
  }
}

/**
 * 清除所有高亮
 * 包括主文档和所有 iframe 中的高亮
 */
export function clearAllHighlights() {
  // 移除所有覆盖层
  highlightOverlays.forEach((data) => {
    if (data.overlay && data.overlay.parentNode) {
      data.overlay.parentNode.removeChild(data.overlay);
    }
  });
  highlightOverlays.clear();

  // 移除所有活动 frame 中的 contenteditable 高亮
  activeFrames.forEach((frame) => {
    try {
      const highlights = frame.querySelectorAll('.tr-highlight-match, .tr-highlight-current, .tr-preview-selected');
      highlights.forEach(span => {
        const parent = span.parentNode;
        parent.replaceChild(frame.createTextNode(span.textContent), span);
        parent.normalize();
      });
    } catch (e) {
      // frame 可能已卸载，安全忽略
    }
  });

  // 清空活动 frame 集合
  activeFrames.clear();
  activeFrames.add(document); // 重新添加主文档
}

/**
 * 确保 iframe 文档注入了高亮样式
 * @param {Document} frame - 要检查的文档
 */
function ensureStylesInjected(frame) {
  if (cssInjectedFrames.has(frame)) {
    return; // 已注入，跳过
  }

  // 检查是否是同源 iframe（跨源 iframe 无法访问）
  try {
    // 尝试访问 frame 的 head
    const head = frame.head || frame.getElementsByTagName('head')[0];
    if (!head) {
      return;
    }

    // 检查是否已经有我们的样式
    if (frame.getElementById('text-replacer-styles')) {
      cssInjectedFrames.add(frame);
      return;
    }

    // 创建样式标签
    const style = frame.createElement('style');
    style.id = 'text-replacer-styles';
    style.textContent = `
      /* 高亮样式 - 用于 contenteditable */
      .tr-highlight-match {
        background: rgba(255, 215, 0, 0.3);
        border-radius: 2px;
      }

      .tr-highlight-current {
        background: rgba(255, 100, 0, 0.5);
        border-radius: 2px;
      }

      /* 预览选中样式（绿色） */
      .tr-preview-selected {
        background: rgba(0, 255, 0, 0.4) !important;
        border-radius: 2px;
      }

      /* 覆盖层样式 - 用于 input/textarea */
      .tr-highlight-overlay {
        position: absolute;
        pointer-events: none;
        z-index: 2147483646;
        white-space: pre;
        overflow: hidden;
        background: transparent;
        color: transparent;
      }

      .tr-highlight-overlay .tr-highlight-match {
        background: rgba(255, 215, 0, 0.4);
      }

      .tr-highlight-overlay .tr-highlight-current {
        background: rgba(255, 100, 0, 0.6);
      }

      .tr-highlight-overlay .tr-preview-selected {
        background: rgba(0, 255, 0, 0.4) !important;
        border-radius: 2px;
      }

      /* 包装器样式 */
      .tr-highlight-wrapper {
        position: relative;
        display: inline-block;
      }
    `;

    head.appendChild(style);
    cssInjectedFrames.add(frame);
  } catch (e) {
    // 跨源 iframe 或其他错误
  }
}

/**
 * 预览模式：为单个元素高亮，每个匹配可独立设置 selected 状态
 * @param {HTMLElement} element - 要高亮的元素
 * @param {string} searchText - 搜索文本
 * @param {Object} options - 搜索选项
 * @param {Array<{start: number, end: number, text: string, selected: boolean, _idx?: number}>} previewMatchData - 预览匹配数据
 */
export function highlightPreviewElement(element, searchText, options, previewMatchData) {
  if (!searchText || !element || !previewMatchData || previewMatchData.length === 0) {
    clearHighlight(element);
    return;
  }

  const frame = element.ownerDocument;
  ensureStylesInjected(frame);

  if (element.isContentEditable) {
    highlightPreviewContentEditable(element, searchText, options, previewMatchData);
  } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    highlightPreviewInputOverlay(element, searchText, options, previewMatchData);
  }
}

/**
 * 预览模式：input/textarea 覆盖层高亮
 */
function highlightPreviewInputOverlay(element, searchText, options, previewMatchData) {
  clearHighlight(element);

  const value = element.value || getElementValue(element);
  if (!value) return;

  const frame = element.ownerDocument;
  const overlay = frame.createElement('div');
  overlay.className = 'tr-highlight-overlay';
  overlay.dataset.targetElement = generateElementId(element);

  const styles = copyElementStyles(element);
  Object.assign(overlay.style, styles);

  overlay.style.cssText += `
    position: absolute;
    pointer-events: auto;
    z-index: 2147483646;
    white-space: ${element.tagName === 'INPUT' ? 'nowrap' : 'pre-wrap'};
    overflow: hidden;
    background: transparent;
    color: transparent;
    border-style: solid;
    border-color: transparent;
  `.replace(/\s+/g, ' ');

  // 构建混合 HTML
  overlay.innerHTML = buildPreviewHighlightHTML(value, previewMatchData);

  insertOverlay(overlay, element, frame);
  highlightOverlays.set(generateElementId(element), { overlay, frame });

  if (frame !== document) {
    activeFrames.add(frame);
  }
}

/**
 * 预览模式：contenteditable 高亮
 */
function highlightPreviewContentEditable(element, searchText, options, previewMatchData) {
  const frame = element.ownerDocument;
  clearHighlight(element);

  const walker = frame.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.parentElement.classList.contains('tr-highlight-match') ||
            node.parentElement.classList.contains('tr-highlight-current') ||
            node.parentElement.classList.contains('tr-preview-selected')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  if (frame !== document) {
    activeFrames.add(frame);
  }

  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeValue && node.nodeValue.trim()) {
      textNodes.push(node);
    }
  }

  // 策略：在每个文本节点内重新搜索匹配（与非预览版相同）
  // 按顺序消费 previewMatchData 获取 _idx 和 selected 状态
  let previewIdx = 0;

  textNodes.forEach(textNode => {
    const text = textNode.nodeValue;
    const localMatches = findAllMatches(text, searchText, options);

    if (localMatches.length === 0) return;

    const fragment = frame.createDocumentFragment();
    let lastIndex = 0;

    localMatches.forEach(localMatch => {
      // 添加匹配前的文本
      if (localMatch.start > lastIndex) {
        fragment.appendChild(frame.createTextNode(text.substring(lastIndex, localMatch.start)));
      }

      // 严格顺序消费：每找到一个本地匹配就直接取下一条 previewMatchData
      // 不比较文本内容，因为 previewMatches 的顺序与 findAllMatches 的搜索顺序一致
      const previewEntry = previewIdx < previewMatchData.length
        ? previewMatchData[previewIdx++]
        : null;

      // 创建 span
      const span = frame.createElement('span');
      if (previewEntry && previewEntry.selected) {
        span.className = 'tr-preview-selected';
      } else {
        span.className = 'tr-highlight-match';
      }
      if (previewEntry && previewEntry._idx !== undefined) {
        span.dataset.previewIndex = previewEntry._idx;
      }
      span.textContent = localMatch.text;
      fragment.appendChild(span);

      lastIndex = localMatch.end;
    });

    // 添加剩余文本
    if (lastIndex < text.length) {
      fragment.appendChild(frame.createTextNode(text.substring(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

/**
 * 预览模式：高亮单个文本节点
 */
function highlightPreviewTextNode(textNode, previewMatchData) {
  const text = textNode.nodeValue;
  const frame = textNode.ownerDocument;

  const fragment = frame.createDocumentFragment();
  let lastIndex = 0;

  previewMatchData.forEach((match) => {
    if (match.start > lastIndex) {
      fragment.appendChild(frame.createTextNode(text.substring(lastIndex, match.start)));
    }

    const span = frame.createElement('span');
    span.className = match.selected ? 'tr-preview-selected' : 'tr-highlight-match';
    if (match._idx !== undefined) {
      span.dataset.previewIndex = match._idx;
    }
    span.textContent = match.text;
    fragment.appendChild(span);

    lastIndex = match.end;
  });

  if (lastIndex < text.length) {
    fragment.appendChild(frame.createTextNode(text.substring(lastIndex)));
  }

  textNode.parentNode.replaceChild(fragment, textNode);
}

/**
 * 构建预览高亮 HTML（用于覆盖层）
 */
function buildPreviewHighlightHTML(text, matches) {
  if (matches.length === 0) return escapeHTML(text);

  let result = '';
  let lastIndex = 0;

  matches.forEach((match) => {
    if (match.start > lastIndex) {
      result += escapeHTML(text.substring(lastIndex, match.start));
    }

    const className = match.selected ? 'tr-preview-selected' : 'tr-highlight-match';
    const previewIndex = match._idx !== undefined ? match._idx : '';
    result += `<span class="${className}" data-preview-index="${previewIndex}">${escapeHTML(match.text)}</span>`;

    lastIndex = match.end;
  });

  if (lastIndex < text.length) {
    result += escapeHTML(text.substring(lastIndex));
  }

  return result;
}

/**
 * 获取元素值（内部使用，避免循环依赖）
 */
function getElementValue(element) {
  if (element.isContentEditable) {
    return element.textContent || '';
  }
  return element.value || '';
}
