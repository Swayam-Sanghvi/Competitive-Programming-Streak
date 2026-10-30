import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { api } from './api.js';
import { MAX_CHUNK_SECONDS, computeStats, dayKey, emptyDay, freezeStatus, isGoalMet } from './core.js';

export const DUO_COLORS = ['#58CC02', '#FF9600', '#1CB0F6', '#FFC800', '#FF4B4B', '#CE82FF'];

// Loads everything, re-loads on any storage change, and ticks once a second so the live timer moves.
export function useCPData() {
  const [data, setData] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const reload = () => api.load().then((d) => alive && setData(d));
    reload();
    const unsub = api.subscribe(reload);
    api.send({ type: 'refresh' }).catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      unsub();
      clearInterval(timer);
    };
  }, []);

  return useMemo(() => {
    if (!data) return null;
    const today = dayKey();
    const day = data.days[today] || emptyDay();
    // Seconds accrued since the background's last flush, so the ring fills in real time.
    const pending = data.live?.since ? Math.min(Math.max(0, now - data.live.since) / 1000, MAX_CHUNK_SECONDS) : 0;
    const liveDay = { ...day, seconds: day.seconds + pending };
    const stats = computeStats({ days: { ...data.days, [today]: liveDay } }, data.settings, today);
    return {
      ...data,
      today,
      day: liveDay,
      stats,
      goalMet: isGoalMet(liveDay, data.settings),
      freeze: freezeStatus(data.days, data.settings, today),
    };
  }, [data, now]);
}

export function useTheme(theme) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function chime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.11;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
  setTimeout(() => ctx.close(), 1500);
}

export function burst(sound) {
  confetti({ particleCount: 120, spread: 80, startVelocity: 40, origin: { y: 0.65 }, colors: DUO_COLORS, disableForReducedMotion: true });
  setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors: DUO_COLORS }), 200);
  setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors: DUO_COLORS }), 350);
  if (sound) chime();
}

// Plays a celebration the background queued (goal hit while this page was closed, or right now)
// and returns it so the page can show a banner until the user dismisses it.
export function useCelebration(cp) {
  const [shown, setShown] = useState(null);
  const firedAt = useRef(null);
  const pending = cp?.meta?.pendingCelebration;
  useEffect(() => {
    if (!pending || pending.day !== cp.today || firedAt.current === pending.at) return;
    firedAt.current = pending.at;
    setShown(pending);
    burst(cp.settings.soundEnabled);
    api.send({ type: 'ackCelebration' }).catch(() => {});
  }, [pending, cp?.today, cp?.settings.soundEnabled]);
  return [shown, () => setShown(null)];
}

export function fmtMinutes(seconds) {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
