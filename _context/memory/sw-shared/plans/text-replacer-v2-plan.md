# 文本替换助手 V2 — 实施计划

> 生成日期：2026-07-02 | 设计文档：`_context-output/designs/2026-07-02-text-replacer-v2-design.md`  
> 决策清单：`_context-output/designs/2026-07-02-text-replacer-v2-decisions.yaml`  
> 预规划审查：已通过（0 BLOCKER, 0 OPEN）

---

## TL;DR

**目标：** 将 V1.0 Chrome 扩展重构为 Shadow DOM + esbuild 架构（Wave 1），叠加 4 项新功能（Wave 2）。

**交付物：**
- Wave 1（V1.1）：`dist/content.js` + `dist/background.js` 双构建产物，Shadow DOM 隔离面板，IIFE→ESM 模块迁移
- Wave 2（V1.2）：历史收藏 + 快捷键升级 + 选择预览替换 + 四模式主题

**工作量估算：** 2 waves，8 tasks + 6 tasks = 14 tasks  
**并行性：** Wave 1 3 tasks serial + 5 tasks parallel；Wave 2 6 tasks parallel（无内部依赖）  
**关键路径：** 现有 IIFE 模块 → ES6 模块拆分 → MessageProxy → Shadow DOM 面板 → esbuild 打包 → 功能叠加

---

## Context

**原始请求：** 对文本替换助手 Chrome 扩展进行 V2 升级，优先解决界面覆盖问题（Shadow DOM），引入构建工具（esbuild），新增历史收藏、快捷键、预览替换、主题切换功能。撤销功能排除。

**关键架构决策（来自 brainstorming，14/14 RESOLVED）：**
- Shadow DOM `attachShadow({ mode: 'open' })` 隔离
- esbuild 双入口：background IIFE + content ESM
- MessageProxy + CQRS 通信
- chrome.storage.local 三键存储
- 两波迭代交付（V1.1 纯重构 → V1.2 功能）

**预规划风险缓解：**
- iframe 高亮：维持 V1.0 策略（highlighter 独立渲染每个 frame 内 DOM，Shadow DOM 不影响）
- ESM content_scripts：Manifest V3 91+ 原生支持，88-90 fallback IIFE
- V1.1 CSS 内联：使用 CSS 自定义属性 + fallback，V1.2 无缝迁移变量
- `storage` 权限：Wave 1 提前声明于 manifest.json

---

## Work Objectives

### 核心目标

1. **V1.1**：在不改变任何用户可见行为的前提下，将代码库从 IIFE 全局模块迁移到 ES6 模块 + esbuild 打包 + Shadow DOM 面板
2. **V1.2**：在 V1.1 基础上，新增历史记录（20条）、预设规则（100条，支持导入导出）、快捷键升级、选择预览替换、四模式主题

### IN scope

| 批次 | 内容 |
|------|------|
| Wave 1 | Shadow DOM 面板隔离、esbuild 双入口打包、IIFE→ESM 模块迁移、CSS 内联注入、MessageProxy + CQRS、`storage` 权限声明、package.json |
| Wave 2 | 历史记录（LRU 20）、预设规则（上限 100，导入导出）、Enter 上下文感知 + Shift+Enter、预览模式（单击切换/双击替换/应用预览按钮）、Light/Dark/Auto 主题、Custom 取色器（面板+搜索高亮+预览高亮 3 域） |

### OUT scope

- 撤销/重做（浏览器原生 Ctrl+Z/Y）
- 单元测试自动化
- Firefox 兼容
- Custom 主题 HSL 亮度自动派生（手动设置 3 域颜色即可）
- 预览模式双击替换的动画过渡

### MUST HAVE

- V1.1 构建后 dist/ 产物在 Chrome 88+ 可正常加载
- V1.1 6 项 smoke test 全部通过
- Shadow Root 内面板不再被页面元素覆盖
- 替换后继续触发 input/change 事件（React/Vue 兼容）

### MUST NOT

- 修改 V1.0 的搜索引擎逻辑（findInText / replaceInText / findMatches 核心算法）
- 修改高亮渲染逻辑（overlay / TreeWalker 策略）
- 修改 element-finder 的 MutationObserver 配置
- 引入任何 npm 依赖（除 esbuild devDependency）
- 新增任何 `window.*` 全局变量

