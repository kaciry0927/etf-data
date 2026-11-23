# 国家队 ETF 动向追踪 · 微信小程序

依据三份设计文档实现：

- `国家队ETF动向追踪-原型说明文档.md`（页面结构、元素、交互、规范）
- `国家队ETF动向追踪-功能点清单.md`（原 Web 页面的完整功能点）
- `免费数据源接口调研.md`（真实数据源与落地方式）

当前版本 **v1.2.0**：**GitHub Actions 每天抓取 → GitHub Pages 托管 JSON → 小程序运行时读取**。

- **零服务器**：运行时只发一个 GET（`https://data.kaciry.com/snapshot.json`），打包进小程序的 `snapshot.js` 作为兜底；
- 数据不是随机假数据：快照由 `tools/ci-build.js` 从交易所、中金所、东方财富公开接口抓取；
- **数据每天自动更新，改数据不需要重新发版、不需要重新审核**；完整部署步骤见 `DEPLOY-GitHub-Pages.md`；
- 断网 / Pages 抽风时自动退回内置快照，页面照常可用；
- 后续想升级到方案 A（微信云开发），只需在 `config.js` 填 `cloudEnv`，页面代码不用改。

---

## 1. 快速开始（方案 C，推荐）

1. 微信开发者工具 →「导入项目」→ 选择本项目根目录。
2. AppID 填自己的：仓库里**不保存 AppID**，先复制 `project.config.example.json` 为 `project.config.json`，再把 `appid` 改成你自己的。
3. 直接编译。所有页面（含期指多空）都使用随包发布的真实静态快照，**不需要启动任何服务**。
4. `config.js` 默认 `dataMode: 'auto'`、`apiBase: 'https://data.kaciry.com'`、`cloudEnv: ''`，即读取线上快照 + 包内兜底。

### 1.1 更新数据

**正常情况什么都不用做**：GitHub Actions 每个交易日 23:10 和 08:30（北京时间）自动抓取并发布到
`https://data.kaciry.com/snapshot.json`，小程序下次打开即为新数据。

首次部署 / 换数据源 / 手动补数据时：

```powershell
cd wechat-etf-miniprogram
node tools/ci-build.js --out dist     # 生成 dist/snapshot.json
```

本地想完全不联网、只用已有缓存预览：

```powershell
node tools/ci-build.js --offline --out dist
node tools/remote_test.js             # 校验 http 分支能正确解析远程结构
```

旧的 `node server/build.js` 仍然可用，它只更新**打包进小程序的兜底快照**
（`miniprogram/data/snapshot.js`），不参与线上数据。发布新版本前建议把线上数据同步进包内：

```powershell
node tools/make-bundled.js            # 把 dist/snapshot.json 同步成包内兜底快照
```

完整部署见 `DEPLOY-GitHub-Pages.md`。

### 1.2 可选：本地实时数据服务（方案 E，开发调试用）

如果开发阶段想验证“刷新后数据变化”“实时龙虎榜”，可以启动本地服务：

```powershell
node server/index.js
```

然后修改 `miniprogram/config.js`：

```js
apiBase: 'http://127.0.0.1:3100',
```

再编译。`project.config.json` 已设置 `"urlCheck": false`，开发者工具可直接访问本机 HTTP。

> 这只是调试能力；方案 C 的发布版本不需要它。真机 / 生产环境若要走 HTTP，必须部署到
> 已备案的 HTTPS 域名，并加入小程序「request 合法域名」。

### 1.3 可选：升级到方案 A（微信云开发）

文档的最终建议是先用方案 C 跑通，上线后再切方案 A。本项目的 `services/data.js` 已预留
`cloud` 分支（`wx.cloud.callFunction({ name: 'etfData', action: 'get' | 'qihuo' })`），
但**本次没有附带 `cloudfunctions/` 云函数代码**。需要时把 `server/lib` 的抓取逻辑放进
`etfData` 云函数，返回同样的快照结构，再在 `config.js` 填 `cloudEnv` 即可，页面无需改动。

---

## 2. 页面结构

