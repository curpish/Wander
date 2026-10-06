import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DriftSettings, Mood, Now, Track } from '../types'

const PANE = 'drift'
const MOODS: readonly { name: Mood; bpm: number }[] = [
  { name: 'dusk', bpm: 108 },
  { name: 'fog', bpm: 96 },
  { name: 'ember', bpm: 114 },
  { name: 'glass', bpm: 120 },
]
const TRACKS: readonly Track[] = ['kick', 'bass', 'hats', 'perc', 'piano', 'strings', 'air']
const ENERGY = ['still', 'breathe', 'pulse', 'flow', 'bloom']
const COLORS = ['deep', 'warm', 'soft', 'clear', 'bright']
const BOWS = ['pad', 'mostly pad', 'blend', 'mostly bowed', 'bowed']
// the energy a track first plays at; the others play at every energy
const JOINS: Partial<Record<Track, number>> = { kick: 2, bass: 2, hats: 1, perc: 1 }
// The engine's own balance, as numbered here: bumped when its built-in gains
// change, so faders set against an older balance are not applied twice.
const MIX = 2
const EMPTY_ROW = '·'.repeat(16)

const perTrack = (value: (track: Track) => number) =>
  Object.fromEntries(TRACKS.map(t => [t, value(t)])) as Record<Track, number>

const DEFAULTS: DriftSettings = {
  volume: 0.5,
  tempo: 108,
  energy: 2,
  mood: 'dusk',
  seed: 1,
  mute: [],
  levels: perTrack(() => 1),
  mix: MIX,
  seeds: perTrack(() => 0),
  color: 0.5,
  bow: 0.7,
  wander: true,
  journey: true,
}

const settings = atom({ plugin: 'drift', key: 'settings' } as const, DEFAULTS)
const playing = atom({ plugin: 'drift', key: 'isPlaying' } as const, false)
const now = atom({ plugin: 'drift', key: 'now' } as const, null)
const step = atom({ plugin: 'drift', key: 'step' } as const, 0)

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const tenths = (x: number) => Math.round(x * 10) / 10
const reseed = (seed: number) => (seed * 31 + 17) % 100000

// What is held may be from an older version of this mod (the store's, or the
// session's own across a reload), or hand-edited: every read goes through here.
const sanitize = (saved: unknown): DriftSettings => {
  const o = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<DriftSettings>
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const levels: Partial<Record<Track, unknown>> = typeof o.levels === 'object' && o.levels !== null ? o.levels : {}
  const seeds: Partial<Record<Track, unknown>> = typeof o.seeds === 'object' && o.seeds !== null ? o.seeds : {}

  return {
    volume: clamp(num(o.volume, DEFAULTS.volume), 0, 1),
    tempo: clamp(Math.round(num(o.tempo, DEFAULTS.tempo)), 70, 132),
    energy: clamp(Math.round(num(o.energy, DEFAULTS.energy)), 0, 4),
    mood: MOODS.some(m => m.name === o.mood) ? (o.mood as Mood) : DEFAULTS.mood,
    seed: Math.abs(Math.round(num(o.seed, DEFAULTS.seed))) % 100000,
    mute: Array.isArray(o.mute) ? TRACKS.filter(t => (o.mute as unknown[]).includes(t)) : [],
    levels: perTrack(t => (o.mix === MIX ? clamp(tenths(num(levels[t], 1)), 0, 1.5) : 1)),
    mix: MIX,
    seeds: perTrack(t => Math.abs(Math.round(num(seeds[t], 0))) % 100000),
    color: clamp(tenths(num(o.color, DEFAULTS.color)), 0, 1),
    bow: clamp(tenths(num(o.bow, DEFAULTS.bow)), 0, 1),
    wander: typeof o.wander === 'boolean' ? o.wander : DEFAULTS.wander,
    journey: typeof o.journey === 'boolean' ? o.journey : DEFAULTS.journey,
  }
}

type Engine = ReturnType<EngineInterface['process']['spawn']>

// the engine process, and the file it re-reads its settings from
let child: Engine | null = null
let ctlPath: string | null = null
// Bumped when the person sets energy, mood or tempo: the engine takes those
// three from the controls only then, and otherwise goes its own way.
let rev = 0
let steeredAt = Number.NEGATIVE_INFINITY

const push = async ($: EngineInterface, isQuit = false) => {
  const s = sanitize(await read($, settings))
  if (ctlPath !== null) {
    await $.fs.write(ctlPath, JSON.stringify({ ...s, rev, quit: isQuit }))
  }
  if (!isQuit) {
    await $.store.set('settings', s)
  }
}

