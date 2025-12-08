# control.py
import sys

from control_gui import control_gui
from record import record_set
from macro import macro_run
from stop import send_stop_signal


if __name__ == "__main__":
    # 사용법:
    #   main.exe              → GUI 모드
    #   main.exe gui          → GUI 모드
    #   main.exe record N     → 세트 N 녹화
    #   main.exe macro ...    → 세트 매크로 실행
    #   main.exe stop         → Pico STOP 신호 전송
    mode = "gui"

    if len(sys.argv) >= 2:
        mode = sys.argv[1].lower()

    # GUI 모드
    if mode in ("gui",):
        control_gui()

    # 세트 녹화
    elif mode == "record":
        if len(sys.argv) < 3:
            print("사용법: main.exe record [세트번호 1~10]")
            sys.exit(1)

        try:
            n = int(sys.argv[2])
        except ValueError:
            print("세트 번호는 정수여야 합니다.")
            sys.exit(1)

        if n < 1:
            print("세트 번호는 1 이상이어야 합니다.")
            sys.exit(1)

        record_set(n)

    # 세트 매크로 실행
    elif mode == "macro":
        # 예: main.exe macro R=10 1 3 5
        selected_sets = []
        repeat_count = 0  # 0 = 무한

        for token in sys.argv[2:]:
            up = token.upper()
            if up.startswith("R="):
                try:
                    repeat_count = int(up[2:])
                except ValueError:
                    repeat_count = 0
            else:
                try:
                    n = int(token)
                    selected_sets.append(n)
                except ValueError:
                    pass

        if not selected_sets:
            print("사용할 세트 번호를 최소 1개 이상 지정하세요.")
            print("예: main.exe macro R=10 1 3 5")
            sys.exit(1)

        macro_run(selected_sets, repeat_count)

    # STOP만 전송
    elif mode == "stop":
        send_stop_signal()

    else:
        print("알 수 없는 모드입니다:", mode)
        print("사용법:")
        print("  main.exe              → GUI 모드")
        print("  main.exe gui          → GUI 모드")
        print("  main.exe record N     → 세트 N 녹화")
        print("  main.exe macro ...    → 세트 매크로 실행")
        print("  main.exe stop         → Pico STOP 신호 전송")
        sys.exit(1)
