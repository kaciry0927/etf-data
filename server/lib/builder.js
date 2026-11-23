'use strict'

/**
 * 快照生成器。
 *
 * 输入：交易所份额 + 东方财富收盘价 + 中金所持仓排名 + 静态持仓基准
 * 输出：与小程序页面完全对齐的数据结构（见 README 第 7 节）
 *
 * 首次运行会回补历史（约 147 个交易日），所有原始数据按日期写入
 * server/.cache，之后每日只补缺失的日期。
 */

const path = require('path')

const { Cache } = require('./cache')
const { mapLimit, sleep } = require('./http')
const { ETFS, CODES, PRODUCTS, PRODUCT_NAMES, PRODUCT_COLORS, BASELINE } = require('./universe')
const sse = require('./sse')
const szse = require('./szse')
const eastmoney = require('./eastmoney')
const cffex = require('./cffex')

const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '.cache')
const DEFAULT_HISTORY_DAYS = 147

/* -------------------- 小工具 -------------------- */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

function isoToday() {
  const d = new Date()
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

function localNow() {
  const d = new Date()
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  )
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function round2(v) {
  return Math.round(v * 100) / 100
}

function round4(v) {
  return Math.round(v * 10000) / 10000
}

function round3(v) {
  return Math.round(v * 1000) / 1000
}

function sum(arr) {
  let total = 0
  for (let i = 0; i < arr.length; i++) total += arr[i]
  return total
}

function tailSum(arr, n) {
  return round2(sum(arr.slice(Math.max(0, arr.length - n))))
}

function progressLogger(log) {
  let last = 0
  return function (phase, done, total) {
    if (!log) return
    if (done === total || done - last >= 10 || done <= 1) {
      last = done
      log('[' + phase + '] ' + done + '/' + total)
    }
  }
}

/* -------------------- 抓取增量 -------------------- */

async function refreshKline(kline, days, log) {
  const end = isoToday()
  const beg = addDays(end, -(days * 1.7 + 45))
  const failures = []

  // 单只 ETF 失败不应该让整次构建失败：东财偶发 socket hang up / 限流时沿用缓存，
  // 只要 510300（交易日序列锚点）还有数据，就能继续生成快照。
  // 东财对高频 / 机房 IP 会直接掐连接（socket hang up）。
  // 放慢节奏、限制总耗时：超过预算就跳过剩余 ETF，沿用缓存继续构建。
  const RETRY_DELAYS = [0, 1200]
  const deadline = Date.now() + 120000
  let skipped = 0

  await mapLimit(CODES, 2, async (code) => {
    if (Date.now() > deadline) {
      skipped++
      return
    }
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (RETRY_DELAYS[attempt]) await sleep(RETRY_DELAYS[attempt])
      try {
        const rows = await eastmoney.fetchKline(code, beg, end)
        if (!rows || !rows.length) throw new Error('返回空数据')
        kline[code] = {
          updated: end,
          rows: rows.map((r) => [r.date, r.close])
        }
        return
      } catch (e) {
        if (attempt === RETRY_DELAYS.length - 1) {
          failures.push(code + ' ' + e.message)
          if (log) log('[kline] ' + code + ' 抓取失败，沿用缓存：' + e.message)
        }
      }
    }
  })

  if (skipped && log) log('[kline] 超过 120 秒预算，跳过 ' + skipped + ' 只（沿用缓存）')

  if (log) {
    const rows = Object.keys(kline)
      .map((code) => (kline[code] && kline[code].rows ? kline[code].rows.length : 0))
      .sort((a, b) => b - a)
    log(
      '[kline] ' + (CODES.length - failures.length) + '/' + CODES.length +
      ' 只 ETF 收盘价已更新' + (failures.length ? '（' + failures.length + ' 只沿用缓存）' : '') +
      ' · 行数最多 ' + (rows[0] || 0) + ' 天'
    )
    if (failures.length) log('[kline] 失败明细：' + failures.slice(0, 5).join(' | '))
  }
}

/**
 * 交易日序列锚点：取行数最多的那只 ETF。
 * 原来写死 510300，一旦这只抓取失败整次构建就挂，在 CI 里很脆弱。
 */