type Message = {
  t?: string
  path?: string
  msg?: string
  i?: number
  bar?: number
  chord?: string
  sec?: string
  rows?: Record<string, string>
  e?: number
  mood?: string
  tempo?: number
  to?: number
  place?: string
  key?: string
  kind?: string
  next?: string
  arrived?: boolean
}

// Somewhere the journey passes through once is made on the spot and never
// made again: the diary is the only place it is kept.
const remember = async ($: EngineInterface, name: string, key: string) => {
  const held = await $.store.get('diary')
  const day = new Date(await $.clock.now()).toISOString().slice(0, 10)
  await $.store.set('diary', [...(Array.isArray(held) ? held : []), { name, key, day }].slice(-200))
}

// A wandering engine says each bar where it has got to; the desk's own
// settings follow, so its controls start from what is playing.
const follow = async ($: EngineInterface, msg: Message) => {
  const s = sanitize(await read($, settings))
  const heard = sanitize({ ...s, energy: msg.e ?? s.energy, mood: msg.mood ?? s.mood, tempo: msg.tempo ?? s.tempo })
  if (heard.energy === s.energy && heard.mood === s.mood && heard.tempo === s.tempo) {
    return
  }
  // a bar that was already on its way when the person steered is out of date
  if ((await $.clock.now()) - steeredAt < 1500) {
    return
  }
  const next = await update($, settings, old => ({
    ...sanitize(old),
    energy: heard.energy,
    mood: heard.mood,
    tempo: heard.tempo,
  }))
  await $.store.set('settings', next)
}

const onLine = async ($: EngineInterface, line: string) => {
  let msg: Message
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }

  if (msg.t === 's' && typeof msg.i === 'number') {
    const i = msg.i
    await update($, step, () => i)
  } else if (msg.t === 'bar') {
    const bar: Now = {
      bar: msg.bar ?? 0,
      chord: msg.chord ?? '',
      section: msg.sec ?? '',
      rows: msg.rows ?? {},
      to: msg.to,
      place: msg.place,
      key: msg.key,
      kind: msg.kind,
      next: msg.next,
    }
    await update($, now, () => bar)
    await follow($, msg)
    if (msg.arrived === true && msg.kind === 'once' && msg.place !== undefined) {
      await remember($, msg.place, msg.key ?? '')
    }
    if (!(await read($, playing))) {
      await update($, playing, () => true)
    }
    $.ui.status(`♪ drift · ${bar.chord} · ${bar.section}`)
  } else if (msg.t === 'ctl' && typeof msg.path === 'string') {
    ctlPath = msg.path
    await push($)
  } else if (msg.t === 'err') {
    $.ui.toast(`drift: ${msg.msg ?? 'the engine stopped'}`, { timeoutMs: 8000 })
  }
}

const start = async ($: EngineInterface) => {
  if (child !== null) {
    return
  }
  const s = sanitize(await read($, settings))
  const argv = [
    'node',
    `${$.plugin.root}/engine/drift.cjs`,
    '--volume',
    String(s.volume),
    '--tempo',
    String(s.tempo),
    '--energy',
    String(s.energy),
    '--mood',
    s.mood,
    '--seed',
    String(s.seed),
    '--mute',
    s.mute.join(',') || 'none',
    '--levels',
    TRACKS.map(t => s.levels[t]).join(','),
    '--seeds',
    TRACKS.map(t => s.seeds[t]).join(','),
    '--color',
    String(s.color),
    '--bow',
    String(s.bow),
    '--wander',
    s.wander ? '1' : '0',
    '--journey',
    s.journey ? '1' : '0',
  ]
  const stream = $.process.spawn({ argv })
  child = stream
  await update($, playing, () => true)

  // the loop is the child's life: it runs on after this hook has returned
  void (async () => {
    let pending = ''
    try {
      for await (const chunk of stream) {
        if (chunk.stream !== 'stdout') {
          continue
        }
        pending += chunk.text
        for (let nl = pending.indexOf('\n'); nl >= 0; nl = pending.indexOf('\n')) {
          const line = pending.slice(0, nl).trim()
          pending = pending.slice(nl + 1)
          if (line !== '') {
            await onLine($, line)
          }
        }
      }
    } catch (error) {
      $.ui.toast(`drift could not play: ${String(error)}`, { timeoutMs: 8000 })
    } finally {
      if (child === stream) {
        child = null
        ctlPath = null
        $.ui.status(undefined)
        await update($, playing, () => false).catch(() => undefined)
      }
    }
  })()
}

const stop = async ($: EngineInterface) => {
  const stream = child
  if (stream === null) {
    await update($, playing, () => false)

    return
  }
  const kill = () => {
    if (child === stream) {
      void stream.return({ code: null, signal: null }).catch(() => undefined)
    }
  }
  if (ctlPath === null) {
    kill()

    return
  }
  // ask for a fade first; end it by hand only if it lingers
  await push($, true)
  $.clock.after(3000, kill)
}

