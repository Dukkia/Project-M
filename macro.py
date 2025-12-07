# macro.py
import os
import sys
import serial
import time
import json

def get_base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR = get_base_dir()
PORT = "COM4"
BAUD = 115200
MACRO_FILE = os.path.join(BASE_DIR, "macro.json")

with open(MACRO_FILE, "r", encoding="utf-8") as f:
    events = json.load(f)

if not events:
    print("매크로가 비어 있습니다.")
    sys.exit(0)

ser = serial.Serial(PORT, BAUD, timeout=1)
time.sleep(1)

print("▶ 스트리밍 재생 시작 (이벤트 수:", len(events), ")")

prev_t = 0.0

for ev in events:
    t = float(ev.get("time", 0.0))
    ev_type = ev.get("type", "down")
    key = (ev.get("key") or "").upper()

    delay = t - prev_t
    if delay > 0:
        time.sleep(delay)
    prev_t = t

    line = f"EV {ev_type} {key}\n"
    ser.write(line.encode("utf-8"))
    ser.flush()

print("⏹ 스트리밍 전송 완료")
ser.close()