function pickAnchor(kline) {
  let best = null
  Object.keys(kline).forEach((code) => {
    const item = kline[code]
    if (!item || !Array.isArray(item.rows) || !item.rows.length) return
    if (!best || item.rows.length > best.rows.length) best = item
  })
  return best
}

async function refreshSseShares(sseCache, dates, log) {
  const missing = dates.filter((d) => !sseCache[d])
  if (!missing.length) {
    if (log) log('[sse] 无缺失日期')
    return
  }

  const report = progressLogger(log)
  let done = 0
  await mapLimit(missing, 5, async (date) => {
    try {
      const map = await sse.fetchShares(date)
      if (map) sseCache[date] = map
    } catch (e) {
      if (log) log('[sse] ' + date + ' 抓取失败：' + e.message)
    }
    done++
    report('sse', done, missing.length)
    await sleep(40)
  })

  const got = missing.filter((d) => sseCache[d]).length
  if (log) log('[sse] 补齐 ' + got + '/' + missing.length + ' 个交易日')
}

async function refreshSzseShares(szseCache, dates, log) {
  const missing = dates.filter((d) => !szseCache[d])
  if (!missing.length) {
    if (log) log('[szse] 无缺失日期')
    return
  }

  let part = {}
  try {
    part = await szse.fetchShares(missing)
  } catch (e) {
    // 深交所返回 xlsx，偶发超时/截断；失败时保留已有缓存，不阻断整次构建
    if (log) log('[szse] 抓取失败，沿用缓存：' + e.message)
  }
  Object.keys(part).forEach((date) => {
    szseCache[date] = part[date]
  })
  if (log) log('[szse] 补齐 ' + Object.keys(part).length + '/' + missing.length + ' 个交易日')
}

async function refreshCcpm(ccpmCache, dates, log) {
  const missing = dates.filter((d) => !ccpmCache[d])
  if (!missing.length) {
    if (log) log('[cffex] 无缺失日期')
    return
  }

  const report = progressLogger(log)
  let done = 0
  let failed = 0
  await mapLimit(missing, 4, async (date) => {
    try {
      const result = await cffex.fetchPositions(date)
      if (result) ccpmCache[date] = result
      else failed++
    } catch (e) {
      failed++
    }
    done++
    report('cffex', done, missing.length)
    await sleep(60)
  })

  if (log) log('[cffex] 补齐 ' + (missing.length - failed) + '/' + missing.length + ' 个交易日')
}

/* -------------------- 组装 -------------------- */

function buildEtfSeries(etf, dates, prevDate, kline, sseCache, szseCache) {
  const rows = (kline[etf.code] && kline[etf.code].rows) || []
  const closeByDate = {}
  rows.forEach((row) => {
    closeByDate[row[0]] = Number(row[1])
  })

  const shareOf = (date) => {
    if (sseCache[date] && sseCache[date][etf.code] !== undefined) return sseCache[date][etf.code]
    if (szseCache[date] && szseCache[date][etf.code] !== undefined) return szseCache[date][etf.code]
    return undefined
  }

  const prevShares = shareOf(prevDate)
  let lastShares = prevShares
  let lastClose = closeByDate[prevDate]

  const shares = []
  const close = []
  const flow = []

  dates.forEach((date, index) => {
    const s = shareOf(date)
    const c = closeByDate[date]

    if (s !== undefined) lastShares = s
    if (c !== undefined) lastClose = c

    const shareValue = lastShares !== undefined ? lastShares : 0
    const closeValue = lastClose !== undefined ? lastClose : 0

    shares.push(round4(shareValue))
    // ETF 报价保留 3 位小数（交易所 / 东方财富均为 3 位）
    close.push(round3(closeValue))

    const before = index === 0 ? (prevShares !== undefined ? prevShares : shareValue) : shares[index - 1]
    flow.push(round2((shareValue - before) * closeValue))
  })

  const latestShares = shares[shares.length - 1]
  const latestClose = close[close.length - 1]

  return {
    code: etf.code,
    name: etf.name,
    full: etf.full,
    exch: etf.exch,
    index: etf.index,
    note: etf.note,
    shares,
    flow,
    close,
    latestShares,
    sharesChange: round4(latestShares - shares[shares.length - 2]),
    latestFlow: flow[flow.length - 1],
    flow5: tailSum(flow, 5),
    flow20: tailSum(flow, 20),
    flow60: tailSum(flow, 60),
    flowAll: round2(sum(flow)),
    latestClose,
    priceChangePct: close[close.length - 2] ? round2(((latestClose - close[close.length - 2]) / close[close.length - 2]) * 100) : 0,
    scale: round2(latestShares * latestClose)
  }
}

