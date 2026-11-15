/**
 * B 站课堂 · 浏览器半边
 *
 * 侧栏加一个「B 站课堂」入口，主区域是原生 React 面板（不是 iframe）：
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
    const LABEL = 'B 站课堂'
    const TABS = [
      { id: 'library', label: '片库' },
      { id: 'plan', label: '本周' },
      { id: 'watch', label: '记录' },
      { id: 'lessons', label: '课卡' },
      { id: 'settings', label: '设置' },
    ]
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const DIFFICULTY = { 1: '简单', 2: '适中', 3: '进阶' }
    const DEFAULT_SETTINGS = { perDay: 2, maxAge: 6, embedPlay: false }

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
--dsw-alias-bg-layer-1:#0e1014;--dsw-alias-bg-layer-2:#14171c;--dsw-alias-bg-layer-3:#20242b;--dsw-alias-bg-layer-4:#262b33;
--dsw-alias-label-primary:#e8eaf0;--dsw-alias-label-secondary:#8b95a4;--dsw-alias-label-dimmed:#4a515e;--dsw-alias-border-l2:#262c35;--dsw-alias-brand-primary:#35d8ff;
background:#0e1014!important;color:#e8eaf0!important;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.bl-root *{box-sizing:border-box}
.bl-top{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid #232830;background:#14171c!important;flex:none}
.bl-brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;letter-spacing:.2px;white-space:nowrap}
.bl-brand-dot{width:8px;height:8px;border-radius:50%;background:#35d8ff;box-shadow:0 0 10px rgba(53,216,255,.7)}
.bl-tabs{display:flex;gap:2px;margin-left:8px;flex:none}
.bl-tab{appearance:none;height:28px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:#8b95a4;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.bl-tab:hover{color:#e8eaf0;background:#1b1f26}
.bl-tab.on{background:rgba(53,216,255,.14);color:#9fe9ff;font-weight:600}
.bl-spacer{flex:1;min-width:0}
.bl-hint{color:#78828f;font-size:11.5px}
.bl-note{color:#8b95a4;font-size:11.5px;line-height:1.7}
.bl-empty{color:#6f7885;font-size:11.5px;padding:2px 0}
.bl-notice{color:#9fe9ff;font-size:11.5px;max-width:36vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-err{display:flex;align-items:center;gap:10px;padding:8px 16px;background:rgba(255,86,86,.12);border-bottom:1px solid rgba(255,86,86,.35);color:#ffb3b3;font-size:12px;flex:none}
.bl-err b{color:#ff8a8a;flex:none}
.bl-err .bl-msg{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px 18px 34px}
.bl-wrap{width:100%;max-width:1216px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.bl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 11px;border-radius:8px;border:1px solid #2b313a;background:#20242b;color:#e8eaf0;font:inherit;font-size:12px;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}
.bl-btn:hover{background:#262b33;border-color:#3d4653}
.bl-btn:disabled{opacity:.45;cursor:default}
.bl-btn-primary{background:#35d8ff;border-color:transparent;color:#04222a;font-weight:600}
.bl-btn-primary:hover{background:#5ce2ff}
.bl-btn-danger{color:#ff8a8a;border-color:rgba(255,110,110,.35)}
.bl-btn-sm{height:24px;padding:0 8px;font-size:11px;border-radius:6px}
.bl-input{height:30px;width:100%;padding:0 10px;border-radius:8px;border:1px solid #2b313a;background:#191d24;color:#e8eaf0;font:inherit;font-size:12px;outline:none;min-width:0}
.bl-input:focus{border-color:#35d8ff;box-shadow:0 0 0 2px rgba(53,216,255,.14)}
.bl-input::placeholder{color:#5f6874}
.bl-textarea{width:100%;min-height:60px;padding:8px 10px;border-radius:8px;border:1px solid #2b313a;background:#14171c;color:#e8eaf0;font:inherit;font-size:12px;outline:none;resize:vertical;line-height:1.55}
.bl-textarea:focus{border-color:#35d8ff;box-shadow:0 0 0 2px rgba(53,216,255,.14)}
.bl-select{height:30px;padding:0 8px;border-radius:8px;border:1px solid #2b313a;background:#191d24;color:#e8eaf0;font:inherit;font-size:12px;outline:none;cursor:pointer;max-width:100%}
.bl-select:focus{border-color:#35d8ff}
.bl-select-sm{height:24px;font-size:11px;border-radius:6px;max-width:140px}
.bl-search{flex:1 1 240px;min-width:180px;max-width:340px}
.bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:12px}
.bl-card{display:flex;flex-direction:column;min-width:0;border-radius:10px;border:1px solid #262c35;background:#20242b!important;overflow:hidden}
.bl-card:hover{border-color:#39414d}
.bl-cover{position:relative;height:116px;background:#0e1014!important;cursor:pointer;overflow:hidden}
.bl-cover img{width:100%;height:100%;object-fit:cover;display:block}
.bl-card.dead .bl-cover{filter:grayscale(1) brightness(.62)}
.bl-cover-ph,.bl-mini-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#0e1014;color:#4a515e;font-size:10.5px}
.bl-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;opacity:0;transition:opacity .15s;background:rgba(6,8,12,.26)}
.bl-cover:hover .bl-play{opacity:.92}
.bl-dur{position:absolute;right:6px;bottom:6px;padding:1px 6px;border-radius:999px;background:rgba(6,8,12,.84);border:1px solid rgba(255,255,255,.12);color:#dbe3ee;font-size:10.5px;font-variant-numeric:tabular-nums}
.bl-dead{position:absolute;left:6px;top:6px;padding:1px 6px;border-radius:999px;background:rgba(255,86,86,.92);color:#fff;font-size:10px;font-weight:600}
.bl-card-body{display:flex;flex-direction:column;gap:6px;padding:8px 10px 9px;min-width:0}
.bl-card-title{appearance:none;border:0;background:transparent;padding:0;text-align:left;color:#e8eaf0;font:inherit;font-size:12.5px;font-weight:600;line-height:1.35;cursor:pointer;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-height:34px}
.bl-card-title:hover{color:#9fe9ff}
.bl-card-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.bl-tag{padding:1px 6px;border-radius:999px;background:rgba(53,216,255,.12);border:1px solid rgba(53,216,255,.28);color:#9fe9ff;font-size:10.5px;white-space:nowrap}
.bl-tag-age{background:rgba(163,230,53,.1);border-color:rgba(163,230,53,.28);color:#c8f08a}
.bl-tag-dead{background:rgba(255,86,86,.14);border-color:rgba(255,86,86,.4);color:#ff9f9f}
.bl-card-owner{color:#78828f;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.bl-card-reason{color:#8b95a4;font-size:11px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bl-card-foot{display:flex;align-items:center;gap:6px;margin-top:2px}
.bl-card-id{color:#5c6672;font-size:10px;font-family:ui-monospace,Consolas,monospace}
.bl-empty-panel{padding:18px 16px;border:1px dashed #2c333d;border-radius:10px;background:#14171c;color:#8b95a4;font-size:12.5px;line-height:1.8}
.bl-week{display:flex;flex-direction:column;gap:10px}
.bl-day{border:1px solid #262c35;border-radius:10px;background:#171b21!important;padding:10px 12px}
.bl-day.today{border-color:rgba(53,216,255,.4)}
.bl-day-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.bl-day-name{font-weight:600;font-size:12.5px;color:#cfd8e4}
.bl-day.today .bl-day-name{color:#9fe9ff}
.bl-day-date{color:#78828f;font-size:11.5px;font-variant-numeric:tabular-nums}
.bl-badge-today{padding:1px 7px;border-radius:999px;background:rgba(53,216,255,.14);border:1px solid rgba(53,216,255,.4);color:#9fe9ff;font-size:10.5px}
.bl-day-body{display:flex;flex-direction:column;gap:6px}
.bl-day-add{padding-top:6px}
.bl-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#20242b!important;border:1px solid #262c35;min-width:0}
.bl-row:hover{border-color:#333b46}
.bl-mini{width:72px;height:44px;flex:none;border-radius:6px;overflow:hidden;background:#0e1014}
.bl-mini img{width:100%;height:100%;object-fit:cover;display:block}
.bl-row-main{flex:1;min-width:0}
.bl-row-title{appearance:none;border:0;background:transparent;padding:0;display:block;width:100%;text-align:left;color:#e8eaf0;font:inherit;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.bl-row-title:hover{color:#9fe9ff}
.bl-row-sub{color:#78828f;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl-check{appearance:none;width:22px;height:22px;padding:0;flex:none;border-radius:6px;border:1px solid #3a424f;background:#14171c;color:#35d8ff;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.bl-check.on{background:rgba(53,216,255,.16);border-color:rgba(53,216,255,.6);color:#9fe9ff}
.bl-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.bl-stat-box{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid #262c35;border-radius:10px;background:#171b21!important}
.bl-stat-box b{font-size:20px;line-height:1.2;color:#9fe9ff;font-variant-numeric:tabular-nums}
.bl-stat-box span{font-size:11.5px;color:#8b95a4}
.bl-split{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px;align-items:start}
.bl-list{display:flex;flex-direction:column;gap:3px;border:1px solid #262c35;border-radius:10px;background:#171b21!important;padding:6px;max-height:calc(100vh - 210px);overflow:auto}
.bl-list-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;cursor:pointer;font-size:12px;color:#c3ccd9;min-width:0}
.bl-list-item:hover{background:#1f242c}
.bl-list-item.on{background:rgba(53,216,255,.14);color:#9fe9ff}
.bl-list-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-list-flag{font-size:10px;color:#61707f;white-space:nowrap;flex:none}
.bl-list-flag.on{color:#9fe9ff}
.bl-panel{display:flex;flex-direction:column;gap:10px;border:1px solid #262c35;border-radius:10px;background:#171b21!important;padding:12px;min-width:0}
.bl-panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.bl-panel-head b{font-size:12.5px;font-weight:600;color:#cfd8e4}
.bl-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.bl-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.bl-label{color:#8b95a4;font-size:11px}
.bl-q{display:flex;flex-direction:column;gap:8px;border:1px solid #262c35;border-radius:9px;background:#1b1f26!important;padding:10px}
.bl-q-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-q-no{font-weight:600;font-size:12px;color:#cfd8e4;white-space:nowrap}
.bl-opts{display:flex;flex-direction:column;gap:6px}
.bl-opt-row{display:flex;align-items:center;gap:8px}
.bl-opt-row input[type=radio]{accent-color:#35d8ff;width:14px;height:14px;flex:none;cursor:pointer}
.bl-export{font-family:ui-monospace,Consolas,monospace;font-size:11px;min-height:170px}
.bl-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(4,6,10,.78)}
.bl-dialog{width:min(900px,96vw);max-height:92vh;display:flex;flex-direction:column;border-radius:12px;border:1px solid #2c333d;background:#14171c!important;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.6)}
.bl-dialog-narrow{width:min(580px,96vw)}
.bl-dialog-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #262c35;background:#171b21!important;flex:none}
.bl-dialog-title{flex:1;min-width:0;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl-dialog-body{padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;min-height:0}
.bl-dialog-foot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #262c35;background:#171b21!important;flex:none}
.bl-frame{width:100%;aspect-ratio:16/9;background:#000;border:0;display:block}
.bl-fallback{padding:18px 16px;color:#a2acbb;font-size:12.5px;line-height:1.8;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.bl-cover-preview{width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:1px solid #262c35;display:block}
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
      const [exportText, setExportText] = useState('')
      const [settings, setSettings] = useState(DEFAULT_SETTINGS)
      const [settingsBusy, setSettingsBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')

      const noticeTimer = useRef(null)
      const filterRef = useRef({ q: '', category: '' })

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
        } catch (e) {
          fail(e)
        }
      }

      /* ---------------- 课卡操作 ---------------- */

      function openLesson(videoId) {
        const existing = lessons.find((l) => l.videoId === videoId)
        setLessonVideo(videoId)
        setLessonDraft(existing ? draftOf(existing) : blankDraft(videoId))
        setExportText('')
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
          setExportText('')
          flash('课卡已删，这条视频回到待写')
        } catch (e) {
          fail(e)
        }
      }

      async function copyExport() {
        setError('')
        try {
          const suffix = plan && plan.weekStart ? '?weekStart=' + encodeURIComponent(plan.weekStart) : ''
          const data = await api('/export' + suffix)
          const text = JSON.stringify(data, null, 2)
          setExportText(text)
          let copied = false
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(text)
              copied = true
            }
          } catch (clipError) {
            copied = false
          }
          flash(copied
            ? '已复制导出 JSON（' + (text.length / 1024).toFixed(1) + ' KB）'
            : '浏览器没让写剪贴板，全文放在下面了，点一下全选手动复制')
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
          }
          const data = await send('/settings', 'PUT', payload)
          setSettings(normalizeSettings(data.settings || data))
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

      function renderLibrary() {
        const items = library.items || []
        const stats = library.stats || { total: 0, dead: 0 }
        const filtered = Boolean(q.trim() || category)
        const emptyText = filtered
          ? '没搜到' + (q.trim() ? '「' + q.trim() + '」' : '这个分类') + '的片子，换个词，或者把筛选清空。'
          : '片库还是空的。把想给他看的 B 站链接粘到上面那行，点「加一条」，服务端会自己去拉标题、封面和时长。'
        return [
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
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('button', {
              key: 'refresh',
              className: 'bl-btn',
              onClick: refreshDead,
              disabled: refreshing || !allVideos.length,
            }, refreshing ? '正在问 B 站…' : '校验失效'),
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
          h('div', { key: 'thumb', className: 'bl-mini' },
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
        const isToday = day.date === today
        return h('div', { key: day.date, className: 'bl-day' + (isToday ? ' today' : '') }, [
          h('div', { key: 'head', className: 'bl-day-head' }, [
            h('span', { key: 'w', className: 'bl-day-name' }, weekdayLabel(day.date)),
            h('span', { key: 'd', className: 'bl-day-date' }, shortDate(day.date)),
            isToday ? h('span', { key: 't', className: 'bl-badge-today' }, '今天') : null,
            h('span', { key: 'n', className: 'bl-hint' }, ids.length ? ids.length + ' 条' : ''),
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
          h('div', { key: 'bar', className: 'bl-toolbar' }, [
            h('span', { key: 'w', className: 'bl-day-name' }, '本周 · ' + weekStart),
            h('span', { key: 's', className: 'bl-hint' },
              days.length
                ? '每天 ' + (plan.perDay || settings.perDay) + ' 条 · ' + (planDirty ? '有改动还没保存' : '和服务端一致')
                : '还没排过'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('button', { key: 'auto', className: 'bl-btn', onClick: autoPlan, disabled: planBusy }, planBusy ? '排着呢…' : '自动排本周'),
            h('button', { key: 'save', className: 'bl-btn bl-btn-primary', onClick: savePlan, disabled: planBusy || !planDirty }, '保存'),
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
          h('div', { key: 'thumb', className: 'bl-mini' },
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
          h('div', { key: 'stats', className: 'bl-stats' }, [
            h('div', { key: 'a', className: 'bl-stat-box' }, [h('b', {}, String(weekCount)), h('span', {}, '本周看了（条）')]),
            h('div', { key: 'b', className: 'bl-stat-box' }, [h('b', {}, String(streak)), h('span', {}, '连续打卡（天）')]),
            h('div', { key: 'c', className: 'bl-stat-box' }, [h('b', {}, String(doneTotal)), h('span', {}, '近 14 天（条）')]),
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
          return h('div', { key: 'hint', className: 'bl-empty-panel' },
            '左边选一条视频，就能写它的课卡：一个主题加 3 到 5 道选择题。')
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
              disabled: draft.questions.length >= 5,
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
            h('span', { key: 'n', className: 'bl-hint' }, '共 ' + draft.questions.length + ' 道题（要 3 到 5 道）'),
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
          h('div', { key: 'split', className: 'bl-split' }, [
            h('div', { key: 'left', className: 'bl-list' },
              list.length ? list : [h('div', { key: 'e', className: 'bl-empty' }, '片库还没片子，先去「片库」加一条')]),
            renderLessonEditor(),
          ]),
          h('div', { key: 'export', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [
              h('b', { key: 't' }, '导出'),
              h('span', { key: 'h', className: 'bl-hint' }, '格式对齐小步乐园的课程 JSON，直接粘过去就能用'),
              h('div', { key: 'sp', className: 'bl-spacer' }),
              h('button', { key: 'copy', className: 'bl-btn bl-btn-primary', onClick: copyExport }, '复制导出 JSON'),
            ]),
            exportText
              ? h('textarea', {
                key: 'ta',
                className: 'bl-textarea bl-export',
                value: exportText,
                readOnly: true,
                spellCheck: false,
                onFocus: (e) => e.target.select(),
              })
              : h('div', { key: 'note', className: 'bl-note' }, '点「复制导出 JSON」会调 GET /export 并写进剪贴板；剪贴板被拦的话，全文会留在下面这块。'),
          ]),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：设置                                                          */
      /* ------------------------------------------------------------------ */

      function renderSettings() {
        return [
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
                  key: 'i',
                  className: 'bl-input',
                  type: 'number',
                  min: 1,
                  max: 6,
                  value: settings.perDay,
                  onChange: (e) => setSettings({ ...settings, perDay: Number(e.target.value) }),
                }),
              ]),
              h('div', { key: 'maxAge', className: 'bl-field' }, [
                h('span', { key: 'l', className: 'bl-label' }, '片库默认年龄（新加片子的建议最低年龄）'),
                h('input', {
                  key: 'i',
                  className: 'bl-input',
                  type: 'number',
                  min: 1,
                  max: 12,
                  value: settings.maxAge,
                  onChange: (e) => setSettings({ ...settings, maxAge: Number(e.target.value) }),
                }),
              ]),
              h('label', { key: 'embed', className: 'bl-field', style: { flexDirection: 'row', alignItems: 'center', gap: '8px' } }, [
                h('input', {
                  key: 'i',
                  type: 'checkbox',
                  checked: settings.embedPlay,
                  style: { accentColor: '#35d8ff', width: '15px', height: '15px' },
                  onChange: (e) => setSettings({ ...settings, embedPlay: e.target.checked }),
                }),
                h('span', { key: 'l', className: 'bl-label', style: { fontSize: '12px' } }, '点开视频直接内嵌播放'),
              ]),
            ]),
            h('div', { key: 'note', className: 'bl-note' },
              '这一版设置只影响默认值：perDay 决定「自动排本周」每天排几条，maxAge 是新加片子的默认年龄，embedPlay 决定点开时直接内嵌播放还是只给入口。已经排好的计划和片库里的年龄不会被改动。'),
          ]),
          h('div', { key: 'state', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [h('b', { key: 't' }, '现在这台的存量')]),
            h('div', { key: 'body', className: 'bl-note' },
              '片库 ' + allVideos.length + ' 条 · 课卡 ' + lessons.length + ' 套 · 本周从 ' + weekStart + ' 开始'),
            h('div', { key: 'hint', className: 'bl-hint' }, '数据都在服务端的 ~/.dsh/bili-lesson/ 里，换浏览器不会丢。'),
          ]),
        ]
      }

      /* ------------------------------------------------------------------ */
      /* 渲染：弹层                                                          */
      /* ------------------------------------------------------------------ */

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
            settings.embedPlay
              ? h('iframe', {
                key: 'frame',
                className: 'bl-frame',
                src: playerUrl(v.id),
                title: v.title || v.id,
                allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
                allowFullScreen: true,
                referrerPolicy: 'no-referrer',
              })
              : h('div', { key: 'gate', className: 'bl-fallback' }, [
                h('div', { key: 'l1' }, '设置里关掉了内嵌播放，所以这里只给入口。'),
                h('div', { key: 'l2', className: 'bl-hint' }, 'iframe 被 CSP 或者 B 站拦掉的时候，也走同一个「新标签打开」。'),
                h('a', {
                  key: 'go',
                  className: 'bl-btn bl-btn-primary',
                  style: { marginTop: '6px' },
                  href: siteUrl(v.id),
                  target: '_blank',
                  rel: 'noreferrer',
                }, '去 B 站看这条'),
              ]),
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
        ? renderLibrary()
        : tab === 'plan'
          ? renderPlan()
          : tab === 'watch'
            ? renderWatch()
            : tab === 'lessons'
              ? renderLessons()
              : renderSettings()

      return h('div', { className: 'bl-root' }, [
        h('header', { key: 'top', className: 'bl-top' }, [
          h('div', { key: 'brand', className: 'bl-brand' }, [
            h('span', { key: 'dot', className: 'bl-brand-dot' }),
            h('span', { key: 'label' }, LABEL),
          ]),
          h('div', { key: 'tabs', className: 'bl-tabs' }, TABS.map((item) => h('button', {
            key: item.id,
            className: 'bl-tab' + (tab === item.id ? ' on' : ''),
            onClick: () => setTab(item.id),
          }, item.label))),
          h('div', { key: 'sp', className: 'bl-spacer' }),
          notice ? h('span', { key: 'notice', className: 'bl-notice', title: notice }, notice) : null,
          h('span', { key: 'stat', className: 'bl-hint' },
            allVideos.length + ' 条片子 · ' + lessons.length + ' 套课卡'),
        ]),
        error
          ? h('div', { key: 'err', className: 'bl-err' }, [
            h('b', { key: 'l' }, '出错了'),
            h('span', { key: 'm', className: 'bl-msg', title: error }, error),
            h('button', { key: 'x', className: 'bl-btn bl-btn-sm', onClick: () => setError('') }, '知道了'),
          ])
          : null,
        h('div', { key: 'body', className: 'bl-body' }, h('div', { className: 'bl-wrap' }, body)),
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
