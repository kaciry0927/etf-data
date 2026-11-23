/**
 * Canvas chart smoke test with a recording 2D context.
 * Catches runtime errors, NaN coordinates and empty render paths.
 *
 * Run: node tools/chart_test.js
 */
const path = require('path')
const assert = require('assert')

const MP = path.resolve(__dirname, '..', 'miniprogram')
// 使用与小程序一致的真实内置快照（由 server/build.js 生成）
const demo = require(path.join(MP, 'data', 'snapshot.js'))

let def = null
global.Component = (d) => { def = d }
global.wx = {
  getWindowInfo: () => ({ pixelRatio: 2 }),
  getSystemInfoSync: () => ({ pixelRatio: 2 })
}
require(path.join(MP, 'components', 'chart', 'index.js'))
assert(def, 'chart Component not registered')

const calls = []
function record(name) {
  return (...args) => {
    args.forEach((v) => {
      if (typeof v === 'number' && (!isFinite(v))) {
        throw new Error('non-finite coordinate in ' + name + ': ' + v)
      }
    })
    calls.push([name, args])
  }
}

const ctx = {
  canvas: null,
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  font: '',
  textAlign: '',
  textBaseline: '',
  shadowColor: '',
  shadowBlur: 0
}
;['clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'fillRect', 'arc',
  'save', 'restore', 'setLineDash', 'quadraticCurveTo', 'closePath', 'fillText',
  'scale', 'setTransform', 'rect', 'clip'].forEach((name) => { ctx[name] = record(name) })

function makeInstance(overrides) {
  const data = {}
  Object.keys(def.properties).forEach((k) => { data[k] = def.properties[k].value })
  Object.assign(data, overrides)
  const inst = Object.assign({}, def, def.methods)
  inst.data = data
  inst._ready = true
  inst._w = 340
  inst._h = data.height
  inst._ctx = ctx
  inst._active = -1
  return inst
}

function reset() {
  calls.length = 0
}

function checkNonEmpty(label) {
  assert(calls.length > 20, label + ': draw produced too few calls (' + calls.length + ')')
  assert(calls.some((c) => c[0] === 'fillText'), label + ': no text drawn')
}

// dual chart
{
  reset()
  const labels = demo.dates.slice(-20)
  const bars = demo.totalFlowByDay.slice(-20)
  let acc = 0
  const line = bars.map((v) => (acc += v))
  const inst = makeInstance({ type: 'dual', labels, bars, line, height: 216 })
  inst.draw()
  checkNonEmpty('dual')
  inst.draw(0)
  inst.draw(0.35)
  inst.draw(0.8)
  console.log('PASS dual chart, calls =', calls.length)
}

// line chart with 4 series
{
  reset()
  const labels = demo.futures.dates.slice(-20)
  const series = demo.products.map((p) => ({
    key: p,
    name: p,
    color: demo.productColors[p],
    values: demo.futures.series[p].slice(-20)
  }))
  const inst = makeInstance({ type: 'line', labels, series, height: 206, digits: 0 })
  inst.draw()
  checkNonEmpty('line')
  console.log('PASS line chart, calls =', calls.length)
}

// line chart with area
{
  reset()
  const etf = demo.etfs[0]
  const inst = makeInstance({
    type: 'line',
    labels: demo.dates.slice(-20),
    series: [{ key: 'shares', name: '份额', color: '#2f6fdd', values: etf.shares.slice(-20) }],
    height: 168,
    digits: 2,
    area: true
  })
  inst.draw()
  checkNonEmpty('line-area')
  console.log('PASS area chart, calls =', calls.length)
}

// empty
{
  reset()
  const inst = makeInstance({ type: 'dual', labels: [], bars: [], line: [], height: 200 })
  inst.draw()
  assert(calls.some((c) => c[0] === 'fillText' && String(c[1][0]).indexOf('暂无') >= 0), 'empty text missing')
  console.log('PASS empty chart')
}

// touch interaction
{
  reset()
  const labels = demo.dates.slice(-20)
  const bars = demo.totalFlowByDay.slice(-20)
  let acc = 0
  const line = bars.map((v) => (acc += v))
  const inst = makeInstance({ type: 'dual', labels, bars, line, height: 216 })
  inst.draw()
  const before = inst._active
  inst.updateActive({ touches: [{ x: 170, y: 80 }] })
  assert(inst._active >= 0 && inst._active < labels.length, 'active index invalid')
  assert(inst._active !== before || before === labels.length - 1, 'active index did not update')
  console.log('PASS touch interaction, active =', inst._active)
}

console.log('\nALL CHART TESTS PASSED')
