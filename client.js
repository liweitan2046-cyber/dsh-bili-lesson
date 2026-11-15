/**
 * 星火课堂 · 浏览器半边
 *
 * 侧栏加一个「星火课堂」入口，主区域是原生 React 面板（不是 iframe）：
 *   片库 / 本周 / 记录 / 课卡 / 设置
 * 业务数据全部落在服务端 /bili-lesson 接口，前端不写 localStorage。
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-bili-lesson',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    const PANEL = 'bili-lesson'
    const API = '/bili-lesson'
    const LABEL = '星火课堂'
    const TABS = [
      { id: 'library', label: '舰桥首页' },
      { id: 'plan', label: '本周航线' },
      { id: 'learn', label: '训练舱' },
      { id: 'watch', label: '航行记录' },
      { id: 'rewards', label: '成就展厅' },
      { id: 'lessons', label: '课卡工坊' },
      { id: 'vault', label: '片库仓库' },
      { id: 'settings', label: '舰桥设置' },
    ]
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const DIFFICULTY = { 1: '简单', 2: '适中', 3: '进阶' }
    const RARITY = { common: '常见', rare: '稀有', epic: '珍稀' }
    const DEFAULT_SETTINGS = { perDay: 2, maxAge: 6, embedPlay: false, weeklyBoxLimit: 0 }

    const XP_STEP = 200

    const CAT_ICON = {
      儿歌: '♪', 绘本: '❞', 数学: '∑', 英语: 'A', 科学启蒙: '⚛', 认知: '◈',
      识字: '字', 安全: '⚠', 美术: '◐', 律动: '≈',
    }

    const TAB_TITLE = {
      library: '舰桥首页', plan: '本周航线', watch: '航行记录', learn: '训练舱',
      rewards: '成就展厅', lessons: '课卡工坊', settings: '舰桥设置',
    }

    const RAIL_ICONS = {
      library: ['M4 4.6h6.2v6.2H4z', 'M13.8 4.6H20v6.2h-6.2z', 'M4 13.8h6.2V20H4z', 'M13.8 13.8H20V20h-6.2z'],
      plan: ['M4 6.5h9.5', 'M4 12h6', 'M4 17.5h6.5', 'M15 9.5l4.2 4.2-4.2 4.2'],
      watch: ['M12 7.4V12l3 1.9', 'M12 3.6a8.4 8.4 0 100 16.8 8.4 8.4 0 000-16.8z'],
      learn: ['M9 7.6l7.4 4.4L9 16.4z', 'M4 4.8h16v14.4H4z'],
      rewards: ['M12 3.4l7 7-7 10.2-7-10.2z', 'M5 10.4h14'],
      lessons: ['M4.6 5.2h14.8v13.6H4.6z', 'M8 9h8', 'M8 12.8h5.4'],
      settings: ['M4 7.6h6', 'M14 7.6h6', 'M4 16.4h9', 'M17 16.4h3', 'M11.2 5.2v4.8', 'M14.2 14v4.8'],
    }

    function RailIcon(props) {
      const paths = RAIL_ICONS[props.name] || RAIL_ICONS.library
      const size = props.size || 18
      return h('svg', {
        key: props.key,
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, paths.map((d, i) => h('path', { key: 'p' + i, d })))
    }


    /* 线性图标库：24x24 网格，描边跟随 currentColor */
    const GLYPHS = {
      question: ['M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2z', 'M9.4 9.2a2.7 2.7 0 115.2 1c0 1.6-2.6 2-2.6 3.4', 'M12 17h.01'],
      gift: ['M4 9.4h16v3.2H4z', 'M5.4 12.6h13.2V21H5.4z', 'M12 9.4V21', 'M12 9.4c-3.6 0-5.2-1.4-5.2-3.2S8.4 3.6 12 9.4z', 'M12 9.4c3.6 0 5.2-1.4 5.2-3.2S15.6 3.6 12 9.4z'],
      music: ['M9.4 17.6V6.2l9-1.8v11.2', 'M9.4 17.6a2.4 2.4 0 11-4.8 0 2.4 2.4 0 014.8 0z', 'M18.4 15.6a2.4 2.4 0 11-4.8 0 2.4 2.4 0 014.8 0z'],
      book: ['M5 4.6A1.6 1.6 0 016.6 3H19v18H6.6A1.6 1.6 0 005 22.6z', 'M5 17.4h14'],
      calculator: ['M6 3.5h12v17H6z', 'M6 8.5h12', 'M9.2 12h.01', 'M12 12h.01', 'M14.8 12h.01', 'M9.2 16h.01', 'M12 16h.01', 'M14.8 16h.01'],
      lang: ['M5 19.5L12 4l7 15.5', 'M8 14h8'],
      flask: ['M10 3.2v6l-4.7 9.4A2.2 2.2 0 007.3 22h9.4a2.2 2.2 0 002-2.4L14 9.2v-6', 'M8.6 3.2h6.8', 'M7.4 15.4h9.2'],
      brain: ['M9.6 4.2a3 3 0 00-3 3 3.2 3.2 0 00-1.4 5.6 3 3 0 002.9 5.6 3 3 0 004.5 1.2V4.2z', 'M14.4 4.2a3 3 0 013 3 3.2 3.2 0 011.4 5.6 3 3 0 01-2.9 5.6 3 3 0 01-4.5 1.2V4.2z'],
      pencil: ['M12 20h8', 'M16.2 3.8a2.2 2.2 0 013.1 3.1L7.6 18.6 3.5 20l1.4-4.1z'],
      shield: ['M12 21.6s8-3.8 8-9.6V5.4L12 2.6 4 5.4v6.6c0 5.8 8 9.6 8 9.6z'],
      palette: ['M12 3.2a8.8 8.8 0 100 17.6h1.4a2 2 0 000-4h-1a2 2 0 010-4h4a4 4 0 000-8z', 'M8.4 8.4h.01', 'M7.6 13h.01', 'M11.4 6.8h.01'],
      pulse: ['M2.4 12h4.2l2.6-7 4.4 14 2.6-7h5.4'],
      rocket: ['M12 3c3 3 4.4 6.4 4.4 9.8L12 16.4l-4.4-3.6C7.6 9.4 9 6 12 3z', 'M9.6 13.6L7.4 19l3.8-1.7', 'M14.4 13.6l2.2 5.4-3.8-1.7', 'M12 9.4h.01'],
      star: ['M12 3.2l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.4l5.9-.8z'],
      apple: ['M12 8.2c-2.9-2-5.8-.2-5.8 3.8 0 3.9 3.8 8.6 5.8 8.6s5.8-4.7 5.8-8.6c0-4-2.9-5.8-5.8-3.8z', 'M12 8.2c0-2.2.9-4 3-4.6'],
      balloon: ['M12 3.2a4.6 5.4 0 110 10.8 4.6 5.4 0 010-10.8z', 'M12 14v5.6'],
      panda: ['M12 5.4a6.6 6.6 0 100 13.2 6.6 6.6 0 000-13.2z', 'M7.2 4.2a2.2 2.2 0 012.6 1.8', 'M16.8 4.2a2.2 2.2 0 00-2.6 1.8', 'M9.6 11h.01', 'M14.4 11h.01', 'M10.2 14.4c1.1.9 2.5.9 3.6 0'],
      rainbow: ['M4 18.5a8 8 0 0116 0', 'M7.4 18.5a4.6 4.6 0 019.2 0'],
      dino: ['M4.5 20c0-6.4 3.2-11.6 8.4-11.6l3.8-2.8 1.1 3.7 2.7 1.1-2.7 1.9v3.3c0 2.6-1.7 4.4-4.2 4.4z', 'M9.4 20v-3.6', 'M13.6 20v-3.6'],
      gem: ['M12 3.2L20 9l-8 11.8L4 9z', 'M4 9h16', 'M12 3.2L9 9l3 11.8L15 9z'],
      puzzle: ['M4.4 4.4h15.2v15.2H4.4z', 'M9.8 4.4v3.4a2.2 2.2 0 004.4 0V4.4', 'M4.4 14.2h3.4a2.2 2.2 0 010 4.4H4.4'],
      teddy: ['M12 5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z', 'M6.6 6.4a2 2 0 102.6-2.4', 'M17.4 6.4a2 2 0 10-2.6-2.4', 'M9.6 10.6h.01', 'M14.4 10.6h.01', 'M10 14c1.2 1 2.8 1 4 0'],
      bowl: ['M3.5 12h17a8.5 8.5 0 01-17 0z', 'M7.6 12V9.4', 'M12 12V8.4', 'M16.4 12V9.4'],
      heart: ['M12 20.4s-7.4-4.6-7.4-9.4A4.2 4.2 0 0112 8.2a4.2 4.2 0 017.4 2.8c0 4.8-7.4 9.4-7.4 9.4z'],
      footsteps: ['M9.6 5.6a2.2 2.6 0 110 5.2 2.2 2.6 0 010-5.2z', 'M7.6 13.6a2.4 2.8 0 110 5.6 2.4 2.8 0 010-5.6z', 'M15 9.4a2.2 2.6 0 100-5.2 2.2 2.6 0 000 5.2z', 'M17 13.6a2.4 2.8 0 100 5.6 2.4 2.8 0 000-5.6z'],
      medal: ['M12 21.4a5.4 5.4 0 100-10.8 5.4 5.4 0 000 10.8z', 'M12 13.6l1.1 2.2 2.4.3-1.7 1.7.4 2.4-2.2-1.2-2.2 1.2.4-2.4-1.7-1.7 2.4-.3z', 'M8.6 3.2h6.8l-1.2 5.2H9.8z'],
      scissors: ['M6.4 6.4L20 20', 'M17.6 6.4L4 20', 'M8.6 4.6a2.2 2.2 0 110 4.4 2.2 2.2 0 010-4.4z', 'M8.6 15a2.2 2.2 0 110 4.4 2.2 2.2 0 010-4.4z'],
      dice: ['M5 5h14v14H5z', 'M9 9h.01', 'M15 9h.01', 'M12 12h.01', 'M9 15h.01', 'M15 15h.01'],
      blocks: ['M12 3.4l7.6 4.3L12 12 4.4 7.7z', 'M4.4 12.4L12 16.7l7.6-4.3', 'M4.4 12.4v4.3L12 21l7.6-4.6v-4.3'],
      bubble: ['M12 4.4a7.6 7.6 0 100 15.2 7.6 7.6 0 000-15.2z', 'M9.2 9h.01', 'M14.8 9h.01', 'M10 13.6c1.2 1 2.8 1 4 0'],
      icecream: ['M7 10.4h10L12 21z', 'M7 10.4a5 5 0 0110 0'],
      tv: ['M4.4 8.4h15.2v10.4H4.4z', 'M8.4 4.4L12 8.4l3.6-4'],
      tree: ['M12 3.4l5.6 8h-3.2l3.6 5.2H6l3.6-5.2H6.4z', 'M12 16.6V21'],
      calendar: ['M4.4 6.4h15.2v14H4.4z', 'M4.4 10.8h15.2', 'M8.4 3.4v4', 'M15.6 3.4v4'],
      cupcake: ['M6.4 12h11.2l-1.6 8.4H8z', 'M8.4 12a3.6 3.6 0 017.2 0', 'M12 8.4V6.4'],
      basket: ['M3.4 11.4h17.2l-2 9.2H5.4z', 'M8.4 11.4L12 5.4l3.6 6'],
      train: ['M6.4 4.4h11.2v10.4H6.4z', 'M6.4 9.4h11.2', 'M9.6 18.4v3', 'M14.4 18.4v3', 'M8 18.4h8', 'M9.6 14.9v-3.5h4.8v3.5'],
      leaf: ['M12 21v-8', 'M12 13c-4.6 0-7-3-8-6 4.4-1.4 8 .4 8 6z', 'M12 13c.4-5.6 4-7.4 8.4-6-1 3-3.8 6-8.4 6z'],
      camera: ['M3.6 8.4h16.8v11H3.6z', 'M8.4 8.4L10 5.4h4l1.6 3', 'M12 18.4a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z'],
      ball: ['M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2z', 'M12 3.4l4.4 17.2', 'M3.6 9.6l16.8 4.8'],
      compass: ['M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2z', 'M15.6 8.4L13.4 13.4 8.4 15.6 10.6 10.6z'],
      paw: ['M8 9.4a1.9 1.9 0 110 3.8 1.9 1.9 0 010-3.8z', 'M16 9.4a1.9 1.9 0 110 3.8 1.9 1.9 0 010-3.8z', 'M4.8 13.6a1.7 1.7 0 110 3.4 1.7 1.7 0 010-3.4z', 'M19.2 13.6a1.7 1.7 0 110 3.4 1.7 1.7 0 010-3.4z', 'M12 12.4c2.4 0 4.4 2 4.4 4.4 0 1.4-1 2.2-2.4 1.8-1.4-.4-2.6-.4-4 0-1.4.4-2.4-.4-2.4-1.8 0-2.4 2-4.4 4.4-4.4z'],
      fish: ['M3.6 12c2.6-4 6-6 10.4-6l-.8 4.6 6 1.4-6 1.4.8 4.6C9.6 18 6.2 16 3.6 12z', 'M6.4 12h.01'],
      columns: ['M3.6 8.4h16.8', 'M6 8.4v9.2', 'M10 8.4v9.2', 'M14 8.4v9.2', 'M18 8.4v9.2', 'M3.6 20.4h16.8', 'M4.4 8.4L12 3.4l7.6 5'],
      tent: ['M12 5.4L20.4 21H3.6z', 'M12 5.4V21', 'M9.4 13.4h5.2'],
      crown: ['M4 18.4h16', 'M4.6 8.4l2.8 7h9.2l2.8-7-4.6 3.4L12 6.4 8.8 11.8z'],
    }

    const CAT_GLYPH = {
      儿歌: 'music', 绘本: 'book', 数学: 'calculator', 英语: 'lang', 科学启蒙: 'flask',
      认知: 'brain', 识字: 'pencil', 安全: 'shield', 美术: 'palette', 律动: 'pulse',
    }

    const REWARD_GLYPH = {
      s_rocket: 'rocket', s_star: 'star', s_apple: 'apple', s_balloon: 'balloon', s_panda: 'panda',
      s_rainbow: 'rainbow', s_dino: 'dino', s_unicorn: 'gem',
      'p_star-story': 'book', 'p_star-play-five': 'puzzle', 'p_star-sticker': 'star', 'p_star-fruit': 'apple',
      'p_star-song': 'music', 'p_star-pajamas': 'teddy', 'p_star-breakfast': 'bowl', 'p_star-hug': 'heart',
      'p_star-walk': 'footsteps', 'p_star-helper': 'medal', 'p_star-music': 'music', 'p_star-craft': 'scissors',
      'p_star-board-game': 'dice', 'p_star-character': 'gem', 'p_star-blocks': 'blocks', 'p_star-bath-toy': 'bubble',
      'p_galaxy-ice-cream': 'icecream', 'p_galaxy-tv-five': 'tv', 'p_galaxy-park': 'tree', 'p_galaxy-weekend': 'calendar',
      'p_galaxy-bake': 'cupcake', 'p_galaxy-picnic': 'basket', 'p_galaxy-library': 'book', 'p_galaxy-ride': 'train',
      'p_galaxy-dinner': 'bowl', 'p_galaxy-seed': 'leaf', 'p_galaxy-playground': 'blocks', 'p_galaxy-experiment': 'flask',
      'p_galaxy-album': 'camera', 'p_galaxy-treasure': 'gem', 'p_galaxy-ball': 'ball', 'p_galaxy-build': 'blocks',
      'p_crown-toy': 'blocks', 'p_crown-trip': 'compass', 'p_crown-special': 'crown', 'p_crown-zoo': 'paw',
      'p_crown-aquarium': 'fish', 'p_crown-museum': 'columns', 'p_crown-theatre': 'star', 'p_crown-train': 'train',
      'p_crown-camping': 'tent', 'p_crown-sport': 'ball', 'p_crown-workshop': 'scissors', 'p_crown-photo': 'camera',
      'p_crown-route': 'compass', 'p_crown-cooking': 'bowl',
    }

    function Glyph(props) {
      const paths = GLYPHS[props.name] || GLYPHS.star
      const size = props.size || 20
      const box = props.x === undefined
        ? { width: size, height: size }
        : { x: props.x, y: props.y, width: props.width || size, height: props.height || size }
      return h('svg', Object.assign({
        key: props.key,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.sw || 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: props.className,
        style: props.style,
      }, box), paths.map((d, i) => h('path', { key: 'p' + i, d })))
    }

    function catGlyph(name) {
      return CAT_GLYPH[name] || 'star'
    }

    function rewardGlyph(id) {
      return REWARD_GLYPH[id] || 'gem'
    }

    /* ------------------------------------------------------------------ */
    /* 小工具                                                              */
    /* ------------------------------------------------------------------ */

    async function api(path, options) {
      const res = await fetch(API + path, { credentials: 'same-origin', ...(options || {}) })
      const type = res.headers.get('content-type') || ''
      const data = type.includes('application/json') ? await res.json().catch(() => ({})) : {}
      if (!res.ok) throw new Error(data.error || ('请求失败（' + res.status + '）'))
      return data
    }

    function send(path, method, body) {
      return api(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }

    function errorText(e) {
      if (!e) return '出了点问题'
      return e.message || String(e)
    }

    function pad2(n) {
      return String(n).padStart(2, '0')
    }

    function isoOf(date) {
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
    }

    function parseIso(iso) {
      const parts = String(iso || '').split('-').map(Number)
      if (parts.length !== 3 || !parts[0]) return new Date()
      return new Date(parts[0], parts[1] - 1, parts[2])
    }

    function addDays(iso, n) {
      const d = parseIso(iso)
      d.setDate(d.getDate() + n)
      return isoOf(d)
    }

    function mondayOf(iso) {
      const d = parseIso(iso)
      const offset = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - offset)
      return isoOf(d)
    }

    function weekdayLabel(iso) {
      return WEEKDAYS[parseIso(iso).getDay()] || ''
    }

    function shortDate(iso) {
      return String(iso || '').slice(5)
    }

    function fmtDur(seconds) {
      const s = Math.max(0, Math.round(Number(seconds) || 0))
      return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60)
    }

    function timeText(stamp) {
      const value = Number(stamp) || 0
      if (!value) return ''
      const d = new Date(value)
      return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    }

    function coverUrl(raw) {
      const url = String(raw || '').trim()
      if (!url) return ''
      if (url.startsWith('//')) return 'https:' + url
      if (url.startsWith('http://')) return 'https://' + url.slice(7)
      return url
    }

    function playerUrl(id) {
      return 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(id) +
        '&high_quality=1&danmaku=0&autoplay=1&as_wide=1'
    }

    function siteUrl(id) {
      return 'https://www.bilibili.com/video/' + encodeURIComponent(id)
    }

    function addBody(raw) {
      const value = String(raw || '').trim()
      const bv = value.match(/BV[0-9A-Za-z]{10}/)
      if (bv) return { bvid: bv[0] }
      return { url: value }
    }

    function normalizeSettings(raw) {
      const s = raw && typeof raw === 'object' ? raw : {}
      return {
        perDay: Number(s.perDay) > 0 ? Number(s.perDay) : DEFAULT_SETTINGS.perDay,
        maxAge: Number(s.maxAge) > 0 ? Number(s.maxAge) : DEFAULT_SETTINGS.maxAge,
        embedPlay: s.embedPlay === true,
        weeklyBoxLimit: Math.max(0, Number(s.weeklyBoxLimit) || 0),
      }
    }

    function normalizeWatch(raw) {
      const data = raw && typeof raw === 'object' ? raw : {}
      return {
        records: Array.isArray(data.records) ? data.records : [],
        summary: data.summary && typeof data.summary === 'object' ? data.summary : { byDate: {} },
      }
    }

    function mergeWatch(prev, data) {
      const incoming = Array.isArray(data && data.records) ? data.records : []
      const map = new Map()
      ;(prev.records || []).forEach((r) => { if (r && r.videoId) map.set(r.date + '|' + r.videoId, r) })
      incoming.forEach((r) => { if (r && r.videoId && r.date) map.set(r.date + '|' + r.videoId, r) })
      return {
        records: Array.from(map.values()),
        summary: (data && data.summary) || prev.summary || { byDate: {} },
      }
    }

    function streakOf(byDate) {
      let cursor = isoOf(new Date())
      if (!byDate[cursor]) cursor = addDays(cursor, -1)
      let n = 0
      while (byDate[cursor]) {
        n += 1
        cursor = addDays(cursor, -1)
      }
      return n
    }

    function blankQuestion(index) {
      return {
        id: 'q_' + Math.random().toString(36).slice(2, 10),
        prompt: '',
        spokenPrompt: '',
        options: ['', '', ''],
        answer: 0,
        hint: '',
        explanation: '',
        difficulty: 1,
        variant: index + 1,
        mode: 'choice',
      }
    }

    function cloneQuestion(q, index) {
      const raw = q && typeof q === 'object' ? q : {}
      return {
        id: raw.id || ('q_' + Math.random().toString(36).slice(2, 10)),
        prompt: raw.prompt || '',
        spokenPrompt: raw.spokenPrompt || '',
        options: Array.isArray(raw.options) && raw.options.length >= 3 ? raw.options.slice(0, 4) : ['', '', ''],
        answer: Number(raw.answer) >= 0 ? Number(raw.answer) : 0,
        hint: raw.hint || '',
        explanation: raw.explanation || '',
        difficulty: Number(raw.difficulty) || 1,
        variant: Number(raw.variant) || index + 1,
        mode: raw.mode || 'choice',
      }
    }

    function draftOf(lesson) {
      return {
        id: lesson.id,
        videoId: lesson.videoId,
        topic: lesson.topic || '',
        questions: (Array.isArray(lesson.questions) ? lesson.questions : []).map(cloneQuestion),
      }
    }

    function blankDraft(videoId) {
      return {
        id: '',
        videoId,
        topic: '',
        questions: [blankQuestion(0), blankQuestion(1), blankQuestion(2)],
      }
    }

    /* ------------------------------------------------------------------ */
    /* 样式                                                                */
    /* ------------------------------------------------------------------ */

    const CSS = `
.bl-root{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;color-scheme:dark;
--dsw-alias-bg-layer-1:#04060c;--dsw-alias-bg-layer-2:#0a1422;--dsw-alias-bg-layer-3:#0f1e33;--dsw-alias-bg-layer-4:#16283f;
--dsw-alias-label-primary:#e6f0ff;--dsw-alias-label-secondary:#8ea7c3;--dsw-alias-label-dimmed:#5b7089;--dsw-alias-border-l2:rgba(96,176,255,.18);--dsw-alias-brand-primary:#35d8ff;
--bl-void:#04060c;--bl-panel:rgba(10,20,34,.72);--bl-panel-2:rgba(14,26,44,.84);--bl-inset:rgba(10,20,34,.55);
--bl-line:rgba(96,176,255,.18);--bl-line-2:rgba(96,176,255,.34);--bl-line-3:rgba(96,176,255,.55);
--bl-cyan:#35d8ff;--bl-cyan-2:#9fe9ff;--bl-gold:#ffc44d;--bl-green:#37e0a0;--bl-amber:#ffb454;--bl-red:#ff6b6b;
--bl-text:#e6f0ff;--bl-muted:#8ea7c3;--bl-dim:#5b7089;--bl-r:10px;--bl-glow:0 0 22px rgba(26,120,200,.28);
background:radial-gradient(120% 90% at 50% -20%,rgba(28,84,150,.42),transparent 62%),radial-gradient(85% 65% at 100% 112%,rgba(255,150,60,.10),transparent 62%),linear-gradient(180deg,rgba(3,5,10,.62),rgba(3,5,10,.87)),url('/bili-lesson/assets/deck-bg.jpg') center bottom/cover no-repeat fixed;
color:var(--bl-text)!important;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.bl-root *{box-sizing:border-box}
.bl-root ::selection{background:rgba(53,216,255,.28)}
.bl-top{position:relative;display:flex;align-items:center;gap:10px;height:52px;padding:0 18px;flex:none;
background:linear-gradient(180deg,rgba(12,24,40,.9),rgba(8,16,28,.66))!important;border-bottom:1px solid var(--bl-line);box-shadow:0 1px 0 rgba(120,205,255,.10),0 10px 30px rgba(0,0,0,.45)}
.bl-top::after{content:"";position:absolute;left:18px;right:18px;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent,rgba(53,216,255,.55),transparent);opacity:.8}
.bl-brand{display:flex;align-items:center;gap:9px;font-weight:700;font-size:14px;letter-spacing:.6px;white-space:nowrap;text-transform:uppercase;color:#dff2ff}
.bl-brand b{font-weight:700}
.bl-brand-dot{width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#bff4ff,#35d8ff);box-shadow:0 0 10px rgba(53,216,255,.9),0 0 22px rgba(53,216,255,.45);animation:blPulse 2.6s ease-in-out infinite}
@keyframes blPulse{0%,100%{opacity:.75;box-shadow:0 0 8px rgba(53,216,255,.7)}50%{opacity:1;box-shadow:0 0 14px rgba(53,216,255,1),0 0 26px rgba(53,216,255,.5)}}
.bl-tabs{display:flex;gap:4px;margin-left:10px;flex:none;padding:4px;border-radius:10px;background:rgba(6,12,22,.6);border:1px solid var(--bl-line)}
.bl-tab{appearance:none;height:26px;padding:0 13px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--bl-muted);font:inherit;font-size:12px;letter-spacing:.3px;cursor:pointer;white-space:nowrap;transition:color .18s,background .18s,box-shadow .18s}
.bl-tab:hover{color:#dff2ff;background:rgba(53,216,255,.08)}
.bl-tab.on{position:relative;background:linear-gradient(180deg,rgba(53,216,255,.22),rgba(53,216,255,.08));color:#cdf6ff;font-weight:600;border-color:rgba(53,216,255,.4);box-shadow:0 0 14px rgba(53,216,255,.28),inset 0 0 12px rgba(53,216,255,.12)}
.bl-spacer{flex:1;min-width:0}
.bl-hud{display:flex;align-items:center;gap:6px;flex:none}
.bl-hud-chip{appearance:none;font-family:inherit;cursor:pointer;display:flex;align-items:baseline;gap:5px;padding:3px 9px;border-radius:6px;border:1px solid var(--bl-line);background:rgba(6,14,24,.72);font-size:10px;letter-spacing:.6px;color:var(--bl-dim);text-transform:uppercase;white-space:nowrap}
.bl-hud-chip b{font-size:12.5px;font-weight:700;color:#cdf6ff;letter-spacing:.4px;font-variant-numeric:tabular-nums;text-shadow:0 0 12px rgba(53,216,255,.4)}
.bl-hud-chip.gold b{color:#ffd88a;text-shadow:0 0 12px rgba(255,196,77,.45)}
.bl-hud-chip:hover{border-color:var(--bl-line-3);box-shadow:0 0 14px rgba(53,216,255,.22)}
.bl-hud-chip.gold:hover{border-color:rgba(255,196,77,.6);box-shadow:0 0 14px rgba(255,196,77,.25)}
.bl-hud-bar{width:54px;height:6px;border-radius:3px;border:1px solid rgba(96,176,255,.28);background:rgba(4,10,18,.85);overflow:hidden;align-self:center}
.bl-hud-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#ffc44d,#ff8a3d);box-shadow:0 0 8px rgba(255,196,77,.75)}
.bl-hint{color:var(--bl-muted);font-size:11.5px;letter-spacing:.2px}
.bl-note{color:var(--bl-muted);font-size:11.5px;line-height:1.7}
.bl-empty{color:var(--bl-dim);font-size:11.5px;padding:2px 0}
.bl-notice{color:var(--bl-cyan-2);font-size:11.5px;max-width:36vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-err{position:relative;display:flex;align-items:center;gap:10px;padding:8px 18px;background:rgba(255,86,86,.14)!important;border-bottom:1px solid rgba(255,86,86,.38);color:#ffc0c0;font-size:12px;flex:none}
.bl-err b{color:#ff9d9d;flex:none;letter-spacing:.4px}
.bl-err .bl-msg{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:18px 20px 40px;scrollbar-color:rgba(53,216,255,.35) transparent}
.bl-body::-webkit-scrollbar{width:10px}
.bl-body::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(53,216,255,.5),rgba(53,216,255,.18));border-radius:99px;border:3px solid transparent;background-clip:padding-box}
.bl-wrap{width:100%;max-width:1216px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.bl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-sec{position:relative;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:2px 0 2px 12px}
.bl-sec::before{content:"";position:absolute;left:0;top:2px;bottom:2px;width:3px;border-radius:2px;background:linear-gradient(180deg,#35d8ff,rgba(53,216,255,.04));box-shadow:0 0 12px rgba(53,216,255,.65)}
.bl-sec h2{margin:0;font-size:14.5px;font-weight:700;letter-spacing:1.4px;color:#dff2ff;text-shadow:0 0 18px rgba(53,216,255,.35)}
.bl-sec h2 em{font-style:normal;color:var(--bl-dim);font-weight:400;font-size:11px;letter-spacing:.7px;margin-left:9px}
.bl-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:7px;border:1px solid var(--bl-line-2);
background:linear-gradient(180deg,rgba(24,44,70,.9),rgba(10,20,34,.9));color:var(--bl-text);font:inherit;font-size:12px;letter-spacing:.2px;cursor:pointer;text-decoration:none;white-space:nowrap;transition:border-color .18s,box-shadow .18s,transform .18s,background .18s}
.bl-btn:hover{border-color:var(--bl-line-3);background:linear-gradient(180deg,rgba(32,58,90,.95),rgba(12,24,40,.95));box-shadow:0 0 16px rgba(53,216,255,.22)}
.bl-btn:active{transform:translateY(1px)}
.bl-btn:disabled{opacity:.42;cursor:default;box-shadow:none}
.bl-btn-primary{background:linear-gradient(180deg,#5ee4ff,#22b6ea 55%,#1a9bd0)!important;border-color:rgba(190,246,255,.85)!important;color:#03222c!important;font-weight:700;
box-shadow:0 0 18px rgba(53,216,255,.45),inset 0 1px 0 rgba(255,255,255,.55)!important}
.bl-btn-primary:hover{background:linear-gradient(180deg,#7ceaff,#35d8ff 55%,#1ea8e0)!important;box-shadow:0 0 24px rgba(53,216,255,.6)!important}
.bl-btn-danger{color:#ff9d9d;border-color:rgba(255,110,110,.4)}
.bl-btn-danger:hover{border-color:rgba(255,110,110,.7);box-shadow:0 0 14px rgba(255,86,86,.25)}
.bl-btn-sm{height:24px;padding:0 9px;font-size:11px;border-radius:6px}
.bl-input{height:30px;width:100%;padding:0 10px;border-radius:7px;border:1px solid var(--bl-line);background:rgba(6,14,24,.85);color:var(--bl-text);font:inherit;font-size:12px;outline:none;min-width:0;transition:border-color .18s,box-shadow .18s}
.bl-input:focus{border-color:var(--bl-cyan);box-shadow:0 0 0 2px rgba(53,216,255,.16),0 0 14px rgba(53,216,255,.22)}
.bl-input::placeholder{color:#4e647d}
.bl-textarea{width:100%;min-height:60px;padding:8px 10px;border-radius:7px;border:1px solid var(--bl-line);background:rgba(6,14,24,.85);color:var(--bl-text);font:inherit;font-size:12px;outline:none;resize:vertical;line-height:1.55}
.bl-textarea:focus{border-color:var(--bl-cyan);box-shadow:0 0 0 2px rgba(53,216,255,.16)}
.bl-select{height:30px;padding:0 8px;border-radius:7px;border:1px solid var(--bl-line);background:rgba(6,14,24,.85);color:var(--bl-text);font:inherit;font-size:12px;outline:none;cursor:pointer;max-width:100%}
.bl-select:focus{border-color:var(--bl-cyan);box-shadow:0 0 0 2px rgba(53,216,255,.16)}
.bl-select-sm{height:24px;font-size:11px;border-radius:6px;max-width:140px}
.bl-search{flex:1 1 240px;min-width:180px;max-width:340px}
.bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:12px}
.bl-card{position:relative;display:flex;flex-direction:column;min-width:0;border-radius:var(--bl-r);border:1px solid var(--bl-line);
background:linear-gradient(180deg,rgba(16,30,50,.86),rgba(8,16,28,.92))!important;overflow:hidden;transition:border-color .18s,box-shadow .18s,transform .18s}
.bl-card:hover{border-color:var(--bl-line-3);box-shadow:0 0 22px rgba(53,216,255,.22);transform:translateY(-1px)}
.bl-cover{position:relative;height:116px;background:#03060c!important;cursor:pointer;overflow:hidden}
.bl-cover::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(4,8,16,0) 45%,rgba(4,8,16,.55))}
.bl-cover img{width:100%;height:100%;object-fit:cover;display:block}
.bl-card.dead .bl-cover{filter:grayscale(1) brightness(.62)}
.bl-cover-ph,.bl-mini-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:rgba(6,12,22,.9);color:var(--bl-dim);font-size:10.5px}
.bl-play{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;font-size:22px;color:#dff8ff;opacity:0;transition:opacity .18s;background:radial-gradient(circle at 50% 50%,rgba(6,20,34,.45),rgba(4,8,16,.6))}
.bl-cover:hover .bl-play{opacity:.95}
.bl-dur{position:absolute;right:6px;bottom:6px;z-index:3;padding:1px 6px;border-radius:4px;background:rgba(4,10,18,.86);border:1px solid rgba(96,176,255,.35);color:#cfe6ff;font-size:10.5px;font-variant-numeric:tabular-nums;letter-spacing:.4px}
.bl-dead{position:absolute;left:6px;top:6px;z-index:3;padding:1px 6px;border-radius:4px;background:rgba(255,86,86,.92);color:#fff;font-size:10px;font-weight:700;letter-spacing:.4px}
.bl-card-body{display:flex;flex-direction:column;gap:6px;padding:9px 11px 10px;min-width:0}
.bl-card-title{appearance:none;border:0;background:transparent;padding:0;text-align:left;color:var(--bl-text);font:inherit;font-size:12.5px;font-weight:600;line-height:1.35;cursor:pointer;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-height:34px}
.bl-card-title:hover{color:var(--bl-cyan-2);text-shadow:0 0 12px rgba(53,216,255,.45)}
.bl-card-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.bl-tag{padding:1px 7px;border-radius:4px;background:rgba(53,216,255,.12);border:1px solid rgba(53,216,255,.3);color:#bdf1ff;font-size:10.5px;letter-spacing:.4px;white-space:nowrap}
.bl-tag-age{background:rgba(255,196,77,.12);border-color:rgba(255,196,77,.34);color:#ffd88a}
.bl-tag-dead{background:rgba(255,86,86,.16);border-color:rgba(255,86,86,.45);color:#ffa5a5}
.bl-card-owner{color:var(--bl-dim);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.bl-card-reason{color:var(--bl-muted);font-size:11px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bl-card-foot{display:flex;align-items:center;gap:6px;margin-top:2px}
.bl-card-id{color:#4a6076;font-size:10px;font-family:ui-monospace,Consolas,monospace;letter-spacing:.3px}
.bl-empty-panel{position:relative;padding:20px 18px;border:1px dashed var(--bl-line-2);border-radius:var(--bl-r);background:rgba(8,16,28,.6);color:var(--bl-muted);font-size:12.5px;line-height:1.8}
.bl-week{position:relative;display:flex;flex-direction:column;gap:12px;padding-left:26px}
.bl-week::before{content:"";position:absolute;left:9px;top:8px;bottom:8px;width:2px;background:linear-gradient(180deg,rgba(53,216,255,.6),rgba(53,216,255,.08));box-shadow:0 0 12px rgba(53,216,255,.35)}
.bl-day{position:relative;border:1px solid var(--bl-line);border-radius:var(--bl-r);background:linear-gradient(180deg,rgba(16,30,50,.82),rgba(8,16,28,.9))!important;padding:11px 13px;transition:border-color .18s,box-shadow .18s}
.bl-day::before{content:"";position:absolute;left:-22px;top:16px;width:12px;height:12px;border-radius:50%;background:rgba(8,16,28,1);border:2px solid rgba(96,176,255,.45);box-shadow:0 0 10px rgba(53,216,255,.25)}
.bl-day.today{border-color:rgba(53,216,255,.5);box-shadow:0 0 22px rgba(53,216,255,.2)}
.bl-day.today::before{border-color:#35d8ff;background:radial-gradient(circle at 40% 35%,#e6fbff,#35d8ff);box-shadow:0 0 14px rgba(53,216,255,.9),0 0 26px rgba(53,216,255,.5);animation:blPulse 3s ease-in-out infinite}
.bl-day-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.bl-day-name{font-weight:700;font-size:12.5px;letter-spacing:.5px;color:#cfe4fb}
.bl-day.today .bl-day-name{color:var(--bl-cyan-2);text-shadow:0 0 12px rgba(53,216,255,.5)}
.bl-day-date{color:var(--bl-dim);font-size:11.5px;font-variant-numeric:tabular-nums;letter-spacing:.4px}
.bl-badge-today{padding:1px 7px;border-radius:4px;background:rgba(53,216,255,.18);border:1px solid rgba(53,216,255,.5);color:#cdf6ff;font-size:10px;letter-spacing:.6px}
.bl-day-body{display:flex;flex-direction:column;gap:6px}
.bl-day-add{padding-top:6px}
.bl-row{position:relative;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(10,20,34,.72)!important;border:1px solid var(--bl-line);min-width:0;transition:border-color .18s,box-shadow .18s}
.bl-row:hover{border-color:var(--bl-line-3);box-shadow:0 0 16px rgba(53,216,255,.16)}
.bl-mini{width:76px;height:46px;flex:none;border-radius:5px;overflow:hidden;background:#03060c;border:1px solid rgba(96,176,255,.22)}
.bl-mini img{width:100%;height:100%;object-fit:cover;display:block}
.bl-row-main{flex:1;min-width:0}
.bl-row-title{appearance:none;border:0;background:transparent;padding:0;display:block;width:100%;text-align:left;color:var(--bl-text);font:inherit;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.bl-row-title:hover{color:var(--bl-cyan-2)}
.bl-row-sub{color:var(--bl-dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl-check{appearance:none;width:24px;height:24px;padding:0;flex:none;border-radius:5px;border:1px solid rgba(96,176,255,.4);background:rgba(6,14,24,.9);color:rgba(96,176,255,.30);font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .18s,box-shadow .18s}
.bl-check.on{background:rgba(53,216,255,.2);border-color:rgba(53,216,255,.75);color:#dff8ff;box-shadow:0 0 14px rgba(53,216,255,.4)}
.bl-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.bl-stat-box{position:relative;display:flex;flex-direction:column;gap:2px;padding:11px 13px;border:1px solid var(--bl-line);border-radius:var(--bl-r);background:linear-gradient(180deg,rgba(16,30,50,.8),rgba(8,16,28,.9))!important;overflow:hidden}
.bl-stat-box::after{content:"";position:absolute;right:0;top:0;width:46px;height:46px;background:radial-gradient(circle at 100% 0,rgba(53,216,255,.28),transparent 70%);pointer-events:none}
.bl-stat-box b{font-size:22px;line-height:1.2;color:#bff1ff;font-variant-numeric:tabular-nums;text-shadow:0 0 18px rgba(53,216,255,.45);letter-spacing:.5px}
.bl-stat-box span{font-size:11px;color:var(--bl-muted);letter-spacing:.5px;text-transform:uppercase}
.bl-split{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px;align-items:start}
.bl-list{display:flex;flex-direction:column;gap:3px;border:1px solid var(--bl-line);border-radius:var(--bl-r);background:rgba(8,16,28,.78)!important;padding:6px;max-height:calc(100vh - 210px);overflow:auto}
.bl-list-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;color:#b7c9de;min-width:0;border:1px solid transparent}
.bl-list-item:hover{background:rgba(53,216,255,.08);color:#dff2ff}
.bl-list-item.on{background:linear-gradient(90deg,rgba(53,216,255,.2),rgba(53,216,255,.05));border-color:rgba(53,216,255,.4);color:#cdf6ff;box-shadow:0 0 14px rgba(53,216,255,.18)}
.bl-list-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-list-flag{font-size:10px;color:var(--bl-dim);white-space:nowrap;flex:none;letter-spacing:.4px}
.bl-list-flag.on{color:var(--bl-cyan-2)}
.bl-panel::before,.bl-map::before,.bl-card::before{content:"";position:absolute;left:0;top:0;width:14px;height:14px;border-top:2px solid rgba(53,216,255,.5);border-left:2px solid rgba(53,216,255,.5);border-top-left-radius:10px;pointer-events:none;z-index:2}
.bl-panel::after,.bl-map::after,.bl-card::after{content:"";position:absolute;right:0;bottom:0;width:14px;height:14px;border-bottom:2px solid rgba(53,216,255,.4);border-right:2px solid rgba(53,216,255,.4);border-bottom-right-radius:10px;pointer-events:none;z-index:2}
.bl-panel{position:relative;display:flex;flex-direction:column;gap:10px;border:1px solid var(--bl-line);border-radius:var(--bl-r);background:linear-gradient(180deg,rgba(16,30,50,.82),rgba(8,16,28,.9))!important;padding:13px;min-width:0}
.bl-panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.bl-panel-head b{font-size:12.5px;font-weight:700;color:#d6e8fb;letter-spacing:.5px}
.bl-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.bl-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.bl-label{color:rgba(178,202,224,.82);font-size:11.5px;letter-spacing:.2px;line-height:1.35}
.bl-q{display:flex;flex-direction:column;gap:8px;border:1px solid var(--bl-line);border-radius:8px;background:rgba(10,20,34,.8)!important;padding:10px}
.bl-q-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-q-no{font-weight:700;font-size:12px;color:#d6e8fb;white-space:nowrap;letter-spacing:.5px}
.bl-opts{display:flex;flex-direction:column;gap:6px}
.bl-opt-row{display:flex;align-items:center;gap:8px}
.bl-opt-row input[type=radio]{accent-color:#35d8ff;width:14px;height:14px;flex:none;cursor:pointer}
.bl-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 50% 40%,rgba(10,30,50,.72),rgba(2,4,8,.92));backdrop-filter:blur(3px)}
.bl-dialog::before{content:"";position:absolute;left:-1px;top:-1px;width:16px;height:16px;border-top:2px solid var(--bl-line-3);border-left:2px solid var(--bl-line-3);border-top-left-radius:12px;pointer-events:none;z-index:2}
.bl-dialog::after{content:"";position:absolute;right:-1px;bottom:-1px;width:16px;height:16px;border-bottom:2px solid var(--bl-line-3);border-right:2px solid var(--bl-line-3);border-bottom-right-radius:12px;pointer-events:none;z-index:2}
.bl-dialog{position:relative;width:min(900px,96vw);max-height:92vh;display:flex;flex-direction:column;border-radius:12px;border:1px solid var(--bl-line-3);
background:linear-gradient(180deg,rgba(14,28,46,.97),rgba(6,12,22,.98))!important;overflow:hidden;box-shadow:0 0 0 1px rgba(53,216,255,.14),0 30px 80px rgba(0,0,0,.7),0 0 60px rgba(20,90,150,.28)}
.bl-dialog-narrow{width:min(580px,96vw)}
.bl-dialog-head{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--bl-line);background:rgba(10,20,34,.9)!important;flex:none}
.bl-dialog-title{flex:1;min-width:0;font-weight:700;font-size:13px;letter-spacing:.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl-dialog-body{padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;min-height:0}
.bl-dialog-foot{display:flex;align-items:center;gap:8px;padding:11px 14px;border-top:1px solid var(--bl-line);background:rgba(10,20,34,.9)!important;flex:none}
.bl-frame{width:100%;aspect-ratio:16/9;background:#000;border:0;display:block}
.bl-fallback{padding:18px 16px;color:#a9bdd4;font-size:12.5px;line-height:1.8;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.bl-cover-preview{width:100%;max-height:180px;object-fit:cover;border-radius:6px;border:1px solid var(--bl-line-2);display:block}
.bl-q-prompt{font-size:13px;color:var(--bl-text);line-height:1.5}
.bl-opt-pick{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--bl-line);background:rgba(8,16,28,.8)!important;cursor:pointer;color:#c2d4e8;font-size:12.5px;transition:border-color .18s,background .18s,box-shadow .18s}
.bl-opt-pick:hover{border-color:var(--bl-line-3);color:#e6f0ff}
.bl-opt-pick.on{border-color:rgba(53,216,255,.7);background:linear-gradient(90deg,rgba(53,216,255,.2),rgba(53,216,255,.06));color:#dff8ff;box-shadow:0 0 14px rgba(53,216,255,.28)}
.bl-opt-pick input{accent-color:#35d8ff;width:14px;height:14px;flex:none;cursor:pointer}
.bl-opt-text{min-width:0;overflow-wrap:anywhere}
.bl-q-right{border-color:rgba(55,224,160,.4)}
.bl-q-wrong{border-color:rgba(255,107,107,.42)}
.bl-verdict{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 11px;border-radius:6px;border:1px solid var(--bl-line);background:rgba(10,20,34,.8)!important;font-size:12px}
.bl-verdict.ok{border-color:rgba(55,224,160,.45);background:rgba(55,224,160,.1)!important;color:#a8f5d2}
.bl-verdict.bad{border-color:rgba(255,107,107,.45);background:rgba(255,107,107,.1)!important;color:#ffbdbd}
.bl-score{font-size:30px;font-weight:800;line-height:1.1;color:#bff1ff;font-variant-numeric:tabular-nums;text-shadow:0 0 22px rgba(53,216,255,.55);letter-spacing:1px}
.bl-stickers{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:12px}
.bl-sticker{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 8px 12px;background:transparent;text-align:center;min-width:0}
.bl-sticker::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,40,66,.9),rgba(8,16,28,.95));border:1px solid var(--bl-line-2);box-shadow:inset 0 0 22px rgba(53,216,255,.12),0 0 18px rgba(20,80,140,.25);clip-path:polygon(26% 0,74% 0,100% 50%,74% 100%,26% 100%,0 50%);z-index:0}
.bl-sticker>*{position:relative;z-index:1}
.bl-sticker.locked{opacity:.5}
.bl-sticker.locked::before{background:linear-gradient(180deg,rgba(16,24,36,.9),rgba(6,10,18,.95));border-color:rgba(96,176,255,.14);box-shadow:none}
.bl-sticker.locked .bl-sticker-emoji{filter:grayscale(1) brightness(.75)}
.bl-sticker.rare::before{border-color:rgba(255,196,77,.6);box-shadow:inset 0 0 26px rgba(255,196,77,.16),0 0 20px rgba(255,180,60,.28)}
.bl-sticker.epic::before{border-color:rgba(190,140,255,.6);box-shadow:inset 0 0 26px rgba(190,140,255,.18),0 0 22px rgba(160,110,255,.3)}
.bl-sticker-emoji{font-size:26px;line-height:1.15;filter:drop-shadow(0 0 8px rgba(53,216,255,.45))}
.bl-sticker-name{font-size:12px;color:var(--bl-text);font-weight:700;letter-spacing:.3px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-sticker-meta{font-size:10.5px;color:var(--bl-dim);letter-spacing:.4px}
.bl-sticker-count{font-size:10.5px;color:var(--bl-cyan-2);font-variant-numeric:tabular-nums}
.bl-steps{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-step{display:flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;border:1px solid var(--bl-line);background:rgba(6,14,24,.72);font-size:11.5px;color:var(--bl-muted);letter-spacing:.3px}
.bl-step i{width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:9.5px;border:1px solid currentColor;opacity:.9;flex:none}
.bl-step.done{border-color:rgba(53,216,255,.5);color:#cdf6ff;box-shadow:0 0 14px rgba(53,216,255,.18)}
.bl-step.now{border-color:rgba(255,196,77,.6);color:#ffe3a8;box-shadow:0 0 16px rgba(255,196,77,.26)}
.bl-step-arrow{color:rgba(96,176,255,.4);font-size:11px}
.bl-ring{position:relative;width:46px;height:46px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:conic-gradient(#35d8ff 0 var(--p,0%),rgba(96,176,255,.14) var(--p,0%) 100%)}
.bl-ring::before{content:"";position:absolute;inset:5px;border-radius:50%;background:#08111d;border:1px solid rgba(96,176,255,.2)}
.bl-ring b{position:relative;font-size:10.5px;color:#cdf6ff;font-variant-numeric:tabular-nums}
.bl-draw-card{position:relative;display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:10px;border:1px solid rgba(53,216,255,.5);
background:linear-gradient(100deg,rgba(53,216,255,.18),rgba(20,60,110,.35),rgba(255,196,77,.12))!important;box-shadow:0 0 26px rgba(53,216,255,.3),inset 0 0 30px rgba(53,216,255,.12)}
.bl-draw-card .bl-sticker-emoji{font-size:36px}
.bl-draw-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.bl-draws{display:flex;flex-direction:column;gap:4px}
.bl-draw-row{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:6px;background:rgba(10,20,34,.72)!important;border:1px solid var(--bl-line);font-size:11.5px;color:#c2d4e8}
/* ---------- 星域地图 ---------- */
.bl-map{position:relative;border:1px solid var(--bl-line);border-radius:var(--bl-r);padding:8px 10px 4px;overflow:hidden;
background:radial-gradient(120% 120% at 50% 0,rgba(30,90,150,.22),transparent 62%),rgba(4,10,18,.72)!important;box-shadow:inset 0 0 40px rgba(20,70,120,.25)}
.bl-map svg{display:block;width:100%;height:auto}
.bl-map-hub{fill:url(#blHub)}
.bl-hub-core{animation:blHubPulse 4.2s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
@keyframes blHubPulse{0%,100%{transform:scale(1);opacity:.96}50%{transform:scale(1.045);opacity:1}}
.bl-planet{cursor:pointer}
.bl-planet circle.bl-planet-body{transition:filter .2s}
.bl-planet:hover circle.bl-planet-body{filter:brightness(1.35)}
.bl-planet.on circle.bl-planet-ring{stroke:#9fe9ff;stroke-width:2.5}
.bl-map-legend{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:2px 4px 6px;font-size:11px;color:var(--bl-muted)}
.bl-map-legend b{color:var(--bl-cyan-2);font-weight:600}
/* ---------- 课卡列表 ---------- */
.bl-learn{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;align-items:start}
@media(max-width:1080px){.bl-learn{grid-template-columns:minmax(0,1fr)}}
.bl-hex{position:relative;display:flex;align-items:center;justify-content:center;width:56px;height:56px;flex:none}
.bl-hex svg{position:absolute;inset:0;width:100%;height:100%}
.bl-map text{font-family:inherit;pointer-events:none}
.bl-planet-label{fill:#d6e8fb;font-size:12.5px;letter-spacing:.6px}
.bl-planet-count{fill:#8ea7c3;font-size:10.5px;letter-spacing:.5px}
.bl-map svg{overflow:visible}
/* ===== v2 视觉覆盖：克制的舰桥 HUD（去霓虹堆叠，建立层级） ===== */
.bl-root{--bl-void:#05080f;--bl-panel:#0b1622;--bl-panel-2:#0f1e2e;--bl-inset:#08111b;
--bl-line:rgba(140,176,210,.14);--bl-line-2:rgba(140,176,210,.26);--bl-line-3:rgba(140,176,210,.40);
--bl-cyan:#5cc8ff;--bl-cyan-2:#bfe8ff;--bl-gold:#f3b34c;--bl-green:#4fd8a6;--bl-amber:#f3a44c;--bl-red:#f0736f;
--bl-text:#e3ebf5;--bl-muted:#8598ad;--bl-dim:#5f7387;--bl-r:12px;--bl-glow:none;
--dsw-alias-bg-layer-1:#05080f;--dsw-alias-bg-layer-2:#0b1622;--dsw-alias-bg-layer-3:#0f1e2e;
--dsw-alias-label-primary:#e3ebf5;--dsw-alias-label-secondary:#8598ad;--dsw-alias-label-dimmed:#5f7387;
--dsw-alias-border-l2:rgba(140,176,210,.14);--dsw-alias-brand-primary:#5cc8ff;
font:13.5px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
background:linear-gradient(180deg,rgba(5,8,15,.80),rgba(4,6,11,.94)),url('/bili-lesson/assets/deck-bg.jpg') center bottom/cover no-repeat fixed}

/* 顶栏 */
.bl-top{height:56px;padding:0 20px;gap:12px;background:rgba(7,12,20,.86)!important;border-bottom:1px solid var(--bl-line);box-shadow:none}
.bl-top::after{display:none}
.bl-brand{font-size:13.5px;font-weight:600;letter-spacing:.14em;color:#cfdceb}
.bl-brand-dot{width:8px;height:8px;background:var(--bl-gold);box-shadow:none;animation:none}
.bl-tabs{gap:2px;margin-left:14px;padding:3px;border-radius:10px;background:rgba(8,14,22,.7);border:1px solid var(--bl-line)}
.bl-tab{height:28px;padding:0 12px;border-radius:8px;font-size:12.5px;letter-spacing:.02em;color:var(--bl-muted)}
.bl-tab:hover{color:#dfeaf7;background:rgba(255,255,255,.04)}
.bl-tab.on{background:rgba(92,200,255,.14);border-color:rgba(92,200,255,.30);color:#d9f1ff;font-weight:600;box-shadow:none}

/* HUD 读数 */
.bl-hud{gap:8px}
.bl-hud-chip{align-items:center;gap:7px;padding:4px 10px;border-radius:8px;border:1px solid var(--bl-line);background:rgba(9,16,26,.72);
font-size:9.5px;letter-spacing:.12em;color:var(--bl-dim)}
.bl-hud-chip b{font-size:13px;font-weight:600;color:#dbe8f6;letter-spacing:0;text-shadow:none}
.bl-hud-chip.gold b{color:var(--bl-gold)}
.bl-hud-chip:hover{border-color:var(--bl-line-3);box-shadow:none;background:rgba(15,26,40,.8)}
.bl-hud-bar{width:64px;height:4px;border-radius:2px;border:0;background:rgba(140,176,210,.16)}
.bl-hud-bar i{background:var(--bl-gold);box-shadow:none}

/* 主区 */
.bl-body{padding:20px 24px 48px;scrollbar-color:rgba(140,176,210,.25) transparent}
.bl-wrap{max-width:1180px;gap:18px}
.bl-sec{padding:0 0 0 0;border-bottom:1px solid var(--bl-line);padding-bottom:10px;margin-bottom:2px}
.bl-sec::before{display:none}
.bl-sec h2{font-size:17px;font-weight:600;letter-spacing:.02em;color:#e9f2fb;text-shadow:none}
.bl-sec h2 em{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--bl-dim);margin-left:10px;font-weight:500}

/* 按钮 */
.bl-btn{height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--bl-line-2);background:#111e2d;font-size:12.5px;letter-spacing:.01em}
.bl-btn:hover{border-color:var(--bl-line-3);background:#16273a;box-shadow:none}
.bl-btn-primary{background:#5cc8ff!important;border-color:#5cc8ff!important;color:#04202e!important;font-weight:600}
.bl-btn-primary:hover{background:#7bd6ff!important;border-color:#7bd6ff!important;box-shadow:none!important}
.bl-btn-danger{color:#f0a3a1;border-color:rgba(240,115,111,.34)}
.bl-btn-sm{height:26px;padding:0 10px;font-size:11.5px;border-radius:7px}

/* 输入 */
.bl-input,.bl-textarea,.bl-select{background:#0a1521;border:1px solid var(--bl-line);border-radius:8px;font-size:12.5px}
.bl-input:focus,.bl-textarea:focus{border-color:rgba(92,200,255,.5);box-shadow:0 0 0 3px rgba(92,200,255,.10)}
.bl-input::placeholder{color:#4d5f73}

/* 卡片 */
.bl-card{border-radius:12px;border:1px solid var(--bl-line);background:#0b1622;box-shadow:none;overflow:hidden}
.bl-card:hover{border-color:var(--bl-line-2);transform:translateY(-1px);box-shadow:0 12px 28px rgba(0,0,0,.38)}
.bl-card-body{gap:7px;padding:11px 12px 12px}
.bl-card-title{font-size:13.5px;font-weight:600;line-height:1.45;max-height:40px;color:#e6eef8}
.bl-card-meta{gap:6px}
.bl-tag{padding:1px 7px;border-radius:5px;background:rgba(92,200,255,.10);border:1px solid rgba(92,200,255,.22);color:#a9d9f5;font-size:10.5px;letter-spacing:.02em}
.bl-tag-age{background:rgba(243,179,76,.10);border-color:rgba(243,179,76,.24);color:#f0c684}
.bl-tag-dead{background:rgba(240,115,111,.12);border-color:rgba(240,115,111,.30);color:#f0a3a1}
.bl-card-owner,.bl-card-reason{font-size:11px;color:var(--bl-dim)}
.bl-card-id{color:#4c5f73;font-size:10px}

/* 面板 / 日卡 / 统计 */
.bl-panel,.bl-day,.bl-stat-box{border-radius:12px;border:1px solid var(--bl-line);background:#0b1622!important;box-shadow:none}
.bl-panel{padding:14px}
.bl-panel-head{gap:10px;margin-bottom:4px}
.bl-day{padding:12px 14px}
.bl-day-name{font-size:12.5px;letter-spacing:.02em;color:#dbe6f3}
.bl-day-date{font-size:11px;color:var(--bl-dim)}
.bl-week{padding-left:24px;gap:10px}
.bl-week::before{background:var(--bl-line)}
.bl-day::before{background:#0b1622;border:1.5px solid var(--bl-line-2);box-shadow:none;width:9px;height:9px;left:-25px}
.bl-day.today::before{background:var(--bl-gold);border-color:var(--bl-gold);animation:none}
.bl-day.today{border-color:rgba(243,179,76,.34)}

/* 星域地图 */
.bl-map{border-radius:14px;border:1px solid var(--bl-line);padding:10px 12px 2px;background:radial-gradient(120% 100% at 50% 0%,rgba(20,42,68,.55),rgba(7,13,22,.85))}
.bl-map-legend{padding:0 2px 10px;font-size:11px;color:var(--bl-muted);letter-spacing:.02em}
.bl-map-legend b{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9fb4c9;font-weight:600}
.bl-planet-label{fill:#cfe0f2;font-size:12px;letter-spacing:.06em;font-weight:600}
.bl-planet-count{fill:#7b90a6;font-size:10px;letter-spacing:.04em}
.bl-planet:hover .bl-planet-body{filter:brightness(1.18)}
.bl-map svg{overflow:visible}

/* 学习步骤条 */
.bl-steps{gap:6px}
.bl-step{padding:6px 12px 6px 8px;border-radius:10px;border:1px solid var(--bl-line);background:rgba(9,16,26,.6);font-size:11.5px;color:var(--bl-muted)}
.bl-step b{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(140,176,210,.12);color:#b6c8da;font-size:10.5px;font-weight:600}
.bl-step.now{border-color:rgba(243,179,76,.5);background:rgba(243,179,76,.10);color:#f4d5a5}
.bl-step.now b{background:var(--bl-gold);color:#2b1a04}
.bl-step.done{border-color:rgba(79,216,166,.32);color:#a8ebd0}
.bl-step.done b{background:rgba(79,216,166,.20);color:#8defc5}
.bl-step-arrow{color:rgba(140,176,210,.28);font-size:11px}

/* 奖品格 */
.bl-stickers{gap:10px;grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
.bl-sticker{padding:12px 6px 10px}
.bl-sticker-emoji{font-size:24px;filter:none}
.bl-sticker-name{font-size:12px;font-weight:600;color:#e2ecf7}
.bl-sticker-meta{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--bl-dim)}
.bl-sticker.locked .bl-sticker-emoji{filter:grayscale(1);opacity:.4}
.bl-sticker.locked .bl-sticker-name{color:#6b7d90}
.bl-ring{width:52px;height:52px;background:conic-gradient(var(--bl-gold) 0 var(--p,0%),rgba(140,176,210,.14) var(--p,0%) 100%)}
.bl-ring::before{background:#0b1622}
.bl-ring b{font-size:12px;color:#e9f2fb}

/* 弹窗 */
.bl-dialog{border-radius:14px;border:1px solid var(--bl-line-2);background:#0d1a28;box-shadow:0 24px 60px rgba(0,0,0,.6)}
/* ===== v3 舰桥外壳：左侧导航栏 + 顶部状态条 + 主区 ===== */
.bl-root{--bl-rail:156px}
.bl-shell{display:grid;grid-template-columns:var(--bl-rail) minmax(0,1fr);flex:1;min-height:0}
.bl-rail{display:flex;flex-direction:column;gap:3px;padding:16px 10px 12px;border-right:1px solid var(--bl-line);background:linear-gradient(180deg,rgba(8,14,22,.94),rgba(5,9,15,.94))}
.bl-rail-brand{display:flex;align-items:center;gap:9px;padding:0 6px 14px;margin-bottom:6px;border-bottom:1px solid var(--bl-line);font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#b9cbdd;white-space:nowrap}
.bl-rail-brand i{width:9px;height:9px;border-radius:2px;background:var(--bl-gold);flex:none}
.bl-rail-item{appearance:none;position:relative;display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--bl-muted);font:inherit;font-size:12.5px;cursor:pointer;text-align:left;white-space:nowrap;transition:background .15s,color .15s,border-color .15s}
.bl-rail-item svg{flex:none;opacity:.8}
.bl-rail-item:hover{background:rgba(255,255,255,.045);color:#dbe8f6}
.bl-rail-item.on{background:rgba(92,200,255,.12);border-color:rgba(92,200,255,.26);color:#dcf3ff;font-weight:600}
.bl-rail-item.on svg{opacity:1}
.bl-rail-item.on::before{content:"";position:absolute;left:-10px;top:9px;bottom:9px;width:2px;border-radius:2px;background:var(--bl-cyan)}
.bl-rail-item em{margin-left:auto;font-style:normal;font-size:10.5px;color:var(--bl-dim);font-variant-numeric:tabular-nums}
.bl-rail-foot{margin-top:auto;display:flex;flex-direction:column;gap:10px;padding:12px 8px 4px;border-top:1px solid var(--bl-line)}
.bl-xp{display:flex;flex-direction:column;gap:6px}
.bl-xp-head{display:flex;justify-content:space-between;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--bl-dim)}
.bl-xp-head b{color:var(--bl-gold);font-size:10.5px;letter-spacing:0}
.bl-bar{height:4px;border-radius:2px;background:rgba(140,176,210,.16);overflow:hidden}
.bl-bar i{display:block;height:100%;border-radius:2px;background:var(--bl-cyan)}
.bl-bar.gold i{background:var(--bl-gold)}
.bl-bar.green i{background:var(--bl-green)}

.bl-main{display:flex;flex-direction:column;min-width:0;min-height:0}
.bl-top{display:flex;flex-direction:column;align-items:stretch;gap:10px;height:auto;flex:none;padding:16px 22px 0;background:transparent!important;border:0;box-shadow:none}
.bl-top-row{display:flex;align-items:center;gap:10px;min-width:0}
.bl-top-title{font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--bl-dim);font-weight:600}
.bl-hudstrip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.bl-stat{appearance:none;position:relative;display:flex;flex-direction:column;gap:7px;padding:11px 13px 12px;border:1px solid var(--bl-line);border-radius:12px;background:#0b1622;text-align:left;font:inherit;color:inherit;cursor:pointer;overflow:hidden;transition:border-color .15s,background .15s}
.bl-stat:hover{border-color:var(--bl-line-2);background:#0e1b29}
.bl-stat-top{display:flex;align-items:center;gap:7px;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--bl-dim);font-weight:600}
.bl-stat-top svg{opacity:.8}
.bl-stat-val{display:flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums}
.bl-stat-val b{font-size:22px;line-height:1.05;font-weight:600;color:#e8f2fc;letter-spacing:-.01em}
.bl-stat.gold .bl-stat-val b{color:var(--bl-gold)}
.bl-stat.green .bl-stat-val b{color:var(--bl-green)}
.bl-stat-val em{font-style:normal;font-size:11px;color:var(--bl-dim)}
.bl-stat-note{font-size:10.5px;color:var(--bl-dim);letter-spacing:.01em}
.bl-dots{display:flex;gap:4px}
.bl-dots i{width:12px;height:12px;border-radius:3px;background:rgba(140,176,210,.18)}
.bl-dots i.on{background:var(--bl-gold)}

.bl-hero{display:grid;grid-template-columns:minmax(0,1fr) 306px;gap:12px;align-items:stretch}
.bl-course{display:flex;flex-direction:column;gap:10px;padding:0;overflow:hidden}
.bl-course-cover{position:relative;width:100%;aspect-ratio:16/7;background:#0a140f;overflow:hidden}
.bl-course-cover img{width:100%;height:100%;object-fit:cover;display:block}
.bl-course-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,11,18,0) 40%,rgba(6,11,18,.85))}
.bl-course-body{display:flex;flex-direction:column;gap:9px;padding:0 13px 13px}
.bl-course-title{font-size:14px;font-weight:600;line-height:1.4;color:#e9f2fb;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bl-course-kicker{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--bl-dim);font-weight:600}
.bl-goals{display:flex;flex-direction:column;gap:5px;margin:0;padding:0;list-style:none}
.bl-goals li{position:relative;padding-left:12px;font-size:11.5px;line-height:1.45;color:var(--bl-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-goals li::before{content:"";position:absolute;left:0;top:6px;width:5px;height:5px;border-radius:1px;background:rgba(140,176,210,.5)}
.bl-reward-row{display:flex;flex-wrap:wrap;gap:6px}
.bl-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;border:1px solid var(--bl-line);background:rgba(9,16,26,.6);font-size:11px;color:var(--bl-muted)}
.bl-chip b{color:#e8f2fc;font-weight:600;font-variant-numeric:tabular-nums}
.bl-chip.gold{border-color:rgba(243,179,76,.3);color:#f0c684}
.bl-chip.gold b{color:var(--bl-gold)}
.bl-course-cta{display:flex;flex-direction:column;gap:7px;margin-top:2px}
.bl-course-cta .bl-btn{height:34px;font-size:13px}
.bl-grid-sm{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.bl-bars{display:flex;align-items:flex-end;gap:5px;height:34px}
.bl-bars i{flex:1;border-radius:2px 2px 0 0;background:rgba(92,200,255,.35);min-height:2px}
.bl-bars i.on{background:var(--bl-cyan)}
.bl-station-icon{fill:#f4f9ff;font-size:17px;font-weight:600}
.bl-planet-label{font-weight:600}

/* ===== v4 舰桥视觉体系（对齐参考稿：蓝金 + 切角 + 角标 + 状态条）===== */
.bl-root{
--bl-panel:#081426;--bl-panel-2:#0b1c31;--bl-inset:#06101e;
--bl-line:rgba(94,162,226,.22);--bl-line-2:rgba(94,162,226,.4);--bl-line-3:rgba(128,200,255,.8);
--bl-cyan:#3fa9ff;--bl-cyan-2:#9ad8ff;--bl-gold:#f5b333;--bl-green:#2fd39b;--bl-r:14px;
--bl-cut:14px;--bl-hud-h:74px;
background:radial-gradient(110% 80% at 78% -10%,rgba(28,80,140,.5),transparent 58%),radial-gradient(80% 60% at 6% 106%,rgba(24,74,132,.32),transparent 62%),linear-gradient(180deg,rgba(3,6,12,.7),rgba(2,5,11,.92)),url('/bili-lesson/assets/deck-bg.jpg') center bottom/cover no-repeat fixed;
}
/* 切角面板基类 */
.bl-cut{clip-path:polygon(var(--bl-cut) 0,100% 0,100% calc(100% - var(--bl-cut)),calc(100% - var(--bl-cut)) 100%,0 100%,0 var(--bl-cut))}
.bl-panelx{position:relative;border:1px solid var(--bl-line);border-radius:12px;background:linear-gradient(180deg,rgba(12,26,44,.92),rgba(6,14,26,.94));box-shadow:inset 0 1px 0 rgba(160,215,255,.08),0 14px 34px rgba(0,0,0,.34)}
.bl-panelx::before{content:"";position:absolute;left:14px;top:0;width:74px;height:1px;background:linear-gradient(90deg,rgba(120,200,255,.9),transparent);pointer-events:none}

/* 顶部状态条 */
.bl-hud-bar-wrap{display:grid;grid-template-columns:minmax(200px,1.35fr) repeat(4,minmax(0,1fr))}
.bl-hud-bar-wrap>.bl-cell+ .bl-cell{border-left:1px solid var(--bl-line)}
.bl-hud-strip{position:relative;display:grid;grid-template-columns:minmax(200px,1.35fr) repeat(4,minmax(0,1fr));border:1px solid var(--bl-line);border-radius:14px;background:linear-gradient(180deg,rgba(13,29,50,.94),rgba(6,15,27,.96));box-shadow:inset 0 1px 0 rgba(150,205,255,.1),0 16px 40px rgba(0,0,0,.4);overflow:hidden}
.bl-hud-strip::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(63,169,255,.07),transparent 26%),linear-gradient(270deg,rgba(245,179,51,.05),transparent 22%)}
.bl-hud-id{display:flex;align-items:center;gap:11px;padding:9px 14px;border-right:1px solid var(--bl-line);min-width:0}
.bl-avatar{position:relative;flex:none;width:54px;height:54px;display:flex;align-items:center;justify-content:center;
clip-path:polygon(50% 0,94% 26%,94% 74%,50% 100%,6% 74%,6% 26%);
background:linear-gradient(160deg,#3f86d8,#0e2b4d 62%,#0a1c33)}
.bl-avatar::after{content:"";position:absolute;inset:3px;clip-path:inherit;border:1px solid rgba(150,210,255,.34)}
.bl-avatar span{font-size:22px;font-weight:700;color:#dff1ff;text-shadow:0 0 16px rgba(120,200,255,.75);letter-spacing:-1px}
.bl-id-name{display:flex;flex-direction:column;gap:3px;min-width:0}
.bl-id-name b{font-size:14px;font-weight:700;color:#eaf4ff;letter-spacing:.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl-id-lv{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--bl-cyan-2);font-variant-numeric:tabular-nums}
.bl-id-lv em{font-style:normal;color:var(--bl-dim);letter-spacing:.06em}
.bl-xpbar{position:relative;height:7px;border-radius:4px;background:rgba(6,20,36,.9);border:1px solid rgba(94,162,226,.26);overflow:hidden;width:100%;max-width:172px}
.bl-xpbar i{position:absolute;inset:0 auto 0 0;border-radius:4px;background:linear-gradient(90deg,#2f8fe0,#66d6ff);box-shadow:0 0 10px rgba(80,190,255,.7)}
.bl-xpbar.gold i{background:linear-gradient(90deg,#e79a1f,#ffd782);box-shadow:0 0 10px rgba(245,179,51,.7)}

.bl-cell{appearance:none;position:relative;display:flex;flex-direction:column;gap:5px;padding:9px 13px;border:0;background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0}
.bl-cell:hover{background:rgba(63,169,255,.06)}
.bl-cell-top{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.05em;color:#9fb6cd;white-space:nowrap}
.bl-cell-top svg{opacity:.85;color:var(--bl-cyan-2)}
.bl-cell-top span{font-weight:600;letter-spacing:.08em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis}
.bl-cell-top em{font-style:normal;font-size:8.5px;color:#5f7a94;letter-spacing:.1em}
.bl-cell-val{display:flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums}
.bl-cell-val b{font-size:19px;line-height:1.05;font-weight:700;color:#eaf4ff;letter-spacing:-.01em}
.bl-cell.gold .bl-cell-val b{color:#ffd071}
.bl-cell.green .bl-cell-val b{color:#63e6b4}
.bl-cell-val em{font-style:normal;font-size:10.5px;color:#7f97af}
.bl-cell-foot{font-size:9.5px;color:#6d86a0;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* 左侧导航 */
.bl-rail{background:linear-gradient(180deg,rgba(9,20,36,.78),rgba(4,10,20,.9));border-right:1px solid var(--bl-line);padding:12px 10px}
.bl-rail-brand{font-size:10.5px;letter-spacing:.18em;color:#a8c2da;padding:2px 8px 13px;border-bottom:1px solid var(--bl-line)}
.bl-rail-brand i{width:10px;height:10px;background:linear-gradient(140deg,#8fd8ff,#2f7fd0);box-shadow:0 0 10px rgba(80,180,255,.8);border-radius:2px}
.bl-rail-item{height:44px;border-radius:10px;font-size:13px;gap:11px;padding:0 11px}
.bl-rail-item.on{background:linear-gradient(90deg,rgba(46,120,200,.55),rgba(30,82,140,.24));border-color:rgba(120,200,255,.5);color:#eaf7ff;box-shadow:inset 0 1px 0 rgba(180,225,255,.22),0 0 18px rgba(50,140,220,.22)}
.bl-rail-item.on::before{display:none}
.bl-rail-item.on::after{content:"当前";position:absolute;right:8px;top:-1px;padding:0 5px;font-size:8.5px;line-height:13px;letter-spacing:.06em;color:#04202f;background:linear-gradient(180deg,#9fe6ff,#3fb2e8);border-radius:0 0 4px 4px}
.bl-rail-item em{margin-left:auto;font-size:10px;color:#7f97af}
.bl-rail-item.on em{color:#bfe6ff}
.bl-rail-foot{padding-top:12px}

/* 二级 tab（学习中心 / 我的课程） */
.bl-subtabs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-subtab{appearance:none;height:30px;padding:0 14px;border:1px solid var(--bl-line);border-bottom:0;border-radius:9px 9px 0 0;background:rgba(8,20,36,.7);color:#8fa8c0;font:inherit;font-size:12px;cursor:pointer;letter-spacing:.03em}
.bl-subtab:hover{color:#d6ecff;background:rgba(20,44,72,.7)}
.bl-subtab.on{background:linear-gradient(180deg,rgba(46,120,200,.42),rgba(10,26,44,.9));border-color:rgba(120,200,255,.45);color:#eaf7ff;font-weight:600;box-shadow:inset 0 1px 0 rgba(180,225,255,.24)}

/* 区块标题 */
.bl-head{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:0 2px}
.bl-head h2{margin:0;font-size:15px;font-weight:700;letter-spacing:.06em;color:#eaf4ff}
.bl-head p{margin:0;font-size:11px;color:#7d95ad;letter-spacing:.02em}
.bl-head .bl-spacer{flex:1}
.bl-link{appearance:none;border:0;background:transparent;color:#8fc7f0;font:inherit;font-size:11px;cursor:pointer;letter-spacing:.02em}
.bl-link:hover{color:#cdeaff}

/* 主区 */
.bl-hero{grid-template-columns:minmax(0,1fr) 322px}
.bl-course{border:1px solid var(--bl-line);border-radius:12px;background:linear-gradient(180deg,rgba(12,26,44,.94),rgba(6,14,26,.96));box-shadow:inset 0 1px 0 rgba(150,205,255,.1),0 14px 34px rgba(0,0,0,.34)}
.bl-course-cover{aspect-ratio:16/8}
.bl-course-cover::after{background:linear-gradient(180deg,rgba(4,10,18,.15) 30%,rgba(7,16,28,.96))}
.bl-course-kicker{font-size:10px;letter-spacing:.16em;color:#89a4bd}
.bl-course-title{font-size:15px;font-weight:700;letter-spacing:.01em}
.bl-course-desc{font-size:11.5px;line-height:1.65;color:#a9c0d6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.bl-goals li{font-size:11.5px;color:#adc5db;white-space:normal}
.bl-goals li::before{background:linear-gradient(180deg,#5cc8ff,#2f8fe0);box-shadow:0 0 6px rgba(90,190,255,.6);top:5px;width:4px;height:4px}
.bl-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bl-tile{padding:8px 10px;border:1px solid var(--bl-line);border-radius:9px;background:rgba(8,20,36,.66)}
.bl-tile span{display:block;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#7d95ad}
.bl-tile b{display:block;margin-top:3px;font-size:12.5px;color:#e6f2ff;font-weight:600;letter-spacing:.02em}
.bl-chips{display:flex;gap:7px;flex-wrap:wrap}
.bl-chip{padding:5px 9px;border-radius:8px;font-size:11px;flex:none;white-space:nowrap}
.bl-chip.gold{border-color:rgba(245,179,51,.42);background:rgba(245,179,51,.1);color:#ffd58a}
.bl-course-prog{display:flex;align-items:center;gap:12px;margin:2px 0 6px}
.bl-ring{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;flex:none;box-shadow:0 0 0 1px rgba(140,176,210,.16) inset}
.bl-ring i{width:44px;height:44px;border-radius:50%;background:#0b1622;display:grid;place-items:center;font-style:normal;font-size:11.5px;font-weight:700;color:#dff3ff;font-variant-numeric:tabular-nums}
.bl-ring-meta{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:11px;color:var(--bl-muted);line-height:1.35}
.bl-ring-meta b{font-size:12.5px;font-weight:600;color:#dff3ff}
.bl-pulse{transform-box:fill-box;transform-origin:center;animation:blPulse 2.6s ease-out infinite}
@keyframes blPulse{0%{opacity:.42;transform:scale(.84)}72%{opacity:0;transform:scale(1.24)}100%{opacity:0;transform:scale(1.24)}}
@media (prefers-reduced-motion: reduce){.bl-pulse{animation:none;opacity:.28}}
.bl-dash{animation:blFlow 1.6s linear infinite}
@keyframes blFlow{to{stroke-dashoffset:-24}}
.bl-star{animation:blTwinkle 3.4s ease-in-out infinite}
@keyframes blTwinkle{0%,100%{opacity:.15}50%{opacity:.75}}
.bl-ring-spin{transform-box:fill-box;transform-origin:center;animation:blSpin 22s linear infinite}
@keyframes blSpin{to{transform:rotate(360deg)}}
.bl-station:hover path{stroke-opacity:1}
.bl-station:hover text{fill:#ffffff}
.bl-arrow{animation:blBreath 2.6s ease-in-out infinite}
.bl-arrow.on{animation-duration:1.7s}
@keyframes blBreath{0%,100%{opacity:.32}50%{opacity:.95}}
.bl-comet{filter:url(#blRouteGlow)}
.bl-legend-chip{display:inline-flex;align-items:center;gap:5px}
.bl-legend-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
@media (prefers-reduced-motion: reduce){.bl-dash,.bl-star,.bl-ring-spin,.bl-arrow{animation:none}}
.bl-rail-sec{margin-top:10px;padding-top:10px;border-top:1px solid var(--bl-line);display:flex;flex-direction:column;gap:2px}
.bl-rail-sech{padding:0 10px 6px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6d87a0}
.bl-rail-cat{height:32px;font-size:12px;padding:0 10px}
.bl-rail-cat svg{opacity:.7}
.bl-rail-cat.on svg{opacity:1}
.bl-rail-cat.on::after{display:none}
.bl-rail-cat.on{background:rgba(92,200,255,.1);border-color:rgba(92,200,255,.22);font-weight:600}
.bl-course-cta{gap:8px}
.bl-cta-main{position:relative;height:44px;border:0;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:.06em;color:#f2fbff;
background:linear-gradient(180deg,#3fa9ff,#1d6fc0 62%,#155a9f);box-shadow:0 0 24px rgba(45,140,235,.55),inset 0 1px 0 rgba(200,240,255,.5);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.bl-cta-main:hover{background:linear-gradient(180deg,#57bcff,#2484dc 62%,#1a68b4)}
.bl-cta-sub{height:36px;border-radius:9px;border:1px solid rgba(120,200,255,.45);background:rgba(10,28,48,.7);color:#d3ebff;font-size:12.5px;font-weight:600;letter-spacing:.06em;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}

/* 任务行 */
.bl-tasks{display:flex;flex-direction:column;gap:9px}
.bl-task{display:grid;grid-template-columns:52px minmax(0,1fr) auto auto;align-items:center;gap:14px;padding:11px 14px;
border:1px solid var(--bl-line);border-radius:12px;background:linear-gradient(90deg,rgba(14,32,54,.86),rgba(7,16,28,.9));transition:border-color .15s,background .15s}
.bl-task:hover{border-color:var(--bl-line-2);background:linear-gradient(90deg,rgba(20,44,72,.9),rgba(8,18,32,.92))}
.bl-task.done{opacity:.62}
.bl-medal{position:relative;flex:none;width:52px;height:52px;display:flex;align-items:center;justify-content:center;
clip-path:polygon(50% 0,95% 25%,95% 75%,50% 100%,5% 75%,5% 25%);
background:linear-gradient(160deg,rgba(58,140,220,.9),rgba(10,34,60,.95));box-shadow:inset 0 0 0 1px rgba(160,220,255,.35)}
.bl-medal.gold{background:linear-gradient(160deg,rgba(220,150,40,.95),rgba(70,40,10,.95));box-shadow:inset 0 0 0 1px rgba(255,220,150,.5)}
.bl-medal.gray{background:linear-gradient(160deg,rgba(48,66,88,.9),rgba(18,26,38,.95));box-shadow:inset 0 0 0 1px rgba(120,150,180,.25)}
.bl-medal span{font-size:19px;color:#eaf7ff;text-shadow:0 0 12px rgba(140,215,255,.8)}
.bl-medal.gold span{color:#ffe4b0;text-shadow:0 0 12px rgba(255,190,90,.85)}
.bl-task-main{display:flex;flex-direction:column;gap:4px;min-width:0}
.bl-task-title{font-size:13px;font-weight:600;color:#e9f4ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-task-sub{font-size:10.5px;color:#8ba4bd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-task-prog{display:flex;align-items:center;gap:8px;font-size:10px;color:#7d95ad;min-width:120px}
.bl-task-reward{display:flex;gap:6px}

/* 底部四卡 */
.bl-bottom{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.bl-mcard{border:1px solid var(--bl-line);border-radius:12px;background:linear-gradient(180deg,rgba(12,26,44,.9),rgba(6,14,26,.94));padding:11px 13px;display:flex;flex-direction:column;gap:9px;min-width:0}
.bl-mcard-head{display:flex;align-items:center;gap:6px;font-size:11px;color:#c2d8ec;font-weight:600;letter-spacing:.02em}
.bl-mcard-head svg{color:var(--bl-cyan-2);opacity:.9}
.bl-mcard-big{display:flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums}
.bl-mcard-big b{font-size:20px;font-weight:700;color:#eaf4ff}
.bl-mcard-big em{font-style:normal;font-size:10.5px;color:#7d95ad}
.bl-bars{height:38px;gap:6px}
.bl-dotcell{display:flex;flex-direction:column;align-items:center;gap:4px}
.bl-dotcell span{font-size:8.5px;color:#657e95;font-variant-numeric:tabular-nums}
.bl-dotcell:nth-child(7) span{color:#8fd8ff}
.bl-dotcell i{width:13px;height:13px;border-radius:4px;background:rgba(140,176,210,.14);border:1px solid rgba(140,176,210,.22)}
.bl-dotcell i.on{background:rgba(92,200,255,.82);border-color:rgba(140,215,255,.9);box-shadow:0 0 8px rgba(92,200,255,.45)}
.bl-hexmed{clip-path:polygon(26% 2%,74% 2%,100% 50%,74% 98%,26% 98%,0 50%);border-radius:0}
.bl-bars i{background:linear-gradient(180deg,rgba(120,200,255,.85),rgba(40,110,190,.35));border-radius:2px}
.bl-bars i.on{background:linear-gradient(180deg,#8fe0ff,#2f8fe0);box-shadow:0 0 10px rgba(90,190,255,.55)}

/* 奖励页：六边形勋章墙 */
.bl-hexgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
.bl-hero>.bl-panelx{display:flex;flex-direction:column;min-height:0}
.bl-hero>.bl-panelx>.bl-hexgrid{flex:1;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(78px,1fr);gap:10px;align-content:stretch}
.bl-hero>.bl-panelx>.bl-hexgrid .bl-hex{justify-content:center}
.bl-hero>.bl-panelx>.bl-hexgrid .bl-hex-shield{width:62px;height:62px}
.bl-hex{appearance:none;position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 6px 10px;border:1px solid var(--bl-line);border-radius:12px;background:rgba(8,20,36,.72);font:inherit;color:inherit;cursor:pointer}
.bl-hex:hover{border-color:var(--bl-line-2);background:rgba(16,36,60,.8)}
.bl-hex.on{border-color:rgba(120,200,255,.7);background:linear-gradient(180deg,rgba(40,100,170,.5),rgba(10,26,44,.9));box-shadow:0 0 20px rgba(50,140,220,.28)}
.bl-hex-shield{position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;clip-path:polygon(50% 0,95% 25%,95% 75%,50% 100%,5% 75%,5% 25%)}
.bl-hex-shield span{font-size:20px}
.bl-hex-name{font-size:10.5px;color:#c5d9ec;text-align:center;line-height:1.3}
.bl-hex.locked .bl-hex-name{color:#6b8299}
.bl-hex-shield.common{background:linear-gradient(160deg,rgba(70,120,175,.9),rgba(14,30,50,.95));box-shadow:inset 0 0 0 1px rgba(150,200,240,.3)}
.bl-hex-shield.rare{background:linear-gradient(160deg,rgba(60,150,255,.95),rgba(12,38,74,.95));box-shadow:inset 0 0 0 1px rgba(170,225,255,.45),0 0 16px rgba(60,160,255,.35)}
.bl-hex-shield.epic{background:linear-gradient(160deg,rgba(225,160,45,.95),rgba(72,42,8,.95));box-shadow:inset 0 0 0 1px rgba(255,225,160,.55),0 0 18px rgba(240,180,60,.4)}
.bl-hex-shield.locked{background:linear-gradient(160deg,rgba(40,54,72,.9),rgba(12,18,28,.95));box-shadow:inset 0 0 0 1px rgba(110,140,170,.2);filter:grayscale(.6)}
.bl-reward-detail{display:flex;flex-direction:column;gap:10px;padding:4px 2px}
.bl-hex-big{width:98px;height:98px;margin:2px auto 0;display:flex;align-items:center;justify-content:center;clip-path:polygon(50% 0,95% 25%,95% 75%,50% 100%,5% 75%,5% 25%)}
.bl-hex-big span{font-size:40px}

/* v5 视觉细节 */
.bl-map{display:flex;flex-direction:column;justify-content:center;min-height:0;
 background:
   radial-gradient(150% 95% at 50% 0%,rgba(24,56,92,.62),rgba(5,10,18,.95)),
   repeating-linear-gradient(0deg,rgba(120,190,255,.032) 0 1px,transparent 1px 36px),
   repeating-linear-gradient(90deg,rgba(120,190,255,.032) 0 1px,transparent 1px 36px)}
.bl-map svg{width:100%;height:auto;max-height:100%}
.bl-planet-label{font-size:12.5px}
/* v6 成就展厅 */
.bl-wall-top{display:grid;grid-template-columns:112px minmax(0,1fr);gap:14px;align-items:center;padding:2px 2px 12px;border-bottom:1px solid var(--bl-line);margin-bottom:12px}
.bl-wall-meta{display:flex;flex-direction:column;gap:7px;min-width:0}
.bl-wall-rank{font-size:13.5px;font-weight:600;color:#eaf6ff}
.bl-wall-bars{display:flex;flex-wrap:wrap;gap:6px}
.bl-nucleus{display:grid;grid-template-columns:196px minmax(0,1fr);gap:16px;align-items:start}
.bl-nucleus-ring{position:relative;width:112px;height:112px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:conic-gradient(from -90deg,#3fa9ff var(--p,0%),rgba(84,124,164,.16) 0)}
.bl-nucleus-ring::before{content:"";position:absolute;inset:11px;border-radius:50%;background:radial-gradient(circle at 50% 30%,rgba(26,58,94,.96),rgba(6,14,24,.98));box-shadow:inset 0 0 26px rgba(60,150,230,.28)}
.bl-nucleus-ring>*{position:relative;z-index:1}
.bl-nucleus-ring b{font-size:22px;font-weight:700;color:#eaf6ff;font-variant-numeric:tabular-nums;line-height:1.05}
.bl-nucleus-ring b em{font-style:normal;font-size:13px;color:#8fb2cd;font-weight:500}
.bl-nucleus-ring span{font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:#7d95ad}
.bl-nucleus-ring i{font-style:normal;margin-top:6px;padding:3px 9px;border-radius:8px;font-size:10.5px;color:#ffd58a;border:1px solid rgba(245,179,51,.4);background:rgba(245,179,51,.1)}
.bl-hex-count{position:absolute;top:6px;right:8px;font-size:10px;color:#9fe0ff;font-variant-numeric:tabular-nums}
.bl-hex-big.common{background:linear-gradient(160deg,rgba(70,120,175,.9),rgba(14,30,50,.95));box-shadow:inset 0 0 0 1px rgba(150,200,240,.3)}
.bl-hex-big.rare{background:linear-gradient(160deg,rgba(60,150,255,.95),rgba(12,38,74,.95));box-shadow:inset 0 0 0 1px rgba(170,225,255,.45),0 0 16px rgba(60,160,255,.35)}
.bl-hex-big.epic{background:linear-gradient(160deg,rgba(225,160,45,.95),rgba(72,42,8,.95));box-shadow:inset 0 0 0 1px rgba(255,225,160,.55),0 0 18px rgba(240,180,60,.4)}
.bl-hex-big.locked{background:linear-gradient(160deg,rgba(40,54,72,.9),rgba(12,18,28,.95));box-shadow:inset 0 0 0 1px rgba(110,140,170,.2);filter:grayscale(.6)}
.bl-detail-name{font-size:17px;font-weight:700;color:#eef7ff;letter-spacing:.02em;text-align:center}
.bl-detail-rows{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border:1px solid var(--bl-line);border-radius:10px;background:rgba(8,20,36,.6)}
.bl-detail-row{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#8ba4bd}
.bl-detail-row b{color:#dcecf9;font-weight:600;font-variant-numeric:tabular-nums}
.bl-next{padding:10px 12px;border:1px solid var(--bl-line);border-radius:10px;background:rgba(8,20,36,.6);display:flex;flex-direction:column;gap:7px}
.bl-next-top{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#8ba4bd}
.bl-next-top b{color:#dcecf9;font-weight:600}
.bl-bottom3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
/* v7 自适应（面板较窄时） */
.bl-root{container-type:inline-size}
.bl-hero{align-items:stretch}


.bl-map svg{width:100%;height:100%;flex:1;min-height:0}
@container (max-width: 760px){
  .bl-shell{grid-template-columns:minmax(0,1fr)}
  .bl-rail{flex-direction:row;flex-wrap:wrap;gap:6px;padding:10px;border-right:0;border-bottom:1px solid var(--bl-line);align-items:center}
  .bl-rail-brand{padding:0 8px 0 0;margin:0;border-bottom:0;border-right:1px solid var(--bl-line);height:32px}
  .bl-rail-item{height:32px;padding:0 9px}
  .bl-rail-item.on::after{display:none}
  .bl-rail-foot{margin:0;padding:0;display:flex;gap:10px;align-items:center}
  .bl-rail-foot .bl-xp{min-width:120px}
  .bl-hud-strip{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .bl-hero{grid-template-columns:minmax(0,1fr)}
  .bl-nucleus{grid-template-columns:minmax(0,1fr)}
  .bl-bottom,.bl-bottom3{grid-template-columns:repeat(2,minmax(0,1fr))}
}
/* 线性图标着色 */
.bl-glyph{display:block}
.bl-station-glyph{color:#f2f9ff;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
.bl-medal svg{color:#dff1ff}
.bl-medal.gold svg{color:#ffe6b8}
.bl-sticker-glyph{color:#8ee6ff}
.bl-sticker.locked .bl-sticker-glyph{opacity:.42}
.bl-hex-shield svg{color:#a9dcff}
.bl-hex-shield.locked svg{color:#7f97ad;opacity:.55}
.bl-hex-big svg{color:#ffe2ae}
.bl-hex-big.locked svg{color:#8aa0b6;opacity:.5}
@container (max-width: 520px){
  .bl-hud-strip{grid-template-columns:minmax(0,1fr)!important}
  .bl-bottom,.bl-bottom3{grid-template-columns:minmax(0,1fr)}
}


.bl-mcard .bl-draws .bl-draw-row{padding:4px 0}

/* ---- 舰桥页面骨架：六页统一标题/指标/卡片 ---- */
.bl-pagehead{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;padding:1px 2px 13px;margin-bottom:15px;border-bottom:1px solid var(--bl-line)}
.bl-phleft{min-width:0}
.bl-kicker{font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;font-weight:700;color:rgba(140,196,236,.66)}
.bl-h1{margin:6px 0 0;font-size:19px;line-height:1.25;font-weight:650;color:#eaf4ff;letter-spacing:.01em}
.bl-sub{margin-top:6px;font-size:12px;color:rgba(176,200,222,.7);max-width:62ch}
.bl-phright{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
.bl-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.bl-kpi{min-width:0;padding:11px 13px;border:1px solid var(--bl-line);border-radius:var(--bl-r);background:rgba(12,26,40,.58)}
.bl-kpi-label{display:block;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:rgba(150,180,206,.64)}
.bl-kpi-val{display:flex;align-items:baseline;gap:5px;margin-top:7px;font-variant-numeric:tabular-nums}
.bl-kpi-val b{font-size:21px;font-weight:650;color:#eef7ff;line-height:1.1}
.bl-kpi-val em{font-style:normal;font-size:11px;color:rgba(160,190,214,.76)}
.bl-kpi-foot{margin-top:5px;font-size:11px;color:rgba(160,190,214,.6)}
.bl-kpi.cyan .bl-kpi-val b{color:var(--bl-cyan)}
.bl-kpi.gold .bl-kpi-val b{color:var(--bl-gold)}
.bl-kpi.green .bl-kpi-val b{color:var(--bl-green)}
.bl-thumb{width:76px;height:46px;flex:none;border-radius:6px;overflow:hidden;background:#03060c;border:1px solid rgba(140,176,210,.18)}
.bl-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.bl-thumb .bl-mini-ph{font-size:10px;color:#6f879c}
.bl-split{gap:14px}
.bl-list{background:rgba(10,22,34,.6)!important;border-radius:var(--bl-r)}
.bl-list-item{padding:7px 9px;border-radius:7px}
.bl-list-item.on{background:rgba(92,200,255,.14);border-color:rgba(92,200,255,.34);box-shadow:none}
.bl-day{background:#0b1622!important}
.bl-day-head .bl-day-name{letter-spacing:.06em}
.bl-card{box-shadow:none}
.bl-catrow{display:grid;grid-template-columns:82px minmax(0,1fr) 56px;align-items:center;gap:9px;padding:5px 0;font-size:11.5px;color:rgba(190,212,232,.82)}
.bl-catrow b{font-weight:600;font-size:11.5px;color:#dbeaf8}
.bl-catbar{height:6px;border-radius:3px;background:rgba(140,176,210,.13);overflow:hidden}
.bl-catbar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#5cc8ff,#2f8fe0)}
.bl-catrow em{font-style:normal;text-align:right;font-size:11px;color:rgba(160,190,214,.7);font-variant-numeric:tabular-nums}
.bl-topcard{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:11.5px;color:rgba(190,212,232,.85);border-top:1px solid rgba(140,176,210,.1)}
.bl-topcard:first-child{border-top:0}
.bl-topcard em{margin-left:auto;font-style:normal;color:rgba(160,190,214,.7);font-variant-numeric:tabular-nums}
.bl-admin-list{display:flex;flex-direction:column;max-height:520px;overflow:auto;padding-right:2px}
.bl-prow{display:grid;grid-template-columns:44px minmax(110px,1fr) 148px 66px 72px 44px 40px;gap:6px;align-items:center;padding:5px 0;border-top:1px solid rgba(140,176,210,.1)}
.bl-prow:first-child{border-top:0}
.bl-prow .bl-input{height:28px;padding:0 8px;font-size:12px;min-width:0}
.bl-prow-emoji{text-align:center}
.bl-prow-on{display:flex;align-items:center;justify-content:center}
.bl-prow-head{font-size:10px;letter-spacing:.5px;color:rgba(160,190,214,.6);padding-bottom:6px;text-transform:uppercase}
.bl-prow-head span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl-prow-medal{grid-template-columns:32px minmax(110px,1fr) 72px 66px 138px 62px}
.bl-prow-glyph{display:flex;align-items:center;justify-content:center;color:#a9dcff}
.bl-prow-name{display:flex;flex-direction:column;gap:2px;min-width:0}
.bl-prow-name b{font-size:12.5px;color:#eaf7ff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-prow-name em{font-style:normal;font-size:10.5px;color:rgba(160,190,214,.66)}
.bl-hex-shield.earned{color:#ffe2ae}
@media (max-width:880px){.bl-prow{grid-template-columns:1fr 1fr;row-gap:4px}.bl-prow-head{display:none}.bl-prow-medal{grid-template-columns:30px minmax(90px,1fr) 64px 60px 120px 56px}}
@media (max-width:880px){.bl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
`


    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-bili-lesson]')) return
      const tag = document.createElement('style')
      tag.dataset.biliLesson = '1'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /* ------------------------------------------------------------------ */
    /* 侧栏图标                                                            */
    /* ------------------------------------------------------------------ */

    function LessonIcon(props) {
      const size = (props && props.size) || 18
      return h('svg', {
        'data-dsh-panel-entry': PANEL,
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        children: [
          h('rect', { key: 'screen', x: 2.5, y: 4.5, width: 19, height: 12, rx: 2 }),
          h('path', { key: 'play', d: 'M10.2 8.2l4.2 2.9-4.2 2.9z' }),
          h('path', { key: 'stand', d: 'M12 16.5v3M8.5 21h7' }),
        ],
      })
    }

    /* ------------------------------------------------------------------ */
    /* 页面                                                                */
    /* ------------------------------------------------------------------ */

    function BiliPanel() {
      const [tab, setTab] = useState('library')
      const [homeView, setHomeView] = useState('route')
      const [rewardPick, setRewardPick] = useState('')
      const [library, setLibrary] = useState({ items: [], categories: [], stats: { total: 0, dead: 0 } })
      const [allVideos, setAllVideos] = useState([])
      const [q, setQ] = useState('')
      const [category, setCategory] = useState('')
      const [searching, setSearching] = useState(false)
      const [addForm, setAddForm] = useState({ value: '', category: '', minAge: '', reason: '' })
      const [adding, setAdding] = useState(false)
      const [refreshing, setRefreshing] = useState(false)
      const [editing, setEditing] = useState(null)
      const [player, setPlayer] = useState(null)
      const [plan, setPlan] = useState(null)
      const [planById, setPlanById] = useState({})
      const [planDirty, setPlanDirty] = useState(false)
      const [planBusy, setPlanBusy] = useState(false)
      const [watch, setWatch] = useState({ records: [], summary: { byDate: {} } })
      const [lessons, setLessons] = useState([])
      const [lessonVideo, setLessonVideo] = useState('')
      const [lessonDraft, setLessonDraft] = useState(null)
      const [lessonBusy, setLessonBusy] = useState(false)
      const [learnPick, setLearnPick] = useState('')
      const [learnPicks, setLearnPicks] = useState({})
      const [learnOutcome, setLearnOutcome] = useState(null)
      const [learnBusy, setLearnBusy] = useState(false)
      const [rewards, setRewards] = useState(null)
      const [rewardBusy, setRewardBusy] = useState(false)
      const [lastDraw, setLastDraw] = useState(null)
      const [prizes, setPrizes] = useState(null)
      const [medalBook, setMedalBook] = useState(null)
      const [medalPick, setMedalPick] = useState('')
      const [confView, setConfView] = useState('base')
      const [prizeDraft, setPrizeDraft] = useState(null)
      const [medalDraft, setMedalDraft] = useState(null)
      const [adminBusy, setAdminBusy] = useState(false)
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      const [settingsBusy, setSettingsBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')

      const noticeTimer = useRef(null)
      const filterRef = useRef({ q: '', category: '' })
      const mapSvgRef = useRef(null)
      const [mapBox, setMapBox] = useState({ w: 0, h: 0 })

      const fail = useCallback((e) => {
        setError(errorText(e))
      }, [])

      const flash = useCallback((text) => {
        setNotice(text)
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(''), 3200)
      }, [])

      useEffect(() => {
        ensureCss()
        return () => {
          if (noticeTimer.current) clearTimeout(noticeTimer.current)
        }
      }, [])

      useEffect(() => {
        function onKey(event) {
          if (event.key !== 'Escape') return
          setPlayer(null)
          setEditing(null)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])

      /* ---------------- 片库加载 ---------------- */

      const loadLibrary = useCallback(async (keyword, cat) => {
        const params = new URLSearchParams()
        if (keyword) params.set('q', keyword)
        if (cat) params.set('category', cat)
        const suffix = params.toString() ? '?' + params.toString() : ''
        const data = await api('/videos' + suffix)
        setLibrary({
          items: Array.isArray(data.items) ? data.items : [],
          categories: Array.isArray(data.categories) ? data.categories : [],
          stats: data.stats && typeof data.stats === 'object' ? data.stats : { total: 0, dead: 0 },
        })
      }, [])

      const loadAllVideos = useCallback(async () => {
        const data = await api('/videos?includeDead=1')
        setAllVideos(Array.isArray(data.items) ? data.items : [])
      }, [])

      const reloadVideos = useCallback(async () => {
        const filter = filterRef.current
        const results = await Promise.allSettled([loadAllVideos(), loadLibrary(filter.q, filter.category)])
        const failed = results.find((r) => r.status === 'rejected')
        if (failed) fail(failed.reason)
      }, [fail, loadAllVideos, loadLibrary])

      useEffect(() => {
        filterRef.current = { q: q.trim(), category }
        let alive = true
        setSearching(true)
        const timer = setTimeout(() => {
          loadLibrary(q.trim(), category)
            .catch((e) => { if (alive) fail(e) })
            .finally(() => { if (alive) setSearching(false) })
        }, 240)
        return () => { alive = false; clearTimeout(timer) }
      }, [q, category, loadLibrary, fail])

      /* ---------------- 初始加载 ---------------- */

      useEffect(() => {
        loadAllVideos().catch(fail)
        const today = isoOf(new Date())
        const from = addDays(today, -13)

        api('/plan')
          .then((d) => {
            setPlan(d.plan || null)
            setPlanById(d.byId && typeof d.byId === 'object' ? d.byId : {})
            setPlanDirty(false)
          })
          .catch(fail)

        api('/watch?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(today))
          .then((d) => setWatch(normalizeWatch(d)))
          .catch(fail)

        api('/lessons')
          .then((d) => setLessons(Array.isArray(d.items) ? d.items : []))
          .catch(fail)

        api('/settings')
          .then((d) => setSettings(normalizeSettings(d.settings || d)))
          .catch(fail)
      }, [fail, loadAllVideos])

      /* ---------------- 派生数据 ---------------- */

      const today = isoOf(new Date())

      const byId = useMemo(() => {
        const map = {}
        allVideos.forEach((v) => { if (v && v.id) map[v.id] = v })
        return map
      }, [allVideos])

      const pick = useCallback((id) => planById[id] || byId[id] || null, [planById, byId])

      const watchIndex = useMemo(() => {
        const byDate = {}
        const set = new Set()
        ;(watch.records || []).forEach((r) => {
          if (!r || !r.done || !r.videoId || !r.date) return
          if (!byDate[r.date]) byDate[r.date] = []
          if (byDate[r.date].indexOf(r.videoId) === -1) byDate[r.date].push(r.videoId)
          set.add(r.date + '|' + r.videoId)
        })
        return { byDate, set }
      }, [watch.records])

      const weekStart = plan && plan.weekStart ? plan.weekStart : mondayOf(today)

      const weekCount = useMemo(() => {
        const from = mondayOf(today)
        const to = addDays(from, 6)
        return (watch.records || []).filter((r) => r && r.done && r.date >= from && r.date <= to).length
      }, [watch.records, today])

      const streak = useMemo(() => streakOf(watchIndex.byDate), [watchIndex.byDate])
      const weekTasks = useMemo(() => (plan && plan.days ? plan.days : []).reduce((n, d) => n + (d.videoIds || []).length, 0), [plan])
      const weekDone = useMemo(() => (plan && plan.days ? plan.days : []).reduce((n, d) => {
        const done = (watchIndex.byDate[d.date] || []).filter((id) => (d.videoIds || []).indexOf(id) !== -1).length
        return n + done
      }, 0), [plan, watchIndex.byDate])
      const weekRatio = weekTasks ? Math.min(1, weekDone / weekTasks) : 0
      const doneTotal = useMemo(() => Object.values(watchIndex.byDate).reduce((sum, list) => sum + list.length, 0), [watchIndex.byDate])

      const planOptions = useCallback((skipId) => {
        return allVideos
          .filter((v) => !v.dead && v.id !== skipId)
          .map((v) => h('option', { key: v.id, value: v.id }, v.title || v.id))
      }, [allVideos])

      /* ---------------- 片库操作 ---------------- */

      async function addVideo() {
        const raw = addForm.value.trim()
        if (!raw) {
          setError('先把 BV 号或者 B 站链接粘到输入框里')
          return
        }
        setError('')
        setAdding(true)
        try {
          const payload = addBody(raw)
          if (addForm.category.trim()) payload.category = addForm.category.trim()
          if (addForm.reason.trim()) payload.reason = addForm.reason.trim()
          payload.minAge = Number(addForm.minAge) || Number(settings.maxAge) || 3
          const data = await send('/videos', 'POST', payload)
          const item = data.item
          setAddForm({ value: '', category: '', minAge: '', reason: '' })
          flash(item ? '已加入片库：' + (item.title || item.bvid || '这条') : '已加入片库')
          await reloadVideos()
        } catch (e) {
          fail(e)
        } finally {
          setAdding(false)
        }
      }

      async function saveVideoEdit() {
        if (!editing) return
        const draft = editing.draft
        setError('')
        try {
          const payload = {
            category: draft.category.trim(),
            minAge: Number(draft.minAge) || 3,
            reason: draft.reason.trim(),
            caution: draft.caution.trim(),
            note: draft.note.trim(),
          }
          if (draft.title.trim()) payload.title = draft.title.trim()
          const data = await send('/videos/' + encodeURIComponent(draft.id), 'PATCH', payload)
          if (!data.item) throw new Error('服务端没回这条片子的新内容')
          setEditing(null)
          flash('这条改好了')
          await reloadVideos()
        } catch (e) {
          fail(e)
        }
      }

      async function deleteVideo() {
        if (!editing) return
        const draft = editing.draft
        const label = draft.title || draft.id
        if (!window.confirm('「' + label + '」会从片库删掉，排好的计划和记录里也会一起消失。确定？')) return
        setError('')
        try {
          await send('/videos/' + encodeURIComponent(draft.id), 'DELETE')
          setEditing(null)
          flash('已删掉这条')
          await reloadVideos()
        } catch (e) {
          fail(e)
        }
      }

      async function refreshDead() {
        setError('')
        setRefreshing(true)
        try {
          const data = await send('/videos/refresh', 'POST')
          const checked = Number(data.checked) || 0
          const dead = Array.isArray(data.dead) ? data.dead : []
          flash(dead.length
            ? '校验了 ' + checked + ' 条，' + dead.length + ' 条在 B 站已经失效'
            : '校验了 ' + checked + ' 条，都还活着')
          await reloadVideos()
        } catch (e) {
          fail(e)
        } finally {
          setRefreshing(false)
        }
      }

      function startEdit(v) {
        setEditing({
          id: v.id,
          draft: {
            id: v.id,
            title: v.title || '',
            category: v.category || '',
            minAge: String(v.minAge || ''),
            reason: v.reason || '',
            caution: v.caution || '',
            note: v.note || '',
            cover: v.cover || '',
            dead: Boolean(v.dead),
            bvid: v.bvid || v.id,
          },
        })
      }

      /* ---------------- 本周操作 ---------------- */

      function mapDay(date, fn) {
        setPlan((prev) => {
          if (!prev) return prev
          const days = (Array.isArray(prev.days) ? prev.days : []).map((day) => (day.date === date ? fn(day) : day))
          return { ...prev, days }
        })
      }

      function replaceSlot(date, index, videoId) {
        mapDay(date, (day) => {
          const ids = (day.videoIds || []).slice()
          ids[index] = videoId
          return { ...day, videoIds: ids }
        })
        setPlanDirty(true)
      }

      function removeSlot(date, index) {
        mapDay(date, (day) => {
          const ids = (day.videoIds || []).slice()
          ids.splice(index, 1)
          return { ...day, videoIds: ids }
        })
        setPlanDirty(true)
      }

      function addSlot(date, videoId) {
        mapDay(date, (day) => {
          const ids = (day.videoIds || []).slice()
          if (ids.indexOf(videoId) !== -1) return day
          ids.push(videoId)
          return { ...day, videoIds: ids }
        })
        setPlanDirty(true)
      }

      async function savePlan() {
        if (!plan) return
        setError('')
        setPlanBusy(true)
        try {
          const days = (Array.isArray(plan.days) ? plan.days : []).map((day) => ({
            date: day.date,
            videoIds: (day.videoIds || []).slice(),
          }))
          const data = await send('/plan', 'PUT', { weekStart: plan.weekStart || weekStart, days })
          if (data.plan) setPlan(data.plan)
          setPlanDirty(false)
          flash('本周计划已保存')
        } catch (e) {
          fail(e)
        } finally {
          setPlanBusy(false)
        }
      }

      async function autoPlan() {
        setError('')
        setPlanBusy(true)
        try {
          const perDay = Number(plan && plan.perDay) || Number(settings.perDay) || 2
          await send('/plan/auto', 'POST', { weekStart, perDay })
          const data = await api('/plan?weekStart=' + encodeURIComponent(weekStart))
          setPlan(data.plan || null)
          setPlanById(data.byId && typeof data.byId === 'object' ? data.byId : {})
          setPlanDirty(false)
          flash('按分类轮转排好了，想调就点「换一条」')
        } catch (e) {
          fail(e)
        } finally {
          setPlanBusy(false)
        }
      }

      async function toggleDone(videoId, date, done) {
        setError('')
        try {
          const data = await send('/watch', 'POST', { videoId, date, done })
          setWatch((prev) => mergeWatch(prev, data))
          loadRewards().catch(() => {})
        } catch (e) {
          fail(e)
        }
      }

      /* ---------------- 课卡操作 ---------------- */

      function openLesson(videoId) {
        const existing = lessons.find((l) => l.videoId === videoId)
        setLessonVideo(videoId)
        setLessonDraft(existing ? draftOf(existing) : blankDraft(videoId))
      }

      function setDraftField(patch) {
        setLessonDraft((d) => (d ? { ...d, ...patch } : d))
      }

      function patchQuestion(qi, patch) {
        setLessonDraft((d) => {
          if (!d) return d
          const questions = d.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q))
          return { ...d, questions }
        })
      }

      function addQuestion() {
        setLessonDraft((d) => {
          if (!d || d.questions.length >= 5) return d
          return { ...d, questions: d.questions.concat([blankQuestion(d.questions.length)]) }
        })
      }

      function removeQuestion(qi) {
        setLessonDraft((d) => {
          if (!d || d.questions.length <= 3) return d
          const questions = d.questions
            .filter((_, i) => i !== qi)
            .map((q, i) => ({ ...q, variant: i + 1 }))
          return { ...d, questions }
        })
      }

      function addOption(qi) {
        setLessonDraft((d) => {
          if (!d) return d
          const questions = d.questions.map((q, i) => {
            if (i !== qi || q.options.length >= 4) return q
            return { ...q, options: q.options.concat(['']) }
          })
          return { ...d, questions }
        })
      }

      function removeOption(qi, oi) {
        setLessonDraft((d) => {
          if (!d) return d
          const questions = d.questions.map((q, i) => {
            if (i !== qi || q.options.length <= 3) return q
            const options = q.options.slice()
            options.splice(oi, 1)
            let answer = Number(q.answer) || 0
            if (answer === oi) answer = 0
            else if (answer > oi) answer -= 1
            if (answer > options.length - 1) answer = options.length - 1
            return { ...q, options, answer }
          })
          return { ...d, questions }
        })
      }

      function validateDraft(draft) {
        if (!draft.videoId) return '先从左栏选一条视频'
        if (!draft.topic.trim()) return '课卡主题还没写，比如「认识红色」'
        const questions = draft.questions || []
        if (questions.length < 3 || questions.length > 5) return '题目要 3 到 5 道，现在 ' + questions.length + ' 道'
        for (let i = 0; i < questions.length; i += 1) {
          const question = questions[i]
          if (!String(question.prompt || '').trim()) return '第 ' + (i + 1) + ' 题还没写题干'
          if (!Array.isArray(question.options) || question.options.length < 3 || question.options.length > 4) {
            return '第 ' + (i + 1) + ' 题要 3 到 4 个选项'
          }
          const blank = question.options.findIndex((o) => !String(o || '').trim())
          if (blank !== -1) return '第 ' + (i + 1) + ' 题第 ' + (blank + 1) + ' 个选项还空着'
          const answer = Number(question.answer)
          if (!(answer >= 0 && answer < question.options.length)) return '第 ' + (i + 1) + ' 题还没选正确项'
        }
        return ''
      }

      async function saveLesson() {
        const draft = lessonDraft
        if (!draft) return
        const problem = validateDraft(draft)
        if (problem) {
          setError(problem)
          return
        }
        setError('')
        setLessonBusy(true)
        try {
          const questions = draft.questions.map((q, i) => ({
            id: q.id,
            prompt: q.prompt.trim(),
            spokenPrompt: q.spokenPrompt.trim(),
            options: q.options.map((o) => o.trim()),
            answer: Number(q.answer) || 0,
            hint: q.hint.trim(),
            explanation: q.explanation.trim(),
            difficulty: Number(q.difficulty) || 1,
            variant: Number(q.variant) || i + 1,
            mode: 'choice',
          }))
          const topic = draft.topic.trim()
          const data = draft.id
            ? await send('/lessons/' + encodeURIComponent(draft.id), 'PATCH', { topic, questions })
            : await send('/lessons', 'POST', { videoId: draft.videoId, topic, questions })
          const item = data.item
          if (!item) throw new Error('服务端没回课卡内容')
          setLessons((prev) => prev.filter((l) => l.id !== item.id).concat([item]))
          setLessonDraft(draftOf(item))
          flash(draft.id ? '课卡改好了' : '课卡建好了')
        } catch (e) {
          fail(e)
        } finally {
          setLessonBusy(false)
        }
      }

      async function deleteLesson() {
        const draft = lessonDraft
        if (!draft || !draft.id) return
        if (!window.confirm('这套课卡会从服务端删掉，视频本身还在片库。确定？')) return
        setError('')
        try {
          await send('/lessons/' + encodeURIComponent(draft.id), 'DELETE')
          setLessons((prev) => prev.filter((l) => l.id !== draft.id))
          setLessonDraft(blankDraft(draft.videoId))
          flash('课卡已删，这条视频回到待写')
        } catch (e) {
          fail(e)
        }
      }

      /* ---------------- 设置操作 ---------------- */

      async function saveSettings() {
        setError('')
        setSettingsBusy(true)
        try {
          const payload = {
            perDay: Number(settings.perDay) || DEFAULT_SETTINGS.perDay,
            maxAge: Number(settings.maxAge) || DEFAULT_SETTINGS.maxAge,
            embedPlay: Boolean(settings.embedPlay),
            weeklyBoxLimit: Number(settings.weeklyBoxLimit) || 0,
          }
          const data = await send('/settings', 'PUT', payload)
          setSettings(normalizeSettings(data.settings || data))
          loadRewards().catch(() => {})
          if (prizes) loadPrizes().catch(() => {})
          flash('设置已保存')
        } catch (e) {
          fail(e)
        } finally {
          setSettingsBusy(false)
        }
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：片库                                                          */
      /* ------------------------------------------------------------------ */

      function pageHead(kicker, title, sub, right) {
        return h('div', { key: 'ph', className: 'bl-pagehead' }, [
          h('div', { key: 'l', className: 'bl-phleft' }, [
            h('div', { key: 'k', className: 'bl-kicker' }, kicker),
            h('h1', { key: 't', className: 'bl-h1' }, title),
            sub ? h('div', { key: 's', className: 'bl-sub' }, sub) : null,
          ]),
          h('div', { key: 'r', className: 'bl-phright' }, right || []),
        ])
      }

      function kpi(key, label, value, unit, foot, tone) {
        return h('div', { key, className: 'bl-kpi' + (tone ? ' ' + tone : '') }, [
          h('span', { key: 'l', className: 'bl-kpi-label' }, label),
          h('div', { key: 'v', className: 'bl-kpi-val' },
            [h('b', { key: 'b' }, String(value))].concat(unit ? [h('em', { key: 'u' }, unit)] : [])),
          foot ? h('div', { key: 'f', className: 'bl-kpi-foot' }, foot) : null,
        ])
      }

      function sec(key, title, sub, right) {
        const head = h('h2', { key: 't' }, [title].concat(sub ? [h('em', { key: 'e' }, sub)] : []))
        return h('div', { key, className: 'bl-sec' },
          [head, h('div', { key: 'sp', className: 'bl-spacer' })].concat(right ? (Array.isArray(right) ? right : [right]) : []))
      }

      useEffect(() => {
        const el = mapSvgRef.current
        if (!el || typeof ResizeObserver === 'undefined') return undefined
        const apply = () => {
          const r = el.getBoundingClientRect()
          if (!r.width || !r.height) return
          setMapBox((prev) => (Math.abs(prev.w - r.width) > 1 || Math.abs(prev.h - r.height) > 1 ? { w: r.width, h: r.height } : prev))
        }
        apply()
        const ro = new ResizeObserver(apply)
        ro.observe(el)
        return () => ro.disconnect()
      }, [tab, homeView, library.categories])

      function renderCard(v) {
        const cover = coverUrl(v.cover)
        return h('div', { key: v.id, className: 'bl-card' + (v.dead ? ' dead' : '') }, [
          h('div', {
            key: 'cover',
            className: 'bl-cover',
            onClick: () => setPlayer(v),
            title: '点开播放',
          }, [
            cover
              ? h('img', { key: 'img', src: cover, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' })
              : h('div', { key: 'ph', className: 'bl-cover-ph' }, '没有封面'),
            v.duration ? h('span', { key: 'dur', className: 'bl-dur' }, fmtDur(v.duration)) : null,
            v.dead ? h('span', { key: 'dead', className: 'bl-dead' }, '已失效') : null,
            h('span', { key: 'play', className: 'bl-play' }, '▶'),
          ]),
          h('div', { key: 'body', className: 'bl-card-body' }, [
            h('button', {
              key: 'title',
              className: 'bl-card-title',
              onClick: () => setPlayer(v),
              title: v.title || v.id,
            }, v.title || v.id),
            h('div', { key: 'meta', className: 'bl-card-meta' }, [
              h('span', { key: 'cat', className: 'bl-tag' }, v.category || '未分类'),
              h('span', { key: 'age', className: 'bl-tag bl-tag-age' }, v.minAge ? v.minAge + ' 岁+' : '年龄未设'),
              v.dead ? h('span', { key: 'd', className: 'bl-tag bl-tag-dead' }, 'B 站已失效') : null,
              v.owner ? h('span', { key: 'owner', className: 'bl-card-owner', title: v.owner }, v.owner) : null,
            ]),
            v.reason ? h('div', { key: 'reason', className: 'bl-card-reason', title: v.reason }, v.reason) : null,
            h('div', { key: 'foot', className: 'bl-card-foot' }, [
              h('span', { key: 'id', className: 'bl-card-id' }, v.id),
              h('div', { key: 'sp', className: 'bl-spacer' }),
              h('button', { key: 'edit', className: 'bl-btn bl-btn-sm', onClick: () => startEdit(v) }, '编辑'),
              h('a', { key: 'site', className: 'bl-btn bl-btn-sm', href: siteUrl(v.id), target: '_blank', rel: 'noreferrer' }, 'B 站'),
            ]),
          ]),
        ])
      }

      const PLANET_COLORS = ['#35d8ff', '#7ad7ff', '#ffc44d', '#37e0a0', '#9b8cff', '#ff8fb1', '#4ea8ff', '#a8e05f', '#ffb454']

      function renderStarMap() {
        const cats = (library.categories || []).filter(Boolean)
        const total = (library.stats && library.stats.total) || (library.items || []).length
        if (!cats.length) return null
        const counts = {}
        ;(library.items || []).forEach((v) => {
          const key = v.category || '未分类'
          counts[key] = (counts[key] || 0) + 1
        })
        const weekCount = (plan && plan.days ? plan.days : []).reduce((n, d) => n + (d.videoIds || []).length, 0)
        const W = Math.max(320, Math.round(mapBox.w || 1000))
        const H = Math.max(220, Math.round(mapBox.h || 470))
        const cx = Math.round(W / 2)
        const cy = Math.round(H / 2 - H * 0.03)
        const rx = Math.round(Math.max(80, W / 2 - 80))
        const ry = Math.round(Math.max(64, H / 2 - 96))
        const nodes = cats.map((name, i) => {
          const angle = -Math.PI / 2 + (i / cats.length) * Math.PI * 2
          return {
            name,
            color: PLANET_COLORS[i % PLANET_COLORS.length],
            count: counts[name] || 0,
            x: cx + Math.cos(angle) * rx,
            y: cy + Math.sin(angle) * ry,
            on: category === name,
          }
        })
        const defs = h('defs', { key: 'defs' }, [
          h('radialGradient', { key: 'hub', id: 'blHub' }, [
            h('stop', { key: 'a', offset: '0%', stopColor: '#fff6d8' }),
            h('stop', { key: 'b', offset: '45%', stopColor: '#ffc44d' }),
            h('stop', { key: 'c', offset: '100%', stopColor: 'rgba(255,150,20,.25)' }),
          ]),
          h('filter', { key: 'glow', id: 'blGlow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, [
            h('feGaussianBlur', { key: 'b', stdDeviation: '6', result: 'blur' }),
            h('feMerge', { key: 'm' }, [h('feMergeNode', { key: '1', in: 'blur' }), h('feMergeNode', { key: '2', in: 'SourceGraphic' })]),
          ]),
        ].concat(nodes.map((n, i) => h('radialGradient', { key: 'g' + i, id: 'blg' + i }, [
          h('stop', { key: 'a', offset: '18%', stopColor: '#ffffff', stopOpacity: '.95' }),
          h('stop', { key: 'b', offset: '62%', stopColor: n.color, stopOpacity: '.95' }),
          h('stop', { key: 'c', offset: '100%', stopColor: n.color, stopOpacity: '.25' }),
        ]))))
        const orbits = [
          h('ellipse', { key: 'o1', cx, cy, rx, ry, fill: 'none', stroke: 'rgba(96,176,255,.22)', strokeWidth: 1, strokeDasharray: '6 12' }),
          h('ellipse', { key: 'o2', cx, cy, rx: rx * 0.66, ry: ry * 0.66, fill: 'none', stroke: 'rgba(96,176,255,.14)', strokeWidth: 1, strokeDasharray: '3 10' }),
          h('ellipse', { key: 'o3', cx, cy, rx: rx * 0.34, ry: ry * 0.34, fill: 'none', stroke: 'rgba(255,196,77,.18)', strokeWidth: 1, strokeDasharray: '2 8' }),
        ]
        const spokes = nodes.map((n, i) => h('line', {
          key: 's' + i, x1: cx, y1: cy, x2: n.x, y2: n.y,
          stroke: n.on ? 'rgba(53,216,255,.55)' : 'rgba(96,176,255,.13)', strokeWidth: n.on ? 1.6 : 1,
        }))
        const hub = h('g', { key: 'hub', style: { cursor: 'pointer' }, onClick: () => setCategory('') }, [
          h('circle', { key: 'halo', cx, cy, r: 76, fill: 'rgba(243,179,76,.07)' }),
          h('circle', { key: 'ring', cx, cy, r: 58, fill: 'none', stroke: 'rgba(243,179,76,.5)', strokeWidth: 1, strokeDasharray: '5 7' }),
          h('circle', { key: 'body', cx, cy, r: 44, fill: 'rgba(243,179,76,.14)', stroke: 'rgba(243,179,76,.65)', strokeWidth: 1.2 }),
          h('text', { key: 't1', x: cx, y: cy + 2, textAnchor: 'middle', style: { fill: '#ffe3ad', fontWeight: 700, fontSize: '30px' } }, weekCount || 0),
          h('text', { key: 't2', x: cx, y: cy + 22, textAnchor: 'middle', style: { fill: '#c9a868', fontSize: '10.5px', letterSpacing: '.08em' } }, '本周任务'),

        ])
        const plate = (x, y, s, cut) => 'M' + (x + cut) + ',' + y + 'H' + (x + s - cut) + 'L' + (x + s) + ',' + (y + cut) + 'V' + (y + s - cut) + 'L' + (x + s - cut) + ',' + (y + s) + 'H' + (x + cut) + 'L' + x + ',' + (y + s - cut) + 'V' + (y + cut) + 'Z'
        const planets = nodes.map((n, i) => h('g', {
          key: n.name,
          className: 'bl-planet' + (n.on ? ' on' : ''),
          style: { cursor: 'pointer' },
          onClick: () => setCategory(category === n.name ? '' : n.name),
        }, [
          h('ellipse', { key: 'sh', cx: n.x, cy: n.y + 40, rx: 28, ry: 5, fill: 'rgba(0,0,0,.4)' }),
          h('path', { key: 'plate', d: plate(n.x - 34, n.y - 30, 68, 13), fill: n.on ? 'rgba(63,169,255,.24)' : 'rgba(9,22,38,.94)', stroke: n.on ? 'rgba(140,215,255,.95)' : 'rgba(94,162,226,.34)', strokeWidth: n.on ? 1.8 : 1.2 }),
          h('path', { key: 'inner', d: plate(n.x - 28, n.y - 24, 56, 11), fill: n.on ? 'rgba(30,80,130,.55)' : 'rgba(8,20,34,.92)', stroke: n.color, strokeOpacity: n.on ? 0.65 : 0.3, strokeWidth: 1 }),
          h(Glyph, { key: 'icon', name: catGlyph(n.name), x: n.x - 12, y: n.y - 19, width: 24, height: 24, sw: 1.85, className: 'bl-station-glyph', style: { color: n.color } }),
          h('text', { key: 'name', x: n.x, y: n.y + 19, textAnchor: 'middle', style: { fill: n.on ? '#ffffff' : '#dbeaf8', fontSize: '11px', fontWeight: 600 } }, n.name),
          h('g', { key: 'badge' }, [
            h('rect', { key: 'b', x: n.x + 24, y: n.y - 42, width: 20, height: 14, rx: 3, fill: 'rgba(6,18,32,.94)', stroke: n.on ? 'rgba(140,215,255,.8)' : 'rgba(94,162,226,.3)', strokeWidth: 1 }),
            h('text', { key: 't', x: n.x + 34, y: n.y - 31.5, textAnchor: 'middle', style: { fontSize: '9.5px', fill: n.on ? '#dcf2ff' : '#8fa9c1' } }, String(n.count)),
          ]),
        ]))
        return h('div', { key: 'map', className: 'bl-map' }, [
          h('div', { key: 'legend', className: 'bl-map-legend' }, [
            h('b', { key: 'l' }, '星域总览'),
            h('span', { key: 's1' }, cats.length + ' 个分类 · ' + total + ' 条片子'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('span', { key: 's2' }, category ? '当前：' + category + '（再点一次取消）' : '点星球筛选分类'),
          ]),
          h('svg', { key: 'svg', ref: mapSvgRef, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' }, [defs, orbits, spokes, hub, planets]),
        ])
      }


      function renderRoute() {
        const days = (plan && plan.days) || []
        const tasks = []
        days.forEach((d) => (d.videoIds || []).forEach((id) => {
          const video = pick(id)
          if (video) tasks.push({ date: d.date, id, video, done: (watchIndex.byDate[d.date] || []).indexOf(id) !== -1 })
        }))
        if (!tasks.length) {
          return h('div', { key: 'route-empty', className: 'bl-empty-panel' },
            '本周航线还是空的。去「本周航线」点一下自动排片，或者手动往某一天加两集。')
        }
        const doneCount = tasks.filter((t) => t.done).length
        const curIndex = tasks.findIndex((t) => !t.done)
        const shown = tasks.slice(0, 6)
        const rest = tasks.length - shown.length
        const W = Math.max(320, Math.round(mapBox.w || 1000))
        const H = Math.max(240, Math.round(mapBox.h || 470))
        const cx = W / 2
        const amp = Math.min(210, Math.max(78, W * 0.34))
        const top = 84
        const bottom = 78
        const n = shown.length
        const rrect = (x, y, w, h, cut) => 'M' + (x + cut) + ',' + y + 'H' + (x + w - cut) + 'L' + (x + w) + ',' + (y + cut) + 'V' + (y + h - cut) + 'L' + (x + w - cut) + ',' + (y + h) + 'H' + (x + cut) + 'L' + x + ',' + (y + h - cut) + 'V' + (y + cut) + 'Z'
        const pts = shown.map((t, i) => {
          const ratio = n > 1 ? i / (n - 1) : 0.5
          const y = H - bottom - ratio * (H - top - bottom)
          const side = i % 2 === 0 ? -1 : 1
          const x = n > 1 ? cx + side * amp : cx
          const on = i === curIndex
          return { t, i, x, y, on, side, done: t.done, w: on ? 160 : 144, h: on ? 78 : 70 }
        })
        const segmentD = (a, b) => {
          const midY = Math.round((a.y + b.y) / 2)
          return 'M' + a.x + ',' + a.y + ' C' + a.x + ',' + midY + ' ' + b.x + ',' + midY + ' ' + b.x + ',' + b.y
        }
        const segments = []
        for (let i = 1; i < pts.length; i += 1) segments.push({ from: pts[i - 1], to: pts[i], key: 'seg' + i, id: 'blseg' + i })
        const arrows = segments.map((s) => {
          const my = Math.round((s.from.y + s.to.y) / 2)
          const mx = Math.round((s.from.x + s.to.x) / 2)
          const ang = Math.round(Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x) * 180 / Math.PI)
          return h('path', {
            key: 'ar' + s.key,
            d: 'M-5,-5L0,0L-5,5',
            transform: 'translate(' + mx + ',' + my + ') rotate(' + ang + ')',
            fill: 'none',
            className: 'bl-arrow' + (s.to.done ? ' on' : ''),
            stroke: s.to.done ? 'rgba(92,200,255,.7)' : 'rgba(140,176,210,.35)',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
          })
        })
        const lines = segments.map((s) => h('path', {
          key: s.key,
          id: s.id,
          className: s.to.done ? null : 'bl-dash',
          d: segmentD(s.from, s.to),
          fill: 'none',
          stroke: s.to.done ? 'rgba(92,200,255,.55)' : 'rgba(140,176,210,.22)',
          strokeWidth: 2,
          strokeDasharray: s.to.done ? null : '5 7',
          strokeLinecap: 'round',
        }))
        const halos = segments.map((s) => h('path', {
          key: 'h' + s.key,
          d: segmentD(s.from, s.to),
          fill: 'none',
          stroke: s.to.done ? 'rgba(70,170,235,.18)' : 'rgba(120,170,215,.07)',
          strokeWidth: 9,
          strokeLinecap: 'round',
        }))
        const nodes = pts.map((n0, ni) => {
          const color = n0.on ? '#f3b34c' : n0.done ? '#4fd8a6' : '#7e97ad'
          const catIdx = Math.max(0, (library.categories || []).indexOf(n0.t.video.category))
          const tint = PLANET_COLORS[catIdx % PLANET_COLORS.length]
          const stroke = n0.on ? 'rgba(243,179,76,.95)' : n0.done ? 'rgba(79,216,166,.6)' : 'rgba(140,176,210,.3)'
          const title = (n0.t.video.title || n0.t.id || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim()
          const label = title.length > 9 ? title.slice(0, 9) + '…' : title
          return h('g', {
            key: 'rn' + n0.t.date + n0.t.id,
            className: 'bl-station' + (n0.on ? ' on' : '') + (n0.done ? ' done' : ''),
            style: { cursor: 'pointer', opacity: n0.done || n0.on ? 1 : 0.78, filter: n0.on ? 'url(#blRouteGlow)' : undefined },
            onClick: () => (lessons.some((l) => l.videoId === n0.t.id) ? setTab('learn') : setPlayer(n0.t.video)),
          }, [
            h('ellipse', { key: 'sh', cx: n0.x, cy: n0.y + n0.h / 2 + 5, rx: 30, ry: 3, fill: 'rgba(0,0,0,.22)' }),
            n0.on ? h('circle', { key: 'pulse', className: 'bl-pulse', cx: n0.x, cy: n0.y, r: 48, fill: 'rgba(243,179,76,.14)', stroke: 'rgba(243,179,76,.4)', strokeWidth: 1 }) : null,
            n0.on ? h('circle', { key: 'ring', cx: n0.x, cy: n0.y, r: 54, fill: 'none', stroke: 'rgba(243,179,76,.3)', strokeWidth: 1, strokeDasharray: '2 6' }) : null,
            h('path', { key: 'plate', d: rrect(n0.x - n0.w / 2, n0.y - n0.h / 2, n0.w, n0.h, 12), fill: 'url(#blsg' + ni + ')', stroke, strokeWidth: n0.on ? 1.7 : 1.15, style: n0.on ? { filter: 'url(#blRouteGlow)' } : undefined }),
            h('path', { key: 'inner', d: rrect(n0.x - n0.w / 2 + 6, n0.y - n0.h / 2 + 6, n0.w - 12, n0.h - 12, 8), fill: 'rgba(8,20,34,.38)', stroke: color, strokeOpacity: n0.on ? 0.5 : n0.done ? 0.32 : 0.2, strokeWidth: 1 }),
            h('path', { key: 'edge', d: 'M' + (n0.x - n0.w / 2 + 12) + ',' + (n0.y - n0.h / 2 + 1.2) + 'H' + (n0.x + n0.w / 2 - 12), stroke: tint, strokeOpacity: n0.on ? 0.85 : n0.done ? 0.6 : 0.38, strokeWidth: 1.6, strokeLinecap: 'round' }),
            n0.done ? h('g', { key: 'ok' }, [
              h('circle', { key: 'c', cx: n0.x + n0.w / 2 - 14, cy: n0.y - n0.h / 2 + 1, r: 7, fill: 'rgba(7,20,26,.95)', stroke: 'rgba(79,216,166,.85)', strokeWidth: 1.2 }),
              h('path', { key: 'p', d: 'M' + (n0.x + n0.w / 2 - 17.4) + ',' + (n0.y - n0.h / 2 + 1) + 'l2.4,2.6l4,-5', fill: 'none', stroke: '#8ff0cd', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
            ]) : null,
            h(Glyph, { key: 'ic', name: catGlyph(n0.t.video.category), x: n0.x - 11, y: n0.y - n0.h / 2 + 9, width: 22, height: 22, sw: 1.8, style: { color: n0.on ? '#ffe3ad' : tint } }),
            h('text', { key: 'lb', x: n0.x, y: n0.y + n0.h / 2 - 12, textAnchor: 'middle', style: { fill: n0.on ? '#ffe3ad' : n0.done ? '#d8efe6' : '#c3d4e2', fontSize: '10.5px', fontWeight: 600 } }, label),
            h('text', { key: 'dt', x: n0.x, y: n0.y - n0.h / 2 - 8, textAnchor: 'middle', style: { fill: 'rgba(158,188,214,.62)', fontSize: '9.5px', letterSpacing: '.08em' } }, n0.t.date.slice(5) + (n0.done ? ' · 已看' : n0.on ? ' · 现在' : '')),
          ])
        })
        const legend = h('div', { key: 'legend', className: 'bl-map-legend' }, [
          h('b', { key: 'l' }, '本周航线'),
          h('span', { key: 's1' }, '已看 ' + doneCount + ' / ' + tasks.length + ' 条' + (rest > 0 ? ' · 还有 ' + rest + ' 条在后面' : '')),
          h('div', { key: 'sp', className: 'bl-spacer' }),
          h('span', { key: 's2', className: 'bl-legend-chip' }, [h('i', { key: 'd', className: 'bl-legend-dot', style: { background: '#4fd8a6' } }), h('span', { key: 't' }, '已看 ' + doneCount)]),
          h('span', { key: 's3', className: 'bl-legend-chip' }, [h('i', { key: 'd', className: 'bl-legend-dot', style: { background: '#f3b34c' } }), h('span', { key: 't' }, curIndex >= 0 ? '现在' : '全部完成')]),
          h('span', { key: 's4', className: 'bl-legend-chip' }, [h('i', { key: 'd', className: 'bl-legend-dot', style: { background: '#7e97ad' } }), h('span', { key: 't' }, '未看 ' + (tasks.length - doneCount))]),
        ])
        const defs = h('defs', { key: 'defs' }, [
          h('filter', { key: 'glow', id: 'blRouteGlow', x: '-40%', y: '-60%', width: '180%', height: '220%' }, [
            h('feGaussianBlur', { key: 'b', stdDeviation: '7', result: 'blur' }),
            h('feMerge', { key: 'm' }, [h('feMergeNode', { key: '1', in: 'blur' }), h('feMergeNode', { key: '2', in: 'SourceGraphic' })]),
          ]),
          h('radialGradient', { key: 'aura', id: 'blRouteAura' }, [
            h('stop', { key: 'a', offset: '0%', stopColor: '#f3b34c', stopOpacity: '.22' }),
            h('stop', { key: 'b', offset: '60%', stopColor: '#f3b34c', stopOpacity: '.06' }),
            h('stop', { key: 'c', offset: '100%', stopColor: '#f3b34c', stopOpacity: '0' }),
          ]),
          h('radialGradient', { key: 'vign', id: 'blRouteVign', cx: '50%', cy: '48%', r: '72%' }, [
            h('stop', { key: 'a', offset: '0%', stopColor: '#12243a', stopOpacity: '.75' }),
            h('stop', { key: 'b', offset: '62%', stopColor: '#0a1726', stopOpacity: '.4' }),
            h('stop', { key: 'c', offset: '100%', stopColor: '#050c15', stopOpacity: '.9' }),
          ]),
        ].concat(pts.map((p, i) => h('linearGradient', { key: 'sg' + i, id: 'blsg' + i, x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [
          h('stop', { key: 'a', offset: '0%', stopColor: p.done ? '#1a4b3f' : p.on ? '#4a3a16' : '#16304a', stopOpacity: p.done || p.on ? '.95' : '.85' }),
          h('stop', { key: 'b', offset: '100%', stopColor: p.done ? '#0a1a1c' : p.on ? '#231a08' : '#0a1622', stopOpacity: '.95' }),
        ]))))
        const rand = (i) => {
          const x = Math.sin(i * 12.9898) * 43758.5453
          return x - Math.floor(x)
        }
        const stars = Array.from({ length: 46 }, (_, i) => {
          const px = Math.round(rand(i + 3) * W)
          const py = Math.round(rand(i + 97) * H)
          const rr = 0.5 + rand(i + 191) * 1.1
          return h('circle', {
            key: 'st' + i, className: 'bl-star', cx: px, cy: py, r: rr.toFixed(2),
            fill: '#cfe8ff', opacity: 0.3, style: { animationDelay: (rand(i + 307) * 3.4).toFixed(2) + 's' },
          })
        })
        const backdrop = h('g', { key: 'bg' }, [
          h('rect', { key: 'v', x: 0, y: 0, width: W, height: H, fill: 'url(#blRouteVign)' }),
          h('ellipse', { key: 'gl', cx, cy: H + 26, rx: Math.round(W * 0.58), ry: 74, fill: 'rgba(243,179,76,.055)' }),
        ].concat(stars))
        const curPt = pts.find((p) => p.on)
        const aura = curPt ? h('ellipse', { key: 'aura', cx: curPt.x, cy: curPt.y, rx: 150, ry: 96, fill: 'url(#blRouteAura)' }) : null
        const comets = segments.filter((s) => s.to.done).map((s) => h('g', { key: 'cm' + s.key }, [
          h('circle', { key: 'h', r: 8, fill: 'rgba(110,200,255,.18)', className: 'bl-comet' }, h('animateMotion', { key: 'm', dur: '4.2s', repeatCount: 'indefinite' }, h('mpath', { key: 'p', href: '#' + s.id }))),
          h('circle', { key: 'c', r: 2.8, fill: '#d8f3ff' }, h('animateMotion', { key: 'm2', dur: '4.2s', repeatCount: 'indefinite' }, h('mpath', { key: 'p2', href: '#' + s.id }))),
        ]))
        return h('div', { key: 'route', className: 'bl-map' }, [
          legend,
          h('svg', { key: 'svg', ref: mapSvgRef, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' }, [defs, backdrop, aura].concat(halos).concat(lines).concat(comets).concat(arrows).concat(nodes)),
        ])
      }

      function renderHudCells() {
        const day = ((plan && plan.days) || []).find((d) => d.date === today) || null
        const ids = day ? (day.videoIds || []) : []
        const todayDoneIds = (watchIndex.byDate[today] || []).filter((id) => ids.indexOf(id) !== -1)
        const xp = doneTotal * 40 + (rewards ? (Number(rewards.xpBonus) || 0) : 0)
        const level = 1 + Math.floor(xp / XP_STEP)
        const xpIn = xp % XP_STEP
        const sparks = rewards ? (Number(rewards.earned) || 0) : 0
        const drawLeft = rewards ? (Number(rewards.available) || 0) : 0
        const cell = (props) => h('button', {
          key: props.k,
          className: 'bl-cell' + (props.tone ? ' ' + props.tone : ''),
          onClick: props.onClick,
          title: props.foot || props.label,
        }, [
          h('div', { key: 't', className: 'bl-cell-top' }, [
            RailIcon({ key: 'i', name: props.icon, size: 13 }),
            h('span', { key: 'l' }, props.label),
            props.en ? h('em', { key: 'e' }, props.en) : null,
          ]),
          h('div', { key: 'v', className: 'bl-cell-val' }, [
            h('b', { key: 'b' }, props.value),
            props.unit ? h('em', { key: 'u' }, props.unit) : null,
          ]),
          props.mode === 'bar'
            ? h('div', { key: 'bar', className: 'bl-xpbar' + (props.tone === 'gold' ? ' gold' : '') }, h('i', { style: { width: Math.round(props.ratio * 100) + '%' } }))
            : h('div', { key: 'f', className: 'bl-cell-foot' }, props.foot || ''),
        ])
        return h('div', { key: 'hud', className: 'bl-hud-strip' }, [
          h('div', { key: 'id', className: 'bl-hud-id' }, [
            h('div', { key: 'av', className: 'bl-avatar' }, h('span', { key: 's' }, '学')),
            h('div', { key: 'n', className: 'bl-id-name' }, [
              h('b', { key: 'b' }, '课堂小队长'),
              h('div', { key: 'lv', className: 'bl-id-lv' }, [
                h('span', { key: 'l' }, 'Lv.' + level),
                h('em', { key: 'e' }, xpIn + ' / ' + XP_STEP),
              ]),
              h('div', { key: 'xp', className: 'bl-xpbar' }, h('i', { style: { width: Math.round((xpIn / XP_STEP) * 100) + '%' } })),
            ]),
          ]),
          cell({
            k: 'e', icon: 'learn', label: '能量', en: 'ENERGY',
            value: ids.length ? String(todayDoneIds.length) + ' / ' + ids.length : '0', unit: ids.length ? '条' : '条',
            mode: 'bar', ratio: ids.length ? todayDoneIds.length / ids.length : 0,
            foot: ids.length ? (todayDoneIds.length >= ids.length ? '今日任务已清空' : '还剩 ' + (ids.length - todayDoneIds.length) + ' 条') : '今天没排片',
            onClick: () => setTab('plan'),
          }),
          cell({
            k: 'w', icon: 'plan', label: '本周', en: 'WEEK',
            value: weekDone + ' / ' + weekTasks, unit: '条', tone: 'gold', mode: 'bar', ratio: weekRatio,
            foot: weekTasks ? '完成 ' + Math.round(weekRatio * 100) + '%' : '还没排片',
            onClick: () => setTab('plan'),
          }),
          cell({
            k: 's', icon: 'rewards', label: '星火', en: 'SPARK',
            value: String(sparks), unit: '枚', tone: 'gold', mode: 'note',
            foot: drawLeft > 0 ? '有 ' + drawLeft + ' 个盲盒可抽' : '答满分卡拿盲盒',
            onClick: () => setTab('rewards'),
          }),
          cell({
            k: 'l', icon: 'library', label: '片库', en: 'LIBRARY',
            value: String(allVideos.length), unit: '条', mode: 'note',
            foot: (library.categories || []).length + ' 个分类 · 课卡 ' + lessons.length + ' 套',
            onClick: () => setTab('vault'),
          }),
        ])
      }
      function renderCoursePanel() {
        const days = (plan && plan.days) || []
        const cands = []
        days.forEach((d) => {
          (d.videoIds || []).forEach((id) => {
            const v = pick(id)
            if (v) cands.push({ date: d.date, id, video: v, done: (watchIndex.byDate[d.date] || []).indexOf(id) !== -1 })
          })
        })
        const cur = cands.find((c) => !c.done && c.date === today) || cands.find((c) => !c.done) || cands[0] || null
        const lesson = cur ? lessons.find((l) => l.videoId === cur.id) : null
        const dayList = cur ? (((days.find((d) => d.date === cur.date) || {}).videoIds) || []) : []
        const dayDone = cur ? dayList.filter((id) => (watchIndex.byDate[cur.date] || []).indexOf(id) !== -1).length : 0
        const dayRatio = dayList.length ? dayDone / dayList.length : 0
        const goals = lesson && Array.isArray(lesson.questions) ? lesson.questions.slice(0, 3) : []
        const qs = lesson && Array.isArray(lesson.questions) ? lesson.questions : []
        const avgDiff = qs.length ? Math.round(qs.reduce((s, q) => s + (Number(q.difficulty) || 1), 0) / qs.length) : 0
        const pct = Math.round(dayRatio * 100)
        const minutesOf = (id) => { const v = pick(id); return v ? (Number(v.duration) || 0) / 60 : 0 }
        const dayWatched = cur ? dayList.filter((id) => (watchIndex.byDate[cur.date] || []).indexOf(id) !== -1) : []
        const watchedMin = Math.round(dayWatched.reduce((s, id) => s + minutesOf(id), 0))
        const totalMin = Math.round(dayList.reduce((s, id) => s + minutesOf(id), 0))

        return h('div', { key: 'course', className: 'bl-panel bl-course' }, [
          cur && cur.video.cover
            ? h('div', { key: 'cov', className: 'bl-course-cover' }, h('img', {
              src: cur.video.cover, alt: '', referrerPolicy: 'no-referrer',
            }))
            : null,
          h('div', { key: 'b', className: 'bl-course-body' }, [
            h('div', { key: 'k', className: 'bl-course-kicker' }, cur
              ? (cur.done ? '已看完 · 可复习' : cur.date === today ? '今日课程' : '本周待看')
              : '当前课程'),
            h('div', { key: 't', className: 'bl-course-title' }, cur ? (cur.video.title || cur.id) : '本周还没排片，去航线里自动排一下'),
            h('div', { key: 'tags', className: 'bl-reward-row' }, cur ? [
              h('span', { key: 'c', className: 'bl-chip' }, cur.video.category || '未分类'),
              cur.video.duration ? h('span', { key: 'd', className: 'bl-chip' }, fmtDur(cur.video.duration)) : null,
              lesson ? h('span', { key: 'l', className: 'bl-chip gold' }, '课卡 ' + (lesson.questions || []).length + ' 题') : null,
              cur.video.minAge ? h('span', { key: 'a', className: 'bl-chip' }, cur.video.minAge + ' 岁+') : null,
              avgDiff ? h('span', { key: 'df', className: 'bl-chip' }, ['难度 ', h('b', { key: 'b', style: { letterSpacing: '1px' } }, '★'.repeat(avgDiff) + '☆'.repeat(3 - avgDiff))]) : null,
            ] : null),
            goals.length
              ? h('ul', { key: 'g', className: 'bl-goals' }, goals.map((q, i) => h('li', { key: 'q' + i, title: q.prompt }, q.prompt || '看一遍这一集')))
              : h('div', { key: 'ng', className: 'bl-stat-note' }, cur ? '这条还没做课卡，先看一遍也行。' : '点「自动排本周」把片库排进航线。'),
            h('div', { key: 'p', className: 'bl-course-prog' }, [
              h('div', {
                key: 'r',
                className: 'bl-ring',
                style: { background: 'conic-gradient(' + (pct >= 100 ? '#4fd8a6' : '#5cc8ff') + ' ' + Math.max(pct, 3) + '%, rgba(140,176,210,.12) 0)' },
              }, h('i', { key: 'v' }, pct + '%')),
              h('div', { key: 'm', className: 'bl-ring-meta' }, [
                h('b', { key: 'a' }, '今日进度 ' + (cur ? dayDone + ' / ' + (dayList.length || 0) : '0 / 0')),
                h('span', { key: 'b' }, '已学 ' + watchedMin + ' 分钟 · 预计 ' + totalMin + ' 分钟'),
              ]),
            ]),
            h('div', { key: 'rw', className: 'bl-reward-row' }, [
              h('span', { key: 'x', className: 'bl-chip' }, ['奖励 ', h('b', { key: 'b' }, '+' + (goals.length ? '40' : '20'))]),
              h('span', { key: 's', className: 'bl-chip gold' }, ['星火 ', h('b', { key: 'b' }, '+10')]),
            ]),
            h('div', { key: 'cta', className: 'bl-course-cta' }, [
              h('button', { key: 'go', className: 'bl-btn bl-btn-primary', onClick: () => setTab('learn') }, goals.length ? '去答题拿星火' : '去学习舱看片'),
              h('button', { key: 'pl', className: 'bl-btn bl-btn-sm', onClick: () => setTab('plan') }, '看本周航线'),
            ]),
          ]),
        ])
      }

      function renderBridge() {
        const days = (plan && plan.days) || []
        const day = days.find((d) => d.date === today) || null
        const todayIds = day ? (day.videoIds || []) : []
        const doneToday = (watchIndex.byDate[today] || []).filter((id) => todayIds.indexOf(id) !== -1)
        const pending = []
        days.forEach((d) => {
          (d.videoIds || []).forEach((id) => {
            if ((watchIndex.byDate[d.date] || []).indexOf(id) === -1) pending.push({ date: d.date, id })
          })
        })
        const rows = todayIds.length ? todayIds.map((id) => ({ date: today, id })) : pending.slice(0, 3)
        const weekVideos = []
        const seen = {}
        days.forEach((d) => (d.videoIds || []).forEach((id) => {
          if (seen[id]) return
          const v = pick(id)
          if (v) { seen[id] = true; weekVideos.push(v) }
        }))

        const taskRow = (row) => {
          const v = pick(row.id)
          if (!v) return null
          const done = (watchIndex.byDate[row.date] || []).indexOf(row.id) !== -1
          const lesson = lessons.find((l) => l.videoId === row.id)
          return h('div', { key: row.date + row.id, className: 'bl-task' + (done ? ' done' : '') }, [
            h('div', { key: 'm', className: 'bl-medal' + (done ? ' gold' : '') }, h(Glyph, { key: 's', name: catGlyph(v.category), size: 26, sw: 1.8 })),
            h('div', { key: 'main', className: 'bl-task-main' }, [
              h('div', { key: 't', className: 'bl-task-title', title: v.title || row.id }, v.title || row.id),
              h('div', { key: 's', className: 'bl-task-sub' }, [
                v.category || '未分类',
                v.duration ? fmtDur(v.duration) : '',
                lesson ? '课卡 ' + (lesson.questions || []).length + ' 题' : '还没做课卡',
              ].filter(Boolean).join(' · ')),
            ]),
            h('div', { key: 'p', className: 'bl-task-prog' }, [
              h('div', { key: 'bar', className: 'bl-xpbar' + (done ? ' gold' : '') }, h('i', { style: { width: done ? '100%' : '0%' } })),
              h('span', { key: 't' }, done ? '已完成' : '0 / 1'),
            ]),
            h('div', { key: 'r', className: 'bl-task-reward' }, [
              h('span', { key: 'xp', className: 'bl-chip' }, ['XP ', h('b', { key: 'b' }, lesson ? '+40' : '+20')]),
              h('span', { key: 'sp', className: 'bl-chip gold' }, ['星火 ', h('b', { key: 'b' }, '+10')]),
              h('button', {
                key: 'go',
                className: done ? 'bl-btn bl-cta-sub' : 'bl-btn bl-cta-main',
                style: { height: '34px', padding: '0 18px', fontSize: '12.5px' },
                onClick: () => (lesson ? setTab('learn') : setPlayer(v)),
              }, done ? '复习' : (lesson ? '去答题' : '看片')),
            ]),
          ])
        }

        const bar = (i) => {
          const key = addDays(today, -6 + i)
          const n = (watchIndex.byDate[key] || []).length
          return h('i', { key, className: n ? 'on' : '', style: { height: Math.max(4, Math.min(38, n * 14 + 4)) + 'px' }, title: key + ' · ' + n + ' 条' })
        }
        const recent = []
        for (let i = 6; i >= 0; i -= 1) {
          const key = addDays(today, -i)
          recent.push({ key: key.slice(8), on: (watchIndex.byDate[key] || []).length > 0 })
        }
        const weekMinutes = (() => {
          let m = 0
          for (let i = 0; i < 7; i += 1) {
            const key = addDays(today, -i)
            ;(watchIndex.byDate[key] || []).forEach((id) => { const v = pick(id); if (v) m += (Number(v.duration) || 0) / 60 })
          }
          return Math.round(m)
        })()
        const owned = rewards ? rewards.items.filter((it) => it.count > 0) : []
        const meds = (rewards ? rewards.items : []).filter((it) => it.count > 0).slice(0, 3)

        const mini = (key, icon, title, right, body) => h('div', { key, className: 'bl-mcard' }, [
          h('div', { key: 'h', className: 'bl-mcard-head' }, [
            RailIcon({ key: 'i', name: icon, size: 13 }),
            h('span', { key: 'l' }, title),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            right || null,
          ]),
        ].concat(body))

        const bottom = h('div', { key: 'bottom', className: 'bl-bottom' }, [
          mini('rep', 'watch', '学习报告', null, [
            h('div', { key: 'b', className: 'bl-mcard-big' }, [h('b', { key: 'v' }, String(weekMinutes)), h('em', { key: 'u' }, '分钟 · 近 7 天')]),
            h('div', { key: 'bars', className: 'bl-bars' }, [0, 1, 2, 3, 4, 5, 6].map(bar)),
          ]),
          mini('cat', 'library', '今日分类', null, [
            h('div', { key: 'b', className: 'bl-mcard-big' }, [h('b', { key: 'v' }, String(doneToday.length) + ' / ' + String(todayIds.length)), h('em', { key: 'u' }, '条')]),
            h('div', { key: 'c', className: 'bl-chips' }, todayIds.slice(0, 4).map((id) => {
              const v = pick(id)
              return h('span', { key: id, className: 'bl-chip' }, (v && v.category) || '未分类')
            }).concat(todayIds.length ? [] : [h('span', { key: 'none', className: 'bl-empty' }, '今天没排片')])),
          ]),
          mini('st', 'rewards', '连续学习', null, [
            h('div', { key: 'b', className: 'bl-mcard-big' }, [h('b', { key: 'v' }, String(streak)), h('em', { key: 'u' }, '天')]),
            h('div', { key: 'd', className: 'bl-dots' }, recent.map((r) => h('div', { key: r.key, className: 'bl-dotcell' }, [
              h('i', { key: 'd', className: r.on ? 'on' : '' }),
              h('span', { key: 'n' }, r.key),
            ]))),
          ]),
          mini('med', 'lessons', '勋章成就', h('button', { key: 'all', className: 'bl-link', onClick: () => setTab('rewards') }, '查看全部 →'), [
            h('div', { key: 'b', className: 'bl-mcard-big' }, [h('b', { key: 'v' }, String(owned.length)), h('em', { key: 'u' }, '/ ' + String(rewards ? rewards.items.length : 0) + ' 枚')]),
            meds.length
              ? h('div', { key: 'm', style: { display: 'flex', gap: '6px' } }, meds.map((it) => h('div', {
                key: it.id,
                className: 'bl-medal bl-hexmed ' + (it.rarity === 'epic' ? 'gold' : ''),
                style: { width: '38px', height: '38px' },
                title: it.name + ' ×' + it.count,
              }, h(Glyph, { key: 's', name: rewardGlyph(it.id), size: 20, sw: 1.8 }))))
              : h('div', { key: 'none', className: 'bl-empty' }, '还没抽到勋章，去答一套课卡'),
          ]),
        ])

        const left = homeView === 'route' ? renderRoute() : renderStarMap()
        const hero = h('div', { key: 'hero', className: 'bl-hero' }, [
          left || h('div', { key: 'nomap', className: 'bl-empty-panel' }, '片库还没分类，先去「片库仓库」加几条片子。'),
          renderCoursePanel(),
        ])

        const mine = h('div', { key: 'mine', className: 'bl-panelx', style: { padding: '12px' } }, [
          weekVideos.length
            ? h('div', { key: 'g', className: 'bl-grid' }, weekVideos.map(renderCard))
            : h('div', { key: 'empty', className: 'bl-empty-panel' }, '本周还没排片。去「本周航线」点一下自动排片，或者手动加两集。'),
        ])

        return [
          h('div', { key: 'subtabs', className: 'bl-subtabs' }, [
            h('button', { key: 'route', className: 'bl-subtab' + (homeView === 'route' ? ' on' : ''), onClick: () => setHomeView('route') }, '本周航线'),
            h('button', { key: 'map', className: 'bl-subtab' + (homeView === 'map' ? ' on' : ''), onClick: () => setHomeView('map') }, '分类星图'),
            h('button', { key: 'mine', className: 'bl-subtab' + (homeView === 'mine' ? ' on' : ''), onClick: () => setHomeView('mine') }, '我的课程'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('button', { key: 'vault', className: 'bl-link', onClick: () => setTab('vault') }, '片库仓库 ' + allVideos.length + ' 条 →'),
          ]),
          homeView === 'mine' ? mine : hero,
          h('div', { key: 'tasks', className: 'bl-panelx', style: { padding: '12px 14px 14px' } }, [
            h('div', { key: 'h', className: 'bl-head', style: { marginBottom: '10px' } }, [
              h('h2', { key: 't' }, todayIds.length ? '今日任务' : '接下来这几集'),
              h('p', { key: 's' }, todayIds.length ? '排在本周的今日航线上 · 完成一条拿一份奖励' : '今天的航线是空的，先看本周还没看的'),
              h('div', { key: 'sp', className: 'bl-spacer' }),
              h('button', { key: 'plan', className: 'bl-link', onClick: () => setTab('plan') }, '本周航线 →'),
            ]),
            h('div', { key: 'list', className: 'bl-tasks' }, rows.map(taskRow).filter(Boolean)),
            rows.length ? null : h('div', { key: 'empty', className: 'bl-empty' }, '还没有可看的片子。先去「片库仓库」加两条。'),
          ]),
          bottom,
        ]
      }
      function renderVault() {
        const items = library.items || []
        const stats = library.stats || { total: 0, dead: 0 }
        const filtered = Boolean(q.trim() || category)
        const emptyText = filtered
          ? '没搜到' + (q.trim() ? '「' + q.trim() + '」' : '这个分类') + '的片子，换个词，或者把筛选清空。'
          : '片库还是空的。把想给他看的 B 站链接粘到上面那行，点「加一条」，服务端会自己去拉标题、封面和时长。'
        return [
          pageHead('VAULT · 片库仓库', '片库仓库',
            (stats.total || items.length) + ' 条片子 · ' + (library.categories || []).length + ' 个分类'
              + (stats.dead ? ' · ' + stats.dead + ' 条失效' : ''),
            h('button', {
              key: 'refresh',
              className: 'bl-btn',
              onClick: refreshDead,
              disabled: refreshing || !allVideos.length,
            }, refreshing ? '正在问 B 站…' : '校验失效')),
          h('div', { key: 'kpis', className: 'bl-kpis' }, [
            kpi('k1', '片库总量', stats.total || items.length, '条', '含失效 ' + (stats.dead || 0) + ' 条'),
            kpi('k2', '分类', (library.categories || []).length, '个', '自动排本周按分类轮转', 'cyan'),
            kpi('k3', '已配课卡', lessons.filter((l) => allVideos.some((v) => v.id === l.videoId)).length, '套', '总共 ' + lessons.length + ' 套课卡', 'gold'),
            kpi('k4', '筛选结果', items.length, '条', filtered ? '当前筛选下' : '未筛选', 'green'),
          ]),
          h('div', { key: 'add', className: 'bl-toolbar' }, [
            h('input', {
              key: 'value',
              className: 'bl-input',
              style: { flex: '1 1 260px', maxWidth: '380px' },
              value: addForm.value,
              placeholder: 'BV 号或 B 站链接，比如 BV1xx411c7mD',
              onChange: (e) => setAddForm({ ...addForm, value: e.target.value }),
              onKeyDown: (e) => { if (e.key === 'Enter') addVideo() },
            }),
            h('input', {
              key: 'cat',
              className: 'bl-input',
              style: { width: '128px' },
              value: addForm.category,
              placeholder: '分类（可空）',
              onChange: (e) => setAddForm({ ...addForm, category: e.target.value }),
            }),
            h('input', {
              key: 'age',
              className: 'bl-input',
              style: { width: '96px' },
              value: addForm.minAge,
              placeholder: '年龄 ' + settings.maxAge,
              onChange: (e) => setAddForm({ ...addForm, minAge: e.target.value }),
            }),
            h('input', {
              key: 'reason',
              className: 'bl-input',
              style: { flex: '1 1 180px', maxWidth: '260px' },
              value: addForm.reason,
              placeholder: '为什么给他看（可空）',
              onChange: (e) => setAddForm({ ...addForm, reason: e.target.value }),
            }),
            h('button', { key: 'go', className: 'bl-btn bl-btn-primary', onClick: addVideo, disabled: adding }, adding ? '正在拉…' : '加一条'),
          ]),
          h('div', { key: 'filter', className: 'bl-toolbar' }, [
            h('input', {
              key: 'q',
              className: 'bl-input bl-search',
              value: q,
              placeholder: '搜标题、备注、UP 主',
              onChange: (e) => setQ(e.target.value),
            }),
            h('select', {
              key: 'cat',
              className: 'bl-select',
              value: category,
              onChange: (e) => setCategory(e.target.value),
            }, [h('option', { key: '', value: '' }, '全部分类')].concat(
              (library.categories || []).map((c) => h('option', { key: c, value: c }, c)),
            )),
            h('span', { key: 'stat', className: 'bl-hint' },
              searching ? '正在筛…' : '共 ' + (stats.total || items.length) + ' 条' + (stats.dead ? ' · ' + stats.dead + ' 条失效' : '')),
          ]),
          items.length
            ? h('div', { key: 'grid', className: 'bl-grid' }, items.map(renderCard))
            : h('div', { key: 'empty', className: 'bl-empty-panel' }, emptyText),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：本周                                                          */
      /* ------------------------------------------------------------------ */

      function renderPlanRow(day, videoId, index) {
        const v = pick(videoId)
        const done = watchIndex.set.has(day.date + '|' + videoId)
        const subtitle = v
          ? [v.category || '未分类', v.duration ? fmtDur(v.duration) : '', v.dead ? '已失效' : ''].filter(Boolean).join(' · ')
          : '可能这条已经被删了，换成别的吧'
        return h('div', { key: day.date + '|' + videoId + '|' + index, className: 'bl-row' }, [
          h('div', { key: 'thumb', className: 'bl-thumb' },
            v && coverUrl(v.cover)
              ? h('img', { src: coverUrl(v.cover), alt: '', referrerPolicy: 'no-referrer' })
              : h('span', { className: 'bl-mini-ph' }, '无图')),
          h('div', { key: 'main', className: 'bl-row-main' }, [
            h('button', {
              key: 't',
              className: 'bl-row-title',
              title: v ? v.title : videoId,
              onClick: () => v && setPlayer(v),
            }, v ? v.title : '片库里没有 ' + videoId),
            h('div', { key: 's', className: 'bl-row-sub' }, subtitle),
          ]),
          h('button', {
            key: 'check',
            className: 'bl-check' + (done ? ' on' : ''),
            title: done ? '点一下取消已看' : '点一下记已看',
            onClick: () => toggleDone(videoId, day.date, !done),
          }, done ? '✓' : ''),
          h('select', {
            key: 'swap',
            className: 'bl-select bl-select-sm',
            value: '',
            onChange: (e) => { if (e.target.value) replaceSlot(day.date, index, e.target.value) },
          }, [h('option', { key: '', value: '' }, '换一条')].concat(planOptions(videoId))),
          h('button', { key: 'rm', className: 'bl-btn bl-btn-sm bl-btn-danger', onClick: () => removeSlot(day.date, index) }, '移除'),
        ])
      }

      function renderPlanDay(day) {
        const ids = day.videoIds || []
        const doneIds = watchIndex.byDate[day.date] || []
        const done = ids.filter((id) => doneIds.indexOf(id) !== -1).length
        const isToday = day.date === today
        return h('div', { key: day.date, className: 'bl-day' + (isToday ? ' today' : '') }, [
          h('div', { key: 'head', className: 'bl-day-head' }, [
            h('span', { key: 'w', className: 'bl-day-name' }, weekdayLabel(day.date)),
            h('span', { key: 'd', className: 'bl-day-date' }, shortDate(day.date)),
            isToday ? h('span', { key: 't', className: 'bl-badge-today' }, '今天') : null,
            h('span', { key: 'n', className: 'bl-hint' }, ids.length ? done + '/' + ids.length + ' 已看' : ''),
            done && done === ids.length ? h('span', { key: 'ok', className: 'bl-tag' }, '这天过完了') : null,
          ]),
          h('div', { key: 'body', className: 'bl-day-body' },
            ids.length
              ? ids.map((id, index) => renderPlanRow(day, id, index))
              : [h('div', { key: 'empty', className: 'bl-empty' }, '这天还空着，下面挑一条，或者点「自动排本周」')]),
          h('div', { key: 'add', className: 'bl-day-add' }, allVideos.length
            ? h('select', {
              key: 'sel',
              className: 'bl-select bl-select-sm',
              value: '',
              onChange: (e) => { if (e.target.value) addSlot(day.date, e.target.value) },
            }, [h('option', { key: '', value: '' }, '＋ 给这天加一条')].concat(planOptions('')))
            : h('span', { key: 'hint', className: 'bl-hint' }, '片库还是空的，先去「片库」加几条')),
        ])
      }

      function renderPlan() {
        const days = plan && Array.isArray(plan.days) ? plan.days : []
        return [
          pageHead('ROUTE · 本周航线', '本周航线',
            '周一起 · ' + weekStart + (days.length ? ' · 每天 ' + (plan.perDay || settings.perDay) + ' 条' : ' · 还没排过')
              + (planDirty ? ' · 有改动还没保存' : ''), [
              h('button', { key: 'auto', className: 'bl-btn', onClick: autoPlan, disabled: planBusy }, planBusy ? '排着呢…' : '自动排本周'),
              h('button', { key: 'save', className: 'bl-btn bl-btn-primary', onClick: savePlan, disabled: planBusy || !planDirty }, '保存'),
            ]),
          h('div', { key: 'kpis', className: 'bl-kpis' }, [
            kpi('k1', '本周任务', weekTasks, '条', '已看 ' + weekDone + ' 条'),
            kpi('k2', '完成进度', (weekRatio * 100).toFixed(0), '%', '每天 ' + ((plan && plan.perDay) || settings.perDay) + ' 条', 'gold'),
            kpi('k3', '还剩', Math.max(0, weekTasks - weekDone), '条', days.length ? '排到' + weekdayLabel(days[days.length - 1].date) : '还没排', 'cyan'),
            kpi('k4', '连续打卡', streak, '天', '片库 ' + allVideos.length + ' 条可排', 'green'),
          ]),
          days.length
            ? h('div', { key: 'days', className: 'bl-week' }, days.map(renderPlanDay))
            : h('div', { key: 'empty', className: 'bl-empty-panel' }, [
              h('div', { key: 'l1' }, '这周还没排计划。点「自动排本周」，会按分类轮转填满，跳过失效的和最近三周排过的。'),
              h('div', { key: 'l2', className: 'bl-hint' }, '排完可以每天单独「换一条」或者「移除」，改完记得点「保存」。'),
            ]),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：记录                                                          */
      /* ------------------------------------------------------------------ */

      function renderWatchRow(date, videoId) {
        const v = pick(videoId)
        return h('div', { key: date + '|' + videoId, className: 'bl-row' }, [
          h('div', { key: 'thumb', className: 'bl-thumb' },
            v && coverUrl(v.cover)
              ? h('img', { src: coverUrl(v.cover), alt: '', referrerPolicy: 'no-referrer' })
              : h('span', { className: 'bl-mini-ph' }, '无图')),
          h('div', { key: 'main', className: 'bl-row-main' }, [
            h('button', {
              key: 't',
              className: 'bl-row-title',
              title: v ? v.title : videoId,
              onClick: () => v && setPlayer(v),
            }, v ? v.title : '片库里没有 ' + videoId),
            h('div', { key: 's', className: 'bl-row-sub' }, v ? (v.category || '未分类') : '这条可能已经从片库删了'),
          ]),
          h('button', {
            key: 'check',
            className: 'bl-check on',
            title: '点一下取消已看',
            onClick: () => toggleDone(videoId, date, false),
          }, '✓'),
        ])
      }

      function renderWatchDay(date) {
        const ids = watchIndex.byDate[date] || []
        const isToday = date === today
        return h('div', { key: date, className: 'bl-day' + (isToday ? ' today' : '') }, [
          h('div', { key: 'head', className: 'bl-day-head' }, [
            h('span', { key: 'w', className: 'bl-day-name' }, weekdayLabel(date)),
            h('span', { key: 'd', className: 'bl-day-date' }, shortDate(date)),
            isToday ? h('span', { key: 't', className: 'bl-badge-today' }, '今天') : null,
            h('span', { key: 'n', className: 'bl-hint' }, ids.length ? ids.length + ' 条' : ''),
          ]),
          ids.length
            ? h('div', { key: 'body', className: 'bl-day-body' }, ids.map((id) => renderWatchRow(date, id)))
            : h('div', { key: 'empty', className: 'bl-empty' }, '这天还没记，去「本周」点一下勾就行'),
        ])
      }

      function renderWatch() {
        const days = []
        for (let i = 0; i < 14; i += 1) days.push(addDays(today, -i))
        return [
          pageHead('LOG · 航行记录', '航行记录', '近 14 天 · 点勾可以取消'),
          h('div', { key: 'stats', className: 'bl-kpis' }, [
            kpi('a', '本周看了', weekCount, '条', weekTasks ? '本周计划 ' + weekTasks + ' 条' : '本周还没排片'),
            kpi('b', '连续打卡', streak, '天', '断了就从今天重新起算', 'green'),
            kpi('c', '近 14 天', doneTotal, '条', '累计看过都算在这里'),
            kpi('d', '每天平均', (doneTotal / 14).toFixed(1), '条', '近 14 天摊平', 'cyan'),
          ]),
          h('div', { key: 'list', className: 'bl-week' }, days.map(renderWatchDay)),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：课卡                                                          */
      /* ------------------------------------------------------------------ */

      function renderQuestion(question, index) {
        const owner = lessonDraft && lessonDraft.id ? lessonDraft.id : 'new'
        const name = 'ans-' + owner + '-' + index
        return h('div', { key: question.id || String(index), className: 'bl-q' }, [
          h('div', { key: 'head', className: 'bl-q-head' }, [
            h('span', { key: 'no', className: 'bl-q-no' }, '第 ' + (index + 1) + ' 题'),
            h('select', {
              key: 'diff',
              className: 'bl-select bl-select-sm',
              value: String(question.difficulty || 1),
              onChange: (e) => patchQuestion(index, { difficulty: Number(e.target.value) }),
            }, [1, 2, 3].map((d) => h('option', { key: d, value: String(d) }, DIFFICULTY[d]))),
            h('button', {
              key: 'less',
              className: 'bl-btn bl-btn-sm',
              disabled: question.options.length <= 3,
              onClick: () => removeOption(index, question.options.length - 1),
            }, '少一个选项'),
            h('button', {
              key: 'more',
              className: 'bl-btn bl-btn-sm',
              disabled: question.options.length >= 4,
              onClick: () => addOption(index),
            }, '多一个选项'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('button', {
              key: 'rm',
              className: 'bl-btn bl-btn-sm bl-btn-danger',
              disabled: (lessonDraft ? lessonDraft.questions.length : 0) <= 3,
              onClick: () => removeQuestion(index),
            }, '删这题'),
          ]),
          h('div', { key: 'prompt', className: 'bl-field' }, [
            h('span', { key: 'l', className: 'bl-label' }, '题干（屏幕上的问题）'),
            h('input', {
              key: 'i',
              className: 'bl-input',
              value: question.prompt,
              placeholder: '比如：哪个颜色是红色？',
              onChange: (e) => patchQuestion(index, { prompt: e.target.value }),
            }),
          ]),
          h('div', { key: 'spoken', className: 'bl-field' }, [
            h('span', { key: 'l', className: 'bl-label' }, '口播（老师念出来的话）'),
            h('input', {
              key: 'i',
              className: 'bl-input',
              value: question.spokenPrompt,
              placeholder: '比如：宝宝看，这个是红色哦，我们找找哪个是红色？',
              onChange: (e) => patchQuestion(index, { spokenPrompt: e.target.value }),
            }),
          ]),
          h('div', { key: 'opts', className: 'bl-field' }, [
            h('span', { key: 'l', className: 'bl-label' }, '选项（点左边的圈选正确项）'),
            h('div', { key: 'rows', className: 'bl-opts' }, question.options.map((option, oi) => h('div', {
              key: 'o' + oi,
              className: 'bl-opt-row',
            }, [
              h('input', {
                key: 'r',
                type: 'radio',
                name,
                checked: Number(question.answer) === oi,
                onChange: () => patchQuestion(index, { answer: oi }),
              }),
              h('input', {
                key: 'i',
                className: 'bl-input',
                value: option,
                placeholder: '选项 ' + (oi + 1),
                onChange: (e) => {
                  const options = question.options.slice()
                  options[oi] = e.target.value
                  patchQuestion(index, { options })
                },
              }),
            ]))),
          ]),
          h('div', { key: 'hint', className: 'bl-field' }, [
            h('span', { key: 'l', className: 'bl-label' }, '提示（答错时给的一句话）'),
            h('input', {
              key: 'i',
              className: 'bl-input',
              value: question.hint,
              placeholder: '比如：是这个哦，再看一眼',
              onChange: (e) => patchQuestion(index, { hint: e.target.value }),
            }),
          ]),
          h('div', { key: 'exp', className: 'bl-field' }, [
            h('span', { key: 'l', className: 'bl-label' }, '解释（答对后的强化）'),
            h('input', {
              key: 'i',
              className: 'bl-input',
              value: question.explanation,
              placeholder: '比如：对，红色就像小苹果',
              onChange: (e) => patchQuestion(index, { explanation: e.target.value }),
            }),
          ]),
        ])
      }

      function renderLessonEditor() {
        const draft = lessonDraft
        if (!draft) {
          const counts = new Map()
          for (const v of allVideos) {
            const cat = v.category || '未分类'
            const row = counts.get(cat) || { total: 0, done: 0 }
            row.total += 1
            if (lessons.some((l) => l.videoId === v.id)) row.done += 1
            counts.set(cat, row)
          }
          const rows = Array.from(counts.entries()).sort((a, b) => b[1].total - a[1].total)
          const thick = lessons.slice().sort((a, b) => (b.questions || []).length - (a.questions || []).length).slice(0, 4)
          return h('div', { key: 'hint', className: 'bl-panel bl-overview' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [
              h('b', { key: 't' }, '课卡概览'),
              h('span', { key: 'h', className: 'bl-hint' }, '点左边任意一条视频，就能给它写课卡'),
            ]),
            h('div', { key: 'rows', className: 'bl-catlist' }, rows.map((entry) => {
              const [cat, row] = entry
              return h('div', { key: 'c' + cat, className: 'bl-catrow' }, [
                h('b', { key: 'n' }, cat),
                h('span', { key: 'b', className: 'bl-catbar' },
                  [h('i', { key: 'i', style: { width: Math.round((row.done / row.total) * 100) + '%' } })]),
                h('em', { key: 'v' }, row.done + '/' + row.total),
              ])
            })),
            thick.length
              ? h('div', { key: 'top', className: 'bl-catlist' }, [
                h('div', { key: 'l', className: 'bl-kpi-label', style: { margin: '10px 0 2px' } }, '题数最多'),
                ...thick.map((l) => h('div', { key: 't' + l.id, className: 'bl-topcard' }, [
                  h('span', { key: 'n' }, l.topic || l.title || l.videoId),
                  h('em', { key: 'q' }, (l.questions || []).length + ' 道'),
                ])),
              ])
              : null,
          ])
        }
        const video = byId[draft.videoId] || planById[draft.videoId] || null
        return h('div', { key: 'editor', className: 'bl-panel' }, [
          h('div', { key: 'head', className: 'bl-panel-head' }, [
            h('b', { key: 't' }, draft.id ? '改这套课卡' : '新写一套课卡'),
            h('span', { key: 'v', className: 'bl-hint' }, video ? video.title : draft.videoId),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('button', {
              key: 'add',
              className: 'bl-btn',
              disabled: draft.questions.length >= 8,
              onClick: addQuestion,
            }, '＋ 加一题'),
            h('button', {
              key: 'save',
              className: 'bl-btn bl-btn-primary',
              onClick: saveLesson,
              disabled: lessonBusy,
            }, lessonBusy ? '保存中…' : (draft.id ? '保存修改' : '创建课卡')),
          ]),
          h('div', { key: 'topic', className: 'bl-field' }, [
            h('span', { key: 'l', className: 'bl-label' }, '课卡主题'),
            h('input', {
              key: 'i',
              className: 'bl-input',
              value: draft.topic,
              placeholder: '比如：认识红色',
              onChange: (e) => setDraftField({ topic: e.target.value }),
            }),
          ]),
          h('div', { key: 'qs', className: 'bl-week' }, draft.questions.map(renderQuestion)),
          h('div', { key: 'foot', className: 'bl-toolbar' }, [
            h('span', { key: 'n', className: 'bl-hint' }, '共 ' + draft.questions.length + ' 道题（3 到 8 道）'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            draft.id
              ? h('button', { key: 'del', className: 'bl-btn bl-btn-danger', onClick: deleteLesson }, '删除这套课卡')
              : null,
          ]),
        ])
      }

      function renderLessons() {
        const list = allVideos.map((v) => {
          const has = lessons.some((l) => l.videoId === v.id)
          return h('div', {
            key: 'l' + v.id,
            className: 'bl-list-item' + (lessonVideo === v.id ? ' on' : ''),
            title: v.title || v.id,
            onClick: () => openLesson(v.id),
          }, [
            h('span', { key: 't', className: 'bl-list-title' }, v.title || v.id),
            h('span', { key: 'f', className: 'bl-list-flag' + (has ? ' on' : '') }, has ? '有课卡' : '待写'),
          ])
        })
        return [
          pageHead('CARD · 课卡工坊', '课卡工坊', '一条视频一套课卡 · 每套 3 到 8 题'),
          h('div', { key: 'kpis', className: 'bl-kpis' }, [
            kpi('k1', '已写课卡', lessons.length, '套', '共 ' + lessons.reduce((n, l) => n + (l.questions || []).length, 0) + ' 道题'),
            kpi('k2', '覆盖片子', lessons.filter((l) => allVideos.some((v) => v.id === l.videoId)).length, '条', '片库 ' + allVideos.length + ' 条', 'gold'),
            kpi('k3', '待写', allVideos.filter((v) => !lessons.some((l) => l.videoId === v.id)).length, '条', '点左侧条目就能写', 'cyan'),
            kpi('k4', '平均题数', lessons.length ? (lessons.reduce((n, l) => n + (l.questions || []).length, 0) / lessons.length).toFixed(1) : '0', '道', '每套 3 到 8 道', 'green'),
          ]),
          h('div', { key: 'split', className: 'bl-split' }, [
            h('div', { key: 'left', className: 'bl-list' },
              list.length ? list : [h('div', { key: 'e', className: 'bl-empty' }, '片库还没片子，先去「片库」加一条')]),
            renderLessonEditor(),
          ]),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：学习                                                          */
      /* ------------------------------------------------------------------ */

      const weekVideos = useMemo(() => {
        const seen = new Set()
        const out = []
        for (const day of (plan && plan.days) || []) {
          for (const id of day.videoIds || []) {
            if (seen.has(id)) continue
            seen.add(id)
            const video = pick(id)
            if (video) out.push({ video, date: day.date })
          }
        }
        return out
      }, [plan, pick])

      const learnRows = useMemo(() => {
        const seen = new Set(weekVideos.map((row) => row.video.id))
        const extra = lessons
          .filter((lesson) => lesson && lesson.videoId && !seen.has(lesson.videoId))
          .map((lesson) => ({ video: pick(lesson.videoId), date: '' }))
          .filter((row) => Boolean(row.video))
        return weekVideos.concat(extra)
      }, [weekVideos, lessons, pick])

      const loadRewards = useCallback(async () => {
        const data = await api('/rewards')
        setRewards(data && Array.isArray(data.items) ? data : null)
        return data
      }, [])

      const draftOfPrize = (row) => ({
        id: row.id || '',
        name: row.name || '',
        emoji: row.emoji || '',
        rarity: row.rarity || 'common',
        note: row.note || '',
        stock: row.stock === null || row.stock === undefined ? '' : String(row.stock),
        weeklyCap: row.weeklyCap === null || row.weeklyCap === undefined ? '' : String(row.weeklyCap),
        enabled: row.enabled !== false,
      })

      const loadPrizes = useCallback(async () => {
        const data = await api('/prizes')
        setPrizes(data && Array.isArray(data.items) ? data : null)
        if (data && Array.isArray(data.items)) setPrizeDraft(data.items.map(draftOfPrize))
        return data
      }, [])

      const draftOfMedal = (row) => ({
        id: row.id || '',
        name: row.name || '',
        target: Number(row.target) || 1,
        xp: Number(row.xp) || 0,
        prizeId: row.prizeId || '',
      })

      const loadMedals = useCallback(async () => {
        const data = await api('/medals')
        setMedalBook(data && Array.isArray(data.items) ? data : null)
        if (data && Array.isArray(data.items)) setMedalDraft(data.items.map(draftOfMedal))
        return data
      }, [])

      useEffect(() => {
        loadRewards().catch((e) => fail(e))
      }, [loadRewards, fail])

      useEffect(() => {
        if (tab !== 'rewards') return
        loadRewards().catch(() => {})
      }, [tab, loadRewards])

      useEffect(() => {
        if (tab !== 'settings') return
        if (confView === 'prizes' && !prizes) loadPrizes().catch((e) => fail(e))
        if (confView === 'medals' && !medalBook) loadMedals().catch((e) => fail(e))
      }, [tab, confView, prizes, medalBook, loadPrizes, loadMedals, fail])

      useEffect(() => {
        if (tab !== 'learn' || learnRows.length === 0) return
        if (learnPick && learnRows.some((row) => row.video.id === learnPick)) return
        setLearnPick(learnRows[0].video.id)
      }, [tab, learnRows, learnPick])

      const learnRow = learnPick ? (learnRows.find((row) => row.video.id === learnPick) || null) : null
      const learnVideo = learnRow ? learnRow.video : null
      const learnLesson = learnPick ? (lessons.find((row) => row.videoId === learnPick) || null) : null
      const learned = (learnPick && learnPicks[learnPick]) || {}
      const learnResult = learnOutcome && learnOutcome.videoId === learnPick ? learnOutcome : null
      const answeredCount = learnLesson ? learnLesson.questions.filter((q) => learned[q.id] !== undefined && learned[q.id] !== null).length : 0
      const answeredAll = Boolean(learnLesson) && answeredCount === learnLesson.questions.length

      function pickChoice(qid, choice) {
        setLearnOutcome(null)
        setLastDraw(null)
        setLearnPicks((prev) => {
          const bucket = prev[learnPick] || {}
          return { ...prev, [learnPick]: { ...bucket, [qid]: choice } }
        })
      }

      function resetLearn() {
        setLearnPicks((prev) => ({ ...prev, [learnPick]: {} }))
        setLearnOutcome(null)
        setLastDraw(null)
      }

      async function submitAttempt() {
        if (!learnLesson || !answeredAll || learnBusy) return
        setError('')
        setLearnBusy(true)
        try {
          const answers = learnLesson.questions.map((q) => ({ qid: q.id, choice: Number(learned[q.id]) }))
          const data = await send('/lessons/' + encodeURIComponent(learnLesson.id) + '/attempt', 'POST', { answers })
          setLearnOutcome({
            videoId: learnPick,
            lessonId: learnLesson.id,
            attempt: data.attempt,
            newBox: Boolean(data.newBox),
            available: Number(data.available) || 0,
          })
          setLastDraw(null)
          loadRewards().catch(() => {})
          flash(data.newBox ? '交卷了，得了一个盲盒' : '交卷了，看看错在哪')
        } catch (e) {
          fail(e)
        } finally {
          setLearnBusy(false)
        }
      }

      async function drawBox() {
        if (rewardBusy) return
        setError('')
        setRewardBusy(true)
        try {
          const data = await send('/rewards/draw', 'POST')
          setLastDraw(data.item || null)
          setLearnOutcome((prev) => (prev ? { ...prev, available: Number(data.available) || 0, newBox: (Number(data.available) || 0) > 0 } : prev))
          loadRewards().catch(() => {})
          flash('抽到了：' + ((data.item && data.item.name) || '一份奖品'))
        } catch (e) {
          fail(e)
        } finally {
          setRewardBusy(false)
        }
      }

      function renderDrawCard() {
        if (!lastDraw) return null
        return h('div', { key: 'prize', className: 'bl-draw-card' }, [
          h(Glyph, { key: 'e', name: rewardGlyph(lastDraw.id), size: 44, sw: 1.6, className: 'bl-sticker-glyph' }),
          h('div', { key: 'txt', className: 'bl-draw-text' }, [
            h('b', { key: 'n' }, lastDraw.name || '奖品'),
            h('span', { key: 'r', className: 'bl-sticker-meta' }, (RARITY[lastDraw.rarity] || '奖品') + ' · 已经收进「奖励」墙'),
          ]),
        ])
      }

      function renderAnswerSheet() {
        const lesson = learnLesson
        const attempt = learnResult && learnResult.attempt ? learnResult.attempt : null
        const markByQid = {}
        if (attempt && Array.isArray(attempt.answers)) {
          for (const row of attempt.answers) {
            if (row && row.qid) markByQid[row.qid] = row
          }
        }
        const questions = lesson.questions.map((question, index) => {
          const mark = markByQid[question.id] || null
          const picked = learned[question.id]
          const chosen = Number.isInteger(picked) ? picked : -1
          const className = 'bl-q' + (mark ? (mark.correct ? ' bl-q-right' : ' bl-q-wrong') : '')
          const rows = [
            h('div', { key: 'head', className: 'bl-q-head' }, [
              h('span', { key: 'no', className: 'bl-q-no' }, '第 ' + (index + 1) + ' 题'),
              h('span', { key: 'diff', className: 'bl-hint' }, DIFFICULTY[question.difficulty] || DIFFICULTY[1]),
            ]),
            h('div', { key: 'prompt', className: 'bl-q-prompt' }, question.prompt),
            h('div', { key: 'opts', className: 'bl-opts' }, question.options.map((option, oi) => h('label', {
              key: 'o' + oi,
              className: 'bl-opt-pick' + (chosen === oi ? ' on' : ''),
            }, [
              h('input', {
                key: 'r',
                type: 'radio',
                name: 'learn-' + lesson.id + '-' + question.id,
                checked: chosen === oi,
                disabled: Boolean(attempt),
                onChange: () => pickChoice(question.id, oi),
              }),
              h('span', { key: 't', className: 'bl-opt-text' }, option),
            ]))),
          ]
          if (mark) {
            rows.push(h('div', { key: 'mark', className: 'bl-hint' }, mark.correct
              ? '答对了'
              : (mark.choice === null || mark.choice === undefined
                ? '这题空着'
                : '答错了，你选的是「' + (question.options[mark.choice] || ('选项 ' + (mark.choice + 1))) + '」')))
            if (!mark.correct && question.hint) rows.push(h('div', { key: 'hint', className: 'bl-note' }, '提示：' + question.hint))
            if (question.explanation) rows.push(h('div', { key: 'exp', className: 'bl-note' }, '解释：' + question.explanation))
          }
          return h('div', { key: question.id || String(index), className }, rows)
        })

        const bar = h('div', { key: 'bar', className: 'bl-toolbar' }, [
          learnResult
            ? h('button', { key: 'again', className: 'bl-btn', onClick: resetLearn }, '再做一遍')
            : (answeredAll
              ? h('button', { key: 'submit', className: 'bl-btn bl-btn-primary', disabled: learnBusy, onClick: submitAttempt }, learnBusy ? '交卷中…' : '交卷')
              : h('span', { key: 'hint', className: 'bl-hint' }, '还有 ' + (lesson.questions.length - answeredCount) + ' 题没选，全部选完才能交卷')),
        ])

        const verdict = attempt ? h('div', { key: 'verdict', className: 'bl-verdict ' + (attempt.score >= 80 ? 'ok' : 'bad') }, [
          h('span', { key: 's', className: 'bl-score' }, String(attempt.score)),
          h('span', { key: 'u', className: 'bl-hint' }, '分'),
          h('span', { key: 'c', className: 'bl-hint' }, '答对 ' + attempt.correct + ' / ' + attempt.total + ' 题'),
          h('div', { key: 'sp', className: 'bl-spacer' }),
          learnResult.newBox
            ? h('button', { key: 'draw', className: 'bl-btn bl-btn-primary', disabled: rewardBusy, onClick: drawBox }, rewardBusy ? '开盒中…' : '抽一个盲盒')
            : h('span', { key: 'why', className: 'bl-hint' }, attempt.score >= 80
              ? '这套课卡今天已经给过盲盒了，明天再来'
              : '得分到 80 才能拿盲盒，错的题看一眼解释再来一遍'),
        ]) : null

        return h('div', { key: 'sheet', className: 'bl-panel' }, [
          h('div', { key: 'head', className: 'bl-panel-head' }, [
            h('b', { key: 't' }, lesson.topic || '这套课卡'),
            h('span', { key: 'h', className: 'bl-hint' }, lesson.questions.length + ' 道题 · 答完交卷'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('button', {
              key: 'reset',
              className: 'bl-btn bl-btn-sm',
              disabled: !answeredCount && !learnResult,
              onClick: resetLearn,
            }, '重选'),
          ]),
          learnResult ? null : h('div', { key: 'tip', className: 'bl-note' }, '先看一遍视频，再把题目答完；满分 100，到 80 分能拿一个盲盒，同一套课卡每天只给一个。'),
          verdict,
          renderDrawCard(),
          h('div', { key: 'qs', className: 'bl-week' }, questions),
          bar,
        ])
      }

      function renderLearn() {
        const rows = learnRows.map((row) => {
          const video = row.video
          const lesson = lessons.find((item) => item.videoId === video.id) || null
          return h('div', {
            key: video.id,
            className: 'bl-list-item' + (learnPick === video.id ? ' on' : ''),
            title: video.title || video.id,
            onClick: () => setLearnPick(video.id),
          }, [
            h('span', { key: 't', className: 'bl-list-title' }, video.title || video.id),
            h('span', { key: 'f', className: 'bl-list-flag' + (lesson ? ' on' : '') }, lesson ? '有课卡' : '没课卡'),
          ])
        })

        const right = learnVideo
          ? h('div', { key: 'main', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [
              h('b', { key: 't' }, learnVideo.title || learnVideo.id),
              h('span', { key: 'd', className: 'bl-hint' }, learnRow ? (learnRow.date ? (weekdayLabel(learnRow.date) + ' ' + shortDate(learnRow.date)) : '不在本周计划里') : ''),
              h('div', { key: 'sp', className: 'bl-spacer' }),
              h('a', { key: 'tab', className: 'bl-btn bl-btn-sm', href: siteUrl(learnVideo.id), target: '_blank', rel: 'noreferrer' }, '新标签打开'),
            ]),
            playerNode(learnVideo),
            learnLesson
              ? renderAnswerSheet()
              : h('div', { key: 'nocard', className: 'bl-empty-panel' }, '这条片子还没写课卡。去「课卡」tab 给它配 3 到 5 道题，回来就能边看边答。'),
          ])
          : h('div', { key: 'none', className: 'bl-empty-panel' }, '本周计划还是空的。先去「本周」排片，再看这里。')

        const qTotal = learnLesson ? learnLesson.questions.length : 0
        const qAnswered = learnLesson ? learnLesson.questions.filter((q) => Number.isInteger(learned[q.id])).length : 0
        const attemptNow = learnResult && learnResult.attempt ? learnResult.attempt : null
        const stepCls = (state) => 'bl-step' + (state === 'done' ? ' done' : state === 'now' ? ' now' : '')
        const steps = h('div', { key: 'steps', className: 'bl-steps' }, [
          h('span', { key: 's1', className: stepCls('done') }, [h('i', { key: 'i' }, '1'), '看片']),
          h('span', { key: 'a1', className: 'bl-step-arrow' }, '▸'),
          h('span', { key: 's2', className: stepCls(attemptNow ? 'done' : qTotal ? 'now' : '') }, [h('i', { key: 'i' }, '2'), '答题 ' + qAnswered + '/' + qTotal]),
          h('span', { key: 'a2', className: 'bl-step-arrow' }, '▸'),
          h('span', { key: 's3', className: stepCls(attemptNow ? 'done' : '') }, [h('i', { key: 'i' }, '3'), '交卷' + (attemptNow ? ' ' + attemptNow.score + ' 分' : '')]),
          h('span', { key: 'a3', className: 'bl-step-arrow' }, '▸'),
          h('span', { key: 's4', className: stepCls(learnResult && learnResult.newBox ? 'now' : '') }, [h('i', { key: 'i' }, '4'), '开盲盒']),
        ])
        return [
          pageHead('TRAINING · 训练舱', '训练舱', '看片 → 逐题作答 → 交卷结算 → 开盲盒'),
          h('div', { key: 'kpis', className: 'bl-kpis' }, [
            kpi('k1', '本周待学', Math.max(0, weekTasks - weekDone), '条', '计划 ' + weekTasks + ' 条 · 已看 ' + weekDone + ' 条'),
            kpi('k2', '可复习', lessons.length, '套', '有课卡就能随时重做', 'gold'),
            kpi('k3', '连续打卡', streak, '天', '答题也会续上', 'green'),
            kpi('k4', '累计星火', doneTotal * 40 + (rewards ? (Number(rewards.xpBonus) || 0) : 0), '点', '每看一条 +40 · 勋章另外加 · 等级 ' + (1 + Math.floor((doneTotal * 40 + (rewards ? (Number(rewards.xpBonus) || 0) : 0)) / XP_STEP)), 'cyan'),
          ]),
          steps,
          h('div', { key: 'split', className: 'bl-split' }, [
            h('div', { key: 'left', className: 'bl-list' }, rows.length
              ? rows
              : [h('div', { key: 'e', className: 'bl-empty' }, '还没有能学的片子：先去「本周」排片，或去「片库」加片')]),
            right,
          ]),
        ]
      }

      /* ---------------- 家长端：奖品池 / 勋章规则 ---------------- */

      async function savePrizes() {
        if (!prizeDraft || adminBusy) return
        setError('')
        setAdminBusy(true)
        try {
          const payload = prizeDraft.map((row) => ({
            id: row.id || undefined,
            name: row.name,
            emoji: row.emoji,
            rarity: row.rarity,
            note: row.note,
            stock: row.stock === '' ? null : Number(row.stock),
            weeklyCap: row.weeklyCap === '' ? null : Number(row.weeklyCap),
            enabled: row.enabled,
          }))
          await send('/prizes', 'PUT', { items: payload })
          await loadPrizes()
          loadRewards().catch(() => {})
          flash('奖品池已保存：' + payload.length + ' 件')
        } catch (e) {
          fail(e)
        } finally {
          setAdminBusy(false)
        }
      }

      async function resetPrizes() {
        if (adminBusy) return
        setError('')
        setAdminBusy(true)
        try {
          await send('/prizes', 'POST', { action: 'reset' })
          await loadPrizes()
          loadRewards().catch(() => {})
          flash('奖品池已恢复成默认 54 件')
        } catch (e) {
          fail(e)
        } finally {
          setAdminBusy(false)
        }
      }

      async function saveMedals() {
        if (!medalDraft || adminBusy) return
        setError('')
        setAdminBusy(true)
        try {
          const payload = medalDraft.map((row) => ({
            id: row.id,
            name: row.name,
            target: Number(row.target) || 1,
            xp: Number(row.xp) || 0,
            prizeId: row.prizeId || '',
          }))
          await send('/medals', 'PUT', { items: payload })
          await loadMedals()
          loadRewards().catch(() => {})
          flash('勋章规则已保存')
        } catch (e) {
          fail(e)
        } finally {
          setAdminBusy(false)
        }
      }

      function renderRewards() {
        const view = rewards
        if (!view) return [h('div', { key: 'loading', className: 'bl-empty-panel' }, '正在读奖励账本…')]
        const book = view.medals || { items: [], xp: 0, earnedCount: 0, totalCount: 0 }
        const medalRows = book.items || []
        const owned = medalRows.filter((row) => row.earned).length
        const total = medalRows.length
        const pct = total ? (owned / total) * 100 : 0
        const sel = (medalPick && medalRows.find((row) => row.id === medalPick)) || medalRows.find((row) => row.earned) || medalRows.find((row) => !row.earned) || medalRows[0] || null
        const pool = view.items || []
        const byItem = {}
        for (const item of pool) byItem[item.id] = item
        const got = pool.filter((item) => item.count > 0)
        const openPool = pool.filter((item) => item.enabled !== false
          && (item.remaining === null || item.remaining === undefined || item.remaining > 0)
          && (item.weeklyCap === null || item.weeklyCap === undefined || item.weekUsed < item.weeklyCap))
        const limits = view.limits || {}
        const weekCap = Number(limits.weeklyBoxLimit) || 0

        const wall = medalRows.map((row) => h('button', {
          key: row.id,
          className: 'bl-hex' + (row.earned ? '' : ' locked') + (sel && sel.id === row.id ? ' on' : ''),
          title: row.earned ? row.name : (row.metricLabel + ' ' + row.target),
          onClick: () => setMedalPick(row.id),
        }, [
          h('span', { key: 'sh', className: 'bl-hex-shield ' + (row.earned ? 'earned' : 'locked') }, h(Glyph, { key: 'e', name: row.glyph || 'medal', size: 22, sw: 1.7 })),
          h('span', { key: 'n', className: 'bl-hex-name' }, row.name),
          h('span', { key: 'c', className: 'bl-hex-count' }, row.earned ? '已获得' : (Math.min(row.value, row.target) + ' / ' + row.target)),
        ]))

        const detail = sel ? h('div', { key: 'detail', className: 'bl-panelx bl-reward-detail' }, [
          h('div', { key: 'k', className: 'bl-course-kicker' }, '勋章详情 MEDAL'),
          h('div', { key: 'big', className: 'bl-hex-big ' + (sel.earned ? 'earned' : 'locked') }, h(Glyph, { key: 'e', name: sel.glyph || 'medal', size: 48, sw: 1.5 })),
          h('div', { key: 'n', className: 'bl-detail-name' }, sel.name),
          h('div', { key: 'chips', className: 'bl-chips' }, [
            h('span', { key: 'm', className: 'bl-chip' }, sel.metricLabel),
            h('span', { key: 's', className: 'bl-chip' + (sel.earned ? ' gold' : '') }, sel.earned ? '已获得' : '进行中'),
            sel.prizeId ? h('span', { key: 'p', className: 'bl-chip' }, '赠 ' + (sel.prizeName || '一件奖品')) : null,
          ]),
          h('div', { key: 'rows', className: 'bl-detail-rows' }, [
            h('div', { key: 'r1', className: 'bl-detail-row' }, [h('span', { key: 'k' }, '达成条件'), h('b', { key: 'v' }, sel.metricLabel + ' ' + sel.target)]),
            h('div', { key: 'r2', className: 'bl-detail-row' }, [h('span', { key: 'k' }, '当前进度'), h('b', { key: 'v' }, Math.min(sel.value, sel.target) + ' / ' + sel.target)]),
            h('div', { key: 'r3', className: 'bl-detail-row' }, [h('span', { key: 'k' }, '星火奖励'), h('b', { key: 'v' }, '+' + sel.xp)]),
            h('div', { key: 'r4', className: 'bl-detail-row' }, [h('span', { key: 'k' }, '获得时间'), h('b', { key: 'v' }, sel.earned && sel.at ? timeText(sel.at) : '还没拿到')]),
          ]),
          h('div', { key: 'next', className: 'bl-next' }, [
            h('div', { key: 'top', className: 'bl-next-top' }, [
              h('span', { key: 'l' }, '这枚勋章进度'),
              h('b', { key: 'v' }, Math.round(Number(sel.pct) || 0) + '%'),
            ]),
            h('i', { key: 'bar', className: 'bl-bar', style: { '--p': Number(sel.pct || 0).toFixed(1) + '%' } }),
            h('div', { key: 'hint', className: 'bl-hint' }, sel.earned ? '奖励已经入账：星火 +' + sel.grantedXp : ('还差 ' + Math.max(0, sel.target - sel.value) + ' ' + (sel.unit || '点'))),
          ]),
          h('button', { key: 'go', className: 'bl-cta-main', onClick: () => setTab('learn') }, '去答题拿盲盒'),
        ]) : null

        const recentList = (view.draws || []).slice(0, 5).map((row) => {
          const item = byItem[row.itemId] || null
          return h('div', { key: row.id || String(row.at), className: 'bl-draw-row' }, [
            h(Glyph, { key: 'e', name: item ? rewardGlyph(item.id) : 'gift', size: 34, sw: 1.6, className: 'bl-sticker-glyph' }),
            h('span', { key: 'n', style: { flex: '1', minWidth: '0' } }, item ? item.name : '奖品'),
            h('span', { key: 't', className: 'bl-hint' }, timeText(row.at)),
          ])
        })

        const stat = h('div', { key: 'stat', className: 'bl-mcard' }, [
          h('div', { key: 'h', className: 'bl-mcard-head' }, '盲盒 BOX'),
          h('div', { key: 'big', className: 'bl-mcard-big' }, [h('b', { key: 'n' }, String(view.available)), h('em', { key: 'u' }, '个可抽 · 本周抽了 ' + (Number(limits.weekDraws) || 0) + ' / ' + (weekCap || '不限'))]),
          renderDrawCard(),
          h('button', {
            key: 'draw',
            className: 'bl-cta-main',
            disabled: rewardBusy || view.available <= 0,
            onClick: drawBox,
          }, rewardBusy ? '开盒中…' : (view.available > 0 ? ('抽一个盲盒（' + view.available + '）') : '没有可抽的盲盒了')),
          h('div', { key: 'note', className: 'bl-hint' }, '答完一套课卡拿到 80 分给一个盲盒，同一套课卡当天只给一次；每周能抽几个由家长设置。'),
        ])

        const poolRows = openPool.slice(0, 6).map((item) => h('div', { key: item.id, className: 'bl-draw-row' }, [
          h('span', { key: 'e', className: 'bl-sticker-meta', style: { minWidth: '24px' } }, item.emoji || '🎁'),
          h('span', { key: 'n', style: { flex: '1', minWidth: '0' } }, item.name),
          h('span', { key: 'q', className: 'bl-hint' }, item.rarityLabel + ' · ' + (item.remaining === null || item.remaining === undefined ? '库存不限' : ('剩 ' + item.remaining))),
        ]))

        const poolCard = h('div', { key: 'pool', className: 'bl-mcard' }, [
          h('div', { key: 'h', className: 'bl-mcard-head' }, '奖品池 POOL'),
          h('div', { key: 'big', className: 'bl-mcard-big' }, [h('b', { key: 'n' }, String(openPool.length)), h('em', { key: 'u' }, '件可抽 · 已抽到 ' + got.length + ' 种')]),
          poolRows.length ? h('div', { key: 'l', className: 'bl-draws' }, poolRows) : h('div', { key: 'e', className: 'bl-empty' }, '奖品池空了，让家长去「设置 · 奖品池」补货'),
          h('button', { key: 'a', className: 'bl-link', style: { marginTop: 'auto' }, onClick: () => { setConfView('prizes'); setTab('settings') } }, '家长设置奖品池 →'),
        ])

        return [
          h('div', { key: 'head', className: 'bl-head' }, [
            h('h2', { key: 't' }, '星际成就展厅'),
            h('p', { key: 'p' }, '勋章 ' + owned + ' / ' + total + ' · 星火加成 +' + (Number(book.xp) || 0) + ' 点 · 已抽到 ' + got.length + ' 种奖品'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('button', { key: 'v', className: 'bl-link', onClick: () => setTab('vault') }, '片库仓库 ' + allVideos.length + ' 条 →'),
          ]),
          h('div', { key: 'hero', className: 'bl-hero' }, [
            h('div', { key: 'nucleus', className: 'bl-panelx' }, [
              h('div', { key: 'h', className: 'bl-head' }, [
                h('h2', { key: 't' }, '勋章墙'),
                h('p', { key: 'p' }, '集齐条件由家长设定，达成后自动发放'),
              ]),
              h('div', { key: 'top', className: 'bl-wall-top' }, [
                h('div', { key: 'ring', className: 'bl-nucleus-ring', style: { '--p': pct.toFixed(1) + '%' } }, [
                  h('b', { key: 'n' }, [String(owned), h('em', { key: 'd' }, ' / ' + total)]),
                  h('span', { key: 'l' }, 'MEDALS'),
                ]),
                h('div', { key: 'meta', className: 'bl-wall-meta' }, [
                  h('div', { key: 'g', className: 'bl-wall-rank' }, owned >= total ? '星海收藏家' : (owned >= total * 0.6 ? '星际探索者' : '见习领航员')),
                  h('div', { key: 'h', className: 'bl-hint' }, total ? ('已获得 ' + owned + ' 枚，还有 ' + (total - owned) + ' 枚在路上') : '还没有勋章规则'),
                  h('div', { key: 'b', className: 'bl-wall-bars' }, [
                    h('span', { key: 'c', className: 'bl-chip' }, '已获得 ' + owned),
                    h('span', { key: 'r', className: 'bl-chip' }, '进行中 ' + (total - owned)),
                    h('span', { key: 'e', className: 'bl-chip gold' }, '星火 +' + (Number(book.xp) || 0)),
                  ]),
                ]),
              ]),
              h('div', { key: 'grid', className: 'bl-hexgrid' }, wall),
            ]),
            detail,
          ]),
          h('div', { key: 'bottom', className: 'bl-bottom3' }, [
            stat,
            poolCard,
            h('div', { key: 'recent', className: 'bl-mcard' }, [
              h('div', { key: 'h', className: 'bl-mcard-head' }, '最近抽到 DRAWS'),
              recentList.length ? h('div', { key: 'l', className: 'bl-draws' }, recentList) : h('div', { key: 'e', className: 'bl-empty' }, '还没抽过。答完一套课卡，来开第一个盲盒。'),
            ]),
          ]),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：设置                                                          */
      /* ------------------------------------------------------------------ */

      function renderSettings() {
        const tabs = [['base', '基础设置'], ['prizes', '奖品池'], ['medals', '勋章规则']]
        return [
          pageHead('CONFIG · 舰桥设置', '舰桥设置', '家长设置：排片默认值、盲盒奖品池、勋章规则，都存在 ~/.dsh/bili-lesson/'),
          h('div', { key: 'subtabs', className: 'bl-subtabs' }, tabs.map((row) => h('button', {
            key: row[0],
            className: 'bl-subtab' + (confView === row[0] ? ' on' : ''),
            onClick: () => setConfView(row[0]),
          }, row[1]))),
          confView === 'prizes' ? renderPrizeAdmin() : confView === 'medals' ? renderMedalAdmin() : renderBaseSettings(),
        ]
      }

      function renderBaseSettings() {
        return [
          h('div', { key: 'kpis', className: 'bl-kpis' }, [
            kpi('k1', '片库', allVideos.length, '条', '失效 ' + (library.stats ? library.stats.dead : 0) + ' 条'),
            kpi('k2', '课卡', lessons.length, '套', '本周计划 ' + weekTasks + ' 条', 'gold'),
            kpi('k3', '本周起点', weekStart.slice(5), '', '周一起算', 'cyan'),
            kpi('k4', '已看过', doneTotal, '条', '记录在 watch.json', 'green'),
          ]),
          h('div', { key: 'panel', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [
              h('b', { key: 't' }, '默认值'),
              h('div', { key: 'sp', className: 'bl-spacer' }),
              h('button', {
                key: 'save',
                className: 'bl-btn bl-btn-primary',
                onClick: saveSettings,
                disabled: settingsBusy,
              }, settingsBusy ? '保存中…' : '保存设置'),
            ]),
            h('div', { key: 'grid', className: 'bl-form-grid' }, [
              h('div', { key: 'perDay', className: 'bl-field' }, [
                h('span', { key: 'l', className: 'bl-label' }, '每天几条（自动排本周用）'),
                h('input', {
                  key: 'i', className: 'bl-input', type: 'number', min: 1, max: 6,
                  value: settings.perDay,
                  onChange: (e) => setSettings({ ...settings, perDay: Number(e.target.value) }),
                }),
              ]),
              h('div', { key: 'maxAge', className: 'bl-field' }, [
                h('span', { key: 'l', className: 'bl-label' }, '片库默认年龄（新加片子的建议最低年龄）'),
                h('input', {
                  key: 'i', className: 'bl-input', type: 'number', min: 1, max: 12,
                  value: settings.maxAge,
                  onChange: (e) => setSettings({ ...settings, maxAge: Number(e.target.value) }),
                }),
              ]),
              h('div', { key: 'boxLimit', className: 'bl-field' }, [
                h('span', { key: 'l', className: 'bl-label' }, '每周最多抽几个盲盒（0 = 不限）'),
                h('input', {
                  key: 'i', className: 'bl-input', type: 'number', min: 0, max: 20,
                  value: settings.weeklyBoxLimit,
                  onChange: (e) => setSettings({ ...settings, weeklyBoxLimit: Number(e.target.value) }),
                }),
              ]),
              h('label', { key: 'embed', className: 'bl-field', style: { flexDirection: 'row', alignItems: 'center', gap: '8px' } }, [
                h('input', {
                  key: 'i', type: 'checkbox', checked: settings.embedPlay,
                  style: { accentColor: '#35d8ff', width: '15px', height: '15px' },
                  onChange: (e) => setSettings({ ...settings, embedPlay: e.target.checked }),
                }),
                h('span', { key: 'l', className: 'bl-label', style: { fontSize: '12px' } }, '点开视频直接内嵌播放'),
              ]),
            ]),
            h('div', { key: 'note', className: 'bl-note' },
              'perDay 决定「自动排本周」每天排几条，maxAge 是新加片子的默认年龄，weeklyBoxLimit 限制每周能抽几个盲盒，embedPlay 决定点开时直接内嵌播放还是只给入口。已经排好的计划和片库里的年龄不会被改动。'),
          ]),
          h('div', { key: 'state', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [h('b', { key: 't' }, '现在这台的存量')]),
            h('div', { key: 'body', className: 'bl-note' },
              '片库 ' + allVideos.length + ' 条 · 课卡 ' + lessons.length + ' 套 · 本周从 ' + weekStart + ' 开始'),
            h('div', { key: 'hint', className: 'bl-hint' }, '数据都在服务端的 ~/.dsh/bili-lesson/ 里，换浏览器不会丢。'),
          ]),
        ]
      }

      function renderPrizeAdmin() {
        if (!prizes || !prizeDraft) return [h('div', { key: 'loading', className: 'bl-empty-panel' }, '正在读奖品池…')]
        const stats = prizes.stats || {}
        const rarities = prizes.rarities || []
        const patch = (index, key, value) => setPrizeDraft((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
        const head = h('div', { key: 'ph', className: 'bl-panel-head' }, [
          h('b', { key: 't' }, '奖品池 ' + prizeDraft.length + ' 件 · 可抽 ' + (stats.drawable || 0) + ' 件'),
          h('div', { key: 'sp', className: 'bl-spacer' }),
          h('button', { key: 'add', className: 'bl-btn', onClick: () => setPrizeDraft((prev) => prev.concat([{ id: '', name: '', emoji: '', rarity: 'common', note: '', stock: '', weeklyCap: '', enabled: true }])) }, '新增奖品'),
          h('button', { key: 'reset', className: 'bl-btn', onClick: resetPrizes, disabled: adminBusy }, '恢复默认'),
          h('button', { key: 'save', className: 'bl-btn bl-btn-primary', onClick: savePrizes, disabled: adminBusy }, adminBusy ? '保存中…' : '保存奖品池'),
        ])
        const columns = h('div', { key: 'cols', className: 'bl-prow bl-prow-head' }, [
          h('span', { key: 'e' }, '图标'),
          h('span', { key: 'n' }, '奖品名称'),
          h('span', { key: 'r' }, '稀有度'),
          h('span', { key: 's' }, '库存'),
          h('span', { key: 'w' }, '每周上限'),
          h('span', { key: 'on' }, '启用'),
          h('span', { key: 'x' }, ''),
        ])
        const rows = prizeDraft.map((row, index) => h('div', { key: row.id || ('new' + index), className: 'bl-prow' }, [
          h('input', { key: 'e', className: 'bl-input bl-prow-emoji', value: row.emoji, maxLength: 4, placeholder: '🎁', onChange: (e) => patch(index, 'emoji', e.target.value) }),
          h('input', { key: 'n', className: 'bl-input', value: row.name, maxLength: 20, placeholder: '奖品名称（必填）', onChange: (e) => patch(index, 'name', e.target.value) }),
          h('select', { key: 'r', className: 'bl-input', value: row.rarity, onChange: (e) => patch(index, 'rarity', e.target.value) },
            rarities.map((r) => h('option', { key: r.key, value: r.key }, r.label + ' · 权重 ' + r.weight))),
          h('input', { key: 's', className: 'bl-input', type: 'number', min: 0, value: row.stock, placeholder: '不限', onChange: (e) => patch(index, 'stock', e.target.value) }),
          h('input', { key: 'w', className: 'bl-input', type: 'number', min: 0, value: row.weeklyCap, placeholder: '不限', onChange: (e) => patch(index, 'weeklyCap', e.target.value) }),
          h('label', { key: 'on', className: 'bl-prow-on' }, h('input', { key: 'i', type: 'checkbox', checked: row.enabled, onChange: (e) => patch(index, 'enabled', e.target.checked) })),
          h('button', { key: 'x', className: 'bl-link', onClick: () => setPrizeDraft((prev) => prev.filter((r, i) => i !== index)) }, '删除'),
        ]))
        return [
          h('div', { key: 'kpis', className: 'bl-kpis' }, [
            kpi('k1', '奖池总数', stats.total || 0, '件', '含停用的', 'cyan'),
            kpi('k2', '已启用', stats.enabled || 0, '件', '家长可逐条开关'),
            kpi('k3', '现在可抽', stats.drawable || 0, '件', '排除抽完/本周到上限', 'green'),
            kpi('k4', '本周抽盒', prizes.limits ? (Number(prizes.limits.weekDraws) || 0) : 0, '次', '上限 ' + ((prizes.limits && prizes.limits.weeklyBoxLimit) || '不限'), 'gold'),
          ]),
          h('div', { key: 'panel', className: 'bl-panel' }, [
            head,
            h('div', { key: 'list', className: 'bl-admin-list' }, [columns].concat(rows)),
            h('div', { key: 'note', className: 'bl-note' },
              '库存填 0 表示没了，留空 = 不限；每周上限留空 = 不限。单件抽中概率 = 该稀有度权重 ÷ 当前可抽池的总权重（常见 5 / 稀有 3 / 珍稀 1），所以改动奖品数量会改变概率。勋章赠送的奖品也计入库存和每周上限。'),
          ]),
        ]
      }

      function renderMedalAdmin() {
        if (!medalBook || !medalDraft) return [h('div', { key: 'loading', className: 'bl-empty-panel' }, '正在读勋章规则…')]
        const known = {}
        for (const row of medalBook.items || []) known[row.id] = row
        const options = [{ id: '', name: '不赠奖品' }].concat(medalBook.prizes || [])
        const patch = (index, key, value) => setMedalDraft((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
        const head = h('div', { key: 'ph', className: 'bl-panel-head' }, [
          h('b', { key: 't' }, '勋章规则 ' + medalDraft.length + ' 枚 · 已获得 ' + (medalBook.earnedCount || 0)),
          h('div', { key: 'sp', className: 'bl-spacer' }),
          h('button', { key: 'save', className: 'bl-btn bl-btn-primary', onClick: saveMedals, disabled: adminBusy }, adminBusy ? '保存中…' : '保存规则'),
        ])
        const columns = h('div', { key: 'cols', className: 'bl-prow bl-prow-medal bl-prow-head' }, [
          h('span', { key: 'g' }, ''),
          h('span', { key: 'n' }, '勋章 / 条件'),
          h('span', { key: 't' }, '门槛'),
          h('span', { key: 'x' }, '星火'),
          h('span', { key: 'p' }, '额外奖品'),
          h('span', { key: 's' }, '进度'),
        ])
        const rows = medalDraft.map((row, index) => {
          const now = known[row.id] || {}
          return h('div', { key: row.id, className: 'bl-prow bl-prow-medal' }, [
            h('span', { key: 'g', className: 'bl-prow-glyph' }, h(Glyph, { key: 'i', name: now.glyph || 'medal', size: 20, sw: 1.7 })),
            h('div', { key: 'n', className: 'bl-prow-name' }, [
              h('b', { key: 'b' }, row.name || now.name || '勋章'),
              h('em', { key: 'e' }, now.metricLabel || ''),
            ]),
            h('input', { key: 't', className: 'bl-input', type: 'number', min: 1, max: 999, value: row.target, onChange: (e) => patch(index, 'target', Number(e.target.value)) }),
            h('input', { key: 'x', className: 'bl-input', type: 'number', min: 0, max: 2000, value: row.xp, onChange: (e) => patch(index, 'xp', Number(e.target.value)) }),
            h('select', { key: 'p', className: 'bl-input', value: row.prizeId, onChange: (e) => patch(index, 'prizeId', e.target.value) },
              options.map((item) => h('option', { key: item.id || 'none', value: item.id }, (item.emoji ? item.emoji + ' ' : '') + item.name))),
            h('span', { key: 's', className: 'bl-hint' }, now.earned ? '已获得' : (Math.min(Number(now.value) || 0, Number(row.target) || 1) + ' / ' + (row.target || 1))),
          ])
        })
        return [
          h('div', { key: 'kpis', className: 'bl-kpis' }, [
            kpi('k1', '勋章数', medalDraft.length, '枚', '内置 8 枚'),
            kpi('k2', '已获得', medalBook.earnedCount || 0, '枚', '达标自动发放', 'green'),
            kpi('k3', '星火加成', medalBook.xp || 0, '点', '只来自勋章', 'gold'),
            kpi('k4', '本周看片', weekDone + '/' + weekTasks, '条', '连续 ' + streak + ' 天', 'cyan'),
          ]),
          h('div', { key: 'panel', className: 'bl-panel' }, [
            head,
            h('div', { key: 'list', className: 'bl-admin-list' }, [columns].concat(rows)),
            h('div', { key: 'note', className: 'bl-note' },
              '门槛就是「看完几条 / 答对几题 / 连续几天 / 集齐几个分类」，改小门槛会立刻补发之前已达成的勋章。星火会加成到等级经验里，额外奖品会真的从奖品池扣一件库存。'),
          ]),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：弹层                                                          */
      /* ------------------------------------------------------------------ */

      function playerNode(video) {
        if (settings.embedPlay) {
          return h('iframe', {
            key: 'frame',
            className: 'bl-frame',
            src: playerUrl(video.id),
            title: video.title || video.id,
            allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
            allowFullScreen: true,
            referrerPolicy: 'no-referrer',
          })
        }
        return h('div', { key: 'gate', className: 'bl-fallback' }, [
          h('div', { key: 'l1' }, '设置里关掉了内嵌播放，所以这里只给入口。'),
          h('div', { key: 'l2', className: 'bl-hint' }, 'iframe 被 CSP 或者 B 站拦掉的时候，也走同一个「新标签打开」。'),
          h('a', {
            key: 'go',
            className: 'bl-btn bl-btn-primary',
            style: { marginTop: '6px' },
            href: siteUrl(video.id),
            target: '_blank',
            rel: 'noreferrer',
          }, '去 B 站看这条'),
        ])
      }

      function renderPlayer() {
        const v = player
        return h('div', { key: 'player', className: 'bl-modal', onClick: () => setPlayer(null) }, [
          h('div', { key: 'dialog', className: 'bl-dialog', onClick: (e) => e.stopPropagation() }, [
            h('div', { key: 'head', className: 'bl-dialog-head' }, [
              h('span', { key: 't', className: 'bl-dialog-title' }, v.title || v.id),
              v.duration ? h('span', { key: 'd', className: 'bl-hint' }, fmtDur(v.duration)) : null,
              h('a', {
                key: 'tab',
                className: 'bl-btn bl-btn-sm',
                href: siteUrl(v.id),
                target: '_blank',
                rel: 'noreferrer',
              }, '新标签打开'),
              h('button', { key: 'x', className: 'bl-btn bl-btn-sm', onClick: () => setPlayer(null) }, '关闭'),
            ]),
            playerNode(v),
            h('div', { key: 'foot', className: 'bl-dialog-foot' }, [
              h('span', { key: 'hint', className: 'bl-hint' }, '播放器走 player.bilibili.com，弹幕默认关；要弹幕就去新标签。'),
            ]),
          ]),
        ])
      }

      function renderVideoEditor() {
        const draft = editing.draft
        const set = (patch) => setEditing({ ...editing, draft: { ...draft, ...patch } })
        const cover = coverUrl(draft.cover)
        return h('div', { key: 'editor', className: 'bl-modal', onClick: () => setEditing(null) }, [
          h('div', { key: 'dialog', className: 'bl-dialog bl-dialog-narrow', onClick: (e) => e.stopPropagation() }, [
            h('div', { key: 'head', className: 'bl-dialog-head' }, [
              h('span', { key: 't', className: 'bl-dialog-title' }, '编辑 · ' + draft.id),
              draft.dead ? h('span', { key: 'd', className: 'bl-tag bl-tag-dead' }, 'B 站已失效') : null,
              h('button', { key: 'x', className: 'bl-btn bl-btn-sm', onClick: () => setEditing(null) }, '关闭'),
            ]),
            h('div', { key: 'body', className: 'bl-dialog-body' }, [
              cover ? h('img', { key: 'cover', className: 'bl-cover-preview', src: cover, alt: '', referrerPolicy: 'no-referrer' }) : null,
              h('div', { key: 'grid', className: 'bl-form-grid' }, [
                h('div', { key: 'title', className: 'bl-field' }, [
                  h('span', { key: 'l', className: 'bl-label' }, '标题'),
                  h('input', {
                    key: 'i',
                    className: 'bl-input',
                    value: draft.title,
                    onChange: (e) => set({ title: e.target.value }),
                  }),
                ]),
                h('div', { key: 'cat', className: 'bl-field' }, [
                  h('span', { key: 'l', className: 'bl-label' }, '分类'),
                  h('input', {
                    key: 'i',
                    className: 'bl-input',
                    value: draft.category,
                    placeholder: '科学启蒙 / 儿歌 / 绘本 / 数学 / 英语',
                    onChange: (e) => set({ category: e.target.value }),
                  }),
                ]),
                h('div', { key: 'age', className: 'bl-field' }, [
                  h('span', { key: 'l', className: 'bl-label' }, '建议最低年龄'),
                  h('input', {
                    key: 'i',
                    className: 'bl-input',
                    type: 'number',
                    min: 1,
                    max: 12,
                    value: draft.minAge,
                    onChange: (e) => set({ minAge: e.target.value }),
                  }),
                ]),
                h('div', { key: 'link', className: 'bl-field' }, [
                  h('span', { key: 'l', className: 'bl-label' }, 'B 站地址'),
                  h('a', {
                    key: 'a',
                    className: 'bl-btn',
                    href: siteUrl(draft.bvid),
                    target: '_blank',
                    rel: 'noreferrer',
                  }, '打开看这条'),
                ]),
              ]),
              h('div', { key: 'reason', className: 'bl-field' }, [
                h('span', { key: 'l', className: 'bl-label' }, '为什么给他看'),
                h('textarea', {
                  key: 'i',
                  className: 'bl-textarea',
                  value: draft.reason,
                  placeholder: '比如：用动画讲清楚彩虹怎么来的，五岁能看懂',
                  onChange: (e) => set({ reason: e.target.value }),
                }),
              ]),
              h('div', { key: 'caution', className: 'bl-field' }, [
                h('span', { key: 'l', className: 'bl-label' }, '家长提醒（有广告、有一段吓人的就写这儿）'),
                h('textarea', {
                  key: 'i',
                  className: 'bl-textarea',
                  value: draft.caution,
                  placeholder: '可空',
                  onChange: (e) => set({ caution: e.target.value }),
                }),
              ]),
              h('div', { key: 'note', className: 'bl-field' }, [
                h('span', { key: 'l', className: 'bl-label' }, '备注'),
                h('textarea', {
                  key: 'i',
                  className: 'bl-textarea',
                  value: draft.note,
                  placeholder: '可空',
                  onChange: (e) => set({ note: e.target.value }),
                }),
              ]),
            ]),
            h('div', { key: 'foot', className: 'bl-dialog-foot' }, [
              h('button', { key: 'del', className: 'bl-btn bl-btn-danger', onClick: deleteVideo }, '删除这条'),
              h('div', { key: 'sp', className: 'bl-spacer' }),
              h('button', { key: 'cancel', className: 'bl-btn', onClick: () => setEditing(null) }, '取消'),
              h('button', { key: 'save', className: 'bl-btn bl-btn-primary', onClick: saveVideoEdit }, '保存'),
            ]),
          ]),
        ])
      }

      /* ------------------------------------------------------------------ */
      /* 主渲染                                                              */
      /* ------------------------------------------------------------------ */

      const body = tab === 'library'
        ? renderBridge()
        : tab === 'plan'
          ? renderPlan()
          : tab === 'watch'
            ? renderWatch()
            : tab === 'learn'
              ? renderLearn()
              : tab === 'rewards'
                ? renderRewards()
                : tab === 'lessons'
                  ? renderLessons()
                  : tab === 'vault'
                    ? renderVault()
                    : renderSettings()

      const xp = doneTotal * 40 + (rewards ? (Number(rewards.xpBonus) || 0) : 0)
      const level = 1 + Math.floor(xp / XP_STEP)
      const xpIn = xp % XP_STEP
      const railCount = (id) => id === 'library' ? String(allVideos.length)
        : id === 'plan' ? weekDone + '/' + weekTasks
          : id === 'watch' ? String(streak)
            : id === 'lessons' ? String(lessons.length)
              : id === 'vault' ? String(allVideos.length)
                : ''

      return h('div', { className: 'bl-root' }, [
        h('div', { key: 'shell', className: 'bl-shell' }, [
          h('nav', { key: 'rail', className: 'bl-rail' }, [
            h('div', { key: 'brand', className: 'bl-rail-brand' }, [h('i', { key: 'd' }), h('span', { key: 'l' }, '星火课堂 · 舰桥')]),
          ].concat(TABS.map((item) => h('button', {
            key: item.id,
            className: 'bl-rail-item' + (tab === item.id ? ' on' : ''),
            onClick: () => setTab(item.id),
            title: item.label,
          }, [
            RailIcon({ key: 'i', name: item.id, size: 17 }),
            h('span', { key: 'l' }, item.label),
            railCount(item.id) ? h('em', { key: 'c' }, railCount(item.id)) : null,
          ]))).concat([
            h('div', { key: 'sec', className: 'bl-rail-sec' }, [
              h('div', { key: 'h', className: 'bl-rail-sech' }, '分类 · 学科'),
            ].concat((library.categories || []).slice(0, 6).map((name) => h('button', {
              key: 'c' + name,
              className: 'bl-rail-item bl-rail-cat' + (category === name && tab === 'vault' ? ' on' : ''),
              title: '按「' + name + '」筛片库',
              onClick: () => {
                const next = category === name && tab === 'vault' ? '' : name
                setCategory(next)
                setTab('vault')
              },
            }, h(Glyph, { key: 'i', name: catGlyph(name), size: 15, sw: 1.7 }), h('span', { key: 'l' }, name))))),
          ]).concat([
            h('div', { key: 'foot', className: 'bl-rail-foot' }, [
              h('div', { key: 'xp', className: 'bl-xp' }, [
                h('div', { key: 'h', className: 'bl-xp-head' }, [
                  h('span', { key: 'l' }, 'Lv.' + level),
                  h('b', { key: 'v' }, xpIn + ' / ' + XP_STEP),
                ]),
                h('div', { key: 'bar', className: 'bl-xpbar gold' }, h('i', { style: { width: Math.round((xpIn / XP_STEP) * 100) + '%' } })),
              ]),
              h('div', { key: 'st', className: 'bl-xp-head' }, [
                h('span', { key: 'l' }, '连续打卡'),
                h('b', { key: 'v' }, streak + ' 天'),
              ]),
            ]),
          ])),
          h('div', { key: 'main', className: 'bl-main' }, [
            h('div', { key: 'top', className: 'bl-top' }, [
              notice ? h('div', { key: 'n', className: 'bl-top-row' }, [
                h('span', { key: 't', className: 'bl-top-title' }, TAB_TITLE[tab] || ''),
                h('div', { key: 'sp', className: 'bl-spacer' }),
                h('span', { key: 'msg', className: 'bl-notice', title: notice }, notice),
              ]) : null,
              renderHudCells(),
            ]),
            error
              ? h('div', { key: 'err', className: 'bl-err' }, [
                h('b', { key: 'l' }, '出错了'),
                h('span', { key: 'm', className: 'bl-msg', title: error }, error),
                h('button', { key: 'x', className: 'bl-btn bl-btn-sm', onClick: () => setError('') }, '知道了'),
              ])
              : null,
            h('div', { key: 'body', className: 'bl-body' }, h('div', { className: 'bl-wrap' }, body)),
          ]),
        ]),
        player ? renderPlayer() : null,
        editing ? renderVideoEditor() : null,
      ])
    }

    /* ------------------------------------------------------------------ */
    /* 插件入口                                                            */
    /* ------------------------------------------------------------------ */

    return {
      isPlugin: true,
      inject: ['slots'],
      apply(ctx) {
        ensureCss()
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL,
          order: 40,
          label: () => LABEL,
        }, LessonIcon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL,
        }, BiliPanel))
      },
    }
  },
})
