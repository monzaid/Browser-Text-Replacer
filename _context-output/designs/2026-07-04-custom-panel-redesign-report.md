# 自定义面板重设计 + 测试验收调整报告

**日期**: 2026-07-04  
**范围**: 文本替换助手 V2 — 自定义主题面板 UI 升级 + 批量操作修复 + 输入体验优化

---

## 1. 面板布局重设计

### 1.1 垂直布局重构

自定义面板 (`#tr-custom-panel`) 从内联 flex 改为结构化垂直布局：

```
🎨 自定义主题                              [×]
┌─────────────────────────────────────────┐
│ 面板主色 [🎨] #252526                    │
│ 搜索高亮 [🎨] #ffd700                    │  ← 水平单行
│ 预览高亮 [🎨] #00ff00                    │
├─────────────────────────────────────────┤
│ 预设色板                    [💾] [🗑]   │
│ [Monokai] [Nord] [Solarized Dark] ...   │
└─────────────────────────────────────────┘
```

**变更点**:
- 取色器三行 → 水平单行 (`flex-direction: row; gap: 10px`)
- 每个取色器后追加 hex 值显示 (`#tr-color-panel-hex` 等)
- 预设按钮统一风格：`height: 24px; padding: 0 8px; font-size: 12px`
- 标题行：左侧 "🎨 自定义主题" + 右侧关闭按钮 `[×]`
- 分隔线区分颜色选择区和预设区

**涉及文件**: `src/content/ui/replace-bar.js` (L112-194)

---

## 2. 保存/删除交互升级

### 2.1 自定义输入弹窗（替代浏览器 prompt）

新增 `showPrompt(title, defaultValue)` — Shadow DOM 内渲染的自定义输入弹窗：

- 标题 + 输入框 + 确认/取消按钮
- 支持 Enter 确认、Escape 取消
- 自动聚焦并全选默认值
- 样式统一：`var(--tr-bg)`, `var(--tr-accent)` 等 CSS 变量

**代码位置**: `replace-bar.js` — `showPrompt()` (L68-111)

### 2.2 颜色预设保存流程

```
[💾] 点击 → showPrompt("预设名称:") → savePreset(name, __color_preset__{...})
       → showToast("保存成功")
       → renderAllPresetsInCustomPanel()     // 刷新自定义面板预设区
       → loadPresetItemsForPanel()           // 同步刷新历史面板预设Tab
```

存储格式：`findText = '__color_preset__' + JSON.stringify({ panelBg, searchHighlight, previewHighlight })`

### 2.3 批量删除颜色预设

```
[🗑] 点击 → 进入批量选择模式（按钮变 ✓）
  → 显示颜色预设复选框列表（仅过滤 __color_preset__ 前缀的预设）
  → 每项：☑ + 色块预览 + 名称
[✓] 再次点击：
  ├─ 无选中 → 静默退出批量模式，恢复预设按钮
  ├─ 有选中 → showConfirm("确认删除 N 条？")
  │   ├─ 取消 → 退出批量模式
  │   └─ 确认 → deletePreset() × N → exitColorBatchMode() → showToast
  └─ 所有退出路径统一调用 exitColorBatchMode()
```

**关键修复**: `renderAllPresetsInCustomPanel()` 使用 `#tr-custom-preset-btns` ID 选择器而非 `.tr-preset-btn?.parentElement`，确保批量模式（DOM 中无 `.tr-preset-btn`）下仍能找到容器。

---

## 3. 双面板同步刷新

| 操作 | 自定义面板 | 历史/预设面板 |
|------|-----------|-------------|
| 保存颜色预设 | `renderAllPresetsInCustomPanel()` | `loadPresetItemsForPanel()` |
| 批量删除（自定义面板） | `exitColorBatchMode()` | `loadPresetItemsForPanel()` |
| 批量删除（历史面板） | `renderAllPresetsInCustomPanel()` | `exitBatchMode()` |
| 单个删除（历史面板） | `renderAllPresetsInCustomPanel()` | `loadPresetItemsForPanel()` |
| 打开自定义面板 | `renderAllPresetsInCustomPanel()` | — |

通过模块级变量 `_customPanel` 和 `_historyPanel` 实现跨面板引用。

---

## 4. 输入体验优化

### 4.1 Tab 键输入支持

移除 `panel.js` 中拦截 Tab 键切换焦点的逻辑。查找输入框和替换输入框均为 `<textarea>`，现在 Tab 正常输入制表符。

**影响**: 用户需通过鼠标点击切换输入框焦点。

**涉及文件**: `src/content/ui/panel.js` (删除 L67-80)

---

## 5. 缺陷修复清单

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | 保存按钮弹出浏览器原生 prompt | 使用 `prompt()` | 新增 `showPrompt()` 自定义弹窗 |
| 2 | 批量删除按钮无响应 | `#tr-preset-batch-del-color-btn` 未绑定事件 | 添加点击处理 + 批量选择逻辑 |
| 3 | 保存后预设区无新增项 | 预设区仅渲染 5 个硬编码按钮 | 新增 `renderAllPresetsInCustomPanel()` 渲染硬编码 + 用户预设 |
| 4 | 无选中时弹 toast | `return` 前未退出批量模式 | 静默调用 `exitColorBatchMode()` |
| 5 | 取消确认后卡在批量列表 | `showConfirm` 返回 false 直接 return | 统一 `exitColorBatchMode()` 清理 |
| 6 | 删除后自定义面板卡在批量列表 | `.tr-preset-btn?.parentElement` 在批量模式下返回 null | 改用 `#tr-custom-preset-btns` ID 选择器 |
| 7 | 历史面板删除/取消后卡在批量列表 | 同上退出路径缺失 | 新增 `exitBatchMode()` 统一处理 |
| 8 | 历史面板删预设后自定义面板不同步 | 缺少跨面板刷新 | 追加 `renderAllPresetsInCustomPanel(_customPanel)` |
| 9 | Tab 键不能输入制表符 | `panel.js` keydown 拦截 Tab 并 preventDefault | 移除 Tab 键拦截逻辑 |

---

## 6. 新增/修改文件

| 文件 | 变更 |
|------|------|
| `src/content/ui/replace-bar.js` | +300 行 — 垂直布局、showPrompt/showConfirm 弹窗、renderAllPresetsInCustomPanel、loadColorPresetsForBatch、reBindPresetButtons、bindUserColorPresetButton、exitColorBatchMode/exitBatchMode、跨面板同步 |
| `src/content/ui/panel.js` | -13 行 — 移除 Tab 键焦点循环逻辑 |

**构建产物**: `dist/content.js` (134.4kb) + `dist/background.js` (1.3kb)，0 errors。
