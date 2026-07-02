/**
 * Service Worker - 后台服务
 * 负责监听全局快捷键命令，并向 content script 发送消息
 */

// 监听命令事件
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-replacer') {
    // 获取当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // 发送消息给 content script，显示/隐藏替换面板
        chrome.tabs.sendMessage(tabs[0].id, { action: 'SHOW_REPLACER_PANEL' }, (response) => {
          // 处理可能的错误（如 content script 未注入）
          if (chrome.runtime.lastError) {
            console.log('Content script not ready, injecting...');
            // 如果 content script 未准备好，可以动态注入
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['src/content/content.js']
            }, () => {
              // 注入后再次发送消息
              chrome.tabs.sendMessage(tabs[0].id, { action: 'SHOW_REPLACER_PANEL' });
            });
          }
        });
      }
    });
  }
});

// 插件安装时的处理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('文本替换助手已安装');
  } else if (details.reason === 'update') {
    console.log('文本替换助手已更新');
  }
});
