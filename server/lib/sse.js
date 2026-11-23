'use strict'

/**
 * 上交所 ETF 份额。
 *
 * GET https://query.sse.com.cn/commonQuery.do?...&STAT_DATE=YYYY-MM-DD
 * 返回 result[]，TOT_VOL 单位为「万份」，除以 1e4 得到「亿份」。
 * 必须带 Referer，否则会被拒绝；非交易日返回 result 为空数组。
 */

const { requestJson } = require('./http')
const { SSE_CODES } = require('./universe')

const URL_BASE =
  'https://query.sse.com.cn/commonQuery.do' +
  '?isPagination=true&pageHelp.pageSize=10000&pageHelp.pageNo=1' +
  '&pageHelp.beginPage=1&pageHelp.cacheSize=1&pageHelp.endPage=1' +
  '&sqlId=COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L'

const CODE_SET = new Set(SSE_CODES)

function round4(value) {
  return Math.round(value * 10000) / 10000
}

/**
 * @param {string} date ISO 日期 YYYY-MM-DD
 * @returns {Promise<Object|null>} code -> 亿份；非交易日 / 尚未披露返回 null
 */
async function fetchShares(date) {
  const url = URL_BASE + '&STAT_DATE=' + encodeURIComponent(date)
  const json = await requestJson(url, {
    headers: {
      Referer: 'https://www.sse.com.cn/',
      Accept: 'application/json, text/javascript, */*; q=0.01'
    }
  })

  const list = Array.isArray(json.result) ? json.result : []
  if (!list.length) return null

  const map = {}
  list.forEach((row) => {
    const code = String(row.SEC_CODE || '').trim()
    if (!CODE_SET.has(code)) return
    const volume = Number(row.TOT_VOL)
    if (!isFinite(volume)) return
    map[code] = round4(volume / 1e4)
  })

  return Object.keys(map).length ? map : null
}

module.exports = { fetchShares }