const change = ($: EngineInterface, fn: (s: DriftSettings) => DriftSettings, isSteer = false) => async () => {
  if (isSteer) {
    rev += 1
    steeredAt = await $.clock.now()
  }
  await update($, settings, old => fn(sanitize(old)))
  await push($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'drift',
      description: 'Background music: open the drift desk and play (also: stop, hide, diary, or a mood)',
    })
    const held = await $.state.get({ plugin: 'drift', key: 'settings' } as const)
    if (held.version === 0) {
      const saved = await $.store.get('settings')
      if (saved !== undefined) {
        await update($, settings, () => sanitize(saved))
      }
    }
    const started = await next(e)
    // a reload of this module ended the engine with it: pick the music back up
    if (await read($, playing)) {
      await start($)
    }

    return started
  })

  on('session.end', async ($, e, next) => {
    void child?.return({ code: null, signal: null }).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'drift' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'stop') {
      await stop($)

      return { text: 'drift is fading out.' }
    }
    if (arg === 'hide' || arg === 'close') {
      await $.ui.close({ id: PANE })

      return { text: 'drift desk closed; the music carries on. /drift brings it back.' }
    }
    if (arg === 'diary') {
      const held = await $.store.get('diary')
      const seen = (Array.isArray(held) ? held : []) as { name?: unknown; key?: unknown; day?: unknown }[]
      if (seen.length === 0) {
        return { text: 'The diary is empty: the journey has not yet passed through anywhere it will not see again.' }
      }
      const lines = seen.slice(-20).map(p => `  ${String(p.day)}  ${String(p.name)} (${String(p.key)})`)

      return { text: `Places drift passed through once (${seen.length}):\n${lines.join('\n')}` }
    }
    const mood = MOODS.find(m => m.name === arg)
    if (arg !== '' && arg !== 'play' && mood === undefined) {
      return { text: `drift does not know "${arg}". Try /drift, /drift stop, /drift hide, /drift diary, or a mood: ${MOODS.map(m => m.name).join(', ')}.` }
    }
    if (mood !== undefined) {
      await change($, s => ({ ...s, mood: mood.name, tempo: mood.bpm }), true)()
    }
    await $.ui.open({ id: PANE, title: 'drift' })
    await start($)

    return { text: 'drift is playing. The desk is open; /drift stop fades it out.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = sanitize(await read($, settings))
    const isOn = await read($, playing)
    const bar = await read($, now)
    const at = await read($, step)

    const nudge = (key: 'volume' | 'tempo' | 'energy' | 'color' | 'bow', by: number, lo: number, hi: number) =>
      change(
        $,
        old => ({ ...old, [key]: clamp(Math.round((old[key] + by) * 100) / 100, lo, hi) }),
        key === 'energy' || key === 'tempo',
      )
    const fade = (track: Track, by: number) =>
      change($, old => ({ ...old, levels: { ...old.levels, [track]: clamp(tenths(old.levels[track] + by), 0, 1.5) } }))
    const volumeBars = Math.round(s.volume * 10)
    const heading = bar?.to
    const colorBars = Math.round(s.color * 10)
    const bowBars = Math.round(s.bow * 10)

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>drift </Text>
          <Text dimColor>
            {isOn && bar !== null ? `${bar.chord} · bar ${bar.bar + 1} · ${bar.section}` : isOn ? 'warming up' : 'quiet'}
          </Text>
        </Box>
        {isOn && bar !== null && bar.place !== undefined && (
          <Text dimColor>
            at {bar.place} {'\u00b7'} {bar.key ?? ''}
            {bar.kind === 'once' ? ', seen only this once' : ''}
            {bar.next !== undefined ? `, leaving for ${bar.next}` : ''}
          </Text>
        )}
        <Box columnGap={1} marginBottom={1} flexWrap="wrap">
          <Button
            key="play"
            hotkey="p"
            variant="primary"
            label={isOn ? 'stop' : 'play'}
            onPress={() => (isOn ? stop($) : start($))}
          />
          <Button key="reroll" hotkey="r" label="reroll all" onPress={change($, old => ({ ...old, seed: reseed(old.seed) }))} />
          <Button
            key="wander"
            hotkey="w"
            label={s.wander ? 'wander: on' : 'wander: off'}
            dimColor={!s.wander}
            onPress={change($, old => ({ ...old, wander: !old.wander }))}
          />
          <Button
            key="journey"
            hotkey="j"
            label={s.journey ? 'journey: on' : 'journey: off'}
            dimColor={!s.journey}
            onPress={change($, old => ({ ...old, journey: !old.journey }))}
          />
        </Box>
        <Box columnGap={1} flexWrap="wrap">
          {MOODS.map(m => (
            <Button
              key={`mood-${m.name}`}
              label={m.name}
              variant={m.name === s.mood ? 'primary' : 'secondary'}
              onPress={change($, old => ({ ...old, mood: m.name, tempo: m.bpm }), true)}
            />
          ))}
        </Box>
        <Box columnGap={1}>
          <Button key="energy-down" label="-" onPress={nudge('energy', -1, 0, 4)} />
          <Button key="energy-up" label="+" onPress={nudge('energy', 1, 0, 4)} />
          <Text>
            {'●'.repeat(s.energy + 1) + '○'.repeat(4 - s.energy)} {ENERGY[s.energy] ?? ''} energy
            {s.wander && isOn && heading !== undefined && heading !== s.energy ? `, heading for ${ENERGY[heading] ?? ''}` : ''}
          </Text>
        </Box>
        <Box columnGap={1}>
          <Button key="tempo-down" label="-" onPress={nudge('tempo', -2, 70, 132)} />
          <Button key="tempo-up" label="+" onPress={nudge('tempo', 2, 70, 132)} />
          <Text>{s.tempo} bpm</Text>
        </Box>
        <Box columnGap={1} marginBottom={1}>
          <Button key="volume-down" label="-" onPress={nudge('volume', -0.1, 0, 1)} />
          <Button key="volume-up" label="+" onPress={nudge('volume', 0.1, 0, 1)} />
          <Text>
            {'▮'.repeat(volumeBars) + '▯'.repeat(10 - volumeBars)} vol
          </Text>
        </Box>
        {TRACKS.map((track, i) => {
          const isMuted = s.mute.includes(track)
          const isSilent = isMuted || s.levels[track] === 0
          // a track the energy has not brought in yet says when it will come
          const joins = JOINS[track] ?? 0
          const isResting = s.energy < joins
          const row = isResting
            ? `joins at ${ENERGY[joins] ?? ''}`.padEnd(16)
            : ((isOn ? bar?.rows[track] : undefined) ?? EMPTY_ROW)
          const head = isOn && bar !== null && !isResting ? at : -1

          return (
            <Box flexWrap="wrap">
              <Button
                key={`mute-${track}`}
                plain
                hotkey={String(i + 1)}
                label={track.padEnd(8)}
                dimColor={isMuted}
                onPress={change($, old => ({
                  ...old,
                  mute: old.mute.includes(track) ? old.mute.filter(t => t !== track) : [...old.mute, track],
                }))}
              />
              <Text dimColor={isSilent || isResting || !isOn}>{head < 0 ? row : row.slice(0, head)}</Text>
              <Text inverse>{head < 0 ? '' : row.slice(head, head + 1)}</Text>
              <Text dimColor={isSilent}>{head < 0 ? '' : row.slice(head + 1)}</Text>
              <Box columnGap={1} marginLeft={1}>
                <Button key={`level-down-${track}`} plain label="-" onPress={fade(track, -0.1)} />
                <Text dimColor={isSilent}>{String(Math.round(s.levels[track] * 100)).padStart(3)}</Text>
                <Button key={`level-up-${track}`} plain label="+" onPress={fade(track, 0.1)} />
                <Button
                  key={`roll-${track}`}
                  plain
                  dimColor
                  label={'↻'}
                  onPress={change($, old => ({
                    ...old,
                    seeds: { ...old.seeds, [track]: reseed(old.seeds[track] + i) },
                  }))}
                />
              </Box>
            </Box>
          )
        })}
        <Box columnGap={1} marginTop={1}>
          <Text dimColor>air color</Text>
          <Button key="color-down" label="-" onPress={nudge('color', -0.1, 0, 1)} />
          <Button key="color-up" label="+" onPress={nudge('color', 0.1, 0, 1)} />
          <Text>
            {'▮'.repeat(colorBars) + '▯'.repeat(10 - colorBars)} {COLORS[Math.min(4, Math.floor(s.color * 5))] ?? ''}
          </Text>
        </Box>
        <Box columnGap={1}>
          <Text dimColor>strings  </Text>
          <Button key="bow-down" label="-" onPress={nudge('bow', -0.1, 0, 1)} />
          <Button key="bow-up" label="+" onPress={nudge('bow', 0.1, 0, 1)} />
          <Text>
            {'\u25ae'.repeat(bowBars) + '\u25af'.repeat(10 - bowBars)} {BOWS[Math.min(4, Math.floor(s.bow * 5))] ?? ''}
          </Text>
        </Box>
        <Text dimColor>p play/stop · r reroll all · w wander · j journey · 1-7 mute</Text>
        <Text dimColor>per track: - + level · {'↻'} reroll just that one</Text>
      </Box>
    )
  })
}
