'use strict'

/**
 * CI 构建入口：生成 GitHub Pages 上托管的静态数据。
 *
 * 与 server/build.js 的区别：
 *   - 输出 dist/snapshot.json，内容是 { ok: true, builtAt, data: <快照> }
 *     （小程序 services/data.js 的 http 分支就认这个结构，不用改数据层）
 *   - 幂等：数据指纹没变就不写文件，避免每天产生无意义的 diff
 *   - 把 changed / etfDate / futuresDate 写进 GITHUB_OUTPUT，供 workflow 判断
 *
 * 用法：
 *   node tools/ci-build.js                     # 抓取并生成 dist/snapshot.json
 *   node tools/ci-build.js --out dist          # 指定输出目录
 *   node tools/ci-build.js --days 147          # 历史交易日数量
 *   node tools/ci-build.js --qihuo-days 5      # 内置最近 N 天龙虎榜
 *   node tools/ci-build.js --force             # 忽略缓存全量重抓
 *   node tools/ci-build.js --offline           # 不发请求，用 server/.cache 里已有的快照渲染（本地预览用）
 */

const fs = require('fs')
const path = require('path')

const { buildSnapshot, DEFAULT_HISTORY_DAYS } = require('../server/lib/builder')
const { fetchQihuo } = require('../server/lib/eastmoney')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_QIHUO_DAYS = 5

function log(msg) {
  console.log(new Date().toISOString().slice(11, 19), msg)
}

function parseArgs(argv) {
  const args = {
    days: DEFAULT_HISTORY_DAYS,
    qihuoDays: DEFAULT_QIHUO_DAYS,
    out: 'dist',
    force: false,
    offline: false
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--days') args.days = Number(argv[++i])
    else if (key === '--qihuo-days') args.qihuoDays = Number(argv[++i])
    else if (key === '--out') args.out = argv[++i]
    else if (key === '--force') args.force = true
    else if (key === '--offline') args.offline = true
  }
  return args
}

/**
 * 抓取最近 N 个交易日的龙虎榜，一起写进快照。
 * 非交易日 / 尚未发布返回 null，直接跳过。
 */
async function buildQihuo(snapshot, days) {
  const count = Math.max(0, Number(days) || 0)
  if (!count) return {}

  const dates = snapshot.futures.dates.slice(-count)
  const result = {}

  for (const date of dates) {
    try {
      const payload = await fetchQihuo(date)
      if (payload) result[date] = payload
      else log('  龙虎榜 ' + date + '：暂无数据，跳过')
    } catch (e) {
      log('  龙虎榜 ' + date + '：抓取失败（' + e.message + '），跳过')
    }
  }

  return result
}

/**
 * 数据指纹：只关心“用户能看到的内容”是否变化。
 * 抓取时间、耗时之类的字段变了不算变化，避免每天白提交。
 */
function fingerprint(data) {
  if (!data) return ''
  const futures = data.futures || {}
  const totals = data.totals || {}
  const qihuoKeys = Object.keys(data.qihuo || {}).sort()

  return [
    data.meta && data.meta.etfDate,
    futures.latestDate,
    totals.dayFlow,
    totals.flow5,
    totals.scale,
    (data.dates || []).length,
    (data.etfs || []).length,
    qihuoKeys[qihuoKeys.length - 1] || ''
  ].join('|')
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return null
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, value)
  fs.renameSync(tmp, file)
}

/** 写 GitHub Actions 的 step output；本地运行时静默跳过。 */
function setOutput(pairs) {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  const lines = Object.keys(pairs).map((k) => k + '=' + String(pairs[k]))
  fs.appendFileSync(file, lines.join('\n') + '\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = path.resolve(ROOT, args.out)
  const outFile = path.join(outDir, 'snapshot.json')
  const started = Date.now()

  let bundle
  if (args.offline) {
    const cached = path.resolve(ROOT, 'server', '.cache', 'snapshot.json')
    log('离线模式：读取 ' + cached)
    bundle = JSON.parse(fs.readFileSync(cached, 'utf8'))
    if (!bundle.qihuo) bundle.qihuo = {}
  } else {
    const snapshot = await buildSnapshot({
      days: args.days,
      force: args.force,
      log: log
    })
    log('抓取龙虎榜（最近 ' + args.qihuoDays + ' 个交易日）…')
    const qihuo = await buildQihuo(snapshot, args.qihuoDays)
    bundle = Object.assign({}, snapshot, { qihuo: qihuo })
  }

  const prev = readJson(outFile)
  const prevData = prev && prev.data ? prev.data : null
  const changed = !prevData || fingerprint(prevData) !== fingerprint(bundle)

  if (changed) {
    const payload = {
      ok: true,
      builtAt: new Date().toISOString(),
      data: bundle
    }
    writeJsonAtomic(outFile, JSON.stringify(payload))
    const kb = (fs.statSync(outFile).size / 1024).toFixed(0)
    log('已写入 ' + outFile + '（' + kb + ' KB）')
  } else {
    log('数据无变化，跳过写入（' + outFile + ' 保持原样）')
  }

  const etfDate = (bundle.meta && bundle.meta.etfDate) || ''
  const futuresDate = (bundle.futures && bundle.futures.latestDate) || ''
  const qihuoDates = Object.keys(bundle.qihuo || {}).sort()

  setOutput({
    changed: changed ? 'true' : 'false',
    etfDate: etfDate,
    futuresDate: futuresDate,
    qihuoDays: qihuoDates.length,
    seconds: ((Date.now() - started) / 1000).toFixed(1)
  })

  log(
    '完成：ETF ' + etfDate + ' · 期货 ' + futuresDate +
    ' · 龙虎榜 ' + qihuoDates.length + ' 天' +
    ' · 变化 ' + (changed ? '是' : '否') +
    ' · 耗时 ' + ((Date.now() - started) / 1000).toFixed(1) + 's'
  )
}

main().catch((e) => {
  console.error('构建失败：', e && e.stack ? e.stack : e)
  process.exit(1)
})
