# main.py (Final Version: 화살표 마스킹 및 노란색 점 표시 기능 통합)

import time
import mss
import numpy as np
import cv2
import keyboard
import os
import threading
import math
import serial
import random
import json

# ====================================================================
# I. 전역 변수 및 상수 설정
# ====================================================================

# 캡처 영역 설정 변수
x1_orig, y1_orig, x2_orig, y2_orig = -1, -1, -1, -1
x1_res, y1_res, x2_res, y2_res = -1, -1, -1, -1
drawing = False
selection_done = False

RESIZE_FACTOR = 0.5
WINDOW_NAME = "Select Area"

# 타겟 인식 좌표 및 상태
target_center_x, target_center_y = -1, -1
player_x, player_y = 50.0, 50.0

PLAYER_Y_OFFSET = -10  # ⬅️ 캐릭터 발밑 좌표 보정 값

# 🌟🌟🌟 자동 이동 로직 관련 전역 변수 및 상수 🌟🌟🌟
SEARCH_MOVE_DURATION = 0.15
SEARCH_IDLE_TIME = 0.2
VERTICAL_PLATFORM_THRESHOLD = 50

# 🚨🚨🚨 랜덤 공격 임계값 관련 상수 및 변수 🚨🚨🚨
MIN_ATTACK_RANGE = 38
MAX_ATTACK_RANGE = 69
current_attack_threshold = MAX_ATTACK_RANGE

# 🚨🚨🚨 정밀 이동 (톡톡) 관련 상수 🚨🚨🚨
PRECISE_MOVE_THRESHOLD = 150
PRECISE_MOVE_DURATION = 0.05

# 🚨🚨🚨 공격 및 스킬 대기 시간 (요청 반영) 🚨🚨🚨
DEFAULT_ATTACK_COOLDOWN = 2.0  # ⬅️ 스페이스바 공격 후 기본 대기 시간 (2.0초)
ARROW_DETECT_DELAY = 0.5  # ⬅️ 화살표 감지 시 입력 전 대기 시간 (0.5초)


last_target_time = time.time()
current_move_direction = "right"
pressed_key = None

# 🚨🚨🚨 EV 프로토콜에 맞는 키 이름 사용 (대문자 필수, 피코 KEYMAP 기준)
ATTACK_KEY_NAME = "SPACE"
LEFT_KEY_NAME = "LEFT"
RIGHT_KEY_NAME = "RIGHT"


# 🌟🌟🌟 피코 보드 시리얼 통신 설정 🌟🌟🌟
SERIAL_PORT = "COM5"
BAUD_RATE = 115200
ser = None


# 이미지 파일 경로 및 캐싱
IMAGE_PATHS = {
    "target_silver": "./templates/target/silver.png",
    "target_herb": "./templates/target/herb.png",
    "player_normal": "./templates/player/player_1.png",
}
target_images = {}
player_images = {}


# 🚨🚨🚨 방향키 이미지 템플릿 경로 추가 🚨🚨🚨
ARROW_IMAGE_PATHS = {
    "DOWN": "./templates/arrows/down.png",
    "LEFT": "./templates/arrows/left.png",
    "RIGHT": "./templates/arrows/right.png",
    "UP": "./templates/arrows/up.png",
}
# arrow_images에는 {"UP": {"template": img, "mask": mask}, ...} 형태로 저장됩니다.
arrow_images = {}
REQUIRED_ARROW_KEY = None
arrow_center_x, arrow_center_y = -1, -1  # ⬅️ 화살표 좌표 추가


# 🌟🌟🌟🌟🌟 계층 순환 탐색 로직 관련 변수 및 상수 🌟🌟🌟🌟🌟
TERRAIN_LAYERS = [150, 350, 550, 750, 950]
MAX_LAYER_INDEX = len(TERRAIN_LAYERS) - 1

current_layer_index = 0
IS_ASCENDING = True

# 🚨🚨🚨 복합 동작 JSON 파일 추가 (수정)
ALT_DOUBLE_TAP_ACTION = "alt_double_tap"

