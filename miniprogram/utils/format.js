/**
 * 数值格式化与日期工具。
 * 页面只负责取数，所有展示用文本统一在这里生成，避免在 WXML 中做计算。
 */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

function round2(v) {
  return Math.round(v * 100) / 100
}

function sum(arr) {
  var s = 0
  for (var i = 0; i < arr.length; i++) s += arr[i]
  return s
}

function sumTail(arr, n) {
  var s = 0
  for (var i = Math.max(0, arr.length - n); i < arr.length; i++) s += arr[i]
  return s
}

function last(arr) {
  return arr && arr.length ? arr[arr.length - 1] : null
}

function fmt(v, digits, sign) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  var d = typeof digits === 'number' ? digits : 1
  var abs = Math.abs(v)
  var str = abs.toFixed(d)
  var parts = str.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  var out = parts.join('.')
  if (sign && v > 0) return '+' + out
  if (v < 0) return '-' + out
  return out
}

function tone(v) {
  if (!v) return 'flat'
  return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
}

function pct(v, digits) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return v.toFixed(typeof digits === 'number' ? digits : 2) + '%'
}

function signed(v, digits) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  var d = typeof digits === 'number' ? digits : 2
  return (v > 0 ? '+' : '') + v.toFixed(d) + '%'
}

function dateLabel(iso) {
  if (!iso || iso.length < 10) return iso || ''
  return iso.slice(5, 7) + '/' + iso.slice(8, 10)
}

function dateCN(iso) {
  if (!iso) return ''
  var p = iso.split('-')
  return p[1] + '月' + p[2] + '日'
}

function parseISO(iso) {
  var p = String(iso).split('-')
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])))
}

function isoOf(d) {
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

var DOW = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function weekday(iso) {
  return DOW[parseISO(iso).getUTCDay()]
}

function weekdayShort(iso) {
  return weekday(iso).replace('周', '')
}

function nowTime() {
  var d = new Date()
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
}

function shortNow() {
  var d = new Date()
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

module.exports = {
  pad2: pad2,
  round2: round2,
  sum: sum,
  sumTail: sumTail,
  last: last,
  fmt: fmt,
  tone: tone,
  pct: pct,
  signed: signed,
  dateLabel: dateLabel,
  dateCN: dateCN,
  parseISO: parseISO,
  isoOf: isoOf,
  weekday: weekday,
  weekdayShort: weekdayShort,
  nowTime: nowTime,
  shortNow: shortNow
}