function buildFutures(dates, ccpmCache) {
  const futDates = dates.filter((date) => {
    const day = ccpmCache[date]
    return day && PRODUCTS.every((p) => day[p] && Array.isArray(day[p].contracts))
  })

  if (futDates.length < 2) {
    throw new Error('中金所持仓数据不足（仅 ' + futDates.length + ' 个交易日），无法生成期货序列')
  }

  const series = {}
  const lastDeltas = {}
  const contracts = {}

  PRODUCTS.forEach((product) => {
    series[product] = futDates.map((date) => ccpmCache[date][product].net)
  })

  const latestDate = futDates[futDates.length - 1]
  PRODUCTS.forEach((product) => {
    contracts[product] = ccpmCache[latestDate][product].contracts
    // 当日净空头变动必须用中金所的 varvolume（多空增减）汇总：
    // 前 20 会员排名每天会变化，直接拿两天的持仓水平相减，
    // 会把“进出榜单”的整段仓位误算成当日增减。
    lastDeltas[product] = contracts[product].reduce((total, row) => total + row.netChg, 0)
  })

  return {
    dates: futDates,
    series,
    lastDeltas,
    contracts,
    latestDate,
    totalNet: sum(PRODUCTS.map((p) => series[p][series[p].length - 1])),
    changeTotal: sum(PRODUCTS.map((p) => lastDeltas[p])),
    contractCount: PRODUCTS.reduce((n, p) => n + contracts[p].length, 0)
  }
}

function assemble(options) {
  const { dates, allDates, prevDate, kline, sseCache, szseCache, ccpmCache } = options

  const etfs = ETFS.map((etf) => buildEtfSeries(etf, dates, prevDate, kline, sseCache, szseCache))

  const totalFlowByDay = dates.map((date, i) => round2(sum(etfs.map((e) => e.flow[i]))))
  // 期货使用完整交易日序列，避免份额未披露时把当日期货也裁掉
  const futures = buildFutures(allDates || dates, ccpmCache)

  const totalScale = round2(sum(etfs.map((e) => e.scale)))
  const totalShares = round4(sum(etfs.map((e) => e.latestShares)))

  const latestEtfDate = dates[dates.length - 1]
  const today = futureMax(futures.latestDate, latestEtfDate)

  return {
    meta: {
      updated: localNow(),
      fetchedAt: new Date().toISOString(),
      etfDate: latestEtfDate,
      futuresDate: futures.latestDate,
      etfCount: etfs.length,
      sample: false,
      updateNote: '份额数据 T+1 披露，ETF 动向于每日 23:00 更新',
      disclaimer: '本工具仅供研究参考，不构成任何投资建议。数据来自交易所、中金所与东方财富公开接口。'
    },
    today,
    etfDate: latestEtfDate,
    firstDate: dates[0],
    products: PRODUCTS,
    productNames: PRODUCT_NAMES,
    productColors: PRODUCT_COLORS,
    dates,
    etfs,
    totalFlowByDay,
    totals: {
      dayFlow: round2(sum(etfs.map((e) => e.latestFlow))),
      flow5: round2(sum(etfs.map((e) => e.flow5))),
      flow20: round2(sum(etfs.map((e) => e.flow20))),
      flow60: round2(sum(etfs.map((e) => e.flow60))),
      scale: totalScale,
      shares: totalShares,
      futuresChange: futures.changeTotal,
      futuresNet: futures.totalNet
    },
    futures,
    baseline: BASELINE
  }
}

function futureMax(a, b) {
  return a > b ? a : b
}

/**
 * 交易所份额是 T+1 披露：收盘后 K 线已经有当天价格，但当天份额可能还没发布。
 * 若最新交易日的份额覆盖率不足，就把 ETF 序列回退到上一交易日，避免把
 * 「昨天的份额 × 今天的价格」当成今天的净流入。
 */
