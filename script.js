'use strict';
(() => {
/* ========== CONFIG / CONSTANTS ========== */
const COL = { bg: '#080B18', cy: '#20E9FF', mg: '#FF3FC8', li: '#A4FF66', vi: '#A58BFF' };
const CORES = [{ n: 'Cyan', c: '#20E9FF', p: 0 }, { n: 'Lime', c: '#A4FF66', p: 80 }, { n: 'Violet', c: '#A58BFF', p: 200 }, { n: 'Gold', c: '#FFD34D', p: 400 }];
const ACH = [
  ['first', 'First Run', 'Finish 1 run', () => S.runs, 1],
  ['frag', 'Fragment Hunter', 'Collect 200 fragments', () => S.earned, 200],
  ['combo', 'Combo Master', 'Reach a 20 combo', () => S.bestCombo, 20],
  ['surv', 'Survival Expert', 'Survive 60 seconds', () => Math.floor(S.bestTime), 60],
  ['pb', 'Personal Best', 'Beat your best score', () => (S.ach.pb ? 1 : 0), 1]
];
const TP = 0.9; // depth where the player sits (0 = horizon, 1 = camera)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const E = id => document.getElementById(id);
const cv = E('c'), cx = cv.getContext('2d');

/* ========== STORAGE ========== */
const KEY = 'neonflux.v1';
const DEF = () => ({ best: 0, bank: 0, earned: 0, runs: 0, bestCombo: 0, bestTime: 0, owned: [0], core: 0, ach: {},
  sfx: true, shake: true, reduced: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), dailyBest: { d: '', s: 0 } });
function load() {
  const d = DEF();
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (!r || typeof r !== 'object') return d;
    for (const k in d) if (r[k] !== null && typeof r[k] === typeof d[k]) d[k] = r[k];
    for (const k of ['best', 'bank', 'earned', 'runs', 'bestCombo', 'bestTime']) if (!(d[k] >= 0) || !isFinite(d[k])) d[k] = 0;
    d.owned = Array.isArray(d.owned) ? d.owned.filter(i => CORES[i]) : [0];
    if (!d.owned.includes(0)) d.owned.push(0);
    if (!d.owned.includes(d.core)) d.core = 0;
    if (typeof d.dailyBest.s !== 'number' || typeof d.dailyBest.d !== 'string') d.dailyBest = { d: '', s: 0 };
    return d;
  } catch (e) { return DEF(); }
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: game still works */ } }
let S = load();

/* ========== AUDIO (Web Audio, started on user gesture) ========== */
let ac;
function beep(f, d = 0.1, type = 'sine', v = 0.07, f2) {
  if (!S.sfx) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  } catch (e) { /* audio unsupported */ }
}
const SFX = {
  sel: () => beep(520, 0.07, 'square', 0.04), frag: () => beep(880, 0.08, 'sine', 0.06, 1320),
  combo: () => beep(660, 0.2, 'triangle', 0.08, 1320), ab: () => beep(300, 0.35, 'sawtooth', 0.05, 900),
  hit: () => beep(200, 0.25, 'square', 0.07, 80), over: () => beep(400, 0.7, 'sawtooth', 0.06, 60)
};

/* ========== OPTIONAL ADS MODULE (disabled; see README checklist) ========== */
const Ads = {
  config: { enabled: false /* set true ONLY after official H5 Games Ads approval and integration */ },
  ready: false,
  init() { if (!this.config.enabled) return; /* Official Ad Placement API setup would go here. Nothing is loaded by default. */ },
  showRewardedContinue() { /* Call the reward callback ONLY from the official "ad viewed" event. Not implemented. */ }
};

