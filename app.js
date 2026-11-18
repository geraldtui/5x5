'use strict';

/* ---------- Program definition ---------- */

const LIFTS = {
  squat: { name: 'Squat', sets: 5 },
  bench: { name: 'Bench Press', sets: 5 },
  row: { name: 'Barbell Row', sets: 5 },
  ohp: { name: 'Overhead Press', sets: 5 },
  deadlift: { name: 'Deadlift', sets: 1 },
  dbrow: { name: 'Dumbbell Row', sets: 3, reps: 10, db: true, opt: true },
  dbcurl: { name: 'Dumbbell Curl', sets: 3, reps: 10, db: true, opt: true },
  dbshrug: { name: 'Dumbbell Shrug', sets: 3, reps: 10, db: true, opt: true },
  dbtri: { name: 'Dumbbell Triceps Extension', sets: 3, reps: 10, db: true, opt: true },
  dblat: { name: 'Dumbbell Lateral Raise', sets: 3, reps: 10, db: true, opt: true },
  dbfly: { name: 'Dumbbell Reverse Fly', sets: 3, reps: 10, db: true, opt: true },
};
/* Optional accessories fill in what each day's main lifts miss: arms and shoulders on A, upper-back pulling on B. */
const WORKOUTS = {
  A: ['squat', 'bench', 'row', 'dbcurl', 'dbtri', 'dblat'],
  B: ['squat', 'ohp', 'deadlift', 'dbrow', 'dbfly', 'dbshrug'],
};
const REPS = 5;
const repsFor = (id) => LIFTS[id].reps || REPS;
/* Smallest sensible weight: dumbbells go down to one step, barbell lifts stop at the bar. */
const minW = (id, bar, unit) => (LIFTS[id].db ? UNITS[unit].step : bar);
const FAILS_BEFORE_DELOAD = 3;
/* Choices for how many successful workouts in a row a lift needs before its weight goes up. */
const EVERY_OPTIONS = [1, 2, 3, 4, 5];
const DELOAD = 0.9;
const LB_PER_KG = 2.20462;

const UNITS = {
  kg: {
    bar: 20, step: 2.5,
    w: { squat: 20, bench: 20, row: 30, ohp: 20, deadlift: 40, dbrow: 10, dbcurl: 5, dbshrug: 10, dbtri: 5, dblat: 2.5, dbfly: 2.5 },
    inc: { squat: 2.5, bench: 2.5, row: 2.5, ohp: 2.5, deadlift: 5, dbrow: 2.5, dbcurl: 2.5, dbshrug: 2.5, dbtri: 2.5, dblat: 2.5, dbfly: 2.5 },
    incs: [1.25, 2.5, 5],
    bars: [20, 15, 10],
    plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  },
  lb: {
    bar: 45, step: 5,
    w: { squat: 45, bench: 45, row: 65, ohp: 45, deadlift: 95, dbrow: 20, dbcurl: 10, dbshrug: 20, dbtri: 10, dblat: 5, dbfly: 5 },
    inc: { squat: 5, bench: 5, row: 5, ohp: 5, deadlift: 10, dbrow: 5, dbcurl: 5, dbshrug: 5, dbtri: 5, dblat: 5, dbfly: 5 },
    incs: [2.5, 5, 10],
    bars: [45, 35, 25],
    plates: [45, 35, 25, 10, 5, 2.5, 1.25],
  },
};

/* ---------- Pure logic ---------- */

const roundTo = (x, step) => Math.round(x / step) * step;
const floorTo = (x, step) => Math.floor(x / step + 1e-9) * step;
const num = (x) => String(Math.round(x * 100) / 100);

function freshState(unit) {
  const u = UNITS[unit];
  const lifts = {};
  for (const id in LIFTS) lifts[id] = { w: u.w[id], inc: u.inc[id], every: 1, streak: 0, fails: 0 };
  return { v: 1, unit, bar: u.bar, lifts, next: 'A', history: [], active: null };
}

function convert(w, from, to) {
  if (from === to) return w;
  return to === 'lb' ? roundTo(w * LB_PER_KG, 5) : roundTo(w / LB_PER_KG, 2.5);
}

function platesPerSide(w, bar, unit) {
  let left = (w - bar) / 2;
  if (left <= 0) return { plates: [], rest: 0 };
  const plates = [];
  for (const p of UNITS[unit].plates) {
    while (left >= p - 1e-9) { plates.push(p); left -= p; }
  }
  return { plates, rest: Math.round(left * 100) / 100 };
}

/* Up to three warm-up sets of five at 70%, 80% and 90% of the work weight, never below the bar.
   Light work weights give fewer sets because the rounded steps collapse. */
function warmups(w, bar, unit) {
  const step = UNITS[unit].step;
  const out = [];
  let last = 0;
  [0.7, 0.8, 0.9].forEach((pct) => {
    const ww = Math.max(bar, roundTo(w * pct, step));
    if (ww > last && ww < w) { out.push({ w: ww, reps: 5 }); last = ww; }
  });
  return out;
}

