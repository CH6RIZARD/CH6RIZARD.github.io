// Hugo's dancing: a move grammar, not a clip list. Body-part primitives (legs, arms, torso) run on the beat with tempo, energy,
// side and amplitude; named moves are compositions of them, grouped by style, each with an entry and exit level so the
// planner chains them on 8-counts over one shared groove, never the same move twice running, now and then inventing a
// move by recombining parts. Pure ES module (no THREE, no DOM unless an ear is attached) so node drives the same grammar
// for the Blender render (dance_render.mjs).
//
// Pose out (absolute, the hugo3d.js conventions): j.{hips,chest,head,thighL,thighR,shinL,shinR} = Euler [x,y,z] on the rest
// pose (thigh x < 0 lifts the knee, shin x > 0 bends it); armL/armR = { u, f } upper-arm and forearm directions [out, up,
// fwd] in his body frame; drop = how far his hips sink (fraction of his height, from the leg geometry, so the planted foot
// stays on the floor); shift = sideways sway (fraction of height, + = his left); yaw = body turn (rad); look = head turn -1..1.

const TAU = Math.PI * 2, fr = x => x - Math.floor(x), cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = u => u * u * (3 - 2 * u);
const on = p => { const v = 0.5 + 0.5 * Math.cos(TAU * p); return v * v; };            // 1 on the beat, 0 on the and
const and = p => on(p + 0.5);
const hit = p => Math.exp(-p * 6) * (1 - Math.exp(-p * 40));                           // a hit: snaps just after the beat, decays
const swing = p => (p < 0.5 ? p * 1.16 : 0.58 + (p - 0.5) * 0.84);                    // the and lands a little late
const H = (c, p) => (c.soft ? on(p) : hit(p) * 1.6);                                   // hit-shaped, or rounded off for smooth variants
const opp = S => (S === 'L' ? 'R' : 'L');
// leg geometry fitted on hugo.glb's DEF chain (thigh/shin x on the rest pose -> hip-to-foot height, fractions of his height; fit error < 0.1 %):
// the rest pose already carries the thigh A0 forward and the knee K0 bent
const LT = 0.1768, LS = 0.2105, A0 = 0.16, K0 = 0.37;
const legH = (tx, sx, z = 0) => (LT * Math.cos(-tx + A0) + LS * Math.cos(-tx + A0 - K0 - sx)) * Math.cos(z), H_REST = legH(0, 0.04);
// how far the hips sink for these thigh/shin angles ([x, y, z] each): hugo3d.js feeds it the sprung joints, so the planted foot stays on the floor
export const dropOf = (tL, sL, tR, sR) => H_REST - Math.max(legH(tL[0], sL[0], tL[2]), legH(tR[0], sR[0], tR[2]));
// shortcut: the sign of a thigh's z (spread) on this rig was read off the Blender render (+z on the left thigh = outward); if a rig flips it, flip ZS.
const ZS = 1;

// ---------- primitives: each writes into the pose P from the move clock c ----------
const bend = (P, S, d) => { P.j['thigh' + S][0] -= d; P.j['shin' + S][0] += 2 * d; };   // knee and hip together: the foot stays under the hip
const lift = (P, S, h) => { P.j['thigh' + S][0] -= 1.1 * h; P.j['shin' + S][0] += 1.7 * h; };
const kick = (P, S, k) => { P.j['thigh' + S][0] -= k; P.j['shin' + S][0] += 0.15 * k; };
const out = (P, S, z) => { P.j['thigh' + S][2] += (S === 'L' ? 1 : -1) * z * ZS; };
const both = (P, d) => { bend(P, 'L', d); bend(P, 'R', d); };
const alt = c => (c.n % 2 ? c.O : c.A);           // the leg / arm whose turn it is this beat
const alt2 = c => ((c.n >> 1) % 2 ? c.O : c.A);   // every two beats

