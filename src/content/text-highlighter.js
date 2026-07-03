/**
 * 文本高亮器 - 独立的高亮功能模块
 * 使用覆盖层方式实现 input/textarea 的高亮，支持 contenteditable
 * 支持主文档和同源 iframe 中的元素
 * 不会触发焦点转移
 */

(function() {
  // 高亮覆盖层管理 - 存储结构：Map<elementId, {overlay, frame}>
  const highlightOverlays = new Map();
  
  // 存储所有包含高亮的 iframe 文档引用，用于清理
  const activeFrames = new Set();
  activeFrames.add(document); // 主文档
  
  // 存储已注入 CSS 的 frame，避免重复注入
  const cssInjectedFrames = new Set();
  cssInjectedFrames.add(document); // 主文档的 CSS 在 content.js 中注入
  
  /**
   * 为指定元素创建/更新高亮
   * @param {HTMLElement} element - 要高亮的元素
   * @param {string} searchText - 搜索文本
   * @param {number} matchIndex - 当前匹配索引（可选，用于高亮当前项）
   * @param {Object} options - 搜索选项
   */
  function highlightElement(element, searchText, matchIndex = -1, options = {}) {
    if (!searchText || !element) {
      clearHighlight(element);
      return;
    }

    // 确保元素所属的文档注入了高亮样式
    const frame = element.ownerDocument;
    ensureStylesInjected(frame);

    if (element.isContentEditable) {
      highlightContentEditable(element, searchText, matchIndex, options);
    } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      highlightInputOverlay(element, searchText, matchIndex, options);
    }
  }

  /**
   * 为 input/textarea 创建覆盖层高亮
   */
  function highlightInputOverlay(element, searchText, matchIndex, options) {
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
    overlay.dataset.targetElement = getElementId(element);

    // 复制元素样式
    const styles = copyElementStyles(element);
    Object.assign(overlay.style, styles);

    // 设置覆盖层特有样式
    overlay.style.cssText += `
      position: absolute;
      pointer-events: none;
      z-index: 2147483646;
      white-space: ${element.tagName === 'INPUT' ? 'nowrap' : 'pre-wrap'};
      overflow: hidden;
      background: transparent;
      color: transparent;
    `.replace(/\s+/g, ' ');

    // 构建高亮 HTML
    overlay.innerHTML = buildHighlightHTML(value, matches, matchIndex);

    // 插入覆盖层
    insertOverlay(overlay, element, frame);
    
    // 保存引用和 frame 信息
    highlightOverlays.set(getElementId(element), { overlay, frame });
    
    // 记录这个 frame
    if (frame !== document) {
      activeFrames.add(frame);
    }
  }

  /**
   * 为 contenteditable 元素高亮
   */
  function highlightContentEditable(element, searchText, matchIndex, options) {
    // 获取元素所属的文档
    const frame = element.ownerDocument;
    const isIframe = frame !== document;
    
    if (window.TextReplacerDebug) {
      console.log('[TextHighlighter] highlightContentEditable:', {
        element: element.tagName,
        searchText,
        matchIndex,
        isIframe,
        frameLocation: frame.location?.href || 'unknown',
        frameElement: frame.defaultView?.frameElement?.src || 'none'
      });
    }
    
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
              node.parentElement.classList.contains('tr-highlight-current')) {
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
      highlightTextNode(textNode, searchText, matchIndex, options);
    });
  }

  /**
   * 高亮单个文本节点
   */
  function highlightTextNode(textNode, searchText, matchIndex, options) {
    const text = textNode.nodeValue;
    const matches = findAllMatches(text, searchText, options);
    
    if (matches.length === 0) return;

    // 在正确的文档中创建 DocumentFragment
    const frame = textNode.ownerDocument;
    const isIframe = frame !== document;
    
    if (window.TextReplacerDebug) {
      console.log('[TextHighlighter] highlightTextNode:', {
        text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        matchesFound: matches.length,
        isIframe,
        textNode: textNode,
        parentElement: textNode.parentElement
      });
    }
    
    const fragment = frame.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      // 添加匹配前的文本
      if (match.start > lastIndex) {
        fragment.appendChild(frame.createTextNode(text.substring(lastIndex, match.start)));
      }

      // 创建高亮元素（在正确的文档中）
      const span = frame.createElement('span');
      span.className = 'tr-highlight-match';
      if (idx === matchIndex) {
        span.classList.add('tr-highlight-current');
      }
      span.textContent = match.text;
      
      if (window.TextReplacerDebug && isIframe) {
        console.log('[TextHighlighter] 创建高亮 span:', {
          className: span.className,
          textContent: span.textContent,
          ownerDocument: span.ownerDocument === frame,
          ownerDocumentIsMain: span.ownerDocument === document
        });
      }
      
      fragment.appendChild(span);

      lastIndex = match.end;
    });

    // 添加剩余文本
    if (lastIndex < text.length) {
      fragment.appendChild(frame.createTextNode(text.substring(lastIndex)));
    }

    // 替换原文本节点
    if (window.TextReplacerDebug && isIframe) {
      console.log('[TextHighlighter] 替换文本节点:', {
        parentNode: textNode.parentNode,
        fragmentChildCount: fragment.childNodes.length,
        parentElement: textNode.parentElement,
        parentDocument: textNode.parentElement?.ownerDocument === frame
      });
    }
    
    textNode.parentNode.replaceChild(fragment, textNode);
    
    if (window.TextReplacerDebug && isIframe) {
      // 验证高亮元素是否存在于 iframe 文档中
      const highlights = frame.querySelectorAll('.tr-highlight-match, .tr-highlight-current');
      console.log('[TextHighlighter] 替换后验证:', {
        highlightsFound: highlights.length,
        frameDocument: frame,
        inIframe: isIframe
      });
    }
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
   */
  function buildHighlightHTML(text, matches, currentIndex) {
    if (matches.length === 0) return escapeHTML(text);

    let result = '';
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      // 添加匹配前的文本（转义 HTML）
      if (match.start > lastIndex) {
        result += escapeHTML(text.substring(lastIndex, match.start));
      }

      // 添加高亮的文本
      const className = idx === currentIndex ? 'tr-highlight-current' : 'tr-highlight-match';
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
    
    // overlay 覆盖整个 wrapper，wrapper 大小由内部元素决定
    // 使用 100% 而非 getBoundingClientRect 避免 iframe 内坐标偏移
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
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
      
      // 调试日志：记录原始元素样式
      console.log('[TextHighlighter] Creating wrapper for element:', {
        tagName: element.tagName,
        originalDisplay,
        computedWidth: computed.width,
        boxSizing: computed.boxSizing,
        elementWidth: element.style.width,
      });
      
      // 设置包装器样式 - 使用原始元素的 display 值以保持布局一致性
      // 如果原始元素是 block，wrapper 也应该是 block
      // 如果是 inline-block，则使用 inline-block
      wrapper.style.position = 'relative';
      wrapper.style.display = originalDisplay === 'inline' ? 'inline-block' : originalDisplay;
      
      // 确保宽度正确继承
      if (computed.width && computed.width !== 'auto') {
        wrapper.style.width = computed.width;
      }
      
      // 确保 wrapper 不会添加额外的边距
      wrapper.style.margin = '0';
      wrapper.style.padding = '0';
      wrapper.style.border = 'none';
      wrapper.style.boxSizing = computed.boxSizing || 'content-box';
      
      // 调试日志：记录 wrapper 样式
      console.log('[TextHighlighter] Wrapper styles applied:', {
        display: wrapper.style.display,
        width: wrapper.style.width,
        boxSizing: wrapper.style.boxSizing,
      });
      
      element.parentNode.insertBefore(wrapper, element);
      wrapper.appendChild(element);
    }
    
    return wrapper;
  }

  /**
   * 更新覆盖层位置（响应窗口滚动等）
   *
   * 注意：overlay 在 wrapper 内部，wrapper 紧贴目标元素（在同一文档内）。
   * 使用 100% 而非 getBoundingClientRect()，因为：
   * - 主文档中：getBoundingClientRect() 可用，但 100% 更简洁
   * - iframe 内：getBoundingClientRect() 返回相对于顶级视口的坐标，
   *   而 overlay 定位基准是 wrapper（iframe 文档内），两者不一致导致偏移
   * wrapper 的大小由内部目标元素撑开，所以 100% 始终正确。
   */
  function updateOverlayPosition(overlay, targetElement) {
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
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
   */
  function clearHighlight(element) {
    const id = getElementId(element);
    const frame = element.ownerDocument;
    
    if (element.isContentEditable) {
      // 移除所有高亮 span
      const highlights = element.querySelectorAll('.tr-highlight-match, .tr-highlight-current');
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
  function clearAllHighlights() {
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
        const highlights = frame.querySelectorAll('.tr-highlight-match, .tr-highlight-current');
        highlights.forEach(span => {
          const parent = span.parentNode;
          parent.replaceChild(frame.createTextNode(span.textContent), span);
          parent.normalize();
        });
      } catch (e) {
        // frame 可能已卸载，安全忽略
        if (window.TextReplacerDebug) {
          console.log('[TextHighlighter] Frame 已卸载，跳过高亮清理');
        }
      }
    });
    
    // 清空活动 frame 集合
    activeFrames.clear();
    activeFrames.add(document); // 重新添加主文档
  }

  /**
   * 获取元素唯一标识
   */
  function getElementId(element) {
    if (element.id) return `id-${element.id}`;
    if (element.dataset.trId) return element.dataset.trId;
    
    const id = `tr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    element.dataset.trId = id;
    return id;
  }

  /**
   * HTML 转义
   */
  function escapeHTML(str) {
    // 使用简单的字符串替换来避免跨文档问题
    const htmlEntities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (char) => htmlEntities[char]);
  }

  /**
   * 确保 iframe 文档注入了高亮样式
   * @param {Document} frame - 要检查的文档
   */
  function ensureStylesInjected(frame) {
    const isIframe = frame !== document;
    
    if (cssInjectedFrames.has(frame)) {
      if (window.TextReplacerDebug && isIframe) {
        console.log('[TextHighlighter] CSS 样式已存在于 frame，跳过注入');
      }
      return; // 已注入，跳过
    }

    // 检查是否是同源 iframe（跨源 iframe 无法访问）
    try {
      if (window.TextReplacerDebug && isIframe) {
        console.log('[TextHighlighter] 开始注入 CSS 到 iframe frame:', {
          frameLocation: frame.location?.href || 'unknown',
          frameElement: frame.defaultView?.frameElement?.src || 'none'
        });
      }
      
      // 尝试访问 frame 的 head
      const head = frame.head || frame.getElementsByTagName('head')[0];
      if (!head) {
        if (window.TextReplacerDebug) {
          console.log('[TextHighlighter] 无法访问 frame 的 head 元素');
        }
        return;
      }

      // 检查是否已经有我们的样式
      if (frame.getElementById('text-replacer-styles')) {
        cssInjectedFrames.add(frame);
        if (window.TextReplacerDebug && isIframe) {
          console.log('[TextHighlighter] 发现已有样式标签，跳过注入');
        }
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

        /* 包装器样式 */
        .tr-highlight-wrapper {
          position: relative;
          display: inline-block;
        }
      `;

      head.appendChild(style);
      cssInjectedFrames.add(frame);

      if (window.TextReplacerDebug) {
        console.log('[TextHighlighter] CSS 样式已注入到 frame:', frame.location?.href || frame.defaultView?.frameElement?.src || 'unknown');
      }
    } catch (e) {
      // 跨源 iframe 或其他错误
      if (window.TextReplacerDebug) {
        console.log('[TextHighlighter] 无法注入样式到 frame:', e.message);
      }
    }
  }

  // 导出到全局
  window.TextHighlighter = {
    highlightElement,
    clearHighlight,
    clearAllHighlights,
  };
  
  // 全局调试标志
  if (!window.TextReplacerDebug) {
    window.TextReplacerDebug = false;
  }
})();