---

## Verification Strategy

### 测试策略：手动 smoke test（6 场景）

**V1.1 回归清单（在 test-page.html 执行）：**

| # | 场景 | 操作 | 断言 |
|---|------|------|------|
| S1 | 面板打开 | Ctrl+Shift+H → 面板出现 | Shadow Root 内面板可见，不被覆盖 |
| S2 | 搜索高亮 | 输入"测试文本" | 所有匹配处黄色高亮，计数显示 N/M |
| S3 | 导航 | 点击 ↓ / ↑ | 橙色当前高亮切换，scroll 到可视区 |
| S4 | 替换当前 | 输入替换文本 → ↶ | 当前匹配替换，自动跳到下一个 |
| S5 | 替换全部 | ↺ | 所有匹配替换，显示结果统计 |
| S6 | 动态元素 | 点击测试页面"动态添加"按钮 | MutationObserver 检测到新元素，搜索更新 |

**V1.2 功能验证：** 每项功能实现后手动物理性验证（见各 task QA scenarios）

### QA 策略

- 零人工干预验收标准
- 每条 task 内置 QA SCENARIOS（操作步骤 + 预期结果）
- 构建：`npm run build` 零错误零警告

---

## Execution Strategy

### Wave 结构

```
Wave 1 (V1.1): Architecture Refactoring
  T1 [SERIAL]    package.json + esbuild 配置
  T2 [SERIAL]    IIFE→ESM 模块拆分（shared/ + core/）
  T3 [SERIAL]    MessageProxy + CQRS 骨架
  T4 [PARALLEL]  background/index.js 迁移
  T5 [PARALLEL]  content/index.js（Shadow DOM host + 入口）
  T6 [PARALLEL]  ui/panel.js（Shadow Root 内渲染面板 UI）
  T7 [PARALLEL]  样式迁移（CSS 内联 + 自定义属性）
  T8 [PARALLEL]  manifest.json 更新 + 构建验证

Wave 2 (V1.2): Feature Implementation
  T9  [PARALLEL]  storage/store.js + 历史记录 UI
  T10 [PARALLEL]  预设规则（CRUD + 导入导出）
  T11 [PARALLEL]  快捷键升级（Enter 上下文感知 + Escape/Tab）
  T12 [PARALLEL]  预览模式（单击切换/双击替换/应用预览按钮）
  T13 [PARALLEL]  主题系统（Light/Dark/Auto + CSS 变量迁移）
  T14 [PARALLEL]  Custom 取色器（3 域）+ 更多菜单整合
```

### 依赖最小化

- T2 产出 `shared/constants.js` → 所有后续 task 共享
- T3 产出 `message-proxy.js` → T4/T5/T6 依赖
- T9 产出 `storage/store.js` → T10/T13 依赖
- Wave 2 所有任务依赖 Wave 1 完成，Wave 2 内部无相互依赖

---

## Final Verification Wave

| # | 审查类型 | 目标文件 |
|---|---------|---------|
| F1 | 构建验证 | `npm run build` 零错误，dist/ 文件存在 |
| F2 | Smoke test | 6 项场景在 test-page.html 通过 |
| F3 | 代码规范 | 无 `window.TextReplacer*` 全局残留 |
| F4 | manifest 一致性 | 引用路径存在，权限声明完整 |

---

## Commit Strategy

| 提交 | 消息 | 内容 |
|------|------|------|
| Commit 1 | `refactor: migrate to esbuild + Shadow DOM architecture` | Wave 1 全部 |
| Commit 2 | `feat: add history, presets, shortcuts, preview, and theme support` | Wave 2 全部 |

---

## Success Criteria

1. `npm run build` 在首次执行后即可产出正确的 dist/ 文件
2. Chrome 扩展加载项目根目录后 Ctrl+Shift+H 正常打开面板
3. 面板不受任何测试页面元素覆盖
4. 搜索/高亮/替换行为与 V1.0 完全一致
5. 历史记录跨会话持久化（关闭浏览器后重新打开仍可见）
6. 预设规则可导出 JSON 文件并在另一设备导入
7. 预览模式下单击切换、双击即时替换、应用预览批量提交
8. 主题切换即时生效，Auto 模式跟随系统