/* ========== RNG / DAILY SEED ========== */
const dayKey = () => new Date().toISOString().slice(0, 10);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/* ========== GAME STATE ========== */
const newG = () => ({ mode: 'menu', t: 0, score: 0, frags: 0, combo: 0, bestCombo: 0, mult: 1, charge: 0, shield: 0, slow: 0, inv: 0,
  objs: [], spawnD: 0.3, free: 0, px: 0, lane: 0, laneAt: -9, scroll: 0, shake: 0, rnd: Math.random, cd: 0, daily: false, hzIn: 8 });
let G = newG(), back = 'menu', pend = false, seenTut = false;

/* ========== OBJECT & PARTICLE POOLS ========== */
const pool = [];
function obj(type, lane, t, len) {
  let o = pool.find(q => !q.on);
  if (!o) pool.push(o = {});
  o.on = true; o.type = type; o.lane = lane; o.t = t; o.len = len || 0.07; o.done = false; o.nm = false; o.sh = G.rnd() < 0.5;
  G.objs.push(o);
}
const PN = (navigator.hardwareConcurrency || 4) <= 4 ? 90 : 180;
const parts = Array.from({ length: PN }, () => ({ a: 0, x: 0, y: 0, vx: 0, vy: 0, l: 0, m: 1, c: '#fff' }));
let pi = 0;
function emit(x, y, n, c, spd = 140) {
  for (let i = 0; i < n; i++) {
    const p = parts[pi = (pi + 1) % PN], a = Math.random() * 6.283, s = Math.random() * spd;
    p.a = 1; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.l = p.m = 0.4 + Math.random() * 0.3; p.c = c;
  }
}

/* ========== LAYOUT / PROJECTION ========== */
let W = 0, H = 0, dpr = 1, hy = 0, py = 0, cxm = 0, LW = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  hy = H * 0.28; py = H * 0.95; cxm = W / 2; LW = Math.min(W * 0.28, H * 0.32);
}
const Y = t => hy + (py - hy) * Math.pow(t, 1.8);
const Sc = t => 0.04 + 0.96 * Math.pow(t, 1.8);
const lx = (lane, t) => cxm + lane * LW * Sc(t);

