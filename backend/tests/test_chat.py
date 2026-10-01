import pytest
from backend.db import Base, engine, SessionLocal
from backend.seed import seed_database
from backend.models import Visit, VisitTask, Doctor
from backend.chat import process_chat_message

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    seed_database(reset=True)
    yield

def test_emergency_intent():
    db = SessionLocal()
    try:
        res = process_chat_message(db, "I have severe chest pain!")
        assert res["gesture"] == "point"
        assert "Emergency" in res["reply"]
        assert res["card"] is not None
        assert res["card"]["type"] == "emergency"
    finally:
        db.close()

def test_greeting_intent():
    db = SessionLocal()
    try:
        res = process_chat_message(db, "Hello, good morning!")
        assert res["gesture"] == "wave"
        assert "Hello" in res["reply"]
    finally:
        db.close()

def test_doctor_search_intent():
    db = SessionLocal()
    try:
        res = process_chat_message(db, "Where is the cardiology department?")
        assert res["gesture"] == "point"
        assert "Cardiology" in res["reply"] or "Meera Iyer" in res["reply"]
        assert res["card"] is not None
        assert res["card"]["type"] == "route"
    finally:
        db.close()

def test_wait_time_intent():
    db = SessionLocal()
    try:
        res = process_chat_message(db, "How long is the wait?")
        assert res["gesture"] == "nod"
        assert "wait" in res["reply"].lower()
    finally:
        db.close()

def test_fallback_intent():
    db = SessionLocal()
    try:
        res = process_chat_message(db, "What is the stock price of Apple?")
        assert res["gesture"] == "none"
        assert "help desk" in res["reply"].lower()
    finally:
        db.close()