---

## TODOs

### Wave 1 — Architecture Refactoring (V1.1)

#### T1 [SERIAL] · package.json + esbuild 配置

**WHAT TO DO:**
1. 在项目根目录创建 `package.json`，包含 name/version/scripts
2. 安装 esbuild 为 devDependency：`npm install --save-dev esbuild`
3. 创建 `esbuild.config.js`（或 `scripts/build.js`），配置：
   - `entryPoints`: `['src/content/index.js', 'src/background/index.js']`
   - `bundle: true`, `format`: content=`esm`, background=`iife`
   - `loader: { '.css': 'text' }`（CSS 内联为字符串）
   - `outdir: 'dist'`
   - `target: 'chrome88'`
4. `package.json` scripts：
   - `"build": "node scripts/build.js"`
   - `"dev": "node scripts/build.js --watch"`

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| `npm install` | 无错误，node_modules/esbuild 存在 |
| `npm run build` | 退出码 0，dist/content.js 和 dist/background.js 生成 |
| 检查 dist/content.js | 包含 ESM `import`/`export` 语法（或打包后的等价结构） |
| 检查 dist/background.js | IIFE 格式，无 `import`/`export` 关键字残留 |
| `npm run dev` | watch 模式启动，修改源文件自动重新构建 |

---

#### T2 [SERIAL] · IIFE→ESM 模块拆分（shared/ + core/）

**WHAT TO DO:**
1. 创建 `src/shared/constants.js` — 从 `src/utils/constants.js` 迁移，移除 IIFE wrapper，改为 `export const`
2. 创建 `src/content/core/element-finder.js` — 从 `src/content/element-finder.js` 迁移，导出 `findAllEditableElements`, `getElementValue`, `setElementValue`, `startObserving`, `stopObserving`
3. 创建 `src/content/core/text-highlighter.js` — 从 `src/content/text-highlighter.js` 迁移，导出 `highlightElement`, `clearHighlight`, `clearAllHighlights`
4. 创建 `src/content/core/text-replacer.js` — 从 `src/content/text-replacer.js` 迁移，导出 `findMatches`, `goToPrevMatch`, `goToNextMatch`, `replaceOne`, `replaceAll`, `startListening`, `stopListening`
5. 创建 `src/shared/utils.js` — 提取通用工具函数（escapeHTML, generateId, debounce 等）
6. 所有模块使用 `import { ... } from '../shared/constants.js'` 替代 `window.TextReplacerConstants`
7. 删除旧的 IIFE 文件（或保留到 T8 验证完成后删除）

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 文件结构检查 | `src/shared/constants.js`, `src/content/core/element-finder.js`, `text-highlighter.js`, `text-replacer.js` 存在 |
| 检查 import 语句 | 所有模块间引用使用 ES6 `import`，无 `window.TextReplacer*` |
| 检查 export 语句 | 每个模块导出对应的 public API |
| `npm run build` | 构建成功，无 "TextReplacerConstants is not defined" 等运行时错误 |

---

#### T3 [SERIAL] · MessageProxy + CQRS 骨架

**WHAT TO DO:**
1. 创建 `src/content/message-proxy.js`
2. 实现 `MessageProxy` 类：
   - `command(name, payload)` → 返回 Promise，内部调用 engine 对应方法
   - `on(eventName, handler)` → 注册事件监听
   - `emit(eventName, data)` → 触发事件通知 panel
3. 定义初始命令映射：
   - `search` → engine.findMatches
   - `replaceOne` → engine.replaceOne
   - `replaceAll` → engine.replaceAll
   - `navigate` → engine.goToPrevMatch / goToNextMatch
4. 定义初始事件：
   - `matches:updated` → panel 更新计数和按钮状态
   - `replace:completed` → panel 显示结果提示
5. 确保 MessageProxy 在 Shadow DOM 边界两侧都能访问（export 单例）

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| `import { proxy } from './message-proxy.js'` | 导入成功 |
| `proxy.command('search', { text: 'test', options })` | 返回 Promise<SearchResult> |
| `proxy.on('matches:updated', handler)` | handler 在搜索完成后被调用 |
| 模块构建 | `npm run build` 无错误 |

---

#### T4 [PARALLEL] · background/index.js 迁移

