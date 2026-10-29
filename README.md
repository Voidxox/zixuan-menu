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
| 调整菜品图片 | `src/assets/menu/` 中的图片文件及 `menuData` 的 `image` 字段 |
| 调整菜品分类、口味标签或拼音首字母 | `src/data/menu-data.js` |
| 调整颜色、布局、移动端适配 | `src/styles.css` |
| 修改搜索、购物车、预算、推荐、历史记录 | `src/app.js` |
| 修改多人房间、昵称、实时同步 | `src/app.js` 中的 Firebase 协同区域 |
| 修改菜品口碑、评分与短评 | `src/dish-ratings.js`、`index.html` 中的评分面板、`src/styles.css` |
| 修改按价格浏览的上下浮动范围 | `src/app.js` 中的 `PRICE_BROWSE_TOLERANCE` |
| 修改页面结构或新增 DOM 容器 | `index.html` |
| 修改 Firebase 部署目标或数据库规则 | `.firebaserc`、`firebase.json`、`firebase-database.rules.json` |

## 目录结构

```text
index.html                 页面结构和外部 SDK 引用
src/
├── app.js                 页面状态、交互和 Firebase 协同逻辑
├── styles.css             全部页面样式
├── assets/
│   └── menu/              菜品卡片图片
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

可选字段 `unit` 用于显示“/瓶”“/只”等单位，`image` 用于绑定 `src/assets/menu/` 下的菜品图片。价格未知时使用 `price: null, priceLabel: "时价"`，这类菜品会展示但暂不计入预算，也不能直接加入在线点菜单。`id` 必须唯一，`cat` 使用现有分类键：`liangcai`、`xiaochao`、`tese`、`tang`、`jiushui`。

## 发布

### 菜品口碑

菜品口碑独立使用 Firebase 项目 `zixuan-menu`，Web 配置位于 `src/data/ratings-config.js`，通过名为 `dish-ratings` 的 Firebase 应用连接；现有多人点餐仍使用默认应用与 `ziweixuan` 项目配置。口碑保存在 `dishReviews/{dishId}/{uid}`，全站共享，独立于点餐房间。首次使用评分时创建持久化匿名身份，无需注册；昵称必填（1～12 字），短评选填（最多 80 字）。同一浏览器对同一道菜覆盖更新，人数不会因改分增加。清除站点数据、无痕或换设备会视为新身份。

1～5 星对应 2、4、6、8、10 分；综合分取有效评分的平均数，保留一位小数。没有评价时显示“暂无评分”。按菜品 ID 保存，因此改菜名不会清空口碑。正式数据从空口碑开始，设计原型的数据不会导入。

部署前需开启 `zixuan-menu` 项目的 Authentication → 匿名登录，并发布 `firebase-ratings.rules.json` 中的口碑规则：公开读取、仅本人写入、校验昵称/星级/短评和服务端时间。不要开放 `dishReviews` 的上层写权限。评分规则通过 `firebase deploy --only database --project zixuan-menu --config firebase-ratings.json` 单独部署；`firebase.json` 与 `firebase-database.rules.json` 仍仅用于原有多人点餐。

验证评分计算：`node --test tests/dish-ratings.test.mjs`。浏览器验收需确认首次评分增加 1 人、改分人数不变、刷新回填本人评价、不同浏览器能查看相同口碑，以及搜索/价格浏览/购物车不受影响。

### 静态页面

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
