# main.py
import os
import sys
import time
import json
import random
import ctypes
import threading
import subprocess
import string

import serial

# GUI 관련 모듈은 gui 모드일 때만 import (콘솔 모드에서도 문제 안 나게)
try:
    import tkinter as tk
    from tkinter import ttk, simpledialog, messagebox
except ImportError:
    tk = None
    ttk = None
    simpledialog = None

# keyboard 훅은 녹화 모드에서만 사용
try:
    import keyboard
except ImportError:
    keyboard = None


# ───────── 공통 경로 유틸 ─────────
def get_base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


BASE_DIR = get_base_dir()
PORT = "COM4"
BAUD = 115200

MACRO_FILE = os.path.join(BASE_DIR, "macro.json")
MACRO_SETS_FILE = os.path.join(BASE_DIR, "macro_sets.json")
SET_STATUS_FILE = os.path.join(BASE_DIR, "set_macro_status.json")  # 세트 상태 공유용

# ───────── 사람 손 같은 랜덤화 파라미터 (단일 매크로 인간화용) ─────────
EVENT_JITTER = 0.01  # 각 이벤트별 타이밍 오차 ±0.01초 (10ms)
HOLD_MIN = 0.90  # 홀드타임 90% ~
HOLD_MAX = 1.10  # 홀드타임 110%


# ======================================================================
# 1. 단일 매크로 녹화 모드 (기존 record.py)
# ======================================================================
def mode_record_single():
    if keyboard is None:
        print("keyboard 모듈이 없습니다. pip install keyboard 이후 다시 시도하세요.")
        input("엔터를 누르면 종료합니다.")
        return

    print("=== Pico Macro Recorder (단일 매크로) ===")
    print(
        "⚠ 키 후킹을 위해 이 프로그램 전체를 '관리자 권한으로 실행'하는 것을 권장합니다."
    )
    print("F9 = 녹화 시작, F10 = 녹화 종료")

    letters = {c for c in string.ascii_uppercase}
    digits = {str(i) for i in range(10)}
    func_keys = {f"F{i}" for i in range(1, 13)}
    others = {
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
    ALLOWED_KEYS = letters | digits | func_keys | others

    events = []
    recording = False
    start_time = None
    done = False

    def record_event(e):
        nonlocal recording, start_time, done

        key = (e.name or "").upper()

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

        events.append({"type": e.event_type, "key": key, "time": timestamp})

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
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"✅ 저장 완료: {MACRO_FILE} (이벤트 {len(events)}개)")

    print("1~2초 후 창을 닫아도 됩니다.")
    time.sleep(1.5)