const LEGS = {
  bounce: (P, c) => both(P, c.a * (0.08 + 0.1 * c.e) * on(c.p)),
  rock: (P, c) => { both(P, c.a * 0.09 * (1 - on(c.p))); P.j.chest[0] -= 0.05 * c.a * on(c.p); },
  boogie: (P, c) => { both(P, c.a * 0.07 * on(c.p)); const S = alt2(c), k = and(c.p) * (c.n % 2 ? 0.6 : 1); kick(P, S, 0.55 * c.a * k); out(P, S, 0.2 * k); P.shift += (S === 'L' ? 1 : -1) * 0.05 * k; P.j.chest[0] += 0.12; },   // folks lean: chest over the feet
  kickout: (P, c) => { both(P, c.a * 0.06 * on(c.p)); const S = alt(c), k = and(c.p); kick(P, S, 0.75 * c.a * k); out(P, S, 0.12 * k); P.j.chest[0] -= 0.08 * k; },
  twostep: (P, c) => { const S = alt(c), ph = fr(c.b / 2); lift(P, S, 0.3 * c.a * and(c.p)); out(P, S, 0.26 * c.a * (1 - on(c.p)));   // step out, close
    P.shift += 0.08 * c.a * Math.sin(TAU * ph) * (c.A === 'L' ? 1 : -1); P.yaw += 0.15 * Math.sin(TAU * ph) * (c.A === 'L' ? 1 : -1); },
  stomp: (P, c) => { const S = alt(c); lift(P, S, 0.4 * c.a * and(c.p)); P.shift += 0.03 * (S === 'L' ? -1 : 1); both(P, 0.07 * c.a * H(c, c.p)); out(P, 'L', 0.05); out(P, 'R', 0.05); },
  march: (P, c) => { lift(P, alt(c), 0.2 * c.a * and(c.p)); both(P, 0.04 * c.a * on(c.p)); P.j.hips[2] += 0.05 * (c.n % 2 ? 1 : -1); },
  jitHeel: (P, c) => { const q = fr(c.b * 2), S = Math.floor(c.b * 2) % 2 ? c.O : c.A; P.j['shin' + S][0] += 0.9 * c.a * and(q); P.j['thigh' + S][0] += 0.12 * and(q); both(P, 0.06 * c.a * on(q)); },
  jitFlick: (P, c) => { const q = fr(c.b * 2), S = Math.floor(c.b * 2) % 2 ? c.O : c.A; kick(P, S, 0.35 * c.a * and(q)); out(P, S, 0.12 * and(q)); both(P, 0.05 * on(q)); },
  jitStomp: (P, c) => { const q = fr(c.b * 2), S = Math.floor(c.b * 2) % 2 ? c.O : c.A; lift(P, S, 0.22 * c.a * and(q)); both(P, 0.08 * c.a * on(q)); },
  skate: (P, c) => { const s = Math.sin(TAU * c.b / 2), S = s > 0 ? 'R' : 'L'; bend(P, opp(S), 0.12 + 0.05 * c.a); out(P, S, 0.32 * c.a * Math.abs(s)); P.j['thigh' + S][0] += 0.18 * Math.abs(s); P.shift += 0.1 * c.a * s; },
  toeTap: (P, c) => { bend(P, c.O, 0.06 + 0.05 * on(c.p)); kick(P, c.A, 0.25 * c.a * and(c.p)); bend(P, c.A, 0.03); },
  heelToe: (P, c) => { const S = alt2(c), hp = c.n % 2 === 0; if (hp) kick(P, S, 0.3 * c.a * (1 - and(c.p) * 0.3)); else { P.j['thigh' + S][0] += 0.15 * c.a; P.j['shin' + S][0] += 0.45 * c.a; } bend(P, opp(S), 0.07 * on(c.p)); },
  glide: (P, c) => { const s = Math.sin(TAU * c.b / 4), W = s > 0 ? 'L' : 'R'; bend(P, W, 0.15 + 0.05 * c.a); out(P, opp(W), 0.36 * c.a * Math.abs(s)); P.j['shin' + opp(W)][0] += 0.05; P.shift += 0.14 * c.a * s; P.j.hips[2] += 0.08 * s; },
  pivot: (P, c) => { both(P, 0.06 * c.a * on(c.p)); P.yaw += 0.55 * c.a * Math.sin(TAU * c.b / 4); lift(P, c.O, 0.1 * and(c.p)); },
  spin: (P, c) => { const u = cl((c.b % 4) / 2); P.yaw += (c.s > 0 ? 1 : -1) * TAU * ease(u); both(P, 0.06 + 0.04 * on(c.p)); lift(P, c.O, 0.12 * Math.sin(Math.PI * u)); },
  dip: (P, c) => { const u = fr(c.b / 4) * 4, d = u < 1 ? ease(u) : 1 - ease(cl((u - 1) / 3)); both(P, (0.1 + 0.3 * c.a) * d); out(P, 'L', 0.12 * d); out(P, 'R', 0.12 * d); },
  quan: (P, c) => { const d = 0.5 - 0.5 * Math.cos(TAU * c.b / 4); both(P, 0.1 + 0.22 * c.a * d); P.j.hips[2] += 0.08 * Math.sin(TAU * c.b / 2); P.shift += 0.02 * Math.sin(TAU * c.b / 2); },
  sway: (P, c) => { const s = Math.sin(TAU * c.b / 4), W = s > 0 ? 'L' : 'R'; bend(P, W, 0.06 + 0.05 * on(c.p)); out(P, opp(W), 0.08 * Math.abs(s)); P.shift += 0.05 * c.a * s; P.j.hips[2] += 0.05 * s; },
  wobble: (P, c) => { const s = Math.sin(TAU * c.b / 2); both(P, 0.12 + 0.04 * on(c.p)); out(P, 'L', 0.16 * c.a * s); out(P, 'R', -0.16 * c.a * s); P.j.hips[0] += 0.08 * s; },
  wobbleOne: (P, c) => { const th = TAU * c.b; bend(P, c.O, 0.09); P.j['thigh' + c.A][0] -= 0.2 + 0.1 * Math.cos(th); P.j['shin' + c.A][0] += 0.45; out(P, c.A, 0.15 * c.a * Math.sin(th)); },
  crossStep: (P, c) => { const S = alt(c); lift(P, S, 0.28 * c.a * and(c.p)); out(P, S, -0.2 * c.a * (1 - on(c.p))); P.yaw += 0.3 * (S === 'L' ? 1 : -1) * c.a; P.shift += 0.05 * (S === 'L' ? -1 : 1) * c.a; },
  backStep: (P, c) => { const S = alt(c), k = 1 - on(c.p); P.j['thigh' + S][0] += 0.25 * c.a * k; P.j['shin' + S][0] += 0.3 * c.a * k; bend(P, opp(S), 0.06 + 0.04 * on(c.p)); },
  millyStep: (P, c) => { const S = alt(c); lift(P, S, 0.26 * c.a * and(c.p)); out(P, S, 0.2 * c.a); P.shift += 0.06 * (S === 'L' ? 1 : -1) * c.a * (0.4 + 0.6 * on(c.p)); P.yaw += 0.2 * (S === 'L' ? 1 : -1) * c.a; },
  hop: (P, c) => { const air = c.n % 2 ? 0 : Math.max(0, Math.sin(TAU * c.p)) * (c.p < 0.5 ? 1 : 0); P.air += 0.05 * c.a * air; lift(P, 'L', 0.2 * air); lift(P, 'R', 0.18 * air); both(P, 0.12 * hit(fr(c.p - 0.5)) * (c.n % 2 ? 0 : 1)); },
  shuffle: (P, c) => { const q = fr(c.b * 2), S = Math.floor(c.b * 2) % 2 ? c.O : c.A; kick(P, S, 0.18 * c.a * and(q)); P.j['thigh' + opp(S)][0] += 0.08 * and(q); both(P, 0.05 * on(q)); P.shift += 0.02 * Math.sin(TAU * c.b / 4); },
};

