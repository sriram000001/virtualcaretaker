import os
import io
import datetime
from typing import Dict, List, Optional, Any
import segno
from fastapi import FastAPI, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect, status, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db import get_db, Base, engine, SessionLocal
from backend.seed import seed_database
from backend.models import Doctor, Schedule, Override, Appointment, Visit, VisitTask
from backend.auth import (
    create_visit_token, decode_token, verify_staff_key,
    sms_provider, DEMO_OTP, STAFF_KEY
)
from backend.routing import route, NODES, EDGES
from backend.chat import (
    process_chat_message, get_my_status, get_doctor_current_status,
    get_wait_time, DEFAULT_WAIT_TIMES
)

app = FastAPI(title="Hospital Patient Journey API")

# Seed database on startup if empty
@app.on_event("startup")
def startup_event():
    seed_database(reset=False)

# WebSocket Connection Manager for live patient updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, visit_id: int, websocket: WebSocket):
        await websocket.accept()
        if visit_id not in self.active_connections:
            self.active_connections[visit_id] = []
        self.active_connections[visit_id].append(websocket)

    def disconnect(self, visit_id: int, websocket: WebSocket):
        if visit_id in self.active_connections:
            if websocket in self.active_connections[visit_id]:
                self.active_connections[visit_id].remove(websocket)
            if not self.active_connections[visit_id]:
                del self.active_connections[visit_id]

    async def broadcast_visit_update(self, visit_id: int, data: dict):
        if visit_id in self.active_connections:
            for connection in self.active_connections[visit_id]:
                try:
                    await connection.send_json(data)
                except Exception:
                    pass

manager = ConnectionManager()

# Pydantic Schemas
class OTPRequest(BaseModel):
    phone: str

class VerifyRequest(BaseModel):
    phone: str
    otp: str
    patient_name: str
    visit_type: str  # appointment, walkin, directions, emergency
    appointment_id: Optional[str] = None

class LocationRequest(BaseModel):
    node_id: str

class FeedbackRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    text: Optional[str] = None

class ChatMessageRequest(BaseModel):
    message: str

class AddTaskRequest(BaseModel):
    kind: str
    doctor_id: Optional[int] = None
    note: Optional[str] = None

class AssignDoctorRequest(BaseModel):
    doctor_id: int

class DoctorOverrideRequest(BaseModel):
    status: str  # in, out, leave, delayed
    room_node: Optional[str] = None
    note: Optional[str] = None

