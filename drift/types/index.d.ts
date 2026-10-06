export type Mood = 'dusk' | 'fog' | 'ember' | 'glass'

export type Track = 'kick' | 'bass' | 'hats' | 'perc' | 'piano' | 'strings' | 'air'

// not `Settings`: inside the augmentation below that name is claude-code's own
export type DriftSettings = {
  volume: number
  tempo: number
  energy: number
  mood: Mood
  seed: number
  mute: Track[]
  /** Each track's own fader: 0 to 1.5, 1 where the mix was balanced. */
  levels: Record<Track, number>
  /** Which balance `levels` are relative to; an older one resets them to 1. */
  mix: number
  /** Each track's own reroll, on top of `seed`. */
  seeds: Record<Track, number>
  /** The air's color: 0 a low rumble, 1 a bright hiss. */
  color: number
  /** The strings: 0 the synth pad, 1 bowed strings, between a blend. */
  bow: number
  /** The engine moves between energies by itself, and rarely moods. */
  wander: boolean
  /** The harmony travels: leaves home, stops in other keys, comes back. */
  journey: boolean
}

export type Now = {
  bar: number
  chord: string
  section: string
  rows: Record<string, string>
  /** Where a wandering engine is heading: an energy, the current one once there. */
  to?: number
  /** Where the harmony is: the place's name, its key, and what kind of place. */
  place?: string
  key?: string
  kind?: string
  /** Where it is about to go, once that is decided. */
  next?: string
}

declare module 'claude-code' {
  interface PluginState {
    drift: {
      settings: DriftSettings
      isPlaying: boolean
      now: Now | null
      step: number
    }
  }
}
