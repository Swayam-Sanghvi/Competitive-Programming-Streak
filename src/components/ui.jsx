import { useEffect, useState } from 'react';
import { addDays, isGoalMet, siteInfo, weekStart } from '../lib/core.js';

// Solves with the problem name linked to the problem, and a two-step Remove.
export function SolveList({ solves, onRemove, compact = false }) {
  return (
    <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {solves.map((s) => (
        <SolveRow key={s.id} solve={s} onRemove={onRemove} compact={compact} />
      ))}
    </ul>
  );
}

function SolveRow({ solve, onRemove, compact }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const info = siteInfo(solve.siteId);
  const time = solve.at ? new Date(solve.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;
  const detail = [info.label, time, solve.manual && 'logged by hand'].filter(Boolean).join(' · ');
  const title = solve.title || 'Solved problem';

  return (
    <li className={`flex items-center gap-2 rounded-2xl bg-slate-50 dark:bg-slate-800/70 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
      <span className={compact ? 'text-base' : 'text-lg'} aria-hidden>
        {info.emoji}
      </span>
      <div className="min-w-0 flex-1">
        {solve.url ? (
          <a
            href={solve.url}
            target="_blank"
            rel="noreferrer"
            title={title}
            className={`block truncate font-extrabold text-duo-sky-dark hover:underline dark:text-duo-sky ${compact ? 'text-xs' : 'text-sm'}`}
          >
            {title}
          </a>
        ) : (
          <span title={title} className={`block truncate font-extrabold ${compact ? 'text-xs' : 'text-sm'}`}>
            {title}
          </span>
        )}
        {!compact && <span className="block truncate text-xs font-semibold text-duo-muted dark:text-slate-400">{detail}</span>}
      </div>
      <button
        type="button"
        onClick={() => (confirming ? onRemove(solve) : setConfirming(true))}
        aria-label={confirming ? `Confirm removing ${title}` : `Remove ${title}`}
        title={confirming ? 'Click again to remove' : 'Remove this solve'}
        className={`shrink-0 rounded-xl px-2 py-1 text-xs font-extrabold uppercase transition ${
          confirming ? 'bg-duo-red text-white' : 'text-duo-muted hover:bg-red-50 hover:text-duo-red dark:text-slate-400 dark:hover:bg-red-500/10'
        }`}
      >
        {confirming ? 'Remove?' : compact ? '✕' : 'Remove'}
      </button>
    </li>
  );
}

const BUTTON_TONES = {
  green: 'bg-duo-green border-duo-green-dark text-white hover:brightness-105',
  sky: 'bg-duo-sky border-duo-sky-dark text-white hover:brightness-105',
  orange: 'bg-duo-orange border-duo-orange-dark text-white hover:brightness-105',
  ghost:
    'bg-white border-duo-line text-duo-sky hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700',
  danger: 'bg-white border-duo-line text-duo-red hover:bg-red-50 dark:bg-slate-800 dark:border-slate-700',
};

// Duolingo's chunky "3D" button: thick bottom border that collapses on press.
export function Button({ tone = 'green', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-2xl border-2 border-b-[5px] px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide transition active:translate-y-[3px] active:border-b-2 disabled:opacity-50 disabled:active:translate-y-0 ${BUTTON_TONES[tone]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', ...props }) {
  return (
    <div
      className={`rounded-3xl border-2 border-duo-line bg-white p-4 dark:border-slate-700 dark:bg-slate-800/70 ${className}`}
      {...props}
    />
  );
}

export function Flame({ lit, size = 'text-6xl' }) {
  return (
    <span
      aria-hidden
      className={`inline-block ${size} leading-none transition ${lit ? 'animate-flicker drop-shadow-[0_6px_12px_rgba(255,150,0,0.45)]' : 'opacity-60 grayscale'}`}
    >
      🔥
    </span>
  );
}

export function ProgressRing({ value, size = 150, stroke = 14, done, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-duo-line dark:stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={`transition-[stroke-dashoffset] duration-700 ${done ? 'stroke-duo-green' : 'stroke-duo-orange'}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

const BAR_SIZES = { md: 'h-3', sm: 'h-2.5' };
const BAR_MIN_FILL = { md: 'min-w-3', sm: 'min-w-2.5' };

// Any progress above zero fills at least a full circle, so small values show as a dot at the start
// instead of a sliver clipped by the rounded end.
export function Bar({ value, tone = 'bg-duo-orange', size = 'md', className = '' }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={`${BAR_SIZES[size]} overflow-hidden rounded-full bg-duo-line dark:bg-slate-700 ${className}`}>
      <div
        className={`h-full rounded-full ${tone} ${pct > 0 ? BAR_MIN_FILL[size] : ''} transition-[width] duration-700`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Current week, Monday → Sunday, Duolingo-style.
export function WeekStrip({ days, settings, today, liveDay }) {
  const monday = weekStart(today);
  return (
    <div className="flex justify-between">
      {Array.from({ length: 7 }, (_, i) => {
        const k = addDays(monday, i);
        const d = k === today ? liveDay : days[k];
        const met = isGoalMet(d, settings);
        const frozen = !met && d?.frozen;
        const future = k > today;
        const label = new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' });
        let cls = 'border-2 border-duo-line text-transparent dark:border-slate-700';
        let mark = '·';
        if (met) [cls, mark] = ['bg-duo-orange text-white border-2 border-duo-orange', '✓'];
        else if (frozen) [cls, mark] = ['bg-duo-sky text-white border-2 border-duo-sky', '❄'];
        else if (k === today) [cls, mark] = ['border-2 border-dashed border-duo-orange text-duo-orange', '·'];
        else if (!future) [cls, mark] = ['bg-duo-line text-slate-400 border-2 border-duo-line dark:bg-slate-700 dark:border-slate-700', '·'];
        return (
          <div key={k} className="flex flex-col items-center gap-1">
            <span className={`text-[11px] font-extrabold ${k === today ? 'text-duo-orange' : 'text-duo-muted dark:text-slate-400'}`}>{label}</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${cls} ${future ? 'opacity-40' : ''}`}>{mark}</span>
          </div>
        );
      })}
    </div>
  );
}

const PAUSE_COPY = {
  idle: 'Paused · you seem idle',
  locked: 'Paused · screen locked',
  unfocused: 'Paused · Chrome not focused',
  'off-site': 'Paused · open a practice site',
  demo: 'Demo mode · sample data',
};

export function TrackingStatus({ live }) {
  const tracking = !!live?.siteId;
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
        tracking ? 'bg-duo-green-soft text-duo-green-dark dark:bg-duo-green/15 dark:text-duo-green' : 'bg-slate-100 text-duo-muted dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {tracking && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-duo-green opacity-60" />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tracking ? 'bg-duo-green' : 'bg-slate-400'}`} />
      </span>
      {tracking ? `Tracking · ${live.label}` : PAUSE_COPY[live?.paused] || 'Waiting for activity…'}
    </div>
  );
}

export function FreezeChip({ status }) {
  const copy = { ready: '🧊 Freeze ready', used: '🧊 Freeze used', off: '🧊 Freeze off' }[status];
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-extrabold ${
        status === 'ready' ? 'bg-duo-sky-soft text-duo-sky-dark dark:bg-duo-sky/15 dark:text-duo-sky' : 'bg-slate-100 text-duo-muted dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      {copy}
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block font-extrabold">{label}</span>
        {hint && <span className="block text-sm font-semibold text-duo-muted dark:text-slate-400">{hint}</span>}
      </span>
      <span className="relative shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-8 w-14 rounded-full bg-duo-line transition peer-checked:bg-duo-green peer-focus-visible:ring-4 peer-focus-visible:ring-duo-sky/40 dark:bg-slate-700" />
        <span className="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-6" />
      </span>
    </label>
  );
}

export function CelebrationBanner({ event, onClose }) {
  if (!event) return null;
  const title = event.kind === 'goal' ? `${event.streak}-day streak!` : `${event.minutes} minutes done!`;
  const body = event.kind === 'goal' ? "Daily goal complete — you're on fire." : 'Time goal smashed. Keep it rolling!';
  return (
    <div className="animate-pop flex items-center gap-3 rounded-3xl border-2 border-duo-orange bg-duo-orange-soft p-3 dark:bg-duo-orange/15">
      <span className="text-4xl">🔥</span>
      <div className="flex-1">
        <div className="font-black text-duo-orange-dark dark:text-duo-orange">{title}</div>
        <div className="text-sm font-semibold text-duo-ink/80 dark:text-slate-300">{body}</div>
      </div>
      <button type="button" onClick={onClose} className="px-2 text-lg font-black text-duo-muted" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