**WHAT TO DO:**
1. 创建 `src/background/index.js`（替代 `src/background/service-worker.js`）
2. 迁移现有逻辑：`chrome.commands.onCommand` → 获取 tab → `sendMessage`
3. 从 `src/shared/constants.js` import `MessageActions`
4. 保持 fallback：content script 未注入时 `chrome.scripting.executeScript`
5. 引用路径更新为 `dist/content.js`
6. 保留 `chrome.runtime.onInstalled` 日志

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| `npm run build` | dist/background.js 生成，IIFE 格式 |
| 加载扩展 → Ctrl+Shift+H | Service Worker 无错误日志 |
| content script 未注入场景 | fallback 注入后成功显示面板 |

---

#### T5 [PARALLEL] · content/index.js（Shadow DOM host + 入口）

**WHAT TO DO:**
1. 创建 `src/content/index.js`（替代 `src/content/content.js`）
2. 导入 `MessageProxy`、`engine`、`panel` 等模块
3. 监听 `chrome.runtime.onMessage`，收到 `SHOW_REPLACER_PANEL` → `panel.show()`
4. 管理 Shadow DOM host 生命周期：
   - 首次调用：创建 `<div id="text-replacer-host">` → `document.body.appendChild` → `host.attachShadow({ mode: 'open' })`
   - 调用 `panel.render(shadowRoot)` 渲染 UI
   - 后续调用：`host.hidden = false`
   - 关闭：`host.hidden = true`
5. 确保 host 的 z-index 为 `2147483647`（Shadow DOM 外只有这一个元素需要 z-index）
6. 保留引擎初始化逻辑（MutationObserver 等）

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 加载扩展，打开任意页面 | `#text-replacer-host` 元素存在于 body |
| Ctrl+Shift+H 首次 | host.shadowRoot 非 null，面板在 Shadow Root 内渲染 |
| 关闭面板 | `host.hidden = true`，Shadow Root 内 DOM 保留 |
| 再次 Ctrl+Shift+H | 面板立即显示，搜索状态保留 |
| 检查 host z-index | 未被页面其他元素覆盖 |

---

#### T6 [PARALLEL] · ui/panel.js（Shadow Root 内渲染面板 UI）

**WHAT TO DO:**
1. 创建 `src/content/ui/panel.js` — 核心面板渲染逻辑
2. 创建 `src/content/ui/search-bar.js` — 查找输入框 + 工具按钮（Aa/Ab/.*）+ 导航按钮 + 匹配计数
3. 创建 `src/content/ui/replace-bar.js` — 替换输入框 + ↶/↺ 按钮 + 👁 预览按钮 + ✓ 应用预览按钮
4. 创建 `src/content/ui/toolbar.js` — 更多菜单 `⋯`（主题/历史入口）
5. 面板组件仅通过 MessageProxy 与 engine 通信，不直接引用 engine 模块
6. 实现 150ms 输入防抖 → `proxy.command('search', ...)`
7. 监听 `proxy.on('matches:updated', ...)` 更新 UI
8. panel 暴露 `render(shadowRoot)`, `show()`, `hide()` 方法

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 面板打开 | 查找输入框自动聚焦 |
| 输入"测试文本" | 150ms 后高亮出现，匹配计数 "1/5" |
| 点击 Aa 按钮 | 按钮激活态切换，搜索重新执行 |
| 点击 ↓ | 当前匹配切换，滚动到下一匹配 |
| 点击 × | 面板关闭，高亮清除 |
| 点击 ▶ | 替换行折叠/展开切换 |

---

#### T7 [PARALLEL] · 样式迁移（CSS 内联 + 自定义属性）

**WHAT TO DO:**
1. 重命名 `src/styles/replacer-panel.css` → `src/styles/panel.css`
2. 将所有颜色值抽取为 CSS 自定义属性（使用 `var(--tr-bg, #252526)` 格式保留 fallback）：
   - `--tr-bg` / `--tr-text` / `--tr-border` / `--tr-input-bg` / `--tr-btn-hover`
   - `--tr-accent` / `--tr-highlight-match` / `--tr-highlight-current`
