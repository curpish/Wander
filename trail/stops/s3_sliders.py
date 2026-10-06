import time

TITLE = "Sliders"
TOPIC = "building text with arithmetic"
TRINKET = "a notched walking stick"

INTRO = """
A number in a menu is fine. A slider is nicer. This stop draws one out of
# and - characters, and the sum behind it is the same one a real slider uses.
"""


def follows_names(source):
    try:
        return eval(source, {"filled": 6, "width": 10}) == "######----"
    except Exception:
        return False


STEPS = [
    {
        "kind": "predict",
        "code": '"#" * 3',
        "why": "Multiplying a string repeats it.",
    },
    {
        "kind": "write",
        "text": """
            Make a string of ten dashes, without typing ten dashes.
        """,
        "check": lambda t: t.value == "-" * 10 and "*" in t.source,
        "notes": [(lambda t: t.value == "-" * 10, "That's ten. Now let `*` do the counting.")],
        "after": "Ten, and you only typed one.",
        "hints": ['`"-" * 10`'],
        "answer": '"-" * 10',
    },
    {
        "kind": "predict",
        "code": '"#" * 3 + "-" * 7',
        "why": "`+` joins strings end to end. Three filled, seven empty: a slider sitting at 3 out of 10.",
    },
    {
        "kind": "write",
        "setup": "filled = 3\nwidth = 10",
        "text": """
            I've made two variables for you:

                filled = 3
                width = 10

            Write that same bar using the names in place of the numbers, so that
            it would still be right if they changed. The empty part is however
            much of the width isn't filled.
        """,
        "check": lambda t: t.value == "###-------" and follows_names(t.source),
        "notes": [
            (lambda t: t.value == "###-------",
             "Right for 3 and 10, but it should use both names so it follows them. "
             "The dashes are `width - filled` long."),
            (lambda t: isinstance(t.error, TypeError),
             "Do the subtraction first by putting it in brackets: `(width - filled)`."),
        ],
        "after": "That expression draws a bar of any width at any level.",
        "hints": [
            'The filled part is `"#" * filled`.',
            'The empty part is `"-" * (width - filled)`. The brackets make the subtraction happen first.',
            '`"#" * filled + "-" * (width - filled)`',
        ],
        "answer": '"#" * filled + "-" * (width - filled)',
    },
    {
        "kind": "predict",
        "code": "7 // 2",
        "why": "`//` divides and throws away the remainder. A single `/` would have given 3.5.",
    },
    {
        "kind": "predict",
        "text": """
            Say the volume is 7 out of a possible 20, and the bar is 10 wide.
            How many blocks should be filled?
        """,
        "code": "7 * 10 // 20",
        "why": """
            7 times 10 is 70, and 70 divided by 20 is 3.5, rounded down to 3.
            value * width // maximum turns any value into a number of blocks.
        """,
    },
    {
        "kind": "desk",
        "function": "bar",
        "text": """
            Time to make it a function. Two things to notice in the first line:

                def bar(value, maximum, width=10):

            Three stand-ins, and the last has a default. Call bar without a width
            and it's 10.

            The sum is done. Fill in the blank so bar returns the slider with
            square brackets round it:

                bar(3, 10)   should give   '[###-------]'
        """,
        "template": """
            def bar(value, maximum, width=10):
                filled = value * width // maximum
                return ____
        """,
        "cases": [
            ("bar(3, 10)", "[###-------]"),
            ("bar(10, 10)", "[##########]"),
            ("bar(0, 10)", "[----------]"),
            ("bar(7, 20)", "[###-------]"),
            ("bar(1, 4, width=8)", "[##------]"),
        ],
        "after": "bar is loaded at the prompt.",
        "hints": [
            "It's the expression you wrote two steps back, with a bracket character on each end.",
            'The brackets are strings too: `"["` and `"]"`, joined on with `+`.',
            '`return "[" + "#" * filled + "-" * (width - filled) + "]"`',
        ],
        "answer": """
            def bar(value, maximum, width=10):
                filled = value * width // maximum
                return "[" + "#" * filled + "-" * (width - filled) + "]"
        """,
    },
    {
        "kind": "write",
        "text": """
            Back at the prompt. Call your bar for 7 out of 10, but make it 20 wide.
        """,
        "check": lambda t: t.error is None and "bar(" in t.source and t.value == "[" + "#" * 14 + "-" * 6 + "]",
        "notes": [
            (lambda t: t.value == "[#######---]", "That's the default width of 10. Add the width: `width=20`."),
        ],
        "after": "The default stepped aside because you gave a width of your own.",
        "hints": ["`bar(7, 10, width=20)`"],
        "answer": "bar(7, 10, width=20)",
    },
    {
        "kind": "desk",
        "function": "slider",
        "text": """
            One more, and this one is all yours: there's no blank, only the first
            line and a description.

            slider makes a full menu line: the capitalised name, then the bar,
            then the number, with a space between each.

                slider("volume", 7, 10)   should give   'Volume [#######---] 7'

            bar already exists, so slider can call it.
        """,
        "template": """
            def slider(name, value, maximum):
                # Return the capitalised name, the bar, and the number,
                # with a single space between each.
        """,
        "cases": [
            ("slider('volume', 7, 10)", "Volume [#######---] 7"),
            ("slider('music volume', 2, 4)", "Music Volume [#####-----] 2"),
        ],
        "after": "Written from an empty body, using a function you'd already made.",
        "hints": [
            "An f-string with three holes does it.",
            "The holes hold `name.title()`, `bar(value, maximum)` and `value`.",
            'Four spaces, then: `return f"{name.title()} {bar(value, maximum)} {value}"`',
        ],
        "answer": """
            def slider(name, value, maximum):
                return f"{name.title()} {bar(value, maximum)} {value}"
        """,
    },
]


def finale(ns, tty):
    slider = ns["slider"]
    print("  Your slider, being dragged:\n")
    if tty:
        for level in list(range(0, 11)) + [9, 8, 7]:
            print("\r        " + slider("volume", level, 10) + "  ", end="", flush=True)
            time.sleep(0.12)
        print()
    else:
        for level in (0, 5, 10, 7):
            print("        " + slider("volume", level, 10))
    print("        " + slider("music volume", 2, 4))
