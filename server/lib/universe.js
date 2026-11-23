'use strict'

/**
 * ETF 监控组合的静态元数据（代码、简称、跟踪指数、交易所）。
 * 这些字段是产品标识，不随时间变化；份额 / 净值 / 持仓等数值全部来自实时接口。
 */

const ETFS = [
  { code: '510300', name: '沪深300ETF', full: '华泰柏瑞沪深300交易型开放式指数证券投资基金', exch: '沪', index: '沪深300', note: '汇金第一大重仓，2025 年报持有约 1,465 亿元' },
  { code: '510310', name: '沪深300ETF', full: '易方达沪深300交易型开放式指数发起式证券投资基金', exch: '沪', index: '沪深300', note: '汇金资管主要增持标的，规模稳步扩张' },
  { code: '510330', name: '沪深300ETF', full: '华夏沪深300交易型开放式指数证券投资基金', exch: '沪', index: '沪深300', note: '汇金长期持有，宽基核心配置' },
  { code: '510050', name: '上证50ETF', full: '华夏上证50交易型开放式指数证券投资基金', exch: '沪', index: '上证50', note: '上证50 核心宽基，汇金重仓品种' },
  { code: '510180', name: '上证180ETF', full: '华安上证180交易型开放式指数证券投资基金', exch: '沪', index: '上证180', note: '规模较小，汇金持仓相对稳定' },
  { code: '510500', name: '中证500ETF', full: '南方中证500交易型开放式指数证券投资基金', exch: '沪', index: '中证500', note: '中证500 宽基配置，机构持有为主' },
  { code: '512500', name: '中证500ETF', full: '华夏中证500交易型开放式指数证券投资基金', exch: '沪', index: '中证500', note: '中证500 替代标的，份额波动较小' },
  { code: '512100', name: '中证1000ETF', full: '南方中证1000交易型开放式指数证券投资基金', exch: '沪', index: '中证1000', note: '中证1000 主力标的，近半年增持明显' },
  { code: '560010', name: '中证1000ETF', full: '广发中证1000交易型开放式指数证券投资基金', exch: '沪', index: '中证1000', note: '中证1000 补充标的，机构申购活跃' },
  { code: '588000', name: '科创50ETF', full: '华夏上证科创板50成份交易型开放式指数证券投资基金', exch: '沪', index: '科创50', note: '科创50 最大 ETF，汇金持续增持' },
  { code: '588080', name: '科创50ETF', full: '易方达上证科创板50成份交易型开放式指数证券投资基金', exch: '沪', index: '科创50', note: '科创50 第二标的，汇金资管持有' },
  { code: '159919', name: '沪深300ETF', full: '嘉实沪深300交易型开放式指数证券投资基金', exch: '深', index: '沪深300', note: '深市沪深300 核心，汇金重仓' },
  { code: '159845', name: '中证1000ETF', full: '华夏中证1000交易型开放式指数证券投资基金', exch: '深', index: '中证1000', note: '深市中证1000 主力标的' },
  { code: '159629', name: '中证1000ETF', full: '富国中证1000交易型开放式指数证券投资基金', exch: '深', index: '中证1000', note: '富国中证1000，份额稳步增长' },
  { code: '159915', name: '创业板ETF', full: '易方达创业板交易型开放式指数证券投资基金', exch: '深', index: '创业板指', note: '创业板最大 ETF，汇金阶段性增持' },
  { code: '159977', name: '创业板ETF', full: '天弘创业板交易型开放式指数证券投资基金', exch: '深', index: '创业板指', note: '创业板补充标的，持仓以机构为主' }
]

const BY_CODE = {}
ETFS.forEach((e) => {
  BY_CODE[e.code] = e
  // 东方财富 secid：1 = 沪市，0 = 深市
  BY_CODE[e.code].secid = (e.exch === '沪' ? '1.' : '0.') + e.code
})

const PRODUCTS = ['IH', 'IF', 'IC', 'IM']
const PRODUCT_NAMES = { IH: '上证50', IF: '沪深300', IC: '中证500', IM: '中证1000' }
const PRODUCT_COLORS = { IH: '#8a63d2', IF: '#2f6fdd', IC: '#e2984c', IM: '#38a1a8' }

/**
 * 国家队持仓基准（M8）：没有免费实时源，按半年报 / 年报静态维护。
 * 数值来自公开报道，页面会标注披露口径与来源，不冒充实时数据。
 */
const BASELINE = {
  asof: '2025-12-31',
  disclosure: '2025 年年报（截至 2025-12-31，2026 年 4 月披露）',
  source: 'Wind 统计 / 21世纪经济报道 2026-04-09',
  totalValue: 15400,
  note: '较 2025 年二季度末增加约 2,487 亿元。宽基 ETF 为绝对主力：沪深300、上证50、中证1000、科创50 等。国家队确切持仓每半年随基金定期报告披露一次。',
  holders: [
    { name: '中央汇金投资', etfs: 21, shares: 1974, value: 7973, ratio: 36.2 },
    { name: '中央汇金资管', etfs: 15, shares: 1785, value: 7290, ratio: 38.0 },
    { name: '易方达-汇金资管单一资管计划', etfs: 9, shares: 43, value: 71, ratio: 5.3 },
    { name: '华夏-汇金资管单一资管计划', etfs: 17, shares: 37, value: 60, ratio: 4.7 },
    { name: '中国诚通（含北京诚通金控）', etfs: 21, shares: 21, value: 33, ratio: null },
    { name: '国新投资（中国国新旗下）', etfs: 3, shares: 12, value: 13, ratio: 19.6 }
  ]
}

module.exports = {
  ETFS,
  BY_CODE,
  CODES: ETFS.map((e) => e.code),
  SSE_CODES: ETFS.filter((e) => e.exch === '沪').map((e) => e.code),
  SZSE_CODES: ETFS.filter((e) => e.exch === '深').map((e) => e.code),
  PRODUCTS,
  PRODUCT_NAMES,
  PRODUCT_COLORS,
  BASELINE
}
