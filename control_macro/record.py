# record.py
import os
import sys
import time
import json
import string
import ctypes  # 콘솔 동적 생성용 (Windows)
from common import MACRO_SETS_FILE

try:
    import keyboard
except ImportError:
    keyboard = None


# ───────── 콘솔 동적 생성/해제 (GUI exe에서도 콘솔 띄우기) ─────────
def ensure_console():
    """
    GUI로 빌드된 exe(--noconsole)에서도
    이 함수를 호출하면 별도 콘솔창을 띄워서 print 로그를 볼 수 있게 해준다.
    """
    if os.name != "nt":
        return

    kernel32 = ctypes.windll.kernel32

    # 이미 콘솔이 붙어 있으면 재생성 안 함
    if kernel32.GetConsoleWindow():
        return

    # 새 콘솔 생성
    kernel32.AllocConsole()
    # 표준 입출력 핸들을 새 콘솔에 연결
    sys.stdout = open("CONOUT$", "w", encoding="utf-8", buffering=1)
    sys.stderr = open("CONOUT$", "w", encoding="utf-8", buffering=1)
    sys.stdin = open("CONIN$", "r", encoding="utf-8")


def free_console():
    """
    AllocConsole로 연 콘솔창을 닫는다.
    (record_set 종료 시 자동 호출)
    """
    if os.name != "nt":
        return

    kernel32 = ctypes.windll.kernel32
    if kernel32.GetConsoleWindow():
        kernel32.FreeConsole()


# ───────── 세트 녹화 본체 ─────────
def record_set(set_no: int):
    ensure_console()  # 🔹 여기서 콘솔창 만들어 줌

    if keyboard is None:
        print("keyboard 모듈이 필요합니다: pip install keyboard")
        time.sleep(1.5)
        free_console()
        return

    print(f"=== Set Record Mode (세트 {set_no}) ===")
    print()
    print("이 콘솔 창에서 다음 키를 사용하세요:")
    print("  • F9 : 녹화 시작")
    print("  • F10: 녹화 종료 및 저장")
    print()
    print("※ 이 창이 활성화된 상태에서 F9/F10 및 키 입력을 하세요.")
    print()

    letters = set(string.ascii_uppercase)
    digits = {str(i) for i in range(10)}
    func_keys = {f"F{i}" for i in range(1, 13) if i not in (9, 10)}
    special_keys = {
        "SPACE",
        "ENTER",
        "SHIFT",
        "CTRL",
        "ALT",
        "TAB",
        "ESC",
        "UP",
        "DOWN",
        "LEFT",
        "RIGHT",
    }

    ALLOWED = letters | digits | func_keys | special_keys

    events = []
    recording = False
    done = False
    start_time = None

    def hook(ev):
        nonlocal recording, start_time, done

        key = (ev.name or "").upper()

        # ───────────────────────────────
        # F9 / F10 은 항상 녹화 제외 (핫키 전용)
        # ───────────────────────────────
        if key == "F9":
            if ev.event_type == "down":
                recording = True
                start_time = time.time()
                events.clear()
                print("\n▶▶▶ 녹화 시작됨 (F10 누르면 종료 & 저장) ◀◀◀\n")
            return  # ← F9 up 도 여기서 걸러짐

        if key == "F10":
            if ev.event_type == "down":
                print("\n⏹ F10 입력 → 녹화 종료 요청\n")
                recording = False
                done = True
            return  # ← up 이벤트도 완전히 차단됨

        # ───────── F9/F10 제외하고 실제 키 기록 ─────────
        if not recording or start_time is None:
            return
        if key not in ALLOWED:
            return

        timestamp = time.time() - start_time
        events.append({"type": ev.event_type, "key": key, "time": timestamp})

        idx = len(events)
        print(f"[#{idx:03d}] {ev.event_type:<4} - {key:<6} @ {timestamp:7.3f}초")

    keyboard.hook(hook)

    try:
        while not done:
            time.sleep(0.05)
    except KeyboardInterrupt:
        print("\n사용자 강제 종료(Ctrl+C)")
    finally:
        keyboard.unhook_all()

    if not events:
        print("⚠ 녹화된 이벤트가 없어 저장하지 않습니다.")
        time.sleep(1.5)  # 잠깐 보여주고
        free_console()  # 🔹 콘솔 자동 닫기
        return

    # ───────── macro_sets.json에 세트 저장 ─────────
    sets = {}
    if os.path.exists(MACRO_SETS_FILE):
        try:
            with open(MACRO_SETS_FILE, "r", encoding="utf-8") as f:
                sets = json.load(f).get("sets", {})
        except Exception as e:
            print(f"⚠ 기존 macro_sets.json 읽기 실패, 새로 생성합니다: {e}")
            sets = {}

    sets[str(set_no)] = events

    try:
        with open(MACRO_SETS_FILE, "w", encoding="utf-8") as f:
            json.dump({"sets": sets}, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 세트 {set_no} 저장 완료!")
        print(f"   → 저장 파일: {MACRO_SETS_FILE}")
        print(f"   → 이벤트 개수: {len(events)}개")
    except Exception as e:
        print(f"\n❌ 세트 {set_no} 저장 실패: {e}")

    # 잠깐 요약 보여주고 콘솔 자동 닫기
    print("\n이 콘솔 창은 곧 자동으로 닫힙니다...")
    time.sleep(1.5)
    free_console()