/* ========== GAMEPLAY ========== */
function spawnRow() {
  const r = G.rnd, diff = Math.min(1, G.t / 120), gap = 0.5 - 0.08 * diff;
  G.free = clamp(G.free + Math.floor(r() * 3) - 1, -1, 1); // free lane moves at most one lane: always reachable
  const f = G.free;
  if (G.t > 15 && G.hzIn <= 0) { // signaled lane hazard: long magenta strip visible from the horizon
    let l; do { l = Math.floor(r() * 3) - 1; } while (l === f);
    obj('lane', l, 0, 0.3); obj('fr', f, 0); obj('fr', f, -0.1);
    G.hzIn = 14 + r() * 8; G.spawnD = 0.3 + gap; return;
  }
  const p = r();
  if (G.t < 5 || p < 0.28) { for (let i = 0; i < 3; i++) obj('fr', f, -i * 0.07); }
  else {
    for (let l = -1; l <= 1; l++) if (l !== f && (p < 0.62 || r() < 0.5)) obj('ob', l, 0);
    if (r() < 0.85) obj('fr', f, -0.1);
  }
  G.spawnD = gap;
}
function collect() {
  G.frags++; G.combo++; G.bestCombo = Math.max(G.bestCombo, G.combo);
  const old = G.mult; G.mult = Math.min(5, 1 + Math.floor(G.combo / 5));
  G.score += 10 * G.mult; G.charge = Math.min(100, G.charge + 8);
  (G.combo % 5 === 0 ? SFX.combo : SFX.frag)();
  if (G.mult > old) toast('COMBO ×' + G.mult);
  emit(lx(G.px, TP), Y(TP), 8, COL.li);
}
function crash() {
  if (G.inv > 0) return;
  if (G.shield > 0) { G.shield = 0; G.inv = 1; G.shake = 0.35; SFX.hit(); emit(lx(G.px, TP), Y(TP), 22, COL.vi, 220); return; }
  die();
}
function ability(k) {
  if (G.mode !== 'play') return false;
  if (k === 'shield' && G.charge >= 40 && G.shield <= 0) { G.charge -= 40; G.shield = 8; SFX.ab(); return true; }
  if (k === 'slow' && G.charge >= 60 && G.slow <= 0) { G.charge -= 60; G.slow = 4; SFX.ab(); return true; }
  return false;
}
function move(d) {
  if (G.mode !== 'play') return;
  const n = clamp(G.lane + d, -1, 1);
  if (n !== G.lane) { G.lane = n; G.laneAt = G.t; }
}
function update(dt) {
  G.t += dt;
  const diff = Math.min(1, G.t / 120), sp = (0.42 + 0.28 * diff) * (G.slow > 0 ? 0.5 : 1);
  G.px += (G.lane - G.px) * Math.min(1, dt * 16);
  G.score += dt * (8 + 12 * diff);
  G.shield = Math.max(0, G.shield - dt); G.slow = Math.max(0, G.slow - dt); G.inv = Math.max(0, G.inv - dt);
  G.hzIn -= dt; G.scroll = (G.scroll + sp * dt * 1.2) % 1;
  G.spawnD -= sp * dt; if (G.spawnD <= 0) spawnRow();
  let w = 0;
  for (const o of G.objs) {
    o.t += sp * dt;
    const hit = o.t >= 0.86 && o.t - o.len <= 0.94 && Math.abs(G.px - o.lane) < 0.55;
    if (!o.done) {
      if (o.type === 'fr') {
        if (hit) { o.done = true; o.on = false; collect(); }
        else if (o.t > 1) { o.done = true; G.combo = 0; G.mult = 1; }
      } else if (hit) { o.done = true; crash(); }
      else if (o.type === 'ob' && !o.nm && o.t > 0.9) { // near miss: adjacent lane, just after a lane change
        o.nm = true; const d = Math.abs(G.px - o.lane);
        if (d >= 0.55 && d < 1.3 && G.t - G.laneAt < 0.45) { G.score += 25 * G.mult; toast('NEAR MISS +' + 25 * G.mult); }
      }
    }
    if (!o.on || o.t - o.len > 1.1) o.on = false; else G.objs[w++] = o;
  }
  G.objs.length = w;
  if (G.mode === 'play' && Math.random() < 0.6) { const p = parts[pi = (pi + 1) % PN]; p.a = 1; p.x = lx(G.px, TP) + (Math.random() - 0.5) * 8; p.y = Y(TP) + 10; p.vx = 0; p.vy = 80; p.l = p.m = 0.35; p.c = CORES[S.core].c; }
}
function die() {
  SFX.over(); G.shake = 0.7; G.mode = 'over';
  const sc = Math.floor(G.score), pb = sc > S.best, first = S.runs === 0;
  if (pb) S.best = sc;
  S.bank += G.frags; S.earned += G.frags; S.runs++;
  S.bestCombo = Math.max(S.bestCombo, G.bestCombo); S.bestTime = Math.max(S.bestTime, G.t);
  if (G.daily && sc > (S.dailyBest.d === dayKey() ? S.dailyBest.s : 0)) S.dailyBest = { d: dayKey(), s: sc };
  if (pb && !first) unlock('pb');
  for (const a of ACH) if (!S.ach[a[0]] && a[3]() >= a[4]) unlock(a[0]);
  persist();
  E('oScore').textContent = sc; E('newbest').hidden = !pb; E('oFrag').textContent = G.frags;
  E('oCombo').textContent = G.bestCombo; E('oTime').textContent = Math.floor(G.t) + 's';
  E('rewarded').hidden = !Ads.ready;
  show('over');
}
function unlock(id) { if (S.ach[id]) return; S.ach[id] = 1; const a = ACH.find(x => x[0] === id); toast('ACHIEVEMENT: ' + a[1].toUpperCase()); }

