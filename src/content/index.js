// Content Script 入口 (V2 - esbuild 构建)
// Shadow DOM host 生命周期管理 + chrome.runtime 消息路由

import { MessageActions } from '../shared/constants.js';
import { findAllEditableElements, getElementValue, setElementValue, startObserving, stopObserving } from './core/element-finder.js';
import { highlightElement, clearHighlight, clearAllHighlights } from './core/text-highlighter.js';
import { findMatches, replaceOne, replaceAll, startListening, stopListening, goToPrevMatch, goToNextMatch } from './core/text-replacer.js';
import { proxy } from './message-proxy.js';
import { render, show, hide, getPanelElement } from './ui/panel.js';

// ---------------------------------------------------------------------------
// Shadow DOM host 管理
// ---------------------------------------------------------------------------

const HOST_ID = 'text-replacer-host';
let hostElement = null;

function getOrCreateHost() {
  if (hostElement) return hostElement;

  hostElement = document.getElementById(HOST_ID);
  if (!hostElement) {
    hostElement = document.createElement('div');
    hostElement.id = HOST_ID;
    // Host 的定位和 z-index（Shadow DOM 外唯一需要 z-index 的元素）
    hostElement.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;';
    document.body.appendChild(hostElement);
  }
  return hostElement;
}

function ensureShadowRoot() {
  const host = getOrCreateHost();
  if (!host.shadowRoot) {
    const shadowRoot = host.attachShadow({ mode: 'open' });
    render(shadowRoot);
  }
  return host;
}

// ---------------------------------------------------------------------------
// Bootstrap Modal 焦点陷阱对抗
// ---------------------------------------------------------------------------
// 问题：页面存在 <div tabindex="-1" class="modal ..."> 时，Bootstrap JS 的
// _enforceFocus 会劫持焦点——用户点击 Shadow DOM 面板输入框后，焦点被立即
// 抢回 modal。Shadow DOM 不隔离 JavaScript 事件，focusin 必穿透。
//
// 策略：面板打开时，移除所有可见 [tabindex="-1"] 元素的 tabindex 属性，
// 使 Bootstrap 的 .focus() 调用无效（<div> 默认不可聚焦）。面板关闭时恢复。

const disabledTabindexElements = [];

function disableFocusTraps() {
  const traps = document.querySelectorAll('[tabindex="-1"]');
  traps.forEach(el => {
    // 仅处理当前可见的元素（display: none 的元素不需要处理）
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    // 跳过替换插件自身的 host
    if (el === hostElement) return;

    disabledTabindexElements.push({ el, tabindex: el.getAttribute('tabindex') });
    el.removeAttribute('tabindex');
  });
}

function restoreFocusTraps() {
  disabledTabindexElements.forEach(({ el, tabindex }) => {
    if (tabindex !== null) {
      el.setAttribute('tabindex', tabindex);
    }
  });
  disabledTabindexElements.length = 0;
}

// ---------------------------------------------------------------------------
// chrome.runtime 消息路由
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case MessageActions.SHOW_REPLACER_PANEL: {
      const host = ensureShadowRoot();
      host.hidden = false;
      disableFocusTraps();
      show();
      sendResponse({ success: true });
      break;
    }
    case MessageActions.HIDE_REPLACER_PANEL:
      hide();
      restoreFocusTraps();
      if (hostElement) hostElement.hidden = true;
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  return true; // 异步响应
});

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

function init() {
  // 预创建 host（不显示）
  getOrCreateHost();
  hostElement.hidden = true;
  console.log('文本替换助手 V2 已加载');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
