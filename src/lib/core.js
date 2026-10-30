// Pure streak/goal engine shared by the background service worker and the UI.
// No chrome.* calls in here — everything operates on plain objects.
//
// state = {
//   days: { 'YYYY-MM-DD': { seconds, solves, sites: {id: secs}, solveSites: {id: n}, frozen? } },
//   meta: { reconciledThrough, celebrated: {day, goal, minutes}, pendingCelebration,
//           solvedKeys: [], badges: {id: dayKey} },
// }

export const DEFAULT_SETTINGS = {
  goalMinutes: 30,
  goalSolves: 1,
  freezeEnabled: true,
  soundEnabled: true,
  theme: 'system', // 'light' | 'dark' | 'system'
  idleSeconds: 120,
  codeforcesHandle: '',
  customDomains: [],
};

export const MAX_CHUNK_SECONDS = 90; // cap on time credited per tick (guards sleep / missed alarms)

export const PLATFORMS = [
  { id: 'usaco', label: 'USACO', hosts: ['usaco.org', 'usaco.guide'], color: '#1CB0F6', emoji: '🐄' },
  { id: 'codeforces', label: 'Codeforces', hosts: ['codeforces.com'], color: '#FF4B4B', emoji: '📊' },
  { id: 'cses', label: 'CSES', hosts: ['cses.fi'], color: '#58CC02', emoji: '📘' },
  { id: 'hackerrank', label: 'HackerRank', hosts: ['hackerrank.com'], color: '#00B36B', emoji: '💚' },
];
// Desktop apps reported by the native helper (native/desktop_host.py) while Chrome isn't focused.
export const DESKTOP_APPS = [
  {
    id: 'python-idle',
    label: 'Python IDLE',
    color: '#3776AB',
    emoji: '🐍',
    names: ['IDLE'],
    // `idle3` started from Terminal runs inside Python.app, so it shows up as org.python.python.
    bundleIds: ['org.python.IDLE', 'org.python.python'],
  },
];
const MANUAL = { id: 'manual', label: 'Manual log', color: '#CE82FF', emoji: '✍️' };

export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  s.goalMinutes = clampInt(s.goalMinutes, 1, 600, 30);
  s.goalSolves = clampInt(s.goalSolves, 1, 50, 1);
  s.idleSeconds = clampInt(s.idleSeconds, 15, 1800, 120);
  s.customDomains = Array.isArray(s.customDomains) ? s.customDomains.map(normalizeDomain).filter(Boolean) : [];
  s.codeforcesHandle = String(s.codeforcesHandle || '').trim();
  return s;
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

// ---------- sites ----------

// "https://www.Example.com/me/" -> "example.com/me"
export function normalizeDomain(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

function hostMatches(host, domain) {
  host = host.toLowerCase();
  return host === domain || host.endsWith('.' + domain);
}

export function matchSite(url, settings) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  for (const p of PLATFORMS) {
    if (p.hosts.some((h) => hostMatches(u.hostname, h))) return { id: p.id, label: p.label };
  }
  for (const entry of settings.customDomains || []) {
    const [domain, ...rest] = entry.split('/');
    const path = rest.length ? '/' + rest.join('/') : '';
    if (domain && hostMatches(u.hostname, domain) && u.pathname.toLowerCase().startsWith(path)) {
      return { id: 'custom:' + entry, label: entry };
    }
  }
  return null;
}

export function matchDesktopApp(app) {
  if (!app) return null;
  const hit = DESKTOP_APPS.find((d) => d.bundleIds.includes(app.bundleId) || d.names.includes(app.name));
  return hit ? { id: hit.id, label: hit.label } : null;
}

export function siteInfo(id) {
  if (id === 'manual') return MANUAL;
  const p = PLATFORMS.find((x) => x.id === id) || DESKTOP_APPS.find((x) => x.id === id);
  if (p) return p;
  const label = String(id || '').replace(/^custom:/, '');
  return { id, label, color: '#FF9600', emoji: '🌐' };
}

