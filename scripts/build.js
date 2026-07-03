import esbuild from 'esbuild';
import { existsSync } from 'fs';

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const common = {
  bundle: true,
  target: 'chrome88',
  loader: { '.css': 'text' },
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions[]} */
const builds = [
  // Content Script — ESM 格式
  {
    ...common,
    entryPoints: ['src/content/index.js'],
    outfile: 'dist/content.js',
    format: 'esm',
  },
  // Background Service Worker — IIFE 格式
  {
    ...common,
    entryPoints: ['src/background/index.js'],
    outfile: 'dist/background.js',
    format: 'iife',
  },
];

async function run() {
  if (isWatch) {
    // Watch 模式
    const contexts = await Promise.all(
      builds.map((cfg) => esbuild.context(cfg))
    );
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[esbuild] Watching for changes...');
  } else {
    // 单次构建
    for (const cfg of builds) {
      if (!existsSync(cfg.entryPoints[0])) {
        console.warn(`[esbuild] WARNING: 入口文件不存在，将跳过: ${cfg.entryPoints[0]}`);
        continue;
      }
      await esbuild.build(cfg);
    }
    console.log('[esbuild] Build complete.');
  }
}

run().catch((err) => {
  console.error('[esbuild] Build failed:', err);
  process.exit(1);
});
