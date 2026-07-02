/**
 * 文本替换器 - 执行全局文本替换的核心逻辑
 * 支持 VSCode 风格的查找替换功能
 * 支持 iframe 和动态元素检测
 */

(function() {
  // 获取依赖
  const { findAllEditableElements, getElementValue, setElementValue, startObserving, stopObserving } = window.TextReplacerElementFinder;
  const { ReplaceStatus } = window.TextReplacerConstants;
  const { highlightElement, clearHighlight, clearAllHighlights } = window.TextHighlighter;

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
  function findMatches(findText, options = {}, shouldFocus = false) {
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
  function startListening() {
    if (inputListener) return; // 已经在监听

    // 使用事件委托监听所有 input 和 change 事件
    inputListener = function(e) {
      // 忽略插件面板内的事件
      const panel = document.getElementById('text-replacer-panel');
      if (panel && panel.contains(e.target)) {
        return;
      }

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
            // 通知 UI 更新
            updateUIFromSearch();
          }, 300);
        }
      }
    };

    document.addEventListener('input', inputListener, true);
    document.addEventListener('change', inputListener, true);
    
    // 启动 DOM 变化监听
    if (!isDOMListening) {
      startObserving(() => {
        // DOM 变化回调：重新执行搜索
        if (currentSearchText && currentSearchText.trim() !== '') {
          findMatches(currentSearchText, searchOptions, false);
          updateUIFromSearch();
        }
      });
      isDOMListening = true;
    }
  }

  /**
   * 停止监听页面输入变化和 DOM 变化
   */
  function stopListening() {
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
    const matchCountEl = document.getElementById(window.TextReplacerConstants.UIConstants.MATCH_COUNT_ID);
    const prevBtn = document.getElementById(window.TextReplacerConstants.UIConstants.PREV_BTN_ID);
    const nextBtn = document.getElementById(window.TextReplacerConstants.UIConstants.NEXT_BTN_ID);
    const replaceOneBtn = document.getElementById(window.TextReplacerConstants.UIConstants.REPLACE_ONE_BTN_ID);
    const replaceAllBtn = document.getElementById(window.TextReplacerConstants.UIConstants.REPLACE_ALL_BTN_ID);

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
  function goToPrevMatch() {
    if (currentMatches.length === 0) return null;

    // 更新高亮
    updateHighlights();
    
    currentMatchIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : currentMatches.length - 1;
    
    // 更新高亮显示
    updateHighlights();
    
    // 聚焦到当前匹配
    highlightCurrentMatch(true);

    return {
      count: currentMatches.length,
      current: currentMatchIndex + 1,
    };
  }

  /**
   * 导航到下一个匹配
   */
  function goToNextMatch() {
    if (currentMatches.length === 0) return null;

    // 更新高亮
    updateHighlights();
    
    currentMatchIndex = currentMatchIndex < currentMatches.length - 1 ? currentMatchIndex + 1 : 0;
    
    // 更新高亮显示
    updateHighlights();
    
    // 聚焦到当前匹配
    highlightCurrentMatch(true);

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
        // 对于 contenteditable，使用 Range 选择
        const range = document.createRange();
        const selection = window.getSelection();
        const textNode = findTextNode(element, match.start);
        
        if (textNode) {
          range.setStart(textNode, match.start);
          range.setEnd(textNode, match.end);
          selection.removeAllRanges();
          selection.addRange(range);
          
          // 使用 scrollIntoView 滚动到可视区域
          try {
            // 对 Range 使用 scrollIntoView
            const rect = range.getBoundingClientRect();
            // 如果选区不在视口中，滚动到视口中心
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
              element.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          } catch (e) {
            // 如果获取边界失败，尝试直接滚动元素
            try {
              element.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } catch (e2) {
              console.warn('contenteditable 滚动失败:', e2);
            }
          }
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
      }
    }
  }

  /**
   * 计算文本中指定位置的行号和列号
   * @param {string} text - 文本内容
   * @param {number} position - 字符位置
   * @returns {Object} { line: 行号, column: 列号 }
   */
  function getLineAndColumn(text, position) {
    const lines = text.substring(0, position).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length
    };
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
        
        console.log('滚动调试信息:', {
          lineHeight,
          paddingTop,
          lineNumber,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          currentScrollTop: element.scrollTop,
          targetScrollTop: Math.max(0, targetScrollTop)
        });
        
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
  function replaceOne(replaceText) {
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
    const findInput = document.getElementById(window.TextReplacerConstants.UIConstants.FIND_INPUT_ID);
    const newFindText = findInput ? findInput.value : '';
    
    if (newFindText) {
      findMatches(newFindText, searchOptions, false);
    }

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
  function replaceAll(findText, replaceText, options = {}) {
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

  // 导出到全局
  window.TextReplacer = {
    findMatches,
    goToPrevMatch,
    goToNextMatch,
    replaceOne,
    replaceAll,
    startListening,
    stopListening,
  };
})();