// ---------- dates (local time) ----------

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// Monday of the week containing k.
export function weekStart(k) {
  const d = parseKey(k);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
}

// ---------- goal + streak ----------

export function emptyDay() {
  return { seconds: 0, solves: 0, sites: {}, solveSites: {} };
}

export function isGoalMet(day, settings) {
  if (!day) return false;
  return day.seconds >= settings.goalMinutes * 60 || day.solves >= settings.goalSolves;
}

// Count goal days walking backwards from `k`. Frozen days keep the chain alive but don't add to it.
function runEndingAt(days, settings, k) {
  let count = 0;
  for (let i = 0; i < 5000; i++) {
    if (isGoalMet(days[k], settings)) count++;
    else if (!days[k]?.frozen) break;
    k = addDays(k, -1);
  }
  return count;
}

// Today still counts as "pending" until midnight, so an unfinished today doesn't break the streak.
export function computeStreak(days, settings, today = dayKey()) {
  const start = isGoalMet(days[today], settings) ? today : addDays(today, -1);
  return runEndingAt(days, settings, start);
}

export function computeLongest(days, settings, today = dayKey()) {
  const keys = Object.keys(days).sort();
  if (!keys.length) return 0;
  let longest = 0;
  let run = 0;
  for (let k = keys[0]; k <= today; k = addDays(k, 1)) {
    if (isGoalMet(days[k], settings)) longest = Math.max(longest, ++run);
    else if (!days[k]?.frozen && k !== today) run = 0;
  }
  return longest;
}

export function freezeUsedInWeek(days, settings, monday) {
  for (let i = 0; i < 7; i++) {
    const d = days[addDays(monday, i)];
    if (d?.frozen && !isGoalMet(d, settings)) return true;
  }
  return false;
}

export function freezeStatus(days, settings, today = dayKey()) {
  if (!settings.freezeEnabled) return 'off';
  return freezeUsedInWeek(days, settings, weekStart(today)) ? 'used' : 'ready';
}

// Walk every fully-elapsed day since the last check. A missed day consumes the week's freeze if one is
// available and there was a streak to protect. Returns 'freeze' events.
export function reconcile(state, settings, today = dayKey()) {
  const { days, meta } = state;
  const yesterday = addDays(today, -1);
  if (!meta.reconciledThrough) {
    meta.reconciledThrough = yesterday; // fresh install: nothing to judge retroactively
    return [];
  }
  const events = [];
  for (let k = meta.reconciledThrough; k < yesterday; ) {
    k = addDays(k, 1);
    const ev = maybeFreeze(days, settings, k);
    if (ev) events.push(ev);
  }
  meta.reconciledThrough = yesterday;
  return events;
}

function maybeFreeze(days, settings, k) {
  if (isGoalMet(days[k], settings) || !settings.freezeEnabled) return null;
  if (freezeUsedInWeek(days, settings, weekStart(k))) return null;
  const protectedStreak = runEndingAt(days, settings, addDays(k, -1));
  if (protectedStreak <= 0) return null;
  days[k] = { ...(days[k] || emptyDay()), frozen: true };
  return { kind: 'freeze', day: k, streak: protectedStreak };
}

// ---------- mutations ----------

export function applyTime(state, settings, siteId, seconds, when = new Date()) {
  const k = dayKey(when);
  const day = (state.days[k] ||= emptyDay());
  day.seconds += seconds;
  day.sites[siteId] = (day.sites[siteId] || 0) + seconds;
  return checkMilestones(state, settings, k);
}

