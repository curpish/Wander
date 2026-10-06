'use strict'
// drift: a tiny procedural music engine. Atmospheric downtempo / microhouse:
// felt piano, string pad, soft percussion, air. Everything is synthesized
// here, sample by sample, and streamed to ffplay as a never-ending WAV.
//
//   node drift.cjs [--mood dusk] [--energy 2] [--tempo 108] [--volume 0.6]
//                  [--seed 1] [--mute kick,air]
//   node drift.cjs --render 60 out.wav [--sweep]     (offline, no playback)
//   add --wander 1 to let it move between energies, and rarely moods
//
// While playing it prints one JSON line per bar and per step on stdout, and
// re-reads a small control file (its path is the first line printed) so a
// front end can change settings without restarting the stream.

const fs = require('fs')
const os = require('os')
const path = require('path')
const cp = require('child_process')

const SR = 44100
const BLOCK = 256
const TAU = Math.PI * 2
const TRACKS = ['kick', 'bass', 'hats', 'perc', 'piano', 'strings', 'air']
const ENERGY_NAMES = ['still', 'breathe', 'pulse', 'flow', 'bloom']
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

// root is a MIDI note; avoid is the scale degree whose chord is diminished.
// All four are modes of one scale, so a change of mood shares every note.
const MOODS = {
  dusk: { root: 50, scale: [0, 2, 3, 5, 7, 9, 10], avoid: 5, swing: 0.12, bright: 0.8, bpm: 108 },
  fog: { root: 53, scale: [0, 2, 4, 6, 7, 9, 11], avoid: 3, swing: 0.08, bright: 0.65, bpm: 96 },
  ember: { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], avoid: 1, swing: 0.14, bright: 0.75, bpm: 114 },
  glass: { root: 43, scale: [0, 2, 4, 5, 7, 9, 10], avoid: 2, swing: 0.1, bright: 1, bpm: 120 },
}

// ---------------------------------------------------------------- controls

const perTrack = v => Object.fromEntries(TRACKS.map(t => [t, v]))
const ctl = {
  volume: 0.6,
  tempo: 108,
  energy: 2,
  mood: 'dusk',
  seed: 1,
  mute: [],
  levels: perTrack(1), // each track's own fader, 0 to 1.5
  seeds: perTrack(0), // each track's own reroll, on top of the seed
  color: 0.5, // the air: 0 a low rumble, 1 a bright hiss
  bow: 0.7, // the strings: 0 the synth pad, 1 bowed strings, between a blend
  wander: false, // let the music move between energies, and rarely moods
  rev: 0, // bumped when a person sets energy, mood or tempo by hand
  quit: false,
}
let renderSecs = 0
let renderOut = ''
let isSweep = false

function applyControl(o) {
  if (typeof o.volume === 'number') ctl.volume = clamp(o.volume, 0, 1)
  if (typeof o.tempo === 'number') ctl.tempo = clamp(o.tempo, 70, 132)
  if (typeof o.energy === 'number') ctl.energy = clamp(Math.round(o.energy), 0, 4)
  if (typeof o.mood === 'string' && MOODS[o.mood]) ctl.mood = o.mood
  if (typeof o.seed === 'number') ctl.seed = o.seed >>> 0
  if (Array.isArray(o.mute)) ctl.mute = o.mute.filter(t => TRACKS.includes(t))
  for (const t of TRACKS) {
    if (o.levels && typeof o.levels[t] === 'number') ctl.levels[t] = clamp(o.levels[t], 0, 1.5)
    if (o.seeds && typeof o.seeds[t] === 'number') ctl.seeds[t] = o.seeds[t] >>> 0
  }
  if (typeof o.color === 'number') ctl.color = clamp(o.color, 0, 1)
  if (typeof o.bow === 'number') ctl.bow = clamp(o.bow, 0, 1)
  if (o.wander !== undefined) ctl.wander = Boolean(o.wander)
  if (typeof o.rev === 'number') ctl.rev = o.rev
  if (o.quit === true) ctl.quit = true
}

function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--render') {
      renderSecs = Number(argv[++i])
      renderOut = argv[++i]
    } else if (a === '--sweep') isSweep = true
    else if (a === '--mood') o.mood = argv[++i]
    else if (a === '--mute') o.mute = String(argv[++i]).split(',').filter(Boolean)
    else if (a === '--levels' || a === '--seeds') {
      // one number per track, in TRACKS order
      const vals = String(argv[++i]).split(',').map(Number)
      o[a.slice(2)] = Object.fromEntries(TRACKS.map((t, k) => [t, vals[k]]).filter(([, v]) => Number.isFinite(v)))
    } else if (a.startsWith('--')) o[a.slice(2)] = Number(argv[++i])
  }
  applyControl(o)
}

// ---------------------------------------------------------------- helpers

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let noiseSeed = 22222
function nz() {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) | 0
  return noiseSeed * 4.656612873e-10
}

const H = rng(0x5eed) // humanizing: velocities, timing, never structure
let R = rng(1) // structure: the progression
let RP = rng(2) // the piano's motif
let RA = rng(3) // the arc: where the energy goes next

// What is playing. The controls set it when a person moves them (`rev`
// changes); while wandering, the arc moves it and the controls are left be.
const cur = { energy: 2, mood: 'dusk', tempo: 108 }
const arc = { rev: -1, target: 2, hold: 1, moodAt: 0, tempoTo: 108, didShift: false }
const MOTIF_GRID = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 3, 7, 11, 19, 23, 27]
const MOTIF_TONES = [0, 2, 4, 4, 6, 8, 8, 7, 9, 11, 2, 1, 5]

function pick(r, list) {
  return list[Math.floor(r() * list.length)]
}

function freq(m) {
  return 440 * Math.pow(2, (m - 69) / 12)
}

function euclid(k, n, rot) {
  const out = new Array(n).fill(0)
  for (let i = 0; i < n; i++) if ((i * k) % n < k) out[(i + rot) % n] = 1
  return out
}

// ---------------------------------------------------------------- buses

const dryL = new Float32Array(BLOCK)
const dryR = new Float32Array(BLOCK)
const revL = new Float32Array(BLOCK)
const revR = new Float32Array(BLOCK)
const delS = new Float32Array(BLOCK)
const padL = new Float32Array(BLOCK)
const padR = new Float32Array(BLOCK)
const bassB = new Float32Array(BLOCK)
const bowL = new Float32Array(BLOCK)
const bowR = new Float32Array(BLOCK)
const tmp = new Float32Array(BLOCK)

const BUS_DRY = 0
const BUS_PAD = 1
const BUS_BASS = 2
const BUS_BOW = 3

const voices = []

function spawn(gen, o) {
  const ang = ((o.pan || 0) + 1) * (Math.PI / 4)
  voices.push({
    gen,
    wait: Math.max(0, Math.round(o.wait || 0)),
    gl: o.gain * Math.cos(ang),
    gr: o.gain * Math.sin(ang),
    g: o.gain,
    rev: o.rev || 0,
    del: o.del || 0,
    bus: o.bus || BUS_DRY,
  })
}

// ---------------------------------------------------------------- voices
// Each returns gen(buf, i0, n): fills buf[i0..n) and answers whether it lives.

function kickVoice(vel) {
  let t = 0
  let ph = 0
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      const ts = t / SR
      ph += (TAU * (45 + 105 * Math.exp(-ts / 0.032))) / SR
      const a = Math.min(1, t / 70) * Math.exp(-ts / 0.17)
      b[i] = Math.tanh(Math.sin(ph) * a * 1.5) * vel
      t++
    }
    return t < SR * 0.9
  }
}

