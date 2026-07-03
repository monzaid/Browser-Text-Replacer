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
// chrome.runtime 消息路由
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case MessageActions.SHOW_REPLACER_PANEL: {
      const host = ensureShadowRoot();
      host.hidden = false;
      show();
      sendResponse({ success: true });
      break;
    }
    case MessageActions.HIDE_REPLACER_PANEL:
      hide();
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