// key identifies the problem (e.g. "cf:1234-A"); the same problem only counts once per day.
// title/url describe the problem for the solve lists. Returns { counted, fullKey, events }.
export function applySolve(state, settings, { key, siteId, when = new Date(), title, url }) {
  const k = dayKey(when);
  const fullKey = `${key}@${k}`;
  const seen = (state.meta.solvedKeys ||= []);
  if (seen.includes(fullKey)) return { counted: false, fullKey, events: [] };
  seen.push(fullKey);
  if (seen.length > 1500) seen.splice(0, seen.length - 1500);
  const day = (state.days[k] ||= emptyDay());
  day.solves += 1;
  day.solveSites ||= {};
  day.solveSites[siteId] = (day.solveSites[siteId] || 0) + 1;
  const entry = { id: fullKey, siteId, at: when.getTime() };
  if (title) entry.title = String(title).slice(0, 160);
  if (isWebUrl(url)) entry.url = url;
  (day.log ||= []).push(entry);
  return { counted: true, fullKey, events: checkMilestones(state, settings, k) };
}

// Removes a solve and rolls back what it caused: today's goal celebration, badges it unlocked,
// and — for an already-judged past day that no longer meets the goal — applies a freeze if one is free.
export function undoSolve(state, settings, fullKey, today = dayKey()) {
  const { meta } = state;
  const seen = meta.solvedKeys || [];
  const i = seen.indexOf(fullKey);
  if (i < 0) return false;
  seen.splice(i, 1);

  const info = describeSolveKey(fullKey);
  const day = state.days[info.day];
  if (!day) return true;
  const entry = day.log?.find((l) => l.id === fullKey);
  if (day.log) day.log = day.log.filter((l) => l.id !== fullKey);
  day.solves = Math.max(0, day.solves - 1);
  const siteId = entry?.siteId || info.siteId;
  if (day.solveSites?.[siteId] > 0) day.solveSites[siteId] -= 1;

  if (!isGoalMet(day, settings)) {
    if (info.day === today) {
      if (meta.celebrated?.day === today) meta.celebrated.goal = false;
      if (meta.pendingCelebration?.kind === 'goal') delete meta.pendingCelebration;
    } else if (meta.reconciledThrough && info.day <= meta.reconciledThrough) {
      maybeFreeze(state.days, settings, info.day);
    }
  }
  const stats = computeStats(state, settings, today);
  for (const b of BADGES) if (meta.badges?.[b.id] && b.value(stats) < b.target) delete meta.badges[b.id];
  return true;
}

function isWebUrl(url) {
  return typeof url === 'string' && url.length < 500 && /^https?:\/\//i.test(url);
}

export function cfProblemUrl(contestId, index) {
  return Number(contestId) >= 100000
    ? `https://codeforces.com/gym/${contestId}/problem/${index}`
    : `https://codeforces.com/problemset/problem/${contestId}/${index}`;
}

// Tidy a tab/page title into a problem name by dropping the parts that just name the site:
// "Problem - 4A - Codeforces" -> "Codeforces 4A", "Two Sum - LeetCode" (leetcode.com) -> "Two Sum",
// "CSES - Weird Algorithm" -> "Weird Algorithm", "1234A - Watermelon" stays as is.
export function cleanTitle(raw, siteLabel = '') {
  const brand = siteLabel.toLowerCase().split(/[./\s]/)[0];
  const isBrand = (part) => {
    const p = part.toLowerCase().replace(/\s+/g, '');
    return /^(codeforces|cses|hackerrank|usaco(guide)?)$/.test(p) || (brand.length > 2 && p.length <= brand.length + 6 && p.includes(brand));
  };
  const parts = String(raw || '').replace(/\s+/g, ' ').trim().split(/\s+[-|–—]\s+/);
  if (parts.length > 1 && parts[0].toLowerCase() === 'problem') parts.shift(); // Codeforces tab titles
  while (parts.length > 1 && isBrand(parts[parts.length - 1])) parts.pop();
  while (parts.length > 1 && isBrand(parts[0])) parts.shift();
  let t = parts.join(' - ');
  if (t && t.length < 6 && siteLabel) t = `${siteLabel} ${t}`;
  return t.slice(0, 160);
}

const KEY_SITES = { cf: 'codeforces', 'cf-sub': 'codeforces', cses: 'cses', usaco: 'usaco', hr: 'hackerrank' };