JUMP_KEYS_MAP = {
    "jump_1": "./move/jump/jump_1.json",
    "jump_2": "./move/jump/jump_2.json",
    "jump_3": "./move/jump/jump_3.json",
    "jump_4": "./move/jump/jump_4.json",
    "jump_5": "./move/jump/jump_5.json",
    ALT_DOUBLE_TAP_ACTION: "./move/jump/alt_double_tap.json",
}

# JSON 파일에 사용된 키 이름과 Pico 키맵 이름 매핑 (Alt, 방향키 추가)
JUMP_PICO_KEY_MAP = {
    "UP": "UP",
    "ALT": "ALT",
    "DOWN": "DOWN",
    "LEFT": "LEFT",
    "RIGHT": "RIGHT",
}
# ====================================================================
# II. 유틸리티 함수
# ====================================================================


def set_random_attack_threshold():
    """공격 시 필요한 X축 거리를 MIN_ATTACK_RANGE ~ MAX_ATTACK_RANGE 사이에서 무작위로 설정합니다."""
    global current_attack_threshold
    current_attack_threshold = random.randint(MIN_ATTACK_RANGE, MAX_ATTACK_RANGE)


def initialize_serial():
    """피코 보드와의 시리얼 통신을 초기화합니다."""
    global ser
    try:
        if ser and ser.is_open:
            return

        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0.1)
        time.sleep(2)
        print(f"✅ 시리얼 통신 연결 성공: {SERIAL_PORT} @ {BAUD_RATE}bps")
    except serial.SerialException as e:
        print(f"❌ 시리얼 통신 연결 실패: {e}")
        print(
            "포트 설정(SERIAL_PORT)을 확인하거나, 피코 보드가 연결되어 있는지 확인하세요."
        )
        ser = None


def close_serial():
    """시리얼 통신을 닫습니다."""
    global ser
    if ser and ser.is_open:
        ser.close()
        print("✅ 시리얼 통신 종료.")


def send_event_to_pico(event_type, key_name):
    """
    피코 보드에 EV 프로토콜 명령을 전송합니다. (예: "EV down RIGHT\n")
    """
    global ser
    if ser and ser.is_open:
        message = f"EV {event_type} {key_name}\n"
        try:
            ser.write(message.encode("utf-8"))
        except serial.SerialException as e:
            print(f"❌ 시리얼 전송 오류: {e}")


def get_pico_key_name(key):
    """별칭 키 이름('left', 'right', 'space')을 피코 키맵 이름으로 변환합니다."""
    key_name_map = {
        "left": LEFT_KEY_NAME,
        "right": RIGHT_KEY_NAME,
        "space": ATTACK_KEY_NAME,
    }
    return key_name_map.get(key)


def press_key(key):
    """지정된 키를 누르고, 눌려있는 키 상태를 업데이트합니다."""
    global pressed_key

    pico_key_name = get_pico_key_name(key)

    if pico_key_name:
        if pressed_key == pico_key_name:
            return

        if pressed_key is not None:
            release_key(pressed_key)

        send_event_to_pico("down", pico_key_name)
        pressed_key = pico_key_name


def release_key(key_to_release):
    """지정된 키를 떼고, 눌려있는 키 상태를 초기화합니다."""
    global pressed_key

    if pressed_key == key_to_release:
        send_event_to_pico("up", key_to_release)
        pressed_key = None


def move_character(key, duration=0.1):
    """공격 키(Space)처럼 짧게 눌렀다 떼는 동작에 사용합니다."""

    pico_key_name = get_pico_key_name(key)

    if pico_key_name:
        send_event_to_pico("down", pico_key_name)
        time.sleep(duration)
        send_event_to_pico("up", pico_key_name)


