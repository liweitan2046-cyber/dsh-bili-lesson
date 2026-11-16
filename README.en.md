# Spark Classroom · dsh-bili-lesson

[中文](./README.md) | **English**

A Bilibili learning panel for your own kid, mounted in the sidebar of the
[DeepSeek Harness](https://github.com/deepseek-ai) desktop app:
**parent picks the clips → the week gets scheduled → the kid watches and ticks it off → a quiz card goes with the clip → submit and get scored → missed questions come back → blind boxes and medals**.

It is not a recommendation algorithm and not a question generator — the parent chooses every clip and writes every question. The plugin is only the machine that does *schedule + check-in + grading + rewards*.

![Home](docs/screenshots/home.png)

## What it does

| Page | What it does |
|---|---|
| Bridge home | Today's tasks / this week's arc route / category star map; the "current course" card on the right carries cover, learning goals, progress and a "start learning" button |
| Vault (library) | Paste a BV id or a full Bilibili link to add a clip; you fill in category, minimum age and your own reason; "check dead" probes the whole library at once |
| This week's route | Seven days of scheduling — "auto schedule" (rotates categories, skips dead clips and anything used in the last three weeks) or swap a clip by hand |
| Log | Tick clips off day by day; this week's count, streak, last 7 days as bars |
| Training bay | Official player plus this week's clip list on the left, the quiz card on the right; answer question by question, submit and get scored — 80 points earns one blind box that day |
| Mistakes | Every question missed on submit lands here automatically; tap an option to redo it on the spot, a correct answer marks it "mastered" |
| Medal hall | 8 medals (granted automatically when a threshold is met, progress shown until then) + blind box + prize pool + recent draws |
| Card workshop | One quiz card per video, 3–8 questions each |
| Bridge settings | Clips per day / default age / weekly box cap; the 54-item prize pool with stock and weights; medal thresholds; **parent-lock PIN** |

## Requirements

- DeepSeek Harness desktop **0.2.2-rc.x** (verified on 0.2.2-rc.3). The plugin loads through a cordis patch and the client-side
  `__ModuleLoader__` factory, and relies on `@deepseek-ai/dsh-client-runtime` injection, so **a major platform bump may require changes here**.
- Node 24 / pnpm (the runtime shipped with DSH is fine). The plugin has no third-party dependencies besides `react`.

## Install

```powershell
git clone <this repo> dsh-bili-lesson
cd dsh-bili-lesson
pwsh -ExecutionPolicy Bypass -File .\install.ps1
```

The script backs up the profile's `package.json`, registers the plugin as a `link:` dependency, appends it to
`dsh.profile.bundles`, and runs `pnpm install` once. Then **quit the desktop app completely and start it again**
(tray icon included) — "星火课堂" appears in the sidebar. To undo, run the same command with `-Uninstall`.

The same thing by hand:

```powershell
# 1. edit $env:USERPROFILE/.dsh/profiles/desktop/package.json
#    dependencies["dsh-bili-lesson"] = "link:<absolute path to this repo, forward slashes>"
#    append "dsh-bili-lesson" to dsh.profile.bundles
# 2. cd "$env:USERPROFILE/.dsh/profiles/desktop"; pnpm install
# 3. restart the desktop app
```

> Installed under the older name (`@local/dsh-bili-lesson`)? The script removes the stale registration for you.

## Self-check

```powershell
npm run check        # node --check on eight files
npm test             # boots a real HTTP server and runs selftest (85 cases; it really calls the Bilibili view API once)
npm run check:load   # simulates the DSH loader: server and client both load, factory id == package name
```

## Data

Everything stays local in `~/.dsh/bili-lesson/` (`BILI_LESSON_HOME` overrides it). No cloud sync, no telemetry:

| File | Contents |
|---|---|
| `videos.json` | the library, keyed by BV id |
| `plans.json` | per-week plan, keyed by the Monday date |
| `watch.json` | viewing records (the ticks) |
| `lessons.json` | quiz cards |
| `settings.json` | clips per day / default age / embedded playback / weekly box cap / parent lock |
| `attempts.json` | submissions (per question qid / choice / correct, score, whether a box was granted) |
| `mistakes.json` | mastery state per missed question (`lessonId:qid` → resolved / tries / lastChoice / at) |
| `rewards.json` · `honors.json` | draw history / medals already granted |
| `prizes.json` · `medals.json` | prize pool and medal rules once a parent edited them (built-in defaults otherwise) |

Writes go through a temp file plus rename; a half-written JSON reads as empty, so a damaged file never blocks the panel from opening.

## Interface

The panel and the backend only talk over HTTP: see [CONTRACT.md](./CONTRACT.md), and
[CONTRACT-LEARNING-LOOP.md](./CONTRACT-LEARNING-LOOP.md) for the learning-loop data contract.
Every route lives under the `/bili-lesson/` prefix and goes through DSH's own auth (anonymous requests get 401).

## Security notes (please actually read this)

- **The parent lock is a soft lock, not encryption**: the PIN is stored as a salted sha256 in `settings.json`, and the unlock
  state lives in `sessionStorage` for 30 minutes. It stops "the kid taps into settings and edits the prize pool", not
  "someone who knows computers". Forgotten PIN? Delete the `parentPin` field from `settings.json`.
- Outbound requests are of exactly two kinds: Bilibili's `api.bilibili.com/x/web-interface/view` (title / cover / duration,
  anonymous) and the cover CDN. No danmaku scraping, no stream proxying, no account cookies.
- Embedded playback uses the official `player.bilibili.com` iframe, up to roughly 480p; if CSP blocks it, "open in a new tab" is the fallback.

## License and credits

- This repository's code: MIT, see [LICENSE](./LICENSE).
- The clip sources and the "parent-curated, no algorithm" idea come from [bilipicks](https://github.com/limin112/bilipicks)
  (MIT, Copyright (c) 2026 MinLiBuilds) — thank you.
- **Bilibili content is not redistributed with this repository**: no videos, audio or question content are included, only code
  and UI screenshots. Covers are hot-linked and playback is the official iframe; follow the Bilibili terms of service when using it.
- The default 54 prizes and 8 medals are editable sample data — replace the whole set in "bridge settings".

## Screenshots

| Training bay | Mistakes | Medal hall |
|---|---|---|
| ![](docs/screenshots/learn.png) | ![](docs/screenshots/mistakes.png) | ![](docs/screenshots/rewards.png) |

## Known limitations

- The library is filled in by hand or by an AI assistant; there is no built-in search, because Bilibili's search API needs a wbi signature and returns 412 when called directly.
- No AI-written questions: the parent writes them (the template only fills the fields correctly), so the kid never gets a question the parent was unsure about.
- One machine, one profile — no multi-child profiles and no cloud backup; to move machines, copy `~/.dsh/bili-lesson/` by hand.
