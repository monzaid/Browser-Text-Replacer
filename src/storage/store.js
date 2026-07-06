/**
 * chrome.storage.local 封装 — 历史记录 + 预设 CRUD + 主题
 * LRU 淘汰：历史 20 条上限，预设 100 条上限
 */
const META_KEY = 'text-replacer-meta';
const HISTORY_KEY = 'text-replacer-history';
const PRESETS_KEY = 'text-replacer-presets';
const THEME_KEY = 'text-replacer-theme';

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================================
// 历史记录（LRU 20条上限）
// ============================================================

/**
 * 保存一条历史记录，触发 LRU 淘汰
 * @param {string} findText
 * @param {string} replaceText
 * @param {Object} [options={}]
 */
export async function saveHistory(findText, replaceText, options = {}) {
  const { [META_KEY]: meta, [HISTORY_KEY]: history } =
    await chrome.storage.local.get([META_KEY, HISTORY_KEY]);
  const currentMeta = meta || { recentHistoryIds: [] };
  const currentHistory = history || {};

  // 去重：最后一条与本次完全一致则跳过
  if (currentMeta.recentHistoryIds.length > 0) {
    const lastId = currentMeta.recentHistoryIds[0];
    const lastEntry = currentHistory[lastId];
    if (lastEntry &&
        lastEntry.findText === findText &&
        lastEntry.replaceText === replaceText) {
      return lastId; // 重复，跳过
    }
  }

  const id = generateId();
  const entry = { id, findText, replaceText, options, timestamp: Date.now() };

  currentHistory[id] = entry;
  currentMeta.recentHistoryIds.unshift(id);

  // LRU 淘汰：超过 20 条
  while (currentMeta.recentHistoryIds.length > 20) {
    const removedId = currentMeta.recentHistoryIds.pop();
    delete currentHistory[removedId];
  }

  await chrome.storage.local.set({
    [META_KEY]: currentMeta,
    [HISTORY_KEY]: currentHistory,
  });
}

/**
 * 获取所有历史记录（按最近使用排序）
 * @returns {Promise<Array>}
 */
export async function getHistory() {
  const { [META_KEY]: meta, [HISTORY_KEY]: history } =
    await chrome.storage.local.get([META_KEY, HISTORY_KEY]);
  return (meta?.recentHistoryIds || []).map((id) => history?.[id]).filter(Boolean);
}

/**
 * 删除单条历史记录
 * @param {string} id
 */
export async function deleteHistoryItem(id) {
  const { [META_KEY]: meta, [HISTORY_KEY]: history } = await chrome.storage.local.get([META_KEY, HISTORY_KEY]);
  if (meta) meta.recentHistoryIds = (meta.recentHistoryIds || []).filter(i => i !== id);
  if (history) delete history[id];
  await chrome.storage.local.set({ [META_KEY]: meta, [HISTORY_KEY]: history });
}

/**
 * 清空所有历史记录
 */
export async function clearHistory() {
  const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
  const currentMeta = meta || {};
  currentMeta.recentHistoryIds = [];
  await chrome.storage.local.set({
    [META_KEY]: currentMeta,
    [HISTORY_KEY]: {},
  });
}

// ============================================================
// 预设 CRUD（100条上限）
// ============================================================

// 串行化队列，防止 read-modify-write 竞态
let saveQueue = Promise.resolve();

/**
 * 保存预设
 * @param {string} name
 * @param {string} findText
 * @param {string} replaceText
 * @param {Object} [options={}]
 */
export async function savePreset(name, findText, replaceText, options = {}) {
  // 将每次调用串行化
  const prevQueue = saveQueue;
  let resolveCurrent;
  saveQueue = new Promise(r => { resolveCurrent = r; });

  await prevQueue;

  try {
    const { [META_KEY]: meta, [PRESETS_KEY]: presets } =
      await chrome.storage.local.get([META_KEY, PRESETS_KEY]);
    const currentMeta = meta || { presetIds: [], favoriteIds: [] };
    const currentPresets = presets || {};

    // 防御：确保 presetIds 是数组
    if (!Array.isArray(currentMeta.presetIds)) {
      currentMeta.presetIds = [];
    }

    if (currentMeta.presetIds.length >= 100) {
      throw new Error('预设已满（上限100条）');
    }

    const id = generateId();
    currentPresets[id] = { id, name, findText, replaceText, options, createdAt: Date.now() };
    currentMeta.presetIds.push(id);

    await chrome.storage.local.set({
      [META_KEY]: currentMeta,
      [PRESETS_KEY]: currentPresets,
    });

    return id;
  } finally {
    resolveCurrent();
  }
}

