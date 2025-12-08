import os
import time
import mss
import cv2
import numpy as np
import keyboard

SAVE_DIR = "./images/screen_captures"
os.makedirs(SAVE_DIR, exist_ok=True)

MONITOR = {
    "top": 45,
    "left": 0,
    "width": 1920,
    "height": 1125,
}

def get_start_index():
    """이미 있는 frame_*.png 파일을 보고 다음 저장 인덱스를 계산"""
    files = [f for f in os.listdir(SAVE_DIR) if f.startswith("frame_") and f.endswith(".png")]
    if not files:
        return 0
    nums = []
    for f in files:
        try:
            num = int(f.replace("frame_", "").replace(".png", ""))
            nums.append(num)
        except:
            pass
    return max(nums) + 1 if nums else 0

def capture_frame(sct, idx):
    img = np.array(sct.grab(MONITOR))
    img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    save_path = os.path.join(SAVE_DIR, f"frame_{idx:05d}.png")
    cv2.imwrite(save_path, img)
    print(f"Saved: {save_path}")
    return idx + 1

def main():
    sct = mss.mss()
    
    # 🔥 기존 파일 기반으로 다음 번호 계산
    idx = get_start_index()

    print("F9 = 스크린샷 저장")
    print("ESC = 종료")
    print(f"저장 폴더: {os.path.abspath(SAVE_DIR)}")
    print(f"다음 저장 번호: frame_{idx:05d}.png")

    while True:
        key = keyboard.read_key()

        if key == "f9":
            idx = capture_frame(sct, idx)
            time.sleep(0.2)

        elif key == "esc":
            print("종료합니다.")
            break

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n강제 종료됨.")
