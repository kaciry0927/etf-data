'use strict'

/**
 * 方案 C：本地生成静态快照，打包进小程序。
 *
 * 用法：
 *   node server/build.js                    # 抓取最近 147 个交易日 + 最近 5 天龙虎榜
 *   node server/build.js --days 60          # 只抓最近 60 个交易日
 *   node server/build.js --qihuo-days 10    # 内置最近 10 天龙虎榜
 *   node server/build.js --force            # 忽略缓存全量重抓
 *   node server/build.js --out path.js      # 指定内置快照输出路径
 *
 * 生成的 miniprogram/data/snapshot.js 会随小程序一起发布，
 * 运行时不需要服务器、不需要云开发；更新数据后重新上传版本即可。
 */

const fs = require('fs')
const path = require('path')
const { buildSnapshot, DEFAULT_HISTORY_DAYS } = require('./lib/builder')
const { fetchQihuo } = require('./lib/eastmoney')

const DEFAULT_QIHUO_DAYS = 5

function parseArgs(argv) {
  const args = {
    days: DEFAULT_HISTORY_DAYS,
    qihuoDays: DEFAULT_QIHUO_DAYS,
    force: false,
    out: path.resolve(__dirname, '..', 'miniprogram', 'data', 'snapshot.js')
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--days') args.days = Number(argv[++i])
    else if (key === '--qihuo-days') args.qihuoDays = Number(argv[++i])
    else if (key === '--force') args.force = true
    else if (key === '--out') args.out = path.resolve(process.cwd(), argv[++i])
    else if (key === '--no-out') args.out = null
  }
  return args
}

/**
 * 抓取最近 N 个交易日的龙虎榜，一起打进静态快照。
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
      else console.log('  龙虎榜 ' + date + '：暂无数据，跳过')
    } catch (e) {
      console.log('  龙虎榜 ' + date + '：抓取失败（' + e.message + '），跳过')
    }
  }

  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const started = Date.now()

  const snapshot = await buildSnapshot({
    days: args.days,
    force: args.force,
    log: (msg) => console.log(new Date().toISOString().slice(11, 19), msg)
  })

  if (args.out) {
    console.log('抓取龙虎榜（最近 ' + args.qihuoDays + ' 个交易日）…')
    const qihuo = await buildQihuo(snapshot, args.qihuoDays)

    const bundle = Object.assign({}, snapshot, { qihuo: qihuo })

    fs.mkdirSync(path.dirname(args.out), { recursive: true })
    const header =
      '/* 方案 C：由 server/build.js 于 ' + snapshot.meta.updated + ' 从交易所 / 中金所 / 东方财富公开接口生成。\n' +
      ' * 小程序运行时不需要服务器，静态数据随包发布；更新数据请重新运行本脚本并上传新版本。请勿手工编辑。\n' +
      ' */\n'
    fs.writeFileSync(args.out, header + 'module.exports = ' + JSON.stringify(bundle) + '\n')

    console.log(
      '内置快照已写入', args.out,
      '(' + (fs.statSync(args.out).size / 1024).toFixed(0) + ' KB, 龙虎榜 ' + Object.keys(qihuo).length + ' 天)'
    )
  }

  console.log('耗时', ((Date.now() - started) / 1000).toFixed(1) + 's')
  console.log(
    '当日净流入 ' + snapshot.totals.dayFlow.toFixed(1) + ' 亿元 · ' +
    '近 5 日 ' + snapshot.totals.flow5.toFixed(1) + ' 亿元 · ' +
    '组合规模 ' + snapshot.totals.scale.toFixed(0) + ' 亿元'
  )
}

main().catch((e) => {
  console.error('生成失败：', e && e.stack ? e.stack : e)
  process.exit(1)
})
