/**
 * 把本插件登记进 DSH 桌面 profile 的 package.json（幂等）。
 *   node install.mjs            安装
 *   node install.mjs --uninstall 撤销
 *   node install.mjs --file <path> 只改指定文件（自测用）
 */
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'dsh-bili-lesson'
const LEGACY = ['@local/dsh-bili-lesson']
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const uninstall = args.includes('--uninstall')
const fileArg = args.indexOf('--file')
const target = fileArg >= 0 ? resolve(args[fileArg + 1]) : join(homedir(), '.dsh', 'profiles', 'desktop', 'package.json')
const link = 'link:' + here.replace(/\\/g, '/')

const pkg = JSON.parse(await readFile(target, 'utf8'))
pkg.dependencies = pkg.dependencies || {}
pkg.dsh = pkg.dsh || {}
pkg.dsh.profile = pkg.dsh.profile || {}
let bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []

if (uninstall) {
  delete pkg.dependencies[NAME]
  for (const old of LEGACY) delete pkg.dependencies[old]
  pkg.dsh.profile.bundles = bundles.filter(name => name !== NAME && !LEGACY.includes(name))
  await writeFile(target, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log('已从 ' + target + ' 移除 ' + NAME)
  process.exit(0)
}

for (const old of LEGACY) {
  delete pkg.dependencies[old]
  bundles = bundles.filter(name => name !== old)
}
pkg.dependencies[NAME] = link
if (!bundles.includes(NAME)) {
  const anchor = bundles.indexOf('dsh-wanfeng-studio')
  if (anchor >= 0) bundles.splice(anchor + 1, 0, NAME)
  else bundles.push(NAME)
}
pkg.dsh.profile.bundles = bundles

await copyFile(target, target + '.bak-bili-lesson')
await writeFile(target, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log('已登记 ' + NAME + ' → ' + link)
console.log('备份：' + target + '.bak-bili-lesson')
