# 文本替换助手 V2 — 开发完成报告

> 日期：2026-07-03 | 状态：已完成  
> 关联设计：`_context-output/designs/2026-07-02-text-replacer-v2-design.md`  
> 关联决策：`_context-output/designs/2026-07-02-text-replacer-v2-decisions.yaml`  
> 关联计划：`_context/memory/sw-shared/plans/text-replacer-v2-plan.md`

---

## 一、概述

在 V1.0 Chrome 扩展基础上，完成了架构重构（Shadow DOM + esbuild）和 5 项新功能，经历了 9 轮测试反馈 + 修正。核心架构变更和新增功能均已稳定。

**最终构建：** `dist/content.js` 108.1kb + `dist/background.js` 1.3kb

---

## 二、Wave 1 — V1.1 架构重构

### 2.1 Shadow DOM 面板隔离

| 项目 | 说明 |
|------|------|
| 方案 | `host.attachShadow({ mode: 'open' })`，面板 UI 完全渲染在 Shadow Root 内 |
| Host 元素 | `<div id="text-replacer-host">`，`position:fixed; z-index:2147483647` |
| 生命周期 | 懒创建 + 持久存活（`host.hidden` 切换），DOM 状态保留 |
| 样式 | V1.1 内联 `<style>` 注入 Shadow Root，CSS 自定义属性 `var(--tr-*, fallback)` |
| 高亮样式 | 页面级高亮（`.tr-highlight-match`/`.tr-highlight-overlay`）通过 `ensureStylesInjected()` 注入页面文档和 iframe |

### 2.2 esbuild 打包

| 项目 | 说明 |
|------|------|
| 入口 | 双入口：`src/content/index.js`（ESM）+ `src/background/index.js`（IIFE） |
| 输出 | `dist/content.js` + `dist/background.js` |
| CSS | `loader: '.css': 'text'` 内联为 JS 字符串 |
| Target | `chrome88` |
| 命令 | `npm run build` / `npm run dev` |

### 2.3 IIFE → ES6 模块迁移

| V1.0（旧） | V2.0（新） |
|-------------|-------------|
| `window.TextReplacerConstants` | `import { ... } from '../../shared/constants.js'` |
| `window.TextReplacerElementFinder` | `import { ... } from './core/element-finder.js'` |
| `window.TextHighlighter` | `import { ... } from './core/text-highlighter.js'` |
| `window.TextReplacer` | `import { ... } from './core/text-replacer.js'` |
| `window.TextReplacerUI` | 拆分至 `ui/panel.js` + `message-proxy.js` |
| manifest 6 文件 | manifest 1 文件（`dist/content.js`） |

### 2.4 目录结构（最终）

```
src/
├── background/
│   └── index.js              # Service Worker 入口
├── content/
│   ├── index.js              # Content Script 入口（Shadow DOM host + 消息路由）
│   ├── core/
│   │   ├── element-finder.js # 元素查找 + MutationObserver
│   │   ├── text-replacer.js  # 搜索/替换/预览引擎 + 动态监听 + UI 更新
│   │   └── text-highlighter.js # 高亮渲染（独立模块，含预览高亮）
│   ├── ui/
│   │   ├── panel.js          # Shadow Root 面板渲染 + show/hide + 监听启停
│   │   ├── search-bar.js     # 查找栏（输入框/工具按钮/导航/计数）
│   │   ├── replace-bar.js    # 替换栏（输入框/替换按钮/预览按钮）
│   │   ├── toolbar.js        # 更多菜单（主题/历史/预设入口）
│   │   ├── history-menu.js   # 历史记录/预设管理 UI
│   │   └── theme-picker.js   # 主题系统（Light/Dark/Auto/Custom）
│   └── message-proxy.js      # CQRS 消息代理
├── storage/
│   └── store.js              # chrome.storage.local 封装
├── shared/
│   ├── constants.js          # 常量定义
│   └── utils.js              # 工具函数
└── styles/
    └── panel.css             # 面板样式（CSS 自定义属性）
```

### 2.5 MessageProxy + CQRS

| 方向 | 类型 | 命令/事件 |
|------|------|-----------|
| Panel → Engine | Command | `search`, `replaceOne`, `replaceAll`, `navigate`, `clearHighlights`, `focusCurrentMatch`, `isCurrentMatchInViewport`, `startListening`, `stopListening` |
| Panel → Engine | Command | `enterPreview`, `togglePreviewMatch`, `executeDoubleReplace`, `applyPreviewedReplacements`, `exitPreview`, `getPreviewState` |
| Engine → Panel | Event | `matches:updated`, `replace:completed`, `preview:stateUpdated` |

---

## 三、Wave 2 — V1.2 功能升级

### 3.1 历史记录 + 收藏预设

| 功能 | 实现 |
|------|------|
| 历史记录 | LRU 20 条，保存搜索 + 替换操作 |
| 预设规则 | 上限 100 条，CRUD + 导入导出 JSON |
| 收藏按钮 | 历史条目 ⭐ 按钮 → prompt 命名 → 保存为预设 |
| 存储 | `chrome.storage.local`，三键分离（meta/history/presets） |
| savePreset 竞态 | Promise 串行化队列防止 read-modify-write 覆盖 |