```
底部 TabBar（4 个一级页，原生 tabBar）
├── 概览        pages/overview/index     当日结论 + 组合分布 + 快照 Top5 + 快捷入口
├── 走势        pages/flow/index         区间摘要 + 双轴柱线图 + 资金榜 + 单只入口
├── 期货        pages/futures/index      净空头汇总 + 四品种卡 + 多折线图 + 二级入口
└── 我的        pages/profile/index      数据状态 / 数据服务 / 提醒 / 功能入口

二级页（navigateTo）
├── 最新快照        pages/snapshot/index        搜索 / 筛选 / 排序 / 卡片表格双视图
├── 单只 ETF 详情    pages/etf/index?code=xxx   份额曲线 + 净流入柱线 + 持仓备注
├── 期货持仓明细     pages/futures-detail/index  15 个合约分组、小计、长按复制
├── 期指多空         pages/qihuo/index           日历选日 / 双数据源 / 静态快照范围提示
└── 国家队持仓基准   pages/baseline/index        市值/份额口径切换、6 家机构
```

### 已实现的关键交互

| 模块 | 实现 |
|---|---|
| 概览 | Hero 深色区、16 只行情跑马灯（按住暂停）、2×2 指标卡、组合堆叠条、20 日迷你柱图、Top5、下拉刷新、分享 |
| 走势 | 近 5/20/60 日/全部切换，区间累计/日均/交易日实时重算；双轴柱线图点按拖动取值；净流入/净流出 TOP5 |
| ETF 详情 | 原地切换 ETF（不新增页面栈）、20/60/全部区间共用、份额面积折线 + 净流入柱线、分享 |
| 快照 | 代码/名称/指数/全称搜索、沪/深筛选、10 个字段排序、10 列表格横向滚动、表头排序、筛选合计、状态保留 |
| 期货 | 四品种图例可显隐（全隐藏显示空态）、区间切换、多折线触摸取值 |
| 期货明细 | 品种展开/收起、合约级表格、小计与总计、长按复制合约号 |
| 期指多空 | 自定义日历（未来日期/周末样式）、中信/其他代客切换、非交易日空态、静态范围提示、骨架屏 |
| 持仓基准 | 市值/份额口径切换，排序、占比、头图联动 |
| 我的 | 手动刷新、数据源半屏、清除缓存二次确认、订阅消息开关、无登录/无头像 |

### 动效

| 位置 | 动效 |
|---|---|
| 页面 | 每次 `onShow`（Tab 切换、返回、回到前台）播放 0.34s 淡入；只使用 opacity，不用 transform，避免影响原生 Canvas 的定位与层级 |
| 图表 | 0.56s 生长动画：柱状从零轴生长、折线/面积从左向右揭开，结束才显示 tooltip；触摸图表会立即结束动画并响应取值 |
| 概览 | 行情跑马灯循环滚动；组合分布条整体从左展开；20 日迷你柱从零轴长出 |
| 横向条形 | 区间资金榜的净流入 / 净流出条按行错峰从左侧生长（55ms/行），滚动进入视口时用 `IntersectionObserver` 重播，切换区间 / 净流入流出也会重播；持仓基准的机构占比条按行错峰生长（45ms/行），切换口径时重播 |
| 主数值累加 | 概览 Hero / 指标卡 / 组合规模、走势区间摘要、ETF 价格与份额、期货汇总与四品种、期货明细页头、期指多空的多单/空单/多空结果、持仓基准合计，均从 0 累加到目标值（620ms，easeOutQuart）；切区间、切 ETF、切日期、切数据源、切口径时重新累加 |
| 半屏弹层 | 打开时遮罩淡入 + 面板上滑；关闭时面板下滑 + 遮罩淡出，180ms 后卸载 |
| 按钮 | 所有 `bindtap` / `catchtap` / `bindlongpress` 元素自动带 `.tap-item`：页面显示时按同级顺序以 0.03s 递增淡入上浮（0.36s，最多 8 档），动画结束后回落到普通样式，不影响按压反馈 |
| 弹层按钮 | 半屏内容挂载时逐个淡入；关闭按钮带 hover 与按压反馈 |
| 分段控件 | 每次页面显示时各段依次淡入；选中背景 0.2s 过渡 |
| 触控 | 统一 `hover-class="tap-feedback"` + 缩放，卡片 / 行 / chip / 日历格 / 表格行均有即时反馈；刷新按钮旋转与按压缩放 |
| 加载 | 期指多空骨架屏 shimmer；刷新按钮 spin |