# Helper to get current authenticated visit
def get_current_visit(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> Visit:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization token required")
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")
    payload = decode_token(parts[1])
    visit_id = payload.get("visit_id")
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit or visit.status == "closed":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Visit is closed or token is invalid")
    return visit

# PUBLIC ENDPOINTS

@app.post("/api/auth/request-otp")
def request_otp(req: OTPRequest):
    clean_phone = req.phone.strip()
    if len(clean_phone) < 10:
        raise HTTPException(status_code=400, detail="Phone number must be 10 digits.")
    sms_provider.send_otp(clean_phone, DEMO_OTP)
    return {"success": True, "message": f"OTP sent to {clean_phone} (Demo OTP: {DEMO_OTP})"}

@app.post("/api/auth/verify")
def verify_otp(req: VerifyRequest, db: Session = Depends(get_db)):
    if req.otp != DEMO_OTP:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")

    clean_phone = req.phone.strip()
    patient_name = req.patient_name.strip() or "Patient"

    # Generate unique visit code
    count = db.query(Visit).count()
    visit_code = f"V-{1001 + count}"

    assigned_doc_id = None
    if req.appointment_id:
        apt = db.query(Appointment).filter(Appointment.id == req.appointment_id.strip()).first()
        if apt:
            assigned_doc_id = apt.doctor_id

    visit = Visit(
        visit_code=visit_code,
        phone=clean_phone,
        patient_name=patient_name,
        visit_type=req.visit_type,
        appointment_id=req.appointment_id,
        current_location_node="entrance",
        assigned_doctor_id=assigned_doc_id,
        status="active",
        created_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)

    # Add initial tasks
    # 1. Registration always task seq 1
    task1 = VisitTask(
        visit_id=visit.id,
        seq=1,
        kind="registration",
        target_node="registration",
        status="waiting",
        created_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(task1)

    # 2. If appointment, add consultation task seq 2
    if assigned_doc_id:
        doc = db.query(Doctor).filter(Doctor.id == assigned_doc_id).first()
        target_room = doc.room_node if doc else "f1_waiting"
        task2 = VisitTask(
            visit_id=visit.id,
            seq=2,
            kind="consultation",
            target_node=target_room,
            doctor_id=assigned_doc_id,
            status="waiting",
            created_at=datetime.datetime.utcnow().isoformat()
        )
        db.add(task2)

    db.commit()

    token = create_visit_token(visit.id)
    return {
        "token": token,
        "visit": {
            "id": visit.id,
            "visit_code": visit.visit_code,
            "patient_name": visit.patient_name,
            "phone": visit.phone,
            "visit_type": visit.visit_type,
            "current_location_node": visit.current_location_node
        }
    }

@app.get("/api/doctors")
def list_doctors(db: Session = Depends(get_db)):
    doctors = db.query(Doctor).all()
    res = [get_doctor_current_status(db, doc) for doc in doctors]
    return res

@app.get("/api/nodes")
def list_nodes():
    return {"nodes": NODES, "edges": EDGES}

@app.get("/api/route")
def calculate_route(
    src: str = Query("entrance"),
    dst: str = Query("registration"),
    accessible: bool = Query(False)
):
    try:
        return route(src, dst, accessible=accessible)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/qr.svg")
def generate_qr():
    public_url = os.getenv("PUBLIC_URL", "http://localhost:8000")
    qr = segno.make_qr(public_url)
    out = io.BytesIO()
    qr.save(out, kind="svg", scale=5, xmldecl=False)
    return Response(content=out.getvalue(), media_type="image/svg+xml")

# PATIENT AUTHENTICATED ENDPOINTS

@app.get("/api/me")
def get_my_info(visit: Visit = Depends(get_current_visit), db: Session = Depends(get_db)):
    status_info = get_my_status(db, visit)
    tasks = (
        db.query(VisitTask)
        .filter(VisitTask.visit_id == visit.id)
        .order_by(VisitTask.seq)
        .all()
    )

    task_list = []
    for t in tasks:
        doc_name = t.doctor.name if t.doctor else None
        node_lbl = NODES.get(t.target_node, {}).get("label", t.target_node)
        task_list.append({
            "id": t.id,
            "seq": t.seq,
            "kind": t.kind,
            "target_node": t.target_node,
            "target_label": node_lbl,
            "doctor_name": doc_name,
            "status": t.status,
            "note": t.note
        })

    return {
        "visit": {
            "id": visit.id,
            "visit_code": visit.visit_code,
            "patient_name": visit.patient_name,
            "phone": visit.phone,
            "visit_type": visit.visit_type,
            "current_location_node": visit.current_location_node,
            "status": visit.status,
            "created_at": visit.created_at
        },
        "status_info": status_info,
        "tasks": task_list
    }

@app.post("/api/me/location")
def update_my_location(
    req: LocationRequest,
    visit: Visit = Depends(get_current_visit),
    db: Session = Depends(get_db)
):
    if req.node_id not in NODES:
        raise HTTPException(status_code=400, detail="Invalid landmark node ID.")
    visit.current_location_node = req.node_id
    db.commit()
    return {"success": True, "current_location_node": visit.current_location_node}

@app.post("/api/me/feedback")
def submit_feedback(
    req: FeedbackRequest,
    visit: Visit = Depends(get_current_visit),
    db: Session = Depends(get_db)
):
    visit.feedback_rating = req.rating
    visit.feedback_text = req.text
    db.commit()
    return {"success": True, "message": "Feedback submitted successfully."}

@app.post("/api/chat")
def chat_with_nurse(
    req: ChatMessageRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    visit = None
    if authorization:
        try:
            parts = authorization.split(" ")
            if len(parts) == 2 and parts[0].lower() == "bearer":
                payload = decode_token(parts[1])
                visit_id = payload.get("visit_id")
                visit = db.query(Visit).filter(Visit.id == visit_id).first()
        except Exception:
            pass

    return process_chat_message(db, req.message, visit)

# WEBSOCKET ENDPOINT
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
        visit_id = payload.get("visit_id")
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(visit_id, websocket)
    try:
        while True:
            # Keep alive loop
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(visit_id, websocket)

# STAFF ENDPOINTS

@app.get("/api/staff/queue")
def get_staff_queue(
    dept: str = Query("registration"),
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    dept_kind = dept.lower().strip()
    tasks = (
        db.query(VisitTask)
        .join(Visit)
        .filter(VisitTask.kind == dept_kind, Visit.status == "active")
        .order_by(VisitTask.status.desc(), VisitTask.seq.asc())
        .all()
    )

    queue = []
    now = datetime.datetime.utcnow()
    for t in tasks:
        v = t.visit
        # Mask phone number (e.g. +91 ******3210)
        phone_masked = v.phone[:3] + "******" + v.phone[-4:] if len(v.phone) >= 10 else v.phone

        mins_waiting = 0
        try:
            c_time = datetime.datetime.fromisoformat(t.created_at)
            mins_waiting = max(0, int((now - c_time).total_seconds() / 60))
        except Exception:
            pass

        doc_name = t.doctor.name if t.doctor else None

        queue.append({
            "task_id": t.id,
            "visit_id": v.id,
            "visit_code": v.visit_code,
            "patient_name": v.patient_name,
            "phone_masked": phone_masked,
            "minutes_waiting": mins_waiting,
            "status": t.status,  # waiting, called, done, skipped
            "seq": t.seq,
            "kind": t.kind,
            "doctor_name": doc_name,
            "note": t.note
        })

    return {"department": dept_kind, "queue": queue}

@app.post("/api/staff/visits")
def create_staff_visit(
    req: VerifyRequest,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    count = db.query(Visit).count()
    visit_code = f"V-{1001 + count}"
    visit = Visit(
        visit_code=visit_code,
        phone=req.phone.strip(),
        patient_name=req.patient_name.strip(),
        visit_type=req.visit_type,
        status="active",
        created_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)

    # Initial registration task
    t1 = VisitTask(
        visit_id=visit.id,
        seq=1,
        kind="registration",
        target_node="registration",
        status="waiting",
        created_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(t1)
    db.commit()
    return {"success": True, "visit_id": visit.id, "visit_code": visit.visit_code}

@app.post("/api/staff/visits/{visit_id}/tasks")
async def add_visit_task(
    visit_id: int,
    req: AddTaskRequest,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    visit = db.query(Visit).filter(Visit.id == visit_id, Visit.status == "active").first()
    if not visit:
        raise HTTPException(status_code=404, detail="Active visit not found.")

    max_seq = db.query(VisitTask).filter(VisitTask.visit_id == visit_id).count()
    
    # Target node resolution
    target_node = "helpdesk"
    if req.kind == "registration":
        target_node = "registration"
    elif req.kind == "diagnostics":
        target_node = "diagnostics"
    elif req.kind == "pharmacy":
        target_node = "pharmacy"
    elif req.kind == "billing":
        target_node = "billing"
    elif req.kind == "consultation":
        if req.doctor_id:
            doc = db.query(Doctor).filter(Doctor.id == req.doctor_id).first()
            if doc:
                target_node = doc.room_node
        elif visit.assigned_doctor_id:
            doc = db.query(Doctor).filter(Doctor.id == visit.assigned_doctor_id).first()
            if doc:
                target_node = doc.room_node

    task = VisitTask(
        visit_id=visit.id,
        seq=max_seq + 1,
        kind=req.kind.lower(),
        target_node=target_node,
        doctor_id=req.doctor_id or visit.assigned_doctor_id,
        status="waiting",
        note=req.note,
        created_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(task)
    db.commit()

    # Broadcast websocket update
    status_info = get_my_status(db, visit)
    await manager.broadcast_visit_update(visit.id, {"type": "visit_update", "status_info": status_info})

    return {"success": True, "task_id": task.id}

@app.post("/api/staff/tasks/{task_id}/call")
async def call_task(
    task_id: int,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    task = db.query(VisitTask).filter(VisitTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    task.status = "called"
    task.called_at = datetime.datetime.utcnow().isoformat()
    db.commit()

    visit = db.query(Visit).filter(Visit.id == task.visit_id).first()
    if visit:
        status_info = get_my_status(db, visit)
        await manager.broadcast_visit_update(visit.id, {"type": "visit_update", "status_info": status_info})

    return {"success": True, "task_id": task.id, "status": "called"}

@app.post("/api/staff/tasks/{task_id}/done")
async def complete_task(
    task_id: int,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    task = db.query(VisitTask).filter(VisitTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    task.status = "done"
    task.completed_at = datetime.datetime.utcnow().isoformat()

    # Update patient's current location to completed task's node
    visit = db.query(Visit).filter(Visit.id == task.visit_id).first()
    if visit:
        visit.current_location_node = task.target_node
    db.commit()

    if visit:
        status_info = get_my_status(db, visit)
        await manager.broadcast_visit_update(visit.id, {"type": "visit_update", "status_info": status_info})

    return {"success": True, "task_id": task.id, "status": "done"}

@app.post("/api/staff/tasks/{task_id}/skip")
async def skip_task(
    task_id: int,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    task = db.query(VisitTask).filter(VisitTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    task.status = "skipped"
    db.commit()

    visit = db.query(Visit).filter(Visit.id == task.visit_id).first()
    if visit:
        status_info = get_my_status(db, visit)
        await manager.broadcast_visit_update(visit.id, {"type": "visit_update", "status_info": status_info})

    return {"success": True, "task_id": task.id, "status": "skipped"}

@app.put("/api/staff/visits/{visit_id}/doctor")
async def assign_doctor(
    visit_id: int,
    req: AssignDoctorRequest,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found.")

    doc = db.query(Doctor).filter(Doctor.id == req.doctor_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    visit.assigned_doctor_id = doc.id

    # Update target node on consultation task if waiting
    consult_task = (
        db.query(VisitTask)
        .filter(VisitTask.visit_id == visit.id, VisitTask.kind == "consultation", VisitTask.status == "waiting")
        .first()
    )
    if consult_task:
        consult_task.doctor_id = doc.id
        consult_task.target_node = doc.room_node

    db.commit()

    status_info = get_my_status(db, visit)
    await manager.broadcast_visit_update(visit.id, {"type": "visit_update", "status_info": status_info})

    return {"success": True, "assigned_doctor": doc.name}

@app.post("/api/staff/visits/{visit_id}/close")
async def close_visit(
    visit_id: int,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found.")

    visit.status = "closed"
    visit.closed_at = datetime.datetime.utcnow().isoformat()
    db.commit()

    await manager.broadcast_visit_update(visit.id, {"type": "visit_closed"})
    return {"success": True, "message": "Visit closed successfully."}

@app.get("/api/staff/doctors")
def get_staff_doctors(
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    doctors = db.query(Doctor).all()
    res = [get_doctor_current_status(db, doc) for doc in doctors]
    return res

@app.put("/api/staff/doctors/{doctor_id}/override")
def update_doctor_override(
    doctor_id: int,
    req: DoctorOverrideRequest,
    x_staff_key: str = Depends(verify_staff_key),
    db: Session = Depends(get_db)
):
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    today_str = datetime.date.today().isoformat()
    override = db.query(Override).filter(Override.doctor_id == doctor_id, Override.date == today_str).first()

    if not override:
        override = Override(
            doctor_id=doctor_id,
            date=today_str,
            status=req.status,
            room_node=req.room_node,
            note=req.note,
            updated_at=datetime.datetime.utcnow().isoformat()
        )
        db.add(override)
    else:
        override.status = req.status
        override.room_node = req.room_node
        override.note = req.note
        override.updated_at = datetime.datetime.utcnow().isoformat()

    db.commit()
    return {"success": True, "doctor": get_doctor_current_status(db, doc)}

# SERVE FRONTEND STATIC FILES (Must be mounted last!)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
