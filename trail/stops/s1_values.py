TITLE = "Values"
TOPIC = "text, numbers and names"
TRINKET = "a hand-painted trail sign"

INTRO = """
We're going to build the options menu for a small cozy game, a line at a
time. This first stop is the raw material: numbers, text, and names that
hold on to them.
"""


def is_f_string(source):
    return source.lstrip().lower().startswith(("f'", 'f"'))


STEPS = [
    {
        "kind": "write",
        "text": """
            The prompt below is live Python. Whatever you type runs, and what
            comes back is shown underneath. Nothing typed here can break anything,
            so poke at it as much as you like.

            Start with arithmetic. Type `7 + 3` and press Enter.
        """,
        "check": lambda t: t.value == 10 and not isinstance(t.value, bool),
        "notes": [(lambda t: t.error is None, "That ran. To move on, give it `7 + 3`.")],
        "after": "You type, Python answers. Every step works like that.",
        "hints": ["Type the characters `7 + 3` and press Enter."],
        "answer": "7 + 3",
    },
    {
        "kind": "write",
        "text": """
            Text goes in quotes, single or double, so Python knows it's text and
            not an instruction. Text in quotes is called a string.

            Type the word volume as a string.
        """,
        "check": lambda t: isinstance(t.value, str) and t.value.strip().lower() == "volume",
        "notes": [
            (lambda t: isinstance(t.error, NameError),
             'Without quotes, Python reads volume as a name it should already know, '
             'and it doesn\'t yet. Put quotes round it: `"volume"`'),
            (lambda t: isinstance(t.value, str), "That's a string. This step is after the word volume."),
        ],
        "after": "The quotes come back too. That's Python saying: this is a string.",
        "hints": ['`"volume"`'],
        "answer": '"volume"',
    },
    {
        "kind": "predict",
        "code": '"volume".title()',
        "why": """
            `.title()` is a method: a function that belongs to the string in front
            of the dot. It hands back a new string with each word capitalised.
        """,
    },
    {
        "kind": "write",
        "text": """
            A name can hold on to a value so you can use it later:

                brightness = 5

            No quotes on the left. brightness is a name there, not text.

            Make a variable called volume that holds 7.
        """,
        "check": lambda t: t.ns.get("volume") == 7 and not isinstance(t.ns.get("volume"), bool),
        "notes": [
            (lambda t: isinstance(t.error, SyntaxError), "The name goes on the left of the `=`, the value on the right."),
            (lambda t: t.value == 7, "That's the number 7, but nothing is holding it. `volume = 7` stores it."),
            (lambda t: "volume" in t.ns, "volume holds something now, just not 7. Store 7 in it."),
        ],
        "after": "Nothing came back, because storing a value isn't a question.",
        "hints": ["It's the brightness line with a different name and number.", "`volume = 7`"],
        "answer": "volume = 7",
    },
    {
        "kind": "predict",
        "code": "volume + 1",
        "why": """
            Python looked up volume, found 7, and added 1. volume itself is still 7,
            because nothing stored the answer anywhere.
        """,
    },
    {
        "kind": "write",
        "text": """
            Turn it up for real: change volume so that it holds 8.
        """,
        "check": lambda t: t.ns.get("volume") == 8,
        "notes": [
            (lambda t: t.value == 8, "That worked out 8 but didn't keep it. Storing needs an `=`, "
                                     "like `volume = volume + 1`."),
        ],
        "after": """
            In maths `volume = volume + 1` would be nonsense. In Python `=` means: work
            out the right-hand side, then store it under the name on the left.
        """,
        "hints": ["`volume = 8` does it. So does `volume = volume + 1`."],
        "answer": "volume = volume + 1",
    },
    {
        "kind": "write",
        "text": """
            An f-string is text with holes in it. Put an f right before the opening
            quote, and anything inside { } gets worked out and dropped in:

                f"Volume: {volume}"

            Type that f-string.
        """,
        "check": lambda t: t.value == f"Volume: {t.ns['volume']}" and is_f_string(t.source),
        "notes": [
            (lambda t: isinstance(t.value, str) and "{" in t.value,
             "The braces came out as plain characters. The f goes directly before the opening quote."),
            (lambda t: t.value == f"Volume: {t.ns['volume']}",
             "Right text, but typed out by hand. Use the f-string, so it follows whatever volume holds."),
        ],
        "after": "The hole was filled with whatever volume holds right now.",
        "hints": ['Exactly this: `f"Volume: {volume}"`'],
        "answer": 'f"Volume: {volume}"',
    },
    {
        "kind": "write",
        "text": """
            The game has a Cozy Mode, and it's either on or off. Python has two
            values for exactly that: `True` and `False`. Capital first letter,
            no quotes.

            Make a variable called cozy that holds True.
        """,
        "check": lambda t: t.ns.get("cozy") is True,
        "notes": [
            (lambda t: isinstance(t.error, NameError), "It needs the capital T: `True`."),
            (lambda t: isinstance(t.ns.get("cozy"), str),
             "That stored the text 'True', which is a string. Drop the quotes to get the value True."),
        ],
        "after": "cozy is on.",
        "hints": ["`cozy = True`"],
        "answer": "cozy = True",
    },
    {
        "kind": "predict",
        "code": 'f"Cozy Mode: {cozy}"',
        "why": "Accurate, but no menu says True. It ought to say on.",
    },
    {
        "kind": "predict",
        "text": """
            Python can choose between two values in a single line.
        """,
        "code": '"on" if cozy else "off"',
        "why": """
            Read it as a sentence: "on" if cozy is true, otherwise "off".
        """,
    },
    {
        "kind": "write",
        "text": """
            Keep that choice: make a variable called state, using the same
            `"on" if cozy else "off"` line to give it its value.
        """,
        "check": lambda t: t.ns.get("state") == "on" and "if" in t.source and "else" in t.source,
        "notes": [
            (lambda t: t.ns.get("state") == "on",
             "state holds 'on', but typed in directly. Let the `if ... else` line decide it."),
            (lambda t: t.value == "on", "That chose 'on' but didn't store it. Start the line with `state =`."),
        ],
        "after": "state is 'on' because cozy is True. Had cozy been False, the same line would give 'off'.",
        "hints": ["It starts `state =` and the rest is the line from the last step.",
                  '`state = "on" if cozy else "off"`'],
        "answer": 'state = "on" if cozy else "off"',
    },
    {
        "kind": "write",
        "text": """
            Last one here. Build the text `Cozy Mode: on` with an f-string that
            has state in its hole.
        """,
        "check": lambda t: t.value == f"Cozy Mode: {t.ns['state']}" and is_f_string(t.source) and "{" in t.source,
        "notes": [
            (lambda t: t.value == "Cozy Mode: on", "Right text. Now get there with an f-string and {state}."),
            (lambda t: isinstance(t.value, str) and "{" in t.value, "The f is missing from in front of the quote."),
        ],
        "after": "That's a finished menu line.",
        "hints": ["Same shape as the volume one, with a different label and name.", '`f"Cozy Mode: {state}"`'],
        "answer": 'f"Cozy Mode: {state}"',
    },
]


def finale(ns, tty):
    print("  Here's the menu so far, made from your variables:\n")
    print(f"        Options")
    print(f"        -------")
    print(f"        Volume: {ns['volume']}")
    print(f"        Cozy Mode: {ns['state']}")
    print()
    print("  It works, but you built each line by hand. At the next stop you")
    print("  teach Python to build any line of it for you.")
