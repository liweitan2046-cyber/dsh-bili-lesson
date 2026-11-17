import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, '..')
const OUT = join(ROOT, 'dist', 'portable', 'xinghuo-lesson-portable-win-x64')

const DIRECTORIES = ['standalone', 'src', 'assets']
const FILES = ['package.json', 'index.js', 'icon.svg', 'LICENSE', 'README.md', 'client.js']

console.log('构建便携绿色包：' + OUT)

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

for (const dir of DIRECTORIES) {
  cpSync(join(ROOT, dir), join(OUT, dir), { recursive: true, filter: source => {
    const rel = source.split(/[\\/]/)
    return !(rel.includes('standalone') && rel.includes('data'))
  } })
  // 删除可能一并复制进来的 data 目录（独立数据，不属于绿色包）。
  const data = join(OUT, dir, 'data')
  if (existsSync(data)) rmSync(data, { recursive: true, force: true })
}

for (const file of FILES) {
  const source = join(ROOT, file)
  if (!existsSync(source) || !statSync(source).isFile()) {
    console.error('缺少打包源文件：' + source)
    process.exit(1)
  }
  copyFileSync(source, join(OUT, file))
}

const nodeSource = process.execPath
if (basename(nodeSource).toLowerCase() !== 'node.exe' || !existsSync(nodeSource)) {
  console.error('当前 Node 可执行文件不是 node.exe，或文件不存在：' + nodeSource)
  console.error('请把本机 Node.js 的 node.exe 放到 PATH 后用 node 重新运行本脚本（禁止联网下载）。')
  process.exit(1)
}
copyFileSync(nodeSource, join(OUT, 'node.exe'))
console.log('  已复制 node.exe：' + nodeSource)

const bat = '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0node.exe" standalone\\server.mjs\r\npause\r\n'
writeFileSync(join(OUT, 'start-portable.bat'), bat, { encoding: 'utf8' })

const readme = [
  '星火课堂 · 便携绿色包（Windows x64）',
  '====================================',
  '',
  '离线启动：',
  '  双击 start-portable.bat；浏览器会自动打开 http://127.0.0.1:7788/。',
  '  包内已带 node.exe 与 standalone 服务端，不需要安装 Node.js，也不需要联网安装依赖。',
  '  关闭黑色命令行窗口即退出。',
  '',
  '端口与数据目录（在命令行窗口用 set 设置后再双击启动，或直接在 cmd 里运行 node.exe）：',
  '  set BILI_LESSON_PORT=7801        端口被占用时换一个（默认 7788）',
  '  set BILI_LESSON_HOME=D:\\lesson-data   数据目录（默认包内 standalone/data）',
  '  例：cmd /c "set BILI_LESSON_HOME=D:\\lesson-data&& start-portable.bat"',
  '  不设 BILI_LESSON_HOME 时数据写在包内 standalone/data，删除该目录再启动会重铺演示片库。',
  '',
  '家长锁说明：',
  '  家长锁只是界面门禁（软锁），不是加密：懂技术的人可以直接改数据目录里的 JSON。',
  '  请不要把需要保密的内容放进本应用；数据请自行备份。',
  '',
].join('\r\n')
writeFileSync(join(OUT, 'README-PORTABLE.txt'), readme, { encoding: 'utf8' })

const required = ['node.exe', 'start-portable.bat', 'README-PORTABLE.txt', 'standalone/server.mjs', 'src/store.js', 'client.js', 'assets/art/island-hero.webp']
for (const file of required) {
  const target = join(OUT, file)
  if (!existsSync(target)) {
    console.error('产物缺少关键文件：' + file)
    process.exit(1)
  }
}

console.log('完成。启动：双击 ' + join(OUT, 'start-portable.bat'))
