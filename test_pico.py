import serial

# COM4 포트에 연결
PORT = "COM4"
BAUD = 115200
try:
    pico = serial.Serial(PORT, BAUD)
    print("피코 연결 성공!")
    pico.close()  # 연결 종료
except serial.SerialException as e:
    print(f"포트 연결 실패: {e}")