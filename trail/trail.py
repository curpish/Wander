"""trail: a walk back into Python, one small step at a time.

    python trail/trail.py        open the map and carry on
    python trail/trail.py 3      go straight to stop 3

It's a conversation. Most steps happen at a live Python prompt: you type a
line, Python answers, and the trail reacts to what you typed. Functions get
written in desk.py, which is checked the moment you save it.

At any prompt:  hint   skip   quit
"""

import ast
import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import textwrap
import time
from pathlib import Path

try:
    import msvcrt
except ImportError:
    msvcrt = None

sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
STOPS = HERE / "stops"
DESK = HERE / "desk.py"
PROGRESS = HERE / "progress.json"

# Named by how many stops are behind you.
RANKS = ["at the trailhead", "stretching your legs", "finding a stride",
         "well into the woods", "sure-footed", "above the treeline", "at the summit"]

TTY = sys.stdin.isatty() and sys.stdout.isatty()
LIVE = TTY and msvcrt is not None    # can watch the desk and the keyboard at once
COLOR = sys.stdout.isatty() and "NO_COLOR" not in os.environ
if COLOR:
    os.system("")  # wakes up colour support in older Windows consoles


class Quit(Exception):
    pass


# ---------------------------------------------------------------- printing

def paint(code, text):
    return f"\033[{code}m{text}\033[0m" if COLOR else text


def green(text): return paint("32", text)
def red(text): return paint("31", text)
def yellow(text): return paint("33", text)
def cyan(text): return paint("36", text)
def dim(text): return paint("2", text)
def bold(text): return paint("1", text)


def inline(line):
    """`code` inside a sentence comes out coloured, without the backticks."""
    pieces = line.split("`")
    return "".join(cyan(p) if i % 2 else p for i, p in enumerate(pieces))


def show(text):
    """Print a block of lesson text. Lines indented four or more are code."""
    if not text:
        return
    for line in textwrap.dedent(text).strip("\n").splitlines():
        if line.startswith("    "):
            print("  " + cyan(line))
        else:
            print("  " + inline(line))
    print()


def clean(text):
    return textwrap.dedent(text).strip("\n")


def shown(path):
    try:
        return os.path.relpath(path).replace("\\", "/")
    except ValueError:
        return str(path)


def me():
    return "python " + shown(HERE / "trail.py")


def short(value):
    text = repr(value)
    return text if len(text) <= 150 else text[:147] + "..."


def ask(prompt):
    try:
        return input(prompt)
    except (EOFError, KeyboardInterrupt):
        print()
        raise Quit


# ---------------------------------------------------------------- stops and progress