/* Applies the progression rules to `st` for a finished workout. Returns notes. */
function applyProgression(st, workout) {
  const step = UNITS[st.unit].step;
  const notes = [];
  for (const ex of workout.ex) {
    const lift = st.lifts[ex.id];
    const name = LIFTS[ex.id].name;
    if (ex.sets.every((s) => s === null)) {
      notes.push(`${name}: skipped, no change`);
      continue;
    }
    const every = lift.every || 1;
    /* Successes only count toward an increase while the weight stays the same. */
    const streak = ex.w === lift.w ? lift.streak || 0 : 0;
    if (ex.sets.every((s) => s === repsFor(ex.id))) {
      lift.fails = 0;
      if (streak + 1 >= every) {
        lift.w = ex.w + lift.inc;
        lift.streak = 0;
        notes.push(`${name}: all reps done, next time ${num(lift.w)}${st.unit}`);
      } else {
        lift.w = ex.w;
        lift.streak = streak + 1;
        notes.push(`${name}: all reps done, stays at ${num(ex.w)}${st.unit} (${lift.streak}/${every} before adding weight)`);
      }
      continue;
    }
    lift.streak = 0;
    lift.fails += 1;
    if (lift.fails >= FAILS_BEFORE_DELOAD) {
      lift.w = Math.max(minW(ex.id, st.bar, st.unit), floorTo(ex.w * DELOAD, step));
      lift.fails = 0;
      notes.push(`${name}: missed ${FAILS_BEFORE_DELOAD} workouts in a row, deload to ${num(lift.w)}${st.unit}`);
    } else {
      lift.w = ex.w;
      notes.push(`${name}: missed reps, repeat ${num(ex.w)}${st.unit} (${lift.fails}/${FAILS_BEFORE_DELOAD})`);
    }
  }
  st.next = workout.type === 'A' ? 'B' : 'A';
  return notes;
}

/* Decides how a device's data and the repository's copy should be reconciled:
   'pull' (take the repository's), 'push' (send the device's), 'merge' (each has workouts the other
   lacks) or 'none'. It compares which workouts each side has logged or deleted, so a device that is
   missing workouts always catches up and one with unsent workouts keeps them. Only when both know
   the same workouts does the later save win, which covers settings changes and edits. */
function decideSync(device, repo) {
  /* `a` has news for `b` if it logged a workout `b` has never seen, or deleted one `b` still has. */
  const hasNewsFor = (a, b) => {
    const bLogged = new Set(b.history.map((h) => h.id));
    const bDeleted = new Set(b.deleted || []);
    return a.history.some((h) => !bLogged.has(h.id) && !bDeleted.has(h.id))
      || (a.deleted || []).some((id) => bLogged.has(id));
  };
  const repoNew = hasNewsFor(repo, device);
  const deviceNew = hasNewsFor(device, repo);
  if (repoNew && deviceNew) return 'merge';
  if (repoNew) return 'pull';
  if (deviceNew) return 'push';
  const d = device.updated || 0;
  const r = repo.updated || 0;
  return r > d ? 'pull' : d > r ? 'push' : 'none';
}

/* Combines two copies that each have workouts the other lacks: every workout from both, minus any
   either side deleted, in date order. Settings and working weights come from the copy saved last. */
