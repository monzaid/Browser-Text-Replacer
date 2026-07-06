/**
 * 查找栏 - 查找输入框 + 工具按钮 + 导航 + 匹配计数
 */
import { UIConstants, Icons } from '../../shared/constants.js';
import { proxy } from '../message-proxy.js';
import { saveHistory } from '../../storage/store.js';

let searchTimeout = null;
const DEBOUNCE_MS = 150;

/**
 * 渲染查找栏到指定容器
 * @param {HTMLElement} container
 * @param {Object} searchOptions - 共享搜索选项 { matchCase, matchWord, useRegex }
 * @param {Function} hidePanel - 隐藏面板回调
 * @param {Function} toggleReplace - 切换替换行回调
 */
export function renderSearchBar(container, searchOptions, hidePanel, toggleReplace) {
  const searchRow = document.createElement('div');
  searchRow.className = 'tr-input-row';
  searchRow.id = 'tr-search-row';

  searchRow.innerHTML = `
    <div class="tr-input-wrapper">
      <textarea id="${UIConstants.FIND_INPUT_ID}" placeholder="查找" rows="1" autocomplete="off" spellcheck="false"></textarea>
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
  `;

  container.appendChild(searchRow);

  // 获取元素引用
  const findInput = searchRow.querySelector(`#${UIConstants.FIND_INPUT_ID}`);

  // textarea 内联样式适配
  if (findInput) {
    findInput.style.cssText =
      'width:100%;padding:4px 8px;font-size:13px;' +
      'color:var(--tr-input-text,#cccccc);background:var(--tr-input-bg,#3c3c3c);' +
      'border:1px solid var(--tr-input-bg,#3c3c3c);border-radius:2px;' +
      'outline:none;box-sizing:border-box;resize:vertical;' +
      'font-family:inherit;line-height:1.4;min-height:22px;';
  }
  const matchCaseBtn = searchRow.querySelector(`#${UIConstants.MATCH_CASE_ID}`);
  const matchWordBtn = searchRow.querySelector(`#${UIConstants.MATCH_WORD_ID}`);
  const useRegexBtn = searchRow.querySelector(`#${UIConstants.USE_REGEX_ID}`);
  const matchCountEl = searchRow.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
  const prevBtn = searchRow.querySelector(`#${UIConstants.PREV_BTN_ID}`);
  const nextBtn = searchRow.querySelector(`#${UIConstants.NEXT_BTN_ID}`);
  const toggleReplaceBtn = searchRow.querySelector('#tr-toggle-replace-btn');
  const closeBtn = searchRow.querySelector(`.${UIConstants.CLOSE_BTN_CLASS}`);

  // --- 输入防抖搜索 ---
  findInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(findInput, searchOptions, matchCountEl, prevBtn, nextBtn);
    }, DEBOUNCE_MS);
  });

  // --- Keydown 处理 ---
  findInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        await proxy.command('navigate', { direction: 'prev' });
      } else {
        await proxy.command('navigate', { direction: 'next' });
      }
      // 恢复焦点到查找输入框（延迟确保 goToNextMatch 的 element.focus() 已完成）
      setTimeout(() => findInput.focus(), 50);
    }
  });

  // --- 失焦时保存历史 ---
  findInput.addEventListener('blur', async () => {
    const text = findInput.value;
    if (text.trim()) {
      await saveHistory(text, '', { ...searchOptions }).catch(() => {});
      proxy.emit('history:updated');
    }
  });

  // --- 工具按钮 toggle ---
  matchCaseBtn.addEventListener('click', () => {
    searchOptions.matchCase = !searchOptions.matchCase;
    matchCaseBtn.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions.matchCase);
    performSearch(findInput, searchOptions, matchCountEl, prevBtn, nextBtn);
  });

  matchWordBtn.addEventListener('click', () => {
    searchOptions.matchWord = !searchOptions.matchWord;
    matchWordBtn.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions.matchWord);
    performSearch(findInput, searchOptions, matchCountEl, prevBtn, nextBtn);
  });

  useRegexBtn.addEventListener('click', () => {
    searchOptions.useRegex = !searchOptions.useRegex;
    useRegexBtn.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions.useRegex);
    performSearch(findInput, searchOptions, matchCountEl, prevBtn, nextBtn);
  });

  // --- 导航按钮 ---
  prevBtn.addEventListener('click', async () => {
    const result = await proxy.command('navigate', { direction: 'prev' });
    if (result) updateMatchCount(matchCountEl, result);
  });

  nextBtn.addEventListener('click', async () => {
    const result = await proxy.command('navigate', { direction: 'next' });
    if (result) updateMatchCount(matchCountEl, result);
  });

  // --- 切换替换 ---
  toggleReplaceBtn.addEventListener('click', () => {
    toggleReplace();
    const panel = searchRow.closest('.tr-panel');
    const replaceRow = panel ? panel.querySelector('#tr-replace-row') : null;
    if (replaceRow) {
      const isVisible = replaceRow.classList.contains(UIConstants.REPLACE_VISIBLE_CLASS);
      toggleReplaceBtn.innerHTML = isVisible ? '◄' : Icons.TOGGLE_REPLACE;
    }
  });

  // --- 关闭 ---
  closeBtn.addEventListener('click', hidePanel);

  // --- 监听匹配更新事件 ---
  proxy.on('matches:updated', (data) => {
    if (data) {
      updateMatchCount(matchCountEl, data);
      const hasMatches = data.count > 0;
      prevBtn.disabled = !hasMatches;
      nextBtn.disabled = !hasMatches;
    }
  });
}

/**
 * 执行搜索
 */
async function performSearch(findInput, searchOptions, matchCountEl, prevBtn, nextBtn) {
  const text = findInput.value;

  if (!text || text.trim() === '') {
    matchCountEl.textContent = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    await proxy.command('clearHighlights');
    // 通知替换栏更新按钮状态
    proxy.emit('matches:updated', { count: 0, current: 0 });
    return;
  }

  const result = await proxy.command('search', {
    text,
    options: { ...searchOptions },
    shouldFocus: false,
  });

  if (result) {
    updateMatchCount(matchCountEl, result);
    const hasMatches = result.count > 0;
    prevBtn.disabled = !hasMatches;
    nextBtn.disabled = !hasMatches;

    // 通知替换栏更新
    proxy.emit('matches:updated', result);
  }
}

/**
 * 更新匹配计数显示
 */
function updateMatchCount(el, result) {
  if (!result || result.count === 0) {
    el.textContent = result && result.message ? result.message : '无结果';
  } else {
    el.textContent = `${result.current} / ${result.count}`;
  }
}
