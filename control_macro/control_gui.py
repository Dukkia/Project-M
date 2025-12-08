# control_gui.py
import os
import sys
import json
import subprocess

from common import (
    BASE_DIR,
    MACRO_SETS_FILE,
    SET_STATUS_FILE,
    format_time,
)
from stop import send_stop_signal

try:
    import tkinter as tk
    from tkinter import ttk, simpledialog, messagebox
except ImportError:
    tk = None
    ttk = None
    simpledialog = None
    messagebox = None

root = None
log_box = None
label_total = None
label_time = None
label_repeat = None
label_set_status = None
progress_var = None
progress_bar = None
set_repeat_var = None

set_macro_proc = None  # main.exe macro ... 프로세스 핸들


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


def update_total_label(text: str):
    def _():
        if label_total is not None:
            label_total.config(text=text)

    gui_safe_call(_)


def update_time_label(text: str):
    def _():
        if label_time is not None:
            label_time.config(text=text)

    gui_safe_call(_)


def update_repeat_label(text: str):
    def _():
        if label_repeat is not None:
            label_repeat.config(text=text)

    gui_safe_call(_)


def update_progress(percent: float):
    def _():
        if progress_var is None:
            return
        p = max(0.0, min(100.0, percent))
        progress_var.set(p)

    gui_safe_call(_)


def poll_set_status():
    """
    macro.py에서 주기적으로 쓰는 set_macro_status.json을 읽어서
    세트 매크로 진행 상황을 실시간으로 표시한다.
    """
    global label_set_status

    if root is None:
        return

    text = "세트 매크로: 정지됨"

    try:
        if os.path.exists(SET_STATUS_FILE):
            with open(SET_STATUS_FILE, "r", encoding="utf-8") as f:
                st = json.load(f)

            running = bool(st.get("running", False))
            if running:
                loop_idx = int(st.get("loop_index", 0) or 0)
                loop_total = int(st.get("loop_total", 0) or 0)
                set_no = st.get("set_no") or "?"
                total_elapsed = float(st.get("total_elapsed", 0.0) or 0.0)
                set_duration = float(st.get("set_duration", 0.0) or 0.0)
                last_loop_elapsed = float(st.get("last_loop_elapsed", 0.0) or 0.0)
                progress = float(st.get("progress", 0.0) or 0.0)

                # 상태 문자열
                if loop_total > 0:
                    text = (
                        f"세트 매크로: {loop_idx}/{loop_total}회, "
                        f"현재 세트 {set_no}, 누적 {total_elapsed:.1f}초"
                    )
                else:
                    text = (
                        f"세트 매크로: {loop_idx}회 실행, "
                        f"현재 세트 {set_no}, 누적 {total_elapsed:.1f}초"
                    )

                # 위쪽 상세 라벨들 (실시간)
                if label_total is not None:
                    if set_duration > 0:
                        label_total.config(
                            text=f"세트 길이(예상): {set_duration:.2f}초"
                        )
                    else:
                        label_total.config(text="세트 길이(예상): -")

                if label_time is not None:
                    label_time.config(
                        text=(
                            f"현재 세트 {set_no} 진행: "
                            f"{format_time(last_loop_elapsed)} / {format_time(set_duration)} "
                            f"(누적 {format_time(total_elapsed)})"
                        )
                    )

                if label_repeat is not None:
                    if loop_total > 0:
                        label_repeat.config(text=f"반복: {loop_idx}/{loop_total} 회")
                    else:
                        label_repeat.config(text=f"반복: {loop_idx} 회 (무한)")

                update_progress(progress)
            else:
                text = "세트 매크로: 정지됨"
        else:
            text = "세트 매크로: 정지됨"

    except Exception:
        text = "세트 매크로: 상태 읽기 오류"

    if label_set_status is not None:
        label_set_status.config(text=text)

    root.after(500, poll_set_status)


def get_main_invocation_args(mode: str, *extra_args: str):
    """
    PyInstaller exe로 빌드된 상태와, 그냥 main.py로 실행하는 개발 상태 모두 지원.
    mode: "record", "macro" 등
    """
    if getattr(sys, "frozen", False):
        exe_path = sys.executable
        return [exe_path, mode, *extra_args]
    else:
        exe_path = sys.executable
        script_dir = os.path.dirname(os.path.abspath(__file__))
        main_path = os.path.join(script_dir, "main.py")
        return [exe_path, main_path, mode, *extra_args]