// arms: directions [out, up, fwd]; out is mirrored per side by hugo3d, so one recipe reads the same on either arm
const U0 = [0.22, -0.9, 0.2], F0 = [0.1, -0.25, 0.9];   // a dancer's resting arms: bent, hands at the waist
const setA = (P, S, u, f) => { P['arm' + S] = { u, f }; };
const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const pocket = (P, S, c) => setA(P, S, [0.3, -0.9, -0.1], [-0.35, -0.45, 0.6 + 0.1 * on(c.p)]);   // thumb at the waistband, elbow out
const ARMS = {
  loose: (P, c) => { for (const S of ['L', 'R']) { const k = (S === c.A) === (c.n % 2 === 0) ? on(c.p) : 0; setA(P, S, [0.35 + 0.2 * k, -0.75 + 0.35 * k * c.a, 0.25 + 0.4 * k * c.a], [0.3, -0.2 + 0.6 * k, 0.85]); } },
  pump: (P, c) => { const k = H(c, c.p) * c.a; for (const S of ['L', 'R']) setA(P, S, [0.35, -0.55 + 0.25 * k, 0.55], [0.05, 0.1 + 0.6 * k, 0.75]); },
  folks: (P, c) => { const S = alt(c), k = cl(H(c, fr(c.p)) * 0.8 + on(c.p) * 0.3);   // Hit Dem Folks: one arm swings in from wide and hits across the front on the beat while the other winds back out wide
    setA(P, S, lerp3([1, 0.05, 0.1], [-0.1, -0.25, 0.95], k), lerp3([0.95, 0.25, 0.3], [-0.95, 0.05, 0.4], k));
    setA(P, opp(S), lerp3([0.2, -0.35, 0.9], [0.95, -0.05, -0.1], k), lerp3([-0.5, 0.2, 0.8], [0.85, 0.35, -0.1], k)); },
  folksWide: (P, c) => { const s = Math.sin(TAU * c.b / 2) * c.a; setA(P, 'L', [0.5 + 0.4 * s, -0.5, 0.45], [0.55 + 0.5 * s, -0.1, 0.6]); setA(P, 'R', [0.5 - 0.4 * s, -0.5, 0.45], [0.55 - 0.5 * s, -0.1, 0.6]); },
  lasso: (P, c) => { const th = TAU * c.b / 2; setA(P, c.A, [0.35 + 0.25 * Math.cos(th), 0.9, 0.3 * Math.sin(th)], [0.6 * Math.cos(th), 0.55, 0.6 * Math.sin(th)]); pocket(P, c.O, c); },
  pocket: (P, c) => { pocket(P, 'L', c); pocket(P, 'R', c); },
  shmoney: (P, c) => { const s = Math.sin(TAU * (c.b - 0.25) / 2) * 1.1 * c.a, fl = 0.25 * Math.sin(TAU * c.b * 2);   // both arms swing together side to side across the body, hands loose and flicking
    setA(P, 'L', [0.35 + 0.55 * s, -0.45, 0.6], [0.2 + 0.9 * s, 0.05 + fl, 0.7]); setA(P, 'R', [0.35 - 0.55 * s, -0.45, 0.6], [0.2 - 0.9 * s, 0.05 - fl, 0.7]); P.j.chest[1] += 0.2 * s; },
  milly: (P, c) => { const th = TAU * c.b, S = alt2(c), w = Math.sin(Math.PI * fr(c.b / 2));   // forearms rolling round each other, then one arm sweeps out in a wide arc, side to side every two beats
    setA(P, 'L', [0.3, -0.4, 0.8], [-0.4 + 0.5 * Math.cos(th), 0.15 + 0.5 * Math.sin(th), 0.8]); setA(P, 'R', [0.3, -0.4, 0.8], [-0.4 - 0.5 * Math.cos(th), 0.15 - 0.5 * Math.sin(th), 0.8]);
    setA(P, S, lerp3(P['arm' + S].u, [1, 0.25, 0.15], w * c.a), lerp3(P['arm' + S].f, [0.9, 0.55, -0.1], w * c.a)); P.j.chest[1] += 0.18 * w * (S === 'L' ? 1 : -1); },
  naenae: (P, c) => { setA(P, c.A, [0.35, 0.92, 0.12], [0.15 + 0.4 * Math.sin(TAU * c.b / 2) * c.a, 1, 0.1]); setA(P, c.O, [0.3, -0.7, 0.4], [-0.25, -0.2, 0.9]); },
  surf: (P, c) => { const s = Math.sin(TAU * c.b / 4); setA(P, 'L', [1, 0.05 + 0.25 * s, 0.1], [1, 0.1 + 0.45 * s, 0.1]); setA(P, 'R', [1, 0.05 - 0.25 * s, 0.1], [1, 0.1 - 0.45 * s, 0.1]); },
  quanArms: (P, c) => { const s = Math.sin(TAU * c.b / 4); setA(P, 'L', [0.6, 0.5, 0.45], [-0.25 + 0.25 * s, 0.9, 0.4]); setA(P, 'R', [0.6, 0.5, 0.45], [-0.25 - 0.25 * s, 0.9, 0.4]); },
  stir: (P, c) => { const th = TAU * c.b / 2; setA(P, 'L', [0.25, -0.6, 0.65], [-0.3 + 0.35 * Math.cos(th), -0.35, 0.85 + 0.3 * Math.sin(th)]); setA(P, 'R', [0.25, -0.6, 0.65], [-0.3 - 0.35 * Math.cos(th), -0.35, 0.85 - 0.3 * Math.sin(th)]); },
  dab: (P, c) => { const k = c.n % 2 === 0 ? cl(H(c, c.p) * 1.4) : cl(1 - c.p * 1.6) * 0.6;
    setA(P, c.A, lerp3(U0, [0.85, 0.55, 0.1], k), lerp3(F0, [0.85, 0.6, 0.1], k)); setA(P, c.O, lerp3(U0, [0.15, 0.35, 0.92], k), lerp3(F0, [-0.9, 0.35, 0.2], k)); P.j.head[0] += 0.3 * k; P.look += (c.A === 'L' ? -0.5 : 0.5) * k; },
  whip: (P, c) => { const w = (c.n % 4 === 3) ? Math.sin(Math.PI * c.p) : 0, s = 0.25 * Math.sin(TAU * c.b);
    setA(P, c.A, lerp3([0.2, -0.15, 0.95], [0.9, 0.1, 0.3], w), lerp3([-0.25 + s, 0.15, 0.9], [0.95, 0.2, 0.2], w)); setA(P, c.O, [0.25, -0.5, 0.75], [-0.35 - s, 0.1, 0.9]); },
  flick: (P, c) => { const fl = 0.35 * Math.max(0, Math.sin(TAU * c.b * 2)) * c.a; setA(P, c.A, [0.3, -0.45, 0.8], [0.25, 0.05 + fl, 0.95]); setA(P, c.O, [0.25, -0.6, 0.6], [-0.35, 0.15, 0.9]); },
  point: (P, c) => { const S = alt2(c), k = on(c.p) * c.a; setA(P, S, lerp3(U0, [0.3, 0.3, 0.92], k), lerp3(F0, [0.3, 0.38, 0.9], k)); setA(P, opp(S), U0, F0); },
  clap: (P, c) => { const k = c.n % 2 ? on(c.p) : on(c.p) * 0.25; for (const S of ['L', 'R']) setA(P, S, [0.28, -0.4, 0.85], [0.4 - 1.1 * k, 0.15, 0.75]); },
  wing: (P, c) => { const k = and(c.p) * c.a; for (const S of ['L', 'R']) setA(P, S, [0.85, -0.4 + 0.45 * k, -0.05], [-0.5, 0.1 + 0.2 * k, 0.6]); },
  jab: (P, c) => { const q = fr(c.b * 2), S = Math.floor(c.b * 2) % 2 ? c.O : c.A, k = cl(H(c, q) * 1.3);
    setA(P, S, lerp3([0.3, -0.45, 0.6], [0.12, 0.05, 1], k), lerp3([-0.3, 0.6, 0.5], [0.05, 0.05, 1], k)); setA(P, opp(S), [0.3, -0.45, 0.6], [-0.3, 0.6, 0.5]); },
  chestArms: (P, c) => { const k = cl(H(c, c.p) * c.a); for (const S of ['L', 'R']) setA(P, S, lerp3([0.75, -0.25, 0.45], [0.95, 0.05, 0.15], k), lerp3([0.25, 0.6, 0.6], [0.95, 0.15, 0.15], k)); },
  armSwing: (P, c) => { const S = alt2(c), u = fr(c.b / 2), k = ease(cl(u * 1.6)); setA(P, S, lerp3([0.25, -0.8, -0.5], [0.3, 0.9, 0.35], k), lerp3([0.2, -0.7, -0.4], [0.3, 0.95, 0.4], k)); setA(P, opp(S), [0.45, -0.6, 0.45], [-0.1, 0.4, 0.8]); },
  hitArms: (P, c) => { const k = cl(H(c, c.p) * 1.5), A1 = [[0.3, -0.6, 0.6], [-0.5, 0.2, 0.7]], A2 = [[0.75, -0.5, 0.2], [0.6, -0.1, 0.6]], [x, y] = c.n % 2 ? [A1, A2] : [A2, A1];
    for (const S of ['L', 'R']) setA(P, S, lerp3(x[0], y[0], k), lerp3(x[1], y[1], k)); },
  reach: (P, c) => { const k = c.n % 4 === 0 ? cl(H(c, c.p) * 1.4) : c.n % 4 === 1 ? 1 - ease(c.p) : 0; for (const S of ['L', 'R']) setA(P, S, lerp3(U0, [0.3, 0.92, 0.3], k), lerp3(F0, [0.2, 1, 0.3], k)); },
  shoot: (P, c) => { const S = alt2(c), k = (c.n % 2 === 0 ? cl(H(c, c.p) * 1.4) : 1 - ease(c.p)) * c.a; setA(P, S, lerp3(U0, [0.15, 0.3, 0.95], k), lerp3(F0, [0.1, 0.45, 0.92], k)); setA(P, opp(S), lerp3(U0, [0.3, -0.8, -0.45], k), lerp3(F0, [0.2, -0.75, -0.35], k)); },
  leanArms: (P, c) => { setA(P, c.A, [0.65, -0.45, 0.25 + 0.1 * on(c.p)], [0.65, -0.15, 0.45]); pocket(P, c.O, c); },
};

