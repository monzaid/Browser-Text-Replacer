# 文本替换助手 V2 设计文档

> 日期：2026-07-02 | 版本：V2.0  
> 状态：设计审批完成 | 14 决策 / 0 OPEN

---

## 一、概述

基于 V1.0 的 Chrome 扩展「文本替换助手」进行全面升级，核心目标：解决界面覆盖问题、提升用户体验、扩展能力边界、引入工程化构建。

### 交付计划

| 批次 | 版本 | 内容 |
|------|------|------|
| V1.1 | 架构重构 | Shadow DOM 隔离 + esbuild 打包 |
| V1.2 | 功能升级 | 历史收藏 + 快捷键 + 预览 + 主题 |

### 6 项功能（按优先级）

| # | 功能 | 优先级 | 批次 |
|---|------|--------|------|
| 1 | 界面覆盖修复（Shadow DOM） | P0 | V1.1 |
| 2 | 历史与收藏（20条历史 + 100条预设） | P1 | V1.2 |
| 3 | 快捷键升级（Enter 上下文感知） | P1 | V1.2 |
| 4 | 替换预览（选择性替换模式） | P1 | V1.2 |
| 5 | 主题切换（Light/Dark/Auto/Custom） | P1 | V1.2 |
| — | 撤销/重做 | 移除 | 采用浏览器原生 |

---

## 二、架构设计

### 2.1 目录结构

```
text-replacer-extension/
├── manifest.json
├── icons/
├── .esbuildrc.js / esbuild.config.js
├── src/
│   ├── background/
│   │   └── index.js              # Service Worker 入口
│   ├── content/
│   │   ├── index.js              # Content Script 入口 (attachShadow + MessageProxy)
│   │   ├── core/
│   │   │   ├── element-finder.js # 可编辑元素查找 + MutationObserver
│   │   │   ├── text-replacer.js  # 文本替换引擎
│   │   │   └── text-highlighter.js # 高亮渲染（独立模块）
│   │   ├── ui/
│   │   │   ├── panel.js          # Shadow DOM 面板渲染
│   │   │   ├── search-bar.js     # 查找栏
│   │   │   ├── replace-bar.js    # 替换栏
│   │   │   ├── toolbar.js        # 工具栏
│   │   │   ├── history-menu.js   # 历史/预设下拉
│   │   │   └── theme-picker.js   # 主题选择器
│   │   └── message-proxy.js      # CQRS 消息代理
│   ├── storage/
│   │   └── store.js              # chrome.storage.local 封装
│   ├── shared/
│   │   ├── constants.js          # 常量
│   │   └── utils.js              # 工具函数
│   └── styles/
│       └── panel.css             # 面板样式（内联打包到 JS）
├── dist/                         # 构建产物
│   ├── background.js             # IIFE 格式
│   └── content.js                # ESM 格式
└── package.json
```

### 2.2 构建配置

- **打包工具**：esbuild
- **入口**：双入口 `src/background/index.js` + `src/content/index.js`
- **格式**：background → IIFE，content → ESM
- **单 content entry**：所有 content 模块打包为 `dist/content.js`，manifest 引用一个文件
- **CSS**：V1.1 内联为 JS 字符串，运行时注入 Shadow Root；V1.2 迁移为 CSS 变量

### 2.3 Shadow DOM 隔离

```
用户按 Ctrl+Shift+H
  → Service Worker → sendMessage → content/index.js
  → 首次调用：创建 host 元素 → attachShadow({ mode: 'open' })
  → 后续调用：host.hidden = false
  → panel.js 在 Shadow Root 内渲染全部 UI
  → 关闭：host.hidden = true（保留 DOM，状态不丢失）
```

**面板与页面完全隔离**：Shadow Root 内的元素不受页面 CSS/z-index 影响，页面元素也不会被面板样式污染。

### 2.4 通信架构（CQRS）

