// Competitive Programming Streak service worker: active-tab timing, idle detection, solve intake, celebrations.
//
// Timing model: `live` (in storage.session) records when the current qualifying stretch started.
// Every event (tab switch, URL change, window focus, idle change) and a 30s alarm "flushes" the
// elapsed time into today's total, then re-checks whether we're still on a competitive programming site, focused and
// non-idle. Each flush is capped so a sleeping laptop or a suspended worker can't over-credit.
// When Chrome itself isn't focused, the optional native helper says whether Python IDLE is in front.

import {
  MAX_CHUNK_SECONDS,
  addDays,
  applySolve,
  applyTime,
  cfProblemUrl,
  cleanTitle,
  computeStats,
  dayKey,
  isGoalMet,
  matchDesktopApp,
  matchSite,
  normalizeSettings,
  reconcile,
  sanitizeImport,
  siteInfo,
  undoSolve,
} from './lib/core.js';

const TICK_ALARM = 'tick';
const CF_ALARM = 'codeforces';
const NATIVE_HOST = 'com.competitive_programming_streak.desktop'; // registered by native/install.py

// ---------- storage ----------

async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return normalizeSettings(settings);
}

async function loadState() {
  const { days = {}, meta = {} } = await chrome.storage.local.get(['days', 'meta']);
  return { days, meta };
}

// All state writes go through one queue so concurrent events can't clobber each other.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch((err) => console.error('[cp-streak]', err));
  return run;
}

function withState(mutate) {
  return serial(async () => {
    const settings = await getSettings();
    const state = await loadState();
    const events = reconcile(state, settings);
    events.push(...((await mutate(state, settings)) || []));
    await chrome.storage.local.set({ days: state.days, meta: state.meta });
    await afterSave(state, settings, events);
    return events;
  });
}

// ---------- active-tab timing ----------

async function currentActivity(settings) {
  const idle = await chrome.idle.queryState(settings.idleSeconds);
  if (idle !== 'active') return { paused: idle === 'locked' ? 'locked' : 'idle' };

  let win;
  try {
    win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  } catch {
    return { paused: 'unfocused' };
  }
  if (!win?.focused) {
    const app = matchDesktopApp(await askDesktopHelper('frontmost'));
    return app ? { site: app } : { paused: 'unfocused' };
  }

  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  const site = tab?.url ? matchSite(tab.url, settings) : null;
  return site ? { site } : { paused: 'off-site' };
}

// Returns the helper's reply, or null if it isn't installed. The outcome is kept in
// storage.session so the dashboard can show whether the helper is connected.
async function askDesktopHelper(type) {
  let reply = null;
  let status;
  try {
    reply = await chrome.runtime.sendNativeMessage(NATIVE_HOST, { type });
    status = reply?.ok ? { ok: true } : { ok: false, error: reply?.error || 'No reply from helper' };
  } catch (err) {
    status = { ok: false, error: String(err.message || err) };
  }
  const { desktopStatus } = await chrome.storage.session.get('desktopStatus');
  if (desktopStatus?.ok !== status.ok || desktopStatus?.error !== status.error) {
    await chrome.storage.session.set({ desktopStatus: { ...status, at: Date.now() } });
  }
  return reply?.ok ? reply : null;
}

function tick() {
  return withState(async (state, settings) => {
    const now = Date.now();
    const { live } = await chrome.storage.session.get('live');
    let events = [];
    if (live?.since && live.siteId) {
      const seconds = Math.min(now - live.since, MAX_CHUNK_SECONDS * 1000) / 1000;
      if (seconds > 0) events = applyTime(state, settings, live.siteId, seconds, new Date(now));
    }
    const activity = await currentActivity(settings);
    await chrome.storage.session.set({
      live: activity.site
        ? { since: now, siteId: activity.site.id, label: activity.site.label }
        : { since: null, siteId: null, paused: activity.paused },
    });
    return events;
  });
}