3. 移除面板的 `position: fixed; top: 20px; right: 20px;`→ 这些属性移到 host 元素（Shadow DOM 外部）
4. 在 `panel.js` 中 `import panelCSS from '../styles/panel.css'`（esbuild text loader）→ `shadowRoot.innerHTML = <style>${panelCSS}</style> + panelHTML`
5. 保留 `replacer-panel.css` 中的页面级高亮样式（`.tr-highlight-match`, `.tr-highlight-overlay` 等）→ 这些通过 `TextHighlighter.ensureStylesInjected()` 注入到页面 DOM 和 iframe

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 面板打开 | 深色主题渲染正确，与 V1.0 外观一致 |
| 检查 Shadow Root 内 `<style>` | 包含完整面板样式 |
| 高亮渲染 | 页面内黄色高亮正常（通过 ensureStylesInjected） |
| 响应式 | 小屏幕面板宽度自适应 |

---

#### T8 [PARALLEL] · manifest.json 更新 + 构建验证

**WHAT TO DO:**
1. 更新 `manifest.json`：
   - `background.service_worker`: `"dist/background.js"`
   - `content_scripts[0].js`: `["dist/content.js"]`（单文件）
   - 添加 `"storage"` 权限
   - 保留 `"web_accessible_resources"` 中的 CSS 声明（后续 V1.2 可能需要，不急于移除）
2. 运行 `npm run build` 确认构建成功
3. 在 Chrome `chrome://extensions/` 加载项目根目录
4. 在有可编辑元素的页面（如 test-page.html）执行 6 项 smoke test
5. 验证 dist/ 文件体积不超过 V1.0 6 文件总和的 120%
6. 确认无 `window.TextReplacer*` 全局变量泄漏

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| `npm run build` | 0 errors, 0 warnings |
| Chrome 加载扩展 | 无 "manifest invalid" 错误 |
| Ctrl+Shift+H | 面板在 Shadow Root 内正常显示 |
| Smoke S1-S6 | 全部通过（参考 Verification Strategy） |
| 检查 `window.TextReplacerConstants` | `undefined` |
| 对比 body 中 host 元素 | 不被测试页面任何元素覆盖 |

---

### Wave 2 — Feature Implementation (V1.2)

#### T9 [PARALLEL] · storage/store.js + 历史记录 UI

**WHAT TO DO:**
1. 创建 `src/storage/store.js`：
   - `saveHistory(entry)` — 写入历史记录，自动 LRU 淘汰（上限 20 条）
   - `getHistory()` — 读取最近 20 条历史
   - `savePreset(preset)` / `getPresets()` / `deletePreset(id)` — 预设 CRUD（上限 100 条）
   - `importPresets(json)` / `exportPresets()` — 导入导出 JSON
   - `saveTheme(config)` / `getTheme()` — 主题偏好读写
   - 所有操作基于 `chrome.storage.local`
2. 存储 Schema（参考设计文档第四章）：
   - `text-replacer-meta`：索引（recentHistoryIds, presetIds, favoriteIds）
   - `text-replacer-history`：历史记录 map（id → { findText, replaceText, options, timestamp }）
   - `text-replacer-presets`：预设 map（id → { name, findText, replaceText, options, createdAt }）
3. 创建 `src/content/ui/history-menu.js` — 更多菜单中的历史/预设下拉面板
4. 每次成功替换后自动保存到历史（`store.saveHistory(...)`）
5. 历史列表显示 findText → replaceText 简写，点击即填入查找/替换输入框

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 执行一次替换 → 关闭面板 → 重新打开 | 历史列表中最近一次替换记录可见 |
| 点击历史记录 | 查找/替换输入框自动填入对应文本 |
| 执行 25 次不同替换 | 仅保留最近 20 条（LRU 淘汰） |
| 通过预设面板导出 JSON | 下载包含所有预设的 JSON 文件 |
| 在另一设备导入 JSON | 预设列表正确恢复 |
| chrome.storage.local 检查 | 三个 key 存在且数据结构正确 |

---

#### T10 [PARALLEL] · 预设规则（CRUD + 导入导出）

**WHAT TO DO:**
1. 在 `history-menu.js` 中扩展预设管理 UI：
   - 预设列表（名称 + 查找/替换预览）
   - 「保存当前为预设」按钮 — 将当前查找/替换文本保存为命名预设
   - 「删除预设」按钮（带确认）
   - 「导出全部」按钮 — `store.exportPresets()` → 触发 JSON 下载
   - 「导入」按钮 — 文件选择器 → `store.importPresets(json)`
