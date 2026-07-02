/**
 * 元素查找器 - 查找页面上所有可编辑的文本元素
 * 支持 MutationObserver 动态检测和 iframe 支持
 */

(function() {
  // 获取常量
  const { EditableSelectors } = window.TextReplacerConstants;

  /**
   * 查找页面上所有可编辑的文本元素
   * 包括主文档和同源 iframe 中的元素
   * @returns {Array<{element: HTMLElement, frame: Document}>} 可编辑元素数组，包含元素和所属文档
   */
  function findAllEditableElements() {
    const results = [];
    
    // 查找主文档中的元素
    const mainElements = findEditableElementsInDocument(document);
    mainElements.forEach(el => {
      results.push({ element: el, frame: document });
    });
    
    // 查找同源 iframe 中的元素
    const iframeElements = findElementsInIframes();
    iframeElements.forEach(item => {
      results.push(item);
    });
    
    // 过滤掉隐藏、禁用的元素，以及插件面板内的元素
    return results.filter(item => isEditableAndVisible(item.element)).filter(item => isNotInPanel(item.element));
  }

  /**
   * 在指定文档中查找可编辑元素
   * @param {Document} doc - 要查找的文档
   * @returns {Array<HTMLElement>} 可编辑元素数组
   */
  function findEditableElementsInDocument(doc) {
    const selector = EditableSelectors.join(', ');
    return Array.from(doc.querySelectorAll(selector));
  }

  /**
   * 递归查找同源 iframe 中的可编辑元素
   * @returns {Array<{element: HTMLElement, frame: Document}>} iframe 中的元素数组
   */
  function findElementsInIframes() {
    const results = [];
    const iframes = document.querySelectorAll('iframe');
    
    iframes.forEach(iframe => {
      try {
        // 检查是否可以访问 iframe 内容（同源检测）
        if (iframe.contentDocument) {
          const iframeDoc = iframe.contentDocument;
          const elements = findEditableElementsInDocument(iframeDoc);
          
          elements.forEach(el => {
            results.push({ element: el, frame: iframeDoc });
          });
          
          // 递归查找嵌套 iframe
          // 注意：由于浏览器安全限制，嵌套 iframe 的递归可能有限制
        }
      } catch (e) {
        // 跨域 iframe 无法访问，安全忽略
        if (window.TextReplacerDebug) {
          console.log('无法访问 iframe (可能是跨域):', iframe.src);
        }
      }
    });
    
    return results;
  }

  /**
   * 检查元素是否不在插件面板内
   * @param {HTMLElement} element - 要检查的元素
   * @returns {boolean} 是否不在插件面板内
   */
  function isNotInPanel(element) {
    // 排除插件面板内的所有元素
    const panel = document.getElementById('text-replacer-panel');
    if (panel && panel.contains(element)) {
      return false;
    }
    return true;
  }

  /**
   * 检查元素是否可编辑且可见
   * @param {HTMLElement} element - 要检查的元素
   * @returns {boolean} 是否可编辑且可见
   */
  function isEditableAndVisible(element) {
    // 检查是否被禁用
    if (element.disabled) {
      return false;
    }
    
    // 检查是否是只读的
    if (element.readOnly) {
      return false;
    }
    
    // 检查元素是否可见
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    // 检查父元素是否可见
    let parent = element.parentElement;
    while (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none') {
        return false;
      }
      parent = parent.parentElement;
    }
    
    return true;
  }

  /**
   * 获取元素的当前值
   * @param {HTMLElement} element - 元素
   * @returns {string} 元素的当前值
   */
  function getElementValue(element) {
    if (element.isContentEditable) {
      return element.innerText || '';
    }
    return element.value || '';
  }

  /**
   * 设置元素的值
   * @param {HTMLElement} element - 元素
   * @param {string} value - 新值
   */
  function setElementValue(element, value) {
    if (element.isContentEditable) {
      element.innerText = value;
    } else {
      element.value = value;
    }
    
    // 触发 input 和 change 事件，确保页面框架能感知到变化
    triggerEvent(element, 'input');
    triggerEvent(element, 'change');
  }

  /**
   * 触发元素上的事件
   * @param {HTMLElement} element - 元素
   * @param {string} eventName - 事件名称
   */
  function triggerEvent(element, eventName) {
    const event = new Event(eventName, { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  }

  // ==================== MutationObserver 动态元素检测 ====================
  
  // MutationObserver 实例
  let observer = null;
  // 防抖定时器
  let debounceTimer = null;
  // 回调函数
  let onChangeCallback = null;
  // 是否正在监听
  let isObserving = false;

  /**
   * 启动 DOM 变化监听
   * @param {Function} callback - 当检测到新的可编辑元素时的回调函数
   */
  function startObserving(callback) {
    if (isObserving) {
      return; // 已经在监听
    }
    
    onChangeCallback = callback;
    
    // 创建 MutationObserver
    observer = new MutationObserver((mutations) => {
      let hasNewEditableElements = false;
      
      // 检查是否有新增的可编辑元素
      mutations.forEach((mutation) => {
        // 检查新增的节点
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查新增节点本身是否是可编辑元素
            if (isEditableElement(node)) {
              hasNewEditableElements = true;
            }
            
            // 检查新增节点的子元素中是否有可编辑元素
            const editableChildren = node.querySelectorAll ?
              node.querySelectorAll(EditableSelectors.join(', ')) : [];
            if (editableChildren.length > 0) {
              hasNewEditableElements = true;
            }
          }
        });
        
        // 检查是否有属性变化（如 contenteditable 属性的添加）
        if (mutation.type === 'attributes' &&
            (mutation.attributeName === 'contenteditable' ||
             mutation.attributeName === 'type')) {
          if (isEditableElement(mutation.target)) {
            hasNewEditableElements = true;
          }
        }
      });
      
      // 只有检测到新的可编辑元素时才触发回调
      if (hasNewEditableElements) {
        // 防抖处理，避免频繁触发
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(() => {
          if (onChangeCallback && typeof onChangeCallback === 'function') {
            onChangeCallback();
          }
        }, 300);
      }
    });
    
    // 开始监听整个文档的变化
    observer.observe(document.body, {
      childList: true,    // 监听子节点的添加/删除
      subtree: true,      // 监听所有后代节点
      attributes: true,   // 监听属性变化
      attributeFilter: ['contenteditable', 'type']  // 只监听特定属性
    });
    
    isObserving = true;
    
    if (window.TextReplacerDebug) {
      console.log('[ElementFinder] MutationObserver 已启动');
    }
  }

  /**
   * 停止 DOM 变化监听
   */
  function stopObserving() {
    if (!isObserving) {
      return; // 未在监听
    }
    
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    
    onChangeCallback = null;
    isObserving = false;
    
    if (window.TextReplacerDebug) {
      console.log('[ElementFinder] MutationObserver 已停止');
    }
  }

  /**
   * 检查元素是否是可编辑元素
   * @param {HTMLElement} element - 要检查的元素
   * @returns {boolean} 是否是可编辑元素
   */
  function isEditableElement(element) {
    const selector = EditableSelectors.join(', ');
    return element.matches && element.matches(selector);
  }

  // ==================== 导出 ====================
  
  // 导出到全局
  window.TextReplacerElementFinder = {
    findAllEditableElements,
    getElementValue,
    setElementValue,
    startObserving,
    stopObserving,
    isObserving: () => isObserving,
  };
  
  // 全局调试标志（可通过控制台设置 window.TextReplacerDebug = true 启用）
  if (!window.TextReplacerDebug) {
    window.TextReplacerDebug = false;
  }
})();
