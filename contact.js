// Body contact between the page's beings (Hugo, the Void mascot, the dove). Each registers a body: a vertical capsule in page
// px (feet at y, height headH, radius r), its velocity, mass and depth lane. Every frame, bodies on the same plane that overlap
// are pushed apart (positional correction split by inverse mass, plus an impulse when they close in), so nothing walks or
// flies through anything. What happens is told to each body as an event; the body answers it with its own reflexes and its
// kernel's behaviours (no scripted scenes here):
//   bump {with, x, y, speed}    first touch with another body (speed: how hard they closed in, px/s)
//   land {with}                 (the dove) it came down onto a standing body's head: it may perch there
//   startle {with, x, y}        (a perched dove) a body went fast right past its perch
//   perched {with} / unperched  (a body) the dove sat down on its head / left it
// Lanes: depth.js lanes (-1, 0, +1, eased in between). Two bodies collide unless their lanes are half a lane or more apart.
// Classic script (window.CONTACT), loaded before the agents; node requires it for its self-test (contact.test.js).
(G => {
  const bodies = new Map(), subs = new Map(), touching = new Set(), rideOf = new Map(), startledAt = new Map();
  const stats = { frames: 0, deep: 0, maxPen: 0, events: { bump: 0, land: 0, startle: 0, perched: 0 } };
  let last = 0;
  const emit = (id, type, o) => { if (type in stats.events) stats.events[type]++; for (const f of subs.get(id) || []) try { f(type, o); } catch (e) { console.warn('contact', id, type, e); } };
  // closest points of two vertical segments [top, bottom] at xa, xb: the gap vector from a to b
  function gap(A, B) {
    const a0 = A.y - A.headH + A.r, a1 = A.y - A.r, b0 = B.y - B.headH + B.r, b1 = B.y - B.r;
    const dy = b1 < a0 ? b1 - a0 : b0 > a1 ? b0 - a1 : 0;   // overlapping spans: straight across
    return [B.x - A.x, dy];
  }
  function step(dt) {
    const L = []; for (const [id, b] of bodies) { const s = b.get(); if (s && !s.held) L.push(Object.assign(s, { id, push: b.push, headH: Math.max(s.headH || 0, 2 * s.r) })); }
    stats.frames++; let deep = 0;
    const now = new Set();
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const A = L[i], B = L[j];
      if (A.ride === B.id || B.ride === A.id || Math.abs((A.lane || 0) - (B.lane || 0)) >= 0.5) continue;   // a rider sits on its host; another plane passes
      const [gx, gy] = gap(A, B), d = Math.hypot(gx, gy), R = A.r + B.r;
      const k = A.id < B.id ? A.id + '|' + B.id : B.id + '|' + A.id;
      let nx = d > 1e-6 ? gx / d : (A.x <= B.x ? 1 : -1), ny = d > 1e-6 ? gy / d : 0;
      const side = !A.fly && !B.fly && (A.m || 1) >= 0.1 && (B.m || 1) >= 0.1;   // two walkers never stack: they are pushed apart sideways only
      if (side) { nx = A.x <= B.x ? 1 : -1; ny = 0; }
      const vn = ((B.vx || 0) - (A.vx || 0)) * nx + ((B.vy || 0) - (A.vy || 0)) * ny;   // < 0: closing in
      if (R - d > 2) deep = Math.max(deep, R - d);
      // a perched dove: a fast body right past it scares it off (it is anchored to its perch, never shoved)
      for (const [P, Q] of [[A, B], [B, A]]) if (P.perch && !P.ride && Math.hypot(Q.vx || 0, Q.vy || 0) > 70 && d < R + 30 && (startledAt.get(P.id) || -9) < stats.frames - 120) { startledAt.set(P.id, stats.frames); emit(P.id, 'startle', { with: Q.id, x: Q.x, y: Q.y }); }
      const pen = (side && d < R ? R - Math.abs(gx) : R - d) + (vn < 0 ? -vn * dt : 0);   // speculative: also the part they would close in during the next frame
      if (d < R + 1) {
        now.add(k);
        if (!touching.has(k)) {
          const x = A.x + nx * A.r, y = (A.y - A.headH / 2) + ny * A.r, sp = Math.max(0, -vn);
          // a light flyer coming down onto a standing body's head lands there; otherwise it is a bump for both
          const fl = A.fly ? A : B.fly ? B : null, host = fl === A ? B : A, up = fl === A ? ny : -ny;   // n runs A -> B; y grows down the page
          if (fl && up > 0.5 && !host.air && !host.held && host.mode !== 'climb' && (fl.vy || 0) > -40 && sp < 320) emit(fl.id, 'land', { with: host.id });
          else { emit(A.id, 'bump', { with: B.id, x, y, speed: sp }); emit(B.id, 'bump', { with: A.id, x, y, speed: sp }); }
        }
      }
      if (pen <= 0) continue;
      const ia = 1 / (A.m || 1), ib = 1 / (B.m || 1), fa = ia / (ia + ib);
      const jn = vn < 0 ? -(1 + 0.3) * vn / (ia + ib) : 0;   // restitution .3: a soft knock, not a bounce
      const tryPush = (P, s, f, inv) => (P.push ? P.push(s * nx * pen * f, s * ny * pen * f, s * nx * jn * inv, s * ny * jn * inv) : 0) || 0;
      const okA = tryPush(A, -1, fa, ia), okB = tryPush(B, 1, okA ? 1 - fa : 1, ib);
      if (!okB && okA) tryPush(A, -1, 1 - fa, 0);   // B is anchored (seated, against a wall): A takes all of it
    }
    for (const k of [...touching]) if (!now.has(k)) touching.delete(k);
    for (const k of now) touching.add(k);
    if (deep) { stats.deep++; stats.maxPen = Math.max(stats.maxPen, deep); }
    for (const s of L) { const r = s.ride || null, was = rideOf.get(s.id) || null;   // who the dove sits on, told to that body
      if (r !== was) { if (was) emit(was, 'unperched', { with: s.id }); if (r) emit(r, 'perched', { with: s.id }); rideOf.set(s.id, r); } }
  }
  const C = {
    // get(): {x, y (feet), r, headH, vx, vy, m, lane, held, air, mode, fly, perch, ride} in page px, or null while absent.
    // push(dx, dy, dvx, dvy): move it (and change its velocity); returns truthy if it moved, falsy if it is anchored.
    add(id, get, push) { bodies.set(id, { get, push }); },
    on(id, fn) { subs.set(id, [...(subs.get(id) || []), fn]); },
    get(id) { const b = bodies.get(id); return b ? b.get() : null; },
    step, stats,
  };
  G.CONTACT = C;
  if (typeof requestAnimationFrame === 'function') { const loop = now => { requestAnimationFrame(loop); const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60); last = now; step(dt); }; requestAnimationFrame(loop); }
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