function hatVoice(vel, decay) {
  let env = 1
  let lp1 = 0
  let lp2 = 0
  let out = 0
  let t = 0
  const k = Math.exp(-1 / (SR * decay))
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      const x = nz()
      lp1 += 0.6 * (x - lp1)
      const h1 = x - lp1
      lp2 += 0.6 * (h1 - lp2)
      out += 0.7 * (h1 - lp2 - out)
      b[i] = out * env * Math.min(1, t / 40) * vel
      env *= k
      t++
    }
    return env > 0.001
  }
}

function shakerVoice(vel) {
  let t = 0
  let low = 0
  let band = 0
  const f = 2 * Math.sin((Math.PI * 4800) / SR)
  const att = SR * 0.012
  const k = Math.exp(-1 / (SR * 0.04))
  let env = 1
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      low += f * band
      const high = nz() - low - 0.9 * band
      band += f * high
      let a = t / att
      if (a > 1) {
        a = env
        env *= k
      }
      b[i] = band * a * vel
      t++
    }
    return env > 0.002
  }
}

function blipVoice(f, decay, vel) {
  let ph = 0
  let env = 1
  let t = 0
  const inc = (TAU * f) / SR
  const k = Math.exp(-1 / (SR * decay))
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      ph += inc
      const tick = t < 30 ? nz() * 0.3 * (1 - t / 30) : 0
      b[i] = (Math.sin(ph) + tick) * env * Math.min(1, t / 12) * vel
      env *= k
      t++
    }
    return env > 0.001
  }
}

function malletVoice(f, vel) {
  let p1 = 0
  let p2 = 0
  let e1 = 1
  let e2 = 1
  let t = 0
  const i1 = (TAU * f) / SR
  const i2 = (TAU * f * 3.93) / SR
  const k1 = Math.exp(-1 / (SR * 0.16))
  const k2 = Math.exp(-1 / (SR * 0.03))
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      p1 += i1
      p2 += i2
      b[i] = (Math.sin(p1) * e1 + Math.sin(p2) * e2 * 0.3) * Math.min(1, t / 30) * vel
      e1 *= k1
      e2 *= k2
      t++
    }
    return e1 > 0.001
  }
}

function snapVoice(vel) {
  let t = 0
  let low = 0
  let band = 0
  const f = 2 * Math.sin((Math.PI * 1500) / SR)
  const gap = Math.round(SR * 0.009)
  const kb = Math.exp(-1 / (SR * 0.004))
  const kt = Math.exp(-1 / (SR * 0.06))
  let env = 1
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      low += f * band
      const high = nz() - low - 0.8 * band
      band += f * high
      if (t < gap * 3) {
        if (t % gap === 0) env = 1
        env *= kb
      } else {
        if (t === gap * 3) env = 0.8
        env *= kt
      }
      b[i] = band * env * vel
      t++
    }
    return t < gap * 3 || env > 0.002
  }
}

function tomVoice(f, vel) {
  let t = 0
  let ph = 0
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      const ts = t / SR
      ph += (TAU * f * (1 + 0.6 * Math.exp(-ts / 0.025))) / SR
      b[i] = Math.sin(ph) * Math.min(1, t / 60) * Math.exp(-ts / 0.15) * vel
      t++
    }
    return t < SR * 0.8
  }
}

function bassVoice(f, durS, vel) {
  let t = 0
  let ph = 0
  let env = 0
  const inc = (TAU * f) / SR
  const hold = durS * SR
  const ka = 1 - Math.exp(-1 / (SR * 0.006))
  const kr = 1 - Math.exp(-1 / (SR * 0.05))
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      const on = t < hold
      env += ((on ? 1 : 0) - env) * (on ? ka : kr)
      ph += inc
      b[i] = (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph)) * env * vel
      t++
    }
    return t < hold || env > 0.001
  }
}

// A felt piano: inharmonic partials with a two-stage decay, a doubled
// fundamental for slow beating, a soft thump, and a lowpass that opens with
// velocity.
function pianoVoice(m, vel, durS, bright) {
  const f = freq(m)
  const B = 0.0004
  const T0 = Math.min(6, 3.2 * Math.pow(261 / f, 0.6))
  const P = []
  let sum = 0
  for (let k = 1; k <= 10; k++) {
    const fk = f * k * Math.sqrt(1 + B * k * k)
    if (fk > 7000) break
    const a =
      Math.pow(k, -1.25) *
      Math.exp(-(k - 1) * (1 - vel * bright) * 0.45) *
      (Math.abs(Math.sin((Math.PI * k) / 7.3)) + 0.15)
    const tau = T0 / (1 + 0.45 * (k - 1))
    const copies = k <= 2 ? [1, 1.0007] : [1]
    for (const c of copies) {
      P.push({
        inc: (TAU * fk * c) / SR,
        ph: 0,
        a1: (a * 0.55) / copies.length,
        k1: Math.exp(-1 / (SR * tau * 0.18)),
        a2: (a * 0.45) / copies.length,
        k2: Math.exp(-1 / (SR * tau)),
      })
    }
    sum += a
  }
  const norm = Math.pow(vel, 1.3) / sum
  const hold = durS * SR
  const krel = Math.exp(-1 / (SR * 0.2))
  const lpc = 1 - Math.exp((-TAU * (2200 + 6000 * vel * bright)) / SR)
  const kth = Math.exp(-1 / (SR * 0.008))
  let t = 0
  let rel = 1
  let lp = 0
  let th = 0.35 * vel
  let thLp = 0
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      let s = 0
      for (let j = 0; j < P.length; j++) {
        const p = P[j]
        p.ph += p.inc
        s += Math.sin(p.ph) * (p.a1 + p.a2)
        p.a1 *= p.k1
        p.a2 *= p.k2
      }
      thLp += 0.05 * (nz() - thLp)
      s = s * norm + thLp * th
      th *= kth
      if (t > hold) rel *= krel
      lp += lpc * (s * rel * Math.min(1, t / 90) - lp)
      b[i] = lp
      t++
    }
    return rel > 0.001 && t < SR * 9
  }
}

function blep(p, dp) {
  if (p < dp) {
    const t = p / dp
    return t + t - t * t - 1
  }
  if (p > 1 - dp) {
    const t = (p - 1) / dp
    return t * t + t + t + 1
  }
  return 0
}

// Three detuned saws with a slow swell and a vibrato that fades in: the
// synth half of the strings (the bowed half is bowVoice, below). The shared pad bus filters and widens them.
function padVoice(m, o) {
  const f = freq(m)
  const cents = c => Math.pow(2, c / 1200)
  const incs = [(f * cents(-o.det)) / SR, (f * cents(o.det)) / SR, (f * cents(o.det * 0.37)) / SR]
  const ph = [H(), H(), H()]
  const st = { rel: false }
  const ka = 1 - Math.exp(-1 / ((SR * o.att) / 3))
  const kr = 1 - Math.exp(-1 / ((SR * o.rel) / 3))
  const vr = (TAU * (4.6 + H() * 1.2)) / SR
  let vp = H() * TAU
  let env = 0
  let t = 0
  const gen = (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      if (o.hold && t > o.hold) st.rel = true
      env += ((st.rel ? 0 : 1) - env) * (st.rel ? kr : ka)
      vp += vr
      const vd = 1 + o.vib * Math.min(1, t / (SR * 0.9)) * Math.sin(vp)
      let s = 0
      for (let k = 0; k < 3; k++) {
        const dp = incs[k] * vd
        let p = ph[k] + dp
        if (p >= 1) p -= 1
        ph[k] = p
        s += 2 * p - 1 - blep(p, dp)
      }
      b[i] = s * env * o.level
      t++
    }
    return !(st.rel && env < 0.0004)
  }
  return { gen, st }
}

