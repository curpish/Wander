# Curiosity: design notes

A program that stirs curiosity. Still nebulous on purpose. This file holds
what we've settled and the questions worth answering first. More will come
up as we go.

Started 2026-10-07 from an open design discussion.

## Where we stand

- **The goal is stirring curiosity.** Recording and analysing are how the
  program would know whether it's working, not the point of it.
- **The log holds explicit facts only.** Even a person's words are just the
  words they chose to present. So the program never records a feeling; it
  records actions, and any feeling is an inference made afterwards.
- **A feeling is defined by what gets mistaken for it** and by its opposites.
- **Not a virality measure.** Virality scores content across a crowd by
  whether it spreads and pulls people back. This is about one person's state
  in one moment.
- **Built so far:** `log.py`, which records `start` and `resume` events.
  Its shape wasn't worked backward from the goal yet, and `item_id` has
  nothing real to point at.

## Working distinctions

- **Curiosity** is a state aimed at a specific gap. It ends when the gap
  closes, and it can be uncomfortable.
- **Interest** is a relationship with a subject over time. Knowing more
  feeds it.
- **Compulsion** looks like both from the outside: the person keeps coming
  back, but nothing was satisfied.

Kaelin confirmed interest and compulsion as look-alikes for curiosity
(2026-10-07). The list is open to more.

## Questions to start with

Kaelin's ordering: 1 comes first. 3 can't be answered confidently until 1
is, and more questions are expected to branch from there.

### Design

1. **Which facts would separate curiosity from its look-alikes?** What could
   the log hold that would read differently for curiosity, interest and
   compulsion? This decides what is worth recording.
2. **Where is inference allowed to happen?** Does the program ever conclude
   "this person is curious," or does it only keep facts for a person to read?

### Function

3. **What is an item?** What does the program actually put in front of
   someone? Until this has an answer, `item_id` stays empty.
4. **Whose gap is it?** Does the program pose the question, or does the
   person bring their own and the program works with it?

### Feel

5. **Is stopping a success?** If someone gets their answer and closes the
   program satisfied, did it work? Or should it hold people a little?
6. **A moment or a relationship?** Is it trying to stir curiosity now, or
   grow interest over time? This decides whether `resume` means anything.

## Next steps

**A two-persona review of these notes (Kaelin's idea, not yet run).** Spawn
two Opus agents at high effort, each with a different persona:

- one with a psychology background
- one a project manager with humanitarian-driven ethics

They discuss directly with each other:

- the validity of the design questions
- important facts about the design that may not have been considered
- suggestions for making the project substantially meaningful or insightful

How to run it:

1. **First takes alone.** Each reads this file and writes its own reading
   before seeing the other's, so neither sets the frame.
2. **Then a fixed discussion.** Three or four exchanges, then a close.
3. **No meeting in the middle.** They record where they still disagree and
   why, rather than smoothing it over.
4. **Each has something to protect.** The psychologist guards whether the
   thing being measured is really curiosity. The project manager guards who
   is affected and whether anyone is better off.
5. **Critique, not design.** They test the questions and raise what's
   missing. They don't answer the questions or propose the program.
6. **Psychology claims are leads.** Each is marked established, contested
   or the agent's own speculation, to be checked later.

What they document along the way:

- **Psychologist:** a running list of claims with source and confidence.
- **Project manager:** a running list of concerns and trade-offs: who is
  affected, what could go wrong, what would make it worthwhile.
- **Jointly at the end:** one short page of what they agreed on, what they
  didn't, and new questions.

Each writes to its own file in `projects/curiosity/review/` and neither
edits this one. They don't see the reading list below, so the psychologist
brings its own sources.

## Worth reading

From memory, so check before relying on any of it.

- Loewenstein (1994), the information-gap theory of curiosity
- Berlyne, on novelty, complexity and uncertainty having a sweet spot
- Kang et al. (2009), curiosity peaking at moderate confidence
- Hidi and Renninger, the four-phase model of interest
- Litman, I-type and D-type curiosity
- Oudeyer's group, Kidlearn/ZPDES: tutoring driven by learning progress
- Lydon-Staley, Bassett et al. (2021), "Hunters, busybodies and dancers":
  curiosity styles inferred from Wikipedia browsing paths
