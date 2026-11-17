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

if (typeof module !== 'undefined') {
  module.exports = { freshState, applyProgression, platesPerSide, warmups, convert, UNITS };
}

/* ---------- App ---------- */

if (typeof document !== 'undefined') (() => {
  const KEY = 'fivebyfive.v1';
  const DATA_FILE = '5x5-data.json';
  /* Passcode gate. Only a salted hash of the passcode is kept here. This keeps casual visitors out of
     the app; it does not protect the data file, which anyone can download from the site directly. */
  const UNLOCK_KEY = 'fivebyfive.unlocked';
  const PASS_SALT = 'fivebyfive:';
  const PASS_HASH = 'a07b0468321daaf4ba732b7af74f26b5c067b96b9aa45cd5bb6a8f15e77b5ccd';
  const PASS_LENGTH = 4;
  const lockEl = document.getElementById('lock');
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
  let unlocked = false;
  let entry = '';

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
  }
  const validBackup = (d) => d && d.v === 1 && d.lifts && Array.isArray(d.history) && UNITS[d.unit];

  /* The repository's backup file is the default data. Take it when this device has nothing yet,
     or when the file was saved more recently than anything done here. Never mid-workout. */
  async function syncFromRepo() {
    if (!unlocked) return;
    let data;
    try {
      const res = await fetch(`${DATA_FILE}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      data = await res.json();
    } catch (e) { return; /* offline or no file: keep what is on the device */ }
    if (!validBackup(data) || state.active || !unlocked) return;
    const localAt = state.updated || 0;
    const untouched = !localAt && !state.history.length;
    if ((data.updated || 0) > localAt || (untouched && data.history.length)) {
      state = fillLifts(data);
      flash = null;
      save(false);
      render();
    }
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

  /* ----- Passcode lock ----- */

  async function hashCode(code) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PASS_SALT + code));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function lockView(msg) {
    const dots = Array.from({ length: PASS_LENGTH }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k) =>
      k === '' ? '<span></span>' : `<button data-key="${k}"${k === 'back' ? ' aria-label="Delete"' : ''}>${k === 'back' ? '⌫' : k}</button>`).join('');
    lockEl.hidden = false;
    lockEl.innerHTML = `<h1>Enter passcode</h1><div class="dots">${dots}</div><p class="msg">${msg || ''}</p><div class="keys">${keys}</div>`;
  }
  async function pressKey(key) {
    if (key === 'back') entry = entry.slice(0, -1);
    else if (entry.length < PASS_LENGTH) entry += key;
    lockView();
    if (entry.length < PASS_LENGTH) return;
    const attempt = entry;
    entry = '';
    if (!window.crypto || !crypto.subtle) { lockView('Open the app over HTTPS to unlock it.'); return; }
    if (await hashCode(attempt) !== PASS_HASH) { lockView('Wrong passcode. Try again.'); return; }
    try { localStorage.setItem(UNLOCK_KEY, PASS_HASH); } catch (e) { /* will ask again next launch */ }
    unlock();
  }
  function unlock() {
    unlocked = true;
    lockEl.hidden = true;
    lockEl.innerHTML = '';
    if (state.active) keepAwake(true);
    render();
    syncFromRepo();
  }
  function lock() {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (e) { /* nothing stored */ }
    unlocked = false;
    entry = '';
    view.innerHTML = '';
    restEl.hidden = true;
    keepAwake(false);
    lockView();
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
    const items = state.history.slice().reverse().map((h) =>
      histCard(h, `<button class="link danger small" data-act="del" data-id="${h.id}">Delete</button>`)).join('');
    return `<h1>History</h1>${items}`;
  }

  function progressView() {
    const chips = Object.keys(LIFTS).map((id) =>
      `<button class="chip${id === chartLift ? ' on' : ''}" data-act="chart" data-id="${id}">${LIFTS[id].name}</button>`).join('');
    const pts = [];
    state.history.forEach((h) => {
      const ex = h.ex.find((e) => e.id === chartLift && e.sets.some((s) => s !== null));
      if (ex) pts.push(convert(ex.w, h.unit, state.unit));
    });
    let body;
    if (pts.length < 2) {
      body = '<p class="hint">Log at least two workouts with this lift to see a chart.</p>';
    } else {
      const W = 320, H = 150, pad = 8;
      const lo = Math.min(...pts), hi = Math.max(...pts);
      const span = hi - lo || 1;
      const xy = pts.map((p, i) => [
        pad + (i * (W - 2 * pad)) / (pts.length - 1),
        H - pad - ((p - lo) * (H - 2 * pad)) / span,
      ]);
      const path = xy.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
      const end = xy[xy.length - 1];
      body = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time">
          <polyline points="${path}" fill="none" stroke="#f5a524" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="4" fill="#f5a524"/>
        </svg>
        <div class="stats">
          <div><b>${fmt(pts[0])}</b><span>First</span></div>
          <div><b>${fmt(hi)}</b><span>Best</span></div>
          <div><b>${fmt(pts[pts.length - 1])}</b><span>Latest</span></div>
        </div>`;
    }
    return `<h1>Progress</h1><div class="chips">${chips}</div>
      <section class="card">${body}</section>
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
      <button class="secondary" data-act="export">Back up data</button>
      <button class="secondary" data-act="import">Restore from backup</button>
      <button class="secondary" data-act="lock">Lock app</button>
      <button class="secondary danger" data-act="reset">Erase everything</button>
      <p class="hint">Workouts are saved on this device. After a workout, back up and push ${DATA_FILE} to the repository; the app loads that file whenever it is newer than what is on the device.</p>`;
  }

  /* ----- Rest timer and elapsed clock ----- */

  function tick() {
    if (!unlocked) return;
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
    if (!unlocked) {
      const key = ev.target.closest('[data-key]');
      if (key) pressKey(key.dataset.key);
      return;
    }
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
      case 'finish': finishWorkout(); break;
      case 'discard':
        if (!confirm('Discard this workout? Nothing will be saved.')) return;
        state.active = null;
        keepAwake(false);
        break;
      case 'del':
        if (!confirm('Delete this workout from your history? Your working weights stay as they are.')) return;
        state.history = state.history.filter((h) => String(h.id) !== d.id);
        break;
      case 'chart': chartLift = d.id; break;
      case 'unit': setUnit(d.u); break;
      case 'export': exportData(); return;
      case 'import': importFile.click(); return;
      case 'lock': lock(); return;
      case 'reset':
        if (!confirm('Erase all workouts and settings on this device? This cannot be undone.')) return;
        state = freshState(state.unit);
        flash = null;
        break;
      default: return;
    }
    save();
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && unlocked) {
      if (state.active) keepAwake(true);
      tick();
      syncFromRepo();
    }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  let remembered = null;
  try { remembered = localStorage.getItem(UNLOCK_KEY); } catch (e) { /* storage unavailable */ }
  if (remembered === PASS_HASH) unlock(); else lockView();
})();
