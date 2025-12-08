# common.py
import os
import sys


# ───────── 공통 경로 유틸 ─────────
def get_base_dir():
    """
    실행 파일(PyInstaller)일 때와 .py로 실행할 때 모두 동일하게
    프로젝트의 기준 경로(BASE_DIR)를 반환.
    """
    if getattr(sys, "frozen", False):
        # PyInstaller로 빌드된 exe
        return os.path.dirname(sys.executable)
    # 그냥 파이썬 스크립트 실행
    return os.path.dirname(os.path.abspath(__file__))


BASE_DIR = get_base_dir()

# ───────── 직렬포트 설정 ─────────
PORT = "COM4"
BAUD = 115200

# ───────── 파일 경로 ─────────
# 세트 매크로 녹화 데이터
MACRO_SETS_FILE = os.path.join(BASE_DIR, "macro_sets.json")

# 세트 매크로 진행 상태 (GUI에서 폴링해서 읽음)
SET_STATUS_FILE = os.path.join(BASE_DIR, "set_macro_status.json")

# ───────── 세트간 텀 (사람 손처럼 약간 랜덤) ─────────
MIN_SET_DELAY = -0.1  # 살짝 당길 수 있게 음수도 허용
MAX_SET_DELAY = 0.1  # 0~약간 정도로 쓰고 싶으면 조절


def format_time(sec: float) -> str:
    """
    초 단위를 "MM:SS" 또는 "H:MM:SS" 형식 문자열로 변환.
    """
    sec = max(0, int(sec))
    m, s = divmod(sec, 60)
    if m >= 60:
        h, m = divmod(m, 60)
        return f"{h:d}:{m:02d}:{s:02d}"
    else:
        return f"{m:02d}:{s:02d}"