/* ========== RENDERING ========== */
function tunnel() {
  const g = cx.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, 'rgba(32,233,255,.16)'); g.addColorStop(1, 'rgba(8,11,24,0)');
  cx.fillStyle = g; cx.fillRect(0, hy, W, H - hy);
  const ac1 = G.slow > 0 ? COL.vi : COL.cy;
  cx.strokeStyle = ac1; cx.lineWidth = 1.5; cx.shadowBlur = 0;
  for (let i = 0; i < 10; i++) { // scrolling rings and floor grid
    const t = (i + G.scroll) / 10, y = Y(t), s = Sc(t), hw = 2.4 * LW * s;
    cx.globalAlpha = 0.1 + 0.5 * t;
    cx.strokeRect(cxm - hw, y - 2.2 * LW * s, hw * 2, 2.2 * LW * s);
  }
  cx.globalAlpha = 0.85; cx.shadowColor = ac1; cx.shadowBlur = 8;
  cx.beginPath();
  for (const e of [-1.5, -0.5, 0.5, 1.5]) { cx.moveTo(lx(e, 0), Y(0)); cx.lineTo(lx(e, 1.05), Y(1.05)); }
  cx.stroke(); cx.shadowBlur = 0; cx.globalAlpha = 1;
}
function diamond(x, y, r) { cx.beginPath(); cx.moveTo(x, y - r); cx.lineTo(x + r * 0.8, y); cx.lineTo(x, y + r); cx.lineTo(x - r * 0.8, y); cx.closePath(); }
function drawObj(o) {
  const t = clamp(o.t, 0, 1.1), s = Sc(t), x = lx(o.lane, t), y = Y(t), r = LW * 0.3 * s;
  if (o.type === 'lane') {
    const t0 = clamp(o.t - o.len, 0, 1.1), t1 = t;
    cx.globalAlpha = 0.28 + 0.2 * Math.sin(G.t * 14); cx.fillStyle = COL.mg;
    cx.beginPath(); cx.moveTo(lx(o.lane - 0.5, t0), Y(t0)); cx.lineTo(lx(o.lane + 0.5, t0), Y(t0));
    cx.lineTo(lx(o.lane + 0.5, t1), Y(t1)); cx.lineTo(lx(o.lane - 0.5, t1), Y(t1)); cx.closePath(); cx.fill();
    cx.globalAlpha = 1; cx.strokeStyle = COL.mg; cx.lineWidth = 2; cx.stroke(); return;
  }
  cx.shadowColor = o.type === 'fr' ? COL.li : COL.mg; cx.shadowBlur = 14;
  if (o.type === 'fr') { cx.fillStyle = COL.li; diamond(x, y - r * 0.4, r * 0.6); cx.fill(); return; }
  cx.fillStyle = COL.mg;
  if (o.sh) { diamond(x, y - r, r * 1.1); cx.fill(); }
  else { cx.beginPath(); cx.moveTo(x, y - r * 2); cx.lineTo(x + r, y); cx.lineTo(x - r, y); cx.closePath(); cx.fill(); }
  cx.fillStyle = COL.bg; diamond(x, y - r, r * 0.4); cx.fill();
}
function drawPlayer() {
  const x = lx(G.px, TP), y = Y(TP), r = LW * 0.2;
  if (G.inv > 0 && Math.floor(G.t * 20) % 2) return; // blink while invulnerable
  cx.shadowColor = CORES[S.core].c; cx.shadowBlur = 20; cx.fillStyle = CORES[S.core].c;
  cx.beginPath(); cx.arc(x, y - r, r, 0, 6.283); cx.fill();
  cx.shadowBlur = 0; cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(x, y - r, r * 0.4, 0, 6.283); cx.fill();
  if (G.shield > 0) { cx.strokeStyle = COL.vi; cx.lineWidth = 3; cx.shadowColor = COL.vi; cx.shadowBlur = 14; cx.beginPath(); cx.arc(x, y - r, r * 1.6, 0, 6.283); cx.stroke(); cx.shadowBlur = 0; }
}
function draw() {
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.fillStyle = COL.bg; cx.fillRect(0, 0, W, H);
  cx.save();
  if (G.shake > 0 && S.shake && !S.reduced) cx.translate((Math.random() - 0.5) * 14 * G.shake, (Math.random() - 0.5) * 14 * G.shake);
  tunnel();
  if (G.mode !== 'menu') {
    for (const o of G.objs) drawObj(o);
    drawPlayer();
  }
  cx.shadowBlur = 0;
  for (const p of parts) if (p.a) { cx.globalAlpha = clamp(p.l / p.m, 0, 1); cx.fillStyle = p.c; cx.fillRect(p.x, p.y, 3, 3); }
  cx.globalAlpha = 1; cx.restore();
}