const TORSO = {
  groove: (P, c) => { P.j.chest[0] += 0.08 * c.a * on(c.p); P.j.head[0] += 0.07 * on(c.p); },
  pop: (P, c) => { const k = H(c, c.p); P.j.chest[0] += 0.12 * c.a * k - 0.03; P.j.head[0] += 0.08 * k; },
  twist: (P, c) => { const s = Math.sin(TAU * c.b / 2) * c.a; P.j.chest[1] += 0.25 * s; P.j.hips[1] -= 0.1 * s; P.j.head[0] += 0.05 * on(c.p); },
  lean: (P, c) => { const s = Math.sin(TAU * c.b / 4) * c.a; P.j.chest[2] += 0.16 * s; P.j.head[2] -= 0.08 * s; P.j.head[0] += 0.05 * on(c.p); },
  shoulder: (P, c) => { const k = (c.n % 2 ? 1 : -1) * H(c, c.p) * c.a; P.j.chest[2] += 0.12 * k; P.j.chest[1] += 0.08 * k; P.j.head[0] += 0.05 * on(c.p); },
  roll: (P, c) => { const th = TAU * c.b / 2; P.j.chest[0] += 0.14 * c.a * Math.sin(th); P.j.hips[0] += 0.1 * c.a * Math.sin(th - 1.2); P.j.head[0] -= 0.08 * Math.sin(th + 0.8); },
  hunch: (P, c) => { const k = H(c, c.p); P.j.chest[0] += 0.22 + 0.1 * k * c.a; P.j.head[0] += 0.05 - 0.12 * k; },
  leanBack: (P, c) => { P.j.chest[0] -= 0.12 + 0.05 * on(c.p) * c.a; P.j.chest[2] += 0.08 * Math.sin(TAU * c.b / 4); P.j.head[0] += 0.04 * on(c.p); },
};