// ---------- side effects after each save ----------

let lastSummary = '';

async function afterSave(state, settings, events) {
  const stats = computeStats(state, settings);
  const today = state.days[dayKey()];
  const done = isGoalMet(today, settings);
  const minutes = Math.floor((today?.seconds || 0) / 60);

  await chrome.action.setBadgeText({ text: stats.streak ? String(stats.streak) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: done ? '#FF9600' : '#94A3B8' });
  await chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
  await chrome.action.setTitle({
    title: `Competitive Programming Streak — 🔥 ${stats.streak} day streak\nToday: ${minutes}/${settings.goalMinutes} min · ${today?.solves || 0}/${settings.goalSolves} solved`,
  });

  // A compact summary rides in sync storage so it follows the user's Chrome profile.
  const summary = {
    streak: stats.streak,
    longest: stats.longest,
    totalHours: Math.round(stats.totalSeconds / 360) / 10,
    totalSolves: stats.totalSolves,
  };
  const serialized = JSON.stringify(summary);
  if (serialized !== lastSummary) {
    lastSummary = serialized;
    chrome.storage.sync.set({ summary: { ...summary, updatedAt: Date.now() } }).catch(() => {});
  }

  for (const ev of events) celebrate(ev, settings);
}

function celebrate(ev, settings) {
  const copy = {
    goal: [`🔥 ${ev.streak}-day streak!`, 'Daily goal complete. Your flame is lit for today.'],
    minutes: [`⏱️ ${ev.minutes} minutes of practice!`, 'You hit the time goal. Keep the momentum going.'],
    badge: [`${ev.emoji} Badge unlocked: ${ev.name}`, 'Open Competitive Programming Streak to see your trophy case.'],
    freeze: [
      '🧊 Streak freeze used',
      `You missed ${new Date(ev.day + 'T12:00').toLocaleDateString(undefined, { weekday: 'long' })}, but your ${ev.streak}-day streak is safe.`,
    ],
  }[ev.kind];
  if (!copy) return;

  chrome.notifications
    .create(`cp-streak-${ev.kind}-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: copy[0],
      message: copy[1],
      priority: 1,
    })
    .catch(() => {});

  // Confetti + sound right on the competitive programming page the user is working in.
  if (ev.kind === 'goal' || ev.kind === 'minutes' || ev.kind === 'badge') {
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(([tab]) =>
        tab?.id != null &&
        chrome.tabs.sendMessage(tab.id, { type: 'cp-streak:celebrate', ...ev, title: copy[0], body: copy[1], sound: settings.soundEnabled }),
      )
      .catch(() => {}); // no content script on this tab (custom domain, chrome:// page, …)
  }
}

// ---------- Codeforces API sync ----------

let lastCfSync = 0;

async function syncCodeforces(force = false) {
  const settings = await getSettings();
  const handle = settings.codeforcesHandle;
  if (!handle || (!force && Date.now() - lastCfSync < 60_000)) return;
  lastCfSync = Date.now();

  let data;
  try {
    const res = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`);
    data = await res.json();
  } catch (err) {
    await chrome.storage.session.set({ cfStatus: { ok: false, error: String(err.message || err), at: Date.now() } });
    return;
  }
  if (data.status !== 'OK') {
    await chrome.storage.session.set({ cfStatus: { ok: false, error: data.comment || 'Codeforces API error', at: Date.now() } });
    return;
  }

  const recent = new Set([dayKey(), addDays(dayKey(), -1)]);
  const accepted = data.result
    .filter((s) => s.verdict === 'OK' && s.problem)
    .map(({ problem, creationTimeSeconds }) => {
      const contest = problem.contestId ?? problem.problemsetName;
      const index = String(problem.index).toUpperCase();
      return {
        key: `cf:${contest}-${index}`,
        when: new Date(creationTimeSeconds * 1000),
        title: `${contest}${index} - ${problem.name}`,
        url: problem.contestId
          ? cfProblemUrl(problem.contestId, index)
          : `https://codeforces.com/problemsets/${problem.problemsetName}/problem/99999/${index}`,
      };
    })
    .filter((s) => recent.has(dayKey(s.when)));

  await withState((state, s) => accepted.flatMap((a) => applySolve(state, s, { ...a, siteId: 'codeforces' }).events));
  await chrome.storage.session.set({ cfStatus: { ok: true, handle, at: Date.now() } });
}

