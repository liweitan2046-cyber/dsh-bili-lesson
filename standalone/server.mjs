/**
 * 星火课堂 · 独立版服务端
 *
 * 把插件原本依赖 DSH 宿主的两件事自己接上：
 *   1. HTTP —— 用 node:http 直接挂 src/routes.js 的同一个 Routes；
 *   2. 静态资源 —— 首页、React 运行时、client.js。
 * 业务代码一行没改：routes.js 唯一的宿主依赖是 ctx.get('connection') 的登录校验。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emptyPlan, mondayOf, normalizePlan } from '../src/plan.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE_PORT = Number(process.env.BILI_LESSON_PORT) || 7788
const FIXED_PORT = Boolean(process.env.BILI_LESSON_PORT)

// 数据默认落在应用目录旁边，不去碰 ~/.dsh —— 园所的机器上不该出现别人的家目录约定。
if (!process.env.BILI_LESSON_HOME) process.env.BILI_LESSON_HOME = join(HERE, 'data')

const { Store } = await import('../src/store.js')
const { PREFIX, Routes } = await import('../src/routes.js')

/** 本地单机：只监听 127.0.0.1，不做登录；requestRejection 返回 0 表示放行。 */
const ctx = {
  get(name) {
    if (name === 'connection') return { requestRejection: () => 0 }
    return undefined
  },
  logger: { warn: (...args) => console.warn('[bili-lesson]', ...args) },
}

const store = new Store()
const routes = new Routes(ctx, store)
await store.ensure()

const SEED_FILE = join(HERE, 'seed', 'demo-library.json')

/**
 * 空数据目录第一次启动时铺上演示片库 —— 双击打开就是满的，不是四个 0。
 * 只在片库为空时触发；BILI_LESSON_SEED=force 可强制重铺（覆盖片库与课卡，不动记录和奖励）。
 */
async function seedLibrary() {
  const force = process.env.BILI_LESSON_SEED === 'force'
  const current = await store.read('videos')
  if (!force && current && Object.keys(current).length) return

  let pack
  try {
    pack = JSON.parse(await readFile(SEED_FILE, 'utf8'))
  } catch {
    return // 没有 seed 就照常空着起，不影响使用
  }

  const perDay = Math.max(1, Math.min(6, Number(pack.perDay) || 1))
  await store.write('videos', pack.videos)
  await store.write('lessons', pack.lessons)
  const settings = await store.read('settings')
  await store.write('settings', { ...settings, perDay })

  // 四周主题各排一周：本周起连续四个周一，每天一条，播完正好一个月。
  const week0 = mondayOf(new Date().toISOString().slice(0, 10))
  await store.update('plans', plans => {
    const next = { ...(plans || {}) }
    pack.themes.forEach((theme, index) => {
      const at = new Date(new Date(week0 + 'T00:00:00Z').getTime() + index * 7 * 86400000)
      const weekStart = at.toISOString().slice(0, 10)
      const plan = emptyPlan(weekStart, perDay)
      const ids = (theme.videoIds || []).filter(id => pack.videos[id])
      plan.days.forEach((day, i) => {
        if (ids[i]) day.videoIds.push(ids[i])
      })
      next[weekStart] = normalizePlan(plan, perDay)
    })
    return next
  })

  console.log('')
  console.log('  已载入演示片库：' + Object.keys(pack.videos).length + ' 条片子，'
    + Object.keys(pack.lessons).length + ' 套课卡，' + pack.themes.length + ' 周已排（从 ' + week0 + ' 起）')
  pack.themes.forEach(theme => console.log('    · ' + theme.name))
}

await seedLibrary()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const STATIC = {
  '/': join(HERE, 'index.html'),
  '/app.js': join(ROOT, 'client.js'),
  '/boot.js': join(HERE, 'boot.js'),
  '/icon.svg': join(ROOT, 'icon.svg'),
  '/vendor/react.js': join(HERE, 'vendor', 'react.js'),
  '/vendor/react-dom.js': join(HERE, 'vendor', 'react-dom.js'),
}

async function sendFile(res, file) {
  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('找不到 ' + file.replace(ROOT, ''))
  }
}

function handler(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  // 只按 STATIC 白名单取文件，不用 path.normalize —— 它在 Windows 上会把 / 变成 \，白名单全落空。
  const path = url.pathname

  if (path === PREFIX || path.startsWith(PREFIX + '/')) {
    routes.handle(req, res)
    return
  }
  const file = STATIC[path]
  if (file) {
    sendFile(res, file)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('没有这个路径：' + path)
}

const urlOf = port => 'http://127.0.0.1:' + port + '/'

/** 双击 start.bat 的人不会自己敲网址 —— 起来就替他打开。设 BILI_LESSON_NO_OPEN=1 可关闭。 */
function openBrowser(port) {
  if (process.env.BILI_LESSON_NO_OPEN === '1') return
  const target = urlOf(port)
  const [cmd, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', target]]
    : process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    console.warn('没能自动打开浏览器，请手动访问 ' + target)
  }
}

/** 端口被占时先问一句：占着的是不是我们自己。是就别报错，直接把页面打开。 */
async function mineOn(port) {
  try {
    const res = await fetch(urlOf(port) + 'bili-lesson/settings', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data) && typeof data === 'object' && 'perDay' in data
  } catch {
    return false
  }
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function report(port) {
  console.log('')
  console.log('  星火课堂 · 独立版已启动')
  console.log('  浏览器打开： ' + urlOf(port))
  console.log('  数据目录：   ' + process.env.BILI_LESSON_HOME)
  console.log('  关闭这个窗口即退出')
  console.log('')
}

let started = false
for (let i = 0; i < 10 && !started; i++) {
  const port = BASE_PORT + i
  try {
    await listen(port)
    started = true
    report(port)
    openBrowser(port)
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') {
      console.error('启动失败：', error)
      process.exit(1)
    }
    if (await mineOn(port)) {
      console.log('')
      console.log('  星火课堂已经在运行： ' + urlOf(port))
      console.log('  已经帮你打开浏览器，这个窗口可以关掉。')
      console.log('')
      openBrowser(port)
      process.exit(0)
    }
    if (FIXED_PORT) {
      console.error('端口 ' + port + ' 被别的程序占用了，换一个：set BILI_LESSON_PORT=7801')
      process.exit(1)
    }
  }
}

if (!started) {
  console.error('7788 起的十个端口都被占用，换一个：set BILI_LESSON_PORT=7801')
  process.exit(1)
}