### 3.2 快捷键升级

| 按键 | 焦点位置 | 行为 |
|------|----------|------|
| Enter | 查找输入框 | 跳下一个匹配 |
| Shift+Enter | 查找输入框 | 跳上一个匹配 |
| Enter | 替换输入框 | 替换当前匹配 |
| Escape | 任意 | 关闭面板 + 恢复原焦点 |
| Tab | 面板内 | 查找/替换输入框切换 |

### 3.3 替换按钮智能两段式

| 当前匹配位置 | 点击 ↶ | 行为 |
|-------------|--------|------|
| 在可视区内 | 任意次 | 直接替换 + `focusCurrentMatch` 居中 |
| 不在可视区内 | 第 1 次 | `focusCurrentMatch` 跳转居中（不替换） |
| 已跳转 | 第 2 次 | 直接替换 + `focusCurrentMatch` 居中 |

> 搜索/导航操作后跳转标记自动重置。

### 3.4 替换预览模式

| 操作 | 行为 |
|------|------|
| 👁 预览按钮 | 进入预览模式，所有匹配变黄色（初始不替换） |
| 单击高亮 | 切换绿色（将被替换）/ 黄色（不替换），计数更新 |
| 双击高亮 | 即时替换该匹配（overlay/contenteditable 均支持） |
| ✓ 应用预览 | 批量替换所有绿色标记匹配 → 退出预览 |
| 👁 取消预览 | 退出预览 → 恢复黄色搜索高亮 |

**contenteditable 预览修复历程（7 轮）：**
1. 全局偏移量 → 文本节点偏移量映射错误
2. `highlightPreviewTextNode` 跨文本节点处理
3. `clearHighlight` 遗漏 `.tr-preview-selected`
4. 文本匹配 `pm.text === localMatch.text` 不稳定 → 严格顺序消费
5. `e.target` 文本节点 → `parentElement` 处理
6. `previewMatches.splice` 全局索引偏移 → `refreshAllPreviewHighlights()` 全量刷新
7. 最终方案：每个文本节点内 `findAllMatches` 重新搜索 + 顺序消费 `previewMatchData`

### 3.5 主题系统

| 模式 | 实现 |
|------|------|
| Dark | VSCode 深色风格（默认） |
| Light | 白色背景 + 深色文字 |
| Auto | `matchMedia('prefers-color-scheme: dark')` 跟随系统 |
| Custom | 3 域取色器（面板主色 / 搜索高亮色 / 预览高亮色）+ 预定义色板（Monokai/Nord/Solarized/One Dark） |

### 3.6 多行文本支持

- 查找输入框：`<input>` → `<textarea rows="1">`
- 替换输入框：`<input>` → `<textarea rows="1">`
- `resize: vertical`，`min-height: 22px`

---

## 四、测试验收调整

### 4.1 Shadow DOM 穿透修复（3 轮）

| 轮次 | 问题 | 修复 |
|------|------|------|
| 1 | `document.getElementById` 无法访问 Shadow Root 内元素 | 改用 `panelElement.querySelector()` / `getShadowElement()` |
| 2 | `history-menu.js` 12 处 `document.getElementById` 残留 | `getShadowElement()` 穿透 Shadow Root host |
| 3 | `toolbar.js` 点击外部关闭菜单因 Shadow DOM event retargeting 误触发 | `e.target` → `e.composedPath()` |

### 4.2 iframe 高亮修复（5 轮）

| 轮次 | 问题 | 修复 |
|------|------|------|
| 1 | 主文档高亮 CSS 未注入（`cssInjectedFrames.add(document)` 跳过） | 删除预标记，让 `ensureStylesInjected` 实际注入 |
| 2 | overlay `width:100%;height:100%` 对 input/textarea 不精确 | `offsetWidth/offsetHeight` |
| 3 | `right:0;bottom:0` 填满 wrapper 仍偏移 | 发现根因：`ensureWrapper` 未转移元素 margin |
| 4 | 添加 `border-style: solid` 使复制的 border-width 生效 | 仍不够 |
| 5 | **最终根因：** wrapper 未继承元素 margin → 元素在 wrapper 内偏移 | `wrapper.style.margin*` = `computed.margin*` + `element.style.margin = '0'` |

### 4.3 动态元素更新修复（1 轮）

| 问题 | 根因 | 修复 |
|------|------|------|
| MutationObserver 未启动 | V2 重构后 `startListening()` 从未被调用 | MessageProxy 注册命令 + `panel.js` show/hide 中启停 |

### 4.4 替换按钮交互演进（3 轮）

| 版本 | 交互 | 问题 |
|------|------|------|
| V1 | `replaceOne` 直接替换 + 跳转 | 匹配不可见时用户不知道替换了什么 |
| V2 | `hasViewedCurrentMatch` 全局标记，每次替换都要点两次 | 用户体验差 |
| V3（最终） | 智能两段式 + `focusCurrentMatch` 居中滚动 | ✅ |