// ---------- messages ----------

const isExtensionPage = (sender) => sender.url?.startsWith(chrome.runtime.getURL(''));

async function handleMessage(msg, sender) {
  switch (msg?.type) {
    // From content scripts: an accepted verdict was spotted on the page.
    case 'solve': {
      const settings = await getSettings();
      const site = sender.tab?.url ? matchSite(sender.tab.url, settings) : null;
      if (!site) return { ok: false };
      const solve = { key: String(msg.key).slice(0, 200), siteId: site.id, title: cleanTitle(msg.title, site.label), url: msg.url };
      let result;
      await withState((state, s) => (result = applySolve(state, s, solve)).events);
      return { ok: true, counted: result.counted };
    }
    // From the popup: "+ Log solve", described by the tab that was open.
    case 'logSolve': {
      if (!isExtensionPage(sender)) return { ok: false };
      const siteId = String(msg.siteId || 'manual');
      const solve = { key: `manual:${siteId}:${Date.now()}`, siteId, title: cleanTitle(msg.title, siteInfo(siteId).label), url: msg.url };
      let result;
      await withState((state, s) => (result = applySolve(state, s, solve)).events);
      return { ok: true, fullKey: result.fullKey };
    }
    case 'undoSolve': {
      if (!isExtensionPage(sender)) return { ok: false };
      await withState((state, s) => void undoSolve(state, s, String(msg.fullKey)));
      return { ok: true };
    }
    case 'refresh':
      await tick();
      syncCodeforces(msg.forceCodeforces).catch(() => {});
      return { ok: true };
    case 'checkDesktop':
      return { ok: !!(await askDesktopHelper('ping')) };
    case 'ackCelebration':
      await withState((state) => void delete state.meta.pendingCelebration);
      return { ok: true };
    case 'importData': {
      if (!isExtensionPage(sender)) return { ok: false };
      const clean = sanitizeImport(msg.data);
      await serial(() => chrome.storage.local.set(clean));
      await tick();
      return { ok: true };
    }
    case 'resetData': {
      if (!isExtensionPage(sender)) return { ok: false };
      await serial(() => chrome.storage.local.set({ days: {}, meta: {} }));
      await tick();
      return { ok: true };
    }
  }
  return { ok: false, error: 'unknown message' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err.message || err) }));
  return true;
});

// ---------- wiring ----------

async function setup() {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(settings.idleSeconds);
  if (!(await chrome.alarms.get(TICK_ALARM))) chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  if (!(await chrome.alarms.get(CF_ALARM))) chrome.alarms.create(CF_ALARM, { periodInMinutes: 5 });
  await tick();
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
setup(); // also on every worker wake-up — cheap and keeps alarms/idle interval in place

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) tick();
  if (alarm.name === CF_ALARM) syncCodeforces();
});

chrome.tabs.onActivated.addListener(() => tick());
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.status === 'complete')) tick();
});
chrome.windows.onFocusChanged.addListener(() => tick());
chrome.idle.onStateChanged.addListener(() => tick());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const before = normalizeSettings(changes.settings.oldValue);
  const after = normalizeSettings(changes.settings.newValue);
  chrome.idle.setDetectionInterval(after.idleSeconds);
  tick();
  if (after.codeforcesHandle && after.codeforcesHandle !== before.codeforcesHandle) syncCodeforces(true);
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.runtime.openOptionsPage();
});