const BOW_POLE = 0.65 // the bridge's lowpass: how quickly the string's highs die
// Measured, not derived: without it every note is a quarter of a sample sharp
// (2 cents at A3, 9 at A5). With it the model holds within 2 cents to BOW_TOP.
const BOW_COMP = -0.25
const BOW_TOP = 86 // above this MIDI note the string is too short to stay in tune

function resonator(hz, r) {
  const a1 = 2 * r * Math.cos((TAU * hz) / SR)
  return { b0: (1 - r * r) / 2, a1, a2: r * r, x1: 0, x2: 0, y1: 0, y2: 0 }
}

function resonate(q, x) {
  const y = q.b0 * (x - q.x2) + q.a1 * q.y1 - q.a2 * q.y2
  q.x2 = q.x1
  q.x1 = x
  q.y2 = q.y1
  q.y1 = y
  return y
}

// A bowed string, as a waveguide: the string is two delay lines, one each
// side of the bow. Every sample the bow compares its own speed with the
// string's and either grips it or lets it slip, which is the whole sound.
// The bridge end loses a little treble on every pass, and a few fixed
// resonances stand in for the wooden body.
function bowVoice(m, o) {
  const f = freq(m)
  const w0 = (TAU * f) / SR
  // the bridge filter delays the wave a little; take that out of the string
  const filterDelay = Math.atan2(BOW_POLE * Math.sin(w0), 1 - BOW_POLE * Math.cos(w0)) / w0
  const total = SR / f - filterDelay - BOW_COMP
  const beta = 0.105 + H() * 0.04 // where along the string the bow sits
  const lenB = Math.max(1.5, total * beta)
  const lenN = total - lenB
  const N = Math.ceil(total * 1.03) + 8
  const neck = new Float32Array(N)
  const bridge = new Float32Array(N)
  const body = m < 57 ? [resonator(175, 0.988), resonator(290, 0.985), resonator(1100, 0.93)] : [resonator(285, 0.986), resonator(470, 0.984), resonator(2300, 0.9)]
  const st = { rel: false }
  const maxVel = 0.05 + 0.12 * o.vel
  const slope = 5 - 4 * o.press
  const upStep = 1 / (SR * o.att)
  const downStep = 1 / (SR * o.rel)
  const vr = (TAU * (4.7 + H() * 1.1)) / SR
  let vp = H() * TAU
  let wi = 0
  let sf = 0
  let env = 0
  let grit = 0
  let dcX = 0
  let dcY = 0
  // one side of the string alone carries a standing offset: keep it out
  const dcR = 1 - (TAU * Math.min(60, f * 0.4)) / SR
  let t = 0
  let relAt = -1
  // high notes come off the string quieter: even them out
  const level = o.level * clamp(Math.pow(f / 330, 0.6), 1, 2.2)
  const tap = (buf, len) => {
    let r = wi - len
    if (r < 0) r += N
    const i = r | 0
    const fr = r - i
    return buf[i] * (1 - fr) + buf[i + 1 === N ? 0 : i + 1] * fr
  }
  const gen = (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      if (o.hold && t > o.hold) st.rel = true
      if (st.rel && relAt < 0) relAt = t
      env = st.rel ? Math.max(0, env - downStep) : Math.min(1, env + upStep)
      vp += vr
      const vib = 1 - o.vib * Math.min(1, t / (SR * 0.9)) * Math.sin(vp)
      const bridgeOut = tap(bridge, lenB)
      const neckOut = tap(neck, lenN * vib)
      sf = (1 - BOW_POLE) * bridgeOut + BOW_POLE * sf
      const fromBridge = -0.95 * sf
      const fromNut = -neckOut
      // rosin: the bow's speed is never quite even
      grit += 0.2 * (nz() - grit)
      const dv = maxVel * env * (1 + 0.25 * grit) - (fromBridge + fromNut)
      const s = Math.abs(dv * slope) + 0.75
      const grip = Math.min(1, 1 / (s * s * s * s))
      const push = dv * grip
      neck[wi] = fromBridge + push
      bridge[wi] = fromNut + push
      if (++wi === N) wi = 0
      dcY = bridgeOut - dcX + dcR * dcY
      dcX = bridgeOut
      b[i] = (0.45 * dcY + 0.9 * resonate(body[0], dcY) + 0.8 * resonate(body[1], dcY) + 0.5 * resonate(body[2], dcY)) * level
      t++
    }
    // once the bow has lifted, the body rings a moment longer
    return !(relAt >= 0 && t > relAt + SR * (o.rel + 0.5))
  }
  return { gen, st }
}

function shimmerVoice(f, vel) {
  let t = 0
  let ph = 0
  let env = 0
  const inc = (TAU * f) / SR
  const att = SR * 0.35
  const k = Math.exp(-1 / (SR * 1.6))
  return (b, i0, n) => {
    for (let i = i0; i < n; i++) {
      ph += inc
      if (t < att) env = t / att
      else env *= k
      b[i] = (Math.sin(ph) + 0.3 * Math.sin(ph * 2.001)) * env * vel
      t++
    }
    return t < att || env > 0.001
  }
}

// ---------------------------------------------------------------- effects

const DEL_N = SR * 2
const delBufL = new Float32Array(DEL_N)
const delBufR = new Float32Array(DEL_N)
let delW = 0
let delLen = SR * 0.4
let delLpL = 0
let delLpR = 0