/* ========== UI ========== */
let toastT = 0;
function toast(m) { const e = E('toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 1400); }
function setT(id, v) { const e = E(id); if (e._v !== v) { e._v = v; e.textContent = v; } }
function hud() {
  setT('score', Math.floor(G.score)); setT('best', Math.max(S.best, Math.floor(G.score))); setT('frags', G.frags); setT('combo', '×' + G.mult);
  const m = E('meter'), w = Math.round(G.charge) + '%'; if (m._v !== w) { m._v = w; m.style.width = w; }
  setT('shieldTxt', G.shield > 0 ? 'SHIELD ' + Math.ceil(G.shield) + 's' : G.slow > 0 ? 'SLOW ' + Math.ceil(G.slow) + 's' : '');
  const a = G.charge < 40 || G.shield > 0, b = G.charge < 60 || G.slow > 0;
  if (E('bShield').disabled !== a) E('bShield').disabled = a;
  if (E('bSlow').disabled !== b) E('bSlow').disabled = b;
}
function show(n) { document.body.dataset.screen = n; }
function go(n) { back = document.body.dataset.screen; show(n); if (n === 'settings') refreshSettings(); }
function refreshMenu() {
  E('mBest').textContent = S.best; E('mBank').textContent = S.bank;
  E('mDaily').textContent = 'Today’s daily best: ' + (S.dailyBest.d === dayKey() ? S.dailyBest.s : '—');
}
function refreshSettings() {
  E('bSfx').textContent = 'Sound effects: ' + (S.sfx ? 'ON' : 'OFF');
  E('bShake').textContent = 'Screen shake: ' + (S.shake ? 'ON' : 'OFF');
  E('bRed').textContent = 'Reduced motion: ' + (S.reduced ? 'ON' : 'OFF');
}
function renderShop() {
  E('achList').innerHTML = ACH.map(a => { const v = Math.min(a[3](), a[4]); return `<li class="${S.ach[a[0]] ? 'done' : ''}"><span>${a[1]} — ${a[2]}</span><span>${S.ach[a[0]] ? '✓' : v + '/' + a[4]}</span></li>`; }).join('');
  E('coreList').innerHTML = CORES.map((c, i) => {
    const own = S.owned.includes(i);
    return `<button class="btn" style="border-color:${c.c}" data-act="core" data-i="${i}" ${!own && S.bank < c.p ? 'disabled' : ''}>${c.n} ${own ? (S.core === i ? '✓ equipped' : 'equip') : '· ' + c.p}</button>`;
  }).join('');
  E('sBank').textContent = S.bank;
}
function home() { G = newG(); refreshMenu(); show('menu'); }
function startRun(daily) {
  G = newG(); G.daily = daily; G.rnd = daily ? mulberry(seedOf(dayKey())) : Math.random; G.mode = 'count'; G.cd = 3; show('play');
}
function pause() { if (G.mode !== 'play') return; G.mode = 'pause'; show('pause'); }
function resume() { G.mode = 'count'; G.cd = 2; show('play'); }

const A = {
  play() { if (S.runs === 0 && !seenTut) { seenTut = true; pend = true; go('howto'); } else startRun(false); },
  daily() { startRun(true); },
  how() { pend = false; go('howto'); },
  howok() { if (pend) { pend = false; startRun(false); } else show(back); },
  set() { go('settings'); },
  ach() { renderShop(); go('shop'); },
  back() { show(back); if (back === 'menu') refreshMenu(); },
  pausebtn: pause, resume, restart() { startRun(G.daily); }, menu: home,
  shield() { ability('shield'); }, slow() { ability('slow'); },
  tsfx() { S.sfx = !S.sfx; persist(); refreshSettings(); },
  tshake() { S.shake = !S.shake; persist(); refreshSettings(); },
  tred() { S.reduced = !S.reduced; persist(); refreshSettings(); },
  core(b) {
    const i = +b.dataset.i, c = CORES[i]; if (!c) return;
    if (!S.owned.includes(i)) { if (S.bank < c.p) return; S.bank -= c.p; S.owned.push(i); }
    S.core = i; persist(); renderShop();
  },
  clear() {
    if (!confirm('Delete all saved progress on this device?')) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    S = DEF(); refreshSettings(); refreshMenu(); toast('SAVE DATA CLEARED');
  },
  rewarded() { Ads.showRewardedContinue(); }
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled || !A[b.dataset.act]) return;
  if (b.dataset.act !== 'shield' && b.dataset.act !== 'slow') SFX.sel();
  A[b.dataset.act](b); b.blur();
});

