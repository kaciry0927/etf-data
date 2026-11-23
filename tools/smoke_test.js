/**
 * Node smoke test: load every page module with a mocked mini program runtime,
 * run onLoad and a few interactions, fail on runtime errors or empty key data.
 *
 * Run: node tools/smoke_test.js
 */
const path = require('path')
const assert = require('assert')

const MP = path.resolve(__dirname, '..', 'miniprogram')
const countUp = require(path.join(MP, 'utils', 'count-up.js'))

// 测试固定走离线模式：config.js 里配了 apiBase（线上读 GitHub Pages），
// 但单测不能依赖网络，这里强制清空，走打包进小程序的快照。
const mpConfig = require(path.join(MP, 'config.js'))
mpConfig.apiBase = ''
mpConfig.cloudEnv = ''

const storage = {}
const calls = []

global.wx = {
  getStorageSync: (k) => storage[k],
  setStorageSync: (k, v) => { storage[k] = v },
  removeStorageSync: (k) => { delete storage[k] },
  getStorageInfoSync: () => ({ currentSize: 12, limitSize: 10240 }),
  showToast: (o) => calls.push(['toast', o && o.title]),
  showLoading: () => {},
  hideLoading: () => {},
  showModal: (o) => { if (o && o.success) o.success({ confirm: true }) },
  navigateTo: (o) => calls.push(['navigateTo', o.url]),
  redirectTo: (o) => calls.push(['redirectTo', o.url]),
  switchTab: (o) => calls.push(['switchTab', o.url]),
  navigateBack: () => calls.push(['back']),
  pageScrollTo: () => {},
  setClipboardData: () => {},
  requestSubscribeMessage: (o) => { if (o.success) o.success({}) },
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 281, right: 368 })
}

global.getCurrentPages = () => [{ route: 'pages/snapshot/index' }]