def load_images():
    """타겟, 캐릭터, 방향키 이미지를 모두 로드하고, 방향키 템플릿의 마스크를 생성합니다."""
    global target_images, player_images, arrow_images

    print("-" * 20 + " 이미지 로드 시작 " + "-" * 20)

    def load_template(name, path, img_dict, is_arrow=False):
        if os.path.exists(path):
            if is_arrow:
                # 🚨 방향키는 회색조로 로드
                img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
            else:
                img = cv2.imread(path, cv2.IMREAD_COLOR)

            if img is not None:

                if is_arrow:
                    # 💡 마스크 생성 로직: 파란색 배경을 제외하고 화살표만 남김
                    # 화살표(밝은 색) 부분이 배경(파란색->어두운 회색)보다 밝다는 가정 하에 임계값 처리
                    # 템플릿 이미지와 환경에 따라 100~150 사이의 임계값이 적절할 수 있습니다.
                    _, mask = cv2.threshold(img, 100, 255, cv2.THRESH_BINARY)
                    img_dict[name] = {"template": img, "mask": mask}
                else:
                    img_dict[name] = img

                print(
                    f"✅ 이미지 '{name}' 로드 완료. 크기: {img.shape} ({'회색조+마스크' if is_arrow else '컬러'})"
                )
            else:
                print(f"❌ 경고: 이미지 로드 실패: {path}")
        else:
            print(f"❌ 경고: 이미지 파일 경로를 찾을 수 없습니다: {path}")

    # 타겟 이미지 로드 (컬러)
    for name, path in IMAGE_PATHS.items():
        if name.startswith("target_"):
            load_template(name.split("_")[1], path, target_images)

    # player_normal 하나만 로드 (컬러)
    if "player_normal" in IMAGE_PATHS:
        load_template("player_normal", IMAGE_PATHS["player_normal"], player_images)

    # 방향키 이미지 로드 (회색조 + 마스크)
    for name, path in ARROW_IMAGE_PATHS.items():
        load_template(name, path, arrow_images, is_arrow=True)

    print("-" * 45)


def load_composite_action(action_name):
    """지정된 복합 동작(JSON) 파일을 로드합니다."""
    file_path = JUMP_KEYS_MAP.get(action_name)
    if not file_path or not os.path.exists(file_path):
        if action_name == ALT_DOUBLE_TAP_ACTION:
            print(f"❌ 경고: 하강을 위한 '{file_path}' 파일이 필요합니다!")
        else:
            print(f"❌ 복합 동작 파일 '{file_path}'를 찾을 수 없습니다.")
        return None

    try:
        with open(file_path, "r") as f:
            data = json.load(f)
        return data.get("events", [])
    except Exception as e:
        print(f"❌ 복합 동작 파일 로드 중 오류 발생: {e}")
        return None


def execute_composite_action(action_events):
    """
    로드된 복합 동작 이벤트를 시차를 두고 순차적으로 피코 보드에 전송합니다.
    """
    global pressed_key

    if not ser or not ser.is_open or not action_events:
        print("❌ 시리얼 연결이 없거나 이벤트가 없습니다.")
        return

    start_time = action_events[0].get("time", 0)
    last_time = start_time

    for event in action_events:
        event_type = event.get("type")
        key_name_alias = event.get("key")
        event_time = event.get("time")

        delay = event_time - last_time
        if delay > 0:
            time.sleep(delay)

        pico_key_name = JUMP_PICO_KEY_MAP.get(key_name_alias, key_name_alias)
        send_event_to_pico(event_type, pico_key_name)

        last_time = event_time

    if pressed_key:
        release_key(pressed_key)

    time.sleep(0.1)