/* ========== INPUT ========== */
function onKey(e) {
  const k = e.key, btn = e.target && e.target.tagName === 'BUTTON';
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { move(-1); e.preventDefault(); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { move(1); e.preventDefault(); }
  else if (k === ' ') { if (G.mode === 'play') { e.preventDefault(); if (!ability('shield')) ability('slow'); } }
  else if (k === 'Escape' || k === 'p' || k === 'P') { if (G.mode === 'play') pause(); else if (G.mode === 'pause' && document.body.dataset.screen === 'pause') resume(); }
  else if (k === 'Enter' && !btn) { const s = document.body.dataset.screen; if (s === 'menu') A.play(); else if (s === 'over') startRun(G.daily); }
}
document.addEventListener('keydown', onKey);
let pd = null;
cv.addEventListener('pointerdown', e => { pd = e.clientX; });
cv.addEventListener('pointerup', e => {
  if (pd === null) return; const dx = e.clientX - pd; pd = null;
  move(Math.abs(dx) > 40 ? (dx > 0 ? 1 : -1) : (e.clientX < W / 2 ? -1 : 1));
});
cv.addEventListener('pointercancel', () => { pd = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden && (G.mode === 'play' || G.mode === 'count')) { if (G.mode === 'count') G.mode = 'play'; pause(); } });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

/* ========== MAIN LOOP (single rAF loop, started once) ========== */
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  if (G.mode === 'play') update(dt);
  else if (G.mode === 'count') { G.cd -= dt; if (G.cd <= 0) G.mode = 'play'; }
  else if (G.mode === 'menu') G.scroll = (G.scroll + dt * (S.reduced ? 0.05 : 0.25)) % 1;
  if (G.mode !== 'pause') {
    G.shake = Math.max(0, G.shake - dt);
    for (const p of parts) if (p.a) { p.l -= dt; if (p.l <= 0) p.a = 0; else { p.x += p.vx * dt; p.y += p.vy * dt; } }
  }
  const c = E('count'); c.hidden = G.mode !== 'count'; if (G.mode === 'count') setT('count', Math.ceil(G.cd));
  draw();
  if (G.mode === 'play' || G.mode === 'count') hud();
}
function init() {
  resize(); Ads.init(); refreshMenu(); refreshSettings();
  show('menu'); requestAnimationFrame(frame);
}
init();
})();