```
┌─────────────────────────────────────────────────────┐
│  Shadow Root (panel)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │search-bar│  │replace-ba│  │ toolbar  │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │              │             │                │
│       └──────────────┼─────────────┘                │
│                      │                              │
│               MessageProxy                          │
│           (commands ↑ / events ↓)                   │
└──────────────────────┼──────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────┐
│  Page DOM (engine)   │                              │
│  ┌───────────────────┴──────┐  ┌──────────────────┐ │
│  │     text-replacer        │  │ text-highlighter │ │
│  │  findMatches()           │  │ highlightElement │ │
│  │  replaceOne/All()        │  │ clearAll()       │ │
│  └───────────┬──────────────┘  └────────┬─────────┘ │
│              │                          │            │
│  ┌───────────┴──────────┐              │            │
│  │   element-finder      │◄─────────────┘            │
│  │  findAllEditable()    │                           │
│  │  startObserving()     │                           │
│  └───────────────────────┘                           │
└──────────────────────────────────────────────────────┘
```

### 2.5 MessageProxy API 契约

```js
// Panel → Engine (Commands)
proxy.command('search', { text, options })        → Promise<SearchResult>
proxy.command('replaceOne', { text })             → Promise<ReplaceResult>
proxy.command('replaceAll', { findText, replaceText, options }) → Promise<ReplaceAllResult>
proxy.command('replacePreview', { matches })      → Promise<ReplaceResult>
proxy.command('navigate', { direction })          → Promise<NavigateResult>

// Engine → Panel (Events)
proxy.emit('matches:updated', { count, current })
proxy.emit('replace:completed', { stats })
proxy.emit('preview:updated', { selected, total })
```

---

## 三、数据流

### 3.1 搜索流程
```
用户输入查找文本 → 150ms 防抖
  → panel → proxy.command('search', { text, options })
  → engine.findMatches()
  → elementFinder.findAllEditableElements() [主文档 + 同源 iframe]
  → 对每个元素: findInText()
  → highlighter.highlightElement() [overlay/contenteditable]
  → proxy.emit('matches:updated') → panel 更新计数
```

### 3.2 替换流程
```
用户点击替换全部 → panel → proxy.command('replaceAll', ...)
  → engine.replaceAll()
  → 遍历元素: replaceInText() + setElementValue() + triggerEvent('input'/'change')
  → proxy.emit('replace:completed')
```

### 3.3 预览流程（V1.2）
```
1. 用户搜索 → 黄色高亮
2. 点击「预览」→ 所有匹配变为黄色(=不替换，初始状态)
   → 预览按钮旁出现「应用预览」按钮（灰态）
3. 用户单击高亮区域 → 该匹配变为绿色(=将被替换)
   → 至少选中 1 项后「应用预览」按钮激活
4. 用户双击高亮区域 → 立即执行该匹配的替换（overlay 拦截）
   → 更新 overlay 和底层元素值
5. 点击「应用预览」→ 批量执行所有绿色标记的替换
   → 显示结果统计 → 退出预览模式，恢复黄色搜索高亮
6. 再次点击「预览」→ 退出预览模式（取消），恢复黄色搜索高亮
```

### 3.4 主题切换流程
```
用户选择主题 → theme-picker.js
  → Auto: matchMedia('prefers-color-scheme: dark') 监听
  → Light/Dark: 预定义色板
  → Custom: 原生 <input type="color"> × 3 域
     ├── 面板背景/文字色
     ├── 搜索匹配高亮色
     └── 预览将被替换高亮色
  → shadowRoot.host.style.setProperty('--tr-*', value)
  → store.save('text-replacer-theme', config)
```

---

## 四、存储 Schema

```json
// chrome.storage.local

// 索引
"text-replacer-meta": {
  "recentHistoryIds": ["id1", "id2", ...],  // 最近 20 条
  "presetIds": ["p1", "p2", ...],           // 最多 100 条
  "favoriteIds": ["p1"]                      // 收藏的预设
}

// 历史记录
"text-replacer-history": {
  "id1": { "findText": "...", "replaceText": "...", "options": {...}, "timestamp": 1700000000 },
  ...
}

// 预设规则（支持导入导出）
"text-replacer-presets": {
  "p1": { "id": "p1", "name": "清理占位符", "findText": "...", "replaceText": "...", "options": {...}, "createdAt": 1700000000 },
  ...
}

// 主题
"text-replacer-theme": {
  "mode": "dark" | "light" | "auto" | "custom",
  "custom": {
    "panelBg": "#252526",
    "panelText": "#cccccc",
    "searchHighlight": "rgba(255,215,0,0.3)",
    "previewHighlight": "rgba(0,255,0,0.4)",
    "previewSkip": "rgba(255,215,0,0.3)"
  }
}
```

