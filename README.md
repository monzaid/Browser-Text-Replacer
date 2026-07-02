# 文本替换助手 (Text Replacer Helper)

一个基于 Manifest V3 开发的浏览器插件，通过快捷键快速替换网页上所有可编辑元素中的文本。

## 功能特点

- ⌨️ **快捷键触发**：按 `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) 快速打开替换面板
- 🌐 **全局替换**：一次性替换页面上所有可编辑元素中的文本
- 🎯 **多种元素支持**：
  - 文本输入框 (`<input type="text">`)
  - 搜索框 (`<input type="search">`)
  - 邮箱输入 (`<input type="email">`)
  - 文本域 (`<textarea>`)
  - 富文本编辑器 (`[contenteditable]`)
- 🎨 **美观界面**：右上角悬浮面板，支持深色主题
- 📊 **替换统计**：显示替换结果和匹配数量
- ⚡ **即时反馈**：实时显示替换进度和结果

## 安装方法

### 开发模式安装

1. 克隆或下载此项目到本地
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目根目录
6. 安装完成！

### 准备图标文件

在安装前，请确保 `icons/` 目录下有以下尺寸的图标文件：
- `icon16.png` (16x16)
- `icon32.png` (32x32)
- `icon48.png` (48x48)
- `icon64.png` (64x64)
- `icon128.png` (128x128)

如果没有图标，可以暂时使用占位图片或从网上下载免费图标。

## 使用方法

1. 在任意网页上，按下 `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`)
2. 右上角会弹出替换面板
3. 输入要查找的文本
4. 输入替换后的文本
5. 点击「替换」按钮或按回车键执行替换
6. 查看替换结果统计

## 项目结构

```
text-replacer-extension/
├── manifest.json              # Manifest V3 配置文件
├── icons/                     # 插件图标
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon64.png
│   └── icon128.png
├── src/
│   ├── background/            # 后台服务
│   │   └── service-worker.js  # Service Worker
│   ├── content/               # 内容脚本
│   │   ├── content.js         # 主入口
│   │   ├── element-finder.js  # 元素查找器
│   │   ├── text-replacer.js   # 替换逻辑
│   │   └── ui-injector.js     # UI 注入器
│   ├── styles/                # 样式文件
│   │   └── replacer-panel.css
│   └── utils/                 # 工具模块
│       └── constants.js       # 常量定义
├── plans/                     # 设计文档
│   └── text-replacer-extension-design.md
└── README.md                  # 本文件
```

## 技术栈

- **Manifest V3**：最新的浏览器扩展 API
- **ES6 Modules**：使用 ES6 模块化开发
- **Vanilla JavaScript**：纯原生 JavaScript，无依赖

## 开发说明

### 快捷键修改

如需修改快捷键，可以编辑 `manifest.json` 中的 `commands` 配置：

```json
{
  "commands": {
    "toggle-replacer": {
      "suggested_key": {
        "default": "Ctrl+Shift+H",
        "mac": "Command+Shift+H"
      }
    }
  }
}
```

用户也可以在 `chrome://extensions/shortcuts` 中自定义快捷键。

### 添加新的可编辑元素类型

编辑 `src/utils/constants.js` 中的 `EditableSelectors` 数组：

```javascript
export const EditableSelectors = [
  'input[type="text"]',
  'input[type="search"]',
  // 添加新的选择器...
];
```

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 查找文本为空 | 禁用替换按钮，显示提示 |
| 未找到匹配 | 显示"未找到匹配文本"警告 |
| 元素被隐藏/禁用 | 自动跳过这些元素 |
| contenteditable 元素 | 使用 innerText 处理 |

## 浏览器兼容性

- Chrome 88+
- Edge 88+
- 其他基于 Chromium 的浏览器

## 许可证

MIT License

## 作者

Roo Code

---

如有问题或建议，欢迎反馈！
