'use strict';

/* ---------- Program definition ---------- */

/* Dumbbell work tracks progress by reps: the reps per set climb through this range, one at a time.
   The weight never changes on its own. After the top of the range, the workout suggests the next
   dumbbell up, and switching to it starts the reps again at the bottom. */
const REP_RANGE = [8, 12];

const LIFTS = {
  squat: { name: 'Squat', sets: 5 },
  bench: { name: 'Bench Press', sets: 5 },
  row: { name: 'Barbell Row', sets: 5 },
  ohp: { name: 'Overhead Press', sets: 5 },
  deadlift: { name: 'Deadlift', sets: 1 },
  dbrow: { name: 'Dumbbell Row', sets: 3, reps: 10, db: true, opt: true, range: REP_RANGE },
  dbcurl: { name: 'Dumbbell Curl', sets: 3, reps: 10, db: true, opt: true, range: REP_RANGE },
  dbshrug: { name: 'Dumbbell Shrug', sets: 3, reps: 10, db: true, opt: true, range: REP_RANGE, retired: true },
  dbtri: { name: 'Dumbbell Triceps Extension', sets: 3, reps: 10, db: true, opt: true, range: REP_RANGE },
  dblat: { name: 'Dumbbell Lateral Raise', sets: 3, reps: 10, db: true, opt: true, range: REP_RANGE },
  dbfly: { name: 'Dumbbell Reverse Fly', sets: 3, reps: 10, db: true, opt: true, range: REP_RANGE },
  dbpress: { name: 'Dumbbell Chest Press', sets: 3, reps: 10, db: true, opt: true, range: REP_RANGE },
};
/* Lifts no longer in either workout stay defined so their history still shows. */
const inUse = (id) => WORKOUTS.A.includes(id) || WORKOUTS.B.includes(id);
/* Optional accessories fill in what each day's main lifts miss: arms and shoulders on A; upper-back pulling and chest pressing on B. */
const WORKOUTS = {
  A: ['squat', 'bench', 'row', 'dbcurl', 'dbtri', 'dblat'],
  B: ['squat', 'ohp', 'deadlift', 'dbrow', 'dbfly', 'dbpress'],
};
const REPS = 5;
const repsFor = (id) => LIFTS[id].reps || REPS;
const hasRange = (id) => !!LIFTS[id].range;
/* The reps aimed for in a logged or in-progress exercise. Older records without one used the default. */
const targetOf = (ex) => ex.reps || repsFor(ex.id);
/* The reps per set the next workout will aim for. */
const liftTarget = (st, id) => (hasRange(id) ? dumbbellPlan(st, id).reps : repsFor(id));

/* ---------- Programs ----------
   A program is one run of StrongLifts 5x5: a name, a start date, and the starting weight of each lift.
   Every workout belongs to a program, and next weights only look at the current program's workouts,
   so a restart begins cleanly from its own starting weights. */
const curProgram = (st) => (st.programs || []).find((p) => p.id === st.program) || null;
const progHistory = (st) => (st.program ? st.history.filter((h) => h.program === st.program) : st.history);
const startWeight = (st, id) => {
  const p = curProgram(st);
  return p && p.start[id] !== undefined ? p.start[id] : st.lifts[id].w;
};
const programName = (date) => `StrongLifts 5x5 · ${new Date(date).toLocaleDateString('en', { month: 'short', year: 'numeric' })}`;
/* Gives older data its first program: started on the first workout, with each lift's first logged
   weight as its starting weight. Also files any workout without a program under the current one. */
function ensurePrograms(st) {
  if (!Array.isArray(st.programs) || !st.programs.length) {
    const first = st.history[0];
    const started = first ? first.date : new Date().toISOString();
    const start = {};
    for (const id in LIFTS) {
      const h = st.history.find((x) => x.ex.some((e) => e.id === id && e.sets.some((v) => v !== null)));
      start[id] = h ? convert(h.ex.find((e) => e.id === id).w, h.unit, st.unit) : st.lifts[id].w;
    }
    st.programs = [{ id: first ? first.id : Date.now(), name: programName(started), started, ended: null, start }];
    st.program = st.programs[0].id;
  }
  if (!curProgram(st)) st.program = st.programs[st.programs.length - 1].id;
  const p = curProgram(st);
  for (const id in LIFTS) if (p.start[id] === undefined) p.start[id] = st.lifts[id].w;
  for (const h of st.history) if (!h.program) h.program = st.program;
  return st;
}

/* Works out a dumbbell exercise's next session from its most recent logged one, so edits and
   deletions in History are reflected straight away. Same weight; one more rep per set if every set
   hit the target, up to the top of the range; once the top is hit, a heavier dumbbell is suggested
   (one step up). With nothing logged yet it starts from the working weight at the default reps. */
function dumbbellPlan(st, id) {
  const [lo, hi] = LIFTS[id].range;
  const hist = progHistory(st);
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    const ex = h.ex.find((e) => e.id === id && e.sets.some((v) => v !== null));
    if (!ex) continue;
    const w = convert(ex.w, h.unit, st.unit);
    const target = Math.min(hi, Math.max(lo, targetOf(ex)));
    const done = ex.sets.every((v) => v !== null && v >= target);
    if (done && target >= hi) return { w, reps: hi, suggest: w + stepFor(id, st.unit), last: { w, sets: ex.sets } };
    return { w, reps: done ? target + 1 : target, last: { w, sets: ex.sets } };
  }
  return { w: startWeight(st, id), reps: repsFor(id), last: null };
}
/* The optional dumbbell accessories in each workout are done as one superset: a set of each, back to
   back, then a rest, for as many rounds as they have sets. */