---

## 3. 工程结构

```
wechat-etf-miniprogram/
├── project.config.json          DevTools 项目配置（miniprogramRoot = miniprogram/，urlCheck = false）
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── config.js                版本、数据模式、API 地址、缓存时长、订阅模板
│   ├── data/
│   │   └── snapshot.js          方案 C 的静态快照（含最近 5 天龙虎榜，勿手改）
│   ├── services/
│   │   └── data.js              数据服务层：静态 / HTTP / 云函数三模式
│   ├── utils/
│   │   ├── format.js            数字/百分比/日期/交易日格式化
│   │   ├── count-up.js          大屏主数值累加动画
│   │   └── page-anim.js         页面 onShow 入场动效包装器
│   ├── components/              nav-bar / chart / sheet / seg-control / empty-state
│   └── pages/                   9 个页面（每个 4 件套）
├── server/                      离线抓取与生成脚本（不参与小程序运行时）
│   ├── build.js                 方案 C 主入口：生成 miniprogram/data/snapshot.js
│   ├── index.js                 可选的本地 HTTP API（方案 E，调试用）
│   ├── lib/
│   │   ├── http.js              带重试 / 解压 / 并发限制的请求封装
│   │   ├── sse.js               上交所 commonQuery 份额
│   │   ├── szse.js              深交所 ShowReport xlsx 份额（分片 + 逐日兜底）
│   │   ├── xlsx.js              无依赖 xlsx 解析（zip + sharedStrings + sheet1）
│   │   ├── eastmoney.js         东财 K 线 + 期指龙虎榜
│   │   ├── cffex.js             中金所 ccpm XML 持仓排名
│   │   ├── builder.js           快照组装、增量缓存、指标计算
│   │   ├── cache.js             JSON 文件缓存
│   │   └── universe.js          16 只 ETF 元数据、品种、静态持仓基准
│   └── .cache/                  原始数据缓存（可按日期增量更新）
└── tools/
    ├── make_assets.py           tabBar 图标 + 分享封面生成脚本
    ├── check_static.py          WXML/WXSS/JSON/路径静态校验
    ├── smoke_test.js            页面 onLoad / 交互 Mock 测试（默认离线模式）
    ├── chart_test.js            Canvas 图表绘制与动画帧测试
    └── api_test.js              可选：本地 HTTP 服务接口测试
```

> 如果你的项目放在上一级目录导入，注意 `miniprogramRoot` 要指向 `wechat-etf-miniprogram/miniprogram`；推荐直接导入本目录。

### 图表说明

未使用 `ec-canvas`/ECharts（体积大、真机兼容性依赖 Canvas 版本），自行实现一个轻量 Canvas 2D 组件：

- 支持 DPR 高清绘制、容器宽度自适应；
- 双轴柱线图：左轴单日净流入柱（正红负绿），右轴区间累计线（蓝），3 档横向网格 + 4 个日期刻度；
- 多折线图：自动值域、5 档网格、面积填充（份额图）、系列颜色固定；
- 0.56s 数据动画：柱子按 cubic ease-out 从零轴生长，累计线/多折线按裁剪宽度从左向右揭开；动画结束才绘制选中线和 tooltip；触摸时立即停止动画并响应；
- 触点：`bindtouchstart` / `catchtouchmove` 取值，手指离开保留最后取值，tooltip 直接绘制在 Canvas 内，避免层级与滚动冲突；
- 图例显隐由父页面控制，隐藏全部品种时父级展示空态而不是空图。
- 走势 / 期货 / ETF 详情页在 `onHide` 时通过 `chartVisible` 卸载 Canvas，`onShow` 时重新挂载。微信的 Canvas 属于原生组件，页面隐藏时不一定跟随 WebView 一起隐藏，这是“期货走势图叠加到其他页面”的根因；卸载后由页面入场动画与图表生长动画衔接。

