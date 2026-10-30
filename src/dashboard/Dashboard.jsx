import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { BADGES, PLATFORMS, addDays, badgeProgress, isGoalMet, normalizeDomain, siteInfo, solvesForDay, weekStart } from '../lib/core.js';
import { burst, fmtMinutes, useCPData, useCelebration, useTheme } from '../lib/hooks.js';
import {
  Bar,
  Button,
  Card,
  CelebrationBanner,
  Flame,
  FreezeChip,
  ProgressRing,
  SolveList,
  Toggle,
  TrackingStatus,
  WeekStrip,
} from '../components/ui.jsx';

export default function Dashboard() {
  const cp = useCPData();
  useTheme(cp?.settings.theme ?? 'system');
  const [celebration, dismiss] = useCelebration(cp);
  if (!cp) return null;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-duo-ink dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b-2 border-duo-line bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src="icons/icon48.png" alt="" className="h-9 w-9" />
            <span className="flex flex-col leading-none sm:flex-row sm:items-baseline sm:gap-1.5">
              <span className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wide text-duo-muted sm:text-2xl sm:font-black sm:normal-case sm:tracking-tight sm:text-duo-ink dark:text-slate-400 sm:dark:text-slate-100">
                Competitive Programming
              </span>
              <span className="text-2xl font-black tracking-tight text-duo-orange">Streak</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block">
              <TrackingStatus live={cp.live} />
            </span>
            <ThemePicker settings={cp.settings} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {api.demo && (
          <div className="rounded-2xl border-2 border-dashed border-duo-sky bg-duo-sky-soft px-4 py-3 text-sm font-bold text-duo-sky-dark dark:bg-duo-sky/10 dark:text-duo-sky">
            Demo mode — this page is running outside Chrome with sample data. Load the built extension to track real practice.
          </div>
        )}
        <CelebrationBanner event={cp.goalMet ? celebration : null} onClose={dismiss} />
        <Overview cp={cp} />
        <Heatmap cp={cp} />
        <div className="grid gap-5 lg:grid-cols-5">
          <Badges cp={cp} className="lg:col-span-3" />
          <div className="space-y-5 lg:col-span-2">
            <RecentSolves cp={cp} />
            <LastTwoWeeks cp={cp} />
            <Platforms cp={cp} />
          </div>
        </div>
        <Settings cp={cp} />
      </main>
    </div>
  );
}