/**
 * 获取所有预设
 * @returns {Promise<Array>}
 */
export async function getPresets() {
  const { [META_KEY]: meta, [PRESETS_KEY]: presets } =
    await chrome.storage.local.get([META_KEY, PRESETS_KEY]);
  return (meta?.presetIds || []).map((id) => presets?.[id]).filter(Boolean);
}

/**
 * 更新已有预设（不改变 ID 和 createdAt）
 * @param {string} id
 * @param {string} name
 * @param {string} findText
 * @param {string} replaceText
 * @param {Object} [options={}]
 */
export async function updatePreset(id, name, findText, replaceText, options = {}) {
  const prevQueue = saveQueue;
  let resolveCurrent;
  saveQueue = new Promise(r => { resolveCurrent = r; });

  await prevQueue;

  try {
    const { [PRESETS_KEY]: presets } = await chrome.storage.local.get(PRESETS_KEY);
    const currentPresets = presets || {};

    if (!currentPresets[id]) {
      throw new Error('预设不存在');
    }

    currentPresets[id] = {
      ...currentPresets[id],
      name,
      findText,
      replaceText,
      options,
    };

    await chrome.storage.local.set({ [PRESETS_KEY]: currentPresets });
  } finally {
    resolveCurrent();
  }
}

/**
 * 更新预设名称
 * @param {string} id
 * @param {string} name
 */
export async function updatePresetName(id, name) {
  const { [PRESETS_KEY]: presets } = await chrome.storage.local.get(PRESETS_KEY);
  if (presets && presets[id]) {
    presets[id].name = name;
    await chrome.storage.local.set({ [PRESETS_KEY]: presets });
  }
}

/**
 * 删除预设
 * @param {string} id
 */
export async function deletePreset(id) {
  const prevQueue = saveQueue;
  let resolveCurrent;
  saveQueue = new Promise(r => { resolveCurrent = r; });

  await prevQueue;

  try {
    const { [META_KEY]: meta, [PRESETS_KEY]: presets } =
      await chrome.storage.local.get([META_KEY, PRESETS_KEY]);
    const currentMeta = meta || { presetIds: [], favoriteIds: [] };
    const currentPresets = presets || {};

    // 防御：确保 presetIds 是数组
    if (!Array.isArray(currentMeta.presetIds)) {
      currentMeta.presetIds = [];
    }

    currentMeta.presetIds = currentMeta.presetIds.filter((pid) => pid !== id);
    delete currentPresets[id];

    await chrome.storage.local.set({
      [META_KEY]: currentMeta,
      [PRESETS_KEY]: currentPresets,
    });
  } finally {
    resolveCurrent();
  }
}

// ============================================================
// 导入/导出
// ============================================================

/**
 * 导出预设为 JSON 字符串
 * @returns {Promise<string>}
 */
export async function exportPresets() {
  const presets = await getPresets();
  return JSON.stringify(presets, null, 2);
}

/**
 * 从 JSON 字符串导入预设
 * @param {string} json
 * @returns {Promise<boolean>}
 */
export async function importPresets(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('无效的 JSON 格式');
  }
  if (!Array.isArray(data)) throw new Error('数据格式错误，应为数组');

  for (const p of data) {
    if (p.name && p.findText !== undefined && p.replaceText !== undefined) {
      try {
        await savePreset(p.name, p.findText, p.replaceText, p.options || {});
      } catch {
        // 跳过重复/已满
      }
    }
  }
  return true;
}

// ============================================================
// 主题
// ============================================================

/**
 * 保存主题配置
 * @param {Object} config - { mode: 'dark'|'light', ... }
 */
export async function saveTheme(config) {
  await chrome.storage.local.set({ [THEME_KEY]: config });
}

/**
 * 获取主题配置
 * @returns {Promise<Object>}
 */
export async function getTheme() {
  const { [THEME_KEY]: theme } = await chrome.storage.local.get(THEME_KEY);
  return theme || { mode: 'dark' };
}
