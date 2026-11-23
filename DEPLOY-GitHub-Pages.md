# 部署�?GitHub Pages（数据每天自动更新）

目标：GitHub Actions 每个交易日自动抓取数�?�?发布�?GitHub Pages �?小程序读 `https://data.kaciry.com/snapshot.json`�?改数�?*不需要重新发版、不需要重新审�?*�?
```
GitHub Actions�?3:10 / 08:30 北京时间�?   └─ node tools/ci-build.js --out dist
        └─ dist/snapshot.json  ({ ok, builtAt, data })
             └─ 推送到 gh-pages 分支
                  └─ https://data.kaciry.com/snapshot.json
                       └─ 小程�?services/data.js（已经接好）
```

---

## 0. 为什么用 `data.kaciry.com` 而不�?`www.kaciry.com`

`www.kaciry.com` 已经绑定在你现有的那�?Pages 站点上，一个域名只能指向一�?Pages 站点�?新建一个数据仓库再�?`www` �?*覆盖掉你现有的站�?*。所以用子域名：

- 备案是按主域�?`kaciry.com` 备案的，子域名不需要重新备案；
- 小程序后台需�?*再加一�?* `https://data.kaciry.com`（同一个备案域名，通常秒过）；
- DNS 加一�?CNAME 即可，不动现有的 `www` 记录�?
> 如果你确实想�?`https://www.kaciry.com/etf/snapshot.json`（不加子域名），那必须把
> `etf/` 目录放进**现有站点仓库**里发布。告诉我你那个仓库的发布目录（根目录 / `docs/`），
> 我把 workflow 改成子路径版�?
---

## 1. 本地仓库（已完成�?
这个目录已经是可推送的 git 仓库，包含：

| 文件 | 作用 |
|---|---|
| `.github/workflows/daily.yml` | 每天两次定时构建 + 发布 Pages + 失败自动开 issue |
| `tools/ci-build.js` | 生成 `dist/snapshot.json`，数据没变就不写文件 |
| `tools/remote_test.js` | �?mock 回放远程 JSON，验�?http 分支（不联网�?|
| `miniprogram/config.js` | `apiBase: 'https://data.kaciry.com'` |
| `miniprogram/services/data.js` | 请求 `/snapshot.json`、加防缓存参数、龙虎榜本地优先 |

## 2. �?GitHub 新建空仓�?
- 名字建议 `etf-data`�?*�?Public**（Private 仓库�?Pages 需�?GitHub Pro）；
- **不要**勾�?README / .gitignore / license，保持完全空白�?
然后本地推送（�?`你的用户名` 换掉）：

```powershell
cd wechat-etf-miniprogram
git remote add origin https://github.com/你的用户�?etf-data.git
git branch -M main
git push -u origin main
```

推送后 Actions 不会自动跑（只有定时和手动触发）。先去手动跑一次，见第 4 步�?
## 3. 配置 Pages + DNS

1. 仓库 **Settings �?Pages**�?   - Source �?**Deploy from a branch**�?   - Branch �?**gh-pages** / `/ (root)`�?   - 第一次要先跑完一�?workflow，`gh-pages` 分支才会出现；如果下拉里还没有，先做�?4 步�?2. **Custom domain** �?`data.kaciry.com` �?Save�?3. DNS 加一条记录：

   | 类型 | 主机记录 | 记录�?|
   |---|---|---|
   | CNAME | `data` | `你的用户�?github.io` |

4. �?DNS 生效（几分钟）后，回 Pages 页面勾上 **Enforce HTTPS**，等证书签发（通常 10 分钟内）�?
> workflow 里已经写�?`cname: data.kaciry.com`，每次发布会自动写入 CNAME 文件�?> 避免自定义域名被重置。如果你换了域名，记得同步改 `.github/workflows/daily.yml` 里那一行�?
## 4. 手动触发一次，验证链路

1. 仓库 **Actions �?每日更新 ETF 数据 �?Run workflow**�?2. 首次全量抓取�?1�? 分钟（约 750 个请求），之后有缓存只需几秒�?3. 成功后打开 `https://data.kaciry.com/snapshot.json`，应看到 `{"ok":true,...,"data":{...}}`�?4. 用手机浏览器打开同一个地址，确认国内访问速度�?2 秒或超时见第 6 节）�?
本地也可以先验证产物结构（不联网）：

```powershell
node tools/ci-build.js --offline --out dist
node tools/remote_test.js
```

## 5. 小程序侧

1. 微信公众平台 �?**开发管�?�?开发设�?�?服务器域�?* �?request 合法域名加一条：

   ```
   https://data.kaciry.com
   ```

   （`www.kaciry.com` 那条可以留着，不影响。）
2. 开发者工具里**关掉**「不校验合法域名」再预览，确保是真实校验通过�?3. 手机上打开小程序，「我�?�?数据状态」应显示来源�?**数据服务**、更新时间为当天�?4. 发布前把线上数据同步一份进包内，作为断网兜底（可选但建议）：

   ```powershell
   node tools/ci-build.js --out dist
   node tools/make-bundled.js
   ```

5. 确认无误后：上传新版�?�?提交审核 �?审核通过 �?**发布**�?
> 发布前一定要确认 `apiBase` 已经�?`https://data.kaciry.com`�?> 如果直接发布现在这个纯静态版本，线上数据会永久停�?11-06，之后每次改数据都要重新提审�?
## 6. 日常维护与排�?
| 现象 | 处理 |
|---|---|
| 数据停在某天 | Actions 有没有跑？失败会开 `ci-failure` issue，先 Re-run 一�?|
| Actions 每天跑但 Pages 没更�?| �?deploy 步骤日志；确�?Pages Source �?`gh-pages` 分支 |
| 国内访问�?/ 超时 | 换腾讯云 COS + CDN（同一个已备案域名，几毛钱/月），workflow 里把 deploy 改成 `coscmd upload` 即可 |
| 定时任务 60 天后自己停了 | �?workflow 每天有提交，属于“仓库有活动”，正常不会被停；真停了�?Actions 页面�?Enable |
| 抓取接口报错 | 交易所/东财临时不可用居多；连续失败再检�?`server/lib/*.js` 里的接口是否变更 |

## 7. 定时时间说明

| cron（UTC�?| 北京时间 | 用�?|
|---|---|---|
| `10 15 * * *` | 23:10 | 当天期货持仓（收盘后已发布）+ 当日龙虎�?|
| `30 0 * * *` | 08:30 | 交易所份额 T+1 披露后补齐，此时数据最完整 |

脚本是幂等的：数据指纹（ETF 日期 / 期货日期 / 净流入 / 份额 / 龙虎榜最后一天）没变化就不写文件、不产生提交�?