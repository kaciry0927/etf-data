'use strict'

/**
 * 深交所 ETF 份额。
 *
 * GET https://www.szse.cn/api/report/ShowReport?SHOWTYPE=xlsx&CATALOGID=scsj_fund_jjgm
 * 返回 xlsx（列：日期 / 基金代码 / 基金简称 / 基金规模(份)），
 * 基金规模除以 1e8 得到「亿份」。单次查询区间不能超过 6 个月。
 */

const { requestBuffer } = require('./http')
const { readXlsx } = require('./xlsx')
const { SZSE_CODES } = require('./universe')

const URL_BASE = 'https://www.szse.cn/api/report/ShowReport'
const CODE_SET = new Set(SZSE_CODES)
// 一次查询全市场 ETF 时，单日约 770 行；窗口过大会触发 Excel 65,536 行上限，
// 表现为较早的日期被静默截断，因此按 45 天分片，并对缺失日期逐日补抓。
const MAX_WINDOW_DAYS = 45

function round4(value) {
  return Math.round(value * 10000) / 10000
}

function toIso(value) {
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  // Excel 序列号（1900 日期系统）
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text)
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000)
      return new Date(ms).toISOString().slice(0, 10)
    }
  }
  return ''
}

function splitRange(start, end) {
  const windows = []
  let cursor = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (cursor <= last) {
    const windowEnd = new Date(cursor.getTime() + (MAX_WINDOW_DAYS - 1) * 86400000)
    const stop = windowEnd < last ? windowEnd : last
    windows.push([cursor.toISOString().slice(0, 10), stop.toISOString().slice(0, 10)])
    cursor = new Date(stop.getTime() + 86400000)
  }
  return windows
}

async function fetchWindow(start, end) {
  const url =
    URL_BASE +
    '?SHOWTYPE=xlsx&CATALOGID=scsj_fund_jjgm&TABKEY=tab1' +
    '&txtStart=' + encodeURIComponent(start) +
    '&txtEnd=' + encodeURIComponent(end) +
    '&jjlb=ETF&random=' + Math.random()

  const buffer = await requestBuffer(url, {
    headers: {
      Referer: 'https://www.szse.cn/market/fund/volume/etf/index.html',
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*'
    }
  })

  const rows = readXlsx(buffer)
  if (!rows.length) return {}

  // 表头可能微调，按列名定位，避免写死列序
  const header = rows[0].map((c) => String(c || '').replace(/\s/g, ''))
  const findCol = (keywords) => {
    for (let i = 0; i < header.length; i++) {
      for (const key of keywords) if (header[i].indexOf(key) >= 0) return i
    }
    return -1
  }

  const dateCol = findCol(['日期'])
  const codeCol = findCol(['基金代码', '证券代码', '代码'])
  const scaleCol = findCol(['基金规模', '基金份额', '份额'])

  if (dateCol < 0 || codeCol < 0 || scaleCol < 0) {
    throw new Error('深交所 xlsx 表头无法识别: ' + header.join('|'))
  }

  const result = {}
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const date = toIso(row[dateCol])
    const code = String(row[codeCol] || '').trim()
    const scale = Number(String(row[scaleCol] || '').replace(/,/g, ''))
    if (!date || !CODE_SET.has(code) || !isFinite(scale)) continue
    if (!result[date]) result[date] = {}
    result[date][code] = round4(scale / 1e8)
  }
  return result
}

/**
 * @param {string[]} dates 需要的日期（升序）
 * @returns {Promise<Object>} date -> code -> 亿份
 */
async function fetchShares(dates) {
  const sorted = dates.slice().sort()
  if (!sorted.length) return {}

  const windows = splitRange(sorted[0], sorted[sorted.length - 1])
  const wanted = new Set(sorted)
  const merged = {}

  for (const [start, end] of windows) {
    const part = await fetchWindow(start, end)
    Object.keys(part).forEach((date) => {
      if (!wanted.has(date)) return
      merged[date] = Object.assign(merged[date] || {}, part[date])
    })
  }

  // 兜底：窗口截断 / 节假日边界导致个别日期缺失时，逐日补抓
  const missing = sorted.filter((date) => !merged[date])
  for (const date of missing) {
    const part = await fetchWindow(date, date)
    if (part[date]) merged[date] = part[date]
  }

  return merged
}

/** 供增量更新使用：只查一个日期。 */
async function fetchSharesForDate(date) {
  const map = await fetchShares([date])
  return map[date] || null
}

module.exports = { fetchShares, fetchSharesForDate }