def load_stops():
    stops = []
    for path in sorted(STOPS.glob("s[0-9]_*.py")):
        spec = importlib.util.spec_from_file_location(path.stem, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.KEY = path.stem[1]
        stops.append(module)
    return stops


def read_progress():
    try:
        progress = json.loads(PROGRESS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        progress = {}
    progress.setdefault("stops", {})
    return progress


def write_progress(progress):
    PROGRESS.write_text(json.dumps(progress, indent=2) + "\n", encoding="utf-8")


def entry_for(progress, stop):
    entry = progress["stops"].setdefault(stop.KEY, {})
    entry.setdefault("step", 0)
    entry.setdefault("inputs", {})
    entry.setdefault("xp", {})
    return entry


def total_xp(progress):
    return sum(sum(e.get("xp", {}).values()) for e in progress["stops"].values())


# ---------------------------------------------------------------- running what's typed

class Typed:
    """One line the learner typed, and what Python made of it."""

    def __init__(self, ns, source):
        self.ns = ns
        self.source = source
        self.value = None
        self.error = None
        self.out = ""


def run_line(source, ns):
    typed = Typed(ns, source)
    buffer = io.StringIO()
    try:
        try:
            code, is_expression = compile(source, "<you>", "eval"), True
        except SyntaxError:
            code, is_expression = compile(source, "<you>", "exec"), False
        with contextlib.redirect_stdout(buffer):
            if is_expression:
                typed.value = eval(code, ns)
            else:
                exec(code, ns)
    except Exception as exc:
        typed.error = exc
    typed.out = buffer.getvalue()
    return typed


def quiet_run(source, ns):
    if source:
        run_line(textwrap.dedent(source).strip("\n"), ns)


PLAIN_ERRORS = {
    NameError: "Python met a name it hasn't been told about. If you meant text, it needs quotes.",
    SyntaxError: "Python couldn't read that line. A missing quote or bracket is the usual cause.",
    TypeError: "Those two kinds of thing don't work together that way.",
    KeyError: "That name isn't in the dict.",
    IndexError: "The list isn't that long.",
    ZeroDivisionError: "Dividing by zero has no answer.",
    AttributeError: "That kind of thing doesn't have the part after the dot.",
}


def echo(typed):
    """Show what a line did, the way a Python prompt would."""
    if typed.out:
        for line in typed.out.rstrip("\n").splitlines():
            print("  " + line)
    if typed.error is not None:
        exc = typed.error
        message = exc.msg if isinstance(exc, SyntaxError) else str(exc)
        print("  " + red(f"{type(exc).__name__}: {message}"))
    elif typed.value is not None:
        print("  " + short(typed.value))
    elif not typed.out:
        print(dim("  (done; nothing to show)"))


def judge(step, typed):
    """True if the line does what the step asked; otherwise a nudge, or None."""
    try:
        if step["check"](typed) is True:
            return True
        for applies, note in step.get("notes", []):
            if applies(typed):
                return note
    except Exception:
        pass
    if typed.error is not None:
        return PLAIN_ERRORS.get(type(typed.error))
    return None


def namespace_for(stops, index, upto, progress):
    """Rebuild everything defined before a step: earlier stops' functions,
    then this stop's lines so far, using what the learner typed where we
    have it and the reference answer where we don't."""
    ns = {}
    for earlier in stops[:index]:
        saved = progress["stops"].get(earlier.KEY, {}).get("inputs", {})
        for i, step in enumerate(earlier.STEPS):
            if step["kind"] == "desk":
                quiet_run(step["answer"], ns)
                quiet_run(saved.get(str(i)), ns)
    stop = stops[index]
    saved = entry_for(progress, stop)["inputs"]
    for i, step in enumerate(stop.STEPS[:upto]):
        quiet_run(step.get("setup"), ns)
        if step["kind"] in ("write", "desk"):
            quiet_run(saved.get(str(i)) or step["answer"], ns)
    return ns


# ---------------------------------------------------------------- a step at the prompt

def next_hint(step, used):
    hints = step.get("hints", [])
    if not hints:
        print("  No hint written for this one. `skip` shows the answer.\n")
        return used
    used = min(used + 1, len(hints))
    print(f"  {dim(f'hint {used} of {len(hints)}:')} {inline(hints[used - 1])}\n")
    return used


def run_write(step, ns, **_):
    show(step["text"])
    used = misses = 0
    while True:
        raw = ask(cyan("  >>> ")).strip()
        if not raw:
            continue
        word = raw.lower()
        if word in ("quit", "exit", "q"):
            raise Quit
        if word in ("hint", "h", "?"):
            used = next_hint(step, used)
            continue
        if word in ("skip", "s"):
            print(f"  One way to do it:\n\n  {cyan('    ' + step['answer'])}\n")
            echo(run_line(step["answer"], ns))
            print()
            return 0, None
        if raw.endswith(":"):
            print("  This prompt takes one line at a time. Anything longer gets written in the desk file.\n")
            continue

        typed = run_line(raw, ns)
        echo(typed)
        verdict = judge(step, typed)
        if verdict is True:
            print()
            show(green("✓ ") + clean(step.get("after", "That's it.")))
            return 5, raw
        misses += 1
        if verdict:
            print("  " + yellow(inline(verdict)))
        elif typed.error is None:
            print(dim("  That ran, but it isn't what this step is after. Have another go."))
        if misses == 2:
            print(dim("  (`hint` gives a nudge, `skip` shows the answer)"))
        print()


# ---------------------------------------------------------------- a guess

def matches(guess, actual):
    text = guess.strip()
    if not text:
        return False
    try:
        literal = ast.literal_eval(text)
        if type(literal) is type(actual) and literal == actual:
            return True
    except (ValueError, SyntaxError):
        pass
    bare = text.strip("'\"")
    if isinstance(actual, str):
        return bare == actual
    if actual is None:
        return bare.lower() in ("none", "nothing")
    return bare.lower() == str(actual).lower()


def run_predict(step, ns, **_):
    show(step.get("text"))
    print("  What will this give? Guess before Python answers.\n")
    print("  " + cyan("    " + step["code"]) + "\n")
    actual = eval(step["code"], ns)
    guess = ask("  your guess: ")
    if guess.strip().lower() in ("quit", "exit", "q"):
        raise Quit
    right = matches(guess, actual)
    print(f"\n  {cyan('>>> ' + step['code'])}")
    print(f"  {short(actual)}\n")
    show((green("✓ Yes. ") if right else "") + clean(step["why"]))
    return (6 if right else 3), None


def run_say(step, ns, **_):
    show(step["text"])
    if ask(dim("  (Enter to go on) ")).strip().lower() in ("quit", "exit", "q"):
        raise Quit
    print()
    return 1, None


# ---------------------------------------------------------------- the desk

def desk_marker(stop, index):
    return f"# trail desk: stop {stop.KEY}, step {index + 1}"


def lay_out_desk(stop, index, step):
    """Put the step's starting code on the desk, unless work on this very
    step is already there."""
    marker = desk_marker(stop, index)
    try:
        if DESK.read_text(encoding="utf-8").startswith(marker):
            return
    except OSError:
        pass
    template = textwrap.dedent(step["template"]).strip("\n")
    DESK.write_text(f"{marker}\n# Change the code below and save. The terminal checks it for you.\n\n"
                    f"{template}\n", encoding="utf-8")


def open_in_editor(path):
    if not TTY or os.environ.get("TERM_PROGRAM") != "vscode":
        return
    code = shutil.which("code")
    if not code:
        return
    try:
        subprocess.Popen([code, "--reuse-window", str(path)], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, shell=code.lower().endswith((".cmd", ".bat")))
    except OSError:
        pass


def check_desk(step, source, ns, helpers):
    """Try the desk file against the step's cases. Returns (ok, lines to print)."""
    try:
        code = compile(source, str(DESK), "exec")
    except SyntaxError as exc:
        if "expected an indented block" in exc.msg:
            return False, ["  The function has no body yet. It needs at least one line of code,",
                           "  indented under the `def` line. Comments don't count."]
        return False, [red(f"  line {exc.lineno}: {exc.msg}"),
                       "  Python couldn't read the file. The line number is usually right, or one late."]
    trial = dict(ns)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            exec(code, trial)
    except Exception as exc:
        return False, [red(f"  {type(exc).__name__}: {exc}"),
                       "  That happened while Python was reading the file, before any checks ran."]

    lines, all_ok, explained = [], True, False
    nothing = recursed = False
    for case in step["cases"]:
        expression, wanted = case[0], case[1]
        label = case[2] if len(case) > 2 else expression
        try:
            got = eval(expression, {**helpers, **trial})
            ok, got_text = got == wanted, short(got)
            nothing = nothing or got is None or got is ...
        except RecursionError:
            ok, got_text, recursed = False, "it never finished", True
        except Exception as exc:
            ok, got_text = False, f"{type(exc).__name__}: {exc}"
        all_ok = all_ok and ok
        lines.append(f"    {green('✓') if ok else red('✗')} {label}")
        if not ok and not explained:
            lines.append(f"        got     {got_text}")
            lines.append(f"        wanted  {short(wanted)}")
            explained = True

    if all_ok:
        return True, lines
    name = step["function"]
    if "____" in source:
        lines.append(yellow("  The blank, ____, is still in the file. That's the part to replace."))
    elif name not in trial:
        lines.append(yellow(f"  There's no function called {name} in the file. Its `def` line needs to stay."))
    elif recursed:
        lines.append(yellow(f"  {name} is calling itself, round and round. Lines like {name}(...) are how the\n"
                            f"  function gets used by other code. Inside it, the job is to build one\n"
                            f"  answer out of what came in, and `return` it."))
    elif nothing:
        lines.append(yellow(f"  {name} ran but handed nothing back (None). It needs a line starting with `return`."))
    return False, [inline(line) for line in lines]


def poll_key():
    if not msvcrt.kbhit():
        return None
    key = msvcrt.getwch()
    if key in ("\x00", "\xe0"):     # arrows and such arrive as two characters
        msvcrt.getwch()
        return None
    if key == "\x03":
        raise Quit
    return key.lower()


def read_desk():
    try:
        return DESK.read_text(encoding="utf-8")
    except OSError:
        return None


def run_desk(step, ns, stop, index, **_):
    lay_out_desk(stop, index, step)
    show(step["text"])
    print(f"  The file: {bold(shown(DESK))}")
    if LIVE:
        print(dim("  Save it and it's checked right here.   h hint · s skip · q quit · Enter check again\n"))
    else:
        print()
    open_in_editor(DESK)

    used = 0
    seen = read_desk()

    def attempt(source):
        ok, lines = check_desk(step, source, ns, vars(stop))
        print("\n".join(lines) + "\n")
        if ok:
            quiet_run(source, ns)
            show(green("✓ ") + clean(step.get("after", "That's it.")))
        return ok

    def give_up():
        answer = textwrap.dedent(step["answer"]).strip("\n")
        DESK.write_text(f"{desk_marker(stop, index)}\n# One way to do it:\n\n{answer}\n", encoding="utf-8")
        quiet_run(answer, ns)
        print(f"  I've put one way to do it in {shown(DESK)}. Have a read, then carry on.\n")

    while True:
        if LIVE:
            command = poll_key()
            source = read_desk()
            if source is not None and source != seen:
                time.sleep(0.15)                 # let the editor finish writing
                source = read_desk() or source
                seen, command = source, "\r"
            if command is None:
                time.sleep(0.2)
                continue
            command = {"\r": "", "h": "hint", "s": "skip", "q": "quit"}.get(command)
            if command is None:
                continue
        else:
            command = ask("  Enter to check it · hint · skip · quit: ").strip().lower()

        if command in ("quit", "exit", "q"):
            raise Quit
        if command in ("hint", "h", "?"):
            used = next_hint(step, used)
        elif command in ("skip", "s"):
            give_up()
            return 0, None
        elif command == "":
            source = read_desk()
            if source is None:
                lay_out_desk(stop, index, step)
                print(f"  The desk file had gone missing, so I've put it back.\n")
            elif attempt(source):
                return 8, source


RUNNERS = {"write": run_write, "predict": run_predict, "say": run_say, "desk": run_desk}


# ---------------------------------------------------------------- a stop, and the map

def run_stop(stops, index, progress):
    stop = stops[index]
    steps = stop.STEPS
    entry = entry_for(progress, stop)
    if entry["step"] >= len(steps):          # walked before: start it afresh
        entry["step"], entry["inputs"] = 0, {}
        DESK.unlink(missing_ok=True)
    ns = namespace_for(stops, index, entry["step"], progress)

    print(f"\n  {bold(f'Stop {stop.KEY} · {stop.TITLE}')}   {dim(stop.TOPIC)}")
    if entry["step"]:
        print(dim(f"  picking up at step {entry['step'] + 1}\n"))
    else:
        print()
        show(stop.INTRO)

    while entry["step"] < len(steps):
        i = entry["step"]
        step = steps[i]
        quiet_run(step.get("setup"), ns)
        pips = green("●" * i) + "●" + dim("○" * (len(steps) - i - 1))
        print(f"  {pips}  {dim(f'{i + 1} of {len(steps)}')}\n")
        xp, typed = RUNNERS[step["kind"]](step, ns, stop=stop, index=i)
        if typed is not None:
            entry["inputs"][str(i)] = typed
        entry["xp"][str(i)] = max(entry["xp"].get(str(i), 0), xp)
        entry["step"] = i + 1
        write_progress(progress)

    try:
        stop.finale(ns, TTY)
    except Exception as exc:
        print(dim(f"  (the ending tripped over something: {type(exc).__name__}: {exc})"))
    first_time = not entry.get("done")
    entry["done"] = True
    write_progress(progress)
    print()
    if first_time:
        print(f"  {green('Stop ' + stop.KEY + ' done.')}  You picked up {stop.TRINKET}.")
        done = sum(1 for s in stops if progress["stops"].get(s.KEY, {}).get("done"))
        print(f"  You're {RANKS[min(done, len(RANKS) - 1)]} now.")
    else:
        print(f"  {green('Stop ' + stop.KEY + ' done')} again.")


def show_map(stops, progress):
    """Print the map and ask where to go. Returns a stop's position in the list."""
    print(f"\n  {bold('trail')} {dim('· a walk back into Python')}\n")
    width = max(len(s.TITLE) for s in stops)
    upcoming = None
    for i, stop in enumerate(stops):
        entry = progress["stops"].get(stop.KEY, {})
        if entry.get("done"):
            mark, note = green("✓"), ""
        elif entry.get("step"):
            mark, note = yellow("~"), f"step {entry['step'] + 1} of {len(stop.STEPS)}"
        else:
            mark, note = dim("·"), ""
        if upcoming is None and not entry.get("done"):
            upcoming = i
        topic = stop.TOPIC.ljust(max(len(s.TOPIC) for s in stops))
        print(f"   {mark} {stop.KEY}  {stop.TITLE:<{width}}   {dim(topic)}   {note}".rstrip())

    done = [s for s in stops if progress["stops"].get(s.KEY, {}).get("done")]
    print(f"\n  {total_xp(progress)} xp · {RANKS[min(len(done), len(RANKS) - 1)]}")
    if done:
        print(f"  in your pack: {', '.join(s.TRINKET for s in done)}")
    print()

    if upcoming is None:
        print("  That's the whole trail as it stands. Claude can lay more.")
        prompt = "  A number to walk a stop again, or q to leave: "
    else:
        prompt = f"  Enter for stop {stops[upcoming].KEY}, a number for any other, q to leave: "
    while True:
        answer = ask(prompt).strip().lower()
        if answer in ("q", "quit", "exit"):
            raise Quit
        if not answer and upcoming is not None:
            return upcoming
        for i, stop in enumerate(stops):
            if answer == stop.KEY:
                return i


def main(args):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    stops = load_stops()
    if not stops:
        sys.exit("No stops found. Something's off with the stops/ folder.")
    progress = read_progress()
    wanted = args[0] if args else None
    try:
        while True:
            index = next((i for i, s in enumerate(stops) if s.KEY == wanted), None)
            wanted = None
            if index is None:
                index = show_map(stops, progress)
            run_stop(stops, index, progress)
    except Quit:
        write_progress(progress)
        print(f"\n  Saved. {me()} picks up where you stopped.\n")


if __name__ == "__main__":
    main(sys.argv[1:])
