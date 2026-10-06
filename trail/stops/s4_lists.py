import time

TITLE = "Lists"
TOPIC = "things in order, and loops"
TRINKET = "a string of wooden beads"

INTRO = """
A menu is several things in an order, with one of them highlighted. Python's
tool for several things in an order is the list.
"""

STEPS = [
    {
        "kind": "predict",
        "setup": 'options = ["Play", "Options", "Quit"]',
        "text": """
            A list goes in square brackets, with commas between the items.
            I've made one:

                options = ["Play", "Options", "Quit"]

            Square brackets after a list's name pick one item out by position.
        """,
        "code": "options[0]",
        "why": "Positions count from 0, so the first item is at 0. It catches everyone out at some point.",
    },
    {
        "kind": "write",
        "text": """
            Pick the last item, Quit, out of options.
        """,
        "check": lambda t: t.value == "Quit" and "options" in t.source,
        "notes": [
            (lambda t: isinstance(t.error, IndexError), "There are three items, at positions 0, 1 and 2. There's no 3."),
            (lambda t: t.value == "Quit", "That's the text, typed directly. Fetch it out of options by its position."),
        ],
        "after": "options[2] gets it. So does options[-1]: negative positions count back from the end.",
        "hints": ["Three items sit at positions 0, 1 and 2.", "`options[2]`"],
        "answer": "options[2]",
    },
    {
        "kind": "predict",
        "code": "len(options)",
        "why": "len is short for length. It works on strings as well as lists.",
    },
    {
        "kind": "write",
        "text": """
            Lists can grow. `options.append(something)` puts something on the end.

            Add "Credits" to options.
        """,
        "check": lambda t: t.error is None and t.ns["options"][-1] == "Credits",
        "notes": [
            (lambda t: isinstance(t.error, NameError), 'Credits is text, so it needs quotes: `options.append("Credits")`'),
        ],
        "after": "Nothing came back, because append changes the list where it is. Type options some time to look.",
        "hints": ['`options.append("Credits")`'],
        "answer": 'options.append("Credits")',
    },
    {
        "kind": "write",
        "text": """
            Here's a way to make a new list out of an old one, by doing the same
            thing to every item:

                [o.upper() for o in options]

            Read it from the middle: for each o in options, give me o.upper().
            o is a stand-in for each item in turn, and any name would do.

            Run it and look at what comes back.
        """,
        "check": lambda t: t.value == [o.upper() for o in t.ns["options"]],
        "after": "A new list. options itself is untouched.",
        "hints": ["Type it as shown: `[o.upper() for o in options]`"],
        "answer": "[o.upper() for o in options]",
    },
    {
        "kind": "write",
        "text": """
            Your turn. In a menu, the lines that aren't highlighted start with two
            spaces. Make a list of every option with two spaces joined on the front.

            Two spaces as a string is `"  "`.
        """,
        "check": lambda t: t.value == ["  " + o for o in t.ns["options"]],
        "notes": [
            (lambda t: isinstance(t.value, list) and len(t.value) == len(t.ns["options"]),
             "Right shape. Each item should be exactly two spaces and then the option."),
        ],
        "after": "That's the unhighlighted half of a menu.",
        "hints": [
            "Same shape as the last step, with a different thing done to o.",
            'What\'s done to o: `"  " + o`',
            '`["  " + o for o in options]`',
        ],
        "answer": '["  " + o for o in options]',
    },
    {
        "kind": "predict",
        "text": """
            A list of strings can be glued into one string.
        """,
        "code": '" / ".join(["Play", "Quit"])',
        "why": """
            join belongs to the glue, and takes the list. The glue goes between the
            items, never on the ends. With "\\n" as the glue (that's how a new line
            is written) each item lands on a line of its own.
        """,
    },
    {
        "kind": "write",
        "text": """
            To highlight one line, a loop needs to know each item's position as
            well as the item. enumerate hands them over in pairs.

            Run this and look:

                list(enumerate(options))
        """,
        "check": lambda t: t.value == list(enumerate(t.ns["options"])),
        "after": "Each pair is (position, item).",
        "hints": ["`list(enumerate(options))`"],
        "answer": "list(enumerate(options))",
    },
    {
        "kind": "desk",
        "function": "menu",
        "text": """
            In a file, the same idea is usually written as a for loop: the indented
            lines under `for` run once for each item.

            menu takes the options and the position of the selected one. It should
            give back the whole menu as one string, where the selected line starts
            with "> " and every other line starts with two spaces.

            Nearly all of it is written. Read it through, then fill in the blank.
        """,
        "template": """
            def menu(options, selected):
                lines = []
                for position, option in enumerate(options):
                    if position == selected:
                        lines.append("> " + option)
                    else:
                        lines.append(____)
                return "\\n".join(lines)
        """,
        "cases": [
            ("menu(['Play', 'Options', 'Quit'], 1)", "  Play\n> Options\n  Quit"),
            ("menu(['Play', 'Options', 'Quit'], 0)", "> Play\n  Options\n  Quit"),
            ("menu(['Back'], 0)", "> Back"),
        ],
        "after": "The \\n in those results is the new line. print will show it properly.",
        "hints": [
            "The blank is what an unselected line looks like.",
            'Two spaces, then the option: `"  " + option`',
        ],
        "answer": """
            def menu(options, selected):
                lines = []
                for position, option in enumerate(options):
                    if position == selected:
                        lines.append("> " + option)
                    else:
                        lines.append("  " + option)
                return "\\n".join(lines)
        """,
    },
    {
        "kind": "write",
        "text": """
            Back at the prompt. `print(something)` shows a string the way a player
            would see it, new lines and all.

            Print your menu for options, with position 1 selected.
        """,
        "check": lambda t: t.error is None and "> Options" in t.out and "print" in t.source,
        "notes": [
            (lambda t: isinstance(t.value, str) and "> " in t.value,
             "That's the string with its \\n showing. Wrap the call in `print( )` to see it laid out."),
            (lambda t: t.error is None and "> " in t.out, "That's a menu. This step is after position 1 selected."),
        ],
        "after": "A menu with a cursor in it.",
        "hints": ["The call is `menu(options, 1)`. Put it inside `print( )`.", "`print(menu(options, 1))`"],
        "answer": "print(menu(options, 1))",
    },
]


def finale(ns, tty):
    menu = ns["menu"]
    options = ["Play", "Options", "Credits", "Quit"]
    print("  Your menu, with someone holding the down key:\n")
    if not tty:
        print("\n".join("        " + line for line in menu(options, 2).splitlines()))
        return
    for step in range(9):
        if step:
            print(f"\033[{len(options)}A", end="")     # back up to redraw in place
        for line in menu(options, step % len(options)).splitlines():
            print("\033[2K        " + line)
        time.sleep(0.3)