### 导航与适配

- 所有页面 `navigationStyle: custom`，`nav-bar` 用 `wx.getMenuButtonBoundingClientRect()` 动态计算状态栏、44px 导航条与胶囊避让；自带占位块，页面内容不会被固定导航遮挡。
- 概览使用深色导航，页面配置 `navigationBarTextStyle: white`；其余页面黑色状态栏文字。
- 底部用原生 tabBar（4 个一级页），二级页不显示；符合 `switchTab` / `navigateTo` / `navigateBack` 的层级关系。

---

## 4. 数据来源与计算口径

方案 C 下，所有数值在**构建时**从公开接口抓取一次，写进 `snapshot.js`；小程序运行时不联网。

| 指标 | 接口 | 口径 |
|---|---|---|
| 沪市 11 只 ETF 份额 | `query.sse.com.cn/commonQuery.do`（`COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L`） | `TOT_VOL`（万份）÷ 1e4 = 亿份；需 `Referer: https://www.sse.com.cn/`；支持任意历史交易日 |
| 深市 5 只 ETF 份额 | `www.szse.cn/api/report/ShowReport`（`scsj_fund_jjgm`） | 返回 xlsx，`基金规模(份)` ÷ 1e8 = 亿份；按 45 天分片，缺失日期逐日补抓 |
| 16 只 ETF 收盘价 | `push2his.eastmoney.com/api/qt/stock/kline/get` | 前复权日线，`klines[2]` 为收盘价；`secid` 沪=1、深=0 |
| 股指期货净空头 | `www.cffex.com.cn/sj/ccpm/{YYYYMM}/{DD}/{IH|IF|IC|IM}.xml` | `datatypeid=2`（空头）− `datatypeid=1`（多头），前 20 会员口径；15 个合约随上市情况动态变化 |
| 期指龙虎榜 | `qhhqzl.eastmoney.com/.../getLongAndShortPosition` | 中信期货按 `futureCompanyCodeNew=10058975` 或名称匹配；其他代客 = 榜单剔除中信后求和；校验 `tradeDate` |
| 交易日序列 | 东方财富 510300 日线日期 | 交易日与 A 股一致；ETF 份额 T+1，期货收盘后更新 |

计算口径：

- **净流入 = (当日份额 − 前一交易日份额) × 当日收盘价**（估算值，非官方申赎）；
- **组合规模 = 最新份额 × 最新收盘价**；
- **区间累计 / 日均**由每日净流入直接求和 / 平均；
- **期货净空头 = Σ空头持仓 − Σ多头持仓**；**当日变动 = Σ空头增减 − Σ多头增减（`varvolume`）**。
  注意不能用「两日净空头水平相减」：中金所只披露前 20 会员，排名每天会变，
  直接相减会把进出榜单的整段仓位误算成当日增减。
- **多空结果 = 多单净增 − 空单净增**，`< 0` 标「加仓」，`≥ 0` 标「减仓」；
- 非交易日不渲染全「—」表，改为说明型空态 + 最近交易日快捷入口。

### 内置快照（生成时点 2026-11-07 08:58）

| 指标 | 值 |
|---|---|
| ETF 最新交易日 | 2026-11-06 |
| 当日估算净流入 | +36.5 亿元 |
| 近 5 日 / 近 20 日 | +1,660.9 / +4,342.2 亿元 |
| 组合份额 / 规模 | 3,564.73 亿份 / 9,450.7 亿元 |
| 期货净空头 / 变动 | 126,920 / +1,484 手 |
| 合约数 | 15（IH 3 + IF 4 + IC 4 + IM 4） |
| 历史区间 | 2026-04-01 ~ 2026-11-06（147 个交易日） |
| 内置龙虎榜 | 2026-11-02 ~ 2026-11-06（最近 5 个交易日） |
| 期指龙虎榜 11-06 | 中信期货 −223 手；其他代客 −1,261 手 |
| 变动口径核对 | 期货页 +1,484（空头增加为正）；龙虎榜两侧合计 −1,484（多单净增） |

