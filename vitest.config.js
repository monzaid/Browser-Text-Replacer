import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 默认使用 jsdom 环境（replace-bar 需要 DOM）
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
