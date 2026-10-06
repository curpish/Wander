import builtins
import contextlib
import io

TITLE = "The menu"
TOPIC = "a loop that listens"
TRINKET = "a folded map of the whole trail"

INTRO = """
Everything so far has been a part. This stop joins the parts into a menu
you can move around in with the keyboard, and at the end you get to use it.
"""


def played(play, settings, keys):
    """Run play with a scripted player pressing keys, and return what it returns."""
    feed = iter(keys)

    def scripted(prompt=""):
        try:
            return next(feed)
        except StopIteration:
            raise RuntimeError("the loop asked for another key after q, so it never stopped") from None

    real = builtins.input
    builtins.input = scripted
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            return play(settings)
    finally:
        builtins.input = real


STEPS = [
    {
        "kind": "predict",
        "text": """
            A cursor that walks off the bottom of a menu should come back in at
            the top. There's a piece of arithmetic for that.
        """,
        "code": "7 % 3",
        "why": "`%` gives the remainder after dividing. 3 goes into 7 twice, with 1 left over.",
    },
    {
        "kind": "predict",
        "text": """
            A menu of 3 items has positions 0, 1 and 2. The cursor is on 2, the
            last one, and moves down one more.
        """,
        "code": "(2 + 1) % 3",
        "why": "3 divides by 3 with nothing left over, so the cursor lands on 0: back at the top.",
    },
    {
        "kind": "predict",
        "text": """
            And upwards, off the top, from position 0:
        """,
        "code": "(0 - 1) % 3",
        "why": "Python's `%` never goes negative here, so -1 wraps round to 2, the bottom item.",
    },
    {
        "kind": "desk",
        "function": "move",
        "text": """
            move works out where the cursor goes. It takes the position selected
            now, the key that was pressed, and how many items the menu has.

            "s" moves down, and that branch is written. Add the rest:
            "w" moves up, and any other key leaves the cursor where it is.

            Lining up under an `if` and starting with `elif` or `else` is how a
            function chooses between more than two paths.
        """,
        "template": """
            def move(selected, key, count):
                if key == "s":
                    return (selected + 1) % count
                # "w" goes up one, wrapping the same way.
                # Any other key: hand back selected unchanged.
        """,
        "cases": [
            ("move(0, 's', 3)", 1),
            ("move(2, 's', 3)", 0),
            ("move(1, 'w', 3)", 0),
            ("move(0, 'w', 3)", 2),
            ("move(1, 'x', 3)", 1),
        ],
        "after": "The cursor logic, wrap-around included.",
        "hints": [
            'The up branch mirrors the one that\'s there: `elif key == "w":` with a minus where the plus was.',
            "After both branches, at the same indent as the `if`, one last line covers every other key: `return selected`",
            'elif key == "w":  then  return (selected - 1) % count  indented under it, then  return selected',
        ],
        "answer": """
            def move(selected, key, count):
                if key == "s":
                    return (selected + 1) % count
                elif key == "w":
                    return (selected - 1) % count
                return selected
        """,
    },
    {
        "kind": "desk",
        "function": "draw",
        "text": """
            You have `lines(settings)`, which turns settings into a list of labels,
            and `menu(options, selected)`, which turns a list into a menu with a
            cursor. draw feeds the one into the other.

                draw({"volume": 7, "cozy mode": True}, 1)

            should give the string that prints as

                  Volume: 7
                > Cozy Mode: on
        """,
        "template": """
            def draw(settings, selected):
                # Return the menu for these settings, with the cursor on `selected`.
        """,
        "cases": [
            ("draw({'volume': 7, 'cozy mode': True}, 1)", "  Volume: 7\n> Cozy Mode: on"),
            ("draw({'volume': 7, 'cozy mode': True}, 0)", "> Volume: 7\n  Cozy Mode: on"),
        ],
        "after": "Three of your functions in a row: lines, inside menu, inside draw.",
        "hints": [
            "It's one line: a call to menu, whose first thing in is a call to lines.",
            "Four spaces, then: `return menu(lines(settings), selected)`",
        ],
        "answer": """
            def draw(settings, selected):
                return menu(lines(settings), selected)
        """,
    },
    {
        "kind": "desk",
        "function": "play",
        "text": """
            The last piece is the loop. `while True:` runs its indented lines over
            and over until a `break` is reached. `input(...)` waits for the player
            to type something and press Enter, then hands it back as a string.

            Each time round, play draws the menu, asks for a key, and acts on it.
            Read it through. Two blanks are left, and both are calls to functions
            you've written: press, and move.
        """,
        "template": """
            def play(settings):
                selected = 0
                names = list(settings)                  # the setting names, in order
                while True:
                    print()
                    print(draw(settings, selected))
                    key = input("w up, s down, e press, q quit: ")
                    if key == "q":
                        break                           # leave the loop
                    if key == "e":
                        ____                            # press the highlighted setting
                    selected = ____                     # where the cursor is after this key
                return settings
        """,
        "cases": [
            ("played(play, {'volume': 7, 'cozy mode': True}, ['q'])",
             {"volume": 7, "cozy mode": True}, "keys: q"),
            ("played(play, {'volume': 7, 'cozy mode': True}, ['e', 'q'])",
             {"volume": 8, "cozy mode": True}, "keys: e q"),
            ("played(play, {'volume': 7, 'cozy mode': True}, ['s', 'e', 'q'])",
             {"volume": 7, "cozy mode": False}, "keys: s e q"),
            ("played(play, {'volume': 7, 'cozy mode': True}, ['w', 'e', 's', 'e', 'q'])",
             {"volume": 8, "cozy mode": False}, "keys: w e s e q"),
        ],
        "after": "That's a working program, and you wrote every function it runs on.",
        "hints": [
            "The highlighted setting's name is `names[selected]`.",
            "First blank: `press(settings, names[selected])`",
            "Second blank: move needs the position now, the key, and how many there are: "
            "`move(selected, key, len(names))`",
        ],
        "answer": """
            def play(settings):
                selected = 0
                names = list(settings)
                while True:
                    print()
                    print(draw(settings, selected))
                    key = input("w up, s down, e press, q quit: ")
                    if key == "q":
                        break
                    if key == "e":
                        press(settings, names[selected])
                    selected = move(selected, key, len(names))
                return settings
        """,
    },
]


def finale(ns, tty):
    settings = {"volume": 7, "music volume": 4, "cozy mode": False, "fullscreen": False}
    if not tty:
        print("  (Run this in a terminal to try your menu.)")
        return
    print("  It's yours to try. Type a key and press Enter each time.")
    result = ns["play"](settings)
    print(f"\n  You left the settings at: {result}")
