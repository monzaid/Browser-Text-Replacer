/**
 * MessageProxy - 基于 CQRS 模式的跨 Shadow DOM 边界消息代理
 *
 * panel (Shadow Root 内) ↔ MessageProxy ↔ engine (页面 DOM)
 *
 * 命令流: panel → proxy.command(name, payload) → engine API
 * 事件流: engine → proxy.emit(name, data) → panel.on(name, handler)
 */

import { findMatches, replaceOne, replaceAll, goToPrevMatch, goToNextMatch, focusCurrentMatch, isCurrentMatchInViewport, startListening, stopListening, enterPreviewMode, togglePreviewMatch, executeDoubleReplace, applyPreviewedReplacements, exitPreviewMode, getPreviewState } from './core/text-replacer.js';
import { clearAllHighlights } from './core/text-highlighter.js';

class MessageProxy {
  constructor() {
    // 事件监听器 map: { eventName: [handler1, handler2, ...] }
    this._listeners = new Map();
  }

  /**
   * 执行命令（panel → engine）
   * @param {string} name - 命令名
   * @param {Object} payload - 命令参数
   * @returns {Promise<Object>} 命令执行结果
   */
  async command(name, payload = {}) {
    switch (name) {
      case 'search':
        return findMatches(payload.text, payload.options || {}, payload.shouldFocus || false);

      case 'replaceOne':
        return replaceOne(payload.text || '');

      case 'replaceAll':
        return replaceAll(
          payload.findText || '',
          payload.replaceText || '',
          payload.options || {}
        );

      case 'navigate':
        if (payload.direction === 'prev') {
          return goToPrevMatch();
        } else {
          return goToNextMatch();
        }

      case 'focusCurrentMatch':
        return focusCurrentMatch();

      case 'isCurrentMatchInViewport':
        return isCurrentMatchInViewport();

      case 'startListening':
        startListening();
        return { success: true };

      case 'stopListening':
        stopListening();
        return { success: true };

      case 'clearHighlights':
        clearAllHighlights();
        return { success: true };

      case 'enterPreview':
        return { count: enterPreviewMode(payload.text || '', payload.options || {}) };

      case 'togglePreviewMatch':
        return togglePreviewMatch(payload.index);

      case 'executeDoubleReplace':
        return executeDoubleReplace(payload.index, payload.replaceText || '');

      case 'applyPreviewedReplacements':
        return applyPreviewedReplacements(payload.replaceText || '');

      case 'exitPreview':
        exitPreviewMode();
        return { success: true };

      case 'getPreviewState':
        return getPreviewState();

      default:
        throw new Error(`Unknown command: ${name}`);
    }
  }

  /**
   * 监听事件（panel 订阅 engine 事件）
   * @param {string} eventName - 事件名
   * @param {Function} handler - 事件处理函数
   * @returns {Function} 取消订阅函数
   */
  on(eventName, handler) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }
    this._listeners.get(eventName).push(handler);

    // 返回取消订阅函数
    return () => {
      const handlers = this._listeners.get(eventName);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  /**
   * 触发事件（engine → panel）
   * @param {string} eventName - 事件名
   * @param {*} data - 事件数据
   */
  emit(eventName, data) {
    const handlers = this._listeners.get(eventName);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`[MessageProxy] Error in handler for "${eventName}":`, e);
        }
      });
    }
  }

  /**
   * 移除所有监听器（面板关闭时清理）
   */
  clear() {
    this._listeners.clear();
  }
}

// 导出单例
export const proxy = new MessageProxy();