function ThemePicker({ settings }) {
  const opts = [
    ['light', '☀️', 'Light'],
    ['dark', '🌙', 'Dark slate'],
    ['system', '💻', 'System'],
  ];
  return (
    <div className="flex rounded-2xl border-2 border-duo-line p-1 dark:border-slate-700">
      {opts.map(([value, icon, label]) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-pressed={settings.theme === value}
          onClick={() => api.saveSettings({ ...settings, theme: value })}
          className={`rounded-xl px-2.5 py-1 text-sm transition ${settings.theme === value ? 'bg-duo-sky-soft dark:bg-slate-700' : 'opacity-60 hover:opacity-100'}`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

// ---------- overview ----------

function Overview({ cp }) {
  const { settings, day, stats, goalMet } = cp;
  const ring = goalMet ? 1 : Math.max(day.seconds / (settings.goalMinutes * 60), day.solves / settings.goalSolves);
  const todaySites = Object.entries(day.sites || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      <Card className="flex flex-col justify-between gap-4">
        <div className="flex items-center gap-4">
          <Flame lit={goalMet} size="text-7xl" />
          <div>
            <div className={`text-6xl font-black leading-none ${goalMet ? 'text-duo-orange' : 'text-slate-400'}`}>{stats.streak}</div>
            <div className="mt-1 text-lg font-extrabold text-duo-muted dark:text-slate-400">day streak</div>
          </div>
        </div>
        <WeekStrip days={cp.days} settings={settings} today={cp.today} liveDay={day} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FreezeChip status={cp.freeze} />
          <span className="text-sm font-extrabold text-duo-muted dark:text-slate-400">Longest: {stats.longest} days</span>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-center gap-5">
        <ProgressRing value={ring} done={goalMet}>
          {goalMet ? (
            <>
              <span className="text-4xl">🎉</span>
              <span className="text-sm font-black uppercase text-duo-green">Goal done</span>
            </>
          ) : (
            <>
              <span className="text-3xl font-black">
                {Math.floor(day.seconds / 60)}
                <span className="text-lg text-duo-muted dark:text-slate-400"> / {settings.goalMinutes}</span>
              </span>
              <span className="text-xs font-extrabold uppercase text-duo-muted dark:text-slate-400">mins today</span>
            </>
          )}
        </ProgressRing>
        <div className="min-w-[180px] flex-1 space-y-3">
          <div>
            <div className="flex justify-between gap-2 whitespace-nowrap text-sm font-extrabold">
              <span>✅ Accepted today</span>
              <span>
                {day.solves} / {settings.goalSolves}
              </span>
            </div>
            <Bar value={day.solves / settings.goalSolves} tone="bg-duo-green" className="mt-1" />
          </div>
          <div className="space-y-1">
            {todaySites.length ? (
              todaySites.slice(0, 4).map(([id, secs]) => (
                <div key={id} className="flex justify-between gap-2 text-sm font-bold">
                  <span className="truncate">
                    {siteInfo(id).emoji} {siteInfo(id).label}
                  </span>
                  <span className="text-duo-muted dark:text-slate-400">{fmtMinutes(secs)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-duo-muted dark:text-slate-400">No practice yet today. Open a problem to start the clock!</p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:col-span-2 lg:col-span-1">
        <Stat icon="⏱️" value={(stats.totalSeconds / 3600).toFixed(1)} label="hours studied" tone="text-duo-sky" />
        <Stat icon="✅" value={stats.totalSolves} label="accepted solves" tone="text-duo-green" />
        <Stat icon="🎯" value={stats.goalDays} label="goal days" tone="text-duo-orange" />
        <Stat icon="🏅" value={`${BADGES.filter((b) => badgeProgress(b, stats) >= 1).length}/${BADGES.length}`} label="badges" tone="text-duo-purple" />
      </div>
    </div>
  );
}

function Stat({ icon, value, label, tone }) {
  return (
    <Card className="flex flex-col justify-center">
      <span className="text-2xl">{icon}</span>
      <span className={`mt-1 text-3xl font-black ${tone}`}>{value}</span>
      <span className="text-sm font-extrabold text-duo-muted dark:text-slate-400">{label}</span>
    </Card>
  );
}

// ---------- heat map ----------

const HEAT = [
  'bg-slate-100 dark:bg-slate-800',
  'bg-[#d7ffb8] dark:bg-[#2b4a14]',
  'bg-[#a5ed6e] dark:bg-[#3f7a12]',
  'bg-duo-green',
  'bg-[#3f8f00] dark:bg-[#7ee03a]',
];

function heatLevel(d, settings) {
  if (!d || (!d.seconds && !d.solves)) return 0;
  const ratio = d.seconds / (settings.goalMinutes * 60);
  if (ratio >= 2 || (isGoalMet(d, settings) && d.solves >= 3)) return 4;
  if (isGoalMet(d, settings)) return 3;
  return ratio >= 0.5 ? 2 : 1;
}

function Heatmap({ cp }) {
  const WEEKS = 53;
  const scroller = useRef(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  const start = addDays(weekStart(cp.today), -7 * (WEEKS - 1));
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const activeDays = Object.values(cp.days).filter((d) => d.seconds >= 60 || d.solves).length;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-black">Activity</h2>
          <p className="text-sm font-semibold text-duo-muted dark:text-slate-400">{activeDays} active days in your history</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-duo-muted dark:text-slate-400">
          Less
          {HEAT.map((c, i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-[4px] ${c}`} />
          ))}
          More
          <span className="ml-2 h-3.5 w-3.5 rounded-[4px] bg-duo-sky" /> Freeze
        </div>
      </div>
      <div ref={scroller} className="overflow-x-auto pb-2">
        <div className="inline-flex gap-1 p-1">
          <div className="mr-1 grid grid-rows-[16px_repeat(7,14px)] gap-1 text-[10px] font-bold text-duo-muted dark:text-slate-500">
            <span />
            {['Mon', '', 'Wed', '', 'Fri', '', ''].map((l, i) => (
              <span key={i} className="leading-[14px]">
                {l}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => {
            const first = new Date(week[0] + 'T12:00');
            const showMonth = wi === 0 || first.getDate() <= 7;
            return (
              <div key={week[0]} className="grid grid-rows-[16px_repeat(7,14px)] gap-1">
                <span className="w-[14px] overflow-visible whitespace-nowrap text-[10px] font-bold text-duo-muted dark:text-slate-500">
                  {showMonth ? first.toLocaleDateString(undefined, { month: 'short' }) : ''}
                </span>
                {week.map((k) => {
                  const d = k === cp.today ? cp.day : cp.days[k];
                  const future = k > cp.today;
                  const frozen = d?.frozen && !isGoalMet(d, cp.settings);
                  const cls = future ? 'bg-transparent' : frozen ? 'bg-duo-sky' : HEAT[heatLevel(d, cp.settings)];
                  const label = new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                  const detail = frozen ? 'streak freeze' : `${Math.floor((d?.seconds || 0) / 60)} min · ${d?.solves || 0} solved`;
                  return (
                    <span
                      key={k}
                      title={future ? '' : `${label}: ${detail}`}
                      className={`h-[14px] w-[14px] rounded-[4px] ${cls} ${k === cp.today ? 'ring-2 ring-duo-orange ring-offset-1 dark:ring-offset-slate-800' : ''}`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------- badges ----------

function Badges({ cp, className }) {
  const fmt = (b, v) => (b.unit === 'hours' ? v.toFixed(1) : Math.floor(v));
  return (
    <Card className={className}>
      <h2 className="mb-3 text-xl font-black">Achievements</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {BADGES.map((b) => {
          const p = badgeProgress(b, cp.stats);
          const done = p >= 1;
          return (
            <div
              key={b.id}
              className={`rounded-2xl border-2 border-b-4 p-3 text-center transition ${
                done ? 'border-duo-yellow bg-[#fff9e0] dark:bg-duo-yellow/10' : 'border-duo-line dark:border-slate-700'
              }`}
            >
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-3xl ${done ? 'bg-duo-yellow/30' : 'bg-slate-100 grayscale dark:bg-slate-700'}`}>
                {b.emoji}
              </div>
              <div className={`mt-2 text-sm font-black ${done ? '' : 'text-duo-muted dark:text-slate-400'}`}>{b.name}</div>
              <div className="text-xs font-semibold text-duo-muted dark:text-slate-400">{b.desc}</div>
              {done ? (
                <div className="mt-2 text-xs font-black uppercase text-duo-orange">
                  {cp.meta.badges?.[b.id] ? `Earned ${new Date(cp.meta.badges[b.id] + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Earned'}
                </div>
              ) : (
                <>
                  <Bar value={p} tone="bg-duo-yellow" size="sm" className="mt-2" />
                  <div className="mt-1 text-[11px] font-bold text-duo-muted dark:text-slate-400">
                    {fmt(b, b.value(cp.stats))} / {b.target} {b.unit}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- charts ----------

function RecentSolves({ cp }) {
  const groups = Array.from({ length: 7 }, (_, i) => addDays(cp.today, -i))
    .map((k) => ({ k, solves: solvesForDay(cp, k).reverse() }))
    .filter((g) => g.solves.length);
  const dayLabel = (k) =>
    k === cp.today ? 'Today' : k === addDays(cp.today, -1) ? 'Yesterday' : new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <Card>
      <h2 className="text-xl font-black">Recent solves</h2>
      <p className="mb-3 text-sm font-semibold text-duo-muted dark:text-slate-400">Last 7 days · click a name to open the problem</p>
      {groups.length ? (
        <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
          {groups.map(({ k, solves }) => (
            <div key={k}>
              <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-duo-muted dark:text-slate-400">
                {dayLabel(k)} · {solves.length}
              </div>
              <SolveList solves={solves} onRemove={(s) => api.send({ type: 'undoSolve', fullKey: s.id })} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm font-semibold text-duo-muted dark:text-slate-400">No accepted solves in the last week yet.</p>
      )}
    </Card>
  );
}

function LastTwoWeeks({ cp }) {
  const keys = Array.from({ length: 14 }, (_, i) => addDays(cp.today, i - 13));
  const goal = cp.settings.goalMinutes;
  const mins = keys.map((k) => Math.floor(((k === cp.today ? cp.day : cp.days[k])?.seconds || 0) / 60));
  const top = Math.max(goal * 1.5, ...mins);
  return (
    <Card>
      <h2 className="text-xl font-black">Last 14 days</h2>
      <p className="mb-3 text-sm font-semibold text-duo-muted dark:text-slate-400">Minutes per day · dashed line = goal</p>
      <div className="relative h-36">
        <div className="absolute inset-x-0 border-t-2 border-dashed border-duo-orange/70" style={{ bottom: `${(goal / top) * 100}%` }} />
        <div className="absolute inset-0 flex items-end gap-1.5">
          {keys.map((k, i) => {
            const d = k === cp.today ? cp.day : cp.days[k];
            const met = isGoalMet(d, cp.settings);
            return (
              <div key={k} className="group relative flex h-full flex-1 items-end" title={`${k}: ${mins[i]} min · ${d?.solves || 0} solved`}>
                <div
                  className={`w-full rounded-t-lg rounded-b-sm transition-all ${met ? 'bg-duo-green' : mins[i] ? 'bg-duo-orange/70' : 'bg-duo-line dark:bg-slate-700'}`}
                  style={{ height: `${Math.max(4, (mins[i] / top) * 100)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-1.5 text-center text-[10px] font-bold text-duo-muted dark:text-slate-500">
        {keys.map((k) => (
          <span key={k} className="flex-1">
            {new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' })}
          </span>
        ))}
      </div>
    </Card>
  );
}

function Platforms({ cp }) {
  const totals = {};
  for (const d of Object.values(cp.days)) {
    for (const [id, s] of Object.entries(d.sites || {})) (totals[id] ||= { secs: 0, solves: 0 }).secs += s;
    for (const [id, n] of Object.entries(d.solveSites || {})) (totals[id] ||= { secs: 0, solves: 0 }).solves += n;
  }
  const rows = Object.entries(totals).sort((a, b) => b[1].secs - a[1].secs);
  const max = Math.max(1, ...rows.map(([, t]) => t.secs));
  return (
    <Card>
      <h2 className="mb-3 text-xl font-black">Platforms</h2>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map(([id, t]) => {
            const info = siteInfo(id);
            return (
              <div key={id}>
                <div className="flex justify-between gap-2 text-sm font-extrabold">
                  <span className="truncate">
                    {info.emoji} {info.label}
                  </span>
                  <span className="shrink-0 text-duo-muted dark:text-slate-400">
                    {fmtMinutes(t.secs)} · {t.solves} ✅
                  </span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-duo-line dark:bg-slate-700">
                  <div className="h-full rounded-full" style={{ width: `${(t.secs / max) * 100}%`, background: info.color }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm font-semibold text-duo-muted dark:text-slate-400">Nothing tracked yet.</p>
      )}
    </Card>
  );
}

// ---------- settings ----------

function Settings({ cp }) {
  const { settings } = cp;
  const save = (patch) => api.saveSettings({ ...settings, ...patch });
  const [domain, setDomain] = useState('');
  const [handle, setHandle] = useState(settings.codeforcesHandle);
  const [msg, setMsg] = useState('');
  const fileInput = useRef(null);

  function addDomain(e) {
    e.preventDefault();
    const d = normalizeDomain(domain);
    if (!d || !d.includes('.')) return setMsg('Enter a domain like atcoder.jp or yourname.github.io');
    if (!settings.customDomains.includes(d)) save({ customDomains: [...settings.customDomains, d] });
    setDomain('');
    setMsg('');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'competitive-programming-streak', version: 1, days: cp.days, meta: cp.meta, settings }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `competitive-programming-streak-${cp.today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(file) {
    try {
      const data = JSON.parse(await file.text());
      const res = await api.send({ type: 'importData', data });
      setMsg(res?.ok ? 'Import complete ✔' : res?.error || 'Import failed');
    } catch (err) {
      setMsg(`Import failed: ${err.message}`);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-xl font-black">Settings</h2>
      <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
        <div className="divide-y-2 divide-duo-line dark:divide-slate-700">
          <NumberRow label="Daily time goal" suffix="min" value={settings.goalMinutes} min={1} max={600} onChange={(v) => save({ goalMinutes: v })} />
          <NumberRow label="…or accepted solves" suffix="solves" value={settings.goalSolves} min={1} max={50} onChange={(v) => save({ goalSolves: v })} />
          <NumberRow
            label="Idle after"
            hint="No mouse/keyboard input for this long pauses the timer"
            suffix="sec"
            value={settings.idleSeconds}
            min={15}
            max={1800}
            onChange={(v) => save({ idleSeconds: v })}
          />
          <Toggle
            label="Weekly streak freeze"
            hint="One missed day per week won't break your streak"
            checked={settings.freezeEnabled}
            onChange={(v) => save({ freezeEnabled: v })}
          />
          <Toggle label="Sound effects" hint="Chime when you hit a goal" checked={settings.soundEnabled} onChange={(v) => save({ soundEnabled: v })} />
          <div className="py-3">
            <Button tone="orange" onClick={() => burst(settings.soundEnabled)}>
              🎉 Test celebration
            </Button>
          </div>
        </div>

        <div className="space-y-5 pt-2">
          <div>
            <div className="font-extrabold">Tracked platforms</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <span key={p.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold dark:bg-slate-700" title={p.hosts.join(', ')}>
                  {p.emoji} {p.label}
                </span>
              ))}
              {settings.customDomains.map((d) => (
                <span key={d} className="flex items-center gap-1 rounded-full bg-duo-orange-soft py-1 pl-3 pr-1.5 text-sm font-bold text-duo-orange-dark dark:bg-duo-orange/15 dark:text-duo-orange">
                  🌐 {d}
                  <button
                    type="button"
                    aria-label={`Remove ${d}`}
                    className="rounded-full px-1.5 font-black hover:bg-black/10"
                    onClick={() => save({ customDomains: settings.customDomains.filter((x) => x !== d) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={addDomain} className="mt-3 flex gap-2">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="atcoder.jp, leetcode.com, portfolio.dev/projects…"
                className="min-w-0 flex-1 rounded-2xl border-2 border-duo-line bg-slate-50 px-3 py-2 font-bold outline-none focus:border-duo-sky dark:border-slate-700 dark:bg-slate-900"
              />
              <Button tone="sky" type="submit">
                Add
              </Button>
            </form>
            <p className="mt-1 text-xs font-semibold text-duo-muted dark:text-slate-400">
              Custom sites count toward time. Use “+ Log solve” in the popup for their accepted submissions.
            </p>
          </div>

          <DesktopHelper status={cp.desktopStatus} />

          <div>
            <div className="font-extrabold">Codeforces handle</div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save({ codeforcesHandle: handle.trim() });
                api.send({ type: 'refresh', forceCodeforces: true }).catch(() => {});
              }}
            >
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="tourist"
                className="min-w-0 flex-1 rounded-2xl border-2 border-duo-line bg-slate-50 px-3 py-2 font-bold outline-none focus:border-duo-sky dark:border-slate-700 dark:bg-slate-900"
              />
              <Button tone="sky" type="submit">
                Save
              </Button>
            </form>
            <p className="mt-1 text-xs font-semibold text-duo-muted dark:text-slate-400">
              {cp.cfStatus?.ok === false
                ? `⚠️ ${cp.cfStatus.error}`
                : cp.cfStatus?.ok
                  ? `Synced ${new Date(cp.cfStatus.at).toLocaleTimeString()} — accepted submissions are pulled from the Codeforces API every 5 min.`
                  : 'Accepted submissions are pulled from the Codeforces API every 5 minutes.'}
            </p>
          </div>

          <div>
            <div className="font-extrabold">Your data</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button tone="ghost" onClick={exportData}>
                Export
              </Button>
              <Button tone="ghost" onClick={() => fileInput.current?.click()}>
                Import
              </Button>
              <Button
                tone="danger"
                onClick={() => confirm('Erase all streak history? This cannot be undone.') && api.send({ type: 'resetData' })}
              >
                Reset
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
              />
            </div>
          </div>
          {msg && <p className="text-sm font-bold text-duo-sky-dark dark:text-duo-sky">{msg}</p>}
        </div>
      </div>
    </Card>
  );
}

// Turn the browser's native-messaging errors into a next step.
function helperAdvice(error) {
  if (/not a function|undefined/i.test(error)) return 'Reload this extension on your extensions page so it can use the helper.';
  if (/not found/i.test(error)) return 'Helper not found. Run the command above, then click Check again.';
  if (/forbidden/i.test(error)) return 'The helper is set up for a different extension ID. Run the command above again.';
  if (/exited/i.test(error)) return 'The helper started but quit. Run the command above again, then click Check again.';
  return error;
}

function DesktopHelper({ status }) {
  const [copied, setCopied] = useState(false);
  // An older background worker (extension not reloaded since this page changed) doesn't know 'checkDesktop'.
  const [stale, setStale] = useState(false);
  const check = () =>
    api
      .send({ type: 'checkDesktop' })
      .then((res) => setStale(res?.error === 'unknown message'))
      .catch(() => {});
  useEffect(() => {
    check();
  }, []);
  const command = `python3 native/install.py ${api.extensionId || '<extension-id>'}`;
  const connected = !stale && !!status?.ok;
  const error = stale ? helperAdvice('not a function') : status?.error && helperAdvice(status.error);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="font-extrabold">🐍 Python IDLE</div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            connected ? 'bg-duo-green-soft text-duo-green-dark dark:bg-duo-green/15 dark:text-duo-green' : 'bg-slate-100 text-duo-muted dark:bg-slate-700 dark:text-slate-400'
          }`}
        >
          {connected ? 'Connected' : 'Not set up'}
        </span>
      </div>
      {connected ? (
        <p className="mt-1 text-xs font-semibold text-duo-muted dark:text-slate-400">
          Time in IDLE counts toward your goal while it's the app in front and you're not idle.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs font-semibold text-duo-muted dark:text-slate-400">
            To count time in IDLE, install the small desktop helper once (macOS). In Terminal, inside the cp-streak project folder, run:
          </p>
          <div className="mt-2 flex gap-2">
            <code className="min-w-0 flex-1 break-all rounded-2xl border-2 border-duo-line bg-slate-50 px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900">
              {command}
            </code>
            <Button tone="ghost" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button tone="ghost" onClick={check}>
              Check again
            </Button>
            {error && <span className="text-xs font-bold text-duo-muted dark:text-slate-400">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function NumberRow({ label, hint, suffix, value, min, max, onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(draft))));
    if (Number.isFinite(n) && n !== value) onChange(n);
    else setDraft(String(value));
  };
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span>
        <span className="block font-extrabold">{label}</span>
        {hint && <span className="block text-sm font-semibold text-duo-muted dark:text-slate-400">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="w-20 rounded-xl border-2 border-duo-line bg-slate-50 px-2 py-1.5 text-right font-black outline-none focus:border-duo-sky dark:border-slate-700 dark:bg-slate-900"
        />
        <span className="w-12 text-sm font-bold text-duo-muted dark:text-slate-400">{suffix}</span>
      </span>
    </label>
  );
}
