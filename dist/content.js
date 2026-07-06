// src/shared/constants.js
var MessageActions = {
  SHOW_REPLACER_PANEL: "SHOW_REPLACER_PANEL",
  HIDE_REPLACER_PANEL: "HIDE_REPLACER_PANEL",
  EXECUTE_REPLACE: "EXECUTE_REPLACE"
};
var UIConstants = {
  PANEL_ID: "text-replacer-panel",
  FIND_INPUT_ID: "tr-find-input",
  REPLACE_INPUT_ID: "tr-replace-input",
  TOGGLE_REPLACE_ID: "tr-toggle-replace",
  CLOSE_BTN_CLASS: "tr-close",
  MATCH_CASE_ID: "tr-match-case",
  MATCH_WORD_ID: "tr-match-word",
  USE_REGEX_ID: "tr-use-regex",
  MATCH_COUNT_ID: "tr-match-count",
  PREV_BTN_ID: "tr-prev-btn",
  NEXT_BTN_ID: "tr-next-btn",
  REPLACE_ONE_BTN_ID: "tr-replace-one-btn",
  REPLACE_ALL_BTN_ID: "tr-replace-all-btn",
  HIDDEN_CLASS: "tr-hidden",
  ACTIVE_CLASS: "tr-active",
  REPLACE_VISIBLE_CLASS: "tr-replace-visible"
};
var EditableSelectors = [
  'input[type="text"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="password"]',
  'input[type="number"]',
  "input:not([type])",
  // 默认 type 为 text
  "textarea",
  '[contenteditable="true"]',
  '[contenteditable=""]'
  // 空值等同于 true
];
var ReplaceStatus = {
  SUCCESS: "success",
  NO_MATCH: "no_match",
  EMPTY_FIND: "empty_find",
  ERROR: "error"
};
var Icons = {
  CLOSE: "\xD7",
  MATCH_CASE: "Aa",
  MATCH_WORD: "Ab",
  USE_REGEX: ".*",
  PREV: "\u2191",
  NEXT: "\u2193",
  TOGGLE_REPLACE: "\u25BA",
  REPLACE_ONE: "\u21B6",
  REPLACE_ALL: "\u21BA"
};

// src/shared/utils.js
function escapeHTML(str) {
  const htmlEntities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}
