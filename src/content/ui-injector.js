/**
 * UI 注入器 - 创建和管理 VSCode 风格的替换对话框 UI
 */

(function() {
  // 获取依赖
  const { UIConstants, Icons } = window.TextReplacerConstants;
  const {
    findMatches,
    goToPrevMatch,
    goToNextMatch,
    replaceOne,
    replaceAll,
    startListening,
    stopListening,
  } = window.TextReplacer;
  
  // 获取高亮模块
  const { clearAllHighlights } = window.TextHighlighter;

  // 面板引用和状态
  let panelElement = null;
  let searchTimeout = null;

  // 搜索选项状态
  let searchOptions = {
    matchCase: false,
    matchWord: false,
    useRegex: false,
  };

  /**
   * 显示替换面板
   */
  function showPanel() {
    if (!panelElement) {
      createPanel();
    }
    
    panelElement.classList.remove(UIConstants.HIDDEN_CLASS);
    
    // 启动页面变化监听
    startListening();
    
    // 聚焦到查找输入框
    const findInput = document.getElementById(UIConstants.FIND_INPUT_ID);
    if (findInput) {
      setTimeout(() => findInput.focus(), 100);
    }
  }

  /**
   * 隐藏替换面板
   */
  function hidePanel() {
    if (panelElement) {
      panelElement.classList.add(UIConstants.HIDDEN_CLASS);
      
      // 清除所有高亮
      clearAllHighlights();
      
      // 停止页面变化监听
      stopListening();
      
      // 清空输入框和状态
      const findInput = document.getElementById(UIConstants.FIND_INPUT_ID);
      const replaceInput = document.getElementById(UIConstants.REPLACE_INPUT_ID);
      const matchCount = document.getElementById(UIConstants.MATCH_COUNT_ID);
      
      if (findInput) findInput.value = '';
      if (replaceInput) replaceInput.value = '';
      if (matchCount) matchCount.textContent = '';
    }
  }

  /**
   * 切换面板显示状态
   */
  function togglePanel() {
    if (panelElement && !panelElement.classList.contains(UIConstants.HIDDEN_CLASS)) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  /**
   * 创建替换面板
   */
  function createPanel() {
    // 检查是否已存在
    if (document.getElementById(UIConstants.PANEL_ID)) {
      panelElement = document.getElementById(UIConstants.PANEL_ID);
      return;
    }

    // 创建面板容器
    panelElement = document.createElement('div');
    panelElement.id = UIConstants.PANEL_ID;
    panelElement.className = 'tr-panel';
    panelElement.classList.add(UIConstants.HIDDEN_CLASS);

    // 构建 HTML 结构 - VSCode 风格
    panelElement.innerHTML = `
      <!-- 查找行 -->
      <div class="tr-input-row">
        <div class="tr-input-wrapper">
          <input type="text" id="${UIConstants.FIND_INPUT_ID}" placeholder="查找" autocomplete="off" spellcheck="false">
        </div>
        <div class="tr-toolbar">
          <button class="tr-btn tr-tool-btn" id="${UIConstants.MATCH_CASE_ID}" title="区分大小写">${Icons.MATCH_CASE}</button>
          <button class="tr-btn tr-tool-btn" id="${UIConstants.MATCH_WORD_ID}" title="匹配整个单词">${Icons.MATCH_WORD}</button>
          <button class="tr-btn tr-tool-btn" id="${UIConstants.USE_REGEX_ID}" title="使用正则表达式">${Icons.USE_REGEX}</button>
        </div>
        <span class="tr-match-count" id="${UIConstants.MATCH_COUNT_ID}"></span>
        <div class="tr-toolbar">
          <button class="tr-btn tr-nav-btn" id="${UIConstants.PREV_BTN_ID}" title="上一个" disabled>${Icons.PREV}</button>
          <button class="tr-btn tr-nav-btn" id="${UIConstants.NEXT_BTN_ID}" title="下一个" disabled>${Icons.NEXT}</button>
        </div>
        <button class="tr-btn tr-toggle-btn" id="tr-toggle-replace-btn" title="切换替换">${Icons.TOGGLE_REPLACE}</button>
        <button class="tr-btn tr-close-btn ${UIConstants.CLOSE_BTN_CLASS}" title="关闭">${Icons.CLOSE}</button>
      </div>
      
      <!-- 替换行 -->
      <div class="tr-input-row tr-replace-row tr-replace-visible" id="${UIConstants.TOGGLE_REPLACE_ID}">
        <div class="tr-input-wrapper">
          <input type="text" id="${UIConstants.REPLACE_INPUT_ID}" placeholder="替换" autocomplete="off" spellcheck="false">
        </div>
        <div class="tr-toolbar">
          <button class="tr-btn tr-replace-btn" id="${UIConstants.REPLACE_ONE_BTN_ID}" title="替换当前匹配" disabled>${Icons.REPLACE_ONE}</button>
          <button class="tr-btn tr-replace-all-btn" id="${UIConstants.REPLACE_ALL_BTN_ID}" title="替换全部匹配" disabled>${Icons.REPLACE_ALL}</button>
        </div>
      </div>
      
      <!-- 状态提示 -->
      <div class="tr-status" id="tr-status"></div>
    `;

    // 添加到页面
    document.body.appendChild(panelElement);

    // 绑定事件
    bindEvents();
  }

  /**
   * 绑定面板事件
   */
  function bindEvents() {
    // 关闭按钮
    const closeBtn = panelElement.querySelector(`.${UIConstants.CLOSE_BTN_CLASS}`);
    closeBtn.addEventListener('click', hidePanel);

    // 切换替换按钮
    const toggleReplaceBtn = document.getElementById('tr-toggle-replace-btn');
    const replaceRow = document.getElementById(UIConstants.TOGGLE_REPLACE_ID);
    toggleReplaceBtn.addEventListener('click', () => {
      replaceRow.classList.toggle(UIConstants.REPLACE_VISIBLE_CLASS);
      // 更新按钮图标
      const isVisible = replaceRow.classList.contains(UIConstants.REPLACE_VISIBLE_CLASS);
      toggleReplaceBtn.innerHTML = isVisible ? '◄' : '►';
    });

    // 查找输入框 - 实时搜索
    const findInput = document.getElementById(UIConstants.FIND_INPUT_ID);
    findInput.addEventListener('input', handleFindInput);

    // 替换输入框
    const replaceInput = document.getElementById(UIConstants.REPLACE_INPUT_ID);
    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleReplaceAll();
      }
    });

    // 查找输入框回车键
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // 跳转到下一个匹配
        handleNextMatch();
      } else if (e.key === 'F3' || (e.shiftKey && e.key === 'F3')) {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevMatch();
        } else {
          handleNextMatch();
        }
      }
    });

    // 工具按钮
    document.getElementById(UIConstants.MATCH_CASE_ID).addEventListener('click', function() {
      searchOptions.matchCase = !searchOptions.matchCase;
      this.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions.matchCase);
      performSearch();
    });

    document.getElementById(UIConstants.MATCH_WORD_ID).addEventListener('click', function() {
      searchOptions.matchWord = !searchOptions.matchWord;
      this.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions.matchWord);
      performSearch();
    });

    document.getElementById(UIConstants.USE_REGEX_ID).addEventListener('click', function() {
      searchOptions.useRegex = !searchOptions.useRegex;
      this.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions.useRegex);
      performSearch();
    });

    // 导航按钮
    document.getElementById(UIConstants.PREV_BTN_ID).addEventListener('click', handlePrevMatch);
    document.getElementById(UIConstants.NEXT_BTN_ID).addEventListener('click', handleNextMatch);

    // 替换按钮
    document.getElementById(UIConstants.REPLACE_ONE_BTN_ID).addEventListener('click', handleReplaceOne);
    document.getElementById(UIConstants.REPLACE_ALL_BTN_ID).addEventListener('click', handleReplaceAll);

    // ESC 键关闭面板
    panelElement.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hidePanel();
      }
    });
  }

  /**
   * 处理查找输入
   */
  function handleFindInput() {
    // 防抖处理
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
      performSearch();
    }, 150);
  }

  /**
   * 执行搜索
   */
  function performSearch() {
    const findInput = document.getElementById(UIConstants.FIND_INPUT_ID);
    const findText = findInput.value;
    
    // 如果查找文本为空，清除所有高亮
    if (!findText || findText.trim() === '') {
      clearAllHighlights();
      updateMatchCount({ count: 0, current: 0, message: '' });
      updateButtonStates(false);
      return;
    }
    
    const result = findMatches(findText, searchOptions);
    updateMatchCount(result);
    
    // 更新按钮状态
    updateButtonStates(result.count > 0);
  }

  /**
   * 更新匹配计数显示
   */
  function updateMatchCount(result) {
    const matchCount = document.getElementById(UIConstants.MATCH_COUNT_ID);
    
    if (result.count === 0) {
      matchCount.textContent = result.message || '无结果';
    } else {
      matchCount.textContent = `${result.current} / ${result.count}`;
    }
  }

  /**
   * 更新按钮启用/禁用状态
   */
  function updateButtonStates(hasMatches) {
    document.getElementById(UIConstants.PREV_BTN_ID).disabled = !hasMatches;
    document.getElementById(UIConstants.NEXT_BTN_ID).disabled = !hasMatches;
    document.getElementById(UIConstants.REPLACE_ONE_BTN_ID).disabled = !hasMatches;
    document.getElementById(UIConstants.REPLACE_ALL_BTN_ID).disabled = !hasMatches;
  }

  /**
   * 处理上一个匹配
   */
  function handlePrevMatch() {
    const result = goToPrevMatch();
    if (result) {
      updateMatchCount(result);
    }
  }

  /**
   * 处理下一个匹配
   */
  function handleNextMatch() {
    const result = goToNextMatch();
    if (result) {
      updateMatchCount(result);
    }
  }

  /**
   * 处理替换当前匹配
   */
  function handleReplaceOne() {
    const replaceInput = document.getElementById(UIConstants.REPLACE_INPUT_ID);
    const replaceText = replaceInput.value;
    
    const result = replaceOne(replaceText);
    updateMatchCount(result);
    updateButtonStates(result.count > 0);
    
    // 如果还有匹配项，自动跳转到下一个
    if (result.count > 0) {
      handleNextMatch();
    }
    
    showStatus(result.message || `已替换，剩余 ${result.count} 个匹配`, result.status);
    
    // 保持焦点在替换输入框
    replaceInput.focus();
  }

  /**
   * 处理替换全部
   */
  function handleReplaceAll() {
    const findInput = document.getElementById(UIConstants.FIND_INPUT_ID);
    const replaceInput = document.getElementById(UIConstants.REPLACE_INPUT_ID);
    const findText = findInput.value;
    const replaceText = replaceInput.value;
    
    const result = replaceAll(findText, replaceText, searchOptions);
    updateMatchCount({ count: 0, current: 0, message: '' });
    updateButtonStates(false);
    
    showStatus(result.message, result.status);
    
    // 不再自动关闭面板，保持打开状态
  }

  /**
   * 显示状态提示
   */
  function showStatus(message, status) {
    const statusEl = document.getElementById('tr-status');
    statusEl.textContent = message;
    statusEl.className = 'tr-status tr-show';
    
    if (status === 'success') {
      statusEl.classList.add('tr-success');
    } else if (status === 'no_match' || status === 'empty_find') {
      statusEl.classList.add('tr-warning');
    } else {
      statusEl.classList.add('tr-error');
    }
    
    // 2秒后隐藏
    setTimeout(() => {
      statusEl.classList.remove('tr-show');
    }, 2000);
  }

  // 导出到全局
  window.TextReplacerUI = {
    showPanel,
    hidePanel,
    togglePanel,
  };
})();
