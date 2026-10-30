# 🔥 Competitive Programming Streak

Duolingo-style daily streaks for competitive programming. A Manifest V3 Chrome extension with a
React + Tailwind popup and a full dashboard.

**Daily goal:** 30 active minutes on a tracked site **or** 1 accepted submission (both configurable).

## Install

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `dist/` folder.
Pin the 🔥 icon. The badge on it shows your current streak: orange once today is done, grey until then.

`npm run dev` serves the popup and dashboard as a normal web page with sample data (demo mode), so you can work on the UI without reloading the extension.

## How tracking works

| Piece | File | What it does |
| --- | --- | --- |
| Manifest | `public/manifest.json` | MV3: `storage`, `tabs`, `idle`, `alarms`, `notifications`; content script on the target sites |
| Timer | `src/background.js` | Counts time only while a tracked site is the **active tab** of the **focused** window **and** you're not idle (`chrome.idle`). It saves elapsed time on every tab, focus or idle change and every 30 s, and caps each chunk at 90 s so sleep or a suspended worker can't over-count. |
| Solves | `public/content.js` | Watches judge pages for *new* accepted verdicts. Codeforces: your rows in live submission tables. CSES: result pages submitted today. USACO: graded results. HackerRank: the "solved" banner. |
| Codeforces API | `src/background.js` | Set your handle in Settings and accepted submissions are pulled from `user.status` every 5 min. This is the most reliable source. |
| Engine | `src/lib/core.js` | Goal checks, streaks, weekly freeze, badges. Pure functions shared by the worker and the UI. |
| Popup | `src/popup/Popup.jsx` | Flame + streak, week strip, progress ring, live tracking status, + Log solve (with undo), today's solves with links and Remove |
| Dashboard | `src/dashboard/Dashboard.jsx` | Stats, 53-week heat map, recent solves (linked, removable), achievements, 14-day chart, per-platform breakdown, settings, export/import |
| Desktop helper | `native/` | Optional (macOS). Lets time in **Python IDLE** count. While the browser isn't focused, the extension asks this helper which app is in front. |

**Python IDLE:** run this once from the project folder. Your extension ID is on its card on the extensions page, and the
dashboard's Settings shows the full command with it filled in:

```bash
python3 native/install.py <extension-id>
```

It registers the helper with every Chromium browser it finds (Chrome, Arc, Brave, Edge, Chromium) and copies it to
`~/Library/Application Support/CompetitiveProgrammingStreak/`. macOS won't let a browser-launched program read files in
Documents, Desktop or Downloads, so the helper can't run from the project folder. If you edit `native/desktop_host.py`, run
the installer again. The helper only reports the front app's name and bundle ID, using macOS's built-in `lsappinfo`. It needs
no special permissions, and `python3 native/install.py --uninstall` removes it. IDLE started from Terminal with `idle3` runs inside Python.app, so other
Python windows (turtle, tkinter) count too.

**Platforms:** usaco.org, usaco.guide, codeforces.com (and mirrors), cses.fi, and hackerrank.com are built in.
Add any other site (AtCoder, LeetCode, a portfolio or profile page, even a path such as `example.dev/cp`) under
**Settings → Tracked platforms**. Custom sites count toward time. Log their solves with **+ Log solve** in the popup.

**Streak freeze:** when it's on, one missed day per Mon–Sun week is covered automatically. The missed day shows
❄ / blue and keeps the streak alive without adding to it.

**Storage:** history lives in `chrome.storage.local`. Settings and a summary (streak, longest, hours, solves) sync
through `chrome.storage.sync`. Live timer state is kept in `chrome.storage.session`.

**Celebrations:** hitting the goal or the 30-minute mark, or unlocking a badge, fires confetti and a chime on the competitive programming page
you're on, plus a desktop notification. If the popup or dashboard was closed at the time, it replays when you next open it.

## Known limits

- USACO and HackerRank don't publish a stable verdict API, so their detection reads page text and markup, and a site
  redesign can break it. **+ Log solve** is always there as a fallback.
- Idle detection starts after your configured threshold (default 120 s), so up to that much quiet reading time
  before the pause is still counted.
# Competitive-Programming-Streak
