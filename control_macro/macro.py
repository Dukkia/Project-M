# macro.py
import os
import time
import json
import random
import serial

from common import (
    PORT,
    BAUD,
    MACRO_SETS_FILE,
    SET_STATUS_FILE,
    MIN_SET_DELAY,
    MAX_SET_DELAY,
)


def write_status(state: dict):
    """세트 매크로 상태를 JSON으로 저장 (GUI에서 poll_set_status로 읽음)."""
    try:
        with open(SET_STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
    except Exception:
        # 상태 파일 쓰기는 실패해도 매크로 자체는 계속 돌아가게
        pass


def compute_set_duration(events):
    if not events:
        return 0.0
    try:
        return float(max(ev.get("time", 0.0) for ev in events))
    except Exception:
        return 0.0


def macro_run(selected_sets, repeat_count: int):
    """
    selected_sets: [1,3,5] 처럼 세트 번호 리스트
    repeat_count: 0 이면 무한, 양수면 해당 횟수만큼 반복
    """
    # macro_sets.json 로드
    if not os.path.exists(MACRO_SETS_FILE):
        print("❌ macro_sets.json 파일이 없습니다. 먼저 세트 녹화를 해주세요.")
        write_status(
            {
                "running": False,
                "selected_sets": [],
                "loop_index": 0,
                "loop_total": repeat_count or 0,
                "set_no": None,
                "set_duration": 0.0,
                "last_loop_elapsed": 0.0,
                "total_elapsed": 0.0,
                "progress": 0.0,
            }
        )
        return

    try:
        with open(MACRO_SETS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ macro_sets.json 읽기 실패: {e}")
        write_status(
            {
                "running": False,
                "selected_sets": [],
                "loop_index": 0,
                "loop_total": repeat_count or 0,
                "set_no": None,
                "set_duration": 0.0,
                "last_loop_elapsed": 0.0,
                "total_elapsed": 0.0,
                "progress": 0.0,
            }
        )
        return

    raw_sets = data.get("sets", {}) or {}

    # 선택된 세트만 필터링
    sets = {}
    for n in selected_sets:
        key = str(n)
        ev_list = raw_sets.get(key)
        if isinstance(ev_list, list) and ev_list:
            sets[n] = ev_list

    if not sets:
        print("❌ 선택한 세트 번호에 해당하는 유효한 세트가 없습니다.")
        write_status(
            {
                "running": False,
                "selected_sets": [],
                "loop_index": 0,
                "loop_total": repeat_count or 0,
                "set_no": None,
                "set_duration": 0.0,
                "last_loop_elapsed": 0.0,
                "total_elapsed": 0.0,
                "progress": 0.0,
            }
        )
        return

    selected_sets_sorted = sorted(sets.keys())
    print("▶ 사용할 세트:", ", ".join(map(str, selected_sets_sorted)))

    # 세트별 예상 길이 계산
    set_durations = {no: compute_set_duration(sets[no]) for no in selected_sets_sorted}
    avg_duration = (
        sum(set_durations.values()) / len(set_durations) if set_durations else 0.0
    )

    if repeat_count > 0:
        est_total = avg_duration * repeat_count
        print("==========================================")
        print(f"사용 세트 : {', '.join(map(str, selected_sets_sorted))}")
        print(f"평균 세트 길이 ≈ {avg_duration:.3f}초")
        print(f"반복 횟수 : {repeat_count}회")
        print(f"총 예상 시간 ≈ {est_total:.1f}초 (대략)")
        print("==========================================")
    else:
        print("==========================================")
        print(f"사용 세트 : {', '.join(map(str, selected_sets_sorted))}")
        print(f"평균 세트 길이 ≈ {avg_duration:.3f}초")
        print("반복 횟수 : 무한 루프 (Ctrl+C 또는 GUI STOP으로 종료)")
        print("==========================================")

    # 초기 상태 기록
    write_status(
        {
            "running": False,
            "selected_sets": selected_sets_sorted,
            "loop_index": 0,
            "loop_total": repeat_count or 0,
            "set_no": None,
            "set_duration": 0.0,
            "last_loop_elapsed": 0.0,
            "total_elapsed": 0.0,
            "progress": 0.0,
        }
    )

    # 포트 열기
    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
    except Exception as e:
        print(f"❌ 포트 열기 실패: {e}")
        write_status(
            {
                "running": False,
                "selected_sets": selected_sets_sorted,
                "loop_index": 0,
                "loop_total": repeat_count or 0,
                "set_no": None,
                "set_duration": 0.0,
                "last_loop_elapsed": 0.0,
                "total_elapsed": 0.0,
                "progress": 0.0,
            }
        )
        return

    global_start = time.time()
    loops_done = 0
    last_status_write = 0.0

    try:
        if repeat_count > 0:
            total_loops = repeat_count
            for i in range(1, total_loops + 1):
                set_no = random.choice(selected_sets_sorted)
                events = sets[set_no]
                duration = set_durations.get(set_no, 0.0)
                loops_done += 1

                loop_start = time.time()
                print(f"\n[{i}/{total_loops}] 세트 {set_no} 실행 (예상 {duration:.3f}초)")

                # 이벤트 재생
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

                    # 상태 업데이트 (실시간)
                    now = time.time()
                    elapsed_set = now - loop_start
                    elapsed_global = now - global_start
                    if duration > 0:
                        progress = min(100.0, (elapsed_set / duration) * 100.0)
                    else:
                        progress = 0.0

                    if now - last_status_write >= 0.05:
                        last_status_write = now
                        write_status(
                            {
                                "running": True,
                                "selected_sets": selected_sets_sorted,
                                "loop_index": i,
                                "loop_total": total_loops,
                                "set_no": set_no,
                                "set_duration": duration,
                                "last_loop_elapsed": elapsed_set,
                                "total_elapsed": elapsed_global,
                                "progress": progress,
                            }
                        )

                # 세트 하나 끝난 후 요약
                loop_elapsed = time.time() - loop_start
                elapsed = time.time() - global_start
                progress_all = (i / total_loops) * 100.0

                print(
                    f"  → 이번 세트 실제 소요: {loop_elapsed:.3f}초 "
                    f"(예상 {duration:.3f}초)"
                )
                print(
                    f"  → 누적 실행 시간: {elapsed:.1f}초, "
                    f"진행률: {progress_all:.1f}% (세트 {loops_done}회 완료)"
                )

                # 세트 종료 상태 한 번 더 기록 (progress 100%)
                write_status(
                    {
                        "running": True,
                        "selected_sets": selected_sets_sorted,
                        "loop_index": i,
                        "loop_total": total_loops,
                        "set_no": set_no,
                        "set_duration": duration,
                        "last_loop_elapsed": loop_elapsed,
                        "total_elapsed": elapsed,
                        "progress": progress_all,
                    }
                )

                # 세트 사이 랜덤 텀
                delay_between = random.uniform(MIN_SET_DELAY, MAX_SET_DELAY)
                if delay_between > 0:
                    time.sleep(delay_between)

            print("\n✅ 설정한 반복 횟수를 모두 완료했습니다.")
        else:
            # 무한 반복
            print("무한 반복 모드입니다. Ctrl+C 또는 GUI STOP으로 종료하세요.")
            while True:
                set_no = random.choice(selected_sets_sorted)
                events = sets[set_no]
                duration = set_durations.get(set_no, 0.0)
                loops_done += 1

                loop_start = time.time()
                print(
                    f"\n[{loops_done}] 세트 {set_no} 실행 "
                    f"(예상 {duration:.3f}초, 무한 루프)"
                )

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

                    now = time.time()
                    elapsed_set = now - loop_start
                    elapsed_global = now - global_start
                    if duration > 0:
                        progress = min(100.0, (elapsed_set / duration) * 100.0)
                    else:
                        progress = 0.0

                    if now - last_status_write >= 0.05:
                        last_status_write = now
                        write_status(
                            {
                                "running": True,
                                "selected_sets": selected_sets_sorted,
                                "loop_index": loops_done,
                                "loop_total": 0,
                                "set_no": set_no,
                                "set_duration": duration,
                                "last_loop_elapsed": elapsed_set,
                                "total_elapsed": elapsed_global,
                                "progress": progress,
                            }
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
                        "selected_sets": selected_sets_sorted,
                        "loop_index": loops_done,
                        "loop_total": 0,
                        "set_no": set_no,
                        "set_duration": duration,
                        "last_loop_elapsed": loop_elapsed,
                        "total_elapsed": elapsed,
                        "progress": 0.0,
                    }
                )

                delay_between = random.uniform(MIN_SET_DELAY, MAX_SET_DELAY)
                if delay_between > 0:
                    time.sleep(delay_between)

    except KeyboardInterrupt:
        print("\n⏹ 사용자 종료 (Ctrl+C)")
    finally:
        total_elapsed = time.time() - global_start
        ser.close()
        print(
            f"포트 닫기 완료. 총 실행 시간 {total_elapsed:.1f}초, "
            f"총 세트 {loops_done}회 실행. 프로그램 종료."
        )
        write_status(
            {
                "running": False,
                "selected_sets": selected_sets_sorted,
                "loop_index": loops_done,
                "loop_total": repeat_count or 0,
                "set_no": None,
                "set_duration": 0.0,
                "last_loop_elapsed": 0.0,
                "total_elapsed": total_elapsed,
                "progress": 100.0 if repeat_count else 0.0,
            }
        )