function shareCoverage(date, sseCache, szseCache) {
  let count = 0
  CODES.forEach((code) => {
    const sh = sseCache[date]
    const sz = szseCache[date]
    if ((sh && sh[code] !== undefined) || (sz && sz[code] !== undefined)) count++
  })
  return count
}

function trimUnpublishedShares(dates, sseCache, szseCache, log) {
  const threshold = Math.ceil(CODES.length * 0.8)
  let end = dates.length - 1
  while (end > 0) {
    const coverage = shareCoverage(dates[end], sseCache, szseCache)
    if (coverage >= threshold) break
    if (log) {
      log('[shares] ' + dates[end] + ' 份额尚未披露（' + coverage + '/' + CODES.length + '），回退到上一交易日')
    }
    end--
  }
  return dates.slice(0, end + 1)
}

/* -------------------- 主流程 -------------------- */

/**
 * @param {Object} options
 * @param {number} [options.days=147]       历史交易日数量
 * @param {string} [options.cacheDir]       缓存目录
 * @param {boolean} [options.force]         忽略缓存，重新抓取全部
 * @param {boolean} [options.refreshPrices] 是否重新抓取 K 线（默认 true）
 * @param {Function} [options.log]
 */
async function buildSnapshot(options) {
  const opts = options || {}
  const days = Math.max(5, Number(opts.days) || DEFAULT_HISTORY_DAYS)
  const cacheDir = opts.cacheDir || DEFAULT_CACHE_DIR
  const log = opts.log || (() => {})
  const force = !!opts.force

  const cache = new Cache(cacheDir)
  const kline = force ? {} : cache.load('kline', {})
  const sseCache = force ? {} : cache.load('sse', {})
  const szseCache = force ? {} : cache.load('szse', {})
  const ccpmCache = force ? {} : cache.load('ccpm', {})

  log('开始抓取：最近 ' + days + ' 个交易日')

  await refreshKline(kline, days, log)
  cache.save('kline', kline)

  const anchor = pickAnchor(kline)
  if (!anchor || !anchor.rows || anchor.rows.length < 2) {
    throw new Error(
      '所有 ETF 的 K 线都抓取失败，无法确定交易日序列。' +
      '请检查运行环境能否访问 push2his.eastmoney.com（常见原因：出口 IP 被限流或屏蔽）。'
    )
  }

  const usableDays = Math.min(days, anchor.rows.length)
  if (usableDays < days && log) {
    log('[kline] 实际可用 ' + usableDays + ' 个交易日（期望 ' + days + '），按可用数据生成')
  }

  const anchorDates = anchor.rows.map((r) => r[0])
  const start = Math.max(0, anchorDates.length - usableDays)
  const dates = anchorDates.slice(start)
  const prevDate = start > 0 ? anchorDates[start - 1] : null

  const requiredDates = prevDate ? [prevDate].concat(dates) : dates.slice()

  await refreshSseShares(sseCache, requiredDates, log)
  cache.save('sse', sseCache)

  await refreshSzseShares(szseCache, requiredDates, log)
  cache.save('szse', szseCache)

  // 份额 T+1：当天价格已出但份额未披露时，ETF 序列回退到上一交易日
  const etfDates = trimUnpublishedShares(dates, sseCache, szseCache, log)
  if (etfDates.length < 2) {
    throw new Error('可用份额数据不足（仅 ' + etfDates.length + ' 个交易日）')
  }

  await refreshCcpm(ccpmCache, dates, log)
  cache.save('ccpm', ccpmCache)

  const snapshot = assemble({
    dates: etfDates,
    allDates: dates,
    prevDate,
    kline,
    sseCache,
    szseCache,
    ccpmCache
  })
  cache.save('snapshot', snapshot)

  log(
    '完成：ETF ' + snapshot.etfs.length + ' 只 · ' +
    snapshot.dates.length + ' 个交易日 · ' +
    '份额 ' + snapshot.meta.etfDate + ' · 期货 ' + snapshot.futures.latestDate
  )

  return snapshot
}

module.exports = {
  buildSnapshot,
  DEFAULT_CACHE_DIR,
  DEFAULT_HISTORY_DAYS,
  isoToday,
  addDays,
  localNow
}