// ---------- the vocabulary: [name, style, legs, arms, torso, energy, level(0 up, 1 mid, 2 low), beats] ----------
export const STYLES = { dallas: 0.65, atl: 0.55, memphis: 0.5, twostep: 0.35, jit: 0.8, krump: 0.85 };   // each style's home energy
const BASE = [
  // Dallas / South 2015: boogie, folks
  ['Hit Dem Folks', 'dallas', 'boogie', 'folks', 'pop', 0.7, 1, 8], ['Folks Bounce', 'dallas', 'bounce', 'folks', 'groove', 0.6, 1, 4],
  ['Double Folks', 'dallas', 'jitHeel', 'folks', 'pop', 0.85, 1, 4], ['Dallas Boogie', 'dallas', 'boogie', 'loose', 'twist', 0.6, 1, 8],
  ['Boogie Kickout', 'dallas', 'kickout', 'pump', 'groove', 0.7, 1, 4], ['Folks Swing', 'dallas', 'twostep', 'folksWide', 'twist', 0.55, 1, 8],
  ['Lasso', 'dallas', 'bounce', 'lasso', 'lean', 0.6, 1, 4], ['Boogie Stomp', 'dallas', 'stomp', 'folks', 'hunch', 0.8, 1, 4],
  ['Southside Rock', 'dallas', 'rock', 'pocket', 'shoulder', 0.45, 0, 4], ['Cowboy Boogie', 'dallas', 'boogie', 'lasso', 'groove', 0.65, 1, 8],
  ['Folks Dip', 'dallas', 'dip', 'folks', 'pop', 0.6, 2, 4], ['Shoulder Boogie', 'dallas', 'bounce', 'pocket', 'shoulder', 0.5, 1, 4],
  ['Boogie Cross', 'dallas', 'crossStep', 'loose', 'twist', 0.55, 1, 4], ['Stanky Leg', 'dallas', 'wobbleOne', 'loose', 'roll', 0.5, 1, 4],
  // Atlanta bop / swag
  ['Shmoney', 'atl', 'millyStep', 'shmoney', 'twist', 0.6, 1, 4], ['Milly Rock', 'atl', 'millyStep', 'milly', 'lean', 0.55, 0, 4],
  ['Nae Nae', 'atl', 'rock', 'naenae', 'leanBack', 0.5, 0, 8], ['Hit the Quan', 'atl', 'quan', 'quanArms', 'roll', 0.45, 2, 8],
  ['Swag Surf', 'atl', 'sway', 'surf', 'lean', 0.4, 0, 8], ['Stir the Pot', 'atl', 'bounce', 'stir', 'roll', 0.55, 1, 4],
  ['Bop', 'atl', 'bounce', 'pump', 'groove', 0.6, 1, 4], ['Dab', 'atl', 'rock', 'dab', 'pop', 0.6, 0, 4],
  ['Whip', 'atl', 'twostep', 'whip', 'lean', 0.55, 1, 4], ['Bankroll Flick', 'atl', 'bounce', 'flick', 'shoulder', 0.5, 0, 4],
  ['Wobble', 'atl', 'wobble', 'loose', 'roll', 0.5, 1, 8], ['Bando', 'atl', 'stomp', 'wing', 'hunch', 0.75, 1, 4],
  ['Lean Wit It', 'atl', 'rock', 'leanArms', 'leanBack', 0.4, 0, 8], ['Swag Step', 'atl', 'twostep', 'pocket', 'twist', 0.45, 0, 4],
  ['Clap Bop', 'atl', 'bounce', 'clap', 'groove', 0.55, 1, 4],
  // Memphis jookin, glide, buck
  ['Gangsta Glide', 'memphis', 'glide', 'loose', 'lean', 0.45, 1, 8], ['Jook Slide', 'memphis', 'glide', 'pocket', 'twist', 0.5, 1, 8],
  ['Heel Toe Jook', 'memphis', 'heelToe', 'loose', 'groove', 0.55, 1, 4], ['Memphis Bounce', 'memphis', 'bounce', 'wing', 'groove', 0.6, 1, 4],
  ['Shoot', 'memphis', 'kickout', 'shoot', 'pop', 0.75, 1, 4], ['Toe Pivot', 'memphis', 'pivot', 'reach', 'lean', 0.6, 0, 8],
  ['Buck', 'memphis', 'stomp', 'jab', 'hunch', 0.85, 1, 4], ['Gangsta Walk', 'memphis', 'march', 'pocket', 'hunch', 0.55, 1, 8],
  ['Tear Da Club Up', 'memphis', 'stomp', 'armSwing', 'hunch', 0.9, 1, 4], ['Jook Spin', 'memphis', 'spin', 'reach', 'twist', 0.75, 0, 4],
  // two-step
  ['Two Step', 'twostep', 'twostep', 'loose', 'groove', 0.35, 0, 8], ['Wide Two Step', 'twostep', 'twostep', 'pump', 'twist', 0.5, 1, 8],
  ['Back Step', 'twostep', 'backStep', 'loose', 'groove', 0.4, 0, 4], ['Shoulder Two Step', 'twostep', 'twostep', 'pocket', 'shoulder', 0.35, 0, 8],
  ['Clap Two Step', 'twostep', 'twostep', 'clap', 'groove', 0.45, 0, 4], ['Rock Step', 'twostep', 'rock', 'loose', 'lean', 0.3, 0, 4],
  ['Side Bop', 'twostep', 'sway', 'point', 'shoulder', 0.4, 0, 4], ['Cross Two Step', 'twostep', 'crossStep', 'clap', 'twist', 0.45, 0, 4],
  // jit / footwork
  ['Jit Heel', 'jit', 'jitHeel', 'loose', 'groove', 0.8, 1, 4], ['Jit Flick', 'jit', 'jitFlick', 'wing', 'pop', 0.85, 1, 4],
  ['Footwork Skate', 'jit', 'skate', 'pump', 'lean', 0.7, 1, 8], ['Toe Taps', 'jit', 'toeTap', 'pocket', 'groove', 0.6, 1, 4],
  ['Jit Kicks', 'jit', 'kickout', 'jab', 'pop', 0.85, 1, 4], ['Footwork Stomp', 'jit', 'jitStomp', 'wing', 'hunch', 0.9, 1, 4],
  ['Ghost Shuffle', 'jit', 'shuffle', 'loose', 'twist', 0.7, 1, 8],
  // krump-lite hits
  ['Chest Pop', 'krump', 'bounce', 'chestArms', 'pop', 0.8, 1, 4], ['Arm Swing', 'krump', 'stomp', 'armSwing', 'hunch', 0.9, 1, 4],
  ['Jab Hit', 'krump', 'rock', 'jab', 'pop', 0.85, 1, 4], ['Stomp Hit', 'krump', 'stomp', 'hitArms', 'hunch', 0.9, 1, 4],
  ['Buck Hop', 'krump', 'hop', 'reach', 'pop', 0.95, 0, 4], ['Kill Off', 'krump', 'dip', 'armSwing', 'hunch', 0.85, 2, 4],
];
// modifiers turn one figure into its variants: mirrored, lower, double-time arms, half-time, bigger, rounded off, travelling, bounce up
const MODS = {
  switch: m => ({ s: -1 }), low: m => ({ lvl: Math.min(2, m.lvl + 1) }), double: m => ({ ka: 2 }), half: m => ({ k: 0.5, e: m.e - 0.2 }),
  hype: m => ({ amp: 1.35, e: m.e + 0.15 }), smooth: m => ({ soft: 1, e: m.e - 0.1 }), travel: m => ({ travel: 1 }), 'up-bounce': m => ({ up: 1 }),
};
const SLOW_ARMS = new Set(['surf', 'quanArms', 'lasso', 'naenae', 'leanArms', 'pocket']);
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const mk = (b, mod) => { const [name, style, legs, arms, torso, e, lvl, len] = b, m = { name, style, legs, arms, torso, e, lvl, len, s: 1, amp: 1, k: 1, ka: 1, base: name };
  if (mod) { Object.assign(m, MODS[mod](m)); m.name = `${name} (${mod})`; m.mod = mod; }
  m.e = cl(m.e, 0.1, 1); return m; };
