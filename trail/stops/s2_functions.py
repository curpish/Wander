TITLE = "Functions"
TOPIC = "def, stand-ins and return"
TRINKET = "a recipe card, slightly singed"

INTRO = """
A function is a named recipe. You write the steps once, and from then on
you can run them on anything by using the name. This stop is about what
goes inside one, which is the part that's easy to lose hold of.
"""

STEPS = [
    {
        "kind": "write",
        "setup": """
            def shout(text):
                return text.upper()
        """,
        "text": """
            Here is a whole function:

                def shout(text):
                    return text.upper()

            `def shout(text):` names the recipe, and says it takes one thing in.
            text is a stand-in for whatever that thing turns out to be.
            `return` is the answer the function hands back.

            I've already run those two lines, so shout exists. Using a function
            is called calling it: its name, then brackets with something inside.

            Call shout on the string "cozy".
        """,
        "check": lambda t: t.error is None and "shout(" in t.source and t.value == "COZY",
        "notes": [
            (lambda t: t.source.strip() == "shout",
             'That\'s the function itself, sitting there. To run it, add brackets with a string inside: `shout("cozy")`'),
            (lambda t: isinstance(t.error, NameError), 'What goes in the brackets is text, so it needs quotes: `shout("cozy")`'),
            (lambda t: t.error is None and "shout(" in t.source, 'That called it. To move on, call it on "cozy".'),
        ],
        "after": 'text stood in for "cozy", so text.upper() was "COZY", and return handed that back.',
        "hints": ['`shout("cozy")`'],
        "answer": 'shout("cozy")',
    },
    {
        "kind": "predict",
        "code": 'shout("on") + "!"',
        "why": """
            A call gets replaced by whatever it returned. shout("on") became 'ON',
            and then the ! was joined on.
        """,
    },
    {
        "kind": "predict",
        "setup": """
            def quiet(text):
                text.lower()
        """,
        "text": """
            Here's a second function. Look closely at how it differs from shout:

                def quiet(text):
                    text.lower()
        """,
        "code": 'quiet("HELLO")',
        "why": """
            Nothing comes back. quiet did work out 'hello', but with no `return` it
            threw the answer away. Python's word for "nothing came back" is None.

            If a function of yours ever gives None, a missing return is the first
            place to look.
        """,
    },
    {
        "kind": "write",
        "setup": """
            def label(name, value):
                return f"{name}: {value}"
        """,
        "text": """
            This is the f-string from the last stop, wrapped in a function. It has
            two stand-ins, so it takes two things in, separated by a comma:

                def label(name, value):
                    return f"{name}: {value}"

            Call label to make the menu line for a brightness of 5.
        """,
        "check": lambda t: t.error is None and "label(" in t.source and str(t.value).lower() == "brightness: 5",
        "notes": [
            (lambda t: isinstance(t.error, TypeError), "label takes two things: the name, then the value, with a comma between."),
            (lambda t: isinstance(t.error, NameError), 'The name is text, so it needs quotes: `label("brightness", 5)`'),
            (lambda t: t.error is None and "label(" in t.source, "That's a menu line. This step is after brightness at 5."),
        ],
        "after": "One function, and now any setting can have a line. It hasn't capitalised the name, though.",
        "hints": ["Two things go in the brackets: the name as a string, then the number.", '`label("brightness", 5)`'],
        "answer": 'label("brightness", 5)',
    },
    {
        "kind": "desk",
        "function": "label",
        "text": """
            Functions run to more than one line, so they get written in a file
            instead of at the prompt. I've put label in the desk file.

            Change it so the name comes out capitalised:

                label("volume", 7)   should give   'Volume: 7'

            You've met the tool for it: `.title()`. Only the return line changes.
            Edit the file and save it.
        """,
        "template": """
            def label(name, value):
                return f"{name}: {value}"
        """,
        "cases": [
            ("label('volume', 7)", "Volume: 7"),
            ("label('music volume', 3)", "Music Volume: 3"),
        ],
        "after": "That's your function now, and it's loaded at the prompt.",
        "hints": [
            "Only what's inside the first { } needs to change.",
            "`name.title()` is the capitalised name.",
            'The whole return line: `return f"{name.title()}: {value}"`',
        ],
        "answer": """
            def label(name, value):
                return f"{name.title()}: {value}"
        """,
    },
    {
        "kind": "write",
        "text": """
            Back at the prompt (click in the terminal if the cursor is still in
            the file).

            Call your label for "cozy mode", with the value True.
        """,
        "check": lambda t: t.error is None and "label(" in t.source and str(t.value).lower() == "cozy mode: true",
        "notes": [
            (lambda t: isinstance(t.error, NameError), 'The name needs quotes, and True needs its capital T: `label("cozy mode", True)`'),
        ],
        "after": "Cozy Mode: True. The same problem as before: a menu should say on. label needs a helper.",
        "hints": ['`label("cozy mode", True)`'],
        "answer": 'label("cozy mode", True)',
    },
    {
        "kind": "desk",
        "function": "on_off",
        "text": """
            A function from scratch this time. on_off takes one thing in, flag,
            which will be True or False. It should return the text "on" or "off"
            to match.

            You wrote the line that does the choosing at the last stop:

                "on" if cozy else "off"

            Here the stand-in is called flag, and the result needs returning.
            The file has the first line and a note on where yours goes.
        """,
        "template": """
            def on_off(flag):
                # Write one line under these comments, indented the same amount.
                # It should return "on" when flag is True, and "off" when it's False.
        """,
        "cases": [
            ("on_off(True)", "on"),
            ("on_off(False)", "off"),
        ],
        "after": "A recipe of your own, start to finish.",
        "hints": [
            "The line starts with `return`.",
            'After return comes the choosing: `"on" if flag else "off"`',
            'Four spaces, then: `return "on" if flag else "off"`',
        ],
        "answer": """
            def on_off(flag):
                return "on" if flag else "off"
        """,
    },
    {
        "kind": "desk",
        "function": "label",
        "text": """
            Now label can lean on on_off. One new piece:

                isinstance(value, bool)

            asks "is value a True-or-False kind of thing?" When it is, value should
            be swapped for on_off's answer before the text gets built.

            Most of that is written. There's one blank, ____, to fill in.
        """,
        "template": """
            def label(name, value):
                if isinstance(value, bool):         # is value True or False?
                    value = ____                    # swap it for "on" or "off"
                return f"{name.title()}: {value}"
        """,
        "cases": [
            ("label('cozy mode', True)", "Cozy Mode: on"),
            ("label('vsync', False)", "Vsync: off"),
            ("label('volume', 7)", "Volume: 7"),
            ("label('lives', 1)", "Lives: 1"),
        ],
        "after": "One function calling another. Most programs are that, stacked up.",
        "hints": [
            "The blank is a call to the function you just wrote.",
            "Hand it value: `on_off(value)`",
        ],
        "answer": """
            def label(name, value):
                if isinstance(value, bool):
                    value = on_off(value)
                return f"{name.title()}: {value}"
        """,
    },
]


def finale(ns, tty):
    label = ns["label"]
    print("  Your label, run on a handful of settings:\n")
    print("        Options")
    print("        -------")
    for name, value in [("volume", 7), ("music volume", 4), ("cozy mode", True), ("fullscreen", False)]:
        print(f"        {label(name, value)}")
    print()
    print("  Every one of those lines came out of the function you wrote.")
