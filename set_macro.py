# set_macro.py
import os
import sys
import time
import json
import random
import serial


def get_base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


BASE_DIR = get_base_dir()
PORT = "COM4"
BAUD = 115200
MACRO_SETS_FILE = os.path.join(BASE_DIR, "macro_sets.json")

# ───────── 세트 간 랜덤 텀 설정 ─────────
MIN_SET_DELAY = 0.00   # 최소 텀 (바로 이어붙이기)
MAX_SET_DELAY = 0.08   # 최대 텀 (80ms 랜덤)


def load_sets():
    if not os.path.exists(MACRO_SETS_FILE):
        print("⚠ macro_sets.json 파일이 없습니다. 먼저 set_record.py로 세트를 녹화하세요.")
        sys.exit(1)

    try:
        with open(MACRO_SETS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ macro_sets.json 읽기 실패: {e}")
        sys.exit(1)

    raw_sets = data.get("sets", {})
    sets = {}

    for k, v in raw_sets.items():
        try:
            n = int(k)
        except ValueError:
            continue
        if not v:
            continue
        sets[n] = v

    if not sets:
        print("⚠ macro_sets.json에 유효한 세트가 없습니다.")
        sys.exit(1)

    return sets


def choose_sets(sets):
    print("=== 사용 가능한 세트 목록 ===")
    for n in sorted(sets.keys()):
        print(f"  - 세트 {n} : 이벤트 {len(sets[n])}개")

    raw = input("사용할 세트 번호들을 공백으로 입력 (엔터 = 전체): ").strip()

    if not raw:
        selected = sorted(sets.keys())
    else:
        selected = []
        for token in raw.split():
            try:
                n = int(token)
            except ValueError:
                continue
            if n in sets:
                selected.append(n)
        selected = sorted(set(selected))
        if not selected:
            print("⚠ 입력한 번호에 해당하는 세트가 없습니다.")
            sys.exit(1)

    print("▶ 사용할 세트:", ", ".join(map(str, selected)))
    return selected


def play_set(ser, events, set_no):
    print(f"\n▶ 세트 {set_no} 실행 (이벤트 {len(events)}개)")

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

    # ───────── 세트 간 랜덤 텀 ─────────
    delay = random.uniform(MIN_SET_DELAY, MAX_SET_DELAY)
    if delay > 0:
        time.sleep(delay)


def main():
    sets = load_sets()
    selected_sets = choose_sets(sets)

    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
    except Exception as e:
        print(f"❌ 포트 열기 실패: {e}")
        sys.exit(1)

    time.sleep(1)
    print("세트 매크로를 시작합니다. Ctrl+C 로 종료하세요.")

    try:
        while True:
            set_no = random.choice(selected_sets)
            events = sets[set_no]
            play_set(ser, events, set_no)
    except KeyboardInterrupt:
        print("\n⏹ 사용자 종료")
    finally:
        ser.close()
        print("포트 닫기 완료. 프로그램 종료.")


if __name__ == "__main__":
    main()
