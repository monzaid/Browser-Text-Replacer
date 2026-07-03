/**
 * replace-bar.js — exitPreview / applyPreviewBtn 搜索后 emit matches:updated 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 创建 mock proxy
const { createMockProxy, getMockProxy } = vi.hoisted(() => {
  let instance = null;

  function createMockProxy() {
    const proxy = {
      _listeners: new Map(),
      _commandCalls: [],
      _emitCalls: [],
      _commandResults: {},
      command: async (name, payload = {}) => {
        proxy._commandCalls.push({ name, payload });
        const key = `${name}`;
        if (proxy._commandResults[key]) {
          return proxy._commandResults[key];
        }
        return { success: true };
      },
      emit: (eventName, data) => {
        proxy._emitCalls.push({ eventName, data });
        const handlers = proxy._listeners.get(eventName);
        if (handlers) {
          handlers.forEach((h) => h(data));
        }
      },
      on: (eventName, handler) => {
        if (!proxy._listeners.has(eventName)) {
          proxy._listeners.set(eventName, []);
        }
        proxy._listeners.get(eventName).push(handler);
        return () => {
          const arr = proxy._listeners.get(eventName);
          if (arr) {
            const idx = arr.indexOf(handler);
            if (idx >= 0) arr.splice(idx, 1);
          }
        };
      },
      reset() {
        this._listeners.clear();
        this._commandCalls = [];
        this._emitCalls = [];
        this._commandResults = {};
      },
    };
    instance = proxy;
    return proxy;
  }

  function getMockProxy() {
    return instance;
  }

  return { createMockProxy, getMockProxy };
});

// Mock 模块
vi.mock('../src/content/message-proxy.js', () => ({
  proxy: createMockProxy(),
}));

vi.mock('../src/shared/constants.js', () => ({
  UIConstants: {
    FIND_INPUT_ID: 'tr-find-input',
    REPLACE_INPUT_ID: 'tr-replace-input',
    REPLACE_ONE_BTN_ID: 'tr-replace-one-btn',
    REPLACE_ALL_BTN_ID: 'tr-replace-all-btn',
    MATCH_CASE_ID: 'tr-match-case',
    MATCH_WORD_ID: 'tr-match-word',
    USE_REGEX_ID: 'tr-use-regex',
    MATCH_COUNT_ID: 'tr-match-count',
    ACTIVE_CLASS: 'tr-active',
  },
  Icons: {
    REPLACE_ONE: '↶',
    REPLACE_ALL: '↺',
  },
}));

// 模拟 DOM
function createMockPanel(findText = 'test') {
  const panel = document.createElement('div');
  panel.className = 'tr-panel';

  const findInput = document.createElement('input');
  findInput.id = 'tr-find-input';
  findInput.value = findText;
  panel.appendChild(findInput);

  const matchCount = document.createElement('span');
  matchCount.id = 'tr-match-count';
  matchCount.textContent = '';
  panel.appendChild(matchCount);

  return panel;
}

// 导入 renderReplaceBar
const { renderReplaceBar } = await import('../src/content/ui/replace-bar.js');
const mockProxy = getMockProxy();

/**
 * 辅助函数：点击按钮并等待所有 async 操作完成
 * element.click() 不会 await 事件 handler 中的 async 操作，
 * 所以需要手动等待 microtask 队列清空
 */
async function clickAndWait(element) {
  element.click();
  // 等待所有 microtask 完成（async handler 中的 await）
  await new Promise(resolve => setTimeout(resolve, 50));
}

