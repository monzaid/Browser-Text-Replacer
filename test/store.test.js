/**
 * store.js — savePreset / deletePreset 串行化测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 chrome.storage.local
const mockStore = {};

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys) => {
        if (typeof keys === 'string') keys = [keys];
        const result = {};
        for (const k of keys) {
          if (mockStore[k] !== undefined) {
            result[k] = JSON.parse(JSON.stringify(mockStore[k]));
          }
        }
        return result;
      }),
      set: vi.fn(async (obj) => {
        for (const [k, v] of Object.entries(obj)) {
          mockStore[k] = JSON.parse(JSON.stringify(v));
        }
      }),
    },
  },
};

// 动态导入 store（需要在 chrome mock 之后）
const { savePreset, deletePreset, getPresets } = await import('../src/storage/store.js');

describe('Bug 3: savePreset 串行化', () => {
  beforeEach(() => {
    // 清空模拟存储
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
    // 重置 chrome.storage.local 的 mock 调用记录
    chrome.storage.local.get.mockClear();
    chrome.storage.local.set.mockClear();
  });

  it('连续调用 savePreset 两次，应保存两个预设（而非只保留最后一个）', async () => {
    // 并发调用两个 savePreset（不等第一个完成就调第二个）
    const [id1, id2] = await Promise.all([
      savePreset('预设A', 'foo', 'bar'),
      savePreset('预设B', 'baz', 'qux'),
    ]);

    // 两个 ID 应不同
    expect(id1).not.toBe(id2);

    // 两个预设都应被保存
    const presets = await getPresets();
    expect(presets).toHaveLength(2);
    expect(presets.map((p) => p.name)).toContain('预设A');
    expect(presets.map((p) => p.name)).toContain('预设B');
  });

  it('连续调用 savePreset 三次，应保存三个预设', async () => {
    await Promise.all([
      savePreset('P1', 'a', 'b'),
      savePreset('P2', 'c', 'd'),
      savePreset('P3', 'e', 'f'),
    ]);

    const presets = await getPresets();
    expect(presets).toHaveLength(3);
  });

  it('deletePreset 与 savePreset 并发时不应丢失数据', async () => {
    // 先存一个
    const id1 = await savePreset('Keep', 'keep', 'keep');

    // 并发：保存新预设 + 删除旧预设
    await Promise.all([
      savePreset('New', 'new', 'new'),
      deletePreset(id1),
    ]);

    const presets = await getPresets();
    // New 应存在，Keep 应被删除
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('New');
  });
});
