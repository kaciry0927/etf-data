'use strict'

/**
 * 东方财富公开接口：
 *   1) push2his 历史 K 线（收盘价，用于净流入与组合规模）
 *   2) qhhqzl 期指多空龙虎榜（M7 实时模块）
 */

const { requestJson } = require('./http')
const { BY_CODE, PRODUCTS, PRODUCT_NAMES } = require('./universe')

const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const QIHUO_URL = 'https://qhhqzl.eastmoney.com/marketFutuWeb/dragonAndTigerInfo/getLongAndShortPosition'

const QIHUO_HEADERS = {
  Referer: 'https://qhhqzl.eastmoney.com/',
  Accept: 'application/json, text/plain, */*'
}

/** 东方财富 K 线：返回 [{ date, open, close, high, low, volume, amount }] */
async function fetchKline(code, beg, end) {
  const etf = BY_CODE[code]
  if (!etf) throw new Error('未知 ETF 代码: ' + code)

  const url =
    KLINE_URL +
    '?secid=' + etf.secid +
    '&fields1=f1,f2,f3,f4,f5,f6' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    '&klt=101&fqt=1' +
    '&beg=' + (beg || '20250101').replace(/-/g, '') +
    '&end=' + (end || '20500101').replace(/-/g, '')

  const json = await requestJson(url, {
    headers: { Referer: 'https://quote.eastmoney.com/' },
    // 东财被限流时会直接掐连接，单次请求别等太久，重试交给上层统一控制
    retries: 1,
    timeout: 15000
  })
  const data = json && json.data
  if (!data || !Array.isArray(data.klines) || !data.klines.length) {
    // 机房 IP 常见返回 200 + data:null，这里把 rc 和响应片段带出来，便于定位
    const preview = JSON.stringify(json || {}).slice(0, 140)
    throw new Error(
      '东方财富未返回 ' + code + ' 的 K 线（rc=' + (json && json.rc) + '，响应 ' + preview + '）'
    )
  }

  const rows = []
  data.klines.forEach((line) => {
    const parts = String(line).split(',')
    const date = parts[0]
    const close = Number(parts[2])
    if (!date || !isFinite(close)) return
    rows.push({
      date,
      open: Number(parts[1]),
      close,
      high: Number(parts[3]),
      low: Number(parts[4]),
      volume: Number(parts[5]),
      amount: Number(parts[6])
    })
  })
  return rows
}

function toIso(compact) {
  const text = String(compact || '')
  if (text.length !== 8) return ''
  return text.slice(0, 4) + '-' + text.slice(4, 6) + '-' + text.slice(6, 8)
}

function sideRows(rows) {
  return (rows || []).map((row) => ({
    company: row.futureCompanyName || '',
    code: String(row.futureCompanyCodeNew || row.futureCompanyCode || ''),
    long: Number(row.longNum) || 0,
    short: Number(row.shortNum) || 0,
    longChange: Number(row.longChange) || 0,
    shortChange: Number(row.shortChange) || 0
  }))
}

function isCitic(row) {
  return row.code === '10058975' || String(row.company).indexOf('中信期货') >= 0
}

function buildSides(products) {
  const sides = []

  ;['中信期货', '其他代客'].forEach((sideName) => {
    const rows = products.map((p) => {
      const citicRows = p.longList.concat(p.shortList).filter(isCitic)
      let longChg = 0
      let shortChg = 0

      if (sideName === '中信期货') {
        // 多单榜里的行只有 longChange，空单榜里的行只有 shortChange，
        // 两榜合起来正好是同一会员的多空净增，不会重复计数。
        citicRows.forEach((r) => {
          longChg += r.longChange
          shortChg += r.shortChange
        })
      } else {
        p.longList.concat(p.shortList).forEach((r) => {
          if (isCitic(r)) return
          longChg += r.longChange
          shortChg += r.shortChange
        })
      }

      const net = longChg - shortChg
      return {
        product: p.product,
        productName: PRODUCT_NAMES[p.product],
        longChg: Math.round(longChg),
        shortChg: Math.round(shortChg),
        net: Math.round(net),
        tag: net < 0 ? '加仓' : '减仓'
      }
    })

    const totalLong = rows.reduce((s, r) => s + r.longChg, 0)
    const totalShort = rows.reduce((s, r) => s + r.shortChg, 0)
    const totalNet = totalLong - totalShort

    sides.push({
      side: sideName,
      rows,
      total: {
        product: '合计',
        productName: '四品种合计',
        longChg: totalLong,
        shortChg: totalShort,
        net: totalNet,
        tag: totalNet < 0 ? '加仓' : '减仓'
      }
    })
  })

  return sides
}

/**
 * 期指多空龙虎榜（实时）。
 * 接口会回退到最近交易日，因此必须校验 tradeDate；不匹配时返回 null，
 * 由前端展示「非交易日 / 尚未发布」空态。
 *
 * @param {string} date ISO 日期 YYYY-MM-DD
 */
async function fetchQihuo(date) {
  const compact = date.replace(/-/g, '')
  const products = []

  for (const product of PRODUCTS) {
    const url = QIHUO_URL + '?date=' + compact + '&contract=' + product + '&market=220'
    const json = await requestJson(url, { headers: QIHUO_HEADERS })

    if (!json || json.code !== 10000 || !json.data) {
      return null
    }

    const tradeDate = String(json.data.tradeDate || '')
    if (tradeDate !== compact) return null

    products.push({
      product,
      longList: sideRows(json.data.longInfoList),
      shortList: sideRows(json.data.shortInfoList)
    })
  }

  return {
    date,
    tradeDate: date,
    sides: buildSides(products)
  }
}

module.exports = { fetchKline, fetchQihuo }
