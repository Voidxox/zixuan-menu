# 滋味轩点餐

滋味轩川菜馆的纯静态点餐页面，支持单人点餐、预算计算、历史记录、盲盒推荐，以及基于 Firebase Realtime Database 的多人协同点餐。

## 快速开始

项目依赖 ES module，不能直接双击 `index.html`。在项目目录启动一个静态服务器：

```powershell
Set-Location D:\vibe-coding\zixuan-menu
python -m http.server 8000
```

然后打开 <http://localhost:8000/>。

## 后续改需求改哪里

| 需求 | 修改位置 |
| --- | --- |
| 新增、下架或调整菜品价格 | `src/data/menu-data.js` 中的 `menuData` |
| 调整菜品分类、口味标签或拼音首字母 | `src/data/menu-data.js` |
| 调整颜色、布局、移动端适配 | `src/styles.css` |
| 修改搜索、购物车、预算、推荐、历史记录 | `src/app.js` |
| 修改多人房间、昵称、实时同步 | `src/app.js` 中的 Firebase 协同区域 |
| 修改按价格浏览的上下浮动范围 | `src/app.js` 中的 `PRICE_BROWSE_TOLERANCE` |
| 修改页面结构或新增 DOM 容器 | `index.html` |
| 修改 Firebase 部署目标或数据库规则 | `.firebaserc`、`firebase.json`、`firebase-database.rules.json` |

## 目录结构

```text
index.html                 页面结构和外部 SDK 引用
src/
├── app.js                 页面状态、交互和 Firebase 协同逻辑
├── styles.css             全部页面样式
└── data/
    └── menu-data.js       菜品数据、分类名称和拼音映射
firebase.json              Firebase 部署配置
firebase-database.rules.json
                            Realtime Database 规则
.firebaserc                Firebase 项目绑定
```

## 新增菜品示例

在 `src/data/menu-data.js` 的 `menuData` 数组中增加一项：

```js
{ id: 125, name: "新菜品", price: 28, cat: "xiaochao", tastes: ["mild", "veg"] }
```

可选字段 `unit` 用于显示“/瓶”“/只”等单位。`id` 必须唯一，`cat` 使用现有分类键：`liangcai`、`xiaochao`、`tese`、`tang`、`jiushui`。

## 发布

这是 GitHub Pages 兼容的无构建项目。修改后提交并推送 `main` 分支即可：

```powershell
git add index.html src README.md .gitignore
git commit -m "描述本次修改"
git push origin main
```

在线地址：<https://voidxox.github.io/zixuan-menu/>。

## 注意事项

- Firebase SDK 使用 CDN；多人协同需要网络和正确的 Firebase 配置。
- Firebase 默认配置和本地覆盖配置的处理仍在 `src/app.js` 中，浏览器本地覆盖键为 `zixuan_firebase`。
- “按价格浏览”默认是独立浏览，不修改当前搜索、分类、购物车、人数或多人房间；点击结果右侧加号后，才会按现有点菜逻辑加入当前购物车。
- 当前 `firebase-database.rules.json` 允许 `rooms` 节点公开读写。若用于正式业务，修改规则前应先设计身份校验和房间权限。
- `index.html` 保持为页面结构入口，新增业务逻辑优先放入 `src/app.js`，避免重新把大量代码写回 HTML。
