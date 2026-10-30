import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { BADGES, badgeProgress, matchSite, siteInfo, solvesForDay } from '../lib/core.js';
import { useCPData, useCelebration, useTheme } from '../lib/hooks.js';
import { Bar, Button, Card, CelebrationBanner, Flame, FreezeChip, ProgressRing, SolveList, TrackingStatus, WeekStrip } from '../components/ui.jsx';

const POPUP_SOLVES = 3;

export default function Popup() {
  const cp = useCPData();
  useTheme(cp?.settings.theme ?? 'system');
  const [celebration, dismiss] = useCelebration(cp);
  const [tab, setTab] = useState(null); // { url, title, site } of the tab the popup opened over
  const [undo, setUndo] = useState(null);

  const domains = cp?.settings.customDomains.join('|');
  useEffect(() => {
    if (!cp) return;
    api.activeTab().then((t) => setTab({ ...t, site: t.url ? matchSite(t.url, cp.settings) : null }));
  }, [domains, !cp]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabSite = tab?.site;

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  if (!cp) return <div className="h-[540px] w-[360px]" />;

  const { settings, day, stats, goalMet } = cp;
  const minutes = Math.floor(day.seconds / 60);
  const ringValue = goalMet ? 1 : Math.max(day.seconds / (settings.goalMinutes * 60), day.solves / settings.goalSolves);
  const { streak } = stats;
  const next = BADGES.map((b) => ({ b, p: badgeProgress(b, stats) }))
    .filter((x) => x.p < 1)
    .sort((a, b) => b.p - a.p)[0];
  const dark = document.documentElement.classList.contains('dark');

  const todaysSolves = solvesForDay(cp, cp.today).reverse(); // newest first

  async function logSolve() {
    // On a tracked site, the open tab is most likely the problem that was solved.
    const described = tabSite ? { title: tab.title, url: tab.url } : {};
    const res = await api.send({ type: 'logSolve', siteId: tabSite?.id || 'manual', ...described });
    if (res?.fullKey) setUndo(res.fullKey);
  }

  return (
    <div className="w-[360px] bg-white p-4 font-sans text-duo-ink dark:bg-slate-900 dark:text-slate-100">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="icons/icon32.png" alt="" className="h-7 w-7" />
          <span className="flex flex-col leading-none">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-duo-muted dark:text-slate-400">Competitive Programming</span>
            <span className="text-lg font-black tracking-tight text-duo-orange">Streak</span>
          </span>
        </div>
        <div className="flex gap-1">
          <IconButton label="Toggle dark mode" onClick={() => api.saveSettings({ ...settings, theme: dark ? 'light' : 'dark' })}>
            {dark ? '☀️' : '🌙'}
          </IconButton>
          <IconButton label="Open dashboard" onClick={api.openDashboard}>
            📊
          </IconButton>
        </div>
      </header>

      <div className="space-y-3">
        <CelebrationBanner event={goalMet ? celebration : null} onClose={dismiss} />

        <Card>
          <div className="flex items-center gap-4">
            <Flame lit={goalMet} />
            <div className="flex-1">
              <div className={`text-5xl font-black leading-none ${goalMet ? 'text-duo-orange' : 'text-slate-400'}`}>{streak}</div>
              <div className="mt-1 font-extrabold text-duo-muted dark:text-slate-400">day streak</div>
            </div>
            <div className="text-right text-xs font-bold text-duo-muted dark:text-slate-400">
              Best
              <div className="text-xl font-black text-duo-ink dark:text-slate-100">{stats.longest}</div>
            </div>
          </div>
          <div className="mt-4">
            <WeekStrip days={cp.days} settings={settings} today={cp.today} liveDay={day} />
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <ProgressRing value={ringValue} size={128} stroke={13} done={goalMet}>
            {goalMet ? (
              <>
                <span className="text-3xl">🎉</span>
                <span className="text-xs font-black uppercase text-duo-green">Done!</span>
              </>
            ) : (
              <>
                <span className="text-2xl font-black">
                  {minutes}
                  <span className="text-base text-duo-muted dark:text-slate-400"> / {settings.goalMinutes}</span>
                </span>
                <span className="text-xs font-extrabold uppercase text-duo-muted dark:text-slate-400">mins</span>
              </>
            )}
          </ProgressRing>
          <div className="flex-1 space-y-2">
            <div className="text-sm font-black">{goalMet ? 'Daily goal complete!' : 'Daily goal'}</div>
            <div className="text-xs font-semibold text-duo-muted dark:text-slate-400">
              {settings.goalMinutes} min active <b>or</b> {settings.goalSolves} accepted solve{settings.goalSolves > 1 ? 's' : ''}
            </div>
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span>✅ Solved</span>
              <span>
                {day.solves} / {settings.goalSolves}
              </span>
            </div>
            <Bar value={day.solves / settings.goalSolves} tone="bg-duo-green" />
          </div>
        </Card>

        <div className="flex items-center justify-between gap-2">
          <TrackingStatus live={cp.live} />
          <FreezeChip status={cp.freeze} />
        </div>

        {undo ? (
          <div className="flex items-center justify-between rounded-2xl bg-duo-green-soft px-4 py-2.5 text-sm font-extrabold text-duo-green-dark dark:bg-duo-green/15 dark:text-duo-green">
            Solve logged! 💪
            <button
              type="button"
              className="uppercase text-duo-sky"
              onClick={() => api.send({ type: 'undoSolve', fullKey: undo }).then(() => setUndo(null))}
            >
              Undo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button tone="green" onClick={logSolve} title="Count an accepted submission the tracker didn't catch">
              + Log solve
            </Button>
            <Button tone="sky" onClick={api.openDashboard}>
              Dashboard
            </Button>
          </div>
        )}

        {todaysSolves.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <span className="text-xs font-black uppercase tracking-wide text-duo-muted dark:text-slate-400">Today's solves</span>
              {todaysSolves.length > POPUP_SOLVES && (
                <button type="button" onClick={api.openDashboard} className="text-xs font-extrabold text-duo-sky">
                  +{todaysSolves.length - POPUP_SOLVES} more
                </button>
              )}
            </div>
            <SolveList
              compact
              solves={todaysSolves.slice(0, POPUP_SOLVES)}
              onRemove={(s) => api.send({ type: 'undoSolve', fullKey: s.id })}
            />
          </div>
        )}

        {next && (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/70">
            <span className="text-2xl grayscale-[40%]">{next.b.emoji}</span>
            <div className="flex-1">
              <div className="flex justify-between text-xs font-extrabold">
                <span>Next: {next.b.name}</span>
                <span className="text-duo-muted dark:text-slate-400">{Math.round(next.p * 100)}%</span>
              </div>
              <Bar value={next.p} tone="bg-duo-yellow" size="sm" className="mt-1" />
            </div>
          </div>
        )}

        {tabSite && (
          <p className="text-center text-[11px] font-bold text-duo-muted dark:text-slate-500">
            {siteInfo(tabSite.id).emoji} This tab counts toward your goal ({tabSite.label})
          </p>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-b-4 border-duo-line text-base transition active:translate-y-0.5 active:border-b-2 dark:border-slate-700"
      {...props}
    />
  );
}