describe('Bug 4: exitPreview 后 emit matches:updated', () => {
  let container, panel, replaceRow, previewBtn, applyPreviewBtn;

  beforeEach(() => {
    mockProxy.reset();

    mockProxy._commandResults['search'] = {
      count: 3,
      current: 1,
      message: '3 个结果',
    };
    mockProxy._commandResults['exitPreview'] = { success: true };
    mockProxy._commandResults['enterPreview'] = { count: 3 };
    mockProxy._commandResults['applyPreviewedReplacements'] = { replaced: 2 };

    document.body.innerHTML = '';
    container = document.createElement('div');
    panel = createMockPanel('hello');
    panel.appendChild(container);
    document.body.appendChild(panel);

    const searchOptions = { matchCase: false, matchWord: false, useRegex: false };
    renderReplaceBar(container, searchOptions, () => panel);

    replaceRow = container.querySelector('#tr-replace-row');
    previewBtn = replaceRow.querySelector('#tr-preview-btn');
    applyPreviewBtn = replaceRow.querySelector('#tr-apply-preview-btn');
  });

  it('exitPreview 后应 emit matches:updated 事件', async () => {
    // 先进入预览模式
    previewBtn.style.display = 'inline-flex';
    await clickAndWait(previewBtn); // 第一次点击 = 进入预览

    // 清除调用记录
    mockProxy._commandCalls = [];
    mockProxy._emitCalls = [];

    // 退出预览（第二次点击 = 退出预览）
    await clickAndWait(previewBtn);

    // 应该调用了 exitPreview 和 search
    const exitCall = mockProxy._commandCalls.find((c) => c.name === 'exitPreview');
    const searchCall = mockProxy._commandCalls.find((c) => c.name === 'search');
    expect(exitCall).toBeTruthy();
    expect(searchCall).toBeTruthy();

    // 应该 emit 了 matches:updated
    const matchEmit = mockProxy._emitCalls.find(
      (c) => c.eventName === 'matches:updated'
    );
    expect(matchEmit).toBeTruthy();
    expect(matchEmit.data).toEqual(expect.objectContaining({
      count: 3,
      current: 1,
    }));
  });

  it('exitPreview 后应更新匹配计数显示', async () => {
    // 先进入预览
    await clickAndWait(previewBtn);

    // 退出预览
    await clickAndWait(previewBtn);

    const matchCountEl = panel.querySelector('#tr-match-count');
    expect(matchCountEl.textContent).toBe('1 / 3');
  });

  it('applyPreviewBtn 点击后应 emit matches:updated 事件', async () => {
    // 先进入预览
    await clickAndWait(previewBtn);

    // 手动启用 apply 按钮（进入预览后初始 disabled）
    applyPreviewBtn.disabled = false;

    // 清除调用记录
    mockProxy._commandCalls = [];
    mockProxy._emitCalls = [];

    // 点击应用按钮
    await clickAndWait(applyPreviewBtn);

    // 应该调用了 applyPreviewedReplacements 和 search
    const applyCall = mockProxy._commandCalls.find((c) => c.name === 'applyPreviewedReplacements');
    const searchCall = mockProxy._commandCalls.find((c) => c.name === 'search');
    expect(applyCall).toBeTruthy();
    expect(searchCall).toBeTruthy();

    // 应该 emit 了 matches:updated
    const matchEmit = mockProxy._emitCalls.find(
      (c) => c.eventName === 'matches:updated'
    );
    expect(matchEmit).toBeTruthy();
    expect(matchEmit.data).toEqual(expect.objectContaining({
      count: 3,
      current: 1,
    }));
  });

  it('applyPreviewBtn 点击后应更新匹配计数显示', async () => {
    // 先进入预览
    await clickAndWait(previewBtn);

    // 手动启用 apply 按钮
    applyPreviewBtn.disabled = false;

    // 点击应用按钮
    await clickAndWait(applyPreviewBtn);

    const matchCountEl = panel.querySelector('#tr-match-count');
    expect(matchCountEl.textContent).toBe('1 / 3');
  });

  it('exitPreview 后 count 为 0 时应显示无结果', async () => {
    // 设置 search 返回 0 结果
    mockProxy._commandResults['search'] = {
      count: 0,
      current: 0,
      message: '无结果',
    };

    // 先进入预览
    await clickAndWait(previewBtn);

    // 退出预览
    await clickAndWait(previewBtn);

    const matchCountEl = panel.querySelector('#tr-match-count');
    expect(matchCountEl.textContent).toBe('无结果');
  });
});
