# record.py
import os
import sys
import time
import json
import string

import keyboard

def get_base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR = get_base_dir()
MACRO_FILE = os.path.join(BASE_DIR, "macro.json")

print("=== Pico Macro Recorder (관리자 권장) ===")
print("⚠ 게임 키 전체 후킹을 위해서는 '관리자 권한으로 실행'을 추천합니다.")
print("F9 = 녹화 시작, F10 = 녹화 종료")

# 게임용 키셋 (안전하게 제한)
letters = {c for c in string.ascii_uppercase}
digits = {str(i) for i in range(10)}
func_keys = {f"F{i}" for i in range(1, 13)}
others = {
    "SPACE", "ENTER",
    "SHIFT", "CTRL", "ALT",
    "TAB", "ESC",
    "UP", "DOWN", "LEFT", "RIGHT",
}
ALLOWED_KEYS = letters | digits | func_keys | others

events = []
recording = False
start_time = None
done = False


def record_event(e):
    global recording, start_time, done

    key = (e.name or "").upper()

    # 시작/종료 핫키
    if key == "F9" and e.event_type == "down":
        if not recording:
            recording = True
            start_time = time.time()
            events.clear()
            print("▶ 녹화 시작 (F10으로 종료)")
        return

    if key == "F10" and e.event_type == "down":
        if recording:
            recording = False
            done = True
            print("⏹ 녹화 종료")
        else:
            done = True
            print("⏹ 녹화 없이 종료")
        return

    if not recording or start_time is None:
        return
    if key not in ALLOWED_KEYS:
        return

    timestamp = time.time() - start_time

    events.append({
        "type": e.event_type,   # 'down' or 'up'
        "key": key,
        "time": timestamp
    })

    print(f"{e.event_type} - {key} @ {timestamp:.3f}")


keyboard.hook(record_event)

try:
    while not done:
        time.sleep(0.05)
except KeyboardInterrupt:
    print("\n사용자 강제 종료")
finally:
    keyboard.unhook_all()

if not events:
    print("⚠ 녹화된 이벤트가 없어 macro.json을 생성하지 않습니다.")
else:
    with open(MACRO_FILE, "w", encoding="utf-8") as f:
        f.write(json.dumps(events))
    print(f"✅ 저장 완료: {MACRO_FILE} (이벤트 {len(events)}개)")

print("1~2초 후 창을 닫아도 됩니다.")
time.sleep(1.5)
