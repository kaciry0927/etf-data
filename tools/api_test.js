/**
 * 数据服务接口测试：请求 /api/health、/api/snapshot、/api/qihuo。
 * 需要先启动 server：node server/index.js
 *
 * Run: node tools/api_test.js
 */
const path = require('path')
const http = require('http')
const https = require('https')
const assert = require('assert')

const config = require(path.resolve(__dirname, '..', 'miniprogram', 'config.js'))
const base = String(config.apiBase || 'http://127.0.0.1:3100').replace(/\/+$/, '')

function request(url) {
  return new Promise((resolve, reject) => {
    const lib = url.indexOf('https:') === 0 ? https : http
    const req = lib.get(url, { timeout: 20000 }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        let json = null
        try {
          json = JSON.parse(body)
        } catch (e) {
          // 保留原始文本
        }
        resolve({ status: res.statusCode, body, json })
      })
    })
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
  })
}

async function main() {
  let health
  try {
    health = await request(base + '/api/health')
  } catch (e) {
    console.error('无法连接数据服务 ' + base + '：' + e.message)
    console.error('请先运行：node server/index.js')
    process.exit(1)
  }
  assert.strictEqual(health.status, 200, 'health 状态码')
  assert(health.json && health.json.ok, 'health 返回 ok')
  console.log('PASS /api/health', health.json.snapshotDate, health.json.updated)

  const snap = await request(base + '/api/snapshot')
  assert.strictEqual(snap.status, 200, 'snapshot 状态码')
  assert(snap.json && snap.json.ok && snap.json.data, 'snapshot 返回 data')
  const data = snap.json.data
  assert.strictEqual(data.etfs.length, 16, 'ETF 数量')
  assert(data.dates.length >= 20, '交易日数量')
  assert(data.totals && typeof data.totals.dayFlow === 'number', 'totals.dayFlow')
  assert(data.futures && data.futures.series && data.futures.series.IH.length > 1, '期货序列')
  const varSum = data.products.reduce(
    (total, product) =>
      total + data.futures.contracts[product].reduce((sum, row) => sum + row.netChg, 0),
    0
  )
  assert.strictEqual(data.futures.changeTotal, varSum, '期货当日变动必须由 varvolume 汇总')
  assert.strictEqual(data.totals.futuresChange, varSum, 'totals.futuresChange 与 varvolume 一致')
  assert.strictEqual(data.meta.sample, false, '内置快照不得标记为演示数据')
  data.etfs.forEach((etf) => {
    assert(etf.shares.length === data.dates.length, etf.code + ' 份额序列长度')
    assert(etf.close.length === data.dates.length, etf.code + ' 收盘价序列长度')
    assert(isFinite(etf.latestShares) && etf.latestShares > 0, etf.code + ' 最新份额')
    assert(isFinite(etf.latestClose) && etf.latestClose > 0, etf.code + ' 最新价')
  })
  console.log(
    'PASS /api/snapshot',
    data.dates.length + ' 个交易日',
    data.meta.etfDate,
    '净流入 ' + data.totals.dayFlow.toFixed(1) + ' 亿元',
    '规模 ' + data.totals.scale.toFixed(0) + ' 亿元'
  )

  const tradeDate = data.today
  const qihuo = await request(base + '/api/qihuo?date=' + tradeDate)
  assert.strictEqual(qihuo.status, 200, 'qihuo 状态码')
  assert(qihuo.json && qihuo.json.ok, 'qihuo 返回 ok')
  assert(qihuo.json.data && qihuo.json.data.sides.length === 2, '龙虎榜两侧数据')
  assert.strictEqual(qihuo.json.data.sides[0].rows.length, 4, '四品种')
  console.log(
    'PASS /api/qihuo',
    tradeDate,
    qihuo.json.data.sides.map((s) => s.side + ' 净增 ' + s.total.net).join(' / ')
  )

  // 找一个周末验证空态
  const weekend = '2026-10-31'
  const empty = await request(base + '/api/qihuo?date=' + weekend)
  assert.strictEqual(empty.status, 200)
  assert.strictEqual(empty.json.data, null, '非交易日应返回 null')
  console.log('PASS /api/qihuo 非交易日空态', weekend)

  const bad = await request(base + '/api/qihuo?date=bad')
  assert.strictEqual(bad.status, 400, '非法日期返回 400')
  console.log('PASS 参数校验')

  console.log('\nALL API TESTS PASSED')
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