2. 实现一键复用：点击预设 → 填入查找/替换输入框 + 恢复搜索选项（大小写/全词/正则）
3. 预设上限 100 条，超出时拒绝保存并提示
4. 为预设列表增加搜索/过滤功能（按名称过滤）

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 输入查找"foo"替换"bar" → 保存为预设 "清理foo" | 预设列表新增 "清理foo" |
| 点击 "清理foo" 预设 | 查找输入框="foo"，替换输入框="bar" |
| 保存第 101 个预设 | 提示"预设已满（上限100条）" |
| 导出 → 修改 JSON → 导入 | 预设列表更新为新导入的数据 |
| 删除预设 → 确认 | 预设从列表移除 |

---

#### T11 [PARALLEL] · 快捷键升级

**WHAT TO DO:**
1. 在 `ui/search-bar.js` 中修改 keydown 处理：
   - 焦点在查找输入框时：`Enter` = 跳下一个匹配，`Shift+Enter` = 跳上一个匹配
   - 焦点在替换输入框时：`Enter` = 替换当前（`replaceOne`）
2. 在 `ui/panel.js` 中添加全局 keydown：
   - `Escape` → 关闭面板 + 恢复页面原始焦点元素
   - `Tab` → 在查找输入框和替换输入框之间切换焦点（不跳出面板）
3. 关闭面板时保存当前页面焦点元素（`document.activeElement`），关闭后 `focus()` 恢复

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 焦点在查找输入框 → Enter | 跳转到下一个匹配，橙色高亮切换 |
| 焦点在查找输入框 → Shift+Enter | 跳转到上一个匹配 |
| 焦点在替换输入框 → Enter | 当前匹配被替换，跳到下一个 |
| Tab | 焦点在查找/替换输入框之间切换，不跳出面板 |
| Escape | 面板关闭，原页面焦点恢复 |
| 面板关闭后原焦点恢复 | test-page.html 中原先聚焦的 input 重新获得焦点 |

---

#### T12 [PARALLEL] · 预览模式

**WHAT TO DO:**
1. 在 `src/content/core/text-replacer.js` 中新增预览状态管理：
   - `previewMatches[]` — 所有匹配项及替换状态
   - `togglePreviewMatch(index)` — 切换绿色（替换）/ 黄色（不替换）
   - `executeDoubleReplace(index, replaceText)` — 双击即时替换单个匹配
   - `applyPreviewedReplacements(replaceText)` — 批量替换所有标记为绿色的匹配
2. 在 `src/content/core/text-highlighter.js` 中扩展：
   - `highlightElement` 支持第三个颜色参数：`default` / `preview-selected`（绿）/ `preview-skipped`（黄）
   - 预览模式下 overlay `pointer-events: auto` → 绑定 click/dblclick
3. 在 `ui/replace-bar.js` 中：
   - 预览按钮（👁）：有匹配时可见 → 点击进入预览模式
   - 应用预览按钮（✓）：预览模式下显示，默认灰色 → 选中≥1项后激活
   - 预览模式中点击 👁 = 取消预览（恢复黄色搜索高亮）
4. 预览交互：
   - 单击高亮 → `togglePreviewMatch(i)` → 颜色切换绿/黄
   - 双击高亮 → `e.stopPropagation()` + `executeDoubleReplace(i)` → 即时替换该匹配 → 从预览列表移除
   - 点击 ✓ → 批量执行所有绿色匹配的替换 → 显示结果 → 退出预览

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 搜索"测试文本" → 点击 👁 | 所有匹配变为黄色（预览模式），✓ 按钮出现（灰态） |
| 单击第 2 个高亮 | 变为绿色，✓ 按钮激活，匹配计数显示"已选 1" |
| 单击第 3 个高亮再单击一次 | 恢复黄色（取消选中），匹配计数更新 |
| 双击第 1 个高亮 | 该匹配立即被替换，从预览列表移除 |
| 点击 ✓ | 所有绿色标记的匹配被批量替换，显示"已替换 N 处" |
| 预览模式中点击 👁 | 退出预览，恢复黄色搜索高亮，✓ 按钮消失 |
| 未选中任何匹配时 ✓ | 按钮保持灰态不可点击 |

