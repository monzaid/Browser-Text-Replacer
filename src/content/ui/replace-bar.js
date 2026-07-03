/**
 * 替换栏 - 替换输入框 + 替换/预览按钮
 */
import { UIConstants, Icons } from '../../shared/constants.js';
import { proxy } from '../message-proxy.js';

/** 预览模式标记 */
let isPreviewMode = false;

/** overlay 事件处理器引用（用于解绑） */
let overlayClickHandler = null;

/**
 * 渲染替换栏到指定容器
 * @param {HTMLElement} container
 * @param {Object} searchOptions - 共享搜索选项 { matchCase, matchWord, useRegex }
 * @param {Function} getPanelElement - 获取面板 DOM 引用
 */
export function renderReplaceBar(container, searchOptions, getPanelElement) {
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
      <button class="tr-btn tr-tool-btn" id="tr-preview-btn" title="预览替换" style="display: none;">👁</button>
      <button class="tr-btn tr-tool-btn" id="tr-apply-preview-btn" title="应用预览替换" style="display: none;" disabled>✓</button>
    </div>
  `;

  container.appendChild(replaceRow);

  // 绑定替换按钮
  const replaceOneBtn = replaceRow.querySelector(`#${UIConstants.REPLACE_ONE_BTN_ID}`);
  const replaceAllBtn = replaceRow.querySelector(`#${UIConstants.REPLACE_ALL_BTN_ID}`);
  const replaceInput = replaceRow.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
  const previewBtn = replaceRow.querySelector('#tr-preview-btn');
  const applyPreviewBtn = replaceRow.querySelector('#tr-apply-preview-btn');

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


