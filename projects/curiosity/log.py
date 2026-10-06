"""
The goal is to prove that something the program knew on one run is still there on the next.
It's done when:
1. One function records an event by adding it to a log file on disk.
2. Another function reads the whole log back and gives you the events as a list of dictionaries.
3. Running the program records one event and then prints how many events the log holds.
4. You run it twice, and the count goes up each time.
"""
import json, time
from pathlib import Path

LOG_PATH = Path(__file__).parent / "data" / "log.jsonl"

def record(kind, item_id=None):
    event = {"kind": kind, "item_id": item_id, "timestamp": time.time()}
    with open(LOG_PATH, "a") as f:
        json.dump(event, f)
        f.write("\n")
    return event

def read_log():
    with open(LOG_PATH, "r") as f:
        return [json.loads(line) for line in f if line.strip()]

old_log = read_log()
if old_log:
    print(f"Log contains {len(old_log)} events, resuming")
    record("resume")
else:
    print("Log is empty, adding start event")
    record("start")
print(read_log())
