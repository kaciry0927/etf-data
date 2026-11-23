/**
 * 全局配置。
 *
 * 当前采用「GitHub Actions 每天抓取 → GitHub Pages 托管 JSON → 小程序读取」：
 * 运行时不用服务器、不用云开发，数据每天自动更新，改数据不需要重新发版。
 *
 * 数据模式说明：
 *   auto    自动选择：配置 cloudEnv 走云函数；否则配置 apiBase 走 HTTP；
 *           两者都为空时只用内置静态快照（纯离线，数据不会更新）
 *   http    走静态托管 / 自建 HTTP 数据服务
 *   cloud   走微信云开发云函数（方案 A）
 *   offline 只用内置静态快照
 *
 * 更新数据：
 *   GitHub Actions 每个交易日自动跑 tools/ci-build.js，把 snapshot.json 发布到 Pages。
 *   也可以本地手动：node tools/ci-build.js --out dist 后自行上传。
 */
module.exports = {
  appName: '国家队ETF动向追踪',
  version: '1.2.0',

  dataMode: 'auto',
  /**
   * 数据托管地址（必须是小程序后台「request 合法域名」里已配置的域名）。
   * GitHub Pages：https://data.kaciry.com  →  实际请求 /snapshot.json
   * 自建服务：    https://www.kaciry.com/etf  →  实际请求 /etf/snapshot.json
   * 留空则退回纯离线模式（只用打包进小程序的快照）。
   */
  apiBase: 'https://data.kaciry.com',
  /** 方案 A：云开发环境 ID；留空则不用云开发 */
  cloudEnv: '',
  cloudFunction: 'etfData',

  /**
   * 龙虎榜是否优先用快照里自带的那几天。
   * GitHub Pages 没有 /api/qihuo?date= 这种接口，必须为 true（默认）。
   * 如果改成连自建 server/index.js 想拿实时榜单，设为 false。
   */
  qihuoPreferSnapshot: true,

  /** 快照本地缓存有效期（分钟）；仅 HTTP / 云函数模式生效 */
  cacheMinutes: 10,
  /** 单次 API 请求超时（毫秒） */
  requestTimeout: 20000,
  /** 期指多空缓存时长（分钟） */
  qihuoCacheMinutes: 5,

  /** 订阅消息模板 ID，为空时开启提醒仅作演示 */
  subscribeTemplateId: '',
  disclaimer: '本工具仅供研究参考，不构成任何投资建议。数据来自交易所、中金所与东方财富公开接口。'
}