def gui_start_record_set():
    global root

    if simpledialog is None:
        gui_log("⚠ tkinter simpledialog를 사용할 수 없습니다.")
        return

    set_no = simpledialog.askinteger(
        "세트 번호 선택",
        "녹화할 세트 번호를 입력하세요 (1~10):",
        minvalue=1,
        parent=root,
    )
    if not set_no:
        gui_log("세트 녹화가 취소되었습니다.")
        return

    args = get_main_invocation_args("record", str(set_no))

    gui_log(f"▶ 세트 {set_no} 녹화를 위한 record 모드를 실행합니다...")

    try:
        subprocess.Popen(
            args,
            cwd=BASE_DIR,
        )
        gui_log("   → 새로 뜬 콘솔 창에서 F9 / F10을 사용하세요.")
    except Exception as e:
        gui_log(f"❌ set-record 실행 실패: {e}")


def launch_macro_process(cli_sets, repeat_count: int):
    """
    실제로 main.exe macro ... 프로세스를 실행하는 부분.
    (카운트다운이 끝난 후에만 호출)
    """
    global set_macro_proc

    args_extra = []
    if repeat_count > 0:
        args_extra.append(f"R={repeat_count}")
    args_extra += [str(n) for n in cli_sets]

    args = get_main_invocation_args("macro", *args_extra)

    try:
        set_macro_proc = subprocess.Popen(
            args,
            cwd=BASE_DIR,
        )
        gui_log("▶ 세트 매크로 실행을 시작했습니다.")
        gui_log("   → 선택 세트: " + ", ".join(map(str, cli_sets)))
        if repeat_count > 0:
            gui_log(f"   → 반복 횟수: {repeat_count}회")
        else:
            gui_log("   → 반복 횟수: 무한 루프")
    except Exception as e:
        gui_log(f"❌ 세트 매크로 실행 실패: {e}")
        set_macro_proc = None


def start_macro_with_countdown(cli_sets, repeat_count: int, seconds: int = 3):
    """
    세트 매크로 실행 전에 GUI에서 3,2,1 카운트다운을 보여준 뒤
    실제 매크로 프로세스를 실행.
    ※ 카운트다운 동안 아래 정보 라벨들은 건드리지 않고,
       오직 로그창에만 메시지를 남긴다.
    """
    if root is None:
        # 혹시라도 GUI 없이 호출되는 경우를 대비
        launch_macro_process(cli_sets, repeat_count)
        return

    def step(sec_left: int):
        if sec_left > 0:
            # 🔹 밑의 label_set_status 같은 라벨은 건드리지 않고
            #    그냥 로그에만 남긴다.
            gui_log(f"세트 매크로 {sec_left}초 후 시작...")
            root.after(1000, lambda: step(sec_left - 1))
        else:
            gui_log("세트 매크로 시작!")
            # 🔹 여기서도 상태 라벨은 macro.py 쪽 상태 파일에 맡기고
            #    프로세스만 실제로 시작한다.
            launch_macro_process(cli_sets, repeat_count)

    step(seconds)


def gui_start_set_macro():
    """
    - macro_sets.json에서 세트 목록 읽어서 체크박스로 선택
    - 반복 횟수(Spinbox) 읽고
    - 3,2,1 카운트다운 후 main.exe macro [R=N] [세트...] 실행
    """
    global set_macro_proc, root, set_repeat_var

    if set_macro_proc is not None and set_macro_proc.poll() is None:
        gui_log("⚠ 세트 매크로가 이미 실행 중입니다.")
        return

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

    vars_map = {}
    chk_widgets = {}

    row = 1
    for n in available_nums:
        var = tk.IntVar(value=1)
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
        if messagebox is None:
            return

        to_del = [n for n, v in vars_map.items() if v.get() == 1]
        if not to_del:
            messagebox.showinfo("알림", "삭제할 세트를 선택하세요.", parent=dialog)
            return

        if not messagebox.askyesno(
            "확인",
            f"정말로 다음 세트를 삭제할까요?\n{', '.join(map(str, to_del))}",
            parent=dialog,
        ):
            return

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
        selected = [n for n, v in vars_map.items() if v.get() == 1]

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
                if messagebox is not None:
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

    root.wait_window(dialog)

    if not result["ok"]:
        gui_log("세트 매크로 실행이 취소되었습니다.")
        return

    cli_sets = result["selected"]

    # 반복 횟수 읽기 (0 = 무한)
    repeat_count = 0
    try:
        repeat_count = int(set_repeat_var.get())
    except Exception:
        repeat_count = 0

    # 여기서 바로 실행하지 않고, 3,2,1 카운트다운 후 실행
    start_macro_with_countdown(cli_sets, repeat_count, seconds=3)


