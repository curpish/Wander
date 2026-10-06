# trail

A walk back into Python, as a conversation in the terminal. Over six stops
you build the options menu for a small cozy game, and at the end you get to
use it.

```
python trail/trail.py        open the map and carry on
python trail/trail.py 3      go straight to stop 3
```

There are three kinds of step:

- **At the prompt.** You type one line of Python, it runs, and the trail
  responds to what you typed. Anything else you type runs too, so it's a
  fine place to experiment.
- **A guess.** You're shown a line and guess what it gives before Python
  answers. A wrong guess costs nothing.
- **At the desk.** Functions are written in `desk.py`. Save the file and
  the terminal checks it straight away.

At any prompt, `hint` gives a nudge, `skip` shows one way to do it and moves
on, and `quit` leaves. Progress is saved after every step, including the
code you wrote, so later stops run on your own functions.

The steps are small on purpose, and each new idea is shown working before
you're asked to use it: first you read and run a finished example, then
change one thing in it, then fill a single blank, then write a whole body.

- `stops/` holds the lessons. Claude wrote them and can write more.
- `progress.json` and `desk.py` appear as you go. Delete both to start over.
