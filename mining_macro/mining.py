import time
import os
import cv2
import mss
import numpy as np
import keyboard

# ──────────────────────
# 1. 캡처할 화면 영역 설정
# ──────────────────────
MONITOR = {
    "top": 100,  # TODO: 네 게임 위치에 맞게 조정
    "left": 100,
    "width": 1280,
    "height": 720,
}

# ──────────────────────
# 2. 템플릿 로딩
# ──────────────────────
TEMPLATE_DIR = "./templates"


def load_templates(dir_path):
    """dir_path 아래 png 전부 grayscale 로딩"""
    res = []
    if not os.path.isdir(dir_path):
        return res
    for f in os.listdir(dir_path):
        if not f.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        path = os.path.join(dir_path, f)
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        res.append(img)
    return res


TEMPLATES = {
    "player": load_templates(os.path.join(TEMPLATE_DIR, "player")),
    "target": load_templates(os.path.join(TEMPLATE_DIR, "target")),
    "rope": load_templates(os.path.join(TEMPLATE_DIR, "rope")),
    "arrow_up": load_templates(os.path.join(TEMPLATE_DIR, "arrows", "up")),
    "arrow_down": load_templates(os.path.join(TEMPLATE_DIR, "arrows", "down")),
    "arrow_left": load_templates(os.path.join(TEMPLATE_DIR, "arrows", "left")),
    "arrow_right": load_templates(os.path.join(TEMPLATE_DIR, "arrows", "right")),
}


