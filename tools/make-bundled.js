'use strict'

/**
 * 把线上数据同步进小程序包内的兜底快照。
 *
 * 作用：dist/snapshot.json 是线上数据，miniprogram/data/snapshot.js 是断网 / Pages 不可用时的兜底。
 * 发布新版本前跑一次，能保证「线上挂了也不至于看到太旧的数据」。
 *
 * 用法：
 *   node tools/make-bundled.js                 # 读取 dist/snapshot.json
 *   node tools/make-bundled.js --from dist/snapshot.json
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_SRC = path.join(ROOT, 'dist', 'snapshot.json')
const OUT = path.join(ROOT, 'miniprogram', 'data', 'snapshot.js')

function parseArgs(argv) {
  const args = { from: DEFAULT_SRC }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = path.resolve(process.cwd(), argv[++i])
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const payload = JSON.parse(fs.readFileSync(args.from, 'utf8'))
  const bundle = payload && payload.data ? payload.data : payload

  if (!bundle || !bundle.etfs || !bundle.etfs.length || !bundle.dates || !bundle.dates.length) {
    throw new Error('输入文件不是有效快照：' + args.from)
  }

  const header =
    '/* 方案 C 兜底快照：由 tools/make-bundled.js 于 ' + (bundle.meta.updated || '') +
    ' 从线上数据同步生成。\n' +
    ' * 线上数据见 ' + path.basename(args.from) + '；本文件只在小程序拉不到线上数据时使用。请勿手工编辑。\n' +
    ' */\n'

  fs.writeFileSync(OUT, header + 'module.exports = ' + JSON.stringify(bundle) + '\n')

  console.log(
    '已写入', OUT,
    '(' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB, ' +
    'ETF ' + bundle.meta.etfDate + ' · 期货 ' + bundle.futures.latestDate + ' · ' +
    '龙虎榜 ' + Object.keys(bundle.qihuo || {}).length + ' 天)'
  )
}

main()