function generateElementId(element) {
  if (element.id) return `id-${element.id}`;
  if (element.dataset.trId) return element.dataset.trId;
  const id = `tr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  element.dataset.trId = id;
  return id;
}
function triggerEvent(element, eventName) {
  const event = new Event(eventName, { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
}

// src/content/core/element-finder.js
var debug = false;
function findAllEditableElements() {
  const results = [];
  const mainElements = findEditableElementsInDocument(document);
  mainElements.forEach((el) => {
    results.push({ element: el, frame: document });
  });
  const iframeElements = findElementsInIframes();
  iframeElements.forEach((item) => {
    results.push(item);
  });
  return results.filter((item) => isEditableAndVisible(item.element)).filter((item) => isNotInPanel(item.element));
}
function findEditableElementsInDocument(doc) {
  const selector = EditableSelectors.join(", ");
  return Array.from(doc.querySelectorAll(selector));
}
function findElementsInIframes() {
  const results = [];
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((iframe) => {
    try {
      if (iframe.contentDocument) {
        const iframeDoc = iframe.contentDocument;
        const elements = findEditableElementsInDocument(iframeDoc);
        elements.forEach((el) => {
          results.push({ element: el, frame: iframeDoc });
        });
      }
    } catch (e) {
      if (debug) {
        console.log("\u65E0\u6CD5\u8BBF\u95EE iframe (\u53EF\u80FD\u662F\u8DE8\u57DF):", iframe.src);
      }
    }
  });
  return results;
}
function isNotInPanel(element) {
  const panel = document.getElementById("text-replacer-panel");
  if (panel && panel.contains(element)) {
    return false;
  }
  return true;
}
function isEditableAndVisible(element) {
  if (element.disabled) {
    return false;
  }
  if (element.readOnly) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  let parent = element.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.display === "none") {
      return false;
    }
    parent = parent.parentElement;
  }
  return true;
}
function getElementValue(element) {
  if (element.isContentEditable) {
    return element.innerText || "";
  }
  return element.value || "";
}
function setElementValue(element, value) {
  if (element.isContentEditable) {
    element.innerText = value;
  } else {
    element.value = value;
  }
  triggerEvent(element, "input");
  triggerEvent(element, "change");
}
var observer = null;
var debounceTimer = null;
var onChangeCallback = null;
var observing = false;
function startObserving(callback) {
  if (observing) {
    return;
  }
  onChangeCallback = callback;
  observer = new MutationObserver((mutations) => {
    let hasNewEditableElements = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isEditableElement(node)) {
            hasNewEditableElements = true;
          }
          const editableChildren = node.querySelectorAll ? node.querySelectorAll(EditableSelectors.join(", ")) : [];
          if (editableChildren.length > 0) {
            hasNewEditableElements = true;
          }
        }
      });
      if (mutation.type === "attributes" && (mutation.attributeName === "contenteditable" || mutation.attributeName === "type")) {
        if (isEditableElement(mutation.target)) {
          hasNewEditableElements = true;
        }
      }
    });
    if (hasNewEditableElements) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        if (onChangeCallback && typeof onChangeCallback === "function") {
          onChangeCallback();
        }
      }, 300);
    }
  });
  observer.observe(document.body, {
    childList: true,
    // 监听子节点的添加/删除
    subtree: true,
    // 监听所有后代节点
    attributes: true,
    // 监听属性变化
    attributeFilter: ["contenteditable", "type"]
    // 只监听特定属性
  });
  observing = true;
  if (debug) {
    console.log("[ElementFinder] MutationObserver \u5DF2\u542F\u52A8");
  }
}
function stopObserving() {
  if (!observing) {
    return;
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
  observing = false;
  if (debug) {
    console.log("[ElementFinder] MutationObserver \u5DF2\u505C\u6B62");
  }
}
function isEditableElement(element) {
  const selector = EditableSelectors.join(", ");
  return element.matches && element.matches(selector);
}

// src/content/core/text-highlighter.js
var highlightOverlays = /* @__PURE__ */ new Map();
var activeFrames = /* @__PURE__ */ new Set();
activeFrames.add(document);
var cssInjectedFrames = /* @__PURE__ */ new Set();
function highlightElement(element, searchText, matchIndex = -1, options = {}, mode = "default") {
  if (!searchText || !element) {
    clearHighlight(element);
    return;
  }
  const frame = element.ownerDocument;
  ensureStylesInjected(frame);
  if (element.isContentEditable) {
    highlightContentEditable(element, searchText, matchIndex, options, mode);
  } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    highlightInputOverlay(element, searchText, matchIndex, options, mode);
  }
}
function highlightInputOverlay(element, searchText, matchIndex, options, mode = "default") {
  clearHighlight(element);
  const value = element.value;
  if (!value) return;
  const matches = findAllMatches(value, searchText, options);
  if (matches.length === 0) return;
  const frame = element.ownerDocument;
  const overlay = frame.createElement("div");
  overlay.className = "tr-highlight-overlay";
  overlay.dataset.targetElement = generateElementId(element);
  const styles = copyElementStyles(element);
  Object.assign(overlay.style, styles);
  const pointerEvents = mode === "preview-selected" || mode === "preview-skipped" ? "auto" : "none";
  overlay.style.cssText += `
    position: absolute;
    pointer-events: ${pointerEvents};
    z-index: 2147483646;
    white-space: ${element.tagName === "INPUT" ? "nowrap" : "pre-wrap"};
    overflow: hidden;
    background: transparent;
    color: transparent;
    border-style: solid;
    border-color: transparent;
  `.replace(/\s+/g, " ");
  overlay.innerHTML = buildHighlightHTML(value, matches, matchIndex, mode);
  insertOverlay(overlay, element, frame);
  highlightOverlays.set(generateElementId(element), { overlay, frame });
  if (frame !== document) {
    activeFrames.add(frame);
  }
}
function highlightContentEditable(element, searchText, matchIndex, options, mode = "default") {
  const frame = element.ownerDocument;
  clearHighlight(element);
  const walker = frame.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node2) => {
        if (node2.parentElement.classList.contains("tr-highlight-match") || node2.parentElement.classList.contains("tr-highlight-current") || node2.parentElement.classList.contains("tr-preview-selected")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  if (frame !== document) {
    activeFrames.add(frame);
  }
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeValue && node.nodeValue.trim()) {
      textNodes.push(node);
    }
  }
  textNodes.forEach((textNode) => {
    highlightTextNode(textNode, searchText, matchIndex, options, mode);
  });
}
function highlightTextNode(textNode, searchText, matchIndex, options, mode = "default") {
  const text = textNode.nodeValue;
  const matches = findAllMatches(text, searchText, options);
  if (matches.length === 0) return;
  const frame = textNode.ownerDocument;
  const fragment = frame.createDocumentFragment();
  let lastIndex = 0;
  matches.forEach((match, idx) => {
    if (match.start > lastIndex) {
      fragment.appendChild(frame.createTextNode(text.substring(lastIndex, match.start)));
    }
    const span = frame.createElement("span");
    if (mode === "preview-selected") {
      span.className = "tr-preview-selected";
    } else if (mode === "preview-skipped") {
      span.className = "tr-highlight-match";
    } else {
      span.className = "tr-highlight-match";
      if (idx === matchIndex) {
        span.classList.add("tr-highlight-current");
      }
    }
    span.textContent = match.text;
    fragment.appendChild(span);
    lastIndex = match.end;
  });
  if (lastIndex < text.length) {
    fragment.appendChild(frame.createTextNode(text.substring(lastIndex)));
  }
  textNode.parentNode.replaceChild(fragment, textNode);
}
function findAllMatches(text, pattern, options) {
  const matches = [];
  const { matchCase, matchWord, useRegex } = options;
  let flags = "g";
  if (!matchCase) flags += "i";
  let regex;
  try {
    if (useRegex) {
      regex = new RegExp(pattern, flags);
    } else {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (matchWord) {
        regex = new RegExp(`\\b${escaped}\\b`, flags);
      } else {
        regex = new RegExp(escaped, flags);
      }
    }
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  } catch (e) {
  }
  return matches;
}
function buildHighlightHTML(text, matches, currentIndex, mode = "default") {
  if (matches.length === 0) return escapeHTML(text);
  let result = "";
  let lastIndex = 0;
  matches.forEach((match, idx) => {
    if (match.start > lastIndex) {
      result += escapeHTML(text.substring(lastIndex, match.start));
    }
    let className;
    if (mode === "preview-selected") {
      className = "tr-preview-selected";
    } else if (mode === "preview-skipped") {
      className = "tr-highlight-match";
    } else {
      className = idx === currentIndex ? "tr-highlight-current" : "tr-highlight-match";
    }
    result += `<span class="${className}">${escapeHTML(match.text)}</span>`;
    lastIndex = match.end;
  });
  if (lastIndex < text.length) {
    result += escapeHTML(text.substring(lastIndex));
  }
  return result;
}
function insertOverlay(overlay, targetElement, frame) {
  const wrapper = ensureWrapper(targetElement, frame);
  wrapper.appendChild(overlay);
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "0";
}
function ensureWrapper(element, frame) {
  let wrapper = element.parentElement;
  if (!wrapper || !wrapper.classList.contains("tr-highlight-wrapper")) {
    wrapper = frame.createElement("div");
    wrapper.className = "tr-highlight-wrapper";
    const computed = window.getComputedStyle(element);
    const originalDisplay = computed.display;
    wrapper.style.position = "relative";
    wrapper.style.display = originalDisplay === "inline" ? "inline-block" : originalDisplay;
    if (element.offsetWidth > 0) {
      wrapper.style.width = element.offsetWidth + "px";
    }
    wrapper.style.marginTop = computed.marginTop;
    wrapper.style.marginBottom = computed.marginBottom;
    wrapper.style.marginLeft = computed.marginLeft;
    wrapper.style.marginRight = computed.marginRight;
    wrapper.style.padding = "0";
    wrapper.style.border = "none";
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(element);
    element.style.margin = "0";
  }
  return wrapper;
}
function copyElementStyles(element) {
  const computed = window.getComputedStyle(element);
  const styles = {};
  const styleProps = [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "line-height",
    "text-transform",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "border-top-width",
    "border-bottom-width",
    "border-left-width",
    "border-right-width",
    "text-align",
    "direction",
    "writing-mode"
  ];
  styleProps.forEach((prop) => {
    styles[prop] = computed.getPropertyValue(prop);
  });
  return styles;
}
function clearHighlight(element) {
  const id = generateElementId(element);
  const frame = element.ownerDocument;
  if (element.isContentEditable) {
    const highlights = element.querySelectorAll(".tr-highlight-match, .tr-highlight-current, .tr-preview-selected");
    highlights.forEach((span) => {
      const parent = span.parentNode;
      parent.replaceChild(frame.createTextNode(span.textContent), span);
      parent.normalize();
    });
  } else {
    const overlayData = highlightOverlays.get(id);
    if (overlayData && overlayData.overlay && overlayData.overlay.parentNode) {
      overlayData.overlay.parentNode.removeChild(overlayData.overlay);
    }
    highlightOverlays.delete(id);
  }
}
function clearAllHighlights() {
  highlightOverlays.forEach((data) => {
    if (data.overlay && data.overlay.parentNode) {
      data.overlay.parentNode.removeChild(data.overlay);
    }
  });
  highlightOverlays.clear();
  activeFrames.forEach((frame) => {
    try {
      const highlights = frame.querySelectorAll(".tr-highlight-match, .tr-highlight-current, .tr-preview-selected");
      highlights.forEach((span) => {
        const parent = span.parentNode;
        parent.replaceChild(frame.createTextNode(span.textContent), span);
        parent.normalize();
      });
    } catch (e) {
    }
  });
  activeFrames.clear();
  activeFrames.add(document);
}
function ensureStylesInjected(frame) {
  if (cssInjectedFrames.has(frame)) {
    return;
  }
  try {
    const head = frame.head || frame.getElementsByTagName("head")[0];
    if (!head) {
      return;
    }
    if (frame.getElementById("text-replacer-styles")) {
      cssInjectedFrames.add(frame);
      return;
    }
    const style = frame.createElement("style");
    style.id = "text-replacer-styles";
    style.textContent = `
      /* \u9AD8\u4EAE\u6837\u5F0F - \u7528\u4E8E contenteditable */
      .tr-highlight-match {
        background: rgba(255, 215, 0, 0.3);
        border-radius: 2px;
      }

      .tr-highlight-current {
        background: rgba(255, 100, 0, 0.5);
        border-radius: 2px;
      }

      /* \u9884\u89C8\u9009\u4E2D\u6837\u5F0F\uFF08\u7EFF\u8272\uFF09 */
      .tr-preview-selected {
        background: rgba(0, 255, 0, 0.4) !important;
        border-radius: 2px;
      }

      /* \u8986\u76D6\u5C42\u6837\u5F0F - \u7528\u4E8E input/textarea */
      .tr-highlight-overlay {
        position: absolute;
        pointer-events: none;
        z-index: 2147483646;
        white-space: pre;
        overflow: hidden;
        background: transparent;
        color: transparent;
      }

      .tr-highlight-overlay .tr-highlight-match {
        background: rgba(255, 215, 0, 0.4);
      }

      .tr-highlight-overlay .tr-highlight-current {
        background: rgba(255, 100, 0, 0.6);
      }

      .tr-highlight-overlay .tr-preview-selected {
        background: rgba(0, 255, 0, 0.4) !important;
        border-radius: 2px;
      }

      /* \u5305\u88C5\u5668\u6837\u5F0F */
      .tr-highlight-wrapper {
        position: relative;
        display: inline-block;
      }
    `;
    head.appendChild(style);
    cssInjectedFrames.add(frame);
  } catch (e) {
  }
}
function highlightPreviewElement(element, searchText, options, previewMatchData) {
  if (!searchText || !element || !previewMatchData || previewMatchData.length === 0) {
    clearHighlight(element);
    return;
  }
  const frame = element.ownerDocument;
  ensureStylesInjected(frame);
  if (element.isContentEditable) {
    highlightPreviewContentEditable(element, searchText, options, previewMatchData);
  } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    highlightPreviewInputOverlay(element, searchText, options, previewMatchData);
  }
}
function highlightPreviewInputOverlay(element, searchText, options, previewMatchData) {
  clearHighlight(element);
  const value = element.value || getElementValue2(element);
  if (!value) return;
  const frame = element.ownerDocument;
  const overlay = frame.createElement("div");
  overlay.className = "tr-highlight-overlay";
  overlay.dataset.targetElement = generateElementId(element);
  const styles = copyElementStyles(element);
  Object.assign(overlay.style, styles);
  overlay.style.cssText += `
    position: absolute;
    pointer-events: auto;
    z-index: 2147483646;
    white-space: ${element.tagName === "INPUT" ? "nowrap" : "pre-wrap"};
    overflow: hidden;
    background: transparent;
    color: transparent;
    border-style: solid;
    border-color: transparent;
  `.replace(/\s+/g, " ");
  overlay.innerHTML = buildPreviewHighlightHTML(value, previewMatchData);
  insertOverlay(overlay, element, frame);
  highlightOverlays.set(generateElementId(element), { overlay, frame });
  if (frame !== document) {
    activeFrames.add(frame);
  }
}
function highlightPreviewContentEditable(element, searchText, options, previewMatchData) {
  const frame = element.ownerDocument;
  clearHighlight(element);
  const walker = frame.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node2) => {
        if (node2.parentElement.classList.contains("tr-highlight-match") || node2.parentElement.classList.contains("tr-highlight-current") || node2.parentElement.classList.contains("tr-preview-selected")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  if (frame !== document) {
    activeFrames.add(frame);
  }
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeValue && node.nodeValue.trim()) {
      textNodes.push(node);
    }
  }
  let previewIdx = 0;
  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    const localMatches = findAllMatches(text, searchText, options);
    if (localMatches.length === 0) return;
    const fragment = frame.createDocumentFragment();
    let lastIndex = 0;
    localMatches.forEach((localMatch) => {
      if (localMatch.start > lastIndex) {
        fragment.appendChild(frame.createTextNode(text.substring(lastIndex, localMatch.start)));
      }
      const previewEntry = previewIdx < previewMatchData.length ? previewMatchData[previewIdx++] : null;
      const span = frame.createElement("span");
      if (previewEntry && previewEntry.selected) {
        span.className = "tr-preview-selected";
      } else {
        span.className = "tr-highlight-match";
      }
      if (previewEntry && previewEntry._idx !== void 0) {
        span.dataset.previewIndex = previewEntry._idx;
      }
      span.textContent = localMatch.text;
      fragment.appendChild(span);
      lastIndex = localMatch.end;
    });
    if (lastIndex < text.length) {
      fragment.appendChild(frame.createTextNode(text.substring(lastIndex)));
    }
    textNode.parentNode.replaceChild(fragment, textNode);
  });
}
function buildPreviewHighlightHTML(text, matches) {
  if (matches.length === 0) return escapeHTML(text);
  let result = "";
  let lastIndex = 0;
  matches.forEach((match) => {
    if (match.start > lastIndex) {
      result += escapeHTML(text.substring(lastIndex, match.start));
    }
    const className = match.selected ? "tr-preview-selected" : "tr-highlight-match";
    const previewIndex = match._idx !== void 0 ? match._idx : "";
    result += `<span class="${className}" data-preview-index="${previewIndex}">${escapeHTML(match.text)}</span>`;
    lastIndex = match.end;
  });
  if (lastIndex < text.length) {
    result += escapeHTML(text.substring(lastIndex));
  }
  return result;
}
function getElementValue2(element) {
  if (element.isContentEditable) {
    return element.textContent || "";
  }
  return element.value || "";
}

// src/storage/store.js
var META_KEY = "text-replacer-meta";
var HISTORY_KEY = "text-replacer-history";
var PRESETS_KEY = "text-replacer-presets";
var THEME_KEY = "text-replacer-theme";
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
async function saveHistory(findText, replaceText, options = {}) {
  const { [META_KEY]: meta, [HISTORY_KEY]: history } = await chrome.storage.local.get([META_KEY, HISTORY_KEY]);
  const currentMeta = meta || { recentHistoryIds: [] };
  const currentHistory = history || {};
  if (currentMeta.recentHistoryIds.length > 0) {
    const lastId = currentMeta.recentHistoryIds[0];
    const lastEntry = currentHistory[lastId];
    if (lastEntry && lastEntry.findText === findText && lastEntry.replaceText === replaceText) {
      return lastId;
    }
  }
  const id = generateId();
  const entry = { id, findText, replaceText, options, timestamp: Date.now() };
  currentHistory[id] = entry;
  currentMeta.recentHistoryIds.unshift(id);
  while (currentMeta.recentHistoryIds.length > 20) {
    const removedId = currentMeta.recentHistoryIds.pop();
    delete currentHistory[removedId];
  }
  await chrome.storage.local.set({
    [META_KEY]: currentMeta,
    [HISTORY_KEY]: currentHistory
  });
}
async function getHistory() {
  const { [META_KEY]: meta, [HISTORY_KEY]: history } = await chrome.storage.local.get([META_KEY, HISTORY_KEY]);
  return ((meta == null ? void 0 : meta.recentHistoryIds) || []).map((id) => history == null ? void 0 : history[id]).filter(Boolean);
}
async function deleteHistoryItem(id) {
  const { [META_KEY]: meta, [HISTORY_KEY]: history } = await chrome.storage.local.get([META_KEY, HISTORY_KEY]);
  if (meta) meta.recentHistoryIds = (meta.recentHistoryIds || []).filter((i) => i !== id);
  if (history) delete history[id];
  await chrome.storage.local.set({ [META_KEY]: meta, [HISTORY_KEY]: history });
}
var saveQueue = Promise.resolve();
async function savePreset(name, findText, replaceText, options = {}) {
  const prevQueue = saveQueue;
  let resolveCurrent;
  saveQueue = new Promise((r) => {
    resolveCurrent = r;
  });
  await prevQueue;
  try {
    const { [META_KEY]: meta, [PRESETS_KEY]: presets } = await chrome.storage.local.get([META_KEY, PRESETS_KEY]);
    const currentMeta = meta || { presetIds: [], favoriteIds: [] };
    const currentPresets = presets || {};
    if (!Array.isArray(currentMeta.presetIds)) {
      currentMeta.presetIds = [];
    }
    if (currentMeta.presetIds.length >= 100) {
      throw new Error("\u9884\u8BBE\u5DF2\u6EE1\uFF08\u4E0A\u9650100\u6761\uFF09");
    }
    const id = generateId();
    currentPresets[id] = { id, name, findText, replaceText, options, createdAt: Date.now() };
    currentMeta.presetIds.push(id);
    await chrome.storage.local.set({
      [META_KEY]: currentMeta,
      [PRESETS_KEY]: currentPresets
    });
    return id;
  } finally {
    resolveCurrent();
  }
}
async function getPresets() {
  const { [META_KEY]: meta, [PRESETS_KEY]: presets } = await chrome.storage.local.get([META_KEY, PRESETS_KEY]);
  return ((meta == null ? void 0 : meta.presetIds) || []).map((id) => presets == null ? void 0 : presets[id]).filter(Boolean);
}
async function updatePreset(id, name, findText, replaceText, options = {}) {
  const prevQueue = saveQueue;
  let resolveCurrent;
  saveQueue = new Promise((r) => {
    resolveCurrent = r;
  });
  await prevQueue;
  try {
    const { [PRESETS_KEY]: presets } = await chrome.storage.local.get(PRESETS_KEY);
    const currentPresets = presets || {};
    if (!currentPresets[id]) {
      throw new Error("\u9884\u8BBE\u4E0D\u5B58\u5728");
    }
    currentPresets[id] = {
      ...currentPresets[id],
      name,
      findText,
      replaceText,
      options
    };
    await chrome.storage.local.set({ [PRESETS_KEY]: currentPresets });
  } finally {
    resolveCurrent();
  }
}
async function deletePreset(id) {
  const prevQueue = saveQueue;
  let resolveCurrent;
  saveQueue = new Promise((r) => {
    resolveCurrent = r;
  });
  await prevQueue;
  try {
    const { [META_KEY]: meta, [PRESETS_KEY]: presets } = await chrome.storage.local.get([META_KEY, PRESETS_KEY]);
    const currentMeta = meta || { presetIds: [], favoriteIds: [] };
    const currentPresets = presets || {};
    if (!Array.isArray(currentMeta.presetIds)) {
      currentMeta.presetIds = [];
    }
    currentMeta.presetIds = currentMeta.presetIds.filter((pid) => pid !== id);
    delete currentPresets[id];
    await chrome.storage.local.set({
      [META_KEY]: currentMeta,
      [PRESETS_KEY]: currentPresets
    });
  } finally {
    resolveCurrent();
  }
}
async function exportPresets() {
  const presets = await getPresets();
  return JSON.stringify(presets, null, 2);
}
async function importPresets(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("\u65E0\u6548\u7684 JSON \u683C\u5F0F");
  }
  if (!Array.isArray(data)) throw new Error("\u6570\u636E\u683C\u5F0F\u9519\u8BEF\uFF0C\u5E94\u4E3A\u6570\u7EC4");
  for (const p of data) {
    if (p.name && p.findText !== void 0 && p.replaceText !== void 0) {
      try {
        await savePreset(p.name, p.findText, p.replaceText, p.options || {});
      } catch {
      }
    }
  }
  return true;
}
async function saveTheme(config) {
  await chrome.storage.local.set({ [THEME_KEY]: config });
}
async function getTheme() {
  const { [THEME_KEY]: theme } = await chrome.storage.local.get(THEME_KEY);
  return theme || { mode: "dark" };
}

// src/content/message-proxy.js
var MessageProxy = class {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
  }
  /**
   * 执行命令（panel → engine）
   * @param {string} name - 命令名
   * @param {Object} payload - 命令参数
   * @returns {Promise<Object>} 命令执行结果
   */
  async command(name, payload = {}) {
    switch (name) {
      case "search":
        return findMatches(payload.text, payload.options || {}, payload.shouldFocus || false);
      case "replaceOne":
        return replaceOne(payload.text || "");
      case "replaceAll":
        return replaceAll(
          payload.findText || "",
          payload.replaceText || "",
          payload.options || {}
        );
      case "navigate":
        if (payload.direction === "prev") {
          return goToPrevMatch();
        } else {
          return goToNextMatch();
        }
      case "focusCurrentMatch":
        return focusCurrentMatch();
      case "isCurrentMatchInViewport":
        return isCurrentMatchInViewport();
      case "startListening":
        startListening();
        return { success: true };
      case "stopListening":
        stopListening();
        return { success: true };
      case "clearHighlights":
        clearAllHighlights();
        return { success: true };
      case "enterPreview":
        return { count: enterPreviewMode(payload.text || "", payload.options || {}) };
      case "togglePreviewMatch":
        return togglePreviewMatch(payload.index);
      case "executeDoubleReplace":
        return executeDoubleReplace(payload.index, payload.replaceText || "");
      case "applyPreviewedReplacements":
        return applyPreviewedReplacements(payload.replaceText || "");
      case "exitPreview":
        exitPreviewMode();
        return { success: true };
      case "getPreviewState":
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
      handlers.forEach((handler) => {
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
};
var proxy = new MessageProxy();

// src/content/core/text-replacer.js
function getPanelUIElement(id) {
  const host = document.getElementById("text-replacer-host");
  if (!host || !host.shadowRoot) return null;
  return host.shadowRoot.querySelector(`#${id}`);
}
function isPanelElement(target) {
  const host = document.getElementById("text-replacer-host");
  if (!host || !host.shadowRoot) return false;
  const panel = host.shadowRoot.querySelector(`#${UIConstants.PANEL_ID}`);
  if (!panel) return false;
  return panel.contains(target);
}
var currentMatches = [];
var currentMatchIndex = -1;
var searchOptions = {
  matchCase: false,
  matchWord: false,
  useRegex: false
};
var currentSearchText = "";
var inputListener = null;
var isDOMListening = false;
function findMatches(findText, options = {}, shouldFocus = false) {
  searchOptions = { ...searchOptions, ...options };
  if (!findText || findText.trim() === "") {
    currentMatches = [];
    currentMatchIndex = -1;
    return {
      status: ReplaceStatus.EMPTY_FIND,
      message: "",
      count: 0,
      current: 0
    };
  }
  const elementsWithFrame = findAllEditableElements();
  if (elementsWithFrame.length === 0) {
    currentMatches = [];
    currentMatchIndex = -1;
    return {
      status: ReplaceStatus.NO_MATCH,
      message: "\u65E0\u53EF\u7F16\u8F91\u5143\u7D20",
      count: 0,
      current: 0
    };
  }
  clearAllHighlights();
  currentMatches = [];
  elementsWithFrame.forEach((item, elemIndex) => {
    const element = item.element;
    const frame = item.frame;
    const value = getElementValue(element);
    const matches = findInText(value, findText, searchOptions);
    matches.forEach((match) => {
      currentMatches.push({
        element,
        frame,
        // 保存 frame 引用，用于后续操作
        elemIndex,
        ...match
      });
    });
  });
  currentMatchIndex = currentMatches.length > 0 ? 0 : -1;
  clearAllHighlights();
  currentMatches.forEach((match, index) => {
    const isCurrent = index === currentMatchIndex;
    highlightElement(match.element, findText, isCurrent ? index : -1, searchOptions);
  });
  if (currentMatches.length > 0 && shouldFocus) {
    highlightCurrentMatch(true);
  }
  currentSearchText = findText;
  return {
    status: currentMatches.length > 0 ? ReplaceStatus.SUCCESS : ReplaceStatus.NO_MATCH,
    count: currentMatches.length,
    current: currentMatchIndex + 1
  };
}
function startListening() {
  if (inputListener) return;
  inputListener = function(e) {
    if (isPanelElement(e.target)) {
      return;
    }
    if (previewMatches.length > 0) return;
    const target = e.target;
    if (target.matches && target.matches("input, textarea, [contenteditable]")) {
      if (currentSearchText && currentSearchText.trim() !== "") {
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        searchTimeout = setTimeout(() => {
          findMatches(currentSearchText, searchOptions, false);
          updateUIFromSearch();
          proxy.emit("matches:updated", {
            count: currentMatches.length,
            current: currentMatchIndex + 1
          });
        }, 300);
      }
    }
  };
  document.addEventListener("input", inputListener, true);
  document.addEventListener("change", inputListener, true);
  if (!isDOMListening) {
    startObserving(() => {
      if (previewMatches.length > 0) return;
      if (currentSearchText && currentSearchText.trim() !== "") {
        findMatches(currentSearchText, searchOptions, false);
        updateUIFromSearch();
        proxy.emit("matches:updated", {
          count: currentMatches.length,
          current: currentMatchIndex + 1
        });
      }
    });
    isDOMListening = true;
  }
}
function stopListening() {
  if (inputListener) {
    document.removeEventListener("input", inputListener, true);
    document.removeEventListener("change", inputListener, true);
    inputListener = null;
  }
  if (isDOMListening) {
    stopObserving();
    isDOMListening = false;
  }
}
function updateUIFromSearch() {
  const matchCountEl = getPanelUIElement(UIConstants.MATCH_COUNT_ID);
  const prevBtn = getPanelUIElement(UIConstants.PREV_BTN_ID);
  const nextBtn = getPanelUIElement(UIConstants.NEXT_BTN_ID);
  const replaceOneBtn = getPanelUIElement(UIConstants.REPLACE_ONE_BTN_ID);
  const replaceAllBtn = getPanelUIElement(UIConstants.REPLACE_ALL_BTN_ID);
  if (matchCountEl) {
    if (currentMatches.length === 0) {
      matchCountEl.textContent = "\u65E0\u7ED3\u679C";
    } else {
      matchCountEl.textContent = `${currentMatchIndex + 1} / ${currentMatches.length}`;
    }
  }
  const hasMatches = currentMatches.length > 0;
  if (prevBtn) prevBtn.disabled = !hasMatches;
  if (nextBtn) nextBtn.disabled = !hasMatches;
  if (replaceOneBtn) replaceOneBtn.disabled = !hasMatches;
  if (replaceAllBtn) replaceAllBtn.disabled = !hasMatches;
}
var searchTimeout = null;
function findInText(text, pattern, options) {
  const matches = [];
  const { matchCase, matchWord, useRegex } = options;
  let searchPattern = pattern;
  let flags = "g";
  let regex;
  if (!matchCase) {
    flags += "i";
  }
  try {
    const escaped = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (useRegex) {
      regex = new RegExp(searchPattern, flags);
    } else {
      regex = new RegExp(escaped, flags);
    }
    if (matchWord) {
      regex = new RegExp(`\\b${searchPattern}\\b`, flags);
    }
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  } catch (e) {
    console.error("Regex error:", e);
  }
  return matches;
}
function goToPrevMatch() {
  if (currentMatches.length === 0) return null;
  updateHighlights();
  currentMatchIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : currentMatches.length - 1;
  updateHighlights();
  highlightCurrentMatch(true);
  updateUIFromSearch();
  return {
    count: currentMatches.length,
    current: currentMatchIndex + 1
  };
}
function goToNextMatch() {
  if (currentMatches.length === 0) return null;
  updateHighlights();
  currentMatchIndex = currentMatchIndex < currentMatches.length - 1 ? currentMatchIndex + 1 : 0;
  updateHighlights();
  highlightCurrentMatch(true);
  updateUIFromSearch();
  return {
    count: currentMatches.length,
    current: currentMatchIndex + 1
  };
}
function isCurrentMatchInViewport() {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return false;
  const element = currentMatches[currentMatchIndex].element;
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && rect.right <= (window.innerWidth || document.documentElement.clientWidth);
}
function focusCurrentMatch() {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return null;
  highlightCurrentMatch(true);
  updateUIFromSearch();
  return {
    count: currentMatches.length,
    current: currentMatchIndex + 1
  };
}
function updateHighlights() {
  clearAllHighlights();
  if (currentSearchText && currentMatches.length > 0) {
    currentMatches.forEach((match, index) => {
      const isCurrent = index === currentMatchIndex;
      highlightElement(match.element, currentSearchText, isCurrent ? index : -1, searchOptions);
    });
  }
}
function highlightCurrentMatch(shouldFocus = false) {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return;
  const match = currentMatches[currentMatchIndex];
  const element = match.element;
  if (shouldFocus) {
    element.focus();
    if (element.isContentEditable) {
      try {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (e) {
      }
    } else {
      const supportsSelection = element.tagName === "TEXTAREA" || element.tagName === "INPUT" && /^(text|search|url|tel|password)$/i.test(element.type);
      if (supportsSelection) {
        element.setSelectionRange(match.start, match.end);
        if (element.tagName === "TEXTAREA") {
          scrollToMatch(element, match.start, match.end);
        }
      }
      try {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (e) {
      }
    }
  }
}
function scrollToMatch(element, matchStart, matchEnd) {
  try {
    setTimeout(() => {
      const computedStyle = getComputedStyle(element);
      let lineHeight = parseFloat(computedStyle.lineHeight);
      if (isNaN(lineHeight) || lineHeight === 0) {
        const fontSize = parseFloat(computedStyle.fontSize);
        lineHeight = fontSize * 1.2;
      }
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const textBeforeMatch = element.value.substring(0, matchStart);
      const lines = textBeforeMatch.split("\n");
      const lineNumber = lines.length;
      const targetScrollTop = (lineNumber - 1) * lineHeight + paddingTop - element.clientHeight / 2 + lineHeight / 2;
      element.scrollTop = Math.max(0, targetScrollTop);
    }, 10);
  } catch (e) {
    console.warn("\u6EDA\u52A8\u5230\u5339\u914D\u4F4D\u7F6E\u5931\u8D25:", e);
  }
}
async function replaceOne(replaceText) {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) {
    return {
      status: ReplaceStatus.NO_MATCH,
      message: "\u65E0\u5339\u914D\u9879"
    };
  }
  const match = currentMatches[currentMatchIndex];
  const element = match.element;
  const currentValue = getElementValue(element);
  const before = currentValue.substring(0, match.start);
  const after = currentValue.substring(match.end);
  const newValue = before + replaceText + after;
  setElementValue(element, newValue);
  clearHighlight(element);
  const newFindText = currentSearchText || "";
  if (newFindText) {
    findMatches(newFindText, searchOptions, false);
  }
  await saveHistory(
    currentSearchText || "",
    replaceText || "",
    { matchCase: searchOptions.matchCase, matchWord: searchOptions.matchWord, useRegex: searchOptions.useRegex }
  ).catch(() => {
  });
  proxy.emit("history:updated");
  return {
    status: ReplaceStatus.SUCCESS,
    count: currentMatches.length,
    current: currentMatchIndex + 1
  };
}
async function replaceAll(findText, replaceText, options = {}) {
  searchOptions = { ...searchOptions, ...options };
  if (!findText || findText.trim() === "") {
    return {
      status: ReplaceStatus.EMPTY_FIND,
      message: "\u8BF7\u8F93\u5165\u8981\u67E5\u627E\u7684\u6587\u672C",
      total: 0,
      replaced: 0,
      matchCount: 0
    };
  }
  const elementsWithFrame = findAllEditableElements();
  if (elementsWithFrame.length === 0) {
    return {
      status: ReplaceStatus.NO_MATCH,
      message: "\u9875\u9762\u4E0A\u6CA1\u6709\u627E\u5230\u53EF\u7F16\u8F91\u7684\u5143\u7D20",
      total: 0,
      replaced: 0,
      matchCount: 0
    };
  }
  let totalElements = 0;
  let replacedElements = 0;
  let totalMatches = 0;
  elementsWithFrame.forEach((item) => {
    const element = item.element;
    const currentValue = getElementValue(element);
    const newValue = replaceInText(currentValue, findText, replaceText, searchOptions);
    if (newValue !== currentValue) {
      setElementValue(element, newValue);
      replacedElements++;
      totalMatches += countMatches(currentValue, findText, searchOptions);
    }
    totalElements++;
  });
  currentMatches = [];
  currentMatchIndex = -1;
  if (replacedElements === 0) {
    return {
      status: ReplaceStatus.NO_MATCH,
      message: `\u5728 ${totalElements} \u4E2A\u5143\u7D20\u4E2D\u672A\u627E\u5230\u5339\u914D\u7684\u6587\u672C`,
      total: totalElements,
      replaced: 0,
      matchCount: 0
    };
  }
  await saveHistory(
    findText || "",
    replaceText || "",
    { matchCase: searchOptions.matchCase, matchWord: searchOptions.matchWord, useRegex: searchOptions.useRegex }
  ).catch(() => {
  });
  proxy.emit("history:updated");
  return {
    status: ReplaceStatus.SUCCESS,
    message: `\u5DF2\u66FF\u6362 ${totalMatches} \u5904`,
    total: totalElements,
    replaced: replacedElements,
    matchCount: totalMatches
  };
}
function replaceInText(text, pattern, replacement, options) {
  const { matchCase, matchWord, useRegex } = options;
  let flags = matchCase ? "g" : "gi";
  let regex;
  try {
    if (useRegex) {
      regex = new RegExp(pattern, flags);
    } else {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (matchWord) {
        regex = new RegExp(`\\b${escaped}\\b`, flags);
      } else {
        regex = new RegExp(escaped, flags);
      }
    }
    return text.replace(regex, replacement);
  } catch (e) {
    return text;
  }
}
function countMatches(text, pattern, options) {
  const matches = findInText(text, pattern, options);
  return matches.length;
}
var previewMatches = [];
var previewFindText = "";
var previewOptions = {};
function refreshAllPreviewHighlights() {
  clearAllHighlights();
  const byElement = /* @__PURE__ */ new Map();
  previewMatches.forEach((match, idx) => {
    const key = match.element;
    if (!byElement.has(key)) byElement.set(key, []);
    byElement.get(key).push({ ...match, _idx: idx });
  });
  byElement.forEach((matches, element) => {
    highlightPreviewElement(element, previewFindText, previewOptions, matches);
  });
}
function enterPreviewMode(findText, options = {}) {
  previewFindText = findText;
  previewOptions = options;
  previewMatches = currentMatches.map((m) => ({ ...m, selected: false }));
  refreshAllPreviewHighlights();
  return previewMatches.length;
}
function togglePreviewMatch(index) {
  if (index < 0 || index >= previewMatches.length) return;
  previewMatches[index].selected = !previewMatches[index].selected;
  const match = previewMatches[index];
  refreshAllPreviewHighlights();
  return {
    index,
    selected: previewMatches[index].selected,
    totalSelected: previewMatches.filter((m) => m.selected).length
  };
}
function executeDoubleReplace(index, replaceText) {
  if (index < 0 || index >= previewMatches.length) return null;
  const match = previewMatches[index];
  const element = match.element;
  if (element.isContentEditable) {
    clearHighlight(element);
  }
  const currentValue = getElementValue(element);
  const safeStart = Math.min(match.start, currentValue.length);
  const safeEnd = Math.min(match.end, currentValue.length);
  const before = currentValue.substring(0, safeStart);
  const after = currentValue.substring(safeEnd);
  const newValue = before + replaceText + after;
  setElementValue(element, newValue);
  if (!element.isContentEditable) {
    clearHighlight(element);
  }
  const lengthDiff = replaceText.length - (safeEnd - safeStart);
  previewMatches.splice(index, 1);
  previewMatches.forEach((m) => {
    if (m.element === element && m.start > safeEnd) {
      m.start += lengthDiff;
      m.end += lengthDiff;
    }
  });
  if (previewMatches.length > 0) {
    refreshAllPreviewHighlights();
  } else {
    clearAllHighlights();
  }
  return { replaced: true, remaining: previewMatches.length };
}
function applyPreviewedReplacements(replaceText) {
  const selected = previewMatches.filter((m) => m.selected);
  let count = 0;
  const byElement = /* @__PURE__ */ new Map();
  selected.forEach((match) => {
    const key = match.element;
    if (!byElement.has(key)) byElement.set(key, []);
    byElement.get(key).push(match);
  });
  byElement.forEach((matches, element) => {
    matches.sort((a, b) => b.start - a.start);
    const currentValue = getElementValue(element);
    let newValue = currentValue;
    matches.forEach((match) => {
      newValue = newValue.substring(0, match.start) + replaceText + newValue.substring(match.end);
    });
    setElementValue(element, newValue);
    clearHighlight(element);
    count += matches.length;
  });
  exitPreviewMode();
  return { replaced: count };
}
function exitPreviewMode() {
  previewMatches = [];
  previewFindText = "";
  previewOptions = {};
  clearAllHighlights();
}
function getPreviewState() {
  return {
    total: previewMatches.length,
    selected: previewMatches.filter((m) => m.selected).length,
    inPreview: previewMatches.length > 0
  };
}

// src/styles/panel.css
var panel_default = "/**\r\n * \u6587\u672C\u66FF\u6362\u9762\u677F\u6837\u5F0F (V2 - CSS \u81EA\u5B9A\u4E49\u5C5E\u6027\u7248)\r\n * \u9762\u677F\u5B9A\u4F4D\u5C5E\u6027\uFF08position/top/right\uFF09\u7531 JS host \u5143\u7D20\u5185\u8054\u8BBE\u7F6E\r\n * \u9875\u9762\u7EA7\u9AD8\u4EAE\u6837\u5F0F\u4FDD\u7559\u5728\u6B64\u6587\u4EF6\u4E2D\r\n */\r\n\r\n/* ============================================\r\n * \u9762\u677F\u5BB9\u5668\r\n * ============================================ */\r\n.tr-panel {\r\n  /* \u5B9A\u4F4D\u5C5E\u6027\u7531 JS \u5728 host \u5143\u7D20\u4E0A\u8BBE\u7F6E */\r\n  width: 400px;\r\n  max-width: calc(100vw - 40px);\r\n  background: var(--tr-bg, #252526);\r\n  border-radius: 6px;\r\n  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);\r\n  z-index: 2147483647;\r\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\r\n  font-size: 13px;\r\n  line-height: 1.4;\r\n  color: var(--tr-text, #cccccc);\r\n  border: 1px solid var(--tr-border, #454545);\r\n}\r\n\r\n/* \u9690\u85CF\u72B6\u6001 */\r\n.tr-panel.tr-hidden {\r\n  display: none;\r\n}\r\n\r\n/* ============================================\r\n * \u8F93\u5165\u5BB9\u5668\r\n * ============================================ */\r\n.tr-input-row {\r\n  display: flex;\r\n  align-items: center;\r\n  padding: 8px 12px;\r\n  gap: 8px;\r\n  border-bottom: 1px solid var(--tr-input-bg, #3c3c3c);\r\n}\r\n\r\n.tr-input-row:last-child {\r\n  border-bottom: none;\r\n}\r\n\r\n/* ============================================\r\n * \u8F93\u5165\u6846\r\n * ============================================ */\r\n.tr-input-wrapper {\r\n  flex: 1;\r\n  position: relative;\r\n  display: flex;\r\n  align-items: center;\r\n}\r\n\r\n.tr-input-wrapper input {\r\n  width: 100%;\r\n  padding: 4px 8px;\r\n  font-size: 13px;\r\n  color: var(--tr-input-text, #cccccc);\r\n  background: var(--tr-input-bg, #3c3c3c);\r\n  border: 1px solid var(--tr-input-bg, #3c3c3c);\r\n  border-radius: 2px;\r\n  outline: none;\r\n  box-sizing: border-box;\r\n}\r\n\r\n.tr-input-wrapper input:focus {\r\n  border-color: #007acc;\r\n  background: var(--tr-input-bg, #3c3c3c);\r\n  box-shadow: 0 0 0 1px #007acc;\r\n}\r\n\r\n.tr-input-wrapper input::placeholder {\r\n  color: var(--tr-placeholder, #858585);\r\n}\r\n\r\n/* ============================================\r\n * \u6309\u94AE\u901A\u7528\u6837\u5F0F\r\n * ============================================ */\r\n.tr-btn {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  min-width: 28px;\r\n  height: 28px;\r\n  padding: 0 8px;\r\n  font-size: 13px;\r\n  font-weight: 400;\r\n  border: none;\r\n  border-radius: 2px;\r\n  cursor: pointer;\r\n  transition: background-color 0.1s ease;\r\n  color: var(--tr-text, #cccccc);\r\n  background: transparent;\r\n  line-height: 1;\r\n}\r\n\r\n.tr-btn:hover {\r\n  background: var(--tr-btn-hover, #3c3c3c);\r\n}\r\n\r\n.tr-btn:active {\r\n  background: var(--tr-btn-active-bg, #454545);\r\n}\r\n\r\n.tr-btn:disabled {\r\n  opacity: 0.4;\r\n  cursor: not-allowed;\r\n}\r\n\r\n/* \u6FC0\u6D3B\u72B6\u6001 */\r\n.tr-btn.tr-active {\r\n  background: var(--tr-accent, #0e639c);\r\n  color: var(--tr-accent-text, #ffffff);\r\n}\r\n\r\n.tr-btn.tr-active:hover {\r\n  background: #1177bb;\r\n}\r\n\r\n/* ============================================\r\n * \u5DE5\u5177\u6309\u94AE\u7EC4\r\n * ============================================ */\r\n.tr-toolbar {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 2px;\r\n}\r\n\r\n.tr-tool-btn {\r\n  min-width: 24px;\r\n  height: 24px;\r\n  font-size: 11px;\r\n  font-weight: 600;\r\n  padding: 0 4px;\r\n}\r\n\r\n/* \u5173\u95ED\u6309\u94AE */\r\n.tr-close-btn {\r\n  font-size: 18px;\r\n  font-weight: 300;\r\n  min-width: 28px;\r\n}\r\n\r\n/* ============================================\r\n * \u641C\u7D22\u7ED3\u679C\u8BA1\u6570\r\n * ============================================ */\r\n.tr-match-count {\r\n  padding: 0 8px;\r\n  font-size: 12px;\r\n  color: var(--tr-placeholder, #858585);\r\n  white-space: nowrap;\r\n}\r\n\r\n/* \u5BFC\u822A\u6309\u94AE */\r\n.tr-nav-btn {\r\n  min-width: 24px;\r\n  height: 24px;\r\n  font-size: 14px;\r\n}\r\n\r\n/* ============================================\r\n * \u66FF\u6362\u884C\r\n * ============================================ */\r\n.tr-replace-row {\r\n  display: none;\r\n}\r\n\r\n.tr-replace-row.tr-replace-visible {\r\n  display: flex;\r\n}\r\n\r\n/* \u66FF\u6362\u6309\u94AE */\r\n.tr-replace-btn {\r\n  font-size: 12px;\r\n  padding: 0 12px;\r\n}\r\n\r\n.tr-replace-all-btn {\r\n  font-size: 12px;\r\n  padding: 0 12px;\r\n}\r\n\r\n/* \u5207\u6362\u6309\u94AE */\r\n.tr-toggle-btn {\r\n  min-width: 28px;\r\n  font-size: 14px;\r\n}\r\n\r\n/* ============================================\r\n * \u72B6\u6001\u63D0\u793A\r\n * ============================================ */\r\n.tr-status {\r\n  position: absolute;\r\n  bottom: -24px;\r\n  left: 0;\r\n  right: 0;\r\n  padding: 4px 12px;\r\n  font-size: 12px;\r\n  text-align: center;\r\n  border-radius: 0 0 6px 6px;\r\n  display: none;\r\n}\r\n\r\n.tr-status.tr-show {\r\n  display: block;\r\n}\r\n\r\n.tr-status.tr-success {\r\n  background: var(--tr-input-bg, #3c3c3c);\r\n  color: var(--tr-success, #4ec9b0);\r\n}\r\n\r\n.tr-status.tr-warning {\r\n  background: var(--tr-input-bg, #3c3c3c);\r\n  color: var(--tr-warning, #ce9178);\r\n}\r\n\r\n.tr-status.tr-error {\r\n  background: var(--tr-input-bg, #3c3c3c);\r\n  color: var(--tr-error, #f14c4c);\r\n}\r\n\r\n/* ============================================\r\n * \u9875\u9762\u7EA7\u9AD8\u4EAE\u6837\u5F0F (\u7528\u4E8E contenteditable)\r\n * ============================================ */\r\n.tr-highlight-match {\r\n  background: var(--tr-highlight-match, rgba(255, 215, 0, 0.3));\r\n  border-radius: 2px;\r\n}\r\n\r\n.tr-highlight-current {\r\n  background: var(--tr-highlight-current, rgba(255, 100, 0, 0.5));\r\n  border-radius: 2px;\r\n}\r\n\r\n/* \u9884\u89C8\u9009\u4E2D\u6837\u5F0F\uFF08\u7EFF\u8272\uFF09 */\r\n.tr-preview-selected {\r\n  background: rgba(0, 255, 0, 0.4) !important;\r\n  border-radius: 2px;\r\n}\r\n\r\n/* ============================================\r\n * \u8986\u76D6\u5C42\u6837\u5F0F (\u7528\u4E8E input/textarea)\r\n * ============================================ */\r\n.tr-highlight-overlay {\r\n  position: absolute;\r\n  pointer-events: none;\r\n  z-index: 2147483646;\r\n  white-space: pre;\r\n  overflow: hidden;\r\n  background: transparent;\r\n  color: transparent;\r\n}\r\n\r\n.tr-highlight-overlay .tr-highlight-match {\r\n  background: var(--tr-overlay-match, rgba(255, 215, 0, 0.4));\r\n}\r\n\r\n.tr-highlight-overlay .tr-highlight-current {\r\n  background: var(--tr-overlay-current, rgba(255, 100, 0, 0.6));\r\n}\r\n\r\n.tr-highlight-overlay .tr-preview-selected {\r\n  background: rgba(0, 255, 0, 0.4) !important;\r\n  border-radius: 2px;\r\n}\r\n\r\n/* \u5305\u88C5\u5668\u6837\u5F0F */\r\n.tr-highlight-wrapper {\r\n  position: relative;\r\n  display: inline-block;\r\n}\r\n\r\n/* ============================================\r\n * \u6EDA\u52A8\u6761\u6837\u5F0F\r\n * ============================================ */\r\n.tr-panel ::-webkit-scrollbar {\r\n  width: 10px;\r\n  height: 10px;\r\n}\r\n\r\n.tr-panel ::-webkit-scrollbar-track {\r\n  background: var(--tr-scrollbar-track, #1e1e1e);\r\n}\r\n\r\n.tr-panel ::-webkit-scrollbar-thumb {\r\n  background: var(--tr-scrollbar-thumb, #424242);\r\n  border-radius: 5px;\r\n}\r\n\r\n.tr-panel ::-webkit-scrollbar-thumb:hover {\r\n  background: #4f4f4f;\r\n}\r\n\r\n/* ============================================\r\n * \u52A8\u753B\r\n * ============================================ */\r\n@keyframes tr-slide-in {\r\n  from {\r\n    opacity: 0;\r\n    transform: translateY(-10px);\r\n  }\r\n  to {\r\n    opacity: 1;\r\n    transform: translateY(0);\r\n  }\r\n}\r\n\r\n.tr-panel:not(.tr-hidden) {\r\n  animation: tr-slide-in 0.15s ease-out;\r\n}\r\n\r\n/* ============================================\r\n * \u54CD\u5E94\u5F0F - \u5C0F\u5C4F\u5E55\u9002\u914D\r\n * ============================================ */\r\n@media (max-width: 480px) {\r\n  .tr-panel {\r\n    top: 10px;\r\n    right: 10px;\r\n    left: 10px;\r\n    width: auto;\r\n    max-width: none;\r\n  }\r\n\r\n  .tr-input-row {\r\n    padding: 6px 8px;\r\n  }\r\n}\r\n";

// src/content/ui/search-bar.js
var searchTimeout2 = null;
var DEBOUNCE_MS = 150;
function renderSearchBar(container, searchOptions3, hidePanel, toggleReplace) {
  const searchRow = document.createElement("div");
  searchRow.className = "tr-input-row";
  searchRow.id = "tr-search-row";
  searchRow.innerHTML = `
    <div class="tr-input-wrapper">
      <textarea id="${UIConstants.FIND_INPUT_ID}" placeholder="\u67E5\u627E" rows="1" autocomplete="off" spellcheck="false"></textarea>
    </div>
    <div class="tr-toolbar">
      <button class="tr-btn tr-tool-btn" id="${UIConstants.MATCH_CASE_ID}" title="\u533A\u5206\u5927\u5C0F\u5199">${Icons.MATCH_CASE}</button>
      <button class="tr-btn tr-tool-btn" id="${UIConstants.MATCH_WORD_ID}" title="\u5339\u914D\u6574\u4E2A\u5355\u8BCD">${Icons.MATCH_WORD}</button>
      <button class="tr-btn tr-tool-btn" id="${UIConstants.USE_REGEX_ID}" title="\u4F7F\u7528\u6B63\u5219\u8868\u8FBE\u5F0F">${Icons.USE_REGEX}</button>
    </div>
    <span class="tr-match-count" id="${UIConstants.MATCH_COUNT_ID}"></span>
    <div class="tr-toolbar">
      <button class="tr-btn tr-nav-btn" id="${UIConstants.PREV_BTN_ID}" title="\u4E0A\u4E00\u4E2A" disabled>${Icons.PREV}</button>
      <button class="tr-btn tr-nav-btn" id="${UIConstants.NEXT_BTN_ID}" title="\u4E0B\u4E00\u4E2A" disabled>${Icons.NEXT}</button>
    </div>
    <button class="tr-btn tr-toggle-btn" id="tr-toggle-replace-btn" title="\u5207\u6362\u66FF\u6362">${Icons.TOGGLE_REPLACE}</button>
    <button class="tr-btn tr-close-btn ${UIConstants.CLOSE_BTN_CLASS}" title="\u5173\u95ED">${Icons.CLOSE}</button>
  `;
  container.appendChild(searchRow);
  const findInput = searchRow.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
  if (findInput) {
    findInput.style.cssText = "width:100%;padding:4px 8px;font-size:13px;color:var(--tr-input-text,#cccccc);background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-input-bg,#3c3c3c);border-radius:2px;outline:none;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.4;min-height:22px;";
  }
  const matchCaseBtn = searchRow.querySelector(`#${UIConstants.MATCH_CASE_ID}`);
  const matchWordBtn = searchRow.querySelector(`#${UIConstants.MATCH_WORD_ID}`);
  const useRegexBtn = searchRow.querySelector(`#${UIConstants.USE_REGEX_ID}`);
  const matchCountEl = searchRow.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
  const prevBtn = searchRow.querySelector(`#${UIConstants.PREV_BTN_ID}`);
  const nextBtn = searchRow.querySelector(`#${UIConstants.NEXT_BTN_ID}`);
  const toggleReplaceBtn = searchRow.querySelector("#tr-toggle-replace-btn");
  const closeBtn = searchRow.querySelector(`.${UIConstants.CLOSE_BTN_CLASS}`);
  findInput.addEventListener("input", () => {
    if (searchTimeout2) clearTimeout(searchTimeout2);
    searchTimeout2 = setTimeout(() => {
      performSearch(findInput, searchOptions3, matchCountEl, prevBtn, nextBtn);
    }, DEBOUNCE_MS);
  });
  findInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        await proxy.command("navigate", { direction: "prev" });
      } else {
        await proxy.command("navigate", { direction: "next" });
      }
      setTimeout(() => findInput.focus(), 50);
    }
  });
  findInput.addEventListener("blur", async () => {
    const text = findInput.value;
    if (text.trim()) {
      await saveHistory(text, "", { ...searchOptions3 }).catch(() => {
      });
      proxy.emit("history:updated");
    }
  });
  matchCaseBtn.addEventListener("click", () => {
    searchOptions3.matchCase = !searchOptions3.matchCase;
    matchCaseBtn.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions3.matchCase);
    performSearch(findInput, searchOptions3, matchCountEl, prevBtn, nextBtn);
  });
  matchWordBtn.addEventListener("click", () => {
    searchOptions3.matchWord = !searchOptions3.matchWord;
    matchWordBtn.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions3.matchWord);
    performSearch(findInput, searchOptions3, matchCountEl, prevBtn, nextBtn);
  });
  useRegexBtn.addEventListener("click", () => {
    searchOptions3.useRegex = !searchOptions3.useRegex;
    useRegexBtn.classList.toggle(UIConstants.ACTIVE_CLASS, searchOptions3.useRegex);
    performSearch(findInput, searchOptions3, matchCountEl, prevBtn, nextBtn);
  });
  prevBtn.addEventListener("click", async () => {
    const result = await proxy.command("navigate", { direction: "prev" });
    if (result) updateMatchCount(matchCountEl, result);
  });
  nextBtn.addEventListener("click", async () => {
    const result = await proxy.command("navigate", { direction: "next" });
    if (result) updateMatchCount(matchCountEl, result);
  });
  toggleReplaceBtn.addEventListener("click", () => {
    toggleReplace();
    const panel = searchRow.closest(".tr-panel");
    const replaceRow = panel ? panel.querySelector("#tr-replace-row") : null;
    if (replaceRow) {
      const isVisible = replaceRow.classList.contains(UIConstants.REPLACE_VISIBLE_CLASS);
      toggleReplaceBtn.innerHTML = isVisible ? "\u25C4" : Icons.TOGGLE_REPLACE;
    }
  });
  closeBtn.addEventListener("click", hidePanel);
  proxy.on("matches:updated", (data) => {
    if (data) {
      updateMatchCount(matchCountEl, data);
      const hasMatches = data.count > 0;
      prevBtn.disabled = !hasMatches;
      nextBtn.disabled = !hasMatches;
    }
  });
}
async function performSearch(findInput, searchOptions3, matchCountEl, prevBtn, nextBtn) {
  const text = findInput.value;
  if (!text || text.trim() === "") {
    matchCountEl.textContent = "";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    await proxy.command("clearHighlights");
    proxy.emit("matches:updated", { count: 0, current: 0 });
    return;
  }
  const result = await proxy.command("search", {
    text,
    options: { ...searchOptions3 },
    shouldFocus: false
  });
  if (result) {
    updateMatchCount(matchCountEl, result);
    const hasMatches = result.count > 0;
    prevBtn.disabled = !hasMatches;
    nextBtn.disabled = !hasMatches;
    proxy.emit("matches:updated", result);
  }
}
function updateMatchCount(el, result) {
  if (!result || result.count === 0) {
    el.textContent = result && result.message ? result.message : "\u65E0\u7ED3\u679C";
  } else {
    el.textContent = `${result.current} / ${result.count}`;
  }
}

