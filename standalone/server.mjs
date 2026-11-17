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

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PORT = Number(process.env.BILI_LESSON_PORT) || 7788

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
  } catch (error) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('找不到 ' + file.replace(ROOT, ''))
  }
}

const server = createServer((req, res) => {
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
})

const URL_ = 'http://127.0.0.1:' + PORT + '/'

/** 双击 start.bat 的人不会自己敲网址 —— 起来就替他打开。设 BILI_LESSON_NO_OPEN=1 可关闭。 */
function openBrowser() {
  if (process.env.BILI_LESSON_NO_OPEN === '1') return
  const [cmd, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', URL_]]
    : process.platform === 'darwin' ? ['open', [URL_]] : ['xdg-open', [URL_]]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch (error) {
    console.warn('没能自动打开浏览器，请手动访问 ' + URL_)
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log('  星火课堂 · 独立版已启动')
  console.log('  浏览器打开： ' + URL_)
  console.log('  数据目录：   ' + process.env.BILI_LESSON_HOME)
  console.log('  关闭这个窗口即退出')
  console.log('')
  openBrowser()
})

server.on('error', error => {
  if (error && error.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用：可能是星火课堂已经在运行，或换个 BILI_LESSON_PORT。')
  } else {
    console.error('启动失败：', error)
  }
  process.exit(1)
})
