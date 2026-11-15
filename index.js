/**
 * 星火课堂 · Host 半边
 *
 * 只做两件事：
 *  1. 提供 /bili-lesson 下的 HTTP 接口（片库、一周计划、观看记录、课卡、导出、设置）；
 *  2. 把数据目录准备好。
 * 页面渲染全部在 client.js。
 */
import { Store } from './src/store.js'
import { PREFIX, Routes } from './src/routes.js'

export const name = 'dsh-bili-lesson'

export const inject = ['webServer', 'connection']

export function apply(ctx) {
  const store = new Store()
  const routes = new Routes(ctx, store)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => routes.handle(req, res),
  }), 'dsh-bili-lesson: /bili-lesson routes')

  store.ensure().catch(error => {
    ctx.logger?.warn?.('[bili-lesson] 数据目录不可写：' + (error && error.message ? error.message : error))
  })
}