export const MOVES = [];
for (const b of BASE) {
  MOVES.push(mk(b));
  const keys = Object.keys(MODS).filter(k => !(k === 'double' && SLOW_ARMS.has(b[3])) && !(k === 'low' && b[6] === 2)), h = hash(b[0]);
  for (let i = 0, picked = new Set(); picked.size < 3; i++) { const k = keys[(h >>> (i * 3) ^ i * 7) % keys.length]; if (!picked.has(k)) { picked.add(k); MOVES.push(mk(b, k)); } if (i > 40) break; }
}

// ---------- one pose of one move ----------
const LOWBEND = [0.23, 0.3, 0.38];   // a dancer never stands on locked knees
function neutral() {
  return { j: { hips: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], shinL: [0.04, 0, 0], shinR: [0.04, 0, 0] },
    armL: { u: U0.slice(), f: F0.slice() }, armR: { u: U0.slice(), f: F0.slice() }, drop: 0, shift: 0, yaw: 0, look: 0, air: 0 };
}
function poseOf(m, beats, s0, E) {   // the second half of each 8-count answers the first from the other side (blended across the seam)
  const b8 = fr(beats * m.k / 8) * 8, w = ease(cl((b8 - 3.8) / 0.4)) * (1 - ease(cl((b8 - 7.8) / 0.4)));
  if (w <= 0) return pose1(m, beats, s0, E); if (w >= 1) return pose1(m, beats, -s0, E);
  return blend(pose1(m, beats, s0, E), pose1(m, beats, -s0, E), w);
}
const LEAN = { dallas: 0.12, krump: 0.16, memphis: 0.1, jit: 0.08, atl: 0.04, twostep: 0.03 };
function pose1(m, beats, s0, E) {
  const P = neutral(), s = s0 * m.s, A = s > 0 ? 'L' : 'R', a = m.amp * (0.7 + 0.5 * E), mk = k => { const b = beats * m.k * k; return { b, n: Math.floor(b), p: swing(fr(b)), s, A, O: opp(A), a, e: E, soft: m.soft }; };
  const c = mk(1), ca = mk(m.ka), lean = LEAN[m.style] ?? 0.06;
  both(P, LOWBEND[m.lvl]);
  // the shared groove under every move: knees pump on every beat (down, or up for up-bounce), the weight rolls foot to foot,
  // the chest pops and the shoulders roll, the head bobs, the body leans into the style
  if (m.legs !== 'glide' && m.legs !== 'quan') {
    both(P, (m.up ? 1 - on(c.p) : on(c.p)) * (0.09 + 0.05 * E) * c.a);
    const W = c.n % 2 ? 'R' : 'L', ws = Math.sin(TAU * c.b / 2); bend(P, W, 0.05 * on(c.p)); P.shift += 0.025 * ws * c.a; P.j.hips[2] += 0.05 * ws;
  }
  LEGS[m.legs](P, c); ARMS[m.arms](P, ca); TORSO[m.torso](P, c);
  const roll = TAU * c.b / 2;
  P.j.chest[0] += lean + 0.07 * c.a * (c.soft ? on(c.p) : hit(c.p) * 1.5);
  P.j.chest[1] += 0.06 * Math.sin(roll) * c.a; P.j.chest[2] += 0.07 * Math.cos(roll) * c.a;
  P.j.hips[0] -= 0.06 * on(c.p) * c.a;   // the hips pop back as he drops
  P.j.head[0] += 0.1 * on(c.p) * c.a - 0.4 * lean;   // the head bobs and stays level while the chest leans
  for (const S of ['armL', 'armR']) for (const k of ['u', 'f']) P[S][k] = P[S][k].map((v, i) => (i === 1 ? v : v * 1.15));   // arms carried wider and further out
  P.look += 0.3 * Math.sin(TAU * beats / 16);
  if (m.travel) P.shift += 0.1 * Math.sin(TAU * beats / 8);
  P.j.hips[2] += -P.shift * 0.8;   // the pelvis tips over the foot the weight moves onto
  // the hips sink exactly as far as the planted leg's bend takes them (the lower foot stays on the floor)
  const h = S => legH(P.j['thigh' + S][0], P.j['shin' + S][0], P.j['thigh' + S][2]);
  P.drop = H_REST - Math.max(h('L'), h('R')) - P.air;
  return P;
}
function blend(A, B, k) {
  const P = neutral();
  for (const n in P.j) P.j[n] = lerp3(A.j[n], B.j[n], k);
  for (const S of ['armL', 'armR']) P[S] = { u: lerp3(A[S].u, B[S].u, k), f: lerp3(A[S].f, B[S].f, k) };
  for (const n of ['drop', 'shift', 'yaw', 'look']) P[n] = A[n] + (B[n] - A[n]) * k;
  return P;
}
const finite = P => Object.values(P.j).every(v => v.every(Number.isFinite)) && ['armL', 'armR'].every(S => [...P[S].u, ...P[S].f].every(Number.isFinite)) && [P.drop, P.shift, P.yaw, P.look].every(Number.isFinite);