// src/content/ui/theme-picker.js
var themes = {
  dark: {
    "--tr-bg": "#252526",
    "--tr-text": "#cccccc",
    "--tr-border": "#454545",
    "--tr-input-bg": "#3c3c3c",
    "--tr-input-text": "#cccccc",
    "--tr-placeholder": "#858585",
    "--tr-btn-hover": "#3c3c3c",
    "--tr-btn-active-bg": "#454545",
    "--tr-accent": "#0e639c",
    "--tr-accent-text": "#ffffff",
    "--tr-highlight-match": "rgba(255, 215, 0, 0.3)",
    "--tr-highlight-current": "rgba(255, 100, 0, 0.5)",
    "--tr-overlay-match": "rgba(255, 215, 0, 0.4)",
    "--tr-overlay-current": "rgba(255, 100, 0, 0.6)",
    "--tr-scrollbar-track": "#1e1e1e",
    "--tr-scrollbar-thumb": "#424242",
    "--tr-success": "#4ec9b0",
    "--tr-warning": "#ce9178",
    "--tr-error": "#f14c4c"
  },
  light: {
    "--tr-bg": "#ffffff",
    "--tr-text": "#333333",
    "--tr-border": "#cccccc",
    "--tr-input-bg": "#f3f3f3",
    "--tr-input-text": "#333333",
    "--tr-placeholder": "#999999",
    "--tr-btn-hover": "#e8e8e8",
    "--tr-btn-active-bg": "#d4d4d4",
    "--tr-accent": "#0078d4",
    "--tr-accent-text": "#ffffff",
    "--tr-highlight-match": "rgba(255, 200, 0, 0.4)",
    "--tr-highlight-current": "rgba(255, 100, 0, 0.5)",
    "--tr-overlay-match": "rgba(255, 200, 0, 0.4)",
    "--tr-overlay-current": "rgba(255, 100, 0, 0.6)",
    "--tr-scrollbar-track": "#f3f3f3",
    "--tr-scrollbar-thumb": "#c1c1c1",
    "--tr-success": "#107c10",
    "--tr-warning": "#d83b01",
    "--tr-error": "#a80000"
  },
  auto: {
    "--tr-bg": "#252526",
    "--tr-text": "#cccccc",
    "--tr-border": "#454545",
    "--tr-input-bg": "#3c3c3c",
    "--tr-input-text": "#cccccc",
    "--tr-placeholder": "#858585",
    "--tr-btn-hover": "#3c3c3c",
    "--tr-btn-active-bg": "#454545",
    "--tr-accent": "#0e639c",
    "--tr-accent-text": "#ffffff",
    "--tr-highlight-match": "rgba(255, 215, 0, 0.3)",
    "--tr-highlight-current": "rgba(255, 100, 0, 0.5)",
    "--tr-overlay-match": "rgba(255, 215, 0, 0.4)",
    "--tr-overlay-current": "rgba(255, 100, 0, 0.6)",
    "--tr-scrollbar-track": "#1e1e1e",
    "--tr-scrollbar-thumb": "#424242",
    "--tr-success": "#4ec9b0",
    "--tr-warning": "#ce9178",
    "--tr-error": "#f14c4c"
  },
  custom: {
    "--tr-bg": "#252526",
    "--tr-text": "#cccccc",
    "--tr-border": "#454545",
    "--tr-input-bg": "#3c3c3c",
    "--tr-input-text": "#cccccc",
    "--tr-placeholder": "#858585",
    "--tr-btn-hover": "#3c3c3c",
    "--tr-btn-active-bg": "#454545",
    "--tr-accent": "#0e639c",
    "--tr-accent-text": "#ffffff",
    "--tr-highlight-match": "rgba(255, 215, 0, 0.3)",
    "--tr-highlight-current": "rgba(255, 100, 0, 0.5)",
    "--tr-overlay-match": "rgba(255, 215, 0, 0.4)",
    "--tr-overlay-current": "rgba(255, 100, 0, 0.6)",
    "--tr-scrollbar-track": "#1e1e1e",
    "--tr-scrollbar-thumb": "#424242",
    "--tr-success": "#4ec9b0",
    "--tr-warning": "#ce9178",
    "--tr-error": "#f14c4c"
  }
};
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
}
function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function lightenColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  return `rgb(${Math.min(255, Math.round(r * factor))}, ${Math.min(255, Math.round(g * factor))}, ${Math.min(255, Math.round(b * factor))})`;
}
function darkenColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - percent / 100;
  return `rgb(${Math.max(0, Math.round(r * factor))}, ${Math.max(0, Math.round(g * factor))}, ${Math.max(0, Math.round(b * factor))})`;
}
function applyTheme(mode, hostElement2) {
  if (!hostElement2) return;
  const vars = themes[mode] || themes["dark"];
  for (const [key, value] of Object.entries(vars)) {
    hostElement2.style.setProperty(key, value);
  }
  if (mode === "auto") {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      for (const [key, value] of Object.entries(themes["dark"])) {
        hostElement2.style.setProperty(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(themes["light"])) {
        hostElement2.style.setProperty(key, value);
      }
    }
  }
  getTheme().then((existing) => {
    const config = { mode };
    if (existing.custom) config.custom = existing.custom;
    saveTheme(config);
  });
}
async function initTheme(hostElement2) {
  const config = await getTheme();
  const mode = config.mode || "auto";
  if (mode === "custom" && config.custom) {
    applyCustomColors(
      config.custom.panelBg || "#252526",
      config.custom.searchHighlight || "#ffd700",
      config.custom.previewHighlight || "#00ff00",
      hostElement2
    );
    saveTheme({ mode: "custom", custom: config.custom });
  } else {
    applyTheme(mode, hostElement2);
  }
}
function applyCustomColors(panelColor, searchColor, previewColor, hostElement2) {
  if (!hostElement2) return;
  const panelRGB = hexToRgb(panelColor);
  const isDark = panelRGB.r * 0.299 + panelRGB.g * 0.587 + panelRGB.b * 0.114 < 128;
  hostElement2.style.setProperty("--tr-bg", panelColor);
  hostElement2.style.setProperty("--tr-text", isDark ? "#e0e0e0" : "#222222");
  hostElement2.style.setProperty("--tr-border", isDark ? "#454545" : "#cccccc");
  hostElement2.style.setProperty("--tr-input-bg", isDark ? lightenColor(panelColor, 10) : darkenColor(panelColor, 5));
  hostElement2.style.setProperty("--tr-input-text", isDark ? "#e0e0e0" : "#222222");
  hostElement2.style.setProperty("--tr-placeholder", isDark ? "#858585" : "#999999");
  hostElement2.style.setProperty("--tr-btn-hover", isDark ? lightenColor(panelColor, 8) : darkenColor(panelColor, 8));
  hostElement2.style.setProperty("--tr-btn-active-bg", isDark ? lightenColor(panelColor, 16) : darkenColor(panelColor, 16));
  hostElement2.style.setProperty("--tr-accent", "#0e639c");
  hostElement2.style.setProperty("--tr-accent-text", "#ffffff");
  hostElement2.style.setProperty("--tr-highlight-match", hexToRgba(searchColor, 0.3));
  hostElement2.style.setProperty("--tr-highlight-current", hexToRgba(searchColor, 0.5));
  hostElement2.style.setProperty("--tr-overlay-match", hexToRgba(searchColor, 0.4));
  hostElement2.style.setProperty("--tr-overlay-current", hexToRgba(searchColor, 0.6));
  hostElement2.style.setProperty("--tr-preview-selected", hexToRgba(previewColor, 0.4));
  hostElement2.style.setProperty("--tr-scrollbar-track", isDark ? "#1e1e1e" : "#f3f3f3");
  hostElement2.style.setProperty("--tr-scrollbar-thumb", isDark ? "#424242" : "#c1c1c1");
  hostElement2.style.setProperty("--tr-success", isDark ? "#4ec9b0" : "#107c10");
  hostElement2.style.setProperty("--tr-warning", isDark ? "#ce9178" : "#d83b01");
  hostElement2.style.setProperty("--tr-error", isDark ? "#f14c4c" : "#a80000");
}

