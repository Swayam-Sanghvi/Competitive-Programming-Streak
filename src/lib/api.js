// Data layer for the popup + dashboard. Inside the extension it talks to chrome.storage and the
// background worker; opened as a plain web page (`npm run dev`) it falls back to a localStorage demo
// so the UI can be developed and previewed without loading the extension.
import { addDays, applySolve, cfProblemUrl, cleanTitle, dayKey, emptyDay, normalizeSettings, parseKey, reconcile, sanitizeImport, siteInfo, undoSolve } from './core.js';

const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local;

const chromeApi = {
  demo: false,
  async load() {
    const [{ settings }, { days = {}, meta = {} }, { live = {}, cfStatus = null, desktopStatus = null }] = await Promise.all([
      chrome.storage.sync.get('settings'),
      chrome.storage.local.get(['days', 'meta']),
      chrome.storage.session.get(['live', 'cfStatus', 'desktopStatus']),
    ]);
    return { settings: normalizeSettings(settings), days, meta, live, cfStatus, desktopStatus };
  },
  extensionId: chrome.runtime?.id,
  subscribe(cb) {
    chrome.storage.onChanged.addListener(cb);
    return () => chrome.storage.onChanged.removeListener(cb);
  },
  saveSettings: (settings) => chrome.storage.sync.set({ settings }),
  send: (msg) => chrome.runtime.sendMessage(msg),
  openDashboard: () => chrome.runtime.openOptionsPage(),
  async activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { url: tab?.url || '', title: tab?.title || '' };
  },
};

// ---------- demo mode ----------

const DEMO_KEY = 'cp-streak-demo';
const listeners = new Set();

const SAMPLE_SOLVES = [
  { siteId: 'codeforces', key: 'cf:4-A', title: '4A - Watermelon', url: cfProblemUrl(4, 'A') },
  { siteId: 'cses', key: 'cses:1068', title: 'Weird Algorithm', url: 'https://cses.fi/problemset/task/1068' },
  { siteId: 'cses', key: 'cses:1083', title: 'Missing Number', url: 'https://cses.fi/problemset/task/1083' },
  { siteId: 'codeforces', key: 'cf:71-A', title: '71A - Way Too Long Words', url: cfProblemUrl(71, 'A') },
  { siteId: 'hackerrank', key: 'hr:solve-me-first', title: 'Solve Me First', url: 'https://www.hackerrank.com/challenges/solve-me-first/problem' },
  {
    siteId: 'usaco',
    key: 'usaco:1059',
    title: 'USACO 2020 December Contest, Bronze — Problem 1. Do You Know Your ABCs?',
    url: 'https://usaco.org/index.php?page=viewproblem2&cpid=1059',
  },
];

function seedDemo() {
  const today = dayKey();
  const days = {};
  const solvedKeys = [];
  const sites = ['codeforces', 'cses', 'usaco', 'hackerrank'];
  let rng = 7;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  for (let i = 160; i >= 1; i--) {
    const k = addDays(today, -i);
    if (i > 13 && rand() < 0.35) continue; // gaps further back; an unbroken 12-day run recently
    if (i === 6) {
      days[k] = { ...emptyDay(), frozen: true };
      continue;
    }
    const minutes = Math.round((i <= 13 ? 30 : 10) + rand() * 60);
    const site = sites[Math.floor(rand() * sites.length)];
    const solves = rand() < 0.5 ? Math.floor(rand() * 4) : 0;
    const day = { seconds: minutes * 60, solves, sites: { [site]: minutes * 60 }, solveSites: {}, log: [] };
    for (let j = 0; j < solves; j++) {
      const s = SAMPLE_SOLVES[(i + j) % SAMPLE_SOLVES.length];
      const id = `${s.key}@${k}`;
      solvedKeys.push(id);
      day.log.push({ id, siteId: s.siteId, at: parseKey(k).getTime() + (15 + j) * 3600_000, title: s.title, url: s.url });
      day.solveSites[s.siteId] = (day.solveSites[s.siteId] || 0) + 1;
    }
    days[k] = day;
  }
  // One hand-logged solve from before titles were stored, to show how those are listed.
  const yesterday = addDays(today, -1);
  solvedKeys.push(`manual:codeforces:${parseKey(yesterday).getTime() + 20 * 3600_000}@${yesterday}`);
  days[yesterday].solves += 1;
  days[yesterday].solveSites.codeforces = (days[yesterday].solveSites.codeforces || 0) + 1;

  days[today] = { seconds: 18 * 60, solves: 0, sites: { codeforces: 18 * 60 }, solveSites: {} };
  return { settings: normalizeSettings({}), days, meta: { reconciledThrough: yesterday, badges: {}, solvedKeys } };
}

function readDemo() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEMO_KEY));
    if (raw?.days) return raw;
  } catch {}
  const seeded = seedDemo();
  writeDemo(seeded);
  return seeded;
}

function writeDemo(d) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(d));
  } catch {}
  listeners.forEach((cb) => cb());
}

const demoApi = {
  demo: true,
  async load() {
    const d = readDemo();
    return { ...d, settings: normalizeSettings(d.settings), live: { since: null, siteId: null, paused: 'demo' }, cfStatus: null };
  },
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  async saveSettings(settings) {
    writeDemo({ ...readDemo(), settings });
  },
  async send(msg) {
    const d = readDemo();
    const settings = normalizeSettings(d.settings);
    const state = { days: d.days, meta: d.meta };
    reconcile(state, settings);
    let result = { ok: true };
    if (msg.type === 'logSolve') {
      const siteId = msg.siteId || 'manual';
      const title = cleanTitle(msg.title, siteInfo(siteId).label);
      result.fullKey = applySolve(state, settings, { key: `manual:${siteId}:${Date.now()}`, siteId, title, url: msg.url }).fullKey;
    } else if (msg.type === 'undoSolve') undoSolve(state, settings, msg.fullKey);
    else if (msg.type === 'ackCelebration') delete state.meta.pendingCelebration;
    else if (msg.type === 'importData') Object.assign(state, sanitizeImport(msg.data));
    else if (msg.type === 'resetData') Object.assign(state, seedDemo());
    writeDemo({ ...d, days: state.days, meta: state.meta });
    return result;
  },
  openDashboard: () => window.open('dashboard.html', '_blank'),
  activeTab: async () => ({ url: '', title: '' }),
};

export const api = hasChrome ? chromeApi : demoApi;