// Best-effort description from the key alone — used for solves recorded before titles were stored.
export function describeSolveKey(fullKey) {
  const at = fullKey.lastIndexOf('@');
  const key = fullKey.slice(0, at);
  const day = fullKey.slice(at + 1);
  if (key.startsWith('manual:')) {
    // "manual:<siteId>:<timestamp>"
    const i = key.lastIndexOf(':');
    return { id: fullKey, day, siteId: key.slice(7, i), title: 'Logged by hand', url: null, at: Number(key.slice(i + 1)) || null, manual: true };
  }
  const [prefix, ...rest] = key.split(':');
  const ref = rest.join(':');
  const siteId = KEY_SITES[prefix] || prefix;
  let title = ref;
  let url = null;
  const cf = prefix === 'cf' && ref.match(/^(\d+)-(\w+)$/);
  if (cf) [title, url] = [`Codeforces ${cf[1]}${cf[2]}`, cfProblemUrl(cf[1], cf[2])];
  else if (prefix === 'cses' && /^\d+$/.test(ref)) [title, url] = [`CSES task ${ref}`, `https://cses.fi/problemset/task/${ref}`];
  else if (prefix === 'usaco' && /^\d+$/.test(ref)) [title, url] = [`USACO problem ${ref}`, `https://usaco.org/index.php?page=viewproblem2&cpid=${ref}`];
  else if (prefix === 'hr' && /^[\w-]+$/.test(ref)) [title, url] = [ref.replace(/-/g, ' '), `https://www.hackerrank.com/challenges/${ref}/problem`];
  return { id: fullKey, day, siteId, title, url, at: null, manual: false };
}