def gui_on_click_stop():
    global set_macro_proc

    gui_log("🛑 STOP 요청")

    if set_macro_proc is not None and set_macro_proc.poll() is None:
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

    send_stop_signal()
    gui_log("✅ STOP 명령 전송 완료")


def gui_on_click_quit():
    gui_on_click_stop()
    if root is not None:
        root.destroy()


def control_gui():
    global root, log_box, label_total, label_time, label_repeat
    global label_set_status, progress_var, progress_bar, set_repeat_var

    if tk is None:
        print("tkinter를 사용할 수 없어 GUI를 사용할 수 없습니다.")
        sys.exit(1)

    root = tk.Tk()
    root.title("Pico Macro Controller (세트 녹화 + 세트 매크로)")
    root.geometry("540x600")
    root.resizable(False, False)

    style = ttk.Style()
    style.configure("TButton", font=("맑은 고딕", 11), padding=6)

    log_box = tk.Text(root, height=14, width=62, font=("Consolas", 9))
    log_box.pack(pady=10)

    btn_frame = tk.Frame(root)
    btn_frame.pack(pady=5)

    ttk.Button(
        btn_frame,
        text="🎬 세트 녹화 (1~10)",
        width=32,
        command=gui_start_record_set,
    ).grid(row=0, column=0, padx=5, pady=5, columnspan=2)

    ttk.Button(
        btn_frame,
        text="▶ 세트 매크로 실행",
        width=32,
        command=gui_start_set_macro,
    ).grid(row=1, column=0, padx=5, pady=5, columnspan=2)

    ttk.Button(
        btn_frame,
        text="🛑 STOP 전송 (전체)",
        width=32,
        command=gui_on_click_stop,
    ).grid(row=2, column=0, padx=5, pady=5, columnspan=2)

    set_repeat_var = tk.IntVar(value=0)
    tk.Label(
        btn_frame, text="🔁 세트 매크로 반복 (0=무한):", font=("맑은 고딕", 10)
    ).grid(row=3, column=0, padx=5, pady=5, sticky="e")
    tk.Spinbox(btn_frame, from_=0, to=9999, textvariable=set_repeat_var, width=6).grid(
        row=3, column=1, padx=5, pady=5, sticky="w"
    )

    ttk.Button(
        btn_frame,
        text="❌ 종료",
        width=32,
        command=gui_on_click_quit,
    ).grid(row=4, column=0, padx=5, pady=10, columnspan=2)

    info_frame = tk.Frame(root)
    info_frame.pack(pady=5)

    label_total = tk.Label(
        info_frame, text="세트 길이(예상): -", font=("맑은 고딕", 10)
    )
    label_total.pack(anchor="w")

    label_time = tk.Label(
        info_frame, text="현재 세트 진행: 00:00 / 00:00", font=("맑은 고딕", 10)
    )
    label_time.pack(anchor="w")

    label_repeat = tk.Label(info_frame, text="반복: -", font=("맑은 고딕", 10))
    label_repeat.pack(anchor="w")

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
    gui_log("1) [🎬 세트 녹화 (1~10)] → record 모드로 macro_sets.json에 세트 저장")
    gui_log(
        "2) [▶ 세트 매크로 실행] → 선택 세트 랜덤 반복 실행 (3,2,1 카운트다운 후 시작)"
    )
    gui_log("3) [🛑 STOP 전송 (전체)] → 세트 매크로 프로세스 종료 + Pico에 STOP 전송")
    gui_log("⚠ 이 exe는 '관리자 권한으로 실행'하는 것을 권장합니다.")

    root.after(500, poll_set_status)
    root.mainloop()
