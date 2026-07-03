/**
 * 通用工具函数 (ESM)
 */

/**
 * HTML 转义
 * @param {string} str - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHTML(str) {
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * 获取元素唯一标识
 * @param {HTMLElement} element - 目标元素
 * @returns {string} 唯一 ID
 */
export function generateElementId(element) {
  if (element.id) return `id-${element.id}`;
  if (element.dataset.trId) return element.dataset.trId;

  const id = `tr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  element.dataset.trId = id;
  return id;
}

/**
 * 防抖函数
 * @param {Function} fn - 需要防抖的函数
 * @param {number} delay - 延迟毫秒数
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 触发元素上的事件
 * @param {HTMLElement} element - 元素
 * @param {string} eventName - 事件名称
 */
export function triggerEvent(element, eventName) {
  const event = new Event(eventName, { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
}

/**
 * 计算文本中指定位置的行号和列号
 * @param {string} text - 文本内容
 * @param {number} position - 字符位置
 * @returns {{ line: number, column: number }}
 */
export function getLineAndColumn(text, position) {
  const lines = text.substring(0, position).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length
  };
}