// Every solve recorded on day k, oldest first, with stored details layered over what the key implies.
export function solvesForDay(state, k) {
  const details = Object.fromEntries((state.days[k]?.log || []).map((l) => [l.id, l]));
  return (state.meta.solvedKeys || [])
    .filter((f) => f.endsWith('@' + k))
    .map((f) => ({ ...describeSolveKey(f), ...details[f] }))
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

function checkMilestones(state, settings, k) {
  if (k !== dayKey()) return []; // late-arriving data for past days doesn't celebrate
  const { meta } = state;
  const day = state.days[k];
  const c = meta.celebrated?.day === k ? meta.celebrated : { day: k, goal: false, minutes: false };
  meta.celebrated = c;
  const events = [];

  const hitMinutes = !c.minutes && day.seconds >= settings.goalMinutes * 60;
  const hitGoal = !c.goal && isGoalMet(day, settings);
  if (hitMinutes) c.minutes = true;
  if (hitGoal) c.goal = true;

  if (hitGoal || hitMinutes) {
    const streak = computeStreak(state.days, settings, k);
    const ev = { kind: hitGoal ? 'goal' : 'minutes', day: k, streak, minutes: settings.goalMinutes };
    events.push(ev);
    meta.pendingCelebration = { ...ev, at: Date.now() };
  }

  const stats = computeStats(state, settings);
  meta.badges ||= {};
  for (const b of BADGES) {
    if (!meta.badges[b.id] && b.value(stats) >= b.target) {
      meta.badges[b.id] = k;
      events.push({ kind: 'badge', day: k, badge: b.id, name: b.name, emoji: b.emoji });
    }
  }
  return events;
}

// ---------- stats + badges ----------

export function computeStats(state, settings, today = dayKey()) {
  let totalSeconds = 0;
  let totalSolves = 0;
  let goalDays = 0;
  let maxDaySeconds = 0;
  const platforms = new Set();
  for (const d of Object.values(state.days)) {
    totalSeconds += d.seconds || 0;
    totalSolves += d.solves || 0;
    maxDaySeconds = Math.max(maxDaySeconds, d.seconds || 0);
    if (isGoalMet(d, settings)) goalDays++;
    for (const [id, s] of Object.entries(d.sites || {})) if (s >= 60) platforms.add(id);
    for (const [id, n] of Object.entries(d.solveSites || {})) if (n > 0 && id !== 'manual') platforms.add(id);
  }
  const streak = computeStreak(state.days, settings, today);
  const longest = Math.max(streak, computeLongest(state.days, settings, today));
  return { totalSeconds, totalSolves, goalDays, maxDaySeconds, platforms: platforms.size, streak, longest };
}

export const BADGES = [
  { id: 'spark', name: 'First Spark', emoji: '✨', desc: 'Hit your daily goal once', target: 1, unit: 'day', value: (s) => s.goalDays },
  { id: 'flame7', name: '7-Day Flame', emoji: '🔥', desc: 'Reach a 7-day streak', target: 7, unit: 'days', value: (s) => s.longest },
  { id: 'flame30', name: '30-Day Inferno', emoji: '🌋', desc: 'Reach a 30-day streak', target: 30, unit: 'days', value: (s) => s.longest },
  { id: 'flame100', name: 'Century Blaze', emoji: '☄️', desc: 'Reach a 100-day streak', target: 100, unit: 'days', value: (s) => s.longest },
  { id: 'bronze', name: 'Bronze Solver', emoji: '🥉', desc: 'Get 10 accepted solves', target: 10, unit: 'solves', value: (s) => s.totalSolves },
  { id: 'silver', name: 'Silver Solver', emoji: '🥈', desc: 'Get 50 accepted solves', target: 50, unit: 'solves', value: (s) => s.totalSolves },
  { id: 'gold', name: 'Gold Solver', emoji: '🥇', desc: 'Get 150 accepted solves', target: 150, unit: 'solves', value: (s) => s.totalSolves },
  { id: 'knight', name: 'Algorithm Knight', emoji: '⚔️', desc: 'Study for 25 hours', target: 25, unit: 'hours', value: (s) => s.totalSeconds / 3600 },
  { id: 'grandmaster', name: 'Grandmaster Grind', emoji: '👑', desc: 'Study for 100 hours', target: 100, unit: 'hours', value: (s) => s.totalSeconds / 3600 },
  { id: 'marathon', name: 'Marathoner', emoji: '🏃', desc: 'Study 2 hours in one day', target: 120, unit: 'min', value: (s) => s.maxDaySeconds / 60 },
  { id: 'explorer', name: 'Platform Explorer', emoji: '🧭', desc: 'Practice on 3 platforms', target: 3, unit: 'platforms', value: (s) => s.platforms },
];

export function badgeProgress(badge, stats) {
  return Math.min(1, badge.value(stats) / badge.target);
}

// Accept an exported blob and coerce it into a safe state object.
export function sanitizeImport(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.days !== 'object') throw new Error('Not a Competitive Programming Streak export');
  const days = {};
  for (const [k, d] of Object.entries(raw.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d || typeof d !== 'object') continue;
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
    const map = (m) => Object.fromEntries(Object.entries(m && typeof m === 'object' ? m : {}).map(([id, v]) => [String(id), num(v)]));
    days[k] = { seconds: num(d.seconds), solves: Math.round(num(d.solves)), sites: map(d.sites), solveSites: map(d.solveSites) };
    if (d.frozen) days[k].frozen = true;
    if (Array.isArray(d.log)) {
      days[k].log = d.log
        .filter((l) => l && typeof l.id === 'string')
        .map((l) => ({
          id: l.id,
          siteId: String(l.siteId || ''),
          at: num(l.at),
          ...(typeof l.title === 'string' && { title: l.title.slice(0, 160) }),
          ...(isWebUrl(l.url) && { url: l.url }),
        }));
    }
  }
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  return {
    days,
    meta: {
      reconciledThrough: typeof meta.reconciledThrough === 'string' ? meta.reconciledThrough : undefined,
      solvedKeys: Array.isArray(meta.solvedKeys) ? meta.solvedKeys.filter((x) => typeof x === 'string') : [],
      badges: meta.badges && typeof meta.badges === 'object' ? meta.badges : {},
    },
  };
}