// ---------- the ear: page music through a WebAudio analyser, else his own count ----------
const ear = { an: null, buf: null, prev: 0, hist: [], last: -1, onsets: [] };
export function listen(analyser) { ear.an = analyser; ear.buf = new Uint8Array(analyser.frequencyBinCount); ear.hist = []; ear.onsets = []; }
function hear(now, beatsNow, bpm) {   // spectral flux on the bass bins; onsets pull the beat's phase and tempo toward the music
  if (!ear.an) return null;
  ear.an.getByteFrequencyData(ear.buf);
  let low = 0; const nb = Math.max(4, Math.round(ear.buf.length * 0.012)); for (let i = 1; i <= nb; i++) low += ear.buf[i];
  const flux = Math.max(0, low - ear.prev); ear.prev = low; ear.hist.push(flux); if (ear.hist.length > 60) ear.hist.shift();
  const mean = ear.hist.reduce((x, y) => x + y, 0) / ear.hist.length, sd = Math.sqrt(ear.hist.reduce((x, y) => x + (y - mean) ** 2, 0) / ear.hist.length);
  if (low < nb * 20 || flux < mean + 1.4 * sd || now - ear.last < 0.28) return null;
  ear.last = now; ear.onsets.push(now); while (ear.onsets.length && now - ear.onsets[0] > 6) ear.onsets.shift();
  // tempo: the period that best explains every gap between recent onsets (comb score), leaning a little toward 85-110
  let best = 0, bestS = 0;
  if (ear.onsets.length >= 5) for (let bpm = 70; bpm <= 150; bpm += 0.5) { const T = 60 / bpm; let sc = 0;
    for (let i = 0; i < ear.onsets.length; i++) for (let j = i + 1; j < ear.onsets.length; j++) { const r = (ear.onsets[j] - ear.onsets[i]) / T, d = r - Math.round(r); if (r > 0.75) sc += Math.exp(-d * d / 0.004); }
    sc *= 1 - 0.15 * Math.min(1, Math.abs(bpm - 97) / 40); if (sc > bestS) { bestS = sc; best = bpm; } }
  const err = Math.round(beatsNow) - beatsNow;
  return { bpm: best, err: Math.abs(err) < 0.2 ? err : 0 };   // only an onset near a beat moves the phase (an and or a ghost note never drags it)
}
// Attach to whatever plays on the page (same-origin audio or video with sound). The media is routed through the analyser and
// on to the speakers, only once the context runs, so the music never goes silent.
export function attachPage(win = globalThis.window) {
  if (!win || !win.AudioContext || win.__danceEar) return; win.__danceEar = 1;
  let ctx = null; const seen = new WeakSet();
  const grab = async el => {
    if (seen.has(el) || el.muted || !(el.tagName === 'AUDIO' || el.tagName === 'VIDEO')) return;
    try { const src = new URL(el.currentSrc || el.src, win.location.href); if (src.origin !== win.location.origin && !el.crossOrigin) return; } catch { return; }
    seen.add(el);
    try { ctx = ctx || new win.AudioContext(); await ctx.resume(); if (ctx.state !== 'running') return;
      const s = ctx.createMediaElementSource(el), an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.2; s.connect(an); an.connect(ctx.destination); listen(an);
    } catch { /* no ear: he keeps his own count */ }
  };
  win.document.addEventListener('play', e => grab(e.target), true);
  for (const el of win.document.querySelectorAll('audio,video')) if (!el.paused) grab(el);
}