# ──────────────────────
# 3. 템플릿 매칭 유틸 함수
# ──────────────────────
def best_match(gray_roi, tmpl_list, threshold=0.7):
    """
    gray_roi: 검색 영역 (gray)
    tmpl_list: 여러 템플릿 이미지
    return: (cx, cy, w, h, score) 또는 None, score
    """
    best = None
    best_score = 0.0

    for tmpl in tmpl_list:
        th, tw = tmpl.shape[:2]
        if gray_roi.shape[0] < th or gray_roi.shape[1] < tw:
            continue
        res = cv2.matchTemplate(gray_roi, tmpl, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
        if max_val > best_score:
            best_score = max_val
            x, y = max_loc
            cx, cy = x + tw / 2, y + th / 2
            best = (cx, cy, tw, th)

    if best is None or best_score < threshold:
        return None, best_score
    return best, best_score


# ──────────────────────
# 4. 월드(플레이어/타겟) + 화살표 인식
# ──────────────────────
def detect_world(frame_bgr):
    """
    frame_bgr: MONITOR 영역 캡처(BGR)
    return: dict(player=(cx,cy), target=(cx,cy)), 화살표 시퀀스 list
    """
    h, w, _ = frame_bgr.shape
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

    result = {
        "player": None,
        "target": None,
        "rope": None,
    }

    # Player는 화면 아래쪽 40% 정도에서 검색
    player_y1 = int(h * 0.6)
    player_roi = gray[player_y1:h, 0:w]
    pos, score = best_match(player_roi, TEMPLATES["player"], threshold=0.6)
    if pos:
        cx, cy, tw, th = pos
        cy += player_y1  # ROI offset
        result["player"] = (cx, cy)

    # Target은 화면 중간 전체에서 검색 (원하면 ROI 줄여도 됨)
    target_roi = gray[int(h * 0.2) : int(h * 0.8), 0:w]
    target_y1 = int(h * 0.2)
    pos, score = best_match(target_roi, TEMPLATES["target"], threshold=0.6)
    if pos:
        cx, cy, tw, th = pos
        cy += target_y1
        result["target"] = (cx, cy)

    # Rope는 player 위쪽 일부 영역에서만 검색 (간단 버전)
    if result["player"]:
        px, py = result["player"]
        rope_y1 = max(int(py - h * 0.5), 0)
        rope_y2 = max(int(py - h * 0.1), 0)
        rope_roi = gray[rope_y1:rope_y2, 0:w]
        pos, score = best_match(rope_roi, TEMPLATES["rope"], threshold=0.6)
        if pos:
            cx, cy, tw, th = pos
            cy += rope_y1
            result["rope"] = (cx, cy)

    # 화살표 띠: 화면 위쪽 20% 정도
    band_h = int(h * 0.2)
    arrow_roi = gray[0:band_h, 0:w]
    arrows = detect_arrows_in_band(arrow_roi)

    return result, arrows


def detect_arrows_in_band(gray_roi):
    """
    gray_roi: 화면 상단 띠 (gray)
    return: ["left", "up", "right", "down"] 이런 리스트 (최대 4개)
    """
    h, w = gray_roi.shape[:2]
    all_hits = []  # (x_center, dir, score)

    def collect_hits(dir_name, tmpl_list):
        hits = []
        for tmpl in tmpl_list:
            th, tw = tmpl.shape[:2]
            if h < th or w < tw:
                continue
            res = cv2.matchTemplate(gray_roi, tmpl, cv2.TM_CCOEFF_NORMED)
            loc = np.where(res >= 0.7)  # threshold는 나중에 튜닝
            for pt in zip(*loc[::-1]):  # (x, y)
                x, y = pt
                score = res[y, x]
                cx = x + tw / 2
                hits.append((cx, dir_name, score))
        return hits

    for dir_name in ["arrow_up", "arrow_down", "arrow_left", "arrow_right"]:
        hits = collect_hits(dir_name.replace("arrow_", ""), TEMPLATES[dir_name])
        # collect_hits 안에서 dir_name을 "up"/"down" 등으로 넘기게 수정
        # 위에서 replace("arrow_", "") 쓴 이유가 그거임
        # 여기선 헷갈리니까 그냥 이름만 맞춰주자
        # (아래에서 문자열로 쓰기만 할 거라 큰 상관은 없음)
        # 하지만 위 collect_hits 호출을 다시 정리하자.

    # 위 for문을 다시 정확히 작성:
    all_hits = []
    dir_map = {
        "arrow_up": "up",
        "arrow_down": "down",
        "arrow_left": "left",
        "arrow_right": "right",
    }
    for key, dir_name in dir_map.items():
        tmpl_list = TEMPLATES[key]
        for tmpl in tmpl_list:
            th, tw = tmpl.shape[:2]
            if h < th or w < tw:
                continue
            res = cv2.matchTemplate(gray_roi, tmpl, cv2.TM_CCOEFF_NORMED)
            loc = np.where(res >= 0.7)
            for pt in zip(*loc[::-1]):  # (x, y)
                x, y = pt
                score = res[y, x]
                cx = x + tw / 2
                all_hits.append((cx, dir_name, score))

    if not all_hits:
        return []

    # x 기준 정렬 후, 앞에서 최대 4개까지만 사용
    all_hits.sort(key=lambda x: x[0])
    seq = [d for (x, d, s) in all_hits[:4]]
    return seq


# ──────────────────────
# 5. 간단한 키 입력 로직 (스켈레톤)
# ──────────────────────
def control_player(world, arrows, state):
    """
    world: {"player": (x,y), "target": (x,y), "rope": (x,y) }
    arrows: ["left","up",...]  (화살표 모드일 때만 유효)
    state: dict 로 모드 관리 (normal/arrow)
    """

    if state["mode"] == "normal":
        p = world["player"]
        t = world["target"]

        if not p or not t:
            return

        px, py = p
        tx, ty = t

        dx = tx - px
        # 아주 단순한 좌우 이동 로직
        if abs(dx) > 30:  # threshold (픽셀 단위)
            if dx > 0:
                keyboard.press("right")
                keyboard.release("left")
            else:
                keyboard.press("left")
                keyboard.release("right")
        else:
            # 타겟 근처 도착 → 멈추고 스페이스 한 번
            keyboard.release("left")
            keyboard.release("right")
            keyboard.press_and_release("space")
            state["mode"] = "arrow"
            state["arrow_handled"] = False
            time.sleep(0.2)

    elif state["mode"] == "arrow":
        # 화살표가 안 보이면 그냥 대기
        if not arrows or state.get("arrow_handled", False):
            return

        # 감지된 시퀀스대로 키 입력
        for d in arrows:
            if d == "left":
                keyboard.press_and_release("left")
            elif d == "right":
                keyboard.press_and_release("right")
            elif d == "up":
                keyboard.press_and_release("up")
            elif d == "down":
                keyboard.press_and_release("down")
            time.sleep(0.05)

        state["arrow_handled"] = True
        # 다시 normal 모드로 복귀 (필요하면 딜레이 조금 더 줄 수도 있음)
        state["mode"] = "normal"


# ──────────────────────
# 6. 메인 루프
# ──────────────────────
def main():
    sct = mss.mss()
    state = {"mode": "normal", "arrow_handled": False}  # 또는 "arrow"

    print("F10 = 종료")

    while True:
        if keyboard.is_pressed("f10"):
            print("F10 눌림 → 종료")
            break

        # 화면 캡처
        grab = sct.grab(MONITOR)
        frame = np.array(grab)
        frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)

        # 월드 + 화살표 감지
        world, arrows = detect_world(frame)

        # 간단한 디버깅 출력
        # print(world, arrows)

        # 제어 로직
        control_player(world, arrows, state)

        # 너무 빠르면 게임이 못 따라가니까 20~40ms 정도 슬립
        time.sleep(0.03)


if __name__ == "__main__":
    main()
