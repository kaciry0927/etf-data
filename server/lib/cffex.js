'use strict'

/**
 * 中金所官方持仓排名（ccpm XML）。
 *
 * GET http://www.cffex.com.cn/sj/ccpm/{YYYYMM}/{DD}/{IH|IF|IC|IM}.xml
 * datatypeid: 0=成交量排名、1=多头持仓、2=空头持仓
 * 净空头 = Σ空头持仓 − Σ多头持仓（前 20 会员口径）
 */

const { request } = require('./http')
const { PRODUCTS } = require('./universe')

function parseDataBlocks(xml) {
  const rows = []
  xml.replace(/<data\b[^>]*>([\s\S]*?)<\/data>/g, (match, inner) => {
    const pick = (tag) => {
      const m = inner.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'))
      return m ? m[1].trim() : ''
    }
    rows.push({
      instrumentid: pick('instrumentid'),
      tradingday: pick('tradingday'),
      datatypeid: pick('datatypeid'),
      rank: Number(pick('rank')) || 0,
      shortname: pick('shortname'),
      volume: Number(pick('volume')) || 0,
      varvolume: Number(pick('varvolume')) || 0
    })
    return ''
  })
  return rows
}

function aggregate(product, rows, isoDate) {
  const compact = isoDate.replace(/-/g, '')
  const contracts = {}
  let matched = false

  rows.forEach((row) => {
    if (row.tradingday && row.tradingday !== compact) return
    if (!row.instrumentid) return
    matched = true

    if (!contracts[row.instrumentid]) {
      contracts[row.instrumentid] = {
        contract: row.instrumentid,
        long: 0,
        longChg: 0,
        short: 0,
        shortChg: 0
      }
    }
    const target = contracts[row.instrumentid]
    if (row.datatypeid === '1') {
      target.long += row.volume
      target.longChg += row.varvolume
    } else if (row.datatypeid === '2') {
      target.short += row.volume
      target.shortChg += row.varvolume
    }
  })

  if (!matched) return null

  const list = Object.keys(contracts)
    .sort()
    .map((key) => {
      const c = contracts[key]
      return {
        contract: c.contract,
        long: c.long,
        longChg: c.longChg,
        short: c.short,
        shortChg: c.shortChg,
        netShort: c.short - c.long,
        netChg: c.shortChg - c.longChg
      }
    })

  const long = list.reduce((s, c) => s + c.long, 0)
  const short = list.reduce((s, c) => s + c.short, 0)

  return {
    product,
    long,
    short,
    net: short - long,
    contracts: list
  }
}

/**
 * @param {string} date ISO 日期
 * @returns {Promise<Object|null>} { IH: {...}, IF: {...}, ... }；无文件返回 null
 */
async function fetchPositions(date) {
  const [year, month, day] = date.split('-')
  const result = {}

  for (const product of PRODUCTS) {
    const url =
      'http://www.cffex.com.cn/sj/ccpm/' + year + month + '/' + day + '/' + product + '.xml'

    let res
    try {
      res = await request(url, {
        headers: { Referer: 'http://www.cffex.com.cn/' },
        retries: 1
      })
    } catch (e) {
      return null
    }

    if (res.status === 404) return null
    if (res.status !== 200) {
      // 官方偶尔会重定向到 https 或返回 5xx，交给上层重试 / 跳过
      throw new Error('中金所 ' + product + ' 返回 HTTP ' + res.status)
    }

    const rows = parseDataBlocks(res.text)
    const agg = aggregate(product, rows, date)
    if (!agg) return null
    result[product] = agg
  }

  return result
}

module.exports = { fetchPositions }