const inSuperset = (id) => !!LIFTS[id].opt;
const SUPERSET_REST = 90;
/* Smallest sensible weight: dumbbells go down to one step, barbell lifts stop at the bar. */
const minW = (id, bar, unit) => (LIFTS[id].db ? UNITS[unit].dbStep : bar);
const FAILS_BEFORE_DELOAD = 3;
/* Choices for how many successful workouts in a row a lift needs before its weight goes up. */
const EVERY_OPTIONS = [1, 2, 3, 4, 5];
const DELOAD = 0.9;
const LB_PER_KG = 2.20462;

const UNITS = {
  kg: {
    bar: 20, step: 2.5, dbStep: 1,
    w: { squat: 20, bench: 20, row: 30, ohp: 20, deadlift: 40, dbrow: 10, dbcurl: 5, dbshrug: 10, dbtri: 5, dblat: 2.5, dbfly: 2.5, dbpress: 15 },
    inc: { squat: 2.5, bench: 2.5, row: 2.5, ohp: 2.5, deadlift: 5, dbrow: 2.5, dbcurl: 2.5, dbshrug: 2.5, dbtri: 2.5, dblat: 2.5, dbfly: 2.5, dbpress: 2.5 },
    incs: [1.25, 2.5, 5],
    bars: [20, 15, 10],
    plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  },
  lb: {
    bar: 45, step: 5, dbStep: 2,
    w: { squat: 45, bench: 45, row: 65, ohp: 45, deadlift: 95, dbrow: 20, dbcurl: 10, dbshrug: 20, dbtri: 10, dblat: 5, dbfly: 5, dbpress: 30 },
    inc: { squat: 5, bench: 5, row: 5, ohp: 5, deadlift: 10, dbrow: 5, dbcurl: 5, dbshrug: 5, dbtri: 5, dblat: 5, dbfly: 5, dbpress: 5 },
    incs: [2.5, 5, 10],
    bars: [45, 35, 25],
    plates: [45, 35, 25, 10, 5, 2.5, 1.25],
  },
};

/* ---------- Pure logic ---------- */

/* Dumbbells move in their own smaller steps (1 kg); barbell lifts use the plate step. */
const stepFor = (id, unit) => (LIFTS[id].db ? UNITS[unit].dbStep : UNITS[unit].step);

const roundTo = (x, step) => Math.round(x / step) * step;
const floorTo = (x, step) => Math.floor(x / step + 1e-9) * step;
const num = (x) => String(Math.round(x * 100) / 100);

/* Streaks: workouts in a row with no more than STREAK_GAP days between them. A three-day week
   (say Mon, Wed, Fri) is at most a three-day gap, so one extra day of slack keeps it alive. */
const STREAK_GAP = 4;
const WEEK_TARGET = 3;
const dayNum = (d) => { const x = new Date(d); return Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000); };
function streaks(history, now = Date.now()) {
  const days = [...new Set(history.map((h) => dayNum(h.date)))].sort((a, b) => a - b);
  let best = 0, run = 0;
  days.forEach((d, i) => { run = i && d - days[i - 1] <= STREAK_GAP ? run + 1 : 1; best = Math.max(best, run); });
  const alive = days.length && dayNum(now) - days[days.length - 1] <= STREAK_GAP;
  /* Weeks run Monday to Sunday and count once all WEEK_TARGET workouts are done. The week in
     progress never breaks the streak; it joins it when it is complete. */
  const weekOf = (d) => Math.floor((d + 3) / 7); /* day 0 (1 Jan 1970) was a Thursday */
  const perWeek = {};
  days.forEach((d) => { const w = weekOf(d); perWeek[w] = (perWeek[w] || 0) + 1; });
  const full = (w) => (perWeek[w] || 0) >= WEEK_TARGET;
  const weeks = Object.keys(perWeek).map(Number).filter(full).sort((a, b) => a - b);
  let bestWeeks = 0, wr = 0;
  weeks.forEach((w, i) => { wr = i && w - weeks[i - 1] === 1 ? wr + 1 : 1; bestWeeks = Math.max(bestWeeks, wr); });
  const thisWeek = weekOf(dayNum(now));
  let curWeeks = 0;
  for (let w = full(thisWeek) ? thisWeek : thisWeek - 1; full(w); w--) curWeeks++;
  return { current: alive ? run : 0, best, weeks: curWeeks, bestWeeks, thisWeek: perWeek[thisWeek] || 0 };
}

function freshState(unit) {
  const u = UNITS[unit];
  const lifts = {};
  for (const id in LIFTS) {
    lifts[id] = { w: u.w[id], inc: u.inc[id], every: 1, streak: 0, fails: 0 };
  }
  return ensurePrograms({ v: 1, unit, bar: u.bar, lifts, next: 'A', history: [], active: null });
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

/* The next working weight of a lift comes straight from the last workout that had it: all reps done
   adds the increment, any missed reps repeat the weight. Dumbbells keep the last weight (their reps
   climb instead). A lift not yet done in this program starts at the program's starting weight. */
function deriveLift(st, id) {
  const l = st.lifts[id];
  const hist = progHistory(st);
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    const ex = h.ex.find((e) => e.id === id && e.sets.some((v) => v !== null));
    if (!ex) continue;
    const w = convert(ex.w, h.unit, st.unit);
    const ok = !hasRange(id) && ex.sets.every((v) => v === targetOf(ex));
    return { w: ok ? w + l.inc : w, fails: 0, streak: 0, every: 1 };
  }
  return { w: startWeight(st, id), fails: 0, streak: 0, every: 1 };
}
function deriveLifts(st) {
  for (const id in LIFTS) if (st.lifts[id]) Object.assign(st.lifts[id], deriveLift(st, id));
  return st;
}
const hasLogged = (st, id) => progHistory(st).some((h) => h.ex.some((e) => e.id === id && e.sets.some((v) => v !== null)));

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
    if (hasRange(ex.id)) {
      const [lo, hi] = LIFTS[ex.id].range;
      const target = targetOf(ex);
      const n = ex.sets.length;
      lift.w = ex.w;
      lift.streak = 0;
      lift.fails = 0;
      if (ex.sets.every((s) => s !== null && s >= target)) {
        notes.push(target >= hi
          ? `${name}: hit ${n}×${hi} at ${num(ex.w)}${st.unit}. Next time the workout suggests ${num(ex.w + stepFor(ex.id, st.unit))}${st.unit}`
          : `${name}: all reps done, next time ${n}×${Math.min(hi, target + 1)} at ${num(ex.w)}${st.unit}`);
      } else {
        notes.push(`${name}: missed reps, repeat ${n}×${target} at ${num(ex.w)}${st.unit}`);
      }
      continue;
    }
    if (ex.sets.every((s) => s === targetOf(ex))) {
      lift.w = ex.w + lift.inc;
      notes.push(`${name}: all reps done, next time ${num(lift.w)}${st.unit}`);
    } else {
      lift.w = ex.w;
      notes.push(`${name}: missed reps, repeat ${num(ex.w)}${st.unit}`);
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
  const programs = [...(base.programs || [])];
  for (const p of other.programs || []) if (!programs.some((q) => q.id === p.id)) programs.push(p);
  programs.sort((a, b) => new Date(a.started) - new Date(b.started));
  return { ...base, programs, history, deleted, active: null, updated: now };
}