// src/content/ui/replace-bar.js
var toastTimer = null;
function showToast(message) {
  const panel = _getPanelElement ? _getPanelElement() : null;
  if (!panel) return;
  const oldToast = panel.querySelector("#tr-toast");
  if (oldToast) oldToast.remove();
  if (toastTimer) clearTimeout(toastTimer);
  const toast = document.createElement("div");
  toast.id = "tr-toast";
  toast.style.cssText = "position:absolute;top:-30px;left:50%;transform:translateX(-50%);padding:4px 14px;font-size:12px;color:var(--tr-success,#4ec9b0);background:var(--tr-bg,#252526);border:1px solid var(--tr-border,#454545);border-radius:4px;z-index:100;white-space:nowrap;pointer-events:none;";
  toast.textContent = message;
  panel.appendChild(toast);
  toastTimer = setTimeout(() => {
    toast.remove();
    toastTimer = null;
  }, 1e3);
}
function showConfirm(message) {
  return new Promise((resolve) => {
    const panel = _getPanelElement ? _getPanelElement() : null;
    if (!panel) {
      resolve(false);
      return;
    }
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:50;display:flex;align-items:center;justify-content:center;";
    const box = document.createElement("div");
    box.style.cssText = "background:var(--tr-bg,#252526);border:1px solid var(--tr-border,#454545);border-radius:4px;padding:16px 20px;max-width:300px;text-align:center;";
    box.innerHTML = `
      <div style="font-size:13px;color:var(--tr-text,#ccc);margin-bottom:12px;">${message}</div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button id="tr-confirm-ok" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-accent,#0e639c);border:none;color:var(--tr-accent-text,#fff);border-radius:2px;">\u786E\u8BA4</button>
        <button id="tr-confirm-cancel" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u53D6\u6D88</button>
      </div>
    `;
    overlay.appendChild(box);
    panel.appendChild(overlay);
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    box.querySelector("#tr-confirm-ok").addEventListener("click", () => cleanup(true));
    box.querySelector("#tr-confirm-cancel").addEventListener("click", () => cleanup(false));
  });
}
function showPrompt(title, defaultValue) {
  return new Promise((resolve) => {
    const panel = _getPanelElement ? _getPanelElement() : null;
    if (!panel) {
      resolve(null);
      return;
    }
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:50;display:flex;align-items:center;justify-content:center;";
    const box = document.createElement("div");
    box.style.cssText = "background:var(--tr-bg,#252526);border:1px solid var(--tr-border,#454545);border-radius:4px;padding:16px 20px;max-width:300px;";
    box.innerHTML = `
      <div style="font-size:13px;color:var(--tr-text,#ccc);margin-bottom:8px;">${title}</div>
      <input id="tr-prompt-input" type="text" value="${escapeHtml(defaultValue || "")}" autocomplete="off" style="width:100%;height:28px;padding:0 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;box-sizing:border-box;margin-bottom:12px;">
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="tr-prompt-ok" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-accent,#0e639c);border:none;color:var(--tr-accent-text,#fff);border-radius:2px;">\u786E\u8BA4</button>
        <button id="tr-prompt-cancel" style="height:26px;padding:0 20px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u53D6\u6D88</button>
      </div>
    `;
    overlay.appendChild(box);
    panel.appendChild(overlay);
    const input = box.querySelector("#tr-prompt-input");
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    box.querySelector("#tr-prompt-ok").addEventListener("click", () => cleanup(input.value.trim()));
    box.querySelector("#tr-prompt-cancel").addEventListener("click", () => cleanup(null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") cleanup(input.value.trim());
      if (e.key === "Escape") cleanup(null);
    });
  });
}
var isPreviewMode = false;
var overlayClickHandler = null;
var _getPanelElement = null;
var _historyPanel = null;
var _customPanel = null;
var _modalState = null;
function renderReplaceBar(container, searchOptions3, getPanelElement2) {
  _getPanelElement = getPanelElement2;
  const replaceRow = document.createElement("div");
  replaceRow.className = "tr-input-row tr-replace-row tr-replace-visible";
  replaceRow.id = "tr-replace-row";
  replaceRow.innerHTML = `
    <div class="tr-input-wrapper">
      <textarea id="${UIConstants.REPLACE_INPUT_ID}" placeholder="\u66FF\u6362" rows="1" autocomplete="off" spellcheck="false"></textarea>
    </div>
    <div class="tr-toolbar">
      <button class="tr-btn tr-replace-btn" id="${UIConstants.REPLACE_ONE_BTN_ID}" title="\u66FF\u6362\u5F53\u524D\u5339\u914D" disabled>${Icons.REPLACE_ONE}</button>
      <button class="tr-btn tr-replace-all-btn" id="${UIConstants.REPLACE_ALL_BTN_ID}" title="\u66FF\u6362\u5168\u90E8\u5339\u914D" disabled>${Icons.REPLACE_ALL}</button>
      <button class="tr-btn tr-tool-btn" id="tr-theme-btn" title="\u5207\u6362\u4E3B\u9898">\u{1F504}</button>
      <button class="tr-btn tr-tool-btn" id="tr-history-btn" title="\u5386\u53F2/\u9884\u8BBE">\u{1F4CB}</button>
      <button class="tr-btn tr-tool-btn" id="tr-preview-btn" title="\u9884\u89C8\u66FF\u6362">\u{1F441}</button>
      <button class="tr-btn tr-tool-btn" id="tr-apply-preview-btn" title="\u5E94\u7528\u9884\u89C8\u66FF\u6362" disabled>\u2713</button>
    </div>
  `;
  container.appendChild(replaceRow);
  const customPanel = document.createElement("div");
  _customPanel = customPanel;
  customPanel.id = "tr-custom-panel";
  customPanel.className = "tr-input-row";
  customPanel.style.cssText = "display:none;flex-direction:column;gap:6px;padding:6px 0;border-bottom:none;align-items:stretch;";
  customPanel.innerHTML = `
    <div style="display:flex;align-items:center;padding:4px 0;">
      <span style="font-size:12px;font-weight:600;color:var(--tr-text,#ccc);">\u{1F3A8} \u81EA\u5B9A\u4E49\u4E3B\u9898</span>
      <button id="tr-custom-close" style="margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:16px;color:var(--tr-text,#ccc);padding:0 4px;" title="\u5173\u95ED">&times;</button>
    </div>
    <div style="display:flex;flex-direction:row;gap:10px;align-items:center;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:4px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">\u9762\u677F\u4E3B\u8272</label>
        <input type="color" id="tr-color-panel" style="width:28px;height:22px;border:none;border-radius:2px;cursor:pointer;padding:0;background:transparent;">
        <span id="tr-color-panel-hex" style="font-size:10px;color:var(--tr-placeholder,#858585);font-family:monospace;">#252526</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">\u641C\u7D22\u9AD8\u4EAE</label>
        <input type="color" id="tr-color-search" style="width:28px;height:22px;border:none;border-radius:2px;cursor:pointer;padding:0;background:transparent;">
        <span id="tr-color-search-hex" style="font-size:10px;color:var(--tr-placeholder,#858585);font-family:monospace;">#ffd700</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <label style="font-size:11px;color:var(--tr-placeholder,#858585);">\u9884\u89C8\u9AD8\u4EAE</label>
        <input type="color" id="tr-color-preview" style="width:28px;height:22px;border:none;border-radius:2px;cursor:pointer;padding:0;background:transparent;">
        <span id="tr-color-preview-hex" style="font-size:10px;color:var(--tr-placeholder,#858585);font-family:monospace;">#00ff00</span>
      </div>
    </div>
    <div style="height:1px;background:var(--tr-border,#454545);margin:2px 0;"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:10px;font-weight:600;color:var(--tr-placeholder,#858585);text-transform:uppercase;">\u9884\u8BBE\u8272\u677F</span>
      <div style="display:flex;gap:4px;">
        <button id="tr-preset-save-color-btn" title="\u4FDD\u5B58\u5F53\u524D\u989C\u8272\u4E3A\u9884\u8BBE" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u{1F4BE}</button>
        <button id="tr-preset-batch-del-color-btn" title="\u6279\u91CF\u5220\u9664\u9884\u8BBE" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-error,#f14c4c);border-radius:2px;">\u{1F5D1}</button>
      </div>
    </div>
    <div id="tr-custom-preset-btns" style="display:flex;gap:4px;flex-wrap:wrap;">
      <button class="tr-preset-btn" data-preset="monokai" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Monokai</button>
      <button class="tr-preset-btn" data-preset="nord" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Nord</button>
      <button class="tr-preset-btn" data-preset="solarized-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Dark</button>
      <button class="tr-preset-btn" data-preset="solarized-light" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Light</button>
      <button class="tr-preset-btn" data-preset="one-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">One Dark</button>
    </div>
  `;
  container.appendChild(customPanel);
  const historyPanel = document.createElement("div");
  _historyPanel = historyPanel;
  historyPanel.id = "tr-history-panel";
  historyPanel.className = "tr-input-row";
  historyPanel.style.cssText = "display:none;flex-direction:column;padding:0;border-bottom:none;align-items:stretch;";
  historyPanel.innerHTML = `
    <div style="display:flex;align-items:center;border-bottom:1px solid var(--tr-border,#454545);padding:0;">
      <button class="tr-history-tab active" data-tab="history" style="flex:1;padding:6px 14px;font-size:12px;cursor:pointer;border:none;background:transparent;color:var(--tr-text,#ccc);border-bottom:2px solid var(--tr-accent,#0e639c);margin-bottom:-1px;text-align:center;">\u5386\u53F2\u8BB0\u5F55</button>
      <button class="tr-history-tab" data-tab="presets" style="flex:1;padding:6px 14px;font-size:12px;cursor:pointer;border:none;background:transparent;color:var(--tr-placeholder,#858585);border-bottom:2px solid transparent;margin-bottom:-1px;text-align:center;">\u9884\u8BBE\u89C4\u5219</button>
      <button id="tr-history-close" style="margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:16px;color:var(--tr-text,#ccc);padding:0 4px;" title="\u5173\u95ED">&times;</button>
    </div>
    <div id="tr-history-list" style="padding:8px 0;word-break:break-all;overflow-wrap:break-word;"></div>
    <div id="tr-presets-container" style="display:none;flex-direction:column;">
      <div style="padding:8px 0;display:flex;gap:6px;align-items:center;">
        <button id="tr-preset-search" style="display:none;">\u5360\u4F4D</button>
        <input id="tr-preset-search-input" type="text" placeholder="\u641C\u7D22\u9884\u8BBE..." style="flex:1;min-width:0;height:24px;padding:0 8px;font-size:12px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;">
        <button id="tr-preset-add-btn" title="\u65B0\u589E\u9884\u8BBE" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u2795</button>
        <button id="tr-preset-import-btn" title="\u5BFC\u5165\u9884\u8BBE" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u{1F4E5}</button>
        <button id="tr-preset-export-btn" title="\u5BFC\u51FA\u5168\u90E8\u9884\u8BBE" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u{1F4E4}</button>
        <button id="tr-preset-batch-del-btn" title="\u6279\u91CF\u5220\u9664" style="height:24px;min-width:24px;padding:0 6px;font-size:14px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-error,#f14c4c);border-radius:2px;">\u{1F5D1}</button>
        <input type="file" id="tr-preset-file-input" accept=".json" style="display:none;">
      </div>
      <div id="tr-preset-list" style="padding:0 0 8px;word-break:break-all;overflow-wrap:break-word;"></div>
    </div>
  `;
  container.appendChild(historyPanel);
  const presetModal = document.createElement("div");
  presetModal.id = "tr-preset-modal";
  presetModal.style.cssText = "display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:var(--tr-bg,#252526);z-index:10;flex-direction:column;padding:12px;gap:8px;";
  presetModal.innerHTML = `
    <div style="display:flex;align-items:center;">
      <span id="tr-modal-title" style="font-size:13px;font-weight:600;color:var(--tr-text,#ccc);">\u65B0\u589E\u9884\u8BBE</span>
      <button id="tr-modal-close" style="margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:18px;color:var(--tr-text,#ccc);padding:0 4px;" title="\u5173\u95ED">&times;</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:var(--tr-placeholder,#858585);">\u9884\u8BBE\u540D\u79F0</label>
      <input id="tr-modal-name" type="text" placeholder="\u9884\u8BBE\u540D\u79F0" autocomplete="off" style="height:28px;padding:0 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;">
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:var(--tr-placeholder,#858585);">\u641C\u7D22\u6587\u672C</label>
      <textarea id="tr-modal-find" placeholder="\u641C\u7D22\u6587\u672C" rows="2" autocomplete="off" spellcheck="false" style="padding:4px 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;resize:vertical;font-family:inherit;line-height:1.4;min-height:28px;box-sizing:border-box;"></textarea>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:var(--tr-placeholder,#858585);">\u66FF\u6362\u6587\u672C\uFF08\u53EF\u4E3A\u7A7A\uFF09</label>
      <textarea id="tr-modal-replace" placeholder="\u66FF\u6362\u6587\u672C\uFF08\u53EF\u4E3A\u7A7A\uFF09" rows="2" autocomplete="off" spellcheck="false" style="padding:4px 8px;font-size:13px;border-radius:2px;background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);outline:none;resize:vertical;font-family:inherit;line-height:1.4;min-height:28px;box-sizing:border-box;"></textarea>
    </div>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:4px;">
      <button id="tr-modal-submit" style="height:28px;padding:0 16px;font-size:12px;cursor:pointer;background:var(--tr-accent,#0e639c);border:none;color:var(--tr-accent-text,#fff);border-radius:2px;">\u63D0\u4EA4</button>
      <button id="tr-modal-submit-next" style="height:28px;padding:0 12px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u63D0\u4EA4\u5E76\u7EE7\u7EED</button>
    </div>
  `;
  container.appendChild(presetModal);
  const modalTitle = presetModal.querySelector("#tr-modal-title");
  const modalName = presetModal.querySelector("#tr-modal-name");
  const modalFind = presetModal.querySelector("#tr-modal-find");
  const modalReplace = presetModal.querySelector("#tr-modal-replace");
  _modalState = {
    modal: presetModal,
    modalTitle,
    modalName,
    modalFind,
    modalReplace,
    mode: "add",
    editingPresetId: null
  };
  modalFind.addEventListener("input", () => {
    const text = modalFind.value.trim();
    modalName.placeholder = text || "\u9884\u8BBE\u540D\u79F0\uFF08\u4E3A\u7A7A\u53D6\u641C\u7D22\u6587\u672C\uFF09";
  });
  presetModal.querySelector("#tr-modal-close").addEventListener("click", closeModal);
  presetModal.querySelector("#tr-modal-submit").addEventListener("click", () => submitModal(false));
  presetModal.querySelector("#tr-modal-submit-next").addEventListener("click", () => submitModal(true));
  historyPanel.querySelectorAll(".tr-history-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      historyPanel.querySelectorAll(".tr-history-tab").forEach((t) => {
        t.style.color = "var(--tr-placeholder,#858585)";
        t.style.borderBottomColor = "transparent";
      });
      tab.style.color = "var(--tr-text,#ccc)";
      tab.style.borderBottomColor = "var(--tr-accent,#0e639c)";
      const historyList = historyPanel.querySelector("#tr-history-list");
      const presetsContainer = historyPanel.querySelector("#tr-presets-container");
      if (historyList) historyList.style.display = tabName === "history" ? "" : "none";
      if (presetsContainer) presetsContainer.style.display = tabName === "presets" ? "flex" : "none";
      if (tabName === "history") loadHistoryItemsForPanel(historyPanel);
      if (tabName === "presets") {
        loadPresetItemsForPanel(historyPanel);
        bindPresetEventsForPanel(historyPanel);
      }
    });
  });
  const THEME_MODES = ["auto", "light", "dark", "custom"];
  const THEME_ICONS = { auto: "\u{1F504}", light: "\u2600\uFE0F", dark: "\u{1F319}", custom: "\u{1F3A8}" };
  let currentThemeMode = "auto";
  const themeBtn = replaceRow.querySelector("#tr-theme-btn");
  function openCustomPanel() {
    customPanel.style.display = "flex";
    loadAndApplyCustomColors();
    renderAllPresetsInCustomPanel(customPanel);
  }
  function closeCustomPanel() {
    customPanel.style.display = "none";
  }
  async function loadAndApplyCustomColors() {
    try {
      const config = await getTheme();
      const host = document.getElementById("text-replacer-host");
      if (config.custom && host) {
        const pc = config.custom.panelBg || "#252526";
        const sc = config.custom.searchHighlight || "#ffd700";
        const pr = config.custom.previewHighlight || "#00ff00";
        applyCustomColors(pc, sc, pr, host);
        const pi = customPanel.querySelector("#tr-color-panel");
        const si = customPanel.querySelector("#tr-color-search");
        const vi = customPanel.querySelector("#tr-color-preview");
        if (pi) {
          pi.value = pc;
          const hexEl = customPanel.querySelector("#tr-color-panel-hex");
          if (hexEl) hexEl.textContent = pc;
        }
        if (si) {
          si.value = sc;
          const hexEl = customPanel.querySelector("#tr-color-search-hex");
          if (hexEl) hexEl.textContent = sc;
        }
        if (vi) {
          vi.value = pr;
          const hexEl = customPanel.querySelector("#tr-color-preview-hex");
          if (hexEl) hexEl.textContent = pr;
        }
      }
    } catch (_) {
    }
  }
  class ThemeCycler {
    constructor() {
      this.modes = THEME_MODES;
      this.currentIdx = 0;
      this.load();
    }
    async load() {
      const config = await getTheme();
      this.currentIdx = this.modes.indexOf(config.mode || "auto");
      if (this.currentIdx < 0) this.currentIdx = 0;
      currentThemeMode = this.modes[this.currentIdx];
      const host = document.getElementById("text-replacer-host");
      if (config.custom) {
        await loadAndApplyCustomColors();
        if (host) {
          applyCustomColors(config.custom.panelBg || "#252526", config.custom.searchHighlight || "#ffd700", config.custom.previewHighlight || "#00ff00", host);
        }
      } else if (host) {
        applyTheme(currentThemeMode, host);
      }
      this.updateUI();
    }
    next() {
      const prevMode = this.modes[this.currentIdx];
      if (prevMode === "custom" && customPanel.style.display !== "flex") {
        console.log("[Theme] custom was hidden \u2192 re-showing panel");
        loadAndApplyCustomColors();
        openCustomPanel();
        this.updateUI();
        return;
      }
      this.currentIdx = (this.currentIdx + 1) % this.modes.length;
      const mode = this.modes[this.currentIdx];
      console.log("[Theme] next \u2192", mode, "| customPanel visible:", customPanel.style.display === "flex");
      if (mode === "custom") {
        if (customPanel.style.display === "flex") {
          console.log("[Theme] custom panel visible \u2192 closing + skip to auto");
          closeCustomPanel();
          this.currentIdx = (this.currentIdx + 1) % this.modes.length;
          const nextMode = this.modes[this.currentIdx];
          currentThemeMode = nextMode;
          const host = document.getElementById("text-replacer-host");
          applyTheme(nextMode, host);
        } else {
          console.log("[Theme] custom panel hidden \u2192 showing");
          currentThemeMode = mode;
          loadAndApplyCustomColors();
          openCustomPanel();
        }
      } else {
        currentThemeMode = mode;
        const host = document.getElementById("text-replacer-host");
        applyTheme(mode, host);
        closeCustomPanel();
      }
      this.updateUI();
    }
    updateUI() {
      const mode = this.modes[this.currentIdx];
      themeBtn.textContent = THEME_ICONS[mode];
      themeBtn.title = `\u4E3B\u9898: ${mode}`;
    }
  }
  const themeCycler = new ThemeCycler();
  themeBtn.addEventListener("click", () => themeCycler.next());
  const closeBtn = customPanel.querySelector("#tr-custom-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closeCustomPanel();
    });
  }
  ["tr-color-panel", "tr-color-search", "tr-color-preview"].forEach((id) => {
    const el = customPanel.querySelector(`#${id}`);
    const hexEl = customPanel.querySelector(`#${id}-hex`);
    if (el) {
      el.addEventListener("input", () => {
        var _a, _b, _c;
        const host = document.getElementById("text-replacer-host");
        if (!host) return;
        const panelColor = ((_a = customPanel.querySelector("#tr-color-panel")) == null ? void 0 : _a.value) || "#252526";
        const searchColor = ((_b = customPanel.querySelector("#tr-color-search")) == null ? void 0 : _b.value) || "#ffd700";
        const previewColor = ((_c = customPanel.querySelector("#tr-color-preview")) == null ? void 0 : _c.value) || "#00ff00";
        applyCustomColors(panelColor, searchColor, previewColor, host);
        saveTheme({ mode: "custom", custom: { panelBg: panelColor, searchHighlight: searchColor, previewHighlight: previewColor } });
        if (hexEl) hexEl.textContent = el.value;
      });
    }
  });
  customPanel.querySelectorAll(".tr-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const presetName = btn.dataset.preset;
      const preset = { monokai: { panelBg: "#272822", searchHighlight: "#a6e22e", previewHighlight: "#f92672" }, nord: { panelBg: "#2e3440", searchHighlight: "#88c0d0", previewHighlight: "#a3be8c" }, "solarized-dark": { panelBg: "#002b36", searchHighlight: "#268bd2", previewHighlight: "#b58900" }, "solarized-light": { panelBg: "#fdf6e3", searchHighlight: "#268bd2", previewHighlight: "#cb4b16" }, "one-dark": { panelBg: "#282c34", searchHighlight: "#e5c07b", previewHighlight: "#c678dd" } }[presetName];
      if (!preset) return;
      const host = document.getElementById("text-replacer-host");
      if (!host) return;
      const panelPicker = customPanel.querySelector("#tr-color-panel");
      const searchPicker = customPanel.querySelector("#tr-color-search");
      const previewPicker = customPanel.querySelector("#tr-color-preview");
      if (panelPicker) panelPicker.value = preset.panelBg;
      if (searchPicker) searchPicker.value = preset.searchHighlight;
      if (previewPicker) previewPicker.value = preset.previewHighlight;
      applyCustomColors(preset.panelBg, preset.searchHighlight, preset.previewHighlight, host);
      saveTheme({ mode: "custom", custom: { panelBg: preset.panelBg, searchHighlight: preset.searchHighlight, previewHighlight: preset.previewHighlight } });
      const hexPanel = customPanel.querySelector("#tr-color-panel-hex");
      const hexSearch = customPanel.querySelector("#tr-color-search-hex");
      const hexPreview = customPanel.querySelector("#tr-color-preview-hex");
      if (hexPanel) hexPanel.textContent = preset.panelBg;
      if (hexSearch) hexSearch.textContent = preset.searchHighlight;
      if (hexPreview) hexPreview.textContent = preset.previewHighlight;
    });
  });
  const saveColorPresetBtn = customPanel.querySelector("#tr-preset-save-color-btn");
  if (saveColorPresetBtn) {
    saveColorPresetBtn.addEventListener("click", async () => {
      var _a, _b, _c;
      const pc = ((_a = customPanel.querySelector("#tr-color-panel")) == null ? void 0 : _a.value) || "#252526";
      const sc = ((_b = customPanel.querySelector("#tr-color-search")) == null ? void 0 : _b.value) || "#ffd700";
      const pr = ((_c = customPanel.querySelector("#tr-color-preview")) == null ? void 0 : _c.value) || "#00ff00";
      const name = await showPrompt("\u9884\u8BBE\u540D\u79F0:", `\u81EA\u5B9A\u4E49 ${pc}`);
      if (name) {
        try {
          await savePreset(name, `__color_preset__${JSON.stringify({ panelBg: pc, searchHighlight: sc, previewHighlight: pr })}`, "", {});
          showToast(`${name} \u4FDD\u5B58\u6210\u529F`);
          await renderAllPresetsInCustomPanel(customPanel);
          if (_historyPanel) {
            const presetsContainer = _historyPanel.querySelector("#tr-presets-container");
            if (presetsContainer && presetsContainer.style.display !== "none") {
              loadPresetItemsForPanel(_historyPanel);
            }
          }
        } catch (err) {
          showToast("\u4FDD\u5B58\u5931\u8D25: " + err.message);
        }
      }
    });
  }
  const batchDelColorBtn = customPanel.querySelector("#tr-preset-batch-del-color-btn");
  if (batchDelColorBtn) {
    let colorBatchMode = false;
    let colorSelectedIds = /* @__PURE__ */ new Set();
    const exitColorBatchMode = async () => {
      colorBatchMode = false;
      colorSelectedIds.clear();
      batchDelColorBtn.textContent = "\u{1F5D1}";
      batchDelColorBtn.title = "\u6279\u91CF\u5220\u9664\u9884\u8BBE";
      await renderAllPresetsInCustomPanel(customPanel);
    };
    batchDelColorBtn.addEventListener("click", async () => {
      if (!colorBatchMode) {
        colorBatchMode = true;
        colorSelectedIds.clear();
        batchDelColorBtn.textContent = "\u2713";
        batchDelColorBtn.title = "\u786E\u8BA4\u5220\u9664";
        await loadColorPresetsForBatch(customPanel, true, colorSelectedIds);
      } else {
        if (colorSelectedIds.size === 0) {
          await exitColorBatchMode();
          return;
        }
        const ok = await showConfirm(`\u786E\u8BA4\u5220\u9664 ${colorSelectedIds.size} \u6761\u989C\u8272\u9884\u8BBE\uFF1F`);
        if (!ok) {
          await exitColorBatchMode();
          return;
        }
        for (const id of colorSelectedIds) {
          try {
            await deletePreset(id);
          } catch (_) {
          }
        }
        await exitColorBatchMode();
        if (_historyPanel) {
          const presetsContainer = _historyPanel.querySelector("#tr-presets-container");
          if (presetsContainer && presetsContainer.style.display !== "none") {
            loadPresetItemsForPanel(_historyPanel);
          }
        }
        showToast("\u5220\u9664\u6210\u529F");
      }
    });
  }
  const historyBtn = replaceRow.querySelector("#tr-history-btn");
  historyBtn.addEventListener("click", () => {
    if (historyPanel.style.display === "flex") {
      historyPanel.style.display = "none";
    } else {
      historyPanel.style.display = "flex";
      const historyTab = historyPanel.querySelector('[data-tab="history"]');
      if (historyTab) historyTab.click();
    }
  });
  const historyCloseBtn = historyPanel.querySelector("#tr-history-close");
  if (historyCloseBtn) {
    historyCloseBtn.addEventListener("click", () => {
      historyPanel.style.display = "none";
    });
  }
  const replaceOneBtn = replaceRow.querySelector(`#${UIConstants.REPLACE_ONE_BTN_ID}`);
  const replaceAllBtn = replaceRow.querySelector(`#${UIConstants.REPLACE_ALL_BTN_ID}`);
  const replaceInput = replaceRow.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
  const previewBtn = replaceRow.querySelector("#tr-preview-btn");
  const applyPreviewBtn = replaceRow.querySelector("#tr-apply-preview-btn");
  previewBtn.style.display = "none";
  applyPreviewBtn.style.display = "none";
  if (replaceInput) {
    replaceInput.style.cssText = "width:100%;padding:4px 8px;font-size:13px;color:var(--tr-input-text,#cccccc);background:var(--tr-input-bg,#3c3c3c);border:1px solid var(--tr-input-bg,#3c3c3c);border-radius:2px;outline:none;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.4;min-height:22px;";
  }
  let hasJumpedToCurrent = false;
  const unsubMatches = proxy.on("matches:updated", () => {
    hasJumpedToCurrent = false;
  });
  replaceOneBtn.addEventListener("click", async () => {
    const isMatchVisible = await proxy.command("isCurrentMatchInViewport");
    if (!isMatchVisible && !hasJumpedToCurrent) {
      hasJumpedToCurrent = true;
      const focusResult = await proxy.command("focusCurrentMatch");
      if (focusResult) {
        const panel = getPanelElement2();
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
    hasJumpedToCurrent = false;
    const result = await proxy.command("replaceOne", { text: replaceInput.value });
    if (result) {
      const focusResult = await proxy.command("focusCurrentMatch");
      const panel = getPanelElement2();
      if (panel) {
        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl && focusResult) {
          matchCountEl.textContent = `${focusResult.current} / ${focusResult.count}`;
        }
        if (focusResult) {
          proxy.emit("matches:updated", focusResult);
        }
      }
      showStatus(replaceRow, result);
    }
    setTimeout(() => replaceInput.focus(), 150);
  });
  replaceAllBtn.addEventListener("click", async () => {
    const panel = getPanelElement2();
    const findInput = panel ? panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`) : null;
    const findText = findInput ? findInput.value : "";
    const replaceText = replaceInput.value;
    const result = await proxy.command("replaceAll", { findText, replaceText, options: { ...searchOptions3 } });
    showStatus(replaceRow, result);
    const matchCountEl = panel ? panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`) : null;
    if (matchCountEl) matchCountEl.textContent = "";
    updateButtonStates(replaceRow, false);
    if (previewBtn) previewBtn.style.display = "none";
    if (applyPreviewBtn) applyPreviewBtn.style.display = "none";
  });
  replaceInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const result = await proxy.command("replaceOne", { text: replaceInput.value });
      if (result) {
        const panel = getPanelElement2();
        if (panel) {
          const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
          if (findInput && findInput.value.trim()) {
            await proxy.command("search", { text: findInput.value, options: searchOptions3, shouldFocus: false });
          }
        }
        showStatus(replaceRow, result);
        await proxy.command("navigate", { direction: "next" });
      }
      setTimeout(() => {
        if (document.activeElement !== replaceInput) {
          replaceInput.focus();
        }
      }, 150);
    }
  });
  replaceInput.addEventListener("blur", async () => {
    const panel = getPanelElement2();
    const findInput = panel ? panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`) : null;
    const findText = findInput ? findInput.value : "";
    const replaceText = replaceInput.value;
    if (findText.trim() || replaceText.trim()) {
      await saveHistory(findText, replaceText, { ...searchOptions3 }).catch(() => {
      });
      proxy.emit("history:updated");
    }
  });
  previewBtn.addEventListener("click", async () => {
    if (isPreviewMode) {
      await exitPreview(replaceRow, previewBtn, applyPreviewBtn);
    } else {
      await enterPreview(replaceRow, previewBtn, applyPreviewBtn, searchOptions3);
    }
  });
  applyPreviewBtn.addEventListener("click", async () => {
    const replaceText = replaceInput.value;
    const result = await proxy.command("applyPreviewedReplacements", { replaceText });
    showStatus(replaceRow, { status: "success", message: `\u5DF2\u66FF\u6362 ${result.replaced} \u5904` });
    const panelForHistory = getPanelElement2();
    const findInputForHistory = panelForHistory ? panelForHistory.querySelector(`#${UIConstants.FIND_INPUT_ID}`) : null;
    const findText = findInputForHistory ? findInputForHistory.value : "";
    await saveHistory(findText, replaceText, { ...searchOptions3 }).catch(() => {
    });
    proxy.emit("history:updated");
    isPreviewMode = false;
    previewBtn.textContent = "\u{1F441}";
    previewBtn.title = "\u9884\u89C8\u66FF\u6362";
    applyPreviewBtn.style.display = "none";
    applyPreviewBtn.disabled = true;
    const panel = getPanelElement2();
    if (panel) {
      const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
      if (findInput && findInput.value.trim()) {
        const result2 = await proxy.command("search", { text: findInput.value, options: searchOptions3, shouldFocus: false });
        if (result2) {
          proxy.emit("matches:updated", result2);
          const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
          if (matchCountEl) {
            if (result2.count === 0) {
              matchCountEl.textContent = result2.message || "\u65E0\u7ED3\u679C";
            } else {
              matchCountEl.textContent = `${result2.current} / ${result2.count}`;
            }
          }
        }
      }
    }
  });
  proxy.on("matches:updated", (data) => {
    const hasMatches = data && data.count > 0;
    updateButtonStates(replaceRow, hasMatches);
    if (previewBtn) previewBtn.style.display = hasMatches ? "inline-flex" : "none";
    if (!isPreviewMode && applyPreviewBtn) {
      applyPreviewBtn.style.display = "none";
    }
  });
  proxy.on("preview:stateUpdated", (data) => {
    if (applyPreviewBtn && isPreviewMode) {
      applyPreviewBtn.disabled = data.selected === 0;
    }
  });
  proxy.on("history:updated", () => {
    if (_historyPanel && _historyPanel.style.display === "flex") {
      const historyList = _historyPanel.querySelector("#tr-history-list");
      if (historyList && historyList.style.display !== "none") {
        loadHistoryItemsForPanel(_historyPanel);
      }
    }
  });
}
async function enterPreview(replaceRow, previewBtn, applyPreviewBtn, searchOptions3) {
  const panel = replaceRow.closest(".tr-panel");
  if (!panel) return;
  const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
  const findText = findInput ? findInput.value : "";
  if (!findText || !findText.trim()) return;
  const result = await proxy.command("enterPreview", { text: findText, options: searchOptions3 });
  if (result && result.count > 0) {
    isPreviewMode = true;
    previewBtn.textContent = "\u53D6\u6D88\u9884\u89C8";
    previewBtn.title = "\u53D6\u6D88\u9884\u89C8";
    applyPreviewBtn.style.display = "inline-flex";
    applyPreviewBtn.disabled = true;
    const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
    if (matchCountEl) matchCountEl.textContent = `\u9884\u89C8: 0/${result.count} \u9009\u4E2D`;
    bindOverlayEvents(replaceRow, panel, searchOptions3);
  }
}
function bindOverlayEvents(replaceRow, panel, searchOptions3) {
  unbindOverlayEvents();
  let clickTimer = null;
  overlayClickHandler = async (e) => {
    let target = e.target;
    if (target.nodeType === 3) {
      target = target.parentElement;
    }
    if (!target || !target.classList) return;
    if (!target.classList.contains("tr-highlight-match") && !target.classList.contains("tr-preview-selected")) {
      return;
    }
    const overlay = target.closest(".tr-highlight-overlay");
    const isContentEditable = !overlay && target.closest('[contenteditable="true"]');
    if (!overlay && !isContentEditable) return;
    if (isContentEditable) {
      e.preventDefault();
      e.stopPropagation();
    }
    const previewIndex = parseInt(target.dataset.previewIndex, 10);
    if (isNaN(previewIndex)) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      const replaceInput = replaceRow.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
      const replaceText = replaceInput ? replaceInput.value : "";
      const dblResult = await proxy.command("executeDoubleReplace", { index: previewIndex, replaceText });
      if (dblResult && dblResult.replaced) {
        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl) {
          const state = await proxy.command("getPreviewState");
          matchCountEl.textContent = `\u9884\u89C8: ${state.selected}/${state.total} \u9009\u4E2D`;
        }
        const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
        const findText = findInput ? findInput.value : "";
        await saveHistory(findText, replaceText, { ...searchOptions3 }).catch(() => {
        });
        proxy.emit("history:updated");
        if (dblResult.remaining === 0) {
          const previewBtn = replaceRow.querySelector("#tr-preview-btn");
          const applyPreviewBtn = replaceRow.querySelector("#tr-apply-preview-btn");
          await exitPreview(replaceRow, previewBtn, applyPreviewBtn);
        }
      }
      return;
    }
    clickTimer = setTimeout(async () => {
      clickTimer = null;
      const result = await proxy.command("togglePreviewMatch", { index: previewIndex });
      if (result) {
        proxy.emit("preview:stateUpdated", result);
        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl) {
          const state = await proxy.command("getPreviewState");
          matchCountEl.textContent = `\u9884\u89C8: ${state.selected}/${state.total} \u9009\u4E2D`;
        }
      }
    }, 300);
  };
  document.addEventListener("click", overlayClickHandler, true);
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((iframe) => {
    try {
      if (iframe.contentDocument) {
        iframe.contentDocument.addEventListener("click", overlayClickHandler, true);
      }
    } catch (_) {
    }
  });
}
function unbindOverlayEvents() {
  if (overlayClickHandler) {
    document.removeEventListener("click", overlayClickHandler, true);
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.removeEventListener("click", overlayClickHandler, true);
        }
      } catch (_) {
      }
    });
    overlayClickHandler = null;
  }
}
async function exitPreview(replaceRow, previewBtn, applyPreviewBtn) {
  unbindOverlayEvents();
  await proxy.command("exitPreview");
  isPreviewMode = false;
  previewBtn.textContent = "\u{1F441}";
  previewBtn.title = "\u9884\u89C8\u66FF\u6362";
  applyPreviewBtn.style.display = "none";
  applyPreviewBtn.disabled = true;
  const panel = replaceRow.closest(".tr-panel");
  if (panel) {
    const findInput = panel.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
    if (findInput && findInput.value.trim()) {
      const searchOptions3 = getSearchOptionsFromPanel(panel);
      const result = await proxy.command("search", { text: findInput.value, options: searchOptions3, shouldFocus: false });
      if (result) {
        proxy.emit("matches:updated", result);
        const matchCountEl = panel.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
        if (matchCountEl) {
          if (result.count === 0) {
            matchCountEl.textContent = result.message || "\u65E0\u7ED3\u679C";
          } else {
            matchCountEl.textContent = `${result.current} / ${result.count}`;
          }
        }
      }
    }
  }
}
function getSearchOptionsFromPanel(panel) {
  const matchCaseBtn = panel.querySelector(`#${UIConstants.MATCH_CASE_ID}`);
  const matchWordBtn = panel.querySelector(`#${UIConstants.MATCH_WORD_ID}`);
  const useRegexBtn = panel.querySelector(`#${UIConstants.USE_REGEX_ID}`);
  return {
    matchCase: matchCaseBtn ? matchCaseBtn.classList.contains(UIConstants.ACTIVE_CLASS) : false,
    matchWord: matchWordBtn ? matchWordBtn.classList.contains(UIConstants.ACTIVE_CLASS) : false,
    useRegex: useRegexBtn ? useRegexBtn.classList.contains(UIConstants.ACTIVE_CLASS) : false
  };
}
function updateButtonStates(row, hasMatches) {
  const replaceOneBtn = row.querySelector(`#${UIConstants.REPLACE_ONE_BTN_ID}`);
  const replaceAllBtn = row.querySelector(`#${UIConstants.REPLACE_ALL_BTN_ID}`);
  if (replaceOneBtn) replaceOneBtn.disabled = !hasMatches;
  if (replaceAllBtn) replaceAllBtn.disabled = !hasMatches;
}
function showStatus(row, result) {
  const panel = row.closest(".tr-panel");
  if (!panel) return;
  let statusEl = panel.querySelector("#tr-status");
  if (!statusEl) return;
  statusEl.textContent = result.message || "";
  statusEl.className = "tr-status tr-show";
  if (result.status === "success") {
    statusEl.classList.add("tr-success");
  } else if (result.status === "no_match" || result.status === "empty_find") {
    statusEl.classList.add("tr-warning");
  } else {
    statusEl.classList.add("tr-error");
  }
  setTimeout(() => {
    statusEl.classList.remove("tr-show");
  }, 2e3);
}
async function loadColorPresetsForBatch(customPanel, batchMode, selectedIds) {
  const presetBtnsContainer = customPanel.querySelector("#tr-custom-preset-btns");
  if (!presetBtnsContainer) return;
  try {
    const allPresets = await getPresets();
    const colorPresets = allPresets.filter((p) => p.findText && p.findText.startsWith("__color_preset__"));
    if (batchMode) {
      presetBtnsContainer.innerHTML = "";
      presetBtnsContainer.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:140px;overflow-y:auto;";
      if (colorPresets.length === 0) {
        presetBtnsContainer.innerHTML = '<div style="font-size:11px;color:var(--tr-placeholder,#858585);padding:4px 0;">\u6682\u65E0\u989C\u8272\u9884\u8BBE</div>';
        return;
      }
      for (const preset of colorPresets) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px;color:var(--tr-text,#ccc);";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.style.cssText = "flex-shrink:0;";
        cb.checked = selectedIds.has(preset.id);
        cb.addEventListener("change", () => {
          if (cb.checked) selectedIds.add(preset.id);
          else selectedIds.delete(preset.id);
        });
        row.appendChild(cb);
        try {
          const colorData = JSON.parse(preset.findText.replace("__color_preset__", ""));
          const swatch = document.createElement("span");
          swatch.style.cssText = `display:inline-block;width:14px;height:14px;border-radius:2px;background:${colorData.panelBg || "#252526"};border:1px solid var(--tr-border,#454545);flex-shrink:0;`;
          row.appendChild(swatch);
        } catch (_) {
        }
        const nameSpan = document.createElement("span");
        nameSpan.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        nameSpan.textContent = preset.name;
        row.appendChild(nameSpan);
        presetBtnsContainer.appendChild(row);
      }
    } else {
      await renderAllPresetsInCustomPanel(customPanel);
    }
  } catch (_) {
  }
}
function reBindPresetButtons(customPanel) {
  customPanel.querySelectorAll(".tr-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const presetName = btn.dataset.preset;
      const preset = { monokai: { panelBg: "#272822", searchHighlight: "#a6e22e", previewHighlight: "#f92672" }, nord: { panelBg: "#2e3440", searchHighlight: "#88c0d0", previewHighlight: "#a3be8c" }, "solarized-dark": { panelBg: "#002b36", searchHighlight: "#268bd2", previewHighlight: "#b58900" }, "solarized-light": { panelBg: "#fdf6e3", searchHighlight: "#268bd2", previewHighlight: "#cb4b16" }, "one-dark": { panelBg: "#282c34", searchHighlight: "#e5c07b", previewHighlight: "#c678dd" } }[presetName];
      if (!preset) return;
      const host = document.getElementById("text-replacer-host");
      if (!host) return;
      const panelPicker = customPanel.querySelector("#tr-color-panel");
      const searchPicker = customPanel.querySelector("#tr-color-search");
      const previewPicker = customPanel.querySelector("#tr-color-preview");
      if (panelPicker) panelPicker.value = preset.panelBg;
      if (searchPicker) searchPicker.value = preset.searchHighlight;
      if (previewPicker) previewPicker.value = preset.previewHighlight;
      applyCustomColors(preset.panelBg, preset.searchHighlight, preset.previewHighlight, host);
      saveTheme({ mode: "custom", custom: { panelBg: preset.panelBg, searchHighlight: preset.searchHighlight, previewHighlight: preset.previewHighlight } });
      const hexPanel = customPanel.querySelector("#tr-color-panel-hex");
      const hexSearch = customPanel.querySelector("#tr-color-search-hex");
      const hexPreview = customPanel.querySelector("#tr-color-preview-hex");
      if (hexPanel) hexPanel.textContent = preset.panelBg;
      if (hexSearch) hexSearch.textContent = preset.searchHighlight;
      if (hexPreview) hexPreview.textContent = preset.previewHighlight;
    });
  });
}
function bindUserColorPresetButton(btn, panelBg, searchHighlight, previewHighlight, customPanel) {
  btn.addEventListener("click", () => {
    const host = document.getElementById("text-replacer-host");
    if (!host) return;
    const panelPicker = customPanel.querySelector("#tr-color-panel");
    const searchPicker = customPanel.querySelector("#tr-color-search");
    const previewPicker = customPanel.querySelector("#tr-color-preview");
    if (panelPicker) panelPicker.value = panelBg;
    if (searchPicker) searchPicker.value = searchHighlight;
    if (previewPicker) previewPicker.value = previewHighlight;
    applyCustomColors(panelBg, searchHighlight, previewHighlight, host);
    saveTheme({ mode: "custom", custom: { panelBg, searchHighlight, previewHighlight } });
    const hp = customPanel.querySelector("#tr-color-panel-hex");
    const hs = customPanel.querySelector("#tr-color-search-hex");
    const hv = customPanel.querySelector("#tr-color-preview-hex");
    if (hp) hp.textContent = panelBg;
    if (hs) hs.textContent = searchHighlight;
    if (hv) hv.textContent = previewHighlight;
  });
}
async function renderAllPresetsInCustomPanel(customPanel) {
  const presetBtnsContainer = customPanel.querySelector("#tr-custom-preset-btns");
  if (!presetBtnsContainer) return;
  presetBtnsContainer.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  let html = `
    <button class="tr-preset-btn" data-preset="monokai" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Monokai</button>
    <button class="tr-preset-btn" data-preset="nord" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Nord</button>
    <button class="tr-preset-btn" data-preset="solarized-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Dark</button>
    <button class="tr-preset-btn" data-preset="solarized-light" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">Solarized Light</button>
    <button class="tr-preset-btn" data-preset="one-dark" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">One Dark</button>
  `;
  try {
    const allPresets = await getPresets();
    const colorPresets = allPresets.filter((p) => p.findText && p.findText.startsWith("__color_preset__"));
    for (const cp of colorPresets) {
      try {
        JSON.parse(cp.findText.replace("__color_preset__", ""));
        html += `<button class="tr-preset-btn tr-user-preset" data-user-preset-id="${escapeHtml(cp.id)}" style="height:24px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--tr-btn-hover,#3c3c3c);border:1px solid var(--tr-border,#454545);color:var(--tr-text,#ccc);border-radius:2px;">\u{1F58C} ${escapeHtml(cp.name)}</button>`;
      } catch (_) {
      }
    }
  } catch (_) {
  }
  presetBtnsContainer.innerHTML = html;
  reBindPresetButtons(customPanel);
  bindUserColorPresetEvents(customPanel);
}
function bindUserColorPresetEvents(customPanel) {
  customPanel.querySelectorAll(".tr-user-preset").forEach((btn) => {
    const presetId = btn.dataset.userPresetId;
    if (!presetId) return;
    getPresets().then((allPresets) => {
      const found = allPresets.find((p) => p.id === presetId);
      if (!found || !found.findText) return;
      try {
        const cd = JSON.parse(found.findText.replace("__color_preset__", ""));
        bindUserColorPresetButton(btn, cd.panelBg, cd.searchHighlight, cd.previewHighlight, customPanel);
      } catch (_) {
      }
    });
  });
}
function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "\u2026" : text;
}
async function loadHistoryItemsForPanel(panel) {
  const listEl = panel.querySelector("#tr-history-list");
  if (!listEl) return;
  try {
    const history = await getHistory();
    listEl.innerHTML = "";
    if (history.length === 0) {
      listEl.innerHTML = '<div style="padding:5px 0;font-size:11px;color:var(--tr-placeholder,#858585);">\u6682\u65E0\u5386\u53F2\u8BB0\u5F55</div>';
      return;
    }
    for (const entry of history) {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:5px 0;min-height:24px;font-size:12px;cursor:pointer;color:var(--tr-text,#ccc);word-break:break-all;overflow-wrap:break-word;";
      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--tr-btn-hover,#3c3c3c)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "";
      });
      const span = document.createElement("span");
      span.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      span.textContent = `${truncate(entry.findText, 20)} \u2192 ${truncate(entry.replaceText, 20)}`;
      span.title = `\u67E5\u627E: ${entry.findText}
\u66FF\u6362: ${entry.replaceText}`;
      span.addEventListener("click", () => {
        const panelEl = _getPanelElement();
        if (panelEl) {
          const fi = panelEl.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
          const ri = panelEl.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
          if (fi) {
            fi.value = entry.findText || "";
            fi.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (ri) ri.value = entry.replaceText || "";
        }
        const tr = panelEl == null ? void 0 : panelEl.querySelector("#tr-replace-row");
        if (tr) tr.classList.add(UIConstants.REPLACE_VISIBLE_CLASS);
      });
      const favBtn = document.createElement("button");
      favBtn.textContent = "\u2B50";
      favBtn.title = "\u4FDD\u5B58\u4E3A\u9884\u8BBE";
      favBtn.style.cssText = "background:transparent;border:none;cursor:pointer;font-size:14px;padding:0 4px;";
      favBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const defaultName = entry.findText || "\u672A\u547D\u540D";
        try {
          await savePreset(defaultName, entry.findText || "", entry.replaceText || "", entry.options || {});
          const msg = entry.replaceText ? `${entry.findText}\u2192${entry.replaceText} \u6536\u85CF\u6210\u529F` : `${entry.findText} \u6536\u85CF\u6210\u529F`;
          showToast(msg);
          loadPresetItemsForPanel(panel);
        } catch (err) {
          showToast("\u6536\u85CF\u5931\u8D25: " + err.message);
        }
      });
      const delBtn = document.createElement("button");
      delBtn.textContent = "\u{1F5D1}";
      delBtn.title = "\u5220\u9664";
      delBtn.style.cssText = "background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 4px;";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteHistoryItem(entry.id);
        loadHistoryItemsForPanel(panel);
      });
      item.appendChild(span);
      item.appendChild(favBtn);
      item.appendChild(delBtn);
      listEl.appendChild(item);
    }
  } catch (_) {
  }
}
async function loadPresetItemsForPanel(panel, batchModeOverride) {
  var _a, _b;
  const listEl = panel.querySelector("#tr-preset-list");
  if (!listEl) return;
  const batchMode = batchModeOverride || (((_a = window._trBatchState) == null ? void 0 : _a.batchMode) || false);
  try {
    let presets = await getPresets();
    const searchTerm = (((_b = panel.querySelector("#tr-preset-search-input")) == null ? void 0 : _b.value) || "").toLowerCase();
    if (searchTerm) presets = presets.filter((p) => (p.name || "").toLowerCase().includes(searchTerm));
    listEl.innerHTML = "";
    if (presets.length === 0) {
      listEl.innerHTML = `<div style="padding:5px 0;font-size:11px;color:var(--tr-placeholder,#858585);">${searchTerm ? "\u65E0\u5339\u914D" : "\u6682\u65E0\u9884\u8BBE"}</div>`;
      return;
    }
    for (const preset of presets) {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:5px 0;min-height:24px;font-size:12px;color:var(--tr-text,#ccc);word-break:break-all;overflow-wrap:break-word;";
      if (batchMode) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.style.cssText = "margin-right:8px;flex-shrink:0;";
        cb.addEventListener("change", () => {
          if (cb.checked) window._trBatchState.selectedIds.add(preset.id);
          else window._trBatchState.selectedIds.delete(preset.id);
          window._trBatchState.updateBatchBtn();
        });
        item.appendChild(cb);
      }
      const span = document.createElement("span");
      span.style.cssText = "flex:1;cursor:pointer;overflow:hidden;";
      span.innerHTML = `<div style="font-weight:500;">${escapeHtml(preset.name)}</div><div style="font-size:10px;color:var(--tr-placeholder,#858585);">${escapeHtml(preset.findText || "(\u7A7A)")}${preset.replaceText ? " \u2192 " + escapeHtml(preset.replaceText) : ""}</div>`;
      span.addEventListener("click", () => {
        if (batchMode) return;
        const panelEl = _getPanelElement();
        if (panelEl) {
          const fi = panelEl.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
          const ri = panelEl.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
          if (fi) {
            fi.value = preset.findText || "";
            fi.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (ri) ri.value = preset.replaceText || "";
        }
      });
      item.appendChild(span);
      if (!batchMode) {
        const editBtn = document.createElement("button");
        editBtn.textContent = "\u270F\uFE0F";
        editBtn.title = "\u4FEE\u6539";
        editBtn.style.cssText = "background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 4px;flex-shrink:0;";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openModal("edit", preset);
        });
        item.appendChild(editBtn);
        const delBtn = document.createElement("button");
        delBtn.textContent = "\u{1F5D1}";
        delBtn.title = "\u5220\u9664";
        delBtn.style.cssText = "background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 4px;flex-shrink:0;";
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await showConfirm("\u786E\u8BA4\u5220\u9664\u8BE5\u9884\u8BBE\uFF1F");
          if (ok) {
            await deletePreset(preset.id);
            showToast("\u5220\u9664\u6210\u529F");
            loadPresetItemsForPanel(panel);
            if (_customPanel) renderAllPresetsInCustomPanel(_customPanel);
          }
        });
        item.appendChild(delBtn);
      }
      listEl.appendChild(item);
    }
  } catch (_) {
  }
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function openModal(mode, presetData = null) {
  if (!_modalState) return;
  const { modal, modalTitle, modalName, modalFind, modalReplace } = _modalState;
  const submitNextBtn = modal.querySelector("#tr-modal-submit-next");
  const submitBtn = modal.querySelector("#tr-modal-submit");
  _modalState.mode = mode;
  if (mode === "add") {
    modalTitle.textContent = "\u65B0\u589E\u9884\u8BBE";
    modalName.value = "";
    modalFind.value = "";
    modalReplace.value = "";
    modalName.placeholder = "\u9884\u8BBE\u540D\u79F0\uFF08\u4E3A\u7A7A\u53D6\u641C\u7D22\u6587\u672C\uFF09";
    _modalState.editingPresetId = null;
    if (submitNextBtn) submitNextBtn.style.display = "";
    if (submitBtn) submitBtn.textContent = "\u63D0\u4EA4";
  } else if (mode === "edit" && presetData) {
    modalTitle.textContent = "\u4FEE\u6539\u9884\u8BBE";
    modalName.value = presetData.name || "";
    modalFind.value = presetData.findText || "";
    modalReplace.value = presetData.replaceText || "";
    modalName.placeholder = presetData.findText || "\u9884\u8BBE\u540D\u79F0\uFF08\u4E3A\u7A7A\u53D6\u641C\u7D22\u6587\u672C\uFF09";
    _modalState.editingPresetId = presetData.id;
    if (submitNextBtn) submitNextBtn.style.display = "none";
    if (submitBtn) submitBtn.textContent = "\u4FEE\u6539";
  }
  modal.style.display = "flex";
  setTimeout(() => modalName.focus(), 50);
}
function closeModal() {
  if (_modalState) _modalState.modal.style.display = "none";
}
async function submitModal(keepOpen) {
  if (!_modalState) return;
  const { modalName, modalFind, modalReplace } = _modalState;
  const findText = modalFind.value;
  const replaceText = modalReplace.value;
  const name = modalName.value.trim() || findText.trim() || "\u672A\u547D\u540D";
  try {
    if (_modalState.mode === "edit" && _modalState.editingPresetId) {
      await updatePreset(_modalState.editingPresetId, name, findText, replaceText);
      const msg = replaceText ? `${findText}\u2192${replaceText} \u4FEE\u6539\u6210\u529F` : `${findText} \u4FEE\u6539\u6210\u529F`;
      showToast(msg);
      closeModal();
    } else {
      await savePreset(name, findText, replaceText);
      const msg = replaceText ? `${findText}\u2192${replaceText} \u65B0\u589E\u6210\u529F` : `${findText} \u65B0\u589E\u6210\u529F`;
      showToast(msg);
      if (!keepOpen) {
        closeModal();
      } else {
        modalName.value = "";
        modalFind.value = "";
        modalReplace.value = "";
        modalName.placeholder = "\u9884\u8BBE\u540D\u79F0\uFF08\u4E3A\u7A7A\u53D6\u641C\u7D22\u6587\u672C\uFF09";
        modalName.focus();
      }
    }
    loadPresetItemsForPanel(_historyPanel);
  } catch (err) {
    showToast("\u64CD\u4F5C\u5931\u8D25: " + err.message);
  }
}
function bindPresetEventsForPanel(panel) {
  const addBtn = panel.querySelector("#tr-preset-add-btn");
  const importBtn = panel.querySelector("#tr-preset-import-btn");
  const exportBtn = panel.querySelector("#tr-preset-export-btn");
  const batchDelBtn = panel.querySelector("#tr-preset-batch-del-btn");
  const fileInput = panel.querySelector("#tr-preset-file-input");
  const searchInput = panel.querySelector("#tr-preset-search-input");
  addBtn == null ? void 0 : addBtn.addEventListener("click", () => openModal("add"));
  exportBtn == null ? void 0 : exportBtn.addEventListener("click", async () => {
    const json = await exportPresets();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `text-replacer-presets-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  importBtn == null ? void 0 : importBtn.addEventListener("click", () => fileInput == null ? void 0 : fileInput.click());
  fileInput == null ? void 0 : fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await importPresets(ev.target.result);
        loadPresetItemsForPanel(panel);
        showToast("\u5BFC\u5165\u6210\u529F");
      } catch (err) {
        showToast("\u5BFC\u5165\u5931\u8D25: " + err.message);
      }
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
  searchInput == null ? void 0 : searchInput.addEventListener("input", () => loadPresetItemsForPanel(panel));
  let batchMode = false;
  let selectedIds = /* @__PURE__ */ new Set();
  const exitBatchMode = () => {
    batchMode = false;
    selectedIds.clear();
    batchDelBtn.textContent = "\u{1F5D1}";
    loadPresetItemsForPanel(panel);
    if (_customPanel) renderAllPresetsInCustomPanel(_customPanel);
  };
  batchDelBtn == null ? void 0 : batchDelBtn.addEventListener("click", async () => {
    if (!batchMode) {
      batchMode = true;
      selectedIds.clear();
      batchDelBtn.textContent = "\u2713";
      loadPresetItemsForPanel(panel, true);
    } else {
      if (selectedIds.size === 0) {
        exitBatchMode();
        return;
      }
      const ok = await showConfirm(`\u786E\u8BA4\u5220\u9664 ${selectedIds.size} \u6761\u9884\u8BBE\uFF1F`);
      if (!ok) {
        exitBatchMode();
        return;
      }
      for (const id of selectedIds) {
        await deletePreset(id);
      }
      exitBatchMode();
      showToast("\u5220\u9664\u6210\u529F");
    }
  });
  window._trBatchState = { get batchMode() {
    return batchMode;
  }, selectedIds, updateBatchBtn() {
  } };
}

// src/content/ui/panel.js
var searchOptions2 = {
  matchCase: false,
  matchWord: false,
  useRegex: false
};
var panelElement = null;
var previousActiveElement = null;
function render(shadowRoot) {
  panelElement = document.createElement("div");
  panelElement.className = "tr-panel tr-hidden";
  panelElement.id = UIConstants.PANEL_ID;
  const styleEl = document.createElement("style");
  styleEl.textContent = panel_default;
  shadowRoot.appendChild(styleEl);
  renderSearchBar(panelElement, searchOptions2, hide, toggleReplaceRow);
  renderReplaceBar(panelElement, searchOptions2, getPanelElement);
  const statusEl = document.createElement("div");
  statusEl.className = "tr-status";
  statusEl.id = "tr-status";
  panelElement.appendChild(statusEl);
  shadowRoot.appendChild(panelElement);
  const hostEl = shadowRoot.host;
  initTheme(hostEl);
  panelElement.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
      return;
    }
  });
  return panelElement;
}
function show() {
  if (!panelElement) return;
  previousActiveElement = document.activeElement;
  panelElement.classList.remove(UIConstants.HIDDEN_CLASS);
  proxy.command("startListening");
  const findInput = panelElement.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
  if (findInput) {
    setTimeout(() => findInput.focus(), 100);
  }
  proxy.command("clearHighlights");
}
function hide() {
  if (!panelElement) return;
  panelElement.classList.add(UIConstants.HIDDEN_CLASS);
  proxy.command("stopListening");
  proxy.command("clearHighlights");
  const findInput = panelElement.querySelector(`#${UIConstants.FIND_INPUT_ID}`);
  const replaceInput = panelElement.querySelector(`#${UIConstants.REPLACE_INPUT_ID}`);
  const matchCount = panelElement.querySelector(`#${UIConstants.MATCH_COUNT_ID}`);
  if (findInput) findInput.value = "";
  if (replaceInput) replaceInput.value = "";
  if (matchCount) matchCount.textContent = "";
  searchOptions2.matchCase = false;
  searchOptions2.matchWord = false;
  searchOptions2.useRegex = false;
  if (previousActiveElement && typeof previousActiveElement.focus === "function") {
    try {
      previousActiveElement.focus();
    } catch (_) {
    }
  }
  previousActiveElement = null;
}
function toggleReplaceRow() {
  if (!panelElement) return;
  const replaceRow = panelElement.querySelector("#tr-replace-row");
  if (replaceRow) {
    replaceRow.classList.toggle(UIConstants.REPLACE_VISIBLE_CLASS);
    const isVisible = replaceRow.classList.contains(UIConstants.REPLACE_VISIBLE_CLASS);
    if (!isVisible) {
      const customPanel = panelElement.querySelector("#tr-custom-panel");
      if (customPanel) customPanel.style.display = "none";
      const historyPanel = panelElement.querySelector("#tr-history-panel");
      if (historyPanel) historyPanel.style.display = "none";
    }
    const toggleBtn = panelElement.querySelector("#tr-toggle-replace-btn");
    if (toggleBtn) {
      toggleBtn.innerHTML = isVisible ? "\u25C4" : "\u25BA";
    }
  }
}
function getPanelElement() {
  return panelElement;
}

// src/content/index.js
var HOST_ID = "text-replacer-host";
var hostElement = null;
function getOrCreateHost() {
  if (hostElement) return hostElement;
  hostElement = document.getElementById(HOST_ID);
  if (!hostElement) {
    hostElement = document.createElement("div");
    hostElement.id = HOST_ID;
    hostElement.style.cssText = "position:fixed;top:20px;right:20px;z-index:2147483647;";
    document.body.appendChild(hostElement);
  }
  return hostElement;
}
function ensureShadowRoot() {
  const host = getOrCreateHost();
  if (!host.shadowRoot) {
    const shadowRoot = host.attachShadow({ mode: "open" });
    render(shadowRoot);
  }
  return host;
}
var disabledTabindexElements = [];
function disableFocusTraps() {
  const traps = document.querySelectorAll('[tabindex="-1"]');
  traps.forEach((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return;
    if (el === hostElement) return;
    disabledTabindexElements.push({ el, tabindex: el.getAttribute("tabindex") });
    el.removeAttribute("tabindex");
  });
}
function restoreFocusTraps() {
  disabledTabindexElements.forEach(({ el, tabindex }) => {
    if (tabindex !== null) {
      el.setAttribute("tabindex", tabindex);
    }
  });
  disabledTabindexElements.length = 0;
}
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
      sendResponse({ success: false, error: "Unknown action" });
  }
  return true;
});
function init() {
  getOrCreateHost();
  hostElement.hidden = true;
  console.log("\u6587\u672C\u66FF\u6362\u52A9\u624B V2 \u5DF2\u52A0\u8F7D");
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