# ======================================================================
# 2. 세트 녹화 모드 (기존 set_record.py)
# ======================================================================
def mode_record_set(set_no: int):
    if keyboard is None:
        print("keyboard 모듈이 없습니다. pip install keyboard 이후 다시 시도하세요.")
        input("엔터를 누르면 종료합니다.")
        return

    if not (1 <= set_no <= 10):
        print("세트 번호는 1~10 사이여야 합니다.")
        input("엔터를 누르면 종료합니다.")
        return

    print(f"=== Pico Macro Set Recorder (세트 {set_no}) ===")
    print(
        "⚠ 키 후킹을 위해 이 프로그램 전체를 '관리자 권한으로 실행'하는 것을 권장합니다."
    )
    print("F9 = 녹화 시작, F10 = 녹화 종료")

    letters = {c for c in string.ascii_uppercase}
    digits = {str(i) for i in range(10)}
    func_keys = {f"F{i}" for i in range(1, 13)}
    others = {
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
    ALLOWED_KEYS = letters | digits | func_keys | others

    events = []
    recording = False
    start_time = None
    done = False

    def record_event(e):
        nonlocal recording, start_time, done

        key = (e.name or "").upper()

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

        events.append({"type": e.event_type, "key": key, "time": timestamp})

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
        print("⚠ 녹화된 이벤트가 없어 macro_sets.json을 수정하지 않습니다.")
    else:
        sets = {}
        if os.path.exists(MACRO_SETS_FILE):
            try:
                with open(MACRO_SETS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    sets = data.get("sets", {})
            except Exception as e:
                print(f"⚠ 기존 macro_sets.json 읽기 실패, 새로 만듭니다: {e}")
                sets = {}

        sets[str(set_no)] = events
        data = {"sets": sets}

        with open(MACRO_SETS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"✅ 세트 {set_no} 저장 완료: {MACRO_SETS_FILE} (이벤트 {len(events)}개)")

    print("1~2초 후 창을 닫아도 됩니다.")
    time.sleep(1.5)


# ======================================================================
# 3. 세트 매크로 모드 (기존 set_macro.py)
# ======================================================================
MIN_SET_DELAY = -0.1  # 세트 간 최소 텀 (살짝 당겨질 수도 있게 음수 허용)
MAX_SET_DELAY = 0.00  # 세트 간 최대 텀 (0~80ms 랜덤)


def mode_set_macro(selected_cli=None, repeat_count=None):
    def write_status(state: dict):
        """세트 매크로 상태를 JSON 파일로 저장 (GUI에서 읽어서 표시)"""
        try:
            with open(SET_STATUS_FILE, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False)
        except Exception:
            pass

    last_status_write = 0.0  # 상태 파일 쓰기 주기 조절용

    def load_sets():
        if not os.path.exists(MACRO_SETS_FILE):
            print("⚠ macro_sets.json 파일이 없습니다. 먼저 세트 녹화를 하세요.")
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
        # 콘솔 있는 환경에서만 물어봄
        try:
            if sys.stdin is None or not sys.stdin.isatty():
                print("※ 콘솔 입력이 없어 모든 세트를 사용합니다.")
                return sorted(sets.keys())
        except Exception:
            print("※ 콘솔 상태 확인 실패 → 모든 세트를 사용합니다.")
            return sorted(sets.keys())

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

    def compute_set_duration(events):
        if not events:
            return 0.0
        return float(max(ev.get("time", 0.0) for ev in events))

    def play_set(
        ser,
        events,
        set_no,
        loop_index,
        loop_total,
        selected_sets,
        global_start,
        set_duration,
    ):
        """
        세트 하나를 재생하면서, 이벤트마다 상태 파일을 주기적으로 갱신.
        loop_index / loop_total / set_no 기준으로 GUI에 실시간 진행 상황 전달.
        """
        nonlocal last_status_write

        print(f"\n▶ 세트 {set_no} 실행 (이벤트 {len(events)}개)")
        start_set = time.time()
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

            # ── 실시간 상태 갱신 ──
            now = time.time()
            elapsed_set = now - start_set
            elapsed_global = now - global_start

            if set_duration > 0:
                progress = min(100.0, (elapsed_set / set_duration) * 100.0)
            else:
                progress = 0.0

            # 50ms 이상 간격으로만 상태 파일 갱신
            if now - last_status_write >= 0.05:
                last_status_write = now
                write_status(
                    {
                        "running": True,
                        "selected_sets": selected_sets,
                        "loop_index": loop_index,
                        "loop_total": loop_total,
                        "set_no": set_no,
                        "set_duration": set_duration,
                        "last_loop_elapsed": elapsed_set,
                        "total_elapsed": elapsed_global,
                        "progress": progress,
                    }
                )

        # 세트 사이 랜덤 텀
        delay = random.uniform(MIN_SET_DELAY, MAX_SET_DELAY)
        if delay > 0:
            time.sleep(delay)

    # ── 세트 선택 ──
    sets = load_sets()

    if selected_cli:
        selected_sets = sorted({n for n in selected_cli if n in sets})
        if not selected_sets:
            print("지정한 세트가 macro_sets.json에 없습니다. 전체 세트 사용합니다.")
            selected_sets = sorted(sets.keys())
    else:
        selected_sets = choose_sets(sets)

    # 세트별 예상 길이 계산
    set_durations = {no: compute_set_duration(sets[no]) for no in selected_sets}
    avg_duration = (
        sum(set_durations.values()) / len(set_durations) if set_durations else 0.0
    )

    # 반복 횟수 정보 출력
    if repeat_count is not None and repeat_count > 0:
        est_total = avg_duration * repeat_count
        print("==========================================")
        print(f"사용 세트 : {', '.join(map(str, selected_sets))}")
        print(f"평균 세트 길이 ≈ {avg_duration:.3f}초")
        print(f"반복 횟수 : {repeat_count}회")
        print(f"총 예상 시간 ≈ {est_total:.1f}초 (대략)")
        print("==========================================")
    else:
        print("==========================================")
        print(f"사용 세트 : {', '.join(map(str, selected_sets))}")
        print(f"평균 세트 길이 ≈ {avg_duration:.3f}초")
        print("반복 횟수 : 무한 루프 (Ctrl+C 또는 GUI STOP으로 종료)")
        print("==========================================")

    # 초기 상태 기록
    write_status(
        {
            "running": False,
            "selected_sets": selected_sets,
            "loop_index": 0,
            "loop_total": repeat_count or 0,
            "set_no": None,
            "set_duration": 0.0,
            "last_loop_elapsed": 0.0,
            "total_elapsed": 0.0,
            "progress": 0.0,
        }
    )

    # ── 피코 포트 열기 ──
    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
    except Exception as e:
        print(f"❌ 포트 열기 실패: {e}")
        sys.exit(1)

    time.sleep(1)
    global_start = time.time()
    loops_done = 0

    try:
        # 유한 반복
        if repeat_count is not None and repeat_count > 0:
            total = repeat_count
            for i in range(1, total + 1):
                set_no = random.choice(selected_sets)
                duration = set_durations.get(set_no, 0.0)
                loops_done += 1

                loop_start = time.time()
                print(f"\n[{i}/{total}] 세트 {set_no} 실행 (예상 {duration:.3f}초)")

                # 실시간 상태 업데이트 버전 play_set 호출
                play_set(
                    ser,
                    sets[set_no],
                    set_no,
                    loop_index=i,
                    loop_total=total,
                    selected_sets=selected_sets,
                    global_start=global_start,
                    set_duration=duration,
                )

                loop_elapsed = time.time() - loop_start
                elapsed = time.time() - global_start
                progress = (i / total) * 100.0

                print(
                    f"  → 이번 세트 실제 소요: {loop_elapsed:.3f}초 "
                    f"(예상 {duration:.3f}초)"
                )
                print(
                    f"  → 누적 실행 시간: {elapsed:.1f}초, "
                    f"진행률: {progress:.1f}% (세트 {loops_done}회 완료)"
                )

                # 세트 끝난 뒤 최종 상태 한 번 더 기록
                write_status(
                    {
                        "running": True,
                        "selected_sets": selected_sets,
                        "loop_index": i,
                        "loop_total": total,
                        "set_no": set_no,
                        "set_duration": duration,
                        "last_loop_elapsed": loop_elapsed,
                        "total_elapsed": elapsed,
                        "progress": progress,
                    }
                )

            print("\n✅ 설정한 반복 횟수를 모두 완료했습니다.")
        else:
            # 무한 반복
            print("무한 반복 모드입니다. Ctrl+C 로 종료하세요.")
            while True:
                set_no = random.choice(selected_sets)
                duration = set_durations.get(set_no, 0.0)
                loops_done += 1

                loop_start = time.time()
                print(
                    f"\n[{loops_done}] 세트 {set_no} 실행 "
                    f"(예상 {duration:.3f}초, 무한 루프)"
                )

                # loop_total=0 → GUI에서 "무한"으로 표시
                play_set(
                    ser,
                    sets[set_no],
                    set_no,
                    loop_index=loops_done,
                    loop_total=0,
                    selected_sets=selected_sets,
                    global_start=global_start,
                    set_duration=duration,
                )

                loop_elapsed = time.time() - loop_start
                elapsed = time.time() - global_start

                print(
                    f"  → 이번 세트 실제 소요: {loop_elapsed:.3f}초 "
                    f"(예상 {duration:.3f}초)"
                )
                print(
                    f"  → 누적 실행 시간: {elapsed:.1f}초 "
                    f"(총 세트 {loops_done}회 실행됨)"
                )

                write_status(
                    {
                        "running": True,
                        "selected_sets": selected_sets,
                        "loop_index": loops_done,
                        "loop_total": 0,
                        "set_no": set_no,
                        "set_duration": duration,
                        "last_loop_elapsed": loop_elapsed,
                        "total_elapsed": elapsed,
                        "progress": 0.0,
                    }
                )
    except KeyboardInterrupt:
        print("\n⏹ 사용자 종료 (Ctrl+C)")
    finally:
        ser.close()
        total_elapsed = time.time() - global_start
        print(
            f"포트 닫기 완료. 총 실행 시간 {total_elapsed:.1f}초, "
            f"총 세트 {loops_done}회 실행. 프로그램 종료."
        )
        # 종료 상태 기록
        write_status(
            {
                "running": False,
                "selected_sets": selected_sets,
                "loop_index": loops_done,
                "loop_total": repeat_count or 0,
                "set_no": None,
                "set_duration": 0.0,
                "last_loop_elapsed": 0.0,
                "total_elapsed": total_elapsed,
                "progress": 100.0 if repeat_count else 0.0,
            }
        )


# ======================================================================
# 4. GUI 모드
# ======================================================================

# GUI 전역
root = None
log_box = None
label_total = None
label_time = None
label_repeat = None
label_set_status = None
progress_var = None
progress_bar = None
repeat_var = None
set_repeat_var = None

stream_stop_request = False
set_macro_proc = None  # 같은 exe를 set-macro 모드로 띄울 때 핸들


def humanize_events(events):
    if not events:
        return [], 0.0

    original_total = float(events[-1].get("time", 0.0))
    global_speed = 1.0
    base_offset = 0.0

    n = len(events)
    new_times = [None] * n

    key_stack = {}
    pairs = []

    for idx, ev in enumerate(events):
        ev_type = str(ev.get("type", "down")).lower()
        key = (ev.get("key") or "").upper()
        if ev_type == "down":
            key_stack.setdefault(key, []).append(idx)
        elif ev_type == "up":
            stack = key_stack.get(key)
            if stack:
                down_idx = stack.pop(0)
                pairs.append((down_idx, idx))

    for down_idx, up_idx in pairs:
        down_ev = events[down_idx]
        up_ev = events[up_idx]

        t_down = float(down_ev.get("time", 0.0))
        t_up = float(up_ev.get("time", 0.0))
        hold_orig = max(0.01, t_up - t_down)

        hold_factor = random.uniform(HOLD_MIN, HOLD_MAX)
        hold_new = hold_orig * hold_factor

        jitter_down = random.uniform(EVENT_JITTER * -1, EVENT_JITTER)
        down_new = max(0.0, t_down * global_speed + base_offset + jitter_down)
        up_new = down_new + hold_new

        new_times[down_idx] = down_new
        new_times[up_idx] = up_new

    for idx, ev in enumerate(events):
        if new_times[idx] is not None:
            continue
        t = float(ev.get("time", 0.0))
        jitter = random.uniform(EVENT_JITTER * -1, EVENT_JITTER)
        new_times[idx] = max(0.0, t * global_speed + base_offset + jitter)

    min_t = min(new_times)
    new_times = [t - min_t for t in new_times]

    current_total = max(new_times) if new_times else 0.0
    if original_total > 0 and current_total > 0:
        scale = original_total / current_total
        new_times = [t * scale for t in new_times]
        total_time = original_total
    else:
        total_time = current_total

    humanized = []
    for idx, ev in enumerate(events):
        humanized.append(
            {
                "time": new_times[idx],
                "type": ev.get("type", "down"),
                "key": (ev.get("key") or "").upper(),
            }
        )

    humanized.sort(key=lambda e: e["time"])

    return humanized, total_time


def gui_safe_call(fn, *args, **kwargs):
    if root is not None:
        root.after(0, fn, *args, **kwargs)


def gui_log(msg: str):
    print(msg)
    if log_box is not None:

        def _():
            log_box.insert(tk.END, msg + "\n")
            log_box.see(tk.END)

        gui_safe_call(_)


def format_time(sec: float) -> str:
    sec = max(0, int(sec))
    m, s = divmod(sec, 60)
    if m >= 60:
        h, m = divmod(m, 60)
        return f"{h:d}:{m:02d}:{s:02d}"
    else:
        return f"{m:02d}:{s:02d}"


def update_total_label(total_sec: float):
    def _():
        if label_total is None:
            return
        if total_sec <= 0:
            txt = "총 녹화 길이: 0초"
        else:
            txt = f"총 녹화 길이: {format_time(total_sec)}"
        label_total.config(text=txt)

    gui_safe_call(_)


def update_play_time_label(current_sec: float, total_sec: float):
    def _():
        if label_time is None:
            return
        txt = f"현재 재생: {format_time(current_sec)} / {format_time(total_sec)}"
        label_time.config(text=txt)

    gui_safe_call(_)


def update_repeat_label(current: int, total: int):
    def _():
        if label_repeat is None:
            return
        if total <= 0:
            txt = "반복: 설정 없음"
        else:
            txt = f"반복: {current}/{total} 회차"
        label_repeat.config(text=txt)

    gui_safe_call(_)


def update_progress(percent: float):
    def _():
        if progress_var is None:
            return
        p = max(0.0, min(100.0, percent))
        progress_var.set(p)

    gui_safe_call(_)


def poll_set_status():
    """SET_STATUS_FILE을 읽어서 세트 매크로 상태를 GUI 라벨에 표시"""
    global label_set_status, label_total, label_time, label_repeat

    if root is None:
        return

    txt = "세트 매크로: 정지됨"

    try:
        if os.path.exists(SET_STATUS_FILE):
            with open(SET_STATUS_FILE, "r", encoding="utf-8") as f:
                st = json.load(f)

            running = bool(st.get("running"))
            if running:
                loop_idx = int(st.get("loop_index", 0) or 0)
                loop_total = int(st.get("loop_total", 0) or 0)
                set_no = st.get("set_no") or "?"
                total_elapsed = float(st.get("total_elapsed", 0.0) or 0.0)
                set_duration = float(st.get("set_duration", 0.0) or 0.0)
                progress = float(st.get("progress", 0.0) or 0.0)

                # 상태 텍스트 (아래쪽 요약 라벨)
                if loop_total > 0:
                    txt = (
                        f"세트 매크로: {loop_idx}/{loop_total}회, "
                        f"현재 세트 {set_no}, 누적 {total_elapsed:.1f}초"
                    )
                else:
                    txt = (
                        f"세트 매크로: {loop_idx}회 실행, "
                        f"현재 세트 {set_no}, 누적 {total_elapsed:.1f}초"
                    )

                # 위쪽 3개 라벨도 "현재 세트 기준"으로 실시간 갱신
                if label_total is not None:
                    if set_duration > 0:
                        label_total.config(
                            text=f"세트 길이(예상): {set_duration:.2f}초"
                        )
                    else:
                        label_total.config(text="세트 길이(예상): -")

                if label_time is not None:
                    label_time.config(
                        text=f"현재 세트 {set_no} / 누적 실행 {format_time(total_elapsed)}"
                    )

                if label_repeat is not None:
                    if loop_total > 0:
                        label_repeat.config(text=f"반복: {loop_idx}/{loop_total} 회")
                    else:
                        label_repeat.config(text=f"반복: {loop_idx} 회 (무한)")

                update_progress(progress)
            else:
                txt = "세트 매크로: 정지됨"
        else:
            txt = "세트 매크로: 정지됨"

    except Exception:
        txt = "세트 매크로: 상태 읽기 오류"

    if label_set_status is not None:
        label_set_status.config(text=txt)

    # 0.5초마다 상태 다시 체크
    root.after(500, poll_set_status)


# ───────── GUI: 외부 모드(같은 exe) 호출 ─────────
def gui_start_record_single():
    if getattr(sys, "frozen", False):
        exe_path = sys.executable
        args = [exe_path, "record"]
    else:
        exe_path = sys.executable
        script_path = os.path.abspath(__file__)
        args = [exe_path, script_path, "record"]

    gui_log("▶ 단일 매크로 녹화를 위한 record 모드를 실행합니다...")
    try:
        subprocess.Popen(
            args,
            cwd=BASE_DIR,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
    except Exception as e:
        gui_log(f"❌ record 모드 실행 실패: {e}")


def gui_start_record_set():
    global root
    set_no = simpledialog.askinteger(
        "세트 번호 선택",
        "녹화할 세트 번호를 입력하세요 (1~10):",
        minvalue=1,
        maxvalue=10,
        parent=root,
    )
    if not set_no:
        gui_log("세트 녹화가 취소되었습니다.")
        return

    if getattr(sys, "frozen", False):
        exe_path = sys.executable
        args = [exe_path, "set-record", str(set_no)]
    else:
        exe_path = sys.executable
        script_path = os.path.abspath(__file__)
        args = [exe_path, script_path, "set-record", str(set_no)]

    gui_log(f"▶ 세트 {set_no} 녹화를 위한 set-record 모드를 실행합니다...")
    try:
        subprocess.Popen(
            args,
            cwd=BASE_DIR,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
    except Exception as e:
        gui_log(f"❌ set-record 실행 실패: {e}")


def gui_start_set_macro():
    """
    이 exe를 'set-macro R=N [세트목록]' 모드로 새 콘솔에서 실행
    - 세트 선택: 체크박스
    - 선택 세트 삭제 버튼 포함
    """
    global set_macro_proc, set_repeat_var, root

    if set_macro_proc is not None and set_macro_proc.poll() is None:
        gui_log("⚠ 세트 매크로가 이미 실행 중입니다.")
        return

    # ── macro_sets.json에서 세트 정보 읽기 ──
    sets_raw = {}
    available_nums = []

    try:
        if os.path.exists(MACRO_SETS_FILE):
            with open(MACRO_SETS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            sets_raw = data.get("sets", {}) or {}

            for k, v in sets_raw.items():
                try:
                    n = int(k)
                except ValueError:
                    continue
                if v:
                    available_nums.append(n)

            available_nums = sorted(set(available_nums))
    except Exception as e:
        gui_log(f"⚠ macro_sets.json 읽기 실패: {e}")
        sets_raw = {}
        available_nums = []

    if not available_nums:
        gui_log("⚠ macro_sets.json에 사용할 수 있는 세트가 없습니다.")
        return

    # ── 체크박스 다이얼로그 구성 ──
    dialog = tk.Toplevel(root)
    dialog.title("세트 선택 / 삭제")
    dialog.resizable(False, False)
    dialog.transient(root)
    dialog.grab_set()

    frame = tk.Frame(dialog)
    frame.pack(padx=10, pady=10)

    tk.Label(
        frame,
        text="실행할 세트를 선택하세요:",
        font=("맑은 고딕", 10, "bold"),
    ).grid(row=0, column=0, sticky="w", pady=(0, 5))

    # 세트 번호 -> IntVar / Checkbutton 저장
    vars_map = {}  # {세트번호: IntVar}
    chk_widgets = {}  # {세트번호: Checkbutton}

    row = 1
    for n in available_nums:
        var = tk.IntVar(value=1)  # 기본은 모두 선택
        vars_map[n] = var
        ev_list = sets_raw.get(str(n))
        ev_count = len(ev_list) if isinstance(ev_list, list) else 0
        text = f"세트 {n} (이벤트 {ev_count}개)"

        chk = tk.Checkbutton(
            frame,
            text=text,
            variable=var,
            anchor="w",
            justify="left",
        )
        chk.grid(row=row, column=0, sticky="w")
        chk_widgets[n] = chk
        row += 1

    # ── 버튼 영역 ──
    btn_frame = tk.Frame(frame)
    btn_frame.grid(row=row, column=0, pady=(8, 0), sticky="ew")

    result = {"ok": False, "selected": None}

    def select_all():
        for v in vars_map.values():
            v.set(1)

    def clear_all():
        for v in vars_map.values():
            v.set(0)

    def delete_selected():
        # 체크된 세트들 삭제
        to_del = [n for n, v in vars_map.items() if v.get() == 1]
        if not to_del:
            messagebox.showinfo("알림", "삭제할 세트를 선택하세요.")
            return

        if not messagebox.askyesno(
            "확인",
            f"정말로 다음 세트를 삭제할까요?\n{', '.join(map(str, to_del))}",
            parent=dialog,
        ):
            return

        # sets_raw에서 삭제 후 파일 저장
        for n in to_del:
            sets_raw.pop(str(n), None)

        try:
            with open(MACRO_SETS_FILE, "w", encoding="utf-8") as f:
                json.dump({"sets": sets_raw}, f, ensure_ascii=False, indent=2)
            gui_log(f"🗑 삭제된 세트: {', '.join(map(str, to_del))}")
        except Exception as e:
            messagebox.showerror(
                "오류", f"macro_sets.json 저장 실패: {e}", parent=dialog
            )
            return

        # UI에서 해당 체크박스 제거
        for n in to_del:
            chk = chk_widgets.get(n)
            if chk is not None:
                chk.destroy()
            vars_map.pop(n, None)
            chk_widgets.pop(n, None)

        if not vars_map:
            messagebox.showinfo("알림", "모든 세트가 삭제되었습니다.", parent=dialog)
            dialog.destroy()

    def on_ok():
        # 체크된 세트들 수집
        selected = [n for n, v in vars_map.items() if v.get() == 1]

        # 아무 것도 선택 안 하면 "남아있는 모든 세트" 실행
        if not selected:
            remaining = []
            for k, v in sets_raw.items():
                try:
                    n = int(k)
                except ValueError:
                    continue
                if v:
                    remaining.append(n)
            remaining = sorted(set(remaining))
            if not remaining:
                messagebox.showwarning(
                    "경고", "실행 가능한 세트가 없습니다.", parent=dialog
                )
                return
            selected = remaining

        result["ok"] = True
        result["selected"] = sorted(selected)
        dialog.destroy()

    def on_cancel():
        dialog.destroy()

    # 버튼 배치
    ttk.Button(btn_frame, text="전체 선택", command=select_all, width=10).grid(
        row=0, column=0, padx=3, pady=2
    )
    ttk.Button(btn_frame, text="전체 해제", command=clear_all, width=10).grid(
        row=0, column=1, padx=3, pady=2
    )
    ttk.Button(
        btn_frame, text="선택 세트 삭제", command=delete_selected, width=14
    ).grid(row=0, column=2, padx=3, pady=2)

    ttk.Button(btn_frame, text="확인", command=on_ok, width=10).grid(
        row=1, column=1, padx=3, pady=(6, 2)
    )
    ttk.Button(btn_frame, text="취소", command=on_cancel, width=10).grid(
        row=1, column=2, padx=3, pady=(6, 2)
    )

    # 다이얼로그가 닫힐 때까지 대기
    root.wait_window(dialog)

    if not result["ok"]:
        gui_log("세트 매크로 실행이 취소되었습니다.")
        return

    cli_sets = result["selected"]

    # ── 반복 횟수 읽기 (0 = 무한) ──
    repeat_count = 0
    try:
        repeat_count = int(set_repeat_var.get())
    except Exception:
        repeat_count = 0

    # ── 실행 인자 구성 ──
    if getattr(sys, "frozen", False):
        exe_path = sys.executable
        args = [exe_path, "set-macro"]
    else:
        exe_path = sys.executable
        script_path = os.path.abspath(__file__)
        args = [exe_path, script_path, "set-macro"]

    if repeat_count > 0:
        args.append(f"R={repeat_count}")

    args += [str(n) for n in cli_sets]

    try:
        set_macro_proc = subprocess.Popen(
            args,
            cwd=BASE_DIR,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        gui_log("▶ 세트 매크로 실행을 시작했습니다.")
        if cli_sets:
            gui_log("   → 선택 세트: " + ", ".join(map(str, cli_sets)))
        else:
            gui_log("   → 모든 세트 사용")

        if repeat_count > 0:
            gui_log(f"   → 반복 횟수: {repeat_count}회")
        else:
            gui_log("   → 반복 횟수: 무한 루프")
    except Exception as e:
        gui_log(f"❌ 세트 매크로 실행 실패: {e}")
        set_macro_proc = None


# ───────── GUI: 단일 매크로 스트리밍 ─────────
def gui_play_macro_stream():
    global stream_stop_request

    if not os.path.exists(MACRO_FILE):
        gui_log("⚠ macro.json 파일이 없습니다. 먼저 단일 녹화를 해주세요.")
        return

    try:
        with open(MACRO_FILE, "r", encoding="utf-8") as f:
            base_events = json.load(f)
    except Exception as e:
        gui_log(f"❌ macro.json 읽기 실패: {e}")
        return

    if not base_events:
        gui_log("⚠ macro.json이 비어 있습니다.")
        return

    original_total_time = float(base_events[-1].get("time", 0.0))
    update_total_label(original_total_time)
    update_play_time_label(0.0, original_total_time)
    update_progress(0.0)

    try:
        rc = repeat_var.get()
    except Exception:
        rc = 1
    if rc <= 0:
        rc = 1

    gui_log(f"▶ 스트리밍 재생 시작 (이벤트 수: {len(base_events)}, 반복: {rc}회)")

    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
    except Exception as e:
        gui_log(f"❌ 포트 열기 실패: {e}")
        return

    time.sleep(1)

    stream_stop_request = False
    stopped_by_user = False
    pressed_keys = set()

    def send_all_key_up_and_stop():
        nonlocal stopped_by_user, pressed_keys
        try:
            if pressed_keys:
                gui_log(
                    f"🛑 STOP: 눌려 있던 키들 해제: {', '.join(sorted(pressed_keys))}"
                )
            for k in list(pressed_keys):
                try:
                    line_up = f"EV up {k}\n"
                    ser.write(line_up.encode("utf-8"))
                    ser.flush()
                except Exception as e2:
                    gui_log(f"❌ 키 UP 전송 실패({k}): {e2}")
            pressed_keys.clear()

            try:
                ser.write(b"STOP\n")
                ser.flush()
            except Exception as e3:
                gui_log(f"❌ STOP 전송 오류: {e3}")

            gui_log("🛑 STOP + 모든 키 UP 전송 후 스트리밍 종료")
        except Exception as e:
            gui_log(f"❌ STOP 처리 중 예외: {e}")
        stopped_by_user = True

    for rep in range(1, rc + 1):
        if stream_stop_request:
            send_all_key_up_and_stop()
            break

        events, total_time = humanize_events(base_events)
        if total_time <= 0:
            total_time = original_total_time

        update_repeat_label(rep, rc)
        gui_log(f"{rep}회차: 인간화된 길이 ≈ {total_time:.3f}초")

        start_segment = time.time()

        for ev in events:
            if stream_stop_request:
                send_all_key_up_and_stop()
                break

            t = float(ev.get("time", 0.0))
            ev_type = ev.get("type", "down")
            key = (ev.get("key") or "").upper()

            target = start_segment + t

            while True:
                if stream_stop_request:
                    send_all_key_up_and_stop()
                    break

                now = time.time()
                remain = target - now
                elapsed = now - start_segment

                if total_time > 0:
                    update_play_time_label(elapsed, total_time)
                    update_progress(min(100.0, (elapsed / total_time) * 100.0))

                if remain <= 0 or stopped_by_user:
                    break

                time.sleep(min(remain, 0.02))

            if stopped_by_user:
                break

            et_lower = (ev_type or "").lower()
            if et_lower == "down":
                pressed_keys.add(key)
            elif et_lower == "up":
                pressed_keys.discard(key)

            line = f"EV {ev_type} {key}\n"
            try:
                ser.write(line.encode("utf-8"))
                ser.flush()
            except Exception as e:
                gui_log(f"❌ 전송 중 오류: {e}")
                send_all_key_up_and_stop()
                break

        if stopped_by_user:
            break

    if pressed_keys and not stopped_by_user:
        gui_log("마무리: 남은 눌린 키들 UP 전송")
        for k in list(pressed_keys):
            try:
                ser.write(f"EV up {k}\n".encode("utf-8"))
                ser.flush()
            except Exception as e:
                gui_log(f"❌ 마무리 키 UP 전송 실패({k}): {e}")
        pressed_keys.clear()

    ser.close()
    if not stopped_by_user:
        update_play_time_label(original_total_time, original_total_time)
        update_progress(100.0)
        update_repeat_label(rc, rc)
        gui_log("⏹ 스트리밍 전송 완료")


def gui_on_click_play():
    th = threading.Thread(target=gui_play_macro_stream, daemon=True)
    th.start()


def gui_stop_all():
    global stream_stop_request, set_macro_proc

    stream_stop_request = True
    gui_log("🛑 STOP 요청 플래그 설정 (단일 매크로용)")

    if set_macro_proc is not None:
        if set_macro_proc.poll() is None:
            gui_log("🛑 세트 매크로 프로세스를 종료합니다...")
            try:
                set_macro_proc.terminate()
                try:
                    set_macro_proc.wait(timeout=1.0)
                except subprocess.TimeoutExpired:
                    gui_log("⚠ 정상 종료 지연, 강제 종료 시도...")
                    set_macro_proc.kill()
                    set_macro_proc.wait(timeout=1.0)
                gui_log("✅ 세트 매크로 프로세스 종료 완료")
            except Exception as e:
                gui_log(f"❌ 세트 매크로 종료 중 오류: {e}")
        set_macro_proc = None

    try:
        gui_log("▶ 피코에 STOP 신호 전송 시도...")
        s = serial.Serial(PORT, BAUD, timeout=1)
        time.sleep(0.5)
        s.write(b"STOP\n")
        s.flush()
        s.close()
        gui_log("✅ 피코에 STOP 전송 완료")
    except Exception as e:
        gui_log(f"⚠ STOP 전송 실패 (무시 가능): {e}")

    # 상태 파일 삭제(정지)
    try:
        if os.path.exists(SET_STATUS_FILE):
            os.remove(SET_STATUS_FILE)
    except Exception:
        pass


def gui_on_click_stop():
    gui_stop_all()


def gui_on_click_quit():
    gui_stop_all()
    root.destroy()


def main_gui():
    global root, log_box, label_total, label_time, label_repeat
    global label_set_status, progress_var, progress_bar, repeat_var, set_repeat_var

    if tk is None:
        print("tkinter를 사용할 수 없습니다. GUI 모드가 비활성화되어 있습니다.")
        sys.exit(1)

    root = tk.Tk()
    root.title("Pico Macro Controller (단일 + 세트 매크로)")
    root.geometry("540x700")  # 창 크기
    root.resizable(False, False)

    style = ttk.Style()
    style.configure("TButton", font=("맑은 고딕", 11), padding=6)

    log_box = tk.Text(root, height=14, width=62, font=("Consolas", 9))
    log_box.pack(pady=10)

    btn_frame = tk.Frame(root)
    btn_frame.pack(pady=5)

    ttk.Button(
        btn_frame,
        text="🎬 녹화 시작 (단일 매크로)",
        width=32,
        command=gui_start_record_single,
    ).grid(row=0, column=0, padx=5, pady=5, columnspan=2)

    ttk.Button(
        btn_frame,
        text="▶ 매크로 실행 (단일 스트리밍)",
        width=32,
        command=gui_on_click_play,
    ).grid(row=1, column=0, padx=5, pady=5, columnspan=2)

    ttk.Button(
        btn_frame,
        text="🎬 세트 녹화 (1~10)",
        width=32,
        command=gui_start_record_set,
    ).grid(row=2, column=0, padx=5, pady=5, columnspan=2)

    ttk.Button(
        btn_frame,
        text="▶ 세트 매크로 실행 (랜덤)",
        width=32,
        command=gui_start_set_macro,
    ).grid(row=3, column=0, padx=5, pady=5, columnspan=2)

    ttk.Button(
        btn_frame,
        text="🛑 STOP 전송 (전체)",
        width=32,
        command=gui_on_click_stop,
    ).grid(row=4, column=0, padx=5, pady=5, columnspan=2)

    # 단일 매크로 반복
    repeat_var = tk.IntVar(value=1)
    tk.Label(
        btn_frame, text="🔁 반복 횟수 (단일 매크로):", font=("맑은 고딕", 10)
    ).grid(row=5, column=0, padx=5, pady=5, sticky="e")
    tk.Spinbox(btn_frame, from_=1, to=999, textvariable=repeat_var, width=6).grid(
        row=5, column=1, padx=5, pady=5, sticky="w"
    )

    # 세트 매크로 반복
    set_repeat_var = tk.IntVar(value=0)  # 0 = 무한 루프
    tk.Label(
        btn_frame, text="🔁 세트 매크로 반복 (0=무한):", font=("맑은 고딕", 10)
    ).grid(row=6, column=0, padx=5, pady=5, sticky="e")
    tk.Spinbox(btn_frame, from_=0, to=9999, textvariable=set_repeat_var, width=6).grid(
        row=6, column=1, padx=5, pady=5, sticky="w"
    )

    ttk.Button(
        btn_frame,
        text="❌ 종료",
        width=32,
        command=gui_on_click_quit,
    ).grid(row=7, column=0, padx=5, pady=10, columnspan=2)

    info_frame = tk.Frame(root)
    info_frame.pack(pady=5)

    label_total = tk.Label(info_frame, text="총 녹화 길이: -", font=("맑은 고딕", 10))
    label_total.pack(anchor="w")

    label_time = tk.Label(
        info_frame, text="현재 재생: 00:00 / 00:00", font=("맑은 고딕", 10)
    )
    label_time.pack(anchor="w")

    label_repeat = tk.Label(info_frame, text="반복: -", font=("맑은 고딕", 10))
    label_repeat.pack(anchor="w")

    # 세트 매크로 상태 요약 라벨
    label_set_status = tk.Label(
        info_frame, text="세트 매크로: 정지됨", font=("맑은 고딕", 10)
    )
    label_set_status.pack(anchor="w")

    progress_var = tk.DoubleVar(value=0.0)
    progress_bar = ttk.Progressbar(
        info_frame, variable=progress_var, maximum=100, length=500
    )
    progress_bar.pack(pady=5)

    gui_log("프로그램 시작됨.")
    gui_log("1) [🎬 녹화 시작 (단일 매크로)] → record 모드로 macro.json 생성")
    gui_log("2) [▶ 매크로 실행 (단일 스트리밍)] → macro.json 기반 인간화 스트리밍")
    gui_log("3) [🎬 세트 녹화 (1~10)] → set-record 모드로 macro_sets.json에 세트 저장")
    gui_log("4) [▶ 세트 매크로 실행 (랜덤)] → 세트 중 랜덤 선택 반복")
    gui_log("5) [🛑 STOP 전송 (전체)] → 단일/세트 매크로 정지 + 피코에 STOP 전송")
    gui_log("⚠ 이 exe는 '관리자 권한으로 실행'하는 것을 권장합니다.")

    # 세트 매크로 상태 폴링 시작
    root.after(500, poll_set_status)

    root.mainloop()


# ======================================================================
# 5. 엔트리 포인트 (모드 스위치)
# ======================================================================
if __name__ == "__main__":
    # 사용법:
    #   main.py                → GUI 모드 (기본)
    #   main.py gui            → GUI 모드
    #   main.py record         → 단일 매크로 콘솔 녹화
    #   main.py set-record 3   → 3세트 녹화
    #   main.py set-macro      → 세트 매크로 콘솔 실행
    mode = "gui"
    if len(sys.argv) >= 2:
        mode = sys.argv[1].lower()

    if mode in ("gui",):
        main_gui()

    elif mode == "record":
        mode_record_single()

    elif mode == "set-record":
        if len(sys.argv) < 3:
            print("사용법: main.py set-record [세트번호 1~10]")
            input("엔터를 누르면 종료합니다.")
        else:
            try:
                n = int(sys.argv[2])
            except ValueError:
                print("세트 번호는 정수여야 합니다.")
                input("엔터를 누르면 종료합니다.")
            else:
                mode_record_set(n)

    elif mode == "set-macro":
        # 예: main.exe set-macro R=10 1 3 5
        cli_set_nums = []
        repeat_count = None

        for token in sys.argv[2:]:
            up = token.upper()
            if up.startswith("R="):
                try:
                    repeat_count = int(up[2:])
                except ValueError:
                    pass
            else:
                try:
                    n = int(token)
                    cli_set_nums.append(n)
                except ValueError:
                    pass

        mode_set_macro(cli_set_nums or None, repeat_count)

    else:
        print("알 수 없는 모드입니다.")
        print("사용법: ")
        print("  main.py              → GUI 모드")
        print("  main.py gui          → GUI 모드")
        print("  main.py record       → 단일 매크로 녹화")
        print("  main.py set-record N → N 세트 녹화")
        print("  main.py set-macro    → 세트 매크로 실행")
        input("엔터를 누르면 종료합니다.")
