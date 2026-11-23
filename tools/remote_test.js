/**
 * 远程模式的离线验证：不发真实网络请求，用 mock wx.request 回放 dist/snapshot.json，
 * 确认 services/data.js 的 http 分支能正确解析 { ok, data }、加防缓存参数、
 * 并把快照里的龙虎榜当作本地数据返回。
 *
 * 先跑过一次构建再执行本测试：node tools/ci-build.js --offline --out dist
 * 用法：node tools/remote_test.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const MP = path.resolve(__dirname, '..', 'miniprogram')
const DIST = path.resolve(__dirname, '..', 'dist', 'snapshot.json')

if (!fs.existsSync(DIST)) {
  console.error('缺少 dist/snapshot.json，请先运行：node tools/ci-build.js --offline --out dist')
  process.exit(1)
}

const payload = JSON.parse(fs.readFileSync(DIST, 'utf8'))
// 离线构建的样本可能没有龙虎榜，这时借用内置快照的几天，专门验证“本地优先”分支
const bundled = require(path.join(MP, 'data', 'snapshot.js'))
if (!payload.data.qihuo || !Object.keys(payload.data.qihuo).length) {
  payload.data.qihuo = bundled.qihuo || {}
}

const config = require(path.join(MP, 'config.js'))
config.apiBase = 'https://data.kaciry.com'
config.cloudEnv = ''

const urls = []
global.wx = {
  request(options) {
    urls.push(options.url)
    setTimeout(() => {
      if (options.url.indexOf('/snapshot.json') >= 0) {
        options.success({ statusCode: 200, data: payload })
      } else {
        options.fail({ errMsg: 'request:fail 404' })
      }
    }, 0)
  },
  getStorageSync: () => undefined,
  setStorageSync: () => {},
  removeStorageSync: () => {},
  getStorageInfoSync: () => ({ currentSize: 0, limitSize: 10240 })
}

const dataService = require(path.join(MP, 'services', 'data.js'))

async function main() {
  const init = await dataService.init()
  assert.strictEqual(init.mode, 'http', 'init 应走 http 模式')
  assert.strictEqual(dataService.getStatus().source, 'live', '来源应标记为 live')
  assert.strictEqual(dataService.getStatus().modeLabel, '数据服务')

  assert.strictEqual(urls.length, 1, '只应发一次请求')
  assert(urls[0].indexOf('https://data.kaciry.com/snapshot.json') === 0, '请求地址不对：' + urls[0])
  assert(urls[0].indexOf('t=') > 0, '缺少防缓存时间戳：' + urls[0])

  const snapshot = dataService.getSnapshot()
  assert.strictEqual(snapshot.meta.etfDate, payload.data.meta.etfDate)
  assert(snapshot.futures.latestDate)

  const qihuoDate = Object.keys(snapshot.qihuo).sort()[0]
  const before = urls.length
  const qihuo = await dataService.getQihuo(qihuoDate)
  assert(qihuo && qihuo.sides.length === 2, '龙虎榜应命中快照')
  assert.strictEqual(urls.length, before, '龙虎榜命中本地后不应再发请求')

  // 期货收盘当晚就有榜单，份额还是 T+1，today 可能落在 futures 的最后一个交易日上
  if (snapshot.qihuo[snapshot.today]) {
    const latest = await dataService.getQihuo(snapshot.today)
    assert(latest && latest.sides.length === 2, '“今天”的龙虎榜不应被误判为非交易日')
  }

  console.log('PASS 远程快照解析：' + urls[0])
  console.log('PASS 龙虎榜本地优先：' + qihuoDate)
  console.log('ALL REMOTE TESTS PASSED')
}

main().catch((e) => {
  console.error('FAIL', e && e.stack ? e.stack : e)
  process.exit(1)
})
