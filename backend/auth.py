import os
import time
from abc import ABC, abstractmethod
import jwt
from fastapi import HTTPException, Header, Depends, status
from sqlalchemy.orm import Session

JWT_SECRET = os.getenv("JWT_SECRET", "demo-jwt-secret-key-change-in-production-12345")
STAFF_KEY = os.getenv("STAFF_KEY", "demo-staff")
DEMO_OTP = os.getenv("DEMO_OTP", "123456")
ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 8

class SMSProvider(ABC):
    @abstractmethod
    def send_otp(self, phone: str, otp: str) -> bool:
        pass

class MockSMSProvider(SMSProvider):
    def send_otp(self, phone: str, otp: str) -> bool:
        print(f"[MOCK SMS] Sending OTP {otp} to phone number {phone}")
        return True

sms_provider = MockSMSProvider()

def create_visit_token(visit_id: int) -> str:
    payload = {
        "visit_id": visit_id,
        "exp": int(time.time()) + (TOKEN_EXPIRY_HOURS * 3600),
        "iat": int(time.time())
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

def get_current_visit_id(authorization: str = Header(None)) -> int:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header required")
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header format")
    payload = decode_token(parts[1])
    visit_id = payload.get("visit_id")
    if not visit_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims")
    return visit_id

def verify_staff_key(x_staff_key: str = Header(None, alias="X-Staff-Key")) -> str:
    if not x_staff_key or x_staff_key != STAFF_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing Staff Key")
    return x_staff_key