const TRAINING_DAYS = [1, 3, 5]; // Monday, Wednesday, Friday (Date.getDay numbering)

/* The forecast calendar: the Friday of each of the next `weeks` weeks (from next Monday on), and every
   training day from today up to the last of them. Today counts only if no workout is logged today. */
function forecastPlan(now, lastWorkout, weeks = 4) {
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
  const today = day(now);
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
  const fridays = Array.from({ length: weeks }, (_, k) => {
    const f = new Date(nextMonday);
    f.setDate(nextMonday.getDate() + 4 + 7 * k);
    return f;
  });
  const d = new Date(today);
  if (lastWorkout && day(lastWorkout) >= today) d.setDate(d.getDate() + 1);
  const sessions = [];
  for (; d <= fridays[weeks - 1]; d.setDate(d.getDate() + 1)) {
    if (TRAINING_DAYS.includes(d.getDay())) sessions.push(new Date(d));
  }
  return { fridays, sessions };
}

/* Projects each lift's working weight, assuming every rep is hit, any suggested dumbbell is taken,
   and workouts alternate A and B on
   the given session days, with each lift's own increment and increase frequency. Returns, per lift,
   the weight it was last lifted at on or before each target date. */
function forecast(st, sessions, targets) {
  const sim = {};
  for (const id in st.lifts) {
    const l = st.lifts[id];
    sim[id] = { w: l.w, inc: l.inc, every: l.every || 1, streak: l.streak || 0, target: null };
    if (hasRange(id)) {
      const plan = dumbbellPlan(st, id);
      sim[id] = { ...sim[id], w: plan.suggest || plan.w, inc: stepFor(id, st.unit), target: plan.suggest ? LIFTS[id].range[0] : plan.reps };
    }
  }
  const out = {};
  const lifted = {};
  for (const id in sim) out[id] = [];
  let type = st.next;
  let n = 0;
  for (const target of targets) {
    for (; n < sessions.length && sessions[n] <= target; n++) {
      for (const id of WORKOUTS[type]) {
        const l = sim[id];
        if (!l) continue;
        lifted[id] = l.w;
        if (l.target !== null) {
          const [lo, hi] = LIFTS[id].range;
          if (l.target >= hi) { l.w += l.inc; l.target = lo; } else l.target += 1;
        } else if (l.streak + 1 >= l.every) { l.w += l.inc; l.streak = 0; } else l.streak += 1;
      }
      type = type === 'A' ? 'B' : 'A';
    }
    for (const id in sim) out[id].push(lifted[id] !== undefined ? lifted[id] : sim[id].w);
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { freshState, applyProgression, platesPerSide, warmups, convert, decideSync, mergeStates, forecast, forecastPlan, dumbbellPlan, UNITS };
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
  /* Which workout's exercises the Settings screen is showing. */
  let settingsGroup = state.next;
  let newProg = null; /* the "start a new program" form while it is open */
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
    return ensurePrograms(s);
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
    deriveLifts(state);
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

  /* A weight you can type straight into, with the − / + buttons either side for quick nudges. */
  const wInput = (kind, attrs, w, unit) =>
    `<label class="val"><input type="number" inputmode="decimal" step="any" min="0" data-wedit="${kind}" ${attrs} value="${num(w)}" aria-label="Weight"><span>${unit || state.unit}</span></label>`;
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
    deriveLifts(state);
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
      const plan = hasRange(id) ? dumbbellPlan(state, id) : null;
      const badge = plan ? (plan.suggest ? `<span class="badge ok">ready for ${fmt(plan.suggest)}</span>` : '')
        : l.fails ? `<span class="badge">missed ${l.fails}/${FAILS_BEFORE_DELOAD}</span>`
        : !hasRange(id) && l.every > 1 && l.streak ? `<span class="badge ok">${l.streak}/${l.every} to increase</span>` : '';
      const head = inSuperset(id) && id === WORKOUTS[type].find(inSuperset)
        ? '<li class="group-head">Superset · optional</li>' : '';
      return `${head}<li${inSuperset(id) ? ' class="ss"' : ''}><span>${LIFTS[id].name}${badge}</span><span class="sr">${LIFTS[id].sets}×${liftTarget(state, id)}</span><strong>${fmt(plan ? plan.w : l.w)}</strong></li>`;
    }).join('');
    const done = flash ? `<section class="card"><h2>Workout logged</h2><ul class="rules">${flash.map((n) => `<li>${n}</li>`).join('')}</ul></section>` : '';
    const st = streaks(state.history);
    const streakHtml = st.best ? `<div class="streak${st.current ? '' : ' cold'}">
        <span class="flame">${st.current ? '🔥' : '🧊'}</span>
        <div class="stat"><strong>${st.current}</strong><span>workout${st.current === 1 ? '' : 's'}</span><span class="muted small">best ${st.best}</span></div>
        <div class="stat"><strong>${st.weeks}</strong><span>week${st.weeks === 1 ? '' : 's'}</span><span class="muted small">best ${st.bestWeeks}</span></div>
        <div class="stat wk"><strong>${Math.min(st.thisWeek, WEEK_TARGET)}/${WEEK_TARGET}</strong><span>this week</span></div></div>` : '';
    return `${streakHtml}<h1>Next up</h1>${done}
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
      if (inSuperset(ex.id)) return '';
      const reps = targetOf(ex);
      const side = LIFTS[ex.id].db ? `${fmt(ex.w)} per dumbbell` : sideText(ex.w);
      const sets = ex.sets.map((s, j) => {
        const cls = s === null ? '' : s === reps ? ' done' : ' miss';
        return `<button class="set${cls}" data-act="set" data-e="${i}" data-s="${j}">${s === null ? reps : s}</button>`;
      }).join('');
      const warm = LIFTS[ex.id].db ? [] : warmups(ex.w, state.bar, state.unit);
      const warmHtml = warm.length ? `<details><summary>Warm-up sets</summary><ul class="warm">${
        warm.map((w) => `<li><span>${w.reps} reps</span><span>${sideText(w.w)}</span><span>${fmt(w.w)}</span></li>`).join('')
      }</ul></details>` : '';
      return `<section class="card">
        <div class="row">
          <div><h2>${LIFTS[ex.id].name}</h2><p class="muted small">${ex.sets.length}×${reps}</p></div>
          <div class="stepper">
            <button data-act="w-" data-e="${i}" aria-label="Less weight">−</button>
            ${wInput('w', `data-e="${i}"`, ex.w)}
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
      ${supersetCard(a)}
      <button class="primary" data-act="finish">Finish workout</button>
      <button class="link danger" data-act="discard" style="display:block;margin:16px auto 0">Discard workout</button>
      ${recentHtml()}`;
  }

  function supersetCard(a) {
    const items = a.ex.map((ex, i) => ({ ex, i })).filter(({ ex }) => inSuperset(ex.id));
    if (!items.length) return '';
    const rounds = Math.max(...items.map(({ ex }) => ex.sets.length));
    const done = Math.min(...items.map(({ ex }) => ex.sets.filter((v) => v !== null).length));
    const status = done >= rounds ? 'All rounds done' : `Round ${done + 1} of ${rounds}`;
    const rows = items.map(({ ex, i }) => {
      const reps = targetOf(ex);
      const sets = ex.sets.map((v, j) => {
        const cls = v === null ? '' : v === reps ? ' done' : ' miss';
        return `<button class="set${cls}" data-act="set" data-e="${i}" data-s="${j}">${v === null ? reps : v}</button>`;
      }).join('');
      const [lo, hi] = LIFTS[ex.id].range || [reps, reps];
      const using = ex.suggest !== undefined && ex.w === ex.suggest;
      const suggestion = ex.suggest === undefined ? ''
        : `<button class="suggest${using ? ' on' : ''}" data-act="suggest" data-e="${i}">${using
          ? `Using ${fmt(ex.suggest)} for ${ex.sets.length}×${lo} · tap to undo`
          : `You hit ${ex.sets.length}×${hi} last time. Use ${fmt(ex.suggest)}?`}</button>`;
      const info = reps >= hi ? `${ex.sets.length}×${reps} · top of the range` : `${ex.sets.length}×${reps} · working up to ${ex.sets.length}×${hi}`;
      return `<div class="ss-ex">
        <div class="row">
          <div><strong>${LIFTS[ex.id].name}</strong><p class="muted small">${info}</p></div>
          <div class="stepper">
            <button data-act="w-" data-e="${i}" aria-label="Less weight">−</button>
            ${wInput('w', `data-e="${i}"`, ex.w)}
            <button data-act="w+" data-e="${i}" aria-label="More weight">+</button>
          </div>
        </div>
        ${suggestion}
        <div class="sets">${sets}</div>
      </div>`;
    }).join('');
    return `<section class="card">
      <div class="row"><h2>Superset</h2><span class="muted small">${status}</span></div>
      <p class="muted small" style="margin-top:4px">Optional. Do one set of each, back to back, then rest ${clock(SUPERSET_REST)}. ${rounds} rounds. Tap a set to log the round for all three; tap an exercise again for reps it missed. Weights per dumbbell; reps climb from ${REP_RANGE[0]} to ${REP_RANGE[1]}, then you choose when to go heavier.</p>
      ${rows}
    </section>`;
  }

  function histCard(h, extra) {
    const lines = h.ex.filter((ex) => ex.sets.some((s) => s !== null)).map((ex) => {
      const ok = ex.sets.every((s) => s !== null && s >= targetOf(ex));
      const reps = ok ? `${ex.sets.length}×${targetOf(ex)}` : ex.sets.map((s) => (s === null ? '–' : s)).join('/');
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
    const names = Object.fromEntries((state.programs || []).map((p) => [p.id, p.name]));
    let lastProg;
    const items = state.history.slice().reverse().map((h) => {
      const head = (state.programs || []).length > 1 && h.program !== lastProg ? `<h3 class="section">${names[h.program] || 'Program'}</h3>` : '';
      lastProg = h.program;
      return head + histCard(h, `<div class="row">
        <button class="link small" data-act="edit" data-id="${h.id}">Edit</button>
        <button class="link danger small" data-act="del" data-id="${h.id}">Delete</button>
      </div>`);
    }).join('');
    return `<h1>History</h1>${items}`;
  }

  const isLatest = (id) => state.history.length && state.history[state.history.length - 1].id === id;

  function editView() {
    const h = draft;
    const cards = h.ex.map((ex, i) => {
      const reps = targetOf(ex);
      const sets = ex.sets.map((s, j) => {
        const cls = s === null ? '' : s === reps ? ' done' : ' miss';
        return `<button class="set${cls}" data-act="eset" data-e="${i}" data-s="${j}">${s === null ? '–' : s}</button>`;
      }).join('');
      return `<section class="card">
        <div class="row">
          <div><h2>${LIFTS[ex.id].name}</h2><p class="muted small">${ex.sets.length}×${reps}</p></div>
          <div class="stepper">
            <button data-act="ew-" data-e="${i}" aria-label="Less weight">−</button>
            ${wInput('ew', `data-e="${i}"`, ex.w, h.unit)}
            <button data-act="ew+" data-e="${i}" aria-label="More weight">+</button>
          </div>
        </div>
        <div class="sets">${sets}</div>
      </section>`;
    }).join('');
    const note = 'Next working weights come from your latest workout with each lift, so they update when you save.';
    return `<h1>Edit workout</h1>
      <p class="hint" style="margin-top:-8px">${dateStr(h.date)} · Workout ${h.type}. Tap a set to cycle its reps; – means not done.</p>
      ${cards}
      <p class="hint">${note}</p>
      <button class="primary" data-act="esave">Save changes</button>
      <button class="link" data-act="ecancel" style="display:block;margin:16px auto 0">Cancel</button>`;
  }

  /* Next working weights come straight from the history, so an edit or delete only changes the record. */
  function saveEdit() {
    const i = state.history.findIndex((h) => h.id === draft.id);
    if (i < 0) { alert('That workout no longer exists.'); draft = null; return; }
    state.history[i] = draft;
    draft = null;
  }

  function deleteWorkout(id) {
    const i = state.history.findIndex((h) => String(h.id) === String(id));
    if (i < 0) return;
    const wasLatest = i === state.history.length - 1;
    state.history.splice(i, 1);
    /* The next workout follows on from whatever is now the latest one. */
    const last = state.history[state.history.length - 1];
    if (wasLatest) state.next = last ? (last.type === 'A' ? 'B' : 'A') : 'A';
    flash = null;
  }

  const FORECAST_WEEKS = 4;
  const shortDate = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  function progressView() {
    const chips = Object.keys(LIFTS).filter((id) => inUse(id) || state.history.some((h) => h.ex.some((e) => e.id === id))).map((id) =>
      `<button class="chip${id === chartLift ? ' on' : ''}" data-act="chart" data-id="${id}">${LIFTS[id].name}</button>`).join('');
    const now = Date.now();
    const lastLogged = state.history.length ? state.history[state.history.length - 1].date : null;
    const plan = forecastPlan(now, lastLogged, FORECAST_WEEKS);
    const ahead = forecast(state, plan.sessions, plan.fridays);
    const endDate = shortDate(plan.fridays[FORECAST_WEEKS - 1]);

    /* Logged sessions for the selected lift, then the forecast one week apart from today. */
    const logged = [];
    state.history.forEach((h) => {
      const ex = h.ex.find((e) => e.id === chartLift && e.sets.some((s) => s !== null));
      if (ex) logged.push({ t: new Date(h.date).getTime(), w: convert(ex.w, h.unit, state.unit) });
    });
    const projected = ahead[chartLift].map((w, k) => ({ t: plan.fridays[k].getTime(), w }));
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
        <div><b>${fmt(last.w)}</b><span>By ${endDate}</span></div>
      </div>` : '<p class="hint">No workouts with this lift logged yet. The forecast starts from your working weight.</p>';

    const cur = state.lifts[chartLift].w;
    const weeks = ahead[chartLift].map((w, k) => {
      const d = `Fri ${shortDate(plan.fridays[k])}`;
      const up = w - cur;
      return `<li><span>${d}</span><span class="muted small">${up > 0 ? `+${fmt(up)}` : 'same'}</span><strong>${fmt(w)}</strong></li>`;
    }).join('');

    const order = Object.keys(LIFTS).filter(inUse).sort((a, b) => !!LIFTS[a].opt - !!LIFTS[b].opt);
    const table = order.map((id) => {
      const end = ahead[id][FORECAST_WEEKS - 1];
      return `<li><span>${LIFTS[id].name}</span><span class="muted small">${fmt(state.lifts[id].w)} →</span><strong>${fmt(end)}</strong></li>`;
    }).join('');

    return `<h1>Progress</h1><div class="chips">${chips}</div>
      <section class="card">${chart}${stats}</section>
      <section class="card"><h2>${LIFTS[chartLift].name} forecast</h2>
        <ul class="plan">${weeks}</ul>
      </section>
      <section class="card"><h2>All lifts by Fri ${endDate}</h2>
        <ul class="plan">${table}</ul>
      </section>
      <p class="hint">Each date is the Friday of one of the next ${FORECAST_WEEKS} weeks, showing the weight you'd lift by then. Forecasts assume you train Monday, Wednesday and Friday, hit every rep and alternate A and B, using each lift's increment and frequency from Settings. Missed reps or skipped workouts push them back.</p>
      <p class="hint">${state.history.length} workout${state.history.length === 1 ? '' : 's'} logged.</p>`;
  }


  function settingsView() {
    const u = UNITS[state.unit];
    /* Dumbbell exercises have nothing to set: the workout works out weight and reps from history. */
    const dumbbellRow = (id) => {
      const plan = dumbbellPlan(state, id);
      const last = plan.last ? `Last time ${fmt(plan.last.w)}, ${plan.last.sets.map((v) => (v === null ? '–' : v)).join('/')}` : 'Not logged yet';
      const next = plan.suggest ? `next ${LIFTS[id].sets}×${plan.reps}, or ${fmt(plan.suggest)} suggested` : `next ${LIFTS[id].sets}×${plan.reps} at ${fmt(plan.w)}`;
      return `<div class="lift-set"><div class="row"><span>${LIFTS[id].name}</span></div>
        <div class="sub"><span>${last}</span><span>${next}</span></div></div>`;
    };
    const liftRow = (id) => {
      const l = state.lifts[id];
      const other = settingsGroup === 'A' ? 'B' : 'A';
      const shared = WORKOUTS[other].includes(id) ? `<span class="muted small"> · also in ${other}</span>` : '';
      const opts = u.incs.map((v) => `<option value="${v}"${v === l.inc ? ' selected' : ''}>+${fmt(v)}</option>`).join('');
      return `<div class="lift-set">
        <div class="row"><span>${LIFTS[id].name}${shared}</span>
          ${hasLogged(state, id) ? `<strong>${fmt(l.w)}</strong>` : `<div class="stepper" title="Starting weight">
            <button data-act="l-" data-id="${id}" aria-label="Less weight">−</button>
            ${wInput('l', `data-id="${id}"`, l.w)}
            <button data-act="l+" data-id="${id}" aria-label="More weight">+</button>
          </div>`}
        </div>
        <div class="sub"><span>${hasLogged(state, id) ? `Next weight · started at ${fmt(startWeight(state, id))}` : 'Starting weight'}</span></div>
        <div class="sub"><span>Weight to add</span><select data-inc="${id}">${opts}</select></div>
      </div>`;
    };
    const ids = WORKOUTS[settingsGroup];
    const lifts = `<div class="group"><h3 class="sub-h">Main lifts</h3>${ids.filter((id) => !inSuperset(id)).map(liftRow).join('')}</div>
      <div class="group"><h3 class="sub-h">Superset · dumbbells · ${REP_RANGE[0]}–${REP_RANGE[1]} reps</h3>
        <p class="muted small" style="margin:4px 0 0">Nothing to set here: each workout works out the weight and reps from your last session. Finish every set and the next one adds a rep to each, up to ${REP_RANGE[1]}; after that the workout suggests the next dumbbell up, and you change weight there.</p>
        ${ids.filter(inSuperset).map(dumbbellRow).join('')}</div>`;
    const bars = u.bars.map((v) => `<option value="${v}"${v === state.bar ? ' selected' : ''}>${fmt(v)}</option>`).join('');
    if (newProg) return newProgramView();
    const p = curProgram(state);
    const done = progHistory(state).length;
    return `<h1>Settings</h1>
      <h3 class="section">Program</h3>
      <section class="card">
        <div class="row"><h2>${p.name}</h2></div>
        <p class="muted small" style="margin:2px 0 8px">Started ${dateStr(p.started)} · ${done} workout${done === 1 ? '' : 's'}</p>
        <div class="row"><h3 class="sub-h" style="margin:0">Exercises</h3><div class="seg">
          <button data-act="sgroup" data-g="A" class="${settingsGroup === 'A' ? 'on' : ''}">Workout A</button>
          <button data-act="sgroup" data-g="B" class="${settingsGroup === 'B' ? 'on' : ''}">Workout B</button>
        </div></div>
        <p class="muted small" style="margin:6px 0 4px">Next weights come from your last workout in this program, so they can't be set here; change one during the workout if you need to. Lifts you haven't done yet in this program show their starting weight, which you can still change.</p>
        ${lifts}
        <button class="secondary" data-act="np-open">Start a new program</button>
      </section>
      <section class="card"><h2>How the program works</h2>
        <ul class="rules">
          <li>Workout A: Squat, Bench Press, Barbell Row. Workout B: Squat, Overhead Press, Deadlift.</li>
          <li>Alternate A and B, three days a week, with a rest day between.</li>
          <li>Five sets of five reps at the same weight. Deadlift is one set of five.</li>
          <li>After the main lifts, an optional dumbbell superset: one set of each exercise back to back, rest ${clock(SUPERSET_REST)}, three rounds. Reps climb from ${REP_RANGE[0]} to ${REP_RANGE[1]}, one per set each successful workout. After ${REP_RANGE[1]}, the workout suggests a heavier dumbbell; take it and reps start again at ${REP_RANGE[0]}. A: Curl, Triceps Extension, Lateral Raise. B: Row, Reverse Fly, Chest Press.</li>
          <li>Your next weight comes from your last workout with that lift: hit every rep and it goes up by the amount above; miss any and you repeat it.</li>
          <li>Rest 1:30 if the last set felt easy, 3:00 if it was hard, 5:00 if you missed reps.</li>
          <li>Stalled, or back after a break? Start a new program from lighter weights. Your history and streaks carry over.</li>
        </ul>
      </section>
      <h3 class="section">App</h3>
      <section class="card">
        <div class="field"><span>Units</span><div class="seg">
          <button data-act="unit" data-u="kg" class="${state.unit === 'kg' ? 'on' : ''}">kg</button>
          <button data-act="unit" data-u="lb" class="${state.unit === 'lb' ? 'on' : ''}">lb</button>
        </div></div>
        <div class="field"><span>Bar weight</span><select id="bar">${bars}</select></div>
      </section>
      ${syncCard()}
      <button class="secondary" data-act="export">Back up data</button>
      <button class="secondary" data-act="import">Restore from backup</button>
      <button class="secondary danger" data-act="reset">Erase everything</button>
      <p class="hint">${token
        ? 'Workouts are saved on this device and synced to GitHub. Backups are optional.'
        : `Workouts are saved on this device. Connect GitHub above to sync them, or back up and push ${DATA_FILE} by hand.`}</p>`;
  }

  function newProgramView() {
    const ids = [...WORKOUTS.A, ...WORKOUTS.B].filter((id, i, a) => a.indexOf(id) === i);
    const row = (id) => `<div class="lift-set"><div class="row"><span>${LIFTS[id].name}</span>
        <div class="stepper">
          <button data-act="np-" data-id="${id}" aria-label="Less weight">−</button>
          ${wInput('np', `data-id="${id}"`, newProg.start[id])}
          <button data-act="np+" data-id="${id}" aria-label="More weight">+</button>
        </div></div>
        <div class="sub"><span>Now ${fmt(state.lifts[id].w)}</span></div></div>`;
    const cur = curProgram(state);
    return `<h1>New program</h1>
      <section class="card">
        <label class="field col"><span>Name</span><input id="np-name" class="text" value="${newProg.name.replace(/"/g, '&quot;')}"></label>
        <div class="row" style="margin-top:10px"><h3 class="sub-h" style="margin:0">Starting weights</h3>
          <div class="seg"><button data-act="np-next">Current</button><button data-act="np-90">90%</button></div></div>
        <p class="muted small" style="margin:6px 0 4px">Prefilled with your current next weights. Tap 90% to start a little lighter, or set each one.</p>
        <div class="group"><h3 class="sub-h">Main lifts</h3>${ids.filter((id) => !inSuperset(id)).map(row).join('')}</div>
        <div class="group"><h3 class="sub-h">Dumbbells</h3>${ids.filter(inSuperset).map(row).join('')}</div>
      </section>
      <button class="primary" data-act="np-start">Start program</button>
      <button class="secondary" data-act="np-cancel">Cancel</button>
      <p class="hint">${cur ? `This ends ${cur.name}. ` : ''}Its workouts stay in History, and your streaks carry on. The new program starts with Workout A.</p>`;
  }

  /* ----- Rest timer and elapsed clock ----- */

  function tick() {
    const a = state.active;
    const el = document.getElementById('elapsed');
    if (a && el) el.textContent = clock((Date.now() - a.started) / 1000);
    if (!a || !a.rest || tab !== 'workout') { restEl.hidden = true; return; }
    const sec = (Date.now() - a.rest.start) / 1000;
    const marks = a.rest.superset ? [SUPERSET_REST] : a.rest.failed ? [300] : [90, 180];
    marks.forEach((m) => {
      if (sec >= m && !a.rest.beeped.includes(m)) {
        a.rest.beeped.push(m);
        save();
        if (sec < m + 5) beep();
      }
    });
    const ready = sec >= marks[0];
    const msg = a.rest.superset
      ? `Round done. Rest ${clock(SUPERSET_REST)}, then start the next round.`
      : a.rest.failed
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
      ex: WORKOUTS[state.next].map((id) => ({
        id,
        w: hasRange(id) ? dumbbellPlan(state, id).w : state.lifts[id].w,
        sets: Array(LIFTS[id].sets).fill(null),
        ...(hasRange(id) ? { reps: liftTarget(state, id) } : {}),
        ...(hasRange(id) && dumbbellPlan(state, id).suggest ? { suggest: dumbbellPlan(state, id).suggest } : {}),
      })),
    };
    keepAwake(true);
  }

  function tapSet(e, s) {
    unlockAudio();
    const a = state.active;
    const reps = targetOf(a.ex[e]);
    const cur = a.ex[e].sets[s];
    const next = cur === null ? reps : cur === 0 ? null : cur - 1;
    a.ex[e].sets[s] = next;
    /* In a superset, logging a set logs that round for every exercise in it at their full reps.
       Tapping again adjusts only the exercise tapped, for reps it missed. */
    if (inSuperset(a.ex[e].id) && cur === null) {
      a.ex.forEach((ex) => {
        if (inSuperset(ex.id) && s < ex.sets.length && ex.sets[s] === null) ex.sets[s] = targetOf(ex);
      });
    }
    const allDone = a.ex.every((ex) => ex.sets.every((v) => v !== null));
    const keepStart = cur !== null && a.rest ? a.rest.start : Date.now();
    if (next === null || allDone) {
      a.rest = null;
    } else if (inSuperset(a.ex[e].id)) {
      /* No rest between exercises in a superset; rest once every exercise has done this round.
         Correcting the reps of a set already logged leaves the timer as it is. */
      if (cur !== null) return;
      const round = a.ex.filter((ex) => inSuperset(ex.id) && s < ex.sets.length);
      a.rest = round.every((ex) => ex.sets[s] !== null)
        ? { start: keepStart, superset: true, failed: false, beeped: [] }
        : null;
    } else {
      a.rest = { start: keepStart, failed: next < reps, beeped: [] };
    }
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
      program: state.program,
      unit: state.unit,
      mins: Math.max(1, Math.round((Date.now() - a.started) / 60000)),
      ex: a.ex.map((ex) => ({ id: ex.id, w: ex.w, sets: ex.sets, ...(ex.reps ? { reps: ex.reps } : {}) })),
      /* The lifts as they were before this workout, so an edit to it can redo the progression. */
      prev: { next: state.next, lifts: Object.fromEntries(a.ex.map((ex) => [ex.id, { ...state.lifts[ex.id] }])) },
    };
    flash = applyProgression(state, entry);
    state.history.push(entry);
    state.active = null;
    keepAwake(false);
    confetti();
  }

  /* A short burst of confetti over the page when a workout is logged. */
  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    const dpr = window.devicePixelRatio || 1;
    const W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    document.body.appendChild(c);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const colors = ['#f5a524', '#4cc38a', '#ef5350', '#4aa3ff', '#c77dff', '#f2f3f5'];
    const bits = Array.from({ length: 160 }, (_, i) => {
      const left = i % 2 === 0;
      const ang = (left ? -60 : -120) * Math.PI / 180 + (Math.random() - 0.5) * 0.9;
      const sp = 9 + Math.random() * 9;
      return { x: left ? 0 : W, y: H * 0.75, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length] };
    });
    const t0 = performance.now();
    (function frame(t) {
      const age = t - t0;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2200) / 800);
      for (const b of bits) {
        b.vy += 0.3; b.vx *= 0.985; b.vy *= 0.985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c;
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); g.restore();
      }
      if (age < 3000) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  function setUnit(unit) {
    if (unit === state.unit) return;
    if (state.active) { alert('Finish or discard the current workout first.'); return; }
    const from = state.unit;
    for (const id in state.lifts) {
      state.lifts[id].w = Math.max(minW(id, UNITS[unit].bar, unit), convert(state.lifts[id].w, from, unit));
      state.lifts[id].inc = UNITS[unit].inc[id];
    }
    for (const p of state.programs) for (const id in p.start) p.start[id] = Math.max(minW(id, UNITS[unit].bar, unit), convert(p.start[id], from, unit));
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
    else if (t.id === 'np-name') { newProg.name = t.value; return; }
    else if (t.dataset.wedit) {
      const v = Math.round(Number(t.value) * 100) / 100;
      const k = t.dataset.wedit;
      const id = k === 'l' || k === 'np' ? t.dataset.id : (k === 'w' ? state.active : draft).ex[Number(t.dataset.e)].id;
      const unit = k === 'ew' ? draft.unit : state.unit;
      const bar = k === 'ew' && draft.unit !== state.unit ? UNITS[unit].bar : state.bar;
      if (!Number.isFinite(v) || v <= 0) { render(); return; }
      const w = Math.max(minW(id, bar, unit), v);
      if (k === 'l') curProgram(state).start[id] = w;
      else if (k === 'np') newProg.start[id] = w;
      else (k === 'w' ? state.active : draft).ex[Number(t.dataset.e)].w = w;
      if (k === 'ew' || k === 'np') { render(); return; }
    }
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
        const by = LIFTS[ex.id].db ? stepFor(ex.id, state.unit) : Math.min(step, state.lifts[ex.id].inc);
        ex.w = Math.max(minW(ex.id, state.bar, state.unit), ex.w + (d.act === 'w+' ? by : -by));
        break;
      }
      case 'l-': case 'l+': {
        const l = state.lifts[d.id];
        const by = LIFTS[d.id].db ? stepFor(d.id, state.unit) : Math.min(step, l.inc);
        curProgram(state).start[d.id] = Math.max(minW(d.id, state.bar, state.unit), l.w + (d.act === 'l+' ? by : -by));
        break;
      }
      case 'np-': case 'np+': {
        const by = LIFTS[d.id].db ? stepFor(d.id, state.unit) : Math.min(step, state.lifts[d.id].inc);
        newProg.start[d.id] = Math.max(minW(d.id, state.bar, state.unit), newProg.start[d.id] + (d.act === 'np+' ? by : -by));
        render();
        return;
      }
      case 'np-open':
        if (state.active) { alert('Finish or discard the current workout first.'); return; }
        const base = programName(new Date());
        const taken = (n) => state.programs.some((q) => q.name === n);
        let name = base;
        for (let k = 2; taken(name); k++) name = `${base} (${k})`;
        newProg = { name, start: Object.fromEntries(Object.keys(LIFTS).filter(inUse).map((id) => [id, state.lifts[id].w])) };
        render(); window.scrollTo(0, 0);
        return;
      case 'np-90':
        for (const id in newProg.start) {
          const step = stepFor(id, state.unit);
          newProg.start[id] = Math.max(minW(id, state.bar, state.unit), floorTo(state.lifts[id].w * DELOAD, step));
        }
        render();
        return;
      case 'np-next':
        for (const id in newProg.start) newProg.start[id] = state.lifts[id].w;
        render();
        return;
      case 'np-cancel': newProg = null; render(); return;
      case 'np-start': {
        const now = new Date().toISOString();
        const cur = curProgram(state);
        if (cur) cur.ended = now;
        const p = { id: Date.now(), name: (newProg.name || '').trim() || programName(now), started: now, ended: null,
          start: { ...Object.fromEntries(Object.keys(LIFTS).map((id) => [id, state.lifts[id].w])), ...newProg.start } };
        state.programs.push(p);
        state.program = p.id;
        state.next = 'A';
        newProg = null;
        flash = null;
        tab = 'workout';
        break;
      }
      case 'rest-x': state.active.rest = null; break;
      case 'suggest': {
        /* Switch to the suggested dumbbell and start the rep range over, or switch back. */
        const ex = state.active.ex[Number(d.e)];
        if (ex.w !== ex.suggest) {
          ex.planned = { w: ex.w, reps: ex.reps };
          ex.w = ex.suggest;
          ex.reps = LIFTS[ex.id].range[0];
        } else if (ex.planned) {
          ex.w = ex.planned.w;
          ex.reps = ex.planned.reps;
        }
        ex.sets = ex.sets.map((v) => (v === null ? null : Math.min(v, ex.reps)));
        break;
      }
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
        const reps = targetOf(ex);
        const cur = ex.sets[Number(d.s)];
        ex.sets[Number(d.s)] = cur === null ? reps : cur === 0 ? null : cur - 1;
        render();
        return;
      }
      case 'ew-': case 'ew+': {
        const ex = draft.ex[Number(d.e)];
        const u = UNITS[draft.unit];
        const by = LIFTS[ex.id].db ? u.dbStep : Math.min(u.step, draft.unit === state.unit ? state.lifts[ex.id].inc : u.step);
        const bar = draft.unit === state.unit ? state.bar : u.bar;
        ex.w = Math.max(minW(ex.id, bar, draft.unit), ex.w + (d.act === 'ew+' ? by : -by));
        render();
        return;
      }
      case 'ecancel': draft = null; render(); maybeReload(); return;
      case 'esave': saveEdit(); save(); tab = 'workout'; render(); window.scrollTo(0, 0); maybeReload(); return;
      case 'del':
        if (!confirm('Delete this workout? Next working weights will come from the workout before it.')) return;
        deleteWorkout(d.id);
        /* Remembered so the sync doesn't treat the repository's copy of it as a workout this device is missing. */
        state.deleted = [...(state.deleted || []), Number(d.id)];
        break;
      case 'chart': chartLift = d.id; break;
      case 'sgroup': settingsGroup = d.g; render(); return;
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
