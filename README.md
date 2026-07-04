# 文本替换助手 (Text Replacer Helper)

基于 Manifest V3 + Shadow DOM 隔离的浏览器扩展。通过快捷键唤起面板，在网页上进行查找、高亮、替换、预览替换等操作。

## 功能特点

### 核心
- ⌨️ **快捷键触发**：`Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) 唤起/关闭面板
- 🔍 **实时搜索高亮**：输入即搜索，匹配项黄色高亮，当前匹配橙色高亮
- ✏️ **智能替换**：当前匹配不可见时先跳转居中，再次点击执行替换
- 👁 **预览替换**：进入预览模式，单击选中绿色标记，双击直接替换，批量应用
- 📋 **正则/大小写/全词**：三种搜索选项自由组合
- 📊 **匹配计数**：实时显示 `当前 / 总数`

### 主题
- 🎨 **四模式主题循环**：`自动 → 浅色 → 深色 → 自定义`，一键切换
- 🖌 **自定义取色器**：面板主色 / 搜索高亮 / 预览高亮 三通道独立调节
- 💾 **颜色预设保存**：将当前配色保存为预设，支持批量删除
- 🎛 **内置色板**：Monokai、Nord、Solarized Dark/Light、One Dark

### 数据
- 📝 **历史记录**：记录最近查找/替换操作，点击回填
- ⭐ **预设规则**：收藏常用查找→替换对，支持新增/修改/删除/导入/导出
- 💾 **chrome.storage.local 持久化**：主题、预设跨会话保留

## 安装方法

### 开发模式安装

1. 克隆项目并安装依赖：`npm install`
2. 构建：`npm run build`
3. 打开 Chrome，进入 `chrome://extensions/`
4. 开启「开发者模式」→「加载已解压的扩展程序」→ 选择项目根目录

### 图标文件

`icons/` 目录需包含：`icon16.png` / `icon32.png` / `icon48.png` / `icon64.png` / `icon128.png`

## 使用方法

| 操作 | 方式 |
|------|------|
| 唤起面板 | `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) |
| 查找 | 在查找输入框输入文本 |
| 导航匹配 | `Enter` 下一个 / `Shift+Enter` 上一个 |
| 替换当前 | 点击替换按钮或替换输入框 `Enter` |
| 全部替换 | 点击「全部替换」按钮 |
| 预览替换 | 点击 👁 进入预览，单击选中/双击替换，✓ 批量应用 |
| 切换主题 | 点击 🔄 循环：自动→浅色→深色→自定义 |
| 历史/预设 | 点击 📋 |
| 关闭面板 | `Escape` |

用户可在 `chrome://extensions/shortcuts` 自定义快捷键。

## 项目结构

```
text-replacer-extension/
├── manifest.json
├── package.json
├── vitest.config.js
├── scripts/
│   └── build.js               # esbuild 双入口构建脚本
├── icons/                     # 插件图标
├── dist/                      # 构建产物
│   ├── content.js             # ESM content script
│   └── background.js          # IIFE background script
├── src/
│   ├── background/
│   │   └── index.js           # Service Worker
│   ├── content/
│   │   ├── index.js           # Shadow DOM host 管理 + 入口
│   │   ├── message-proxy.js   # panel ↔ engine 消息代理 (CQRS)
│   │   ├── core/
│   │   │   ├── element-finder.js
│   │   │   ├── text-highlighter.js
│   │   │   └── text-replacer.js
│   │   └── ui/
│   │       ├── panel.js       # 面板 show/hide/render
│   │       ├── search-bar.js  # 查找输入框 + 搜索选项
│   │       ├── replace-bar.js # 替换栏 + 主题 + 历史/预设 + 自定义面板
│   │       └── theme-picker.js# 主题定义 + applyCustomColors
│   ├── storage/
│   │   └── store.js           # chrome.storage.local 读写 (CQRS)
│   ├── shared/
│   │   ├── constants.js       # UIConstants, Icons, EditableSelectors
│   │   └── utils.js
│   └── styles/
│       ├── panel.css
│       └── overlay.css
├── test/                      # Vitest 单元测试
├── context/                   # AI 上下文 (设计/决策)
├── context-output/            # AI 产出物 (设计文档/报告)
└── plans/                     # 战略规划文档
```

## 技术栈

- **Manifest V3** — Chrome 扩展最新规范
- **Shadow DOM** — 面板与页面 DOM 完全隔离，CSS 不泄漏
- **esbuild** — 双入口打包 (content: ESM, background: IIFE)
- **MessageProxy + CQRS** — panel ↔ content engine 命令/事件通信
- **chrome.storage.local** — 三键存储 (history / presets / meta)
- **Vanilla JS** — 零运行时依赖

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| 查找文本为空 | 禁用替换按钮 |
| 未找到匹配 | 显示"无结果" |
| 动态加载元素 | MutationObserver 自动刷新高亮 |
| iframe 内匹配 | overlay 覆盖 + 偏移修正 |
| contenteditable | 本地文本节点索引映射 |
| Bootstrap modal | 临时移除 `tabindex="-1"` 焦点陷阱 |
| 当前匹配不在视口 | 首次替换跳转居中，再次执行替换 |
| 跨域 iframe | 静默忽略 |

## 浏览器兼容性

- Chrome 88+
- Edge 88+
- 其他 Chromium 内核浏览器

## 开发命令

```bash
npm run build     # 构建
npm test          # 运行 Vitest
```

## 许可证

MIT License

