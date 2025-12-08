# stop.py
import time
import serial
import os
from common import PORT, BAUD, SET_STATUS_FILE


def send_stop_signal():
    """
    Pico로 STOP 신호를 보내고,
    세트 매크로 상태 파일도 제거한다.
    """

    print("🛑 STOP 요청 시작")

    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
        time.sleep(0.3)

        # Pico 측에서 모든 키를 up 처리하도록 명시적으로 STOP 전송
        ser.write(b"STOP\n")
        ser.flush()
        time.sleep(0.2)

        ser.close()
        print("✅ STOP 전송 완료 (Pico)")

    except Exception as e:
        print(f"⚠ STOP 전송 실패: {e}")

    # 상태파일 삭제 (세트 매크로 GUI 상태 리셋용)
    try:
        if os.path.exists(SET_STATUS_FILE):
            os.remove(SET_STATUS_FILE)
            print("🗑 상태 파일 삭제 완료")
    except:
        pass

    print("🛑 STOP 처리 종료")