### 4.5 引擎层 Shadow DOM 穿透修复

| 问题 | 修复 |
|------|------|
| `updateUIFromSearch()` `document.getElementById` 返回 null | 新增 `getPanelUIElement(id)` 通过 `host.shadowRoot.querySelector` |
| `inputListener` 无法过滤面板内事件 | 新增 `isPanelElement(target)` |
| `replaceOne` 内部 `document.getElementById(FIND_INPUT_ID)` 返回 null | 改用 `getPanelUIElement(FIND_INPUT_ID)` |

### 4.6 其他修复

| 问题 | 修复 |
|------|------|
| 导航后焦点跑到页面元素 | `setTimeout(() => findInput.focus(), 50)` 恢复 |
| contenteditable Range.setEnd 崩溃 | 跳过 Range 选择，仅 `focus()` + `scrollIntoView` |
| 预览退出后计数不更新 | 手动 `emit('matches:updated')` + 更新 `matchCountEl` |
| 预设按钮事件未绑定（Shadow DOM 查询失败） | `bindPresetEvents(menuElement)` 直接传 DOM 引用 |
| savePreset 竞态覆盖 | Promise 串行化队列 |

---

## 五、最终文件清单

### 新增文件

| 路径 | 说明 |
|------|------|
| `package.json` | npm 配置 + esbuild devDependency |
| `scripts/build.js` | esbuild 构建脚本 |
| `src/content/index.js` | Content Script 入口（Shadow DOM host） |
| `src/background/index.js` | Service Worker 入口 |
| `src/shared/constants.js` | ES6 常量模块 |
| `src/shared/utils.js` | 工具函数模块 |
| `src/content/core/element-finder.js` | 元素查找模块 |
| `src/content/core/text-highlighter.js` | 高亮模块 |
| `src/content/core/text-replacer.js` | 查找/替换/预览引擎 |
| `src/content/message-proxy.js` | CQRS 消息代理 |
| `src/content/ui/panel.js` | 面板核心 |
| `src/content/ui/search-bar.js` | 查找栏 |
| `src/content/ui/replace-bar.js` | 替换栏 |
| `src/content/ui/toolbar.js` | 更多菜单 |
| `src/content/ui/history-menu.js` | 历史/预设管理 |
| `src/content/ui/theme-picker.js` | 主题系统 |
| `src/storage/store.js` | chrome.storage.local 封装 |
| `src/styles/panel.css` | 面板样式（CSS 自定义属性） |
| `dist/content.js` | Content Script 构建产物 |
| `dist/background.js` | Service Worker 构建产物 |

### 保留的 V1.0 文件（未删除，不再使用）

| 路径 | 说明 |
|------|------|
| `src/content/content.js` | V1.0 Content Script 入口 |
| `src/content/ui-injector.js` | V1.0 UI 注入器 |
| `src/content/element-finder.js` | V1.0 元素查找器 |
| `src/content/text-replacer.js` | V1.0 文本替换器 |
| `src/content/text-highlighter.js` | V1.0 文本高亮器 |
| `src/background/service-worker.js` | V1.0 Service Worker |
| `src/utils/constants.js` | V1.0 常量模块 |
| `src/styles/replacer-panel.css` | V1.0 面板样式 |

### 修改文件

| 路径 | 变更 |
|------|------|
| `manifest.json` | 引用路径改为 `dist/`，添加 `storage` 权限，版本升至 `1.1.0` |

---

## 六、构建与部署

```bash
npm install            # 安装 esbuild
npm run build          # 生产构建 → dist/content.js + dist/background.js
npm run dev            # watch 模式开发
```

Chrome 加载：`chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选择项目根目录

---

## 七、成功标准验收

| # | 标准 | 状态 |
|---|------|:--:|
| 1 | `npm run build` 首次执行即可产出正确 dist/ 文件 | ✅ |
| 2 | Chrome 扩展加载后 Ctrl+Shift+H 正常打开面板 | ✅ |
| 3 | 面板不受任何测试页面元素覆盖（Shadow DOM 隔离） | ✅ |
| 4 | 搜索/高亮/替换行为与 V1.0 完全一致 | ✅ |
| 5 | 历史记录跨会话持久化 | ✅ |
| 6 | 预设规则可导出 JSON 文件并在另一设备导入 | ✅ |
| 7 | 预览模式下单击切换、双击即时替换、应用预览批量提交 | ✅ |
| 8 | 主题切换即时生效，Auto 模式跟随系统 | ✅ |
| 9 | 动态元素（MutationObserver）自动检测并高亮 | ✅ |
| 10 | iframe 内高亮叠加层对齐（无偏移） | ✅ |
| 11 | 替换按钮智能两段式（可视区一键/不可见区两次） | ✅ |
| 12 | 零 `window.TextReplacer*` 全局变量泄漏 | ✅ |
