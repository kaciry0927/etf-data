# 部署到 GitHub Pages（数据每天自动更新）

```
GitHub Actions（多个时段探测）
  └─ node tools/ci-build.js --out dist
       └─ dist/snapshot.json  { ok, builtAt, data }
            └─ 推到 gh-pages 分支
                 └─ https://data.kaciry.com/snapshot.json
                      └─ 小程序运行时读取（不用发版）
```

## 0. 域名

现有站点绑在裸域名 `kaciry.com`，数据站用子域名 `data.kaciry.com`，互不影响，也不需要重新备案。

## 1. 仓库里有什么

| 文件 | 作用 |
|---|---|
| `.github/workflows/daily.yml` | 6 个时段探测 + 手动触发；数据有变化才部署 |
| `tools/ci-build.js` | 生成 `dist/snapshot.json`；数据指纹不变则不写文件 |
| `server/seed/*.json` | 历史原始数据，CI 只补新交易日，避免每次从零抓 147 天 |
| `miniprogram/config.js` | `apiBase: 'https://data.kaciry.com'` |
| `miniprogram/services/data.js` | 请求 `/snapshot.json`、加防缓存参数、龙虎榜本地优先 |

## 2. Pages + DNS

1. 仓库 **Settings → Pages**：Source 选 **Deploy from a branch** → `gh-pages` / `(root)`；
2. Custom domain 填 `data.kaciry.com` → Save；
3. DNS（阿里云）加记录：

   | 类型 | 主机记录 | 记录值 |
   |---|---|---|
   | CNAME | `data` | `kaciry0927.github.io` |

4. 等解析生效后勾 **Enforce HTTPS**，等证书签发（可能十几分钟）。

## 3. 验证

```powershell
curl.exe -s https://data.kaciry.com/snapshot.json
```

看到 `{"ok":true,...}` 即成功；看 `data.meta.etfDate` 判断数据日期。

## 4. 小程序侧

1. 公众平台 → 开发管理 → 服务器域名 → request 合法域名加 `https://data.kaciry.com`；
2. 上传代码 → 设为体验版 → 加体验成员；
3. 「我的 → 数据状态」显示 **数据服务** 即走的是线上数据。

## 5. 排障

| 现象 | 处理 |
|---|---|
| 数据日期不前进 | 看 Actions 摘要；`[shares] 尚未披露` 说明交易所还没出数 |
| 页面显示「内置快照」 | 请求失败：检查白名单、证书、Pages 是否正常 |
| 国内访问慢 | 换 COS + CDN（同一个已备案域名） |
| 定时没跑 | GitHub schedule 会延迟甚至丢弃，多时段就是为此；也可手动 Run workflow |

## 6. 定时策略

| cron（UTC） | 北京时间 | 说明 |
|---|---|---|
| `15 15` / `45 15` / `30 16` | 23:15 / 23:45 / 00:30 | 等上交所份额（约 23:00 发布） |
| `15 0` / `0 1` / `45 1` | 08:15 / 09:00 / 09:45 | 等深交所份额（次日早间发布） |

- 数据指纹没变化 → 不写文件、不部署，避免"更新时间"被无意义运行刷成最新；
- 手动 Run workflow 会强制部署一次，方便验证；
- 份额 T+1：当天晚上只能拿到上一交易日的份额，这是交易所规则，不是程序问题。
