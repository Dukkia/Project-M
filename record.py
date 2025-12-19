import keyboard
import time
import json
import os
import sys # sys 모듈 추가 (프로그램 종료에 사용)

# ----------------- 설정 -----------------
MACRO_FILE = "game_macro.json"

# ----------------- 녹화 상태 변수 -----------------
events = []
is_recording = False
# 메인 루프 제어를 위한 플래그 추가
is_running = True 
start_time = None

# ----------------- 핫키 콜백 함수 -----------------
def start_recording():
    """F9 키를 눌렀을 때 실행됩니다."""
    global is_recording, start_time, events
    
    if not is_running:
        return # 이미 종료 중이면 무시
        
    if is_recording:
        print("▶ 이미 녹화 중입니다.")
        return

    is_recording = True
    start_time = time.time()
    events.clear()
    print("\n" + "="*40)
    print("▶▶▶ 녹화 시작됨 (F10을 누르면 종료 & 저장) ◀◀◀")
    print("="*40 + "\n")

def stop_recording():
    """F10 키를 눌렀을 때 실행됩니다."""
    global is_recording, is_running
    
    if not is_running:
        return # 이미 종료 중이면 무시

    if not is_recording:
        print("⏹ 녹화 중이 아닙니다. F9를 눌러 시작하세요.")
        # F10을 눌러도 is_running이 False가 되지 않도록 방지
        return

    is_recording = False
    is_running = False # 메인 루프를 종료시키는 플래그 설정
    print("\n" + "="*40)
    print("⏹ 녹화 종료 요청됨. 데이터를 저장합니다.")
    print("="*40 + "\n")


# ----------------- 키보드 이벤트 로깅 함수 -----------------
def log_event(event):
    # (내용은 동일, 간결성을 위해 생략)
    if not is_recording or start_time is None:
        return

    key = (event.name or "").upper()
    
    if key in ("F9", "F10"):
        return

    timestamp = time.time() - start_time
    events.append({
        "type": event.event_type,
        "key": key,
        "time": round(timestamp, 4)
    })
    
    # print(f"[{len(events):04d}] {event.event_type:<4} - {key:<10} @ {timestamp:7.4f}초")
    

def save_events():
    # (내용은 동일, 간결성을 위해 생략)
    if not events:
        print("⚠ 녹화된 키 입력이 없어 저장하지 않습니다.")
        return

    try:
        data = {"events": events, "recorded_at": time.strftime("%Y-%m-%d %H:%M:%S")}
        
        with open(MACRO_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"✅ 녹화 저장 완료!")
        print(f"   → 저장 파일: {MACRO_FILE}")
        print(f"   → 이벤트 개수: {len(events)}개")
    except Exception as e:
        print(f"❌ 데이터 저장 실패: {e}")

# ----------------- 메인 실행 -----------------
if __name__ == "__main__":
    print("="*40)
    print("   키보드 게임 녹화기 (Game Recorder)   ")
    print("="*40)
    print("  • F9 : 녹화 시작")
    print("  • F10: 녹화 종료 및 저장")
    print("\n※ F9/F10을 눌러 프로그램을 시작/종료합니다.")
    
    
    # F9와 F10을 전역 핫키로 등록
    keyboard.add_hotkey('F9', start_recording, suppress=True)
    keyboard.add_hotkey('F10', stop_recording, suppress=True)

    # 모든 키보드 이벤트를 감지하는 훅 등록
    key_logger = keyboard.hook(log_event)

    try:
        # F10이 눌려 is_running이 False가 될 때까지 대기
        while is_running:
            time.sleep(0.1) 
            
    except KeyboardInterrupt:
        # Ctrl+C로 강제 종료 시에도 is_running 플래그를 False로 설정
        print("\n사용자 강제 종료 (Ctrl+C).")
        is_running = False

    finally:
        # 핫키 해제
        # keyboard.unhook_all()을 사용하면 모든 핫키와 훅을 일괄적으로 안전하게 해제할 수 있습니다.
        keyboard.unhook_all()
        # 이전 코드의 `keyboard.remove_hotkey`에서 발생했던 오류 방지

        # 녹화가 진행되었고 종료 신호가 들어왔다면 저장
        save_events()

    print("\n프로그램이 종료되었습니다.")
    # 프로그램 종료
    sys.exit(0)