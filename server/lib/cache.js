'use strict'

/** 极简 JSON 文件缓存。首次全量抓取约 700 个请求，缓存后每日只需增量。 */

const fs = require('fs')
const path = require('path')

class Cache {
  constructor(dir) {
    this.dir = dir
    this.memory = {}
    fs.mkdirSync(dir, { recursive: true })
  }

  fileOf(name) {
    return path.join(this.dir, name + '.json')
  }

  load(name, fallback) {
    if (Object.prototype.hasOwnProperty.call(this.memory, name)) return this.memory[name]
    let value = fallback
    try {
      const file = this.fileOf(name)
      if (fs.existsSync(file)) {
        value = JSON.parse(fs.readFileSync(file, 'utf8'))
      }
    } catch (e) {
      value = fallback
    }
    this.memory[name] = value
    return value
  }

  save(name, value) {
    if (value !== undefined) this.memory[name] = value
    const payload = JSON.stringify(this.memory[name] === undefined ? value : this.memory[name])
    const file = this.fileOf(name)
    const temp = file + '.tmp'
    fs.writeFileSync(temp, payload)
    fs.renameSync(temp, file)
  }

  saveAll(names) {
    ;(names || Object.keys(this.memory)).forEach((name) => this.save(name))
  }
}

module.exports = { Cache }