function tap(buf, len) {
  let r = delW - len
  if (r < 0) r += DEL_N
  const i = Math.floor(r)
  const fr = r - i
  return buf[i] * (1 - fr) + buf[(i + 1) % DEL_N] * fr
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const ALLPS = [556, 441, 341, 225]
function line(len) {
  return { b: new Float32Array(len), i: 0, s: 0 }
}
const combL = COMBS.map(n => line(n))
const combR = COMBS.map(n => line(n + 23))
const allL = ALLPS.map(n => line(n))
const allR = ALLPS.map(n => line(n + 23))
const REV_FB = 0.91
const REV_DAMP = 0.3
let revHpL = 0
let revHpR = 0

function reverbTank(x, combs, alls) {
  let acc = 0
  for (let j = 0; j < 8; j++) {
    const c = combs[j]
    const y = c.b[c.i]
    c.s = y * (1 - REV_DAMP) + c.s * REV_DAMP
    c.b[c.i] = x + c.s * REV_FB
    if (++c.i === c.b.length) c.i = 0
    acc += y
  }
  for (let j = 0; j < 4; j++) {
    const a = alls[j]
    const bo = a.b[a.i]
    a.b[a.i] = acc + bo * 0.5
    if (++a.i === a.b.length) a.i = 0
    acc = bo - acc
  }
  return acc
}

const CH_N = 4096
const chBufL = new Float32Array(CH_N)
const chBufR = new Float32Array(CH_N)
let chW = 0
let chPh = 0
const pad = { lowL: 0, bandL: 0, lowR: 0, bandR: 0, lfo: 0 }

function chorusTap(buf, d) {
  let r = chW - d
  if (r < 0) r += CH_N
  const i = Math.floor(r)
  const fr = r - i
  return buf[i] * (1 - fr) + buf[(i + 1) % CH_N] * fr
}

const AIR_COMP = 1.2
const air = { b0: 0, b1: 0, b2: 0, c0: 0, c1: 0, c2: 0, lpL: 0, lpR: 0, hpL: 0, hpR: 0, lfo: 0, ck: 0, ckLp: 0, ckPan: 0 }

// ---------------------------------------------------------------- music state

const G = {} // layer gains as they sound now
const T = {} // where they are heading
for (const t of TRACKS) {
  G[t] = 0
  T[t] = 0
}

const live = { mood: '', seed: -1, energy: -1, pianoSeed: -1 } // what the music has taken up
let mood = MOODS.dusk
let prog = [0, 3, 5, 4]
let motif = []
let arp = [0, 2, 4, 6]
let arpAt = 0
let pat = null
let patKey = ''
let barPiano = []
let barShimmer = []
let padHeld = []
let soloLast = 76
let soloP = 0.3
let isBreak = false
let airP = { ck: 0.99986, lfo: 0.07, shim: 0.3, tones: [0, 2, 4, 6, 8] }
let airColor = 0.5
let bowMix = 0.7
let bowLpL = 0
let bowLpR = 0

let pos = 0 // samples rendered
let nextStepAt = 0
let stepSamples = (SR * 60) / 108 / 4
let step = 0
let bar = 0
let duck = 0
let duckT = 0
let duckPrev = 0
let fade = 0
let vol = 0.6
let peakPre = 0

function midi(deg) {
  return mood.root + 12 * Math.floor(deg / 7) + mood.scale[((deg % 7) + 7) % 7]
}

// a track's own randomness: the seed, its own reroll, and whatever else varies it
function trackRng(name, salt) {
  return rng(live.seed * 7919 + ctl.seeds[name] * 104729 + TRACKS.indexOf(name) * 977 + salt)
}

function chordName(deg) {
  const third = midi(deg + 2) - midi(deg)
  const seventh = midi(deg + 6) - midi(deg)
  return NOTE_NAMES[midi(deg) % 12] + (third === 3 ? 'm' : '') + (seventh === 11 ? 'maj7' : '7')
}

function genProg() {
  const pool = [0, 2, 3, 4, 5, 6, 1].filter(d => d !== mood.avoid)
  prog = [0]
  while (prog.length < 4) {
    const d = pick(R, pool)
    if (d !== prog[prog.length - 1] && !(prog.length === 3 && d === 0)) prog.push(d)
  }
}

function genMotif() {
  const e = cur.energy
  const count = e === 0 ? 2 + Math.floor(RP() * 2) : 3 + Math.floor(RP() * (1 + e * 0.75))
  const grid = MOTIF_GRID
  const tones = MOTIF_TONES
  const used = new Set()
  motif = []
  for (let tries = 0; motif.length < count && tries < 60; tries++) {
    const s = pick(RP, grid)
    if (used.has(s)) continue
    used.add(s)
    motif.push({ s, d: pick(RP, tones), v: 0.38 + RP() * 0.34 })
  }
  motif.sort((a, b) => a.s - b.s)
}

// The motif thins or fills to suit a new energy and is otherwise kept, so
// the piano is still playing the same idea on the other side of a shift.
function fitMotif() {
  const want = [3, 4, 5, 5, 6][cur.energy]
  while (motif.length > want) motif.splice(Math.floor(RP() * motif.length), 1)
  for (let tries = 0; motif.length < want && tries < 40; tries++) {
    const s = pick(RP, MOTIF_GRID)
    if (motif.some(n => n.s === s)) continue
    motif.push({ s, d: pick(RP, MOTIF_TONES), v: 0.38 + RP() * 0.34 })
  }
  motif.sort((a, b) => a.s - b.s)
}

function mutateMotif() {
  if (motif.length === 0) return
  const n = motif[Math.floor(RP() * motif.length)]
  n.d = pick(RP, [0, 2, 4, 6, 8, 7, 9])
  n.v = 0.38 + RP() * 0.34
}

function genPatterns(e, variant) {
  // kick and bass stay put through a section's variations; the rest wander
  const kickR = trackRng('kick', e * 101)
  const bassR = trackRng('bass', e * 101)
  const hatR = trackRng('hats', e * 101 + (variant + 1) * 13)
  const percR = trackRng('perc', e * 101 + (variant + 1) * 13)
  const z = n => new Array(n).fill(0)
  const p = { kick: z(16), hat: z(16), open: z(16), shk: z(16), pa: z(16), pb: z(16), snap: z(16), tom: z(32), bass: [] }
  for (let i = 0; i < 16; i++) p.bass.push(null)

  if (e === 2) {
    p.kick[0] = 1
    p.kick[8] = 0.9
    if (kickR() < 0.5) p.kick[11] = 0.6
    else if (kickR() < 0.5) p.kick[14] = 0.6
  } else if (e >= 3) {
    for (const s of [0, 4, 8, 12]) p.kick[s] = 1
    if (kickR() < 0.4) p.kick[15] = 0.5
    if (kickR() < 0.25) p.kick[7] = 0.45
  }

  const bassShapes =
    e === 2
      ? [
          [[0, 0, 3], [10, 0, 2]],
          [[0, 0, 2], [6, 0, 1.5], [10, 0, 2]],
        ]
      : [
          [[2, 0, 1.5], [6, 0, 1.5], [10, 0, 1.5], [14, 4, 1.5]],
          [[0, 0, 1.5], [3, 0, 1], [6, 0, 1.5], [11, 0, 1], [14, 7, 1]],
          [[0, 0, 2], [7, 0, 1], [10, 0, 1.5], [13, 4, 1]],
        ]
  if (e >= 2) {
    const shape = bassShapes[(Math.floor(bassR() * bassShapes.length) + (variant >> 1)) % bassShapes.length]
    for (const [s, d, len] of shape) p.bass[s] = { d, len, v: s === 0 ? 1 : 0.85 }
  }

  if (e === 1) {
    euclid(3 + Math.floor(hatR() * 2), 16, Math.floor(hatR() * 16)).forEach((h, i) => (p.hat[i] = h * 0.5))
  } else if (e === 2) {
    euclid(2 + Math.floor(hatR() * 2), 16, Math.floor(hatR() * 16)).forEach((h, i) => (p.hat[i] = h * 0.4))
    for (const s of [2, 6, 10, 14]) p.hat[s] = 0.8
  } else if (e === 3) {
    euclid(5 + Math.floor(hatR() * 3), 16, Math.floor(hatR() * 16)).forEach((h, i) => (p.hat[i] = h * 0.4))
    for (const s of [2, 6, 10, 14]) p.hat[s] = 1
  } else if (e >= 4) {
    for (let i = 0; i < 16; i++) p.hat[i] = i % 4 === 2 ? 1 : hatR() < 0.85 ? 0.35 : 0
  }
  if (e >= 3 && hatR() < 0.6) {
    const s = hatR() < 0.5 ? 14 : 6
    p.open[s] = 0.6
    p.hat[s] = 0
  }
  if (e >= 3) for (let i = 0; i < 16; i++) p.shk[i] = e >= 4 ? (i % 2 ? 0.5 : 0.8) : i % 2 ? 0.7 : 0

  if (e >= 1) {
    euclid(2 + e + Math.floor(percR() * 2), 16, Math.floor(percR() * 16)).forEach((h, i) => (p.pa[i] = h * (0.5 + percR() * 0.5)))
    euclid(1 + e + Math.floor(percR() * 2), 16, Math.floor(percR() * 16)).forEach((h, i) => (p.pb[i] = h * (0.5 + percR() * 0.5)))
  }
  if (e >= 3) {
    p.snap[4] = 0.8
    p.snap[12] = 1
  } else if (e === 2 && percR() < 0.6) p.snap[12] = 0.6
  if (e >= 2) {
    const hits = 1 + Math.floor(percR() * 2)
    for (let i = 0; i < hits; i++) p.tom[1 + 2 * Math.floor(percR() * 16)] = 0.6
  }
  arp = [0, 2, 4, 6, 8].sort(() => percR() - 0.5).slice(0, 4)
  return p
}

function chars(vals) {
  let s = ''
  for (const v of vals) s += v >= 0.75 ? '●' : v > 0 ? '•' : '·'
  return s
}

function displayRows() {
  const empty = new Array(16).fill(0)
  const half = (bar % 2) * 16
  const perc = empty.map((_, i) => Math.max(pat.pa[i], pat.pb[i], pat.snap[i], pat.tom[half + i]))
  const hats = empty.map((_, i) => Math.max(pat.hat[i], pat.open[i], pat.shk[i] * 0.5))
  const keys = empty.slice()
  for (const n of barPiano) keys[n.step] = n.v > 0.55 ? 1 : 0.5
  const on = t => T[t] > 0
  return {
    kick: chars(on('kick') ? pat.kick : empty),
    bass: chars(on('bass') ? pat.bass.map(b => (b ? b.v : 0)) : empty),
    hats: chars(on('hats') ? hats : empty),
    perc: chars(on('perc') ? perc : empty),
    piano: chars(on('piano') ? keys : empty),
    strings: on('strings') ? '─'.repeat(16) : chars(empty),
    air: on('air') ? '░'.repeat(16) : chars(empty),
  }
}

function setTargets() {
  const e = cur.energy
  T.kick = e >= 2 && !isBreak ? 1 : 0
  T.bass = e >= 2 && !isBreak ? 1 : 0
  T.hats = e >= 1 ? (isBreak ? 0.6 : 1) : 0
  T.perc = e >= 1 ? 1 : 0
  T.piano = 1
  T.strings = 1
  T.air = 1
  for (const t of ctl.mute) T[t] = 0
  for (const t of TRACKS) T[t] *= ctl.levels[t]
}

// ---------------------------------------------------------------- sequencer
// The gains below were first set by meter and then corrected by ear: the
// kick, bass, strings and air all came down (to 80, 60, 70 and 10 percent).

let onBarMessage = null
let onStepMessage = null

// A person moved energy, mood or tempo: that is where the music goes, and
// the arc waits a while before it wanders off again.
function adopt() {
  if (ctl.rev === arc.rev) return
  arc.rev = ctl.rev
  if (ctl.energy !== cur.energy) {
    cur.energy = arc.target = ctl.energy
    arc.hold = 2
  }
  if (ctl.mood !== cur.mood) {
    cur.mood = ctl.mood
    arc.moodAt = bar
  }
  cur.tempo = arc.tempoTo = ctl.tempo
}

// The arc, decided every eight bars: pick somewhere to go, walk there one
// energy at a time, stay a while, pick again. Mostly it keeps to the middle.
// Once in a long while, at a quiet moment, it changes mood instead.
function wander() {
  arc.didShift = false
  if (!ctl.wander || bar === 0 || bar % 8 !== 0) return
  if (arc.hold > 0) {
    arc.hold--
    return
  }
  if (cur.energy === arc.target) {
    if (cur.energy <= 1 && bar - arc.moodAt >= 96 && RA() < 0.25) {
      cur.mood = pick(RA, Object.keys(MOODS).filter(m => m !== cur.mood))
      arc.tempoTo = MOODS[cur.mood].bpm
      arc.moodAt = bar
      arc.hold = 1
      return
    }
    const weights = [1, 3, 4, 3, 1.5]
    weights[cur.energy] = 0
    let x = RA() * weights.reduce((a, b) => a + b, 0)
    arc.target = weights.findIndex(wt => (x -= wt) < 0)
    if (arc.target < 0) arc.target = 2
  }
  cur.energy += Math.sign(arc.target - cur.energy)
  arc.didShift = true
  const isEdge = cur.energy === 0 || cur.energy === 4
  arc.hold = cur.energy === arc.target ? 1 + Math.floor(RA() * (isEdge ? 2 : 3)) : Math.floor(RA() * 2)
}

function onBar(w) {
  wander()
  // a new mood's tempo is approached a beat per minute each bar
  if (cur.tempo !== arc.tempoTo) cur.tempo += clamp(arc.tempoTo - cur.tempo, -1, 1)
  const isChordBar = bar % 2 === 0
  if (isChordBar) {
    // mood and seed land on a chord change, so nothing clashes mid-chord
    if (live.mood !== cur.mood || live.seed !== ctl.seed) {
      const isNewSeed = live.seed !== ctl.seed
      live.mood = cur.mood
      live.seed = ctl.seed
      mood = MOODS[live.mood]
      R = rng(live.seed * 2654435761 + live.mood.length)
      genProg()
      RP = trackRng('piano', 0)
      if (isNewSeed) RA = rng(live.seed * 31337 + 5)
      if (isNewSeed || motif.length === 0) genMotif()
      patKey = ''
    }
  }
  if (live.pianoSeed !== ctl.seeds.piano) {
    live.pianoSeed = ctl.seeds.piano
    RP = trackRng('piano', 0)
    genMotif()
  }
  if (live.energy !== cur.energy) {
    live.energy = cur.energy
    if (motif.length === 0) genMotif()
    else fitMotif()
  }
  if (bar % 32 === 28) isBreak = cur.energy >= 2 && R() < 0.6
  if (bar % 32 === 0) {
    isBreak = false
    if (bar > 0 && R() < 0.5) {
      const pool = [2, 3, 4, 5, 6].filter(d => d !== mood.avoid)
      prog[1 + Math.floor(R() * 3)] = pick(R, pool)
    }
  }
  if (bar > 0 && bar % 16 === 0) {
    if (R() < 0.5) genMotif()
    else mutateMotif()
  } else if (bar > 0 && bar % 4 === 0) mutateMotif()

  const variant = Math.floor(bar / 8) % 4
  const key = [live.seed, live.energy, variant, ctl.seeds.kick, ctl.seeds.bass, ctl.seeds.hats, ctl.seeds.perc].join('/')
  if (key !== patKey) {
    pat = genPatterns(live.energy, variant)
    patKey = key
  }
  setTargets()

  const e = live.energy
  const chord = prog[Math.floor(bar / 2) % 4]
  const base = chord + 7 * Math.round((63 - midi(chord)) / 12)
  const bassM = 33 + ((midi(chord) - 33 + 120) % 12)

  if (isChordBar) {
    for (const v of padHeld) v.rel = true
    padHeld = []
    if (T.strings > 0) {
      // the section's voicing: how the chord is spread, how low it sits
      const sr = trackRng('strings', 0)
      const shape = pick(sr, [[0, 4, 6, 9], [0, 4, 9, 13], [0, 6, 9, 11], [0, 2, 4, 6], [0, 4, 8, 13]])
      const low = chord + 7 * Math.round((pick(sr, [52, 55, 55, 59]) - midi(chord)) / 12)
      const ninth = sr() * 0.8
      soloP = 0.15 + sr() * 0.4
      const notes = shape.map(d => low + d)
      if (R() < ninth && !shape.includes(8)) notes.push(low + 8)
      notes.forEach((d, i) => {
        const v = padVoice(midi(d), { att: 1.6, rel: 2.6, vib: 0.0025, det: 7, level: 0.05 })
        const pan = [-0.5, 0.35, -0.2, 0.5, 0][i]
        padHeld.push(v.st)
        spawn(v.gen, { wait: w, gain: 1, pan, bus: BUS_PAD })
        if (ctl.bow > 0.02 && midi(d) <= BOW_TOP) {
          // the same note on a bowed string; no two players start together
          const q = bowVoice(midi(d), { att: 1 + H() * 0.6, rel: 1.4, vib: 0.003, vel: 0.4 + H() * 0.15, press: 0.7, level: 0.135 })
          padHeld.push(q.st)
          spawn(q.gen, { wait: w + H() * 0.06 * SR, gain: 1, pan, bus: BUS_BOW })
        }
      })
      if (e >= 1 && R() < soloP + 0.08 * e) {
        // a long solo line that moves by the smallest step it can
        const options = [2, 6, 8, 4].map(d => midi(base + 7 + d))
        let best = options[0]
        for (const o of options) if (Math.abs(o - soloLast) < Math.abs(best - soloLast) && o !== soloLast) best = o
        soloLast = best
        const v = padVoice(best, { att: 0.5, rel: 1.2, vib: 0.006, det: 3, level: 0.06, hold: stepSamples * 22 })
        spawn(v.gen, { wait: w + stepSamples * 2, gain: 1, pan: 0.15, bus: BUS_PAD })
        if (ctl.bow > 0.02 && best <= BOW_TOP) {
          const q = bowVoice(best, { att: 0.35, rel: 0.9, vib: 0.006, vel: 0.6, press: 0.75, level: 0.16, hold: stepSamples * 22 })
          spawn(q.gen, { wait: w + stepSamples * 2, gain: 1, pan: 0.15, bus: BUS_BOW })
        }
      }
    }
  }

  // this bar of the piano: the motif laid over the chord, a little unfaithful
  barPiano = []
  const half = (bar % 2) * 16
  const mine = motif.filter(n => Math.floor(n.s / 16) === bar % 2)
  mine.forEach((n, i) => {
    if (H() < 0.14) return
    const next = mine[i + 1]
    const len = clamp(next ? next.s - n.s : 8, 2, 10) * (e === 0 ? 2 : 1.1)
    barPiano.push({ step: n.s - half, m: midi(base + n.d), v: n.v, len })
    if (H() < 0.12) barPiano.push({ step: Math.min(15, n.s - half + 1), m: midi(base + n.d + 7), v: n.v * 0.55, len: 3 })
  })
  if (isChordBar && H() < 0.75) {
    barPiano.push({ step: 0, m: bassM + 12, v: 0.42, len: 28 })
    if (H() < 0.4) barPiano.push({ step: 6, m: bassM + 19, v: 0.32, len: 20 })
  }

  if (arc.didShift && G.air > 0.05) {
    // a shift of energy is marked by a soft glint over the new section
    for (const d of [0, 4]) {
      spawn(shimmerVoice(freq(midi(base + 14 + d)), 0.8), { wait: w, gain: 0.0022 * G.air, pan: d ? 0.5 : -0.5, rev: 0.9, del: 0.4 })
    }
  }
  // the air's own character: how often it crackles, breathes and glints
  const ar = trackRng('air', 0)
  airP = {
    ck: 0.99975 + ar() * 0.0002,
    lfo: 0.03 + ar() * 0.12,
    shim: 0.15 + ar() * 0.4,
    tones: [0, 2, 4, 6, 8].sort(() => ar() - 0.5).slice(0, 3),
  }
  barShimmer = []
  if (H() < airP.shim + 0.05 * e) {
    barShimmer.push({ step: Math.floor(H() * 16), m: midi(base + 14 + pick(H, airP.tones)) })
  }

  if (onBarMessage) {
    onBarMessage({
      t: 'bar',
      bar,
      chord: chordName(chord),
      sec: isBreak ? 'breakdown' : `${ENERGY_NAMES[e]} ${'abcd'[variant]}`,
      rows: displayRows(),
      e: cur.energy,
      mood: cur.mood,
      tempo: Math.round(cur.tempo),
      to: ctl.wander ? arc.target : cur.energy,
    })
  }
}

function onStep(w) {
  adopt()
  stepSamples = (SR * 60) / cur.tempo / 4
  if (step === 0) onBar(w)
  if (onStepMessage) onStepMessage(step)

  const e = live.energy
  const at = w + (step & 1 ? mood.swing * stepSamples : 0)
  const late = () => at + H() * 0.003 * SR
  const feel = () => 0.85 + H() * 0.3
  const chord = prog[Math.floor(bar / 2) % 4]
  const base = chord + 7 * Math.round((63 - midi(chord)) / 12)
  const isFill = bar % 8 === 7 && step >= 12 && e >= 2

  if (pat.kick[step] > 0 && G.kick > 0.05 && !(isFill && step === 12 && H() < 0.3)) {
    spawn(kickVoice(pat.kick[step]), { wait: at, gain: 0.336 * G.kick, rev: 0.03 })
    duckT = 1
  }
  const b = pat.bass[step]
  if (b && G.bass > 0.05) {
    const m = 33 + ((midi(chord + b.d) - 33 + 120) % 12)
    spawn(bassVoice(freq(m), (b.len * stepSamples) / SR, b.v), { wait: at, gain: 0.168 * G.bass, bus: BUS_BASS })
  }
  if (G.hats > 0.05) {
    if (pat.hat[step] > 0) {
      spawn(hatVoice(pat.hat[step] * feel(), 0.022), { wait: late(), gain: 0.2 * G.hats, pan: 0.2, rev: 0.1 })
    }
    if (pat.open[step] > 0) {
      spawn(hatVoice(pat.open[step], 0.11), { wait: late(), gain: 0.14 * G.hats, pan: 0.2, rev: 0.15 })
    }
    if (pat.shk[step] > 0) {
      spawn(shakerVoice(pat.shk[step] * feel()), { wait: late(), gain: 0.11 * G.hats, pan: -0.3, rev: 0.12 })
    }
  }
  if (G.perc > 0.05) {
    if ((pat.pa[step] > 0 && H() < 0.85) || (isFill && H() < 0.45)) {
      const f = freq(midi(base + 14 + arp[arpAt++ % 4]))
      const v = (pat.pa[step] || 0.5) * feel()
      spawn(blipVoice(f, 0.008 + H() * 0.02, v), { wait: late(), gain: 0.12 * G.perc, pan: -0.45, rev: 0.25, del: 0.4 })
    }
    if (pat.pb[step] > 0 && H() < 0.85) {
      const f = freq(midi(base + 7 + arp[(arpAt + step) % 4]))
      spawn(malletVoice(f, pat.pb[step] * feel()), { wait: late(), gain: 0.13 * G.perc, pan: 0.42, rev: 0.3, del: 0.3 })
    }
    if (pat.snap[step] > 0) {
      spawn(snapVoice(pat.snap[step] * feel()), { wait: late(), gain: 0.12 * G.perc, pan: -0.08, rev: 0.3 })
    }
    if (pat.tom[(bar % 2) * 16 + step] > 0) {
      spawn(tomVoice(freq(33 + ((midi(chord) - 33 + 120) % 12) + 12), 0.6 * feel()), {
        wait: late(),
        gain: 0.16 * G.perc,
        pan: 0.3,
        rev: 0.2,
      })
    }
  }
  if (G.piano > 0.05) {
    for (const n of barPiano) {
      if (n.step !== step) continue
      const v = clamp(n.v * feel(), 0.1, 0.95)
      spawn(pianoVoice(n.m, v, (n.len * stepSamples) / SR, mood.bright), {
        wait: at + H() * 0.006 * SR,
        gain: 0.38 * G.piano,
        pan: clamp((n.m - 64) / 40, -0.5, 0.5),
        rev: 0.4,
        del: 0.22,
      })
    }
  }
  if (G.air > 0.05) {
    for (const s of barShimmer) {
      if (s.step !== step) continue
      spawn(shimmerVoice(freq(s.m), 0.5 + H() * 0.5), { wait: at, gain: 0.002 * G.air, pan: H() * 1.4 - 0.7, rev: 0.9, del: 0.4 })
    }
  }

  if (++step === 16) {
    step = 0
    bar++
  }
}

// ---------------------------------------------------------------- render

function renderBlock(out) {
  dryL.fill(0)
  dryR.fill(0)
  revL.fill(0)
  revR.fill(0)
  delS.fill(0)
  padL.fill(0)
  padR.fill(0)
  bassB.fill(0)
  bowL.fill(0)
  bowR.fill(0)

  while (nextStepAt < pos + BLOCK) {
    onStep(Math.max(0, nextStepAt - pos))
    nextStepAt += stepSamples
  }
  setTargets()
  for (const t of TRACKS) G[t] += (T[t] - G[t]) * 0.012

  for (let vi = voices.length - 1; vi >= 0; vi--) {
    const v = voices[vi]
    let i0 = 0
    if (v.wait > 0) {
      if (v.wait >= BLOCK) {
        v.wait -= BLOCK
        continue
      }
      i0 = v.wait
      v.wait = 0
    }
    const isAlive = v.gen(tmp, i0, BLOCK)
    if (v.bus === BUS_BOW) {
      for (let i = i0; i < BLOCK; i++) {
        bowL[i] += tmp[i] * v.gl
        bowR[i] += tmp[i] * v.gr
      }
    } else if (v.bus === BUS_PAD) {
      for (let i = i0; i < BLOCK; i++) {
        padL[i] += tmp[i] * v.gl
        padR[i] += tmp[i] * v.gr
      }
    } else if (v.bus === BUS_BASS) {
      for (let i = i0; i < BLOCK; i++) bassB[i] += tmp[i] * v.g
    } else {
      for (let i = i0; i < BLOCK; i++) {
        const l = tmp[i] * v.gl
        const r = tmp[i] * v.gr
        dryL[i] += l
        dryR[i] += r
        revL[i] += l * v.rev
        revR[i] += r * v.rev
        delS[i] += tmp[i] * v.g * v.del
      }
    }
    if (!isAlive) voices.splice(vi, 1)
  }

  // the kick leans on the pad and the bass, gently
  duckT *= 0.965
  duck += (duckT - duck) * 0.35
  const duckNow = 1 - 0.38 * duck
  const duckStep = (duckNow - duckPrev) / BLOCK

  pad.lfo += (TAU * 0.05 * BLOCK) / SR
  const cutoff = (900 + 300 * cur.energy + (isBreak ? 500 : 0)) * (1 + 0.35 * Math.sin(pad.lfo))
  const pf = 2 * Math.sin((Math.PI * cutoff) / SR)
  const delTarget = clamp(stepSamples * 3, 2000, DEL_N - 4)
  const gStr = G.strings * 0.7
  // pad and bowed strings cross over at equal power
  bowMix += (ctl.bow - bowMix) * 0.05
  const padG = Math.sqrt(1 - bowMix)
  const bowG = Math.sqrt(bowMix)
  const gAir = G.air * 0.1
  air.lfo += (TAU * airP.lfo * BLOCK) / SR
  // color tilts the air from a low rumble (0) to a bright hiss (1)
  airColor += (ctl.color - airColor) * 0.05
  const aLp = 0.03 + 0.9 * airColor * airColor
  const aHp = 0.01 + 0.2 * airColor
  const aHiss = airColor * airColor * 0.5
  const aCk = 0.15 + 0.6 * airColor
  const airAmp = 0.03 * gAir * (0.7 + 0.3 * Math.sin(air.lfo)) * (1 + AIR_COMP * (1 - airColor) * (1 - airColor))
  const volTarget = ctl.volume * (ctl.quit ? 0 : 1)

  for (let i = 0; i < BLOCK; i++) {
    const dk = duckPrev + duckStep * i

    // strings: lowpass, then an ensemble chorus
    pad.lowL += pf * pad.bandL
    pad.bandL += pf * (padL[i] - pad.lowL - 0.9 * pad.bandL)
    pad.lowR += pf * pad.bandR
    pad.bandR += pf * (padR[i] - pad.lowR - 0.9 * pad.bandR)
    chBufL[chW] = pad.lowL
    chBufR[chW] = pad.lowR
    chPh += (TAU * 0.31) / SR
    const dA = 530 + 180 * Math.sin(chPh)
    const dB = 530 + 180 * Math.cos(chPh)
    const sL = (pad.lowL * 0.6 + chorusTap(chBufL, dA) * 0.5 + chorusTap(chBufR, dB * 1.31) * 0.2) * gStr * dk * padG
    const sR = (pad.lowR * 0.6 + chorusTap(chBufR, dB) * 0.5 + chorusTap(chBufL, dA * 1.31) * 0.2) * gStr * dk * padG
    if (++chW === CH_N) chW = 0

    // bowed strings: left nearly as they are, only the top softened
    bowLpL += 0.47 * (bowL[i] - bowLpL)
    bowLpR += 0.47 * (bowR[i] - bowLpR)
    const qL = bowLpL * gStr * dk * bowG
    const qR = bowLpR * gStr * dk * bowG

    // air: pink noise, a little crackle
    const wl = nz()
    const wr = nz()
    air.b0 = 0.99765 * air.b0 + wl * 0.099046
    air.b1 = 0.963 * air.b1 + wl * 0.2965164
    air.b2 = 0.57 * air.b2 + wl * 1.0526913
    air.c0 = 0.99765 * air.c0 + wr * 0.099046
    air.c1 = 0.963 * air.c1 + wr * 0.2965164
    air.c2 = 0.57 * air.c2 + wr * 1.0526913
    const pinkL = air.b0 + air.b1 + air.b2
    const pinkR = air.c0 + air.c1 + air.c2
    air.hpL += aHp * (pinkL - air.hpL)
    air.hpR += aHp * (pinkR - air.hpR)
    air.lpL += aLp * (pinkL - air.hpL + wl * aHiss - air.lpL)
    air.lpR += aLp * (pinkR - air.hpR + wr * aHiss - air.lpR)
    if (wl > airP.ck) {
      air.ck = wr * wr * wr * 0.5
      air.ckPan = 0.5 + 0.4 * nz()
    }
    air.ckLp += aCk * (air.ck - air.ckLp)
    air.ck *= 0.6
    const crackle = air.ckLp * gAir * 0.12

    const bs = Math.tanh(bassB[i] * 1.4) * 0.72 * dk

    // ping-pong delay, a dotted eighth long, darker with each bounce
    delLen += (delTarget - delLen) * 0.0003
    const dl = tap(delBufL, delLen)
    const dr = tap(delBufR, delLen)
    delLpL += 0.3 * (dl - delLpL)
    delLpR += 0.3 * (dr - delLpR)
    delBufL[delW] = delS[i] + delLpR * 0.42
    delBufR[delW] = delLpL
    if (++delW === DEL_N) delW = 0

    const rinL = (revL[i] + sL * 0.5 + qL * 0.55 + delLpL * 0.25 + air.lpL * airAmp * 2) * 0.03
    const rinR = (revR[i] + sR * 0.5 + qR * 0.55 + delLpR * 0.25 + air.lpR * airAmp * 2) * 0.03
    let wetL = reverbTank(rinL, combL, allL)
    let wetR = reverbTank(rinR, combR, allR)
    revHpL += 0.04 * (wetL - revHpL)
    revHpR += 0.04 * (wetR - revHpR)
    wetL = (wetL - revHpL) * (0.75 + 0.25 * dk)
    wetR = (wetR - revHpR) * (0.75 + 0.25 * dk)

    const L = dryL[i] + sL + qL + bs + delLpL * 0.5 + wetL + air.lpL * airAmp + crackle * (1 - air.ckPan)
    const Rr = dryR[i] + sR + qR + bs + delLpR * 0.5 + wetR + air.lpR * airAmp + crackle * air.ckPan

    const m = Math.max(Math.abs(L), Math.abs(Rr))
    if (m > peakPre) peakPre = m
    if (fade < 1) fade = Math.min(1, fade + 1 / (SR * 2.5))
    vol += (volTarget - vol) * (ctl.quit ? 0.00008 : 0.0004)
    const g = fade * vol * 1.1
    out[2 * i] = Math.tanh(L * 1.1) * g
    out[2 * i + 1] = Math.tanh(Rr * 1.1) * g
  }
  duckPrev = duckNow
  pos += BLOCK
}

function toPcm(f32) {
  const b = Buffer.allocUnsafe(f32.length * 2)
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.round(clamp(f32[i], -1, 1) * 32767), i * 2)
  return b
}

