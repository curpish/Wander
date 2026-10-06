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
| tempo | `-` `+`, or click the bpm field, type a number and press Enter |
| bpm range | a typed minimum and maximum (60 to 160). The tempo stays inside it, and the moods are spread across it: fog at the bottom, then dusk, ember, and glass at the top |
| wander | lets the music move between energies by itself, and rarely moods (see below) |
| journey | lets the harmony travel between keys and come home (see below) |
| reroll all | a new seed: new chords, new piano motif, new rhythms, a new path for wander |
| 1-7 | mute a track: kick, bass, hats, perc, piano, strings, air |
| `-` `+` on a track | that track's own level, 0 to 150 (100 is where the mix was balanced) |
| `↻` on a track | reroll just that track and keep the rest |
| air color | tilts the air from `deep` (a low rumble) to `bright` (a hiss) |
| haze | how far the ambience may swell; shows what the air is doing now |
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

## The journey

With journey on, the harmony travels. A place is a key and a mode with four
chords of its own, and there are three kinds:

- **Home** is the mood's own key. The journey always comes back to it and
  stays longest there.
- **Stops** are three named places near home: one a fifth up, one a fifth
  down, and one either further out or on home's own notes seen from another
  side. They are the same three each time (until a reroll or a new mood), so
  they grow familiar.
- **Places seen once** are far-off keys made on the spot, stayed in for a
  couple of sections, and never made again. They come up roughly every ten
  minutes at most. `/drift diary` lists the ones you have passed through.

The move happens two bars before a section starts, on a pivot chord: the chord
of the new place that shares the most notes with the old one. Crossing to or
from somewhere far, the kick and bass drop out for those two bars.

The desk shows where you are, its key, and where it is leaving for once that
is decided. Turning journey off brings the harmony home at the next section.

    node drift/engine/drift.cjs --journey 1 --wander 1

## The mix in motion

Three things move the mix.

**It balances itself.** Loudness is evened out across the energies (they span
about 2 LU now; it was 5), a soft bus compressor holds the tracks together
(about 2 dB of squeeze at `flow` and `bloom`, none at `still`), the strings'
low end steps back while the bass is sounding, and the kick ducks harder as
the energy rises.

**The effects follow the form.** The pad filter follows the energy over a
couple of bars instead of jumping. Now and then the last note of a piano
phrase is thrown into the delay. On a far crossing the reverb swells and the
dry sound dips.

**Every place has its own room.** Reverb length and darkness, delay time and
feedback, and a little saturation belong to the place, and the sound slides
from one room to the next. Home's room is always the same. Somewhere seen once
is an extreme: a bare, close room, or a vast one.

Over all of it lies the **haze**: how far the ambience has swollen. In haze
the reverb is longer and louder, the echoes repeat more and drift in pitch,
and the strings and echoes pass through a slow phaser. It leans a new way
every eight bars. Now and then it gathers for a section and is then gone for
the next, and coming home usually clears it. A clearing is dry and close on
purpose: in one measured passage, deep haze to a clearing dropped the stereo
ambience by 10 dB while the centre of the mix stayed within 1 dB.

The `haze` control sets how far it may go (0 keeps every moment clean), and
shows what the air is doing now: clear, open, hazy or deep.

    node drift/engine/drift.cjs --render 600 out.wav --journey 1 --weather

prints the timeline of places and haze as it renders.

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