> 以上数值每日随接口变化；页面以 `snapshot.js` 生成时点为准。示例用于核对数据链路是否打通。

---

## 5. 方案 C 的更新流程

```
本地电脑（Node.js）
  ├─ 上交所 commonQuery（沪市 11 只份额）
  ├─ 深交所 ShowReport xlsx（深市 5 只份额）
  ├─ 东方财富 push2his（16 只收盘价）
  ├─ 中金所 ccpm XML（IH/IF/IC/IM 净空头与合约明细）
  └─ 东方财富 getLongAndShortPosition（最近 5 天龙虎榜）
        ↓
  server/lib/builder.js 组装 → server/.cache（原始数据 + snapshot.json）
        ↓
  miniprogram/data/snapshot.js（静态快照，约 70KB）
        ↓
  微信开发者工具「上传」→ 发布新版本
        ↓
  小程序运行时只读 snapshot.js，无服务器、无域名、无云开发
```

### 5.1 缓存与增量

- `server/.cache/sse.json`：日期 → 沪市份额；
- `server/.cache/szse.json`：日期 → 深市份额；
- `server/.cache/ccpm.json`：日期 → 四品种持仓；
- `server/.cache/kline.json`：代码 → 日期 / 收盘价；
- `server/.cache/snapshot.json`：最近一次组装结果。

`build.js` 启动时读取缓存，只抓缺失日期；`--force` 可全量重抓。
删掉 `server/.cache` 不影响小程序，只是下次构建会重新回补 147 个交易日。

### 5.2 为什么龙虎榜只内置 5 天

期指龙虎榜是实时接口，没有历史归档；方案 C 不适合“随时查任意历史日”。内置最近 5 个交易日
覆盖了“看最新 + 对比前几天”的常见需求，同时把包体控制在 70KB。超出范围的日期会展示
说明型空态，并提示重新运行 `node server/build.js`。

### 5.3 合规与注意

- 方案 C 不需要 `request 合法域名`，因为运行时不发请求。
- 上交所接口需要 `Referer: https://www.sse.com.cn/`；深交所返回 xlsx，需本地解析。
- 份额 T+1、期货收盘后更新；页面分别标注 ETF 日期与期货日期。
- 深交所一次查询行数过多会触发 Excel 65,536 行截断，本项目按 45 天分片并逐日兜底。
- 非交易日：ccpm 无文件、龙虎榜返回最近交易日，构建脚本会跳过。
- 页脚免责声明不可删除；订阅消息需模板审核与用户主动授权。

---

## 6. 对原型的修正

1. **涨跌幅单位**：原型 `priceChangePct` 少乘 100，页面会显示 `+0.01%`；小程序改为真实百分比。
2. **合约数量**：不再写死“14 / 13 个”，由中金所当日披露动态计算（2026-11-06 为 15 个：IH 3 + IF 4 + IC 4 + IM 4）。
3. **合约月份**：不再硬编码 `2511/2512/2603`，直接用接口返回的合约代码。
4. **非交易日**：保留“空态 + 返回最近交易日”，不展示全「—」。
5. **数据更新**：明确标注静态快照的生成时间；不再伪装成实时数据。
6. **无虚假账户**：我的页不出现头像/昵称/登录态，仅展示数据状态。
7. **无演示数据**：删除 `utils/demo-data.js`；内置快照是从官方接口抓取的真实数据。
8. **数据来源标识**：概览 Hero 右上角显示「官方数据 / 本地缓存 / 内置快照」。
9. **订阅消息**：开关由用户点击触发；`config.subscribeTemplateId` 为空时只做演示提示，不伪造授权结果。

---

## 7. 静态与逻辑校验

