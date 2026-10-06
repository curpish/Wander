# drift

A tiny procedural music desk for the background: atmospheric downtempo and
microhouse, with a felt piano and a string pad woven into soft percussion.
Nothing is sampled or looped. Every sound is synthesized as it plays, so it
never quite repeats.

## Two halves

- `engine/drift.cjs` is the instrument. Plain Node, no dependencies. It makes
  the audio sample by sample and streams it to `ffplay` (part of ffmpeg).
- `hooks/register.tsx` is the desk: a Claude Code mod that opens a pane with
  controls and starts and steers the engine.

## Playing it

Inside Claude Code, with the mod loaded (`claude --plugin-dir drift` from this
repo):

- `/drift` opens the desk and starts the music
- `/drift stop` fades it out, `/drift hide` closes the pane and keeps playing
- `/drift fog` (or `dusk`, `ember`, `glass`) switches mood

Without Claude Code at all:

    node drift/engine/drift.cjs --mood fog --energy 1 --volume 0.4

Ctrl+C stops it. To write a file instead of playing:

    node drift/engine/drift.cjs --render 120 out.wav --mood ember --energy 3

## The controls

| control | what it does |
| --- | --- |
| mood | key, scale and tempo: `dusk` D dorian, `fog` F lydian, `ember` A minor, `glass` G mixolydian |
| energy | `still` (piano, strings, air) up through `breathe`, `pulse`, `flow` to `bloom` (everything) |
| tempo | 70 to 132 bpm |
| wander | lets the music move between energies by itself, and rarely moods (see below) |
| reroll all | a new seed: new chords, new piano motif, new rhythms, a new path for wander |
| 1-7 | mute a track: kick, bass, hats, perc, piano, strings, air |
| `-` `+` on a track | that track's own level, 0 to 150 (100 is where the mix was balanced) |
| `↻` on a track | reroll just that track and keep the rest |
| air color | tilts the air from `deep` (a low rumble) to `bright` (a hiss) |
| strings | crossfades the strings from `pad` (the synth) to `bowed` (the string model) |

What a track's own reroll changes:

- kick, bass, hats, perc: a new pattern
- piano: a new motif over the same chords
- strings: a new voicing (how the chord is spread and how low it sits) and how
  often the solo line appears
- air: how often it crackles and glints, and how slowly it breathes

Mood and reroll all land on the next chord change, so they can take a few
seconds. A track's own reroll lands on the next bar (strings on the next
chord).

## Wander

With wander on, the engine decides every eight bars what to do next:

- It picks an energy to head for, mostly in the middle (`breathe`, `pulse`,
  `flow`), sometimes `still` or `bloom`.
- It walks there one energy at a time, eight or sixteen bars a step, then
  stays for sixteen to thirty-two bars before picking again.
- Once it has settled somewhere quiet (`still` or `breathe`) and the mood has
  held for at least 96 bars, it may change mood instead. The tempo then slides
  to the new mood's, one bpm a bar. All four moods are modes of the same
  scale, so no note has to change.
- The piano keeps its motif across a shift and only thins or fills it.

The desk follows along: the energy row says where it is heading. Setting
energy, mood or tempo by hand takes effect at once, and wander carries on from
there after a short hold.

    node drift/engine/drift.cjs --wander 1

## How the music is put together

- Four chords, two bars each, drawn from the mood's scale. One of them is
  swapped now and then.
- The piano has a short motif it keeps coming back to, moved onto each chord
  and nudged a little every four bars.
- Percussion patterns are Euclidean rhythms that cycle through four variations
  over 32 bars, with an occasional four-bar breakdown before the loop turns.
- Everything runs through a ping-pong delay and a long reverb, and the kick
  gently ducks the pad and bass.

## The bowed strings

Each bowed note is a small physical model rather than a waveform. The string
is two delay lines, one either side of the bow. Every sample, the bow compares
its own speed with the string's and either grips it or lets it slip, and that
stick and slip is what makes the tone. The bridge end loses a little treble on
each pass, and three fixed resonances stand in for the wooden body.

Each chord tone gets its own string with its own vibrato and a slightly
different start, so it is closer to a quartet than a section. The solo line is
one more string, bowed a little harder. The synth pad still plays the same
notes underneath; the strings control sets the balance between the two.

## Left dangling

- The mix was balanced by measurement, not by ear. Levels live as `gain:`
  numbers in `onStep` inside the engine and are easy to nudge.
- The bowed strings are tuned by measurement (within 2 cents up to D6) but
  their character, the bow pressure, body resonances and level against the
  pad, was never set by ear. The numbers are in `bowVoice` and where `onBar`
  calls it.
- Windows only tested. The engine should run anywhere Node and ffplay do.
