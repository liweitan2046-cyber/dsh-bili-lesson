/** 只跑一次：模拟 DSH 的 loader 与 ctx，确认两边都能加载（不是正式测试）。 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const here = new URL('.', import.meta.url).pathname.replace(/^\//, '')
const server = await import(pathToFileURL(join(here, 'index.js')).href)
const registered = []
const ctx = {
  get: name => (name === 'connection' ? { requestRejection: () => 0 } : undefined),
  webServer: { register: route => { registered.push(route); return { dispose() {} } } },
  effect: fn => fn(),
  logger: { warn: message => console.warn(message) },
}
server.apply(ctx)
console.log('server name=' + server.name + ' inject=' + JSON.stringify(server.inject) + ' routes=' + registered.map(r => r.kind + ':' + r.path).join(','))

const fakeReact = new Proxy({}, { get: (_, key) => {
  if (key === 'createElement') return (...args) => ({ type: args[0], props: args[1], children: args.slice(2) })
  if (key === '__esModule') return false
  return () => undefined
} })
let plugin = null
globalThis.window = { __ModuleLoader__: { load: config => { plugin = config.factory(name => (name === 'react' ? fakeReact : {})) } } }
const code = await readFile(join(here, 'client.js'), 'utf8')
new Function(code)()
const slots = []
plugin.apply({ slots: { inject: (name, fn) => fn(), register: (config, component) => { slots.push(config.name + ':' + (config.id || config.key) + ':' + typeof component); return {} } } })
console.log('client id-ok=' + Boolean(plugin.isPlugin) + ' inject=' + JSON.stringify(plugin.inject) + ' slots=' + slots.join(','))
