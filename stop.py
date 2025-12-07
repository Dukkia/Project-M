# stop.py
import os
import sys
import serial
import time

PORT = "COM4"
BAUD = 115200

ser = serial.Serial(PORT, BAUD, timeout=1)
time.sleep(1)
ser.write(b"STOP\n")
ser.flush()
ser.close()
print("STOP 전송 완료")