function mergeStates(device, repo, now = Date.now()) {
  const base = (device.updated || 0) >= (repo.updated || 0) ? device : repo;
  const other = base === device ? repo : device;
  const deleted = [...new Set([...(device.deleted || []), ...(repo.deleted || [])])];
  const gone = new Set(deleted);
  const byId = new Map();
  for (const h of [...other.history, ...base.history]) if (!gone.has(h.id)) byId.set(h.id, h);
  const history = [...byId.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  return { ...base, history, deleted, active: null, updated: now };
}

/* Projects each lift's working weight over the coming weeks, assuming every rep is hit and workouts
   keep alternating A and B, `perWeek` times a week. It applies each lift's own increment and
   increase frequency. Returns, per lift, the heaviest weight it would be lifted at in each week. */
function forecast(st, weeks = 4, perWeek = 3) {
  const sim = {};
  for (const id in st.lifts) {
    const l = st.lifts[id];
    sim[id] = { w: l.w, inc: l.inc, every: l.every || 1, streak: l.streak || 0 };
  }
  const out = {};
  for (const id in sim) out[id] = [];
  let type = st.next;
  for (let wk = 0; wk < weeks; wk++) {
    const top = {};
    for (let n = 0; n < perWeek; n++) {
      for (const id of WORKOUTS[type]) {
        const l = sim[id];
        if (!l) continue;
        top[id] = Math.max(top[id] || 0, l.w);
        if (l.streak + 1 >= l.every) { l.w += l.inc; l.streak = 0; } else l.streak += 1;
      }
      type = type === 'A' ? 'B' : 'A';
    }
    for (const id in sim) out[id].push(top[id] !== undefined ? top[id] : (out[id][wk - 1] || sim[id].w));
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { freshState, applyProgression, platesPerSide, warmups, convert, decideSync, mergeStates, forecast, UNITS };
}

/* ---------- App ---------- */

if (typeof document !== 'undefined') (() => {
  const KEY = 'fivebyfive.v1';
  const DATA_FILE = '5x5-data.json';
  const view = document.getElementById('view');
  const restEl = document.getElementById('rest');
  const tabsEl = document.getElementById('tabs');
  const importFile = document.getElementById('importFile');

  let state = load();
  let tab = 'workout';
  let chartLift = 'squat';
  let flash = null;
  let audio = null;
  let wakeLock = null;
  /* A copy of the finished workout being edited in History; changes apply only when saved. */
  let draft = null;
  /* Set when a new version of the app has been downloaded; the page reloads at the next safe moment. */
  let updateReady = false;

  /* Older saves and backups predate the dumbbell accessories and the increase frequency; give them defaults. */
  function fillLifts(s) {
    const u = UNITS[s.unit];
    for (const id in LIFTS) {
      if (!s.lifts[id]) s.lifts[id] = { w: u.w[id], inc: u.inc[id], fails: 0 };
      if (!s.lifts[id].every) s.lifts[id].every = 1;
      if (!s.lifts[id].streak) s.lifts[id].streak = 0;
    }
    return s;
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 1 && s.lifts && UNITS[s.unit]) return fillLifts(s);
    } catch (e) { /* fall through to a fresh state */ }
    return freshState('kg');
  }
  /* Every change stamps the time, so the app can tell whether the device or the repository copy is newer. */
  function save(stamp = true) {
    if (stamp) state.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    if (stamp) scheduleSync();
  }
  const validBackup = (d) => d && d.v === 1 && d.lifts && Array.isArray(d.history) && UNITS[d.unit];

  /* ----- Sync -----
     With a GitHub token, the app reads and writes DATA_FILE in the repository through GitHub's API,
     so every device shares one copy. The token lives only in this device's storage, never in the
     data or the code. Without a token the app still reads the published file, but cannot write it. */

  const REPO = 'geraldtui/5x5';
  const BRANCH = 'main';
  const API = `https://api.github.com/repos/${REPO}/contents/${DATA_FILE}`;
  const TOKEN_KEY = 'fivebyfive.githubToken';
  const SYNCED_KEY = 'fivebyfive.lastSynced';
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  let token = store.get(TOKEN_KEY);
  const sync = { busy: false, again: false, error: null, at: Number(store.get(SYNCED_KEY)) || 0, timer: null };

  const toB64 = (str) => {
    let bin = '';
    new TextEncoder().encode(str).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };
  const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const ghHeaders = () => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' });

  function ghFailure(res) {
    if (res.status === 401) return new Error('GitHub rejected the token. It may have expired or been revoked; disconnect and connect a new one.');
    if (res.status === 403) return new Error(`The token can't write to ${REPO}. It needs Contents: Read and write on that repository.`);
    return new Error(`GitHub returned an error (${res.status}). Try Sync now in a minute.`);
  }
  async function ghRead() {
    const res = await fetch(`${API}?ref=${BRANCH}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw ghFailure(res);
    const body = await res.json();
    return { data: JSON.parse(fromB64(body.content)), sha: body.sha };
  }
  /* Returns false when the file changed on GitHub since it was read, so the caller can re-read and retry. */
  async function ghWrite(data, sha) {
    const res = await fetch(API, {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update workout data from the app',
        content: toB64(`${JSON.stringify({ ...data, active: null }, null, 2)}\n`),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (res.status === 409 || res.status === 422) return false;
    if (!res.ok) throw ghFailure(res);
    return true;
  }

  function adopt(data) {
    state = fillLifts(data);
    flash = null;
    save(false);
    render();
  }
  function scheduleSync(ms = 1500) {
    if (!token) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(syncNow, ms);
  }
  function showSync() {
    if (tab === 'settings' || (tab === 'workout' && !state.active)) render();
  }

  /* Never mid-workout or mid-edit: finishing or saving triggers a sync straight after. */
  async function syncNow() {
    if (state.active || draft) return;
    if (!token) { readPublished(); return; }
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true;
    sync.error = null;
    showSync();
    try {
      for (let attempt = 1; ; attempt++) {
        const startedAt = state.updated;
        const { data, sha } = await ghRead();
        /* The user changed something while this was in flight; start over with the new data. */
        if (state.active || draft || state.updated !== startedAt) { sync.again = !state.active && !draft; break; }
        const remote = validBackup(data) ? data : null;
        const action = remote ? decideSync(state, remote) : 'push';
        if (action === 'pull') { adopt(remote); break; }
        if (action === 'none') break;
        const out = action === 'merge' ? mergeStates(state, remote) : state;
        if (await ghWrite(out, sha)) {
          if (action === 'merge') adopt(out);
          break;
        }
        if (attempt === 3) throw new Error('The data on GitHub kept changing while saving. Tap Sync now to try again.');
      }
      sync.at = Date.now();
      store.set(SYNCED_KEY, String(sync.at));
    } catch (e) {
      sync.error = e instanceof TypeError ? 'Offline. Changes are kept on this device and sync when you are back online.' : e.message;
    }
    sync.busy = false;
    showSync();
    if (sync.again) { sync.again = false; syncNow(); }
  }

  /* Without a token: read the published file and take it (or merge it) when it has something new. */
  async function readPublished() {
    let data;
    try {
      const res = await fetch(`${DATA_FILE}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      data = await res.json();
    } catch (e) { return; /* offline or no file: keep what is on the device */ }
    if (!validBackup(data) || state.active || draft) return;
    const action = decideSync(state, data);
    if (action === 'pull') adopt(data);
    else if (action === 'merge') adopt(mergeStates(state, data));
  }

  function connect(value) {
    const t = value.trim();
    if (!/^(github_pat_|ghp_)\w+$/.test(t)) { alert('That does not look like a GitHub token. It should start with github_pat_.'); return; }
    token = t;
    store.set(TOKEN_KEY, t);
    sync.error = null;
    syncNow();
  }
  function disconnect() {
    if (!confirm('Stop syncing this device with GitHub? Your data stays on this device and on GitHub.')) return;
    token = null;
    store.set(TOKEN_KEY, null);
    sync.error = null;
  }
  function agoText(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return dateStr(new Date(t).toISOString());
  }
  function syncCard() {
    if (!token) {
      return `<section class="card"><h2>Sync with GitHub</h2>
        <p class="muted small" style="margin:6px 0 0">Save your data to github.com/${REPO} automatically, so your phone and any browser show the same workouts.</p>
        <input id="token" class="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste a GitHub token">
        <button class="primary" data-act="gh-connect" style="margin-top:10px">Connect</button>
        <details><summary>How to get a token</summary>
          <ol class="rules">
            <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>.</li>
            <li>Under Repository access, choose Only select repositories, then ${REPO}.</li>
            <li>Under Permissions, set Contents to Read and write.</li>
            <li>Generate the token, copy it and paste it above. Do this once on each device.</li>
          </ol>
        </details>
      </section>`;
    }
    const status = sync.busy ? 'Syncing…' : sync.error || (sync.at ? `Last synced ${agoText(sync.at)}` : 'Not synced yet');
    return `<section class="card"><h2>Sync with GitHub</h2>
      <p class="muted small" style="margin:6px 0 8px">Connected to github.com/${REPO}. Changes save there automatically.</p>
      <p class="small${sync.error ? ' danger' : ''}">${status}</p>
      <div class="row" style="margin-top:6px">
        <button class="link" data-act="gh-sync">Sync now</button>
        <button class="link danger" data-act="gh-disconnect">Disconnect</button>
      </div>
    </section>`;
  }

  const fmt = (w, unit) => `${num(w)}${unit || state.unit}`;
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const dateStr = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  /* ----- Sound and screen ----- */

  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    if (audio && audio.state === 'suspended') audio.resume();
  }
  function beep() {
    if (!audio) return;
    const t = audio.currentTime;
    [0, 0.25].forEach((off) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0.0001, t + off);
      gain.gain.exponentialRampToValueAtTime(0.3, t + off + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.18);
      osc.start(t + off);
      osc.stop(t + off + 0.2);
    });
  }
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
      }
    } catch (e) { /* not supported or denied */ }
  }


  /* ----- Views ----- */

  function render() {
    tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'workout') view.innerHTML = state.active ? activeView() : homeView();
    else if (tab === 'history') view.innerHTML = historyView();
    else if (tab === 'progress') view.innerHTML = progressView();
    else view.innerHTML = settingsView();
    tick();
  }

  function homeView() {
    const type = state.next;
    const other = type === 'A' ? 'B' : 'A';
    const last = state.history[state.history.length - 1];
    let lastLine = 'Train three days a week with at least one rest day between workouts.';
    if (last) {
      const days = Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000);
      const ago = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
      lastLine = `Last workout: ${last.type}, ${ago}.` + (days === 0 ? ' Take a rest day before the next one.' : '');
    }
    const rows = WORKOUTS[type].map((id) => {
      const l = state.lifts[id];
      const badge = l.fails ? `<span class="badge">missed ${l.fails}/${FAILS_BEFORE_DELOAD}</span>`
        : l.every > 1 && l.streak ? `<span class="badge ok">${l.streak}/${l.every} to increase</span>`
        : LIFTS[id].opt ? '<span class="badge">optional</span>' : '';
      return `<li><span>${LIFTS[id].name}${badge}</span><span class="sr">${LIFTS[id].sets}×${repsFor(id)}</span><strong>${fmt(l.w)}</strong></li>`;
    }).join('');
    const done = flash ? `<section class="card"><h2>Workout logged</h2><ul class="rules">${flash.map((n) => `<li>${n}</li>`).join('')}</ul></section>` : '';
    return `<h1>Next up</h1>${done}
      <section class="card">
        <div class="row"><h2>Workout ${type}</h2><button class="link" data-act="swap">Switch to ${other}</button></div>
        <ul class="plan">${rows}</ul>
        <button class="primary" data-act="start">Start workout</button>
      </section>
      <p class="hint">${lastLine}</p>
      ${token && sync.error ? `<p class="hint danger">Sync problem: ${sync.error} See Settings.</p>` : ''}
      ${recentHtml()}`;
  }

  function sideText(w) {
    const { plates, rest } = platesPerSide(w, state.bar, state.unit);
    if (plates.length) return `Each side: ${plates.map(num).join(' + ')}${rest ? ` (+${num(rest)} unloadable)` : ''}`;
    return w < state.bar ? 'Lighter than the bar' : 'Empty bar';
  }

  function activeView() {
    const a = state.active;
    const cards = a.ex.map((ex, i) => {
      const reps = repsFor(ex.id);
      const side = LIFTS[ex.id].db ? `${fmt(ex.w)} per dumbbell` : sideText(ex.w);
      const sets = ex.sets.map((s, j) => {
        const cls = s === null ? '' : s === reps ? ' done' : ' miss';
        return `<button class="set${cls}" data-act="set" data-e="${i}" data-s="${j}">${s === null ? reps : s}</button>`;
      }).join('');
      const warm = LIFTS[ex.id].db ? [] : warmups(ex.w, state.bar, state.unit);
      const warmHtml = warm.length ? `<details><summary>Warm-up sets</summary><ul class="warm">${
        warm.map((w) => `<li><span>${w.reps} reps</span><span>${sideText(w.w)}</span><span>${fmt(w.w)}</span></li>`).join('')
      }</ul></details>` : '';
      const optTag = LIFTS[ex.id].opt ? ' · optional' : '';
      return `<section class="card">
        <div class="row">
          <div><h2>${LIFTS[ex.id].name}</h2><p class="muted small">${ex.sets.length}×${reps}${optTag}</p></div>
          <div class="stepper">
            <button data-act="w-" data-e="${i}" aria-label="Less weight">−</button>
            <span class="val">${fmt(ex.w)}</span>
            <button data-act="w+" data-e="${i}" aria-label="More weight">+</button>
          </div>
        </div>
        <div class="sets">${sets}</div>
        <p class="muted small">${side}</p>
        ${warmHtml}
      </section>`;
    }).join('');
    return `<div class="row"><h1>Workout ${a.type}</h1><span class="muted" id="elapsed"></span></div>
      <p class="hint" style="margin-top:-8px">Tap a set when you finish it. Tap again for each rep you missed.</p>
      ${cards}
      <button class="primary" data-act="finish">Finish workout</button>
      <button class="link danger" data-act="discard" style="display:block;margin:16px auto 0">Discard workout</button>
      ${recentHtml()}`;
  }

  function histCard(h, extra) {
    const lines = h.ex.filter((ex) => ex.sets.some((s) => s !== null)).map((ex) => {
      const ok = ex.sets.every((s) => s === repsFor(ex.id));
      const reps = ok ? `${ex.sets.length}×${repsFor(ex.id)}` : ex.sets.map((s) => (s === null ? '–' : s)).join('/');
      return `<div><span>${LIFTS[ex.id].name}</span><span>${reps} · ${fmt(ex.w, h.unit)}</span></div>`;
    }).join('');
    return `<section class="card">
      <div class="row"><h2>${dateStr(h.date)}</h2><span class="muted small">Workout ${h.type}${h.mins ? ` · ${h.mins} min` : ''}</span></div>
      <div class="hist-lines">${lines || '<div><span class="muted">Nothing logged</span></div>'}</div>
      ${extra || ''}
    </section>`;
  }

  function recentHtml() {
    const recent = state.history.slice(-2).reverse();
    if (!recent.length) return '';
    return `<h3 class="section">Previous workouts</h3>${recent.map((h) => histCard(h)).join('')}`;
  }

  function historyView() {
    if (!state.history.length) return '<h1>History</h1><p class="hint">Finished workouts show up here.</p>';
    if (draft) return editView();
    const items = state.history.slice().reverse().map((h) =>
      histCard(h, `<div class="row">
        <button class="link small" data-act="edit" data-id="${h.id}">Edit</button>
        <button class="link danger small" data-act="del" data-id="${h.id}">Delete</button>
      </div>`)).join('');
    return `<h1>History</h1>${items}`;
  }

  const isLatest = (id) => state.history.length && state.history[state.history.length - 1].id === id;

  function editView() {
    const h = draft;
    const cards = h.ex.map((ex, i) => {
      const reps = repsFor(ex.id);
      const sets = ex.sets.map((s, j) => {
        const cls = s === null ? '' : s === reps ? ' done' : ' miss';
        return `<button class="set${cls}" data-act="eset" data-e="${i}" data-s="${j}">${s === null ? '–' : s}</button>`;
      }).join('');
      return `<section class="card">
        <div class="row">
          <div><h2>${LIFTS[ex.id].name}</h2><p class="muted small">${ex.sets.length}×${reps}</p></div>
          <div class="stepper">
            <button data-act="ew-" data-e="${i}" aria-label="Less weight">−</button>
            <span class="val">${fmt(ex.w, h.unit)}</span>
            <button data-act="ew+" data-e="${i}" aria-label="More weight">+</button>
          </div>
        </div>
        <div class="sets">${sets}</div>
      </section>`;
    }).join('');
    const note = isLatest(h.id) && h.prev && h.unit === state.unit
      ? 'This is your latest workout, so saving also recalculates your next working weights.'
      : 'Saving changes the record only. Your working weights stay as they are; adjust them in Settings if needed.';
    return `<h1>Edit workout</h1>
      <p class="hint" style="margin-top:-8px">${dateStr(h.date)} · Workout ${h.type}. Tap a set to cycle its reps; – means not done.</p>
      ${cards}
      <p class="hint">${note}</p>
      <button class="primary" data-act="esave">Save changes</button>
      <button class="link" data-act="ecancel" style="display:block;margin:16px auto 0">Cancel</button>`;
  }

  function saveEdit() {
    const i = state.history.findIndex((h) => h.id === draft.id);
    if (i < 0) { alert('That workout no longer exists.'); draft = null; return; }
    const edited = draft;
    /* For the latest workout, rewind the lifts it touched to how they were before it, then re-run progression. */
    if (isLatest(edited.id) && edited.prev && edited.unit === state.unit) {
      for (const id in edited.prev.lifts) state.lifts[id] = { ...edited.prev.lifts[id] };
      state.next = edited.prev.next;
      flash = applyProgression(state, edited);
    }
    state.history[i] = edited;
    draft = null;
  }

  const FORECAST_WEEKS = 4;
  const WEEK_MS = 7 * 86400000;

  function progressView() {
    const chips = Object.keys(LIFTS).map((id) =>
      `<button class="chip${id === chartLift ? ' on' : ''}" data-act="chart" data-id="${id}">${LIFTS[id].name}</button>`).join('');
    const ahead = forecast(state, FORECAST_WEEKS);
    const now = Date.now();

    /* Logged sessions for the selected lift, then the forecast one week apart from today. */
    const logged = [];
    state.history.forEach((h) => {
      const ex = h.ex.find((e) => e.id === chartLift && e.sets.some((s) => s !== null));
      if (ex) logged.push({ t: new Date(h.date).getTime(), w: convert(ex.w, h.unit, state.unit) });
    });
    const projected = ahead[chartLift].map((w, k) => ({ t: now + (k + 1) * WEEK_MS, w }));
    const start = logged.length ? logged[logged.length - 1] : { t: now, w: state.lifts[chartLift].w };
    const all = [...logged, start, ...projected];

    const W = 320, H = 160, pad = 10;
    const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
    const lo = Math.min(...all.map((p) => p.w)), hi = Math.max(...all.map((p) => p.w));
    const x = (t) => pad + ((t - t0) * (W - 2 * pad)) / (t1 - t0 || 1);
    const y = (w) => H - pad - ((w - lo) * (H - 2 * pad)) / (hi - lo || 1);
    const line = (pts) => pts.map((p) => `${x(p.t).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ');
    const last = projected[projected.length - 1];
    const chart = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time, with a four-week forecast">
        <line x1="${x(now).toFixed(1)}" y1="${pad / 2}" x2="${x(now).toFixed(1)}" y2="${H - pad / 2}" stroke="var(--line)" stroke-width="1"/>
        ${logged.length > 1 ? `<polyline points="${line(logged)}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        <polyline points="${line([start, ...projected])}" fill="none" stroke="var(--accent)" stroke-opacity="0.55" stroke-width="2.5" stroke-dasharray="5 5" stroke-linecap="round"/>
        <circle cx="${x(start.t).toFixed(1)}" cy="${y(start.w).toFixed(1)}" r="4" fill="var(--accent)"/>
        <circle cx="${x(last.t).toFixed(1)}" cy="${y(last.w).toFixed(1)}" r="4" fill="none" stroke="var(--accent)" stroke-width="2"/>
      </svg>
      <p class="legend"><span class="solid"></span>Logged <span class="dashed"></span>Forecast · line marks today</p>`;
    const stats = logged.length ? `<div class="stats">
        <div><b>${fmt(logged[0].w)}</b><span>First</span></div>
        <div><b>${fmt(Math.max(...logged.map((p) => p.w)))}</b><span>Best</span></div>
        <div><b>${fmt(last.w)}</b><span>In ${FORECAST_WEEKS} weeks</span></div>
      </div>` : '<p class="hint">No workouts with this lift logged yet. The forecast starts from your working weight.</p>';

    const cur = state.lifts[chartLift].w;
    const weeks = ahead[chartLift].map((w, k) => {
      const d = new Date(now + (k + 1) * WEEK_MS).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const up = w - cur;
      return `<li><span>Week ${k + 1} <span class="muted small">· by ${d}</span></span><span class="muted small">${up > 0 ? `+${fmt(up)}` : 'same'}</span><strong>${fmt(w)}</strong></li>`;
    }).join('');

    const order = Object.keys(LIFTS).sort((a, b) => !!LIFTS[a].opt - !!LIFTS[b].opt);
    const table = order.map((id) => {
      const end = ahead[id][FORECAST_WEEKS - 1];
      return `<li><span>${LIFTS[id].name}</span><span class="muted small">${fmt(state.lifts[id].w)} →</span><strong>${fmt(end)}</strong></li>`;
    }).join('');

    return `<h1>Progress</h1><div class="chips">${chips}</div>
      <section class="card">${chart}${stats}</section>
      <section class="card"><h2>${LIFTS[chartLift].name} forecast</h2>
        <ul class="plan">${weeks}</ul>
      </section>
      <section class="card"><h2>All lifts in ${FORECAST_WEEKS} weeks</h2>
        <ul class="plan">${table}</ul>
      </section>
      <p class="hint">Each week shows the heaviest weight you'd lift that week. Forecasts assume you hit every rep and train 3 times a week, alternating A and B, using each lift's increment and frequency from Settings. Missed reps or skipped workouts push them back.</p>
      <p class="hint">${state.history.length} workout${state.history.length === 1 ? '' : 's'} logged.</p>`;
  }


  function settingsView() {
    const u = UNITS[state.unit];
    const lifts = Object.keys(LIFTS).map((id) => {
      const l = state.lifts[id];
      const opts = u.incs.map((v) => `<option value="${v}"${v === l.inc ? ' selected' : ''}>+${fmt(v)}</option>`).join('');
      const freqs = EVERY_OPTIONS.map((n) =>
        `<option value="${n}"${n === l.every ? ' selected' : ''}>${n === 1 ? 'Every workout' : `Every ${n} workouts`}</option>`).join('');
      return `<div class="lift-set">
        <div class="row"><span>${LIFTS[id].name}</span>
          <div class="stepper">
            <button data-act="l-" data-id="${id}" aria-label="Less weight">−</button>
            <span class="val">${fmt(l.w)}</span>
            <button data-act="l+" data-id="${id}" aria-label="More weight">+</button>
          </div>
        </div>
        <div class="sub"><span>Weight to add</span><select data-inc="${id}">${opts}</select></div>
        <div class="sub"><span>Add it after</span><select data-every="${id}">${freqs}</select></div>
      </div>`;
    }).join('');
    const bars = u.bars.map((v) => `<option value="${v}"${v === state.bar ? ' selected' : ''}>${fmt(v)}</option>`).join('');
    return `<h1>Settings</h1>
      <section class="card">
        <div class="field"><span>Units</span><div class="seg">
          <button data-act="unit" data-u="kg" class="${state.unit === 'kg' ? 'on' : ''}">kg</button>
          <button data-act="unit" data-u="lb" class="${state.unit === 'lb' ? 'on' : ''}">lb</button>
        </div></div>
        <div class="field"><span>Bar weight</span><select id="bar">${bars}</select></div>
      </section>
      <section class="card"><h2>Working weights</h2><p class="muted small" style="margin:4px 0 8px">Your weight for the next workout of each lift, how much to add, and how many successful workouts in a row it takes.</p>${lifts}</section>
      <section class="card"><h2>How the program works</h2>
        <ul class="rules">
          <li>Workout A: Squat, Bench Press, Barbell Row. Workout B: Squat, Overhead Press, Deadlift.</li>
          <li>Alternate A and B, three days a week, with a rest day between.</li>
          <li>Five sets of five reps at the same weight. Deadlift is one set of five.</li>
          <li>Optional dumbbell accessories after the main lifts, three sets of ten. A: Curl, Triceps Extension, Lateral Raise. B: Row, Reverse Fly, Shrug. Skip them freely.</li>
          <li>Hit every rep and the weight goes up next time, or after the number of successful workouts in a row you set above.</li>
          <li>Miss reps and you repeat the weight. Miss ${FAILS_BEFORE_DELOAD} workouts in a row and it drops 10%.</li>
          <li>Rest 1:30 if the last set felt easy, 3:00 if it was hard, 5:00 if you missed reps.</li>
        </ul>
      </section>
      ${syncCard()}
      <button class="secondary" data-act="export">Back up data</button>
      <button class="secondary" data-act="import">Restore from backup</button>
      <button class="secondary danger" data-act="reset">Erase everything</button>
      <p class="hint">${token
        ? 'Workouts are saved on this device and synced to GitHub. Backups are optional.'
        : `Workouts are saved on this device. Connect GitHub above to sync them, or back up and push ${DATA_FILE} by hand.`}</p>`;
  }

  /* ----- Rest timer and elapsed clock ----- */

  function tick() {
    const a = state.active;
    const el = document.getElementById('elapsed');
    if (a && el) el.textContent = clock((Date.now() - a.started) / 1000);
    if (!a || !a.rest || tab !== 'workout') { restEl.hidden = true; return; }
    const sec = (Date.now() - a.rest.start) / 1000;
    const marks = a.rest.failed ? [300] : [90, 180];
    marks.forEach((m) => {
      if (sec >= m && !a.rest.beeped.includes(m)) {
        a.rest.beeped.push(m);
        save();
        if (sec < m + 5) beep();
      }
    });
    const ready = sec >= marks[0];
    const msg = a.rest.failed
      ? 'Missed reps. Rest up to 5:00 before the next set.'
      : 'Felt easy? Go at 1:30. Hard? Wait until 3:00.';
    restEl.hidden = false;
    restEl.innerHTML = `<span class="clock${ready ? ' go' : ''}">${clock(sec)}</span><span class="msg">${msg}</span><button class="x" data-act="rest-x" aria-label="Dismiss timer">✕</button>`;
  }
  setInterval(tick, 500);

  /* ----- Actions ----- */

  function startWorkout() {
    unlockAudio();
    flash = null;
    state.active = {
      type: state.next,
      started: Date.now(),
      rest: null,
      ex: WORKOUTS[state.next].map((id) => ({ id, w: state.lifts[id].w, sets: Array(LIFTS[id].sets).fill(null) })),
    };
    keepAwake(true);
  }

  function tapSet(e, s) {
    unlockAudio();
    const a = state.active;
    const reps = repsFor(a.ex[e].id);
    const cur = a.ex[e].sets[s];
    const next = cur === null ? reps : cur === 0 ? null : cur - 1;
    a.ex[e].sets[s] = next;
    const allDone = a.ex.every((ex) => ex.sets.every((v) => v !== null));
    a.rest = next === null || allDone ? null : { start: cur === null ? Date.now() : (a.rest ? a.rest.start : Date.now()), failed: next < reps, beeped: [] };
  }

  function finishWorkout() {
    const a = state.active;
    const open = a.ex.some((ex) =>
      ex.sets.some((s) => s === null) && !(LIFTS[ex.id].opt && ex.sets.every((s) => s === null)));
    if (open && !confirm('Some sets are not logged. Finish anyway? Unlogged sets count as missed.')) return;
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      type: a.type,
      unit: state.unit,
      mins: Math.max(1, Math.round((Date.now() - a.started) / 60000)),
      ex: a.ex.map((ex) => ({ id: ex.id, w: ex.w, sets: ex.sets })),
      /* The lifts as they were before this workout, so an edit to it can redo the progression. */
      prev: { next: state.next, lifts: Object.fromEntries(a.ex.map((ex) => [ex.id, { ...state.lifts[ex.id] }])) },
    };
    flash = applyProgression(state, entry);
    state.history.push(entry);
    state.active = null;
    keepAwake(false);
  }

  function setUnit(unit) {
    if (unit === state.unit) return;
    if (state.active) { alert('Finish or discard the current workout first.'); return; }
    const from = state.unit;
    for (const id in state.lifts) {
      state.lifts[id].w = Math.max(minW(id, UNITS[unit].bar, unit), convert(state.lifts[id].w, from, unit));
      state.lifts[id].inc = UNITS[unit].inc[id];
    }
    state.unit = unit;
    state.bar = UNITS[unit].bar;
  }

  async function exportData() {
    const file = new File([JSON.stringify(state, null, 2)], DATA_FILE, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
  }

  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!validBackup(data)) throw new Error('bad file');
      if (!confirm(`Replace everything on this device with the backup (${data.history.length} workouts)?`)) return;
      state = fillLifts(data);
      save();
      render();
    } catch (e) {
      alert('That file is not a 5x5 backup.');
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'bar') state.bar = Number(t.value);
    else if (t.dataset.inc) state.lifts[t.dataset.inc].inc = Number(t.value);
    else if (t.dataset.every) state.lifts[t.dataset.every].every = Number(t.value);
    else return;
    save();
    render();
  });

  document.addEventListener('click', (ev) => {
    const tabBtn = ev.target.closest('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const d = el.dataset;
    const step = UNITS[state.unit].step;
    switch (d.act) {
      case 'start': startWorkout(); break;
      case 'swap': state.next = state.next === 'A' ? 'B' : 'A'; break;
      case 'set': tapSet(Number(d.e), Number(d.s)); break;
      case 'w-': case 'w+': {
        const ex = state.active.ex[Number(d.e)];
        const by = Math.min(step, state.lifts[ex.id].inc);
        ex.w = Math.max(minW(ex.id, state.bar, state.unit), ex.w + (d.act === 'w+' ? by : -by));
        break;
      }
      case 'l-': case 'l+': {
        const l = state.lifts[d.id];
        const by = Math.min(step, l.inc);
        l.w = Math.max(minW(d.id, state.bar, state.unit), l.w + (d.act === 'l+' ? by : -by));
        l.fails = 0;
        l.streak = 0;
        break;
      }
      case 'rest-x': state.active.rest = null; break;
      case 'finish': finishWorkout(); save(); render(); maybeReload(); return;
      case 'discard':
        if (!confirm('Discard this workout? Nothing will be saved.')) return;
        state.active = null;
        keepAwake(false);
        save(); render(); maybeReload();
        return;
      case 'edit': {
        const h = state.history.find((x) => String(x.id) === d.id);
        if (!h) return;
        draft = JSON.parse(JSON.stringify(h));
        render();
        window.scrollTo(0, 0);
        return;
      }
      case 'eset': {
        const ex = draft.ex[Number(d.e)];
        const reps = repsFor(ex.id);
        const cur = ex.sets[Number(d.s)];
        ex.sets[Number(d.s)] = cur === null ? reps : cur === 0 ? null : cur - 1;
        render();
        return;
      }
      case 'ew-': case 'ew+': {
        const ex = draft.ex[Number(d.e)];
        const u = UNITS[draft.unit];
        const by = Math.min(u.step, draft.unit === state.unit ? state.lifts[ex.id].inc : u.step);
        const bar = draft.unit === state.unit ? state.bar : u.bar;
        ex.w = Math.max(minW(ex.id, bar, draft.unit), ex.w + (d.act === 'ew+' ? by : -by));
        render();
        return;
      }
      case 'ecancel': draft = null; render(); maybeReload(); return;
      case 'esave': saveEdit(); save(); tab = 'workout'; render(); window.scrollTo(0, 0); maybeReload(); return;
      case 'del':
        if (!confirm('Delete this workout from your history? Your working weights stay as they are.')) return;
        state.history = state.history.filter((h) => String(h.id) !== d.id);
        /* Remembered so the sync doesn't treat the repository's copy of it as a workout this device is missing. */
        state.deleted = [...(state.deleted || []), Number(d.id)];
        break;
      case 'chart': chartLift = d.id; break;
      case 'unit': setUnit(d.u); break;
      case 'gh-connect': connect(document.getElementById('token').value); return;
      case 'gh-sync': syncNow(); return;
      case 'gh-disconnect': disconnect(); render(); return;
      case 'export': exportData(); return;
      case 'import': importFile.click(); return;
      case 'reset':
        if (!confirm(token
          ? 'Erase all workouts and settings on this device? Your data on GitHub is kept and will load again.'
          : 'Erase all workouts and settings on this device? This cannot be undone.')) return;
        state = freshState(state.unit);
        flash = null;
        break;
      default: return;
    }
    save();
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkForUpdate();
    maybeReload();
    if (state.active) keepAwake(true);
    tick();
    syncNow();
  });
  window.addEventListener('online', () => syncNow());

  /* ----- App updates ----- */

  /* Reload into the new version, but never in the middle of a workout or an edit, where it would cost
     the rest timer, the sound and any unsaved changes. Those reload as soon as they end instead. */
  function maybeReload() {
    if (updateReady && !state.active && !draft) {
      updateReady = false;
      location.reload();
    }
  }
  let registration = null;
  function checkForUpdate() {
    if (registration) registration.update().catch(() => { /* offline */ });
  }
  if ('serviceWorker' in navigator) {
    /* The first install takes control of a page that is already up to date, so it needs no reload.
       Every later change of controller is a new version. */
    let controlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controlled) { controlled = true; return; }
      updateReady = true;
      maybeReload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => { registration = reg; }).catch(() => {});
  }
  /* Clear the unlock flag left by the passcode lock that earlier versions had. */
  try { localStorage.removeItem('fivebyfive.unlocked'); } catch (e) { /* storage unavailable */ }
  if (state.active) keepAwake(true);
  render();
  syncNow();
})();
