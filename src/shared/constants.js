/**
 * 常量定义 (ESM)
 */

// 消息类型
export const MessageActions = {
  SHOW_REPLACER_PANEL: 'SHOW_REPLACER_PANEL',
  HIDE_REPLACER_PANEL: 'HIDE_REPLACER_PANEL',
  EXECUTE_REPLACE: 'EXECUTE_REPLACE',
};

// UI 相关常量
export const UIConstants = {
  PANEL_ID: 'text-replacer-panel',
  FIND_INPUT_ID: 'tr-find-input',
  REPLACE_INPUT_ID: 'tr-replace-input',
  TOGGLE_REPLACE_ID: 'tr-toggle-replace',
  CLOSE_BTN_CLASS: 'tr-close',
  MATCH_CASE_ID: 'tr-match-case',
  MATCH_WORD_ID: 'tr-match-word',
  USE_REGEX_ID: 'tr-use-regex',
  MATCH_COUNT_ID: 'tr-match-count',
  PREV_BTN_ID: 'tr-prev-btn',
  NEXT_BTN_ID: 'tr-next-btn',
  REPLACE_ONE_BTN_ID: 'tr-replace-one-btn',
  REPLACE_ALL_BTN_ID: 'tr-replace-all-btn',
  HIDDEN_CLASS: 'tr-hidden',
  ACTIVE_CLASS: 'tr-active',
  REPLACE_VISIBLE_CLASS: 'tr-replace-visible',
};

// 可编辑元素的 CSS 选择器
export const EditableSelectors = [
  'input[type="text"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="password"]',
  'input[type="number"]',
  'input:not([type])', // 默认 type 为 text
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]', // 空值等同于 true
];

// 替换结果状态
export const ReplaceStatus = {
  SUCCESS: 'success',
  NO_MATCH: 'no_match',
  EMPTY_FIND: 'empty_find',
  ERROR: 'error',
};

// VSCode 风格图标
export const Icons = {
  CLOSE: '\u00D7',
  MATCH_CASE: 'Aa',
  MATCH_WORD: 'Ab',
  USE_REGEX: '.*',
  PREV: '\u2191',
  NEXT: '\u2193',
  TOGGLE_REPLACE: '\u25BA',
  REPLACE_ONE: '\u21B6',
  REPLACE_ALL: '\u21BA',
};