// ---------- the dancer: clock, planner, transitions ----------
export function createDancer(opts = {}) {
  let seed = opts.seed >>> 0;
  const rnd = opts.seed == null ? Math.random : () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const D = { listen,   // a page with its own audio graph hands its analyser here
    bpm: 95, beats: 0, lastT: null, E: 0.5, style: 'dallas', cur: null, prev: null, recent: [], log: [], invented: 0, heard: false };
  const pickW = list => { const tot = list.reduce((s, x) => s + x[1], 0); let r = rnd() * tot; for (const [v, w] of list) if ((r -= w) <= 0) return v; return list[list.length - 1][0]; };
  const styleFor = E => pickW(Object.entries(STYLES).map(([k, e]) => [k, Math.exp(-((e - E) ** 2) / 0.04)]));
  function invent(E) {   // a move nobody has seen: legs of one figure, arms of another, torso of a third
    const pk = () => MOVES[(rnd() * MOVES.length) | 0], a = pk(), b = pk(), c = pk();
    D.invented++;
    const mods = Object.keys(MODS), mod = mods[(rnd() * mods.length) | 0], m = { ...a, arms: b.arms, torso: c.torso, base: `invent:${a.legs}/${b.arms}/${c.torso}`, invented: true };
    Object.assign(m, MODS[mod](m)); m.ka = SLOW_ARMS.has(m.arms) ? 1 : m.ka; m.e = cl((a.e + b.e) / 2, 0.1, 1); m.len = rnd() < 0.5 ? 4 : 8;
    m.name = `Hugo original #${D.invented} (${a.legs} legs, ${b.arms} arms, ${c.torso})`; void E; return m;
  }
  function next(start) {
    const p = D.cur, lvl = p ? p.lvl : 0;
    if (rnd() < 0.2) D.style = rnd() < 0.5 ? styleFor(D.E) : Object.keys(STYLES)[(rnd() * 6) | 0];   // the style drifts every so often
    let m;
    if (p && rnd() < 0.1) m = invent(D.E);
    else {
      const cand = MOVES.filter(x => (!p || x.base !== p.base) && !D.recent.includes(x.name) && Math.abs(x.lvl - lvl) <= 1)
        .map(x => [x, (x.style === D.style ? 1 : 0.12) * Math.exp(-((x.e - D.E) ** 2) / 0.05) * (x.lvl === lvl ? 1 : 0.5) + 1e-6]);
      m = pickW(cand);
    }
    D.prev = p ? { m: p, start: p.start, side: p.side } : null;
    D.cur = { ...m, start, side: rnd() < 0.5 ? 1 : -1, len: m.len === 8 && rnd() < 0.4 ? 8 : 4 };   // a figure mostly takes one 4-count; an 8-count one sometimes plays its whole phrase
    D.recent.push(m.name); if (D.recent.length > 12) D.recent.shift();
    D.log.push({ name: m.name, base: m.base, style: m.style, invented: !!m.invented, beat: start, bpm: Math.round(D.bpm), E: +D.E.toFixed(2) }); if (D.log.length > 400) D.log.shift();
  }
  D.pose = (t, ctx = {}) => {
    let dt = D.lastT == null ? 1 : t - D.lastT; D.lastT = t;
    const target = cl(0.25 + 0.6 * (ctx.energy ?? 0.6) + ({ playful: 0.2, curious: 0.05, content: 0, lonely: -0.1, tired: -0.25, sleepy: -0.25, wary: -0.15, shaken: -0.2, hungry: -0.1 }[ctx.mood] || 0), 0.15, 1);
    if (dt > 0.6 || dt < 0) {   // a fresh dance: his own tempo, a style that fits how he feels
      D.bpm = 85 + rnd() * 20; D.beats = 0; D.E = target; D.style = styleFor(D.E); D.cur = null; D.prev = null; next(0); dt = 0;
    }
    const h = hear(t, D.beats, D.bpm);
    if (h) { D.heard = true; D.beats += h.err * 0.3; if (h.bpm) D.bpm += (h.bpm - D.bpm) * 0.3; }
    D.beats += dt * D.bpm / 60;
    while (D.beats >= D.cur.start + D.cur.len) {   // phrase boundary: energy drifts toward his mood and builds a little as he gets into it
      D.E = cl(D.E + (target - D.E) * 0.15 + 0.03 + (rnd() - 0.5) * 0.12, 0.15, 1);
      next(D.cur.start + D.cur.len);
    }
    const b = D.beats - D.cur.start;
    let P = poseOf(D.cur, b, D.cur.side, D.E);
    if (D.prev && b < 0.5) P = blend(poseOf(D.prev.m, D.beats - D.prev.start, D.prev.side, D.E), P, ease(b / 0.5));   // the old move flows into the new over half a beat
    if (!finite(P)) { D.nan = (D.nan || 0) + 1; P = neutral(); }
    P.move = D.cur.name; P.style = D.cur.style; P.beat = D.beats; P.bpm = D.bpm;
    return P;
  };
  return D;
}

// self-check (node dance.js): the vocabulary size, every move poses finite, the planner never repeats and keeps time
if (typeof process !== 'undefined' && process.argv && /dance\.js$/.test(process.argv[1] || '')) {
  const by = {}; for (const m of MOVES) by[m.style] = (by[m.style] || 0) + 1;
  console.log('moves', MOVES.length, by);
  for (const m of MOVES) for (let b = 0; b < m.len; b += 0.07) { const P = poseOf(m, b, 1, 0.7); if (!finite(P)) throw new Error('NaN in ' + m.name); }
  const d = createDancer({ seed: 7 }); for (let t = 0; t < 60; t += 1 / 60) d.pose(t, { energy: 0.7, mood: 'playful' });
  for (let i = 1; i < d.log.length; i++) if (d.log[i].base === d.log[i - 1].base) throw new Error('repeat ' + d.log[i].name);
  console.log('60 s:', d.log.length, 'moves,', new Set(d.log.map(x => x.name)).size, 'distinct,', d.invented, 'invented, nan', d.nan || 0);
  if (MOVES.length < 200) throw new Error('vocabulary under 200');
}