---

## 五、UI 组件

### 5.1 面板布局

```
┌─────────────────────────────────────────┐
│ [查找输入框..............] [Aa][Ab][.*]│ │ 1/5 │ [↑][↓] [▶] [×] │
├─────────────────────────────────────────┤
│ [替换输入框..............] [↶][↺] [👁] [✓] │  ← 替换行（可折叠）
├─────────────────────────────────────────┤
│ [⋯ 更多]                                │  ← 下拉菜单
│   ├── 🎨 主题 (Light/Dark/Auto/Custom) │
│   └── 📋 历史记录 / 预设               │
└─────────────────────────────────────────┘
```

**按钮说明：**
- `Aa` 区分大小写 | `Ab` 全词匹配 | `.*` 正则 | `↑↓` 导航 | `▶` 切换替换行 | `×` 关闭
- `↶` 替换当前 | `↺` 替换全部 | `👁` 预览 | `✓` 应用预览(预览模式时显示)
- `⋯` 更多菜单：主题 + 历史/预设

### 5.2 工具栏按钮显隐规则

| 按钮 | 始终可见 | 有匹配时 | 预览模式 |
|------|:---:|:---:|:---:|
| Aa/Ab/.* | ✅ | | |
| ↑/↓ | | ✅ | |
| ▶ 切换替换 | ✅ | | |
| × 关闭 | ✅ | | |
| ↶/↺ 替换 | | ✅ | |
| 👁 预览 | | ✅ | |
| ✓ 应用预览 | | | ✅ |
| ⋯ 更多 | ✅ | | |

---

## 六、错误处理

| 场景 | 处理 |
|------|------|
| 正则表达式语法错误 | try/catch → 查找输入框红色边框 + 错误提示 |
| chrome.storage 写入失败 | 静默降级，历史不保存但不影响功能 |
| 跨域 iframe | try/catch 静默跳过 |
| Shadow DOM 已存在 | 复用现有 host，不重复 attachShadow |
| 预览模式下 DOM 被外部修改 | 下次点击时重新计算匹配位置 |
| esbuild 构建失败 | `npm run build` 报错 + 无 dist 产出 |

---

## 七、构建与开发

```bash
npm install            # 安装 esbuild
npm run build          # 生产构建
npm run dev            # watch 模式开发
```

**esbuild 关键配置：**
- `entryPoints`: `['src/content/index.js', 'src/background/index.js']`
- `format`: content=`esm`, background=`iife`
- `loader`: `.css` → `text`（内联为字符串）
- `bundle: true`, `minify: true` (生产), `sourcemap: true` (开发)
- `target`: `chrome88`

---

## 八、兼容性

| 浏览器 | 最低版本 |
|--------|----------|
| Chrome | 88+ |
| Edge | 88+ |

Shadow DOM 基础 API（`attachShadow`, `mode: 'open'`）在 Chrome 53+ 完全支持，ES modules in content scripts 在 Chrome 88+ 支持。

---

## 九、从 IEFE 到 ES6 模块的迁移

| V1.0 (当前) | V2.0 (目标) |
|-------------|-------------|
| `window.TextReplacerConstants` | `import { constants } from '../shared/constants.js'` |
| `window.TextReplacerElementFinder` | `import { finder } from './core/element-finder.js'` |
| `window.TextHighlighter` | `import { highlighter } from './core/text-highlighter.js'` |
| `window.TextReplacer` | `import { engine } from './core/text-replacer.js'` |
| `window.TextReplacerUI` | 拆分到 `ui/panel.js` + `message-proxy.js` |
| IIFE 闭包 | ES6 `import/export` 模块 |
| manifest 声明 6 文件 | manifest 声明 1 文件（`dist/content.js`） |
