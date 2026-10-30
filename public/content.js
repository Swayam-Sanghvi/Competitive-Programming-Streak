// Competitive Programming Streak content script.
// 1. Watches judge pages for *new* accepted verdicts and reports them to the background worker.
// 2. Renders confetti + a chime + a toast when the background says a goal was hit.
// Time tracking does NOT happen here — the background uses the tabs + idle APIs for that.
(() => {
  if (window.__cpStreakLoaded) return;
  window.__cpStreakLoaded = true;

  const host = location.hostname.replace(/^www\./, '');
  const on = (domain) => host === domain || host.endsWith('.' + domain);

  // solve = { key, title, url } — key identifies the problem, title/url are shown in the solve lists.
  function report(solve) {
    try {
      chrome.runtime.sendMessage({ type: 'solve', ...solve }).catch(() => {});
    } catch {
      // extension was reloaded; this page's script is orphaned
    }
  }

  // Re-run `fn` (debounced) whenever the page changes.
  function observe(fn) {
    let timer = null;
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(fn, 700);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  const pageText = () => document.body?.innerText || '';

  // Fires when `isAccepted()` becomes true *after* the page loaded (so old results already on screen
  // don't count). With `allowInitial`, a page that loads already accepted also counts — used where the
  // result page itself is the proof and `validate` checks it's from today. SPA navigations reset it.
  function watchVerdict({ isAccepted, solveFn, allowInitial = false, validate = () => true }) {
    let path = location.pathname;
    let fired = !allowInitial && isAccepted();
    const check = () => {
      if (location.pathname !== path) {
        path = location.pathname;
        fired = !allowInitial && isAccepted();
      }
      if (fired || !isAccepted() || !validate()) return;
      fired = true;
      report(solveFn());
    };
    if (allowInitial) check();
    observe(check);
  }

  // ---------- Codeforces: live-updating submission tables ----------
  if (on('codeforces.com')) {
    const me = document.querySelector('.lang-chooser a[href^="/profile/"]')?.getAttribute('href')?.split('/')[2];
    const rowSolve = (row) => {
      const link = row.querySelector('a[href*="/problem/"]');
      const href = link?.getAttribute('href') || '';
      const m = href.match(/\/(?:contest|gym)\/(\d+)\/problem\/(\w+)/) || href.match(/\/problemset\/problem\/(\d+)\/(\w+)/);
      if (!m) return { key: `cf-sub:${row.dataset.submissionId}` };
      let title = link.textContent.replace(/\s+/g, ' ').trim(); // "A - Watermelon" or "4A - Watermelon"
      if (/^[A-Z]\d?\s*-/.test(title)) title = m[1] + title;
      return { key: `cf:${m[1]}-${m[2].toUpperCase()}`, title, url: link.href };
    };
    const myAccepted = () =>
      [...document.querySelectorAll('tr[data-submission-id]')].filter((row) => {
        const author = row.querySelector('a[href^="/profile/"]')?.getAttribute('href')?.split('/')[2];
        return author && me && author.toLowerCase() === me.toLowerCase() && row.querySelector('.verdict-accepted');
      });
    if (me) {
      const seen = new Set(myAccepted().map((r) => r.dataset.submissionId));
      observe(() => {
        for (const row of myAccepted()) {
          const id = row.dataset.submissionId;
          if (seen.has(id)) continue;
          seen.add(id);
          report(rowSolve(row));
        }
      });
    }
  }

  // ---------- CSES: /problemset/result/<id>/ ----------
  if (on('cses.fi') && /\/result\/\d+/.test(location.pathname)) {
    const ymd = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    watchVerdict({
      allowInitial: true,
      isAccepted: () => /result:?\s*ACCEPTED/i.test(pageText()),
      // CSES prints the submission time (Finnish time); only count results submitted today.
      validate: () => {
        const date = pageText().match(/submission time:?\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
        return !date || [ymd(undefined), ymd('Europe/Helsinki'), ymd('UTC')].includes(date);
      },
      solveFn: () => {
        const link = document.querySelector('a[href*="/task/"]'); // "task: <a>Weird Algorithm</a>"
        const task = link?.getAttribute('href')?.match(/task\/(\d+)/)?.[1];
        if (!task) return { key: `cses:${location.pathname}`, title: document.title, url: location.href };
        return { key: `cses:${task}`, title: link.textContent.trim(), url: link.href };
      },
    });
  }

  // ---------- USACO: results are injected after "Submit" ----------
  if (on('usaco.org')) {
    const VERDICT = /^(correct answer|wrong answer|time limit|runtime error|empty output|memory limit|compil)/i;
    watchVerdict({
      isAccepted: () => {
        if (/all test cases (?:passed|correct)|passed all test cases|congratulations/i.test(pageText())) return true;
        const cases = [...document.querySelectorAll('[title]')].filter((el) => VERDICT.test(el.title));
        return cases.length > 0 && cases.every((el) => /^correct answer/i.test(el.title));
      },
      solveFn: () => {
        // Problem pages have two headings: the contest, then "Problem 1. <name>".
        const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()).filter(Boolean);
        return {
          key: `usaco:${new URLSearchParams(location.search).get('cpid') || location.pathname}`,
          title: headings.slice(0, 2).join(' — ') || document.title,
          url: location.href.split('#')[0],
        };
      },
    });
  }

  // ---------- HackerRank: SPA, success banner appears after Submit ----------
  if (on('hackerrank.com')) {
    watchVerdict({
      isAccepted: () => /you solved this challenge|congratulations[!,.]?\s*you (?:have )?(?:solved|passed)/i.test(pageText()),
      solveFn: () => {
        const slug = location.pathname.match(/\/challenges\/([^/]+)/)?.[1];
        return {
          key: `hr:${slug || location.pathname}`,
          title: document.title, // "Solve Me First | HackerRank" — tidied by the background
          url: slug ? `${location.origin}/challenges/${slug}/problem` : location.href,
        };
      },
    });
  }

  // ---------- celebrations ----------

  function chime() {
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

  function celebrate({ title, body, sound, kind }) {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const shadow = root.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        canvas { position:fixed; inset:0; width:100%; height:100%; }
        .toast { position:fixed; left:50%; top:24px; transform:translate(-50%,-140%); transition:transform .45s cubic-bezier(.2,1.4,.4,1);
          font:800 16px/1.3 "Nunito", ui-rounded, system-ui, sans-serif; color:#3C3C3C; background:#fff;
          border:2px solid #E5E5E5; border-bottom-width:5px; border-radius:18px; padding:14px 20px; min-width:260px;
          box-shadow:0 12px 30px rgba(0,0,0,.18); display:flex; gap:12px; align-items:center; }
        .toast.in { transform:translate(-50%,0); }
        .big { font-size:34px; }
        .sub { font-weight:600; font-size:13px; color:#777; margin-top:2px; }
      </style>
      <canvas></canvas>
      <div class="toast"><div class="big">${kind === 'badge' ? '🏅' : '🔥'}</div><div><div class="t"></div><div class="sub"></div></div></div>`;
    shadow.querySelector('.t').textContent = title || 'Goal complete!';
    shadow.querySelector('.sub').textContent = body || '';
    document.documentElement.appendChild(root);

    const toast = shadow.querySelector('.toast');
    requestAnimationFrame(() => toast.classList.add('in'));

    if (typeof confetti === 'function') {
      const shoot = confetti.create(shadow.querySelector('canvas'), { resize: true, useWorker: false });
      const colors = ['#58CC02', '#FF9600', '#1CB0F6', '#FFC800', '#FF4B4B', '#CE82FF'];
      shoot({ particleCount: 140, spread: 90, startVelocity: 45, origin: { y: 0.6 }, colors });
      setTimeout(() => shoot({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors }), 250);
      setTimeout(() => shoot({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors }), 400);
    }
    if (sound) chime();

    setTimeout(() => toast.classList.remove('in'), 4200);
    setTimeout(() => root.remove(), 5000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'cp-streak:celebrate') celebrate(msg);
  });
})();
