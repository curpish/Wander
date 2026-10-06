import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'drift',
  component: 'Pane',
  requestId: 'drift',
  props: {
    title: 'drift',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const BAR = {
  t: 'bar',
  bar: 4,
  chord: 'Dm7',
  sec: 'pulse a',
  rows: { kick: '●·······●·······' },
}

type Desk = {
  clock: MockClock
  spawned: (readonly string[])[]
  /** The settings last written to the engine's control file. */
  sent: () => Record<string, any>
  path: () => string | undefined
}

// Stands in for the engine: says where its control file is, plays one bar,
// and then, like the real one, does not exit. Each act waits a while on that
// pending work, and a held hook is let go after ten seconds of real time, so
// every test below keeps to a handful of acts.
const openDesk = async ($: Engine, on: On, bar: object = BAR): Promise<Desk> => {
  const clock = mock.clock(on)
  mock.store(on)
  const writes: { path: string; text: string }[] = []
  const spawned: (readonly string[])[] = []
  on('fs.write', (_$, e) => {
    writes.push(e)

    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.spawn', async function* (_$, e) {
    spawned.push(e.argv)
    yield { stream: 'stdout', text: `${JSON.stringify({ t: 'ctl', path: '/tmp/drift.json' })}\n` }
    yield { stream: 'stdout', text: `${JSON.stringify(bar)}\n{"t":"s","i":8}\n` }
    await clock.sleep(60_000)

    return { value: { code: 0, signal: null } }
  })

  const ran = await $.command.run({ command: 'drift', args: '' } as Parameters<typeof $.command.run>[0])
  expect(ran.text).toContain('playing')
  await clock.settle()

  return {
    clock,
    spawned,
    sent: () => JSON.parse(writes.at(-1)?.text ?? '{}'),
    path: () => writes.at(-1)?.path,
  }
}

test('the desk starts the engine and follows it on every surface', { timeoutMs: 20_000 }, async ($, on) => {
  const desk = await openDesk($, on)
  expect(desk.spawned[0]?.[0]).toBe('node')
  expect(desk.spawned[0]?.[1]).toContain('engine/drift.cjs')
  expect(desk.spawned[0]).toContain('--levels')
  expect(desk.path()).toContain('drift.json')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Dm7 . bar 5 . pulse a/ })).toBeDefined()
    expect((await ui.find({ key: 'play' }))?.props.label).toBe('stop')
    expect(await ui.find({ key: 'roll-air' })).toBeDefined()
    expect(await ui.find({ key: 'color-up' })).toBeDefined()
    await ui.unmount()
  }
})

test('mood, mute and stop reach the engine', { timeoutMs: 20_000 }, async ($, on) => {
  const desk = await openDesk($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'mood-fog' })
  expect(desk.sent().mood).toBe('fog')
  expect(desk.sent().tempo).toBe(96)
  expect(desk.sent().quit).toBe(false)
  expect(await ui.find({ type: 'Text', text: /96 bpm/ })).toBeDefined()

  await ui.press({ key: 'mute-kick' })
  expect(desk.sent().mute).toEqual(['kick'])

  await ui.press({ key: 'play' })
  expect(desk.sent().quit).toBe(true)
})

test("a track's own fader and reroll leave the other tracks alone", { timeoutMs: 20_000 }, async ($, on) => {
  const desk = await openDesk($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const held = desk.sent()

  await ui.press({ key: 'level-down-kick' })
  await ui.press({ key: 'roll-piano' })
  await ui.press({ key: 'color-up' })
  const next = desk.sent()

  expect(Math.round((held.levels.kick - next.levels.kick) * 10)).toBe(1)
  expect(next.levels.piano).toBe(held.levels.piano)
  expect(next.seeds.piano).not.toBe(held.seeds.piano)
  expect(next.seeds.kick).toBe(held.seeds.kick)
  expect(next.seed).toBe(held.seed)
  expect(Math.round((next.color - held.color) * 10)).toBe(1)

  await ui.press({ key: 'bow-down' })
  expect(Math.round((held.bow - desk.sent().bow) * 10)).toBe(1)
  expect(await ui.find({ type: 'Text', text: / 90/ })).toBeDefined()
})

test('the desk follows a wandering engine, and wander can be switched off', { timeoutMs: 20_000 }, async ($, on) => {
  // the engine has moved on by itself: flow, in ember, on its way to bloom
  const desk = await openDesk($, on, { ...BAR, e: 3, mood: 'ember', tempo: 114, to: 4 })
  expect(desk.spawned[0]).toContain('--wander')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /flow energy, heading for bloom/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /114 bpm/ })).toBeDefined()
  expect((await ui.find({ key: 'mood-ember' }))?.props.variant).toBe('primary')

  await ui.press({ key: 'wander' })
  expect(desk.sent().wander).toBe(false)
  // following is not steering: what the engine was told has not moved
  expect(desk.sent().rev).toBe(0)

  await ui.press({ key: 'energy-up' })
  expect(desk.sent().energy).toBe(4)
  expect(desk.sent().rev).toBe(1)
})