def find_player_coords(selected_area, player_imgs, threshold=0.70):
    """선택된 영역에서 가장 잘 매칭되는 캐릭터 이미지를 찾고 그 중심 좌표를 반환합니다."""
    best_match = None
    max_score = threshold

    for name, img in player_imgs.items():
        if img is None:
            continue

        h, w, _ = img.shape
        result = cv2.matchTemplate(selected_area, img, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

        if max_val > max_score:
            max_score = max_val
            best_match = {
                "score": max_val,
                "center_x": max_loc[0] + w // 2,
                "center_y": max_loc[1] + h // 2,
            }

    if best_match:
        return (best_match["center_x"], best_match["center_y"])

    return None


def find_closest_object_coords(
    selected_area, object_img, threshold=0.70, player_x=player_x, player_y=player_y
):
    """
    주어진 오브젝트 이미지를 찾아 캐릭터로부터 가장 가까운 오브젝트의 좌표와 거리를 반환합니다.
    """
    if object_img is None:
        return None, float("inf")

    h, w, _ = object_img.shape
    result = cv2.matchTemplate(selected_area, object_img, cv2.TM_CCOEFF_NORMED)
    loc = np.where(result >= threshold)

    min_priority_distance = float("inf")
    min_euclidean_distance = float("inf")
    closest_coords = None

    if loc[0].size > 0:
        for pt_x, pt_y in zip(loc[1], loc[0]):

            center_x = pt_x + w // 2
            center_y = pt_y + h // 2

            dist_x = abs(center_x - player_x)
            dist_y = abs(center_y - player_y)

            priority_distance = dist_x * 2 + dist_y * 0.1
            euclidean_distance = math.sqrt(dist_x**2 + dist_y**2)

            if priority_distance < min_priority_distance:
                min_priority_distance = priority_distance
                min_euclidean_distance = euclidean_distance
                closest_coords = (center_x, center_y)
            elif (
                priority_distance == min_priority_distance
                and euclidean_distance < min_euclidean_distance
            ):
                min_euclidean_distance = euclidean_distance
                closest_coords = (center_x, center_y)

    return closest_coords, min_euclidean_distance


def select_area(event, x, y, flags, param):
    """OpenCV 창에서 마우스 이벤트를 처리하고 좌표를 저장합니다."""
    global x1_res, y1_res, x2_res, y2_res, x1_orig, y1_orig, x2_orig, y2_orig, drawing, selection_done, player_x, player_y

    if selection_done and event == cv2.EVENT_LBUTTONDOWN:
        selection_done = False
        if cv2.getWindowProperty("Selected Area", cv2.WND_PROP_VISIBLE) >= 1:
            cv2.destroyWindow("Selected Area")
        print("다시 영역을 선택합니다.")

    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        x1_res, y1_res = x, y
        x2_res, y2_res = x, y
        x1_orig, y1_orig = int(x / RESIZE_FACTOR), int(y / RESIZE_FACTOR)
        x2_orig, y2_orig = x1_orig, y1_orig

    elif event == cv2.EVENT_MOUSEMOVE:
        if drawing:
            x2_res, y2_res = x, y
            x2_orig, y2_orig = int(x / RESIZE_FACTOR), int(y / RESIZE_FACTOR)

    elif event == cv2.EVENT_LBUTTONUP:
        drawing = False
        selection_done = True
        x2_res, y2_res = x, y
        x2_orig, y2_orig = int(x / RESIZE_FACTOR), int(y / RESIZE_FACTOR)

        cv2.destroyWindow(WINDOW_NAME)
        print(f"선택 완료: '{WINDOW_NAME}' 창이 닫혔습니다.")

        x_min = min(x1_orig, x2_orig)
        x_max = max(x1_orig, x2_orig)
        y_min = min(y1_orig, y2_orig)
        y_max = max(y1_orig, y2_orig)

        print(f"선택된 영역 (원본): ({x_min}, {y_min}) ~ ({x_max}, {y_max})")

        player_x = float((x_max - x_min) / 2)
        player_y = float((y_max - y_min) / 2)


def draw_selection(frame_resized):
    """축소된 화면에 현재 드래그 중인 영역을 그립니다."""
    if x1_res != -1 and y1_res != -1 and x2_res != -1 and y2_res != -1:
        cv2.rectangle(frame_resized, (x1_res, y1_res), (x2_res, y2_res), (0, 255, 0), 2)
    return frame_resized


# ====================================================================
# III. 메인 실행 함수
# ====================================================================


def main():
    """메인 실행 함수"""
    global selection_done, drawing, player_x, player_y, target_center_x, target_center_y
    global last_target_time, current_move_direction, pressed_key, current_attack_threshold
    global IS_ASCENDING, current_layer_index, REQUIRED_ARROW_KEY, arrow_center_x, arrow_center_y

    set_random_attack_threshold()

    sct = mss.mss()
    monitor_info = sct.monitors[0]
    cv2.namedWindow(WINDOW_NAME)
    cv2.setMouseCallback(WINDOW_NAME, select_area)

    print("-" * 40)
    print("📢 공격 로직 변경 적용")
    print(f"✅ 일반 공격 후 대기: {DEFAULT_ATTACK_COOLDOWN} 초")
    print(f"✅ 복합 스킬 감지 후 대기: {ARROW_DETECT_DELAY} 초")
    print("1. 화면 캡처 영역을 마우스로 드래그하여 선택하세요.")
    print("2. 종료하려면 F10을 누르세요.")
    print("-" * 40)

    while True:
        if keyboard.is_pressed("f10"):
            print("F10 눌림 → 종료")
            if ser and ser.is_open:
                ser.write("STOP\n".encode("utf-8"))
                time.sleep(0.1)
            break

        sct_img = sct.grab(monitor_info)
        frame_orig = np.array(sct_img)
        frame_orig = cv2.cvtColor(frame_orig, cv2.COLOR_BGRA2BGR)
        frame_resized = cv2.resize(
            frame_orig, (0, 0), fx=RESIZE_FACTOR, fy=RESIZE_FACTOR
        )

        if drawing or not selection_done:
            frame_with_selection = draw_selection(frame_resized.copy())
            cv2.imshow(WINDOW_NAME, frame_with_selection)

        if selection_done:
            x_min = min(x1_orig, x2_orig)
            x_max = max(x1_orig, x2_orig)
            y_min = min(y1_orig, y2_orig)
            y_max = max(y1_orig, y2_orig)

            if x_max > x_min and y_max > y_min:
                selected_area = frame_orig[y_min:y_max, x_min:x_max].copy()
                boundary_margin = 50

                # 1. 캐릭터 위치 업데이트
                player_coords = find_player_coords(
                    selected_area, player_images, threshold=0.70
                )
                if player_coords is not None:
                    player_x, player_y = player_coords
                    player_y += PLAYER_Y_OFFSET

                # 2. 가장 가까운 타겟 찾기
                target_result_coords = None
                target_distance = float("inf")
                best_target_name = None

                for name, target_img in target_images.items():
                    if target_img is None:
                        continue

                    current_coords, current_distance = find_closest_object_coords(
                        selected_area, target_img, threshold=0.70
                    )

                    if (
                        current_coords is not None
                        and current_distance < target_distance
                    ):
                        target_distance = current_distance
                        target_result_coords = current_coords
                        best_target_name = name

                # 3. 🚨 방향키 템플릿 매칭 (스킬 발동 조건 확인)
                REQUIRED_ARROW_KEY = None
                arrow_center_x, arrow_center_y = -1, -1  # 매 루프 초기화
                max_arrow_score = 0.75

                # 캡처 영역을 회색조로 변환
                selected_area_gray = cv2.cvtColor(selected_area, cv2.COLOR_BGR2GRAY)

                for key_name, arrow_data in arrow_images.items():

                    arrow_img = arrow_data.get("template")  # 템플릿 이미지
                    arrow_mask = arrow_data.get("mask")  # 마스크 이미지

                    if arrow_img is None or arrow_mask is None:
                        continue

                    h, w = arrow_img.shape

                    # 💡 마스크를 사용하여 템플릿 매칭 (배경 제외)
                    result = cv2.matchTemplate(
                        selected_area_gray,
                        arrow_img,
                        cv2.TM_CCOEFF_NORMED,
                        mask=arrow_mask,
                    )
                    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

                    if max_val > max_arrow_score:
                        REQUIRED_ARROW_KEY = key_name
                        # 감지된 화살표의 중심 좌표 저장
                        arrow_center_x = max_loc[0] + w // 2
                        arrow_center_y = max_loc[1] + h // 2
                        break

                # 🌟🌟🌟 4. 자동 이동/탐색 로직 🌟🌟🌟

                if target_result_coords is not None:
                    # A. 타겟 추적 모드
                    target_center_x, target_center_y = target_result_coords
                    vertical_diff = abs(target_center_y - player_y)
                    target_x_diff = abs(target_center_x - player_x)
                    target_y_diff = target_center_y - player_y
                    is_target_left = target_center_x < player_x

                    if vertical_diff < VERTICAL_PLATFORM_THRESHOLD:
                        # 4-1. 같은 플랫폼에 있는 타겟 추적 (공격/이동)
                        last_target_time = time.time()

                        if target_x_diff < current_attack_threshold:
                            # 1. 공격 범위 내: 공격 로직 실행

                            if pressed_key is not None:
                                release_key(pressed_key)

                            # 1단계: 스페이스바 공격 실행 (짧게 누르고 뗌)
                            move_character("space", 0.05)

                            set_random_attack_threshold()

                            # 2단계: 스페이스바 공격 직후, 화살표 이미지 감지 확인
                            if REQUIRED_ARROW_KEY is not None:

                                # 🚨 요청 사항 1: 화살표 감지되면 0.5초 대기
                                time.sleep(ARROW_DETECT_DELAY)

                                # 3단계: 복합 스킬 입력 (화살표 + 스페이스바)
                                arrow_pico_key = JUMP_PICO_KEY_MAP.get(
                                    REQUIRED_ARROW_KEY, REQUIRED_ARROW_KEY
                                )

                                send_event_to_pico("down", arrow_pico_key)
                                send_event_to_pico("down", ATTACK_KEY_NAME)

                                time.sleep(0.1)  # 키 눌림 유지 시간

                                send_event_to_pico("up", ATTACK_KEY_NAME)
                                send_event_to_pico("up", arrow_pico_key)

                                # 🚨 요청 사항 2: 복합 스킬 입력 완료 후 2.0초 대기
                                time.sleep(DEFAULT_ATTACK_COOLDOWN)

                            else:
                                # 2단계 (대안): 화살표 감지 안 되면 스페이스바 공격만 실행된 후 2.0초 대기
                                time.sleep(DEFAULT_ATTACK_COOLDOWN)

                        else:
                            # 2. 공격 범위 밖: 이동 로직 실행 (톡톡 이동 로직)

                            target_direction_key = "left" if is_target_left else "right"

                            if target_x_diff > PRECISE_MOVE_THRESHOLD:
                                # 2-1. 거리가 멀면: 꾸욱 눌러서 빠르게 이동
                                press_key(target_direction_key)
                            else:
                                # 2-2. 거리가 가까우면: 톡톡 눌러서 정밀하게 이동

                                if pressed_key is not None:
                                    release_key(pressed_key)

                                move_character(
                                    target_direction_key, PRECISE_MOVE_DURATION
                                )

                                time.sleep(0.05)

                    else:
                        # 4-2. 다른 플랫폼에 있는 타겟: 점프/복합 동작

                        # 점프 파일이 jump_1.json ~ jump_5.json으로 변경되었으므로, 랜덤으로 하나 선택
                        random_jump_key = random.choice(
                            [f"jump_{i}" for i in range(1, 6)]
                        )

                        if target_y_diff < 0:
                            if pressed_key is not None:
                                release_key(pressed_key)

                            action_to_execute = random_jump_key

                            jump_events = load_composite_action(action_to_execute)
                            if jump_events:
                                execute_composite_action(jump_events)
                        else:
                            if pressed_key is not None:
                                release_key(pressed_key)

                else:
                    # B. 탐색 모드 (타겟 없음) -> 계층 순환 로직 통합

                    if time.time() - last_target_time > SEARCH_IDLE_TIME:

                        if IS_ASCENDING:
                            # B-1. ⬆️ 상승 모드 (우측 끝 포탈/점프)
                            if current_layer_index < MAX_LAYER_INDEX:
                                if (
                                    current_move_direction == "right"
                                    and player_x < (x_max - x_min) - boundary_margin
                                ):
                                    press_key("right")
                                else:
                                    # 우측 끝 도달, 다음 층으로 점프 시도
                                    if pressed_key is not None:
                                        release_key(pressed_key)

                                    random_jump_key = random.choice(
                                        [f"jump_{i}" for i in range(1, 6)]
                                    )
                                    action_to_execute = random_jump_key

                                    jump_events = load_composite_action(
                                        action_to_execute
                                    )
                                    if jump_events:
                                        execute_composite_action(jump_events)

                                    current_layer_index += 1
                                    current_move_direction = "left"
                                    press_key(current_move_direction)

                            else:  # MAX_LAYER_INDEX 도달 (최상층)
                                # 최상층 우측 끝에서 하강 모드로 전환 준비
                                if (
                                    current_move_direction == "right"
                                    and player_x < (x_max - x_min) - boundary_margin
                                ):
                                    press_key("right")
                                else:
                                    release_key(pressed_key)
                                    current_move_direction = "left"
                                    IS_ASCENDING = False
                                    current_layer_index = MAX_LAYER_INDEX
                                    print("➡️ 최상층 우측 끝 도달. 하강 모드 전환.")
                                    time.sleep(0.1)

                        else:
                            # B-2. ⬇️ 하강 모드 (좌측 끝 Alt 더블 탭)

                            if current_layer_index > 0:
                                if (
                                    current_move_direction == "left"
                                    and player_x > boundary_margin
                                ):
                                    press_key("left")
                                else:
                                    # 좌측 끝 도달, Alt 더블 탭 시도
                                    if pressed_key is not None:
                                        release_key(pressed_key)

                                    alt_events = load_composite_action(
                                        ALT_DOUBLE_TAP_ACTION
                                    )
                                    if alt_events:
                                        execute_composite_action(alt_events)

                                    current_layer_index -= 1
                                    current_move_direction = "right"
                                    press_key(current_move_direction)

                            else:  # current_layer_index == 0 도달 (최하층)
                                # 최하층 좌측 끝에서 상승 모드로 전환 준비
                                if (
                                    current_move_direction == "left"
                                    and player_x > boundary_margin
                                ):
                                    press_key("left")
                                else:
                                    release_key(pressed_key)
                                    current_move_direction = "right"
                                    IS_ASCENDING = True
                                    current_layer_index = 0
                                    print("⬅️ 최하층 좌측 끝 도달. 상승 모드 전환.")
                                    time.sleep(0.1)

                    else:
                        pass  # 타겟이 잠깐 사라졌을 때: 움직임 유지

                # 5. 디버깅 및 출력

                # 타겟 드로잉 (빨간색)
                if target_result_coords is not None:
                    target_center_x, target_center_y = target_result_coords
                    cv2.circle(
                        selected_area,
                        (int(target_center_x), int(target_center_y)),
                        5,
                        (0, 0, 255),
                        -1,
                    )

                # ⬅️ 화살표 감지 시 노란색 점 표시
                if REQUIRED_ARROW_KEY is not None:
                    # 노란색 (BGR: 0, 255, 255)
                    cv2.circle(
                        selected_area,
                        (int(arrow_center_x), int(arrow_center_y)),
                        5,
                        (0, 255, 255),
                        -1,
                    )

                # 캐릭터 위치에 파란색 점
                cv2.circle(
                    selected_area, (int(player_x), int(player_y)), 5, (255, 0, 0), -1
                )

                if selected_area.size > 0:
                    cv2.imshow("Selected Area", selected_area)

        cv2.waitKey(1)

    cv2.destroyAllWindows()


if __name__ == "__main__":
    load_images()
    initialize_serial()

    try:
        main()
    except Exception as e:
        print(f"❌ 메인 루프 실행 중 오류 발생: {e}")
    finally:
        if pressed_key is not None:
            release_key(pressed_key)
        close_serial()
