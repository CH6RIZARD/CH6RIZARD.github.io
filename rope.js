// Hugo's rope (owner 2026-11-16): when he comes back down into view with no edge under his hands (hugo3d climbDown), he comes down a
// rope out of his backpack instead of climbing on air. The rope drops in from the top edge of the view (its anchor is above the frame),
// he lowers himself hand over hand onto the ledge, tugs it free, it falls into his hand and the coil goes back into the pack (stow()).
// Loaded by backpack.js; the pack owns the item state (holding 'rope'), this file owns the line and the chain.
// The line is an SVG path under his canvas, not a mesh: his renderer only draws a box of 2.6 body heights round him, and a rope cut
// off 0.8 of a body above his head would hang from nothing.
import * as THREE from 'three';

const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const LEAD = 0.6, TUG = 0.55, REEL = 0.75;   // s: the rope falls in before he follows it; the tug; the fall into his hand

export function makeCoil(mat) {   // the rope coiled: three loops, as it lies in the pack and in his hand
  const g = new THREE.Group(), m = mat(0x9a7b56);
  for (const y of [-0.16, 0, 0.16]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.085, 5, 12), m); r.rotation.x = Math.PI / 2 + y; r.position.y = y; g.add(r); }
  return g;
}

export function bootRope({ st, armMix, handGrip, pack, hand, moving, setHolding, size, persp, canvas }) {
  const K = size / 150, calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), path = svg.appendChild(document.createElementNS(NS, 'path'));
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, width: '1px', height: '1px', overflow: 'visible', pointerEvents: 'none', zIndex: 9997, display: 'none' });   // under his canvas: his hands and body cover it
  Object.assign(path.style, { fill: 'none', stroke: '#9a7b56', strokeWidth: Math.max(1.2, 1.8 * K) + 'px', strokeLinecap: 'round', strokeLinejoin: 'round' });
  canvas.parentNode.insertBefore(svg, canvas);
  const _v = new THREE.Vector3();
  const grip = side => { handGrip(side, _v); const f = persp / (persp - _v.z); return { x: _v.x * f + innerWidth / 2 + scrollX, y: innerHeight / 2 - _v.y * f + scrollY }; };   // his palm in page px (the camera's own projection)
  // The line is a verlet chain in page px (scroll is only the camera): gravity, fixed segment lengths, a tether to the anchor so it never
  // stretches, one-way contact with the ledge tops he walks on (hugo3d __hugoFloors), friction where it lies. He is a heavy point gripped
  // on it at the length he has let out, so his weight pulls the line above him taut and the pendulum that makes is his sway (hx).
  const G = 1400, SUB = 3, ITER = 24, RAD = Math.max(1, 0.9 * K), WH = 1 / 60;   // px/s2 (hugo3d's page gravity); his inverse mass vs a segment's 1
  let R = null, P = null, dbg = null, last = 0;
  const end = () => { R = null; P = null; dbg = null; svg.style.display = 'none'; };
  function finish() { const cb = R && R.cb; end(); if (cb) cb(); }
  function build(ax, ay, fy) {   // the rope as it leaves the pack: a tight zigzag coil just under the anchor, about to fall
    const L = Math.max(size, fy - ay) + size * 1.1, n = Math.max(24, Math.min(90, Math.ceil(L / (6 * K)))), seg = L / n, x = new Float64Array(n + 1), y = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) { x[i] = ax + (i % 2 ? 1 : -1) * (0.2 + 0.3 * Math.random()) * seg * (i ? 1 : 0); y[i] = ay + i * seg * 0.1; }   // loose loops, never the same twice: it lands as a heap, not a stack
    return { n, seg, x, y, px: x.slice(), py: y.slice(), w: new Float64Array(n + 1).fill(1), on: new Int16Array(n + 1).fill(-1), hit: new Uint8Array(n + 1), ax, ay, pinned: true, rest: seg, fi: 0, h: null };
  }
  const floorsNow = () => { const f = (window.__hugoFloors ? window.__hugoFloors() : []).filter(f => f.support !== false); if (st.climb && st.climb.f && !f.includes(st.climb.f)) f.push(st.climb.f); return f; };
  function support(F, x, y0) { let best = -1, by = Infinity; for (let j = 0; j < F.length; j++) { const f = F[j]; if (x >= f.x1 && x <= f.x2 && f.y - RAD >= y0 - 1.5 && f.y < by) { by = f.y; best = j; } } return best; }   // the highest ledge top at or under where it was
  function heap(n, x, y, w, on, F, hit) {   // rope on rope: what lands on the heap lies on top of it
    const D = 2 * RAD; for (let i = 0; i <= n; i++) for (let j = i + 2; j <= n; j++) {
      const dx = x[j] - x[i], dy = y[j] - y[i]; if (dx > D || dx < -D || dy > D || dy < -D) continue; const d = Math.hypot(dx, dy) || 1e-3; if (d >= D) continue;
      const wi = w[i], wj = w[j], ws = wi + wj; if (!ws) continue; const c = (D - d) / d / ws; x[i] -= dx * c * wi; y[i] -= dy * c * wi; x[j] += dx * c * wj; y[j] += dy * c * wj; hit[i] = hit[j] = 1; }
  }
  function step(h, F, hold, steer) {   // one substep: integrate, then project lengths, tether, his grip, contact
    const { n, x, y, px, py, w, on, hit } = P, H = P.h; hit.fill(0);
    for (let i = 0; i <= n; i++) { if (!w[i]) continue; const vx = (x[i] - px[i]) * 0.998, vy = (y[i] - py[i]) * 0.998; px[i] = x[i]; py[i] = y[i]; x[i] += vx; y[i] += vy + G * h * h; on[i] = support(F, x[i], py[i]); }
    if (H && !hold) { const vx = (H.x - H.px) * (H.calm ? 0.9 : 0.999), vy = (H.y - H.py) * 0.999; H.px = H.x; H.py = H.y; H.x += vx + steer * h * h; H.y += vy + G * h * h; }
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) {   // segment lengths (the rest shrinks while he reels it in)
        const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], d = Math.hypot(dx, dy), ws = w[i] + w[i + 1]; if (d < 1e-6 || !ws) continue;
        const c = (d - P.rest) / d / ws; x[i] += dx * c * w[i]; y[i] += dy * c * w[i]; x[i + 1] -= dx * c * w[i + 1]; y[i + 1] -= dy * c * w[i + 1]; }
      if (P.pinned) for (let i = 1; i <= n; i++) { const dx = x[i] - P.ax, dy = y[i] - P.ay, d = Math.hypot(dx, dy), l = i * P.rest; if (d > l) { x[i] = P.ax + dx * l / d; y[i] = P.ay + dy * l / d; } }   // never longer than the line
      if (H) {
        if (hold) { H.x = H.px = hold.x; H.y = H.py = hold.y; }   // tug and reel: his hand holds it, the rope does not move him
        else if (P.pinned) { const l = P.fi * P.rest, dx = H.x - P.ax, dy = H.y - P.ay, d = Math.hypot(dx, dy); if (d > l) { H.x = P.ax + dx * l / d; H.y = P.ay + dy * l / d; } }   // his weight on the line he has let out
        const g = Math.min(n - 1, Math.floor(P.fi)), u = Math.min(1, P.fi - g), wh = hold ? 0 : WH, a = (1 - u) * w[g], b = u * w[g + 1], ws = wh + (1 - u) * a + u * b;
        if (ws > 0) { const kx = (H.x - (x[g] * (1 - u) + x[g + 1] * u)) / ws, ky = (H.y - (y[g] * (1 - u) + y[g + 1] * u)) / ws; H.x -= wh * kx; H.y -= wh * ky; x[g] += a * kx; y[g] += a * ky; x[g + 1] += b * kx; y[g + 1] += b * ky; }   // his grip: the point on the line at the length let out, moved by both
      }
      if (it % 3 === 2) heap(n, x, y, w, on, F, hit);
      for (let i = 0; i <= n; i++) { const j = on[i]; if (j >= 0 && y[i] > F[j].y - RAD && x[i] >= F[j].x1 && x[i] <= F[j].x2) y[i] = F[j].y - RAD; }   // on a ledge top, never through it
    }
    for (let i = 0; i <= n; i++) { const j = on[i]; if ((j >= 0 && y[i] >= F[j].y - RAD - 0.01 && x[i] >= F[j].x1 && x[i] <= F[j].x2) || (hit[i] && j >= 0 && y[i] >= F[j].y - 12 * RAD)) { px[i] += (x[i] - px[i]) * 0.6; if (py[i] < y[i]) py[i] = y[i]; } }   // friction where it lies (on the ledge or on the heap): no slide, no bounce
  }
  function tick() {
    if (!R) return;
    requestAnimationFrame(tick);
    const now = performance.now() / 1000, k = now - R.t0, C = st.climb, drawn = canvas.style.visibility !== 'hidden', dt = Math.min(1 / 30, Math.max(0, now - (last || now))); last = now;
    if (now - R.born > 40) { if (pack.holding === 'rope') pack.stow(); return finish(); }   // never a rope left hanging
    if ((R.ph === 'down' && !(C && C.rope)) || (R.ph !== 'down' && R.ph !== 'stow' && moving())) { R.ph = 'stow'; R.t0 = now; }   // the ledge went from under the climb, or he was picked up or sent off mid-tug: the coil still goes back into the pack
    if (R.ph === 'stow') {   // the coil is in his hand: into the pack, where it is seen
      svg.style.display = 'none';
      if (pack.holding !== 'rope' && !pack.busy) return finish();
      if (!drawn) { if (pack.holding === 'rope') pack.stow(); return finish(); }   // scrolled out of sight mid-stow: put away unseen, so he is free to come back (it waited here up to 40 s)
      if (drawn && !R.stowing) { R.stowing = true; pack.stow().then(() => { if (R && R.ph === 'stow') { if (pack.holding === 'rope') R.stowing = false; else finish(); } }); }
      return;
    }
    if (!P) P = build(R.ax, R.ay, C && C.f ? C.f.y : R.ay + innerHeight);
    const F = floorsNow(), hs = drawn ? [grip('L'), grip('R')].sort((a, b) => a.y - b.y) : [];
    let hold = null, steer = 0;
    if (R.ph === 'down') {   // he lets the line out through his hands: the grip is the length between the anchor and them
      const my = hs.length ? (hs[0].y + hs[1].y) / 2 : st.y - size * 0.7, fi = Math.min(P.n, (my - P.ay) / P.rest);
      if (fi > 1 && !P.h) P.h = { x: P.ax, y: P.ay + fi * P.rest, px: P.ax - (calm ? 0 : 0.8 * K * (Math.random() < 0.5 ? -1 : 1)), py: P.ay + fi * P.rest };   // he takes his weight on it: a small swing from stepping on
      if (P.h) { P.fi = Math.max(P.fi, fi);
        const u = C ? C.u || 0 : 0; P.h.calm = u > 0.8;   // feet nearly down: he steadies himself
        steer = (C ? C.x0 - P.h.x : 0) * 30 + (calm ? 0 : Math.cos(st.y / (0.16 * size)) * 160 * K * (1 - u)); }   // toward his spot (hugo3d may move it), and his hand-over-hand pumps it
    } else {
      hold = hs.length ? grip(hand()) : { x: st.x, y: st.y - size * 0.6 };
      if (!P.h) P.h = { x: hold.x, y: hold.y, px: hold.x, py: hold.y };
      if (R.ph === 'tug') { if (k >= TUG) { R.ph = 'reel'; R.t0 = now; P.pinned = false; } }   // the yank (his pose) frees the top end
      else { const e = Math.min(1, k / REEL); P.rest = P.seg * Math.max(0.02, 1 - sm(e)); if (e >= 1) { R.ph = 'stow'; R.t0 = now; svg.style.display = 'none'; return; } }   // free: it falls and he gathers it into his hand
    }
    P.w[0] = P.pinned ? 0 : 1; if (P.pinned) { P.x[0] = P.px[0] = P.ax; P.y[0] = P.py[0] = P.ay; }
    const h = dt / SUB; if (h > 0) for (let i = 0; i < SUB; i++) step(h, F, hold, steer);
    let d = `M${P.x[0].toFixed(1)} ${P.y[0].toFixed(1)}`;
    for (let i = 1; i < P.n; i++) d += `Q${P.x[i].toFixed(1)} ${P.y[i].toFixed(1)} ${((P.x[i] + P.x[i + 1]) / 2).toFixed(1)} ${((P.y[i] + P.y[i + 1]) / 2).toFixed(1)}`;
    d += `L${P.x[P.n].toFixed(1)} ${P.y[P.n].toFixed(1)}`;
    path.setAttribute('d', d); svg.style.display = '';
    dbg = { ph: R.ph, d, hands: hs, ax: P.ax, ay: P.ay, n: P.n, seg: P.seg, fi: P.fi, x: Array.from(P.x), y: Array.from(P.y), vx: Array.from(P.x, (v, i) => (v - P.px[i]) / (h || 1)), vy: Array.from(P.y, (v, i) => (v - P.py[i]) / (h || 1)), on: Array.from(P.on, j => (j >= 0 ? F[j].y : null)), H: P.h && { x: P.h.x, y: P.h.y } };
  }
  const mixv = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);
  return {
    lead: LEAD,
    get out() { return !!R && R.ph !== 'stow'; },   // the rope is the line, not the coil
    get ph() { return R ? R.ph : null; }, get dbg() { return dbg; },
    get hx() { return R && R.ph === 'down' && P && P.h ? P.h.x : null; },   // hugo3d: his x on the rope, the pendulum his weight makes of it
    // hugo3d climbDown: he is out of sight above the view, so the take is not seen; the rope falling in from the top edge is.
    start() {   // a book or the seed bag in hand goes back unseen, above the view, as the rope comes out (a coil still on its way into the pack comes out again)
      const now = performance.now() / 1000; setHolding('rope'); const had = !!R; R = { ph: 'down', t0: now, born: now, ax: st.x, ay: scrollY - 12 }; P = null; last = 0; if (!had) requestAnimationFrame(tick); return true; },   // the anchor is a page point: scrolling after this moves the camera, not the rope
    landed(cb) { if (!R) return cb && cb(); R.ph = 'tug'; R.t0 = performance.now() / 1000; R.cb = cb; },   // feet on the ledge: tug, reel, stow, then cb (his own life goes on)
    pose() {   // his arms, before the springs (called from the pack's pose hook)
      if (!R) return;
      if (R.ph === 'down') {   // hand over hand: one high on the rope, one at his chest, changing over with the height he has come down
        const a = 0.5 + 0.5 * Math.sin(st.y / (0.16 * size)), hi = [[0.0, 1, 0.3], [-0.08, 1, 0.2]], lo = [[0.02, 0.45, 0.75], [-0.1, 1, 0.25]];
        armMix('L', mixv(hi[0], lo[0], a), mixv(hi[1], lo[1], a), 1); armMix('R', mixv(hi[0], lo[0], 1 - a), mixv(hi[1], lo[1], 1 - a), 1);
      } else if (R.ph === 'tug' || R.ph === 'reel') {
        const k = performance.now() / 1000 - R.t0, y = R.ph === 'tug' ? sm((k - 0.22) / 0.12) - sm((k - 0.4) / 0.15) : 0, e = R.ph === 'reel' ? sm(k / REEL) : 0;   // y: the yank down
        armMix(hand(), mixv(mixv([0.15, 0.75, 0.55], [0.15, 0.25, 0.7], y), [0.15, -0.8, 0.4], e), mixv(mixv([0.0, 1, 0.3], [0.0, 0.7, 0.6], y), [0.1, 0.1, 1], e), 1);   // ends in the pack's own hold pose, where the coil appears
      }
    },
  };
}