function setDeep(obj, key, value) {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (cur[p] === undefined || cur[p] === null) {
      cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {}
    }
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

function settle(p) {
  countUp.stop(p, true)
}

function loadPage(rel) {
  const file = path.join(MP, rel)
  let def = null
  global.Page = (d) => { def = d }
  delete require.cache[require.resolve(file)]
  require(file)
  assert(def, 'Page() not called: ' + rel)
  const inst = Object.assign({}, def)
  inst.data = JSON.parse(JSON.stringify(def.data || {}))
  inst.setData = function (patch, cb) {
    Object.keys(patch).forEach((k) => setDeep(this.data, k, patch[k]))
    if (cb) cb()
  }
  return inst
}

function run(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('PASS', name))
    .catch((e) => {
      console.error('FAIL', name, e)
      process.exitCode = 1
    })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  await run('offline snapshot', async () => {
    // 方案 C 默认配置：不配置 apiBase / cloudEnv，运行时只用内置静态快照
    const ds = require(path.join(MP, 'services', 'data.js'))
    assert.strictEqual(ds.getStatus().mode, 'offline')
    const init = await ds.init()
    assert.strictEqual(init.mode, 'offline')
    const bundled = ds.getSnapshot()
    assert.strictEqual(bundled.meta.sample, false)
    assert(bundled.qihuo && Object.keys(bundled.qihuo).length >= 1)
    const payload = await ds.getQihuo(bundled.today)
    assert(payload && payload.sides.length === 2)
    // 期货当日变动必须是 varvolume 汇总，不能是两日持仓水平差
    const varSum = bundled.products.reduce(
      (total, product) =>
        total + bundled.futures.contracts[product].reduce((sum, row) => sum + row.netChg, 0),
      0
    )
    assert.strictEqual(bundled.futures.changeTotal, varSum)
    assert.strictEqual(bundled.futures.changeTotal, 1484)
  })

  await run('overview', () => {
    const p = loadPage('pages/overview/index.js')
    p.onLoad()
    settle(p)
    assert.strictEqual(p.data.dayFlowText, '+36.5')
    assert.strictEqual(p.data.sharesText, '3,564.73')
    assert.strictEqual(p.data.stats.length, 4)
    assert.strictEqual(p.data.stats[3].value, '+1,484')
    assert.strictEqual(p.data.ticker.length, 32)
    assert.strictEqual(p.data.flow20Spark.length, 20)
    assert.strictEqual(p.data.topFlowRows.length, 5)
    assert(p.data.top5.length >= 6)
    p.onShow()
    assert.strictEqual(p.data.pageAnim, 'a')
    p.onShow()
    assert.strictEqual(p.data.pageAnim, 'b')
    settle(p)
    p.onStatTap({ currentTarget: { dataset: { action: 'futures' } } })
    assert(calls.some((c) => c[0] === 'switchTab' && c[1].indexOf('futures') >= 0))
  })

  await run('flow', () => {
    const p = loadPage('pages/flow/index.js')
    p.onLoad()
    settle(p)
    assert.strictEqual(p.data.totalText, '+4,342.2')
    assert.strictEqual(p.data.labels.length, 20)
    p.onRangeChange({ detail: { value: '5' } })
    settle(p)
    assert.strictEqual(p.data.totalText, '+1,660.9')
    assert.strictEqual(p.data.rankRows.length, 5)
    p.onRankChange({ detail: { value: 'out' } })
    assert.strictEqual(p.data.rankTab, 'out')
    p.openPicker()
    assert.strictEqual(p.data.showPicker, true)
    p.onSearch({ detail: { value: '510300' } })
    assert.strictEqual(p.data.pickerList.length, 1)
  })

  await run('etf', () => {
    const p = loadPage('pages/etf/index.js')
    p.onLoad({ code: '510300' })
    settle(p)
    assert.strictEqual(p.data.code, '510300')
    assert.strictEqual(p.data.sharesText, '466.40')
    assert.strictEqual(p.data.labels.length, 20)
    p.onRangeChange({ detail: { value: '60' } })
    assert.strictEqual(p.data.labels.length, 60)
    p.pickEtf({ currentTarget: { dataset: { code: '588000' } } })
    if (p._chartTimer) clearTimeout(p._chartTimer)
    settle(p)
    assert.strictEqual(p.data.code, '588000')
    assert.strictEqual(p.data.labels.length, 60)
  })

  await run('snapshot', () => {
    const p = loadPage('pages/snapshot/index.js')
    p.onLoad()
    assert.strictEqual(p.data.count, 16)
    p.onSearch({ detail: { value: '510300' } })
    assert.strictEqual(p.data.count, 1)
    p.clearSearch()
    assert.strictEqual(p.data.count, 16)
    p.setFilter({ currentTarget: { dataset: { value: 'sh' } } })
    assert.strictEqual(p.data.count, 11)
    p.setFilter({ currentTarget: { dataset: { value: 'all' } } })
    p.toggleSort({ currentTarget: { dataset: { key: 'latestShares' } } })
    assert.strictEqual(p.data.sortKey, 'latestShares')
    p.openSort()
    assert.strictEqual(p.data.showSort, true)
    p.pickSort({ currentTarget: { dataset: { key: 'latestFlow' } } })
    assert.strictEqual(p.data.sortKey, 'latestFlow')
    assert.strictEqual(p.data.showSort, false)
  })

  await run('futures', () => {
    const p = loadPage('pages/futures/index.js')
    p.onLoad()
    settle(p)
    assert.strictEqual(p.data.cards.length, 4)
    assert.strictEqual(p.data.series.length, 4)
    // 当日变动用 varvolume 汇总，不是两日持仓水平差
    assert.strictEqual(p.data.changeText, '+1,484')
    assert.strictEqual(p.data.cards[0].deltaText, '+641 手')
    p.toggleLegend({ currentTarget: { dataset: { key: 'IH' } } })
    assert.strictEqual(p.data.series.length, 3)
    ;['IH', 'IF', 'IC', 'IM'].forEach((k) => {
      if (p.data.hidden.indexOf(k) < 0) p.toggleLegend({ currentTarget: { dataset: { key: k } } })
    })
    assert.strictEqual(p.data.hasSeries, false)
  })

  await run('futures-detail', () => {
    const p = loadPage('pages/futures-detail/index.js')
    p.onLoad()
    settle(p)
    assert.strictEqual(p.data.groups.length, 4)
    assert.strictEqual(p.data.groups[0].rows.length, 3)
    assert.strictEqual(p.data.groups[1].rows.length, 4)
    assert.strictEqual(p.data.groups[3].rows.length, 4)
    assert.strictEqual(String(p.data.contractCount), '15')
    assert.strictEqual(p.data.changeText, '+1,484')
    p.toggleGroup({ currentTarget: { dataset: { index: 0 } } })
    assert.strictEqual(p.data.groups[0].open, false)
  })

  await run('qihuo', async () => {
    const p = loadPage('pages/qihuo/index.js')
    p.onLoad()
    await wait(560)
    settle(p)
    assert.strictEqual(p.data.loading, false)
    assert.strictEqual(p.data.payload, true)
    assert.strictEqual(p.data.current.side, '中信期货')
    assert.strictEqual(p.data.current.rows.length, 4)
    assert(p.data.current.total.netText)
    p.switchSide({ currentTarget: { dataset: { index: 1 } } })
    settle(p)
    assert.strictEqual(p.data.sideIdx, 1)
    p.openCalendar()
    assert.strictEqual(p.data.showCal, true)
    assert(p.data.calCells.length > 28)
    p.closeCalendar()
    assert.strictEqual(p.data.showCal, false)
    // 周六 -> 空态
    p.load('2026-10-31')
    await wait(560)
    assert.strictEqual(p.data.payload, false)
    assert(p.data.emptyText.indexOf('周六') >= 0)
    // 方案 C：内置龙虎榜只覆盖最近 5 个交易日，超出范围给出明确说明
    p.load('2026-10-30')
    await wait(560)
    assert.strictEqual(p.data.payload, false)
    assert(p.data.errorText.indexOf('龙虎榜') >= 0)
    assert(p.data.emptyText.indexOf('2026-11-02') >= 0)
  })

  await run('baseline', () => {
    const p = loadPage('pages/baseline/index.js')
    p.onLoad()
    settle(p)
    assert.strictEqual(p.data.heroValue, '15,400')
    assert.strictEqual(p.data.holders.length, 6)
    p.onModeChange({ detail: { value: 'share' } })
    settle(p)
    assert.strictEqual(p.data.heroValue, '3,872')
    assert.strictEqual(p.data.holders.length, 6)
  })

  await run('profile', () => {
    const p = loadPage('pages/profile/index.js')
    p.onLoad()
    assert.strictEqual(p.data.etfCount, 16)
    assert.strictEqual(p.data.dateCount, 147)
    p.openSources()
    assert.strictEqual(p.data.showSources, true)
    p.toggleNotify()
    assert.strictEqual(p.data.notif, true)
    p.toggleNotify()
    assert.strictEqual(p.data.notif, false)
  })

  if (!process.exitCode) console.log('\nALL SMOKE TESTS PASSED')
  else console.log('\nSOME SMOKE TESTS FAILED')
}

main()
