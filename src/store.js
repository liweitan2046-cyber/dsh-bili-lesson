/**
 * 本地 JSON 存储：~/.dsh/bili-lesson/ 下五个文件。
 * 写用临时文件 + rename，读失败一律当空，避免半截文件把面板带崩。
 * 同一文件用一条 Promise 链串行，防止连点保存互相覆盖。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = process.env.BILI_LESSON_HOME || join(homedir(), '.dsh', 'bili-lesson')

export const FILES = {
  videos: 'videos.json',
  plans: 'plans.json',
  watch: 'watch.json',
  lessons: 'lessons.json',
  settings: 'settings.json',
}

export const DEFAULT_SETTINGS = {
  perDay: 2,
  maxAge: 6,
  embedPlay: true,
}

const EMPTY = { videos: {}, plans: {}, watch: [], lessons: [], settings: DEFAULT_SETTINGS }

export class Store {
  constructor(dir = DATA_DIR) {
    this.dir = dir
    this.chains = new Map()
  }

  path(name) {
    return join(this.dir, FILES[name])
  }

  async ensure() {
    await mkdir(this.dir, { recursive: true })
  }

  async read(name) {
    await this.ensure()
    try {
      const raw = await readFile(this.path(name), 'utf8')
      const data = JSON.parse(raw)
      return data && typeof data === 'object' ? data : EMPTY[name]
    } catch {
      return EMPTY[name]
    }
  }

  async write(name, value) {
    await this.ensure()
    const file = this.path(name)
    const tmp = file + '.' + process.pid + '.tmp'
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await rename(tmp, file)
    return value
  }

  /** 读-改-写，串行执行。fn 返回新值或 undefined（表示不改）。 */
  update(name, fn) {
    const prev = this.chains.get(name) || Promise.resolve()
    const next = prev.then(async () => {
      const current = await this.read(name)
      const updated = await fn(current)
      if (updated === undefined) return current
      return this.write(name, updated)
    })
    this.chains.set(name, next.catch(() => {}))
    return next
  }
}
