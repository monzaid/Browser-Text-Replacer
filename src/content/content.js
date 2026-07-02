/**
 * Content Script - 主入口文件
 * 负责初始化插件和处理来自 background 的消息
 */

// 注入样式
function injectStyles() {
  const styleId = 'text-replacer-styles';
  
  // 检查是否已注入
  if (document.getElementById(styleId)) {
    return;
  }

  const link = document.createElement('link');
  link.id = styleId;
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('src/styles/replacer-panel.css');
  
  document.head.appendChild(link);
}

// 初始化
function init() {
  // 注入样式
  injectStyles();
  
  console.log('文本替换助手已加载');
  console.log('按 Ctrl+Shift+H (Mac: Cmd+Shift+H) 打开替换面板');
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { MessageActions } = window.TextReplacerConstants;
  const { showPanel, hidePanel } = window.TextReplacerUI;

  switch (message.action) {
    case MessageActions.SHOW_REPLACER_PANEL:
      showPanel();
      sendResponse({ success: true });
      break;
      
    case MessageActions.HIDE_REPLACER_PANEL:
      hidePanel();
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  // 返回 true 表示异步响应
  return true;
});

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
