/**
 * 独立版引导：把 DSH 宿主的两样东西补上。
 *
 * client.js 只要求两件事：__ModuleLoader__.load({ id, factory }) 里能拿到 react，
 * 以及 apply(ctx) 里的 ctx.slots.inject / register。这里用三十行替身接住它，
 * 然后把注册到 main 槽位的那个组件渲染成整页 —— client.js 本身一行不改。
 */
(function () {
  var registered = {}
  var modules = {
    react: window.React,
    'react-dom': window.ReactDOM,
  }

  window.__ModuleLoader__ = {
    load: function (spec) {
      window.__blModule = spec.factory(function (name) {
        if (!modules[name]) throw new Error('独立版没有提供模块：' + name)
        return modules[name]
      })
      return window.__blModule
    },
  }

  window.__blMount = function () {
    try {
      var mod = window.__blModule
      if (!mod) throw new Error('client.js 没有执行 load()')

      mod.apply({
        slots: {
          inject: function (name, fn) { fn() },
          register: function (spec, Component) {
            registered[spec.name] = Component
            return Component
          },
        },
      })

      var Main = registered.main
      if (!Main) throw new Error('没有组件注册到 main 槽位')

      window.ReactDOM.createRoot(document.getElementById('root')).render(
        window.React.createElement(Main)
      )
    } catch (error) {
      var box = document.getElementById('boot-error')
      box.style.display = 'block'
      box.textContent = '启动失败：' + (error && error.stack ? error.stack : error)
      console.error(error)
    }
  }
})()
