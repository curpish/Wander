TITLE = "Settings"
TOPIC = "dictionaries"
TRINKET = "a brass dial"

INTRO = """
Settings are names with values attached: volume is 7, cozy mode is on.
A list could hold them, but you'd have to remember which position was which.
A dictionary lets you look a value up by its name.
"""

STEPS = [
    {
        "kind": "predict",
        "setup": 'settings = {"volume": 7, "cozy mode": True, "fullscreen": False}',
        "text": """
            A dictionary (dict, for short) goes in curly brackets. Each entry is a
            name, a colon, and its value. I've made one:

                settings = {"volume": 7, "cozy mode": True, "fullscreen": False}

            Square brackets look a value up, by name instead of by position.
        """,
        "code": 'settings["cozy mode"]',
        "why": "The name goes in, and the value stored under it comes out.",
    },
    {
        "kind": "write",
        "text": """
            The same square brackets, with an `=` after them, store a value:

                settings["fullscreen"] = True

            Set the volume in settings to 9.
        """,
        "check": lambda t: t.ns["settings"].get("volume") == 9,
        "notes": [
            (lambda t: t.ns.get("volume") == 9 and "settings" not in t.source,
             "That made a separate variable called volume. The one to change lives inside settings."),
            (lambda t: isinstance(t.error, NameError), 'The name inside the brackets is text: `settings["volume"]`'),
        ],
        "after": "Changed in place. The other entries are as they were.",
        "hints": ['`settings["volume"] = 9`'],
        "answer": 'settings["volume"] = 9',
    },
    {
        "kind": "write",
        "text": """
            Storing under a name that isn't there yet adds it.

            Add "music volume" to settings, with the value 4.
        """,
        "check": lambda t: t.ns["settings"].get("music volume") == 4,
        "after": "Four settings now.",
        "hints": ["Same shape as the last step, with a new name.", '`settings["music volume"] = 4`'],
        "answer": 'settings["music volume"] = 4',
    },
    {
        "kind": "predict",
        "code": '"vsync" in settings',
        "why": "`in` asks whether a name is in the dict. Nobody has added vsync.",
    },
    {
        "kind": "write",
        "text": """
            Ask for it anyway, to see what happens. Look up "vsync" in settings.
        """,
        "check": lambda t: isinstance(t.error, KeyError),
        "notes": [(lambda t: isinstance(t.error, NameError), 'The name is text: `settings["vsync"]`')],
        "after": """
            A KeyError. Python won't make a value up, so it stops and says which
            name was missing. An error is Python telling you something, and this
            one is the step going to plan.
        """,
        "hints": ['`settings["vsync"]`'],
        "answer": 'settings["vsync"]',
    },
    {
        "kind": "write",
        "text": """
            When a missing name is normal, `.get` asks more gently. It takes the
            name and a fallback to use if the name isn't there:

                settings.get("gamma", 1.0)

            Get "vsync" from settings, with a fallback of False.
        """,
        "check": lambda t: t.value is False and ".get(" in t.source and "vsync" in t.source,
        "after": "No error this time, only the fallback.",
        "hints": ['`settings.get("vsync", False)`'],
        "answer": 'settings.get("vsync", False)',
    },
    {
        "kind": "predict",
        "code": "not True",
        "why": "`not` flips True to False and False to True. It's what pressing a toggle does.",
    },
    {
        "kind": "desk",
        "function": "press",
        "text": """
            press is what happens when the player presses a button on a setting:
            an on/off setting flips, and a number goes up by one. It changes the
            dict it was given and hands it back.

            `settings[name]` appears several times in it. That's the current value
            of whichever setting was pressed.

            Two blanks this time.
        """,
        "template": """
            def press(settings, name):
                if isinstance(settings[name], bool):
                    settings[name] = ____           # the opposite of what it is now
                else:
                    settings[name] = ____           # one more than it is now
                return settings
        """,
        "cases": [
            ("press({'cozy mode': True, 'volume': 7}, 'cozy mode')", {"cozy mode": False, "volume": 7}),
            ("press({'cozy mode': False, 'volume': 7}, 'cozy mode')", {"cozy mode": True, "volume": 7}),
            ("press({'cozy mode': True, 'volume': 7}, 'volume')", {"cozy mode": True, "volume": 8}),
        ],
        "after": "The menu can change things now, as well as show them.",
        "hints": [
            "Both blanks start from the current value, `settings[name]`.",
            "The first: `not settings[name]`",
            "The second: `settings[name] + 1`",
        ],
        "answer": """
            def press(settings, name):
                if isinstance(settings[name], bool):
                    settings[name] = not settings[name]
                else:
                    settings[name] = settings[name] + 1
                return settings
        """,
    },
    {
        "kind": "write",
        "text": """
            Back at the prompt. A dict can be looped over like a list.
            `settings.items()` hands over each entry as a pair: name, value.

            The label function from stop 2 is still here. Run this, which calls
            it once for every setting:

                [label(name, value) for name, value in settings.items()]
        """,
        "check": lambda t: t.error is None and t.value == [t.ns["label"](n, v) for n, v in t.ns["settings"].items()],
        "after": "The whole settings screen as a list of lines.",
        "hints": ["Type it as shown: `[label(name, value) for name, value in settings.items()]`"],
        "answer": "[label(name, value) for name, value in settings.items()]",
    },
    {
        "kind": "desk",
        "function": "lines",
        "text": """
            Last one for this stop, and it has no blanks. Wrap what you just ran
            in a function called lines, which takes a settings dict and returns
            that list of labels.

                lines({"volume": 7, "cozy mode": True})

            should give

                ['Volume: 7', 'Cozy Mode: on']
        """,
        "template": """
            def lines(settings):
                # Return a list holding one label for each setting.
        """,
        "cases": [
            ("lines({'volume': 7, 'cozy mode': True})", ["Volume: 7", "Cozy Mode: on"]),
            ("lines({'fullscreen': False})", ["Fullscreen: off"]),
            ("lines({})", []),
        ],
        "after": "lines, menu, press: all the parts of a working options screen exist now.",
        "hints": [
            "The body is `return` followed by the line you ran at the prompt.",
            "Four spaces, then: `return [label(name, value) for name, value in settings.items()]`",
        ],
        "answer": """
            def lines(settings):
                return [label(name, value) for name, value in settings.items()]
        """,
    },
]


def finale(ns, tty):
    lines, press, menu = ns["lines"], ns["press"], ns["menu"]
    settings = {"volume": 7, "music volume": 4, "cozy mode": False, "fullscreen": False}

    def draw(selected):
        for line in menu(lines(settings), selected).splitlines():
            print("        " + line)
        print()

    print("  Your functions working together. The settings:\n")
    draw(2)
    print("  ...then press(settings, \"cozy mode\"), and twice on volume:\n")
    press(settings, "cozy mode")
    press(settings, "volume")
    press(settings, "volume")
    draw(2)
    print("  One stop left: wiring that to the keyboard.")