function wavHeader(dataBytes) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(dataBytes >= 0xffffffff - 36 ? 0xffffffff : 36 + dataBytes, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(2, 22)
  h.writeUInt32LE(SR, 24)
  h.writeUInt32LE(SR * 4, 28)
  h.writeUInt16LE(4, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(Math.min(dataBytes, 0xffffffff), 40)
  return h
}

// ---------------------------------------------------------------- running

function renderToFile() {
  const blocks = Math.ceil((renderSecs * SR) / BLOCK)
  const out = new Float32Array(BLOCK * 2)
  const parts = []
  let sumSq = 0
  let peak = 0
  const started = Date.now()
  let was = ''
  onBarMessage = o => {
    const is = `${ENERGY_NAMES[o.e]} ${o.mood} ${o.tempo}`
    if (ctl.wander && is !== was) console.log(`  bar ${String(o.bar).padStart(4)}  ${is}`)
    was = is
  }
  for (let b = 0; b < blocks; b++) {
    if (isSweep) {
      const e = Math.min(4, Math.floor((b / blocks) * 5))
      if (e !== ctl.energy) {
        ctl.energy = e
        ctl.rev++
      }
    }
    renderBlock(out)
    for (let i = 0; i < out.length; i++) {
      sumSq += out[i] * out[i]
      if (Math.abs(out[i]) > peak) peak = Math.abs(out[i])
      if (!Number.isFinite(out[i])) throw new Error(`non-finite sample at block ${b}`)
    }
    parts.push(toPcm(out))
  }
  const data = Buffer.concat(parts)
  fs.writeFileSync(renderOut, Buffer.concat([wavHeader(data.length), data]))
  const db = x => (20 * Math.log10(x)).toFixed(1)
  console.log(
    `rendered ${renderSecs}s in ${Date.now() - started}ms; bars ${bar}; ` +
      `peak ${db(peak)} dBFS, rms ${db(Math.sqrt(sumSq / (blocks * BLOCK * 2)))} dBFS, ` +
      `pre-clip peak ${peakPre.toFixed(2)}`,
  )
}

function say(o) {
  process.stdout.write(JSON.stringify(o) + '\n')
}

function play() {
  const ctlPath = path.join(os.tmpdir(), `drift-${process.pid}.json`)
  // an engine that was ended from outside leaves its control file behind
  for (const name of fs.readdirSync(os.tmpdir())) {
    const m = /^drift-(d+).json$/.exec(name)
    if (!m) continue
    try {
      process.kill(Number(m[1]), 0)
    } catch {
      try {
        fs.unlinkSync(path.join(os.tmpdir(), name))
      } catch {}
    }
  }
  fs.writeFileSync(ctlPath, JSON.stringify(ctl))
  const cleanup = () => {
    try {
      fs.unlinkSync(ctlPath)
    } catch {}
  }
  process.on('exit', cleanup)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0))

  const player = cp.spawn(
    'ffplay',
    ['-hide_banner', '-loglevel', 'error', '-nodisp', '-autoexit', '-fflags', 'nobuffer', '-probesize', '64', '-f', 'wav', '-i', 'pipe:0'],
    { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true },
  )
  player.on('error', () => {
    say({ t: 'err', msg: 'ffplay was not found on PATH (it comes with ffmpeg)' })
    process.exit(2)
  })
  player.on('exit', () => process.exit(0))
  player.stdin.on('error', () => process.exit(0))
  player.stdin.write(wavHeader(0xffffffff))
  say({ t: 'ctl', path: ctlPath })

  const LEAD = 0.22
  const out = new Float32Array(BLOCK * 2)
  let t0 = process.hrtime.bigint()
  let written = 0
  const elapsed = () => Number(process.hrtime.bigint() - t0) / 1e9
  // a message is held until its sound is about to leave the speakers
  const later = (o, atSample) => setTimeout(() => say(o), Math.max(0, (atSample / SR - elapsed() + 0.12) * 1000))
  onBarMessage = o => later(o, nextStepAt)
  onStepMessage = i => later({ t: 's', i }, nextStepAt)

  let quitAt = 0
  setInterval(() => {
    let target = (elapsed() + LEAD) * SR
    if (target - written > SR) {
      // the machine slept, or stalled: do not try to catch up
      t0 += BigInt(Math.round(((target - written) / SR) * 1e9))
      target = (elapsed() + LEAD) * SR
    }
    for (let n = 0; written < target && n < 64; n++) {
      renderBlock(out)
      player.stdin.write(toPcm(out))
      written += BLOCK
    }
    if (ctl.quit) {
      if (quitAt === 0) quitAt = Date.now()
      else if (Date.now() - quitAt > 1600) {
        player.stdin.end()
        setTimeout(() => process.exit(0), 300)
      }
    }
  }, 20)

  setInterval(() => {
    try {
      applyControl(JSON.parse(fs.readFileSync(ctlPath, 'utf8')))
    } catch {}
  }, 200)

  // never outlive whoever started us
  const parent = process.ppid
  setInterval(() => {
    try {
      process.kill(parent, 0)
    } catch {
      process.exit(0)
    }
  }, 3000)
}

parseArgs(process.argv.slice(2))
vol = ctl.volume
if (renderSecs > 0) renderToFile()
else play()
