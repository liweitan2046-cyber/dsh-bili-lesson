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
      { id: 'learn', label: '学习' },
      { id: 'rewards', label: '奖励' },
      { id: 'lessons', label: '课卡' },
      { id: 'settings', label: '设置' },
    ]
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const DIFFICULTY = { 1: '简单', 2: '适中', 3: '进阶' }
    const RARITY = { common: '常见', rare: '稀有', epic: '珍稀' }
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
.bl-hud-chip{display:flex;align-items:baseline;gap:5px;padding:3px 9px;border-radius:6px;border:1px solid var(--bl-line);background:rgba(6,14,24,.72);font-size:10px;letter-spacing:.6px;color:var(--bl-dim);text-transform:uppercase;white-space:nowrap}
.bl-hud-chip b{font-size:12.5px;font-weight:700;color:#cdf6ff;letter-spacing:.4px;font-variant-numeric:tabular-nums;text-shadow:0 0 12px rgba(53,216,255,.4)}
.bl-hud-chip.gold b{color:#ffd88a;text-shadow:0 0 12px rgba(255,196,77,.45)}
.bl-hud-bar{width:54px;height:5px;border-radius:3px;background:rgba(96,176,255,.16);overflow:hidden;align-self:center}
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
.bl-day.today::before{border-color:#35d8ff;background:radial-gradient(circle at 40% 35%,#e6fbff,#35d8ff);box-shadow:0 0 14px rgba(53,216,255,.9),0 0 26px rgba(53,216,255,.5)}
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
.bl-check{appearance:none;width:24px;height:24px;padding:0;flex:none;border-radius:5px;border:1px solid rgba(96,176,255,.4);background:rgba(6,14,24,.9);color:var(--bl-cyan);font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .18s,box-shadow .18s}
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
.bl-panel{position:relative;display:flex;flex-direction:column;gap:10px;border:1px solid var(--bl-line);border-radius:var(--bl-r);background:linear-gradient(180deg,rgba(16,30,50,.82),rgba(8,16,28,.9))!important;padding:13px;min-width:0}
.bl-panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.bl-panel-head b{font-size:12.5px;font-weight:700;color:#d6e8fb;letter-spacing:.5px}
.bl-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.bl-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.bl-label{color:var(--bl-muted);font-size:11px;letter-spacing:.4px}
.bl-q{display:flex;flex-direction:column;gap:8px;border:1px solid var(--bl-line);border-radius:8px;background:rgba(10,20,34,.8)!important;padding:10px}
.bl-q-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-q-no{font-weight:700;font-size:12px;color:#d6e8fb;white-space:nowrap;letter-spacing:.5px}
.bl-opts{display:flex;flex-direction:column;gap:6px}
.bl-opt-row{display:flex;align-items:center;gap:8px}
.bl-opt-row input[type=radio]{accent-color:#35d8ff;width:14px;height:14px;flex:none;cursor:pointer}
.bl-export{font-family:ui-monospace,Consolas,monospace;font-size:11px;min-height:170px;background:rgba(3,8,16,.92)!important}
.bl-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 50% 40%,rgba(10,30,50,.72),rgba(2,4,8,.92));backdrop-filter:blur(3px)}
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
      const [learnPick, setLearnPick] = useState('')
      const [learnPicks, setLearnPicks] = useState({})
      const [learnOutcome, setLearnOutcome] = useState(null)
      const [learnBusy, setLearnBusy] = useState(false)
      const [rewards, setRewards] = useState(null)
      const [rewardBusy, setRewardBusy] = useState(false)
      const [lastDraw, setLastDraw] = useState(null)
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

      const PLANET_COLORS = ['#35d8ff', '#7ad7ff', '#ffc44d', '#37e0a0', '#9b8cff', '#ff8fb1', '#4ea8ff', '#a8e05f', '#ffb454']

      function renderStarMap() {
        const cats = (library.categories || []).filter(Boolean)
        if (!cats.length) return null
        const counts = {}
        ;(library.items || []).forEach((v) => {
          const key = v.category || '未分类'
          counts[key] = (counts[key] || 0) + 1
        })
        const weekCount = (plan && plan.days ? plan.days : []).reduce((n, d) => n + (d.videoIds || []).length, 0)
        const cx = 500
        const cy = 165
        const rx = 386
        const ry = 108
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
          h('circle', { key: 'halo', cx, cy, r: 58, fill: 'rgba(255,196,77,.12)' }),
          h('circle', { key: 'ring', cx, cy, r: 44, fill: 'none', stroke: 'rgba(255,196,77,.55)', strokeWidth: 1.2, strokeDasharray: '4 6' }),
          h('circle', { key: 'body', cx, cy, r: 36, fill: 'url(#blHub)', filter: 'url(#blGlow)' }),
          h('text', { key: 't1', x: cx, y: cy + 4, textAnchor: 'middle', className: 'bl-planet-count', style: { fill: '#3a2400', fontWeight: 700, fontSize: '15px' } }, weekCount || 0),
          h('text', { key: 't2', x: cx, y: cy + 70, textAnchor: 'middle', className: 'bl-planet-label', style: { fill: '#ffd88a' } }, '本周航线'),
          h('text', { key: 't3', x: cx, y: cy + 86, textAnchor: 'middle', className: 'bl-planet-count' }, weekCount ? weekCount + ' 个任务' : '还没排片'),
        ])
        const planets = nodes.map((n, i) => h('g', {
          key: n.name,
          className: 'bl-planet' + (n.on ? ' on' : ''),
          style: { cursor: 'pointer' },
          onClick: () => setCategory(category === n.name ? '' : n.name),
        }, [
          h('circle', { key: 'ring', className: 'bl-planet-ring', cx: n.x, cy: n.y, r: 30, fill: 'none', stroke: n.color, strokeOpacity: n.on ? 0.9 : 0.32, strokeWidth: 1, strokeDasharray: '3 7' }),
          h('circle', { key: 'body', className: 'bl-planet-body', cx: n.x, cy: n.y, r: 17, fill: 'url(#blg' + i + ')', filter: 'url(#blGlow)' }),
          h('text', { key: 'name', x: n.x, y: n.y + 46, textAnchor: 'middle', className: 'bl-planet-label', style: { fill: n.on ? '#cdf6ff' : '#d6e8fb' } }, n.name),
          h('text', { key: 'count', x: n.x, y: n.y + 61, textAnchor: 'middle', className: 'bl-planet-count' }, n.count + ' 条'),
        ]))
        return h('div', { key: 'map', className: 'bl-map' }, [
          h('div', { key: 'legend', className: 'bl-map-legend' }, [
            h('b', { key: 'l' }, '星域总览'),
            h('span', { key: 's1' }, cats.length + ' 个分类 · ' + (stats.total || (library.items || []).length) + ' 条片子'),
            h('div', { key: 'sp', className: 'bl-spacer' }),
            h('span', { key: 's2' }, category ? '当前：' + category + '（再点一次取消）' : '点星球筛选分类'),
          ]),
          h('svg', { key: 'svg', viewBox: '0 0 1000 330', 'aria-hidden': 'true' }, [defs, orbits, spokes, hub, planets]),
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
          renderStarMap(),
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

      useEffect(() => {
        if (tab !== 'learn' && tab !== 'rewards') return
        loadRewards().catch((e) => fail(e))
      }, [tab, loadRewards, fail])

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
          h('span', { key: 'e', className: 'bl-sticker-emoji' }, lastDraw.emoji || '🎁'),
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

        return [
          h('div', { key: 'split', className: 'bl-split' }, [
            h('div', { key: 'left', className: 'bl-list' }, rows.length
              ? rows
              : [h('div', { key: 'e', className: 'bl-empty' }, '还没有能学的片子：先去「本周」排片，或去「片库」加片')]),
            right,
          ]),
        ]
      }

      function renderRewards() {
        const view = rewards
        if (!view) return [h('div', { key: 'loading', className: 'bl-empty-panel' }, '正在读奖励账本…')]
        const byItem = {}
        for (const item of view.items) byItem[item.id] = item
        const wall = view.items.map((item) => h('div', {
          key: item.id,
          className: 'bl-sticker ' + (item.rarity || 'common') + (item.count > 0 ? '' : ' locked'),
          title: item.name,
        }, [
          h('span', { key: 'e', className: 'bl-sticker-emoji' }, item.count > 0 ? item.emoji : '？'),
          h('span', { key: 'n', className: 'bl-sticker-name' }, item.count > 0 ? item.name : '还没抽到'),
          h('span', { key: 'm', className: 'bl-sticker-meta' }, RARITY[item.rarity] || '奖品'),
          h('span', { key: 'c', className: 'bl-sticker-count' }, item.count > 0 ? ('×' + item.count) : '—'),
        ]))
        const recent = (view.draws || []).slice(0, 10).map((row) => {
          const item = byItem[row.itemId] || null
          return h('div', { key: row.id || String(row.at), className: 'bl-draw-row' }, [
            h('span', { key: 'e', className: 'bl-sticker-emoji' }, item ? item.emoji : '🎁'),
            h('span', { key: 'n', style: { flex: '1', minWidth: '0' } }, item ? item.name : '奖品'),
            h('span', { key: 't', className: 'bl-hint' }, timeText(row.at)),
          ])
        })
        const owned = view.items.filter((item) => item.count > 0).length
        return [
          h('div', { key: 'wallet', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [
              h('b', { key: 't' }, '盲盒'),
              h('div', { key: 'sp', className: 'bl-spacer' }),
              h('button', {
                key: 'draw',
                className: 'bl-btn bl-btn-primary',
                disabled: rewardBusy || view.available <= 0,
                onClick: drawBox,
              }, rewardBusy ? '开盒中…' : (view.available > 0 ? ('抽一个盲盒（' + view.available + '）') : '没有可抽的盲盒了')),
            ]),
            h('div', { key: 'stats', className: 'bl-stats' }, [
              h('div', { key: 'a', className: 'bl-stat-box' }, [h('b', { key: 'n' }, String(view.available)), h('span', { key: 'l' }, '可抽次数')]),
              h('div', { key: 'e', className: 'bl-stat-box' }, [h('b', { key: 'n' }, String(view.earned)), h('span', { key: 'l' }, '累计得到')]),
              h('div', { key: 'u', className: 'bl-stat-box' }, [h('b', { key: 'n' }, String(view.used)), h('span', { key: 'l' }, '已经抽掉')]),
            ]),
            renderDrawCard(),
            h('div', { key: 'note', className: 'bl-note' }, '看完视频把课卡题目答完，得分到 80 就能拿一个盲盒；同一套课卡每天只给一个。抽到的奖品都收在这面墙上。'),
          ]),
          h('div', { key: 'wall', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [
              h('b', { key: 't' }, '奖品墙'),
              h('span', { key: 'h', className: 'bl-hint' }, owned + ' / ' + view.items.length + ' 集齐'),
            ]),
            h('div', { key: 'grid', className: 'bl-stickers' }, wall),
          ]),
          h('div', { key: 'recent', className: 'bl-panel' }, [
            h('div', { key: 'head', className: 'bl-panel-head' }, [h('b', { key: 't' }, '最近抽到的')]),
            recent.length
              ? h('div', { key: 'list', className: 'bl-draws' }, recent)
              : h('div', { key: 'empty', className: 'bl-empty' }, '还没抽过。答完一套课卡，来开第一个盲盒。'),
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
        ? renderLibrary()
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
          h('div', { key: 'hud', className: 'bl-hud' }, [
            h('span', { key: 'v', className: 'bl-hud-chip' }, ['片库', h('b', { key: 'n' }, String(allVideos.length))]),
            h('span', { key: 'w', className: 'bl-hud-chip gold' }, [
              '本周',
              h('b', { key: 'n' }, String(weekDone) + '/' + String(weekTasks)),
              h('i', { key: 'bar', className: 'bl-hud-bar' }, h('i', { style: { width: (weekRatio * 100).toFixed(0) + '%' } })),
            ]),
            h('span', { key: 's', className: 'bl-hud-chip' }, ['打卡', h('b', { key: 'n' }, String(streak))]),
            h('span', { key: 'l', className: 'bl-hud-chip' }, ['课卡', h('b', { key: 'n' }, String(lessons.length))]),
          ]),
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
