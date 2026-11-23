/**
 * 数值累加动画（大屏主数值用）。
 *
 * 用法：
 *   countUp(page, [
 *     { key: 'heroText', value: 16.6, digits: 1, sign: true },
 *     { key: 'stats[0].value', value: 1788.7, digits: 1, sign: true }
 *   ], { duration: 620, interval: 24 })
 *
 * - 每帧只 setData 需要变化的文本字段，不重绘整页；
 * - 默认从 0 累加到目标值，easeOutQuart；
 * - 支持 `format` 自定义（例如百分比、带“手”后缀）；
 * - 新动画会自动取消同一页面上一段动画。
 */
const F = require('./format')

const DEFAULT_DURATION = 620
const DEFAULT_INTERVAL = 24

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4)
}

function valueText(spec, value) {
  if (typeof spec.format === 'function') return spec.format(value)
  return F.fmt(value, spec.digits === undefined ? 1 : spec.digits, spec.sign)
}

function countUp(page, specs, options) {
  if (!page || !specs || !specs.length) return
  stop(page, false)

  const duration = options && options.duration ? options.duration : DEFAULT_DURATION
  const interval = options && options.interval ? options.interval : DEFAULT_INTERVAL
  const startedAt = Date.now()
  const froms = specs.map((s) => (s.from === undefined ? 0 : s.from))

  function render(final) {
    const t = final ? 1 : Math.min(1, (Date.now() - startedAt) / duration)
    const eased = easeOutQuart(t)
    const patch = {}
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]
      const to = Number(spec.value)
      const from = froms[i]
      const v = final ? to : from + (to - from) * eased
      patch[spec.key] = valueText(spec, v)
    }
    page.setData(patch)
    return t >= 1
  }

  page._countSpecs = specs
  page._countRender = render

  function tick() {
    if (page._countStopped) return
    const done = render(false)
    if (done) {
      page._countTimer = null
      page._countRender = null
      return
    }
    page._countTimer = setTimeout(tick, interval)
  }

  page._countStopped = false
  tick()
}

function stop(page, finalize) {
  if (!page) return
  page._countStopped = true
  if (page._countTimer) {
    clearTimeout(page._countTimer)
    page._countTimer = null
  }
  if (finalize && typeof page._countRender === 'function') {
    page._countRender(true)
  }
  page._countRender = null
  page._countSpecs = null
}

module.exports = countUp
module.exports.stop = stop