---

#### T13 [PARALLEL] · 主题系统（Light/Dark/Auto）

**WHAT TO DO:**
1. 在 `ui/theme-picker.js` 中实现主题切换逻辑：
   - `applyTheme(mode)` — 设置 CSS 变量值
   - Light 模式：白色背景 (#ffffff)，深色文字 (#333333)，浅灰边框
   - Dark 模式：VSCode 风格 (#252526)，保持现有样式
   - Auto 模式：`matchMedia('(prefers-color-scheme: dark)')` 监听系统切换
2. 将 `panel.css` 中的硬编码颜色全部替换为 `var(--tr-*, fallback)`：
   - `--tr-bg`, `--tr-text`, `--tr-border`, `--tr-input-bg`, `--tr-input-text`
   - `--tr-btn-hover`, `--tr-btn-active`, `--tr-accent`
   - `--tr-highlight-match`, `--tr-highlight-current`
3. 主题偏好通过 `store.saveTheme()` / `store.getTheme()` 持久化
4. 初始化时自动加载上次保存的主题

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 面板打开 → 更多 → 选择 Light | 面板背景变白，文字变深色 |
| 切换回 Dark | 面板恢复 VSCode 深色风格 |
| 选择 Auto → 系统切换到暗色 | 面板自动切换为 Dark |
| 选择 Auto → 系统切换到亮色 | 面板自动切换为 Light |
| 关闭浏览器 → 重新打开 → 打开面板 | 上次选择的主题保持 |
| Light 模式下输入框 | 背景浅灰，文字深色，清晰可读 |

---

#### T14 [PARALLEL] · Custom 取色器 + 更多菜单整合

**WHAT TO DO:**
1. 在 `ui/theme-picker.js` 中扩展 Custom 模式：
   - 三个 `<input type="color">` 取色器，分别控制：
     - 面板主色调（背景 + 文字色自动派生）
     - 搜索匹配高亮色（`--tr-highlight-match`）
     - 预览将被替换高亮色（`--tr-preview-selected`）
   - 预览不替换高亮色与搜索高亮色一致（`--tr-highlight-match`）
2. 实时预览：取色器值变更 → 立即 `shadowRoot.host.style.setProperty()` 更新
3. 保存 Custom 配置到 `store.saveTheme({ mode: 'custom', custom: {...} })`
4. 在 `ui/toolbar.js` 中整合「更多」菜单：
   - 🎨 主题子菜单（Light / Dark / Auto / Custom → 取色器面板）
   - 📋 历史记录 / 预设面板入口
5. 更多菜单点击外部自动关闭（click-outside 监听）

**QA SCENARIOS:**
| 步骤 | 预期 |
|------|------|
| 更多 → 主题 → Custom | 显示 3 个取色器 + 预定义色板 |
| 修改面板主色调取色器 | 面板背景色实时变化 |
| 修改搜索高亮取色器 | 搜索匹配高亮颜色实时变化 |
| 修改预览高亮取色器 | 预览模式绿色高亮颜色实时变化 |
| 选择预定义色板 | 三个取色器同步更新 |
| 关闭面板 → 重新打开 | Custom 配置保持，取色器值正确 |
| 点击更多菜单外部 | 菜单自动关闭 |

---

### Final Verification Wave

| # | 任务 | 操作 | 预期 |
|---|------|------|------|
| F1 | 构建验证 | `npm run build` | 0 errors, 0 warnings, dist/ 文件存在 |
| F2 | 加载验证 | Chrome 加载项目目录 | 无 manifest 错误，扩展图标正常 |
| F3 | Smoke S1-S6 | 在 test-page.html 执行 6 场景 | 全部通过 |
| F4 | 全局泄漏检查 | `Object.keys(window).filter(k => k.startsWith('TextReplacer'))` | 空数组 |
| F5 | Shadow DOM 检查 | `document.querySelector('#text-replacer-host').shadowRoot !== null` | true |
| F6 | 构建体积检查 | `dist/content.js` 体积对比 V1.0 6 文件总和 | < 120% |
| F7 | 存储检查 | `chrome.storage.local.get(null, console.log)` | 三 key 结构正确 |

---