```powershell
# 1. JS 语法
Get-ChildItem .\miniprogram, .\server -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }

# 2. WXML 标签闭合 / WXSS 花括号 / 页面与 tabBar 路径 / 事件处理器
python tools/check_static.py

# 3. 页面 onLoad 与关键交互（Mock 小程序运行时，默认离线静态模式）
node tools/smoke_test.js

# 4. Canvas 图表绘制 / 触点取值（Mock 2D Context，检查 NaN 坐标）
node tools/chart_test.js

# 5. 可选：本地 HTTP 服务接口测试（需先启动 server）
node tools/api_test.js
```

`check_static.py` 会检查：

- 9 个页面的 `js/json/wxml/wxss` 四件套是否齐全；
- tabBar 页面与图标路径是否存在；
- WXML 标签是否闭合、`{{ }}` 是否配对；
- WXSS 花括号是否配对；
- WXML 中绑定的事件方法是否在对应 Page/Component 中定义。

`smoke_test.js` 覆盖：离线静态模式、概览汇总、走势区间切换、ETF 原地切换、快照搜索/筛选/排序、
期货图例全隐藏、期货明细 15 合约与折叠、期指多空加载/切源/日历/周末空态/内置龙虎榜范围提示、
基准口径切换、我的提醒开关。当前全部通过。

### 建议的真机验收路径

1. **日常盯盘**：概览 → 最新快照 → 按当日净流入排序 → 点 510300 → 看份额/净流入 → 返回快照。
2. **趋势研究**：走势 → 近 60 日 → 拖动图表取值 → 切换净流出 TOP5 → 选择单只 ETF。
3. **期货观察**：期货 → 关闭 IF/IC 图例 → 进持仓明细 → 收起 IH → 长按合约号 → 进期指多空。
4. **静态范围**：期指多空 → 打开日历 → 选 2026-10-30 → 看“内置静态快照只包含 11-02~11-06”提示。
5. **官方基准**：我的 → 持仓基准 → 切换市值/份额 → 对比概览组合规模。
6. **分享**：任一二级页右上角胶囊 → 转发，检查 5:4 封面与标题。
7. **断网**：关闭网络后重新进入，所有页面仍可正常展示，因为运行时不发请求。

---

## 8. 已知限制

- 线上数据依赖 GitHub Pages（`data.kaciry.com`）：Pages 在国内偶有抽风，此时小程序退回内置快照，
  页面会显示数据的实际更新日期；如果长期不稳定，把 `dist/snapshot.json` 改传腾讯云 COS + CDN 即可（同一个已备案域名）。
- 期指龙虎榜只覆盖每天构建时抓取的最近 5 个交易日；更早日期会显示说明型空态。
- 份额为交易所 T+1 披露，盘中只能用前一日份额；净流入是 `Δ份额 × 收盘价` 的估算值。
- 期货持仓只覆盖中金所前 20 会员；龙虎榜“其他代客”口径与 ccpm 不一致，页面已分别标注。
- 国家队持仓基准（我的 → 持仓基准）没有免费实时源，按 2025 年报静态维护，页面标注披露口径。
- 图表为自绘 Canvas，未实现原 Web 页的 `dataZoom` 缩放滑块；移动端以区间分段 + 触点取值替代。
- 分享封面为静态图；如需动态收益截图，需用 `wx.createOffscreenCanvas` 生成。
- 底部使用原生 tabBar，其图标/文字切换动效由微信控制，无法自定义；已用页面 0.34s 入场过渡弥补。
- 图表动画固定 0.56s；如需跟随系统“减少动态效果”，可在 `components/chart/index.js` 的 `startAnimation` 中直接 `draw(1)`。
- `server/index.js`（方案 E）仅用于本地调试；生产 HTTP 模式需要已备案域名，文档建议优先方案 A。

---

## 9. 生成 / 校验脚本

```powershell
# 方案 C：生成 / 更新静态快照（日常更新只需这一步）
node server/build.js

# 可选：启动本地实时数据服务（方案 E）
node server/index.js

# 重新生成 tabBar 图标与分享封面（需要 Pillow）
python tools/make_assets.py

# 静态 / 页面 / 图表 / 可选接口校验
python tools/check_static.py
node tools/smoke_test.js
node tools/chart_test.js
node tools/api_test.js
```
