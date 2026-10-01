import os
import re
from datetime import datetime, date
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from backend.models import Visit, VisitTask, Doctor, Override, Schedule
from backend.routing import route, NODES

EMERGENCY_KEYWORDS = [
    "chest pain", "bleeding", "breathless", "unconscious", "seizure",
    "stroke", "heart attack", "difficulty breathing", "emergency", "severe pain"
]

DEFAULT_WAIT_TIMES = {
    "registration": 10,
    "consultation": 20,
    "diagnostics": 30,
    "pharmacy": 10,
    "billing": 10,
    "discharge": 5
}

def get_wait_time(db: Session, kind: str, visit_task_id: Optional[int] = None) -> Dict[str, Any]:
    kind_lower = kind.lower()
    default_min = DEFAULT_WAIT_TIMES.get(kind_lower, 15)

    # 1. Average duration of last 10 completed tasks of this kind
    completed_tasks = (
        db.query(VisitTask)
        .filter(VisitTask.kind == kind_lower, VisitTask.status == "done", VisitTask.completed_at.isnot(None))
        .order_by(VisitTask.id.desc())
        .limit(10)
        .all()
    )

    durations = []
    for t in completed_tasks:
        try:
            c_time = datetime.fromisoformat(t.created_at)
            done_time = datetime.fromisoformat(t.completed_at)
            diff_mins = max(1, int((done_time - c_time).total_seconds() / 60))
            durations.append(diff_mins)
        except Exception:
            pass

    avg_duration = int(sum(durations) / len(durations)) if durations else default_min

    # 2. Number of patients ahead in waiting status
    waiting_query = db.query(VisitTask).filter(VisitTask.kind == kind_lower, VisitTask.status == "waiting")
    if visit_task_id:
        waiting_ahead = waiting_query.filter(VisitTask.id < visit_task_id).count()
    else:
        waiting_ahead = waiting_query.count()

    estimated_wait = max(0, avg_duration * waiting_ahead)

    return {
        "kind": kind_lower,
        "avg_duration": avg_duration,
        "patients_ahead": waiting_ahead,
        "estimated_wait_minutes": estimated_wait
    }

def get_doctor_current_status(db: Session, doctor: Doctor) -> Dict[str, Any]:
    today_str = date.today().isoformat()
    today_weekday = date.today().weekday()

    # Check override
    override = db.query(Override).filter(Override.doctor_id == doctor.id, Override.date == today_str).first()
    
    current_status = "in"
    current_room_node = doctor.room_node
    note = None
    last_updated = datetime.utcnow().isoformat()

    if override:
        current_status = override.status
        if override.room_node:
            current_room_node = override.room_node
        if override.note:
            note = override.note
        if override.updated_at:
            last_updated = override.updated_at
    else:
        # Check schedule
        schedule = db.query(Schedule).filter(Schedule.doctor_id == doctor.id, Schedule.weekday == today_weekday).first()
        if not schedule:
            current_status = "out"

    room_info = NODES.get(current_room_node, {})
    room_label = room_info.get("label", doctor.room_label)
    floor = room_info.get("floor", doctor.floor)

    return {
        "id": doctor.id,
        "name": doctor.name,
        "department": doctor.department,
        "status": current_status,
        "room_node": current_room_node,
        "room_label": room_label,
        "floor": floor,
        "hours": "09:00 - 17:00",
        "note": note,
        "last_updated": last_updated,
        "disclaimer": "Availability can change. Confirm at the desk."
    }

def find_doctor(db: Session, query: str) -> List[Dict[str, Any]]:
    query_lower = query.lower()
    doctors = db.query(Doctor).all()
    results = []
    for doc in doctors:
        if (query_lower in doc.name.lower() or 
            query_lower in doc.department.lower() or 
            query_lower in doc.room_label.lower() or
            query_lower in doc.room_node.lower()):
            results.append(get_doctor_current_status(db, doc))
    return results

def get_my_status(db: Session, visit: Visit) -> Dict[str, Any]:
    current_task = (
        db.query(VisitTask)
        .filter(VisitTask.visit_id == visit.id, VisitTask.status.in_(["waiting", "called"]))
        .order_by(VisitTask.seq)
        .first()
    )

    if not current_task:
        return {
            "visit_code": visit.visit_code,
            "patient_name": visit.patient_name,
            "status": visit.status,
            "has_current_task": False,
            "message": "All visit tasks are completed. You can proceed to discharge at the helpdesk."
        }

    doc_info = None
    if current_task.doctor_id:
        doc = db.query(Doctor).filter(Doctor.id == current_task.doctor_id).first()
        if doc:
            doc_info = get_doctor_current_status(db, doc)

    target_node = current_task.target_node
    if doc_info and doc_info.get("room_node"):
        target_node = doc_info["room_node"]

    node_data = NODES.get(target_node, {})

    wait_info = get_wait_time(db, current_task.kind, current_task.id)

    route_info = route(visit.current_location_node, target_node, accessible=False)

    return {
        "visit_code": visit.visit_code,
        "patient_name": visit.patient_name,
        "has_current_task": True,
        "task_id": current_task.id,
        "kind": current_task.kind,
        "status": current_task.status,
        "target_node": target_node,
        "target_label": node_data.get("label", target_node),
        "floor": node_data.get("floor", 0),
        "doctor": doc_info,
        "wait_minutes": wait_info["estimated_wait_minutes"],
        "patients_ahead": wait_info["patients_ahead"],
        "route": route_info
    }

def process_chat_message(db: Session, message: str, visit: Optional[Visit] = None) -> Dict[str, Any]:
    msg_lower = message.lower().strip()

    # 1. Emergency check FIRST
    for em_kw in EMERGENCY_KEYWORDS:
        if em_kw in msg_lower:
            emergency_route = route(
                visit.current_location_node if visit else "entrance",
                "emergency",
                accessible=False
            )
            return {
                "reply": "Emergency detected. Please proceed directly to the Emergency Room. Hospital staff have been alerted.",
                "gesture": "point",
                "card": {
                    "type": "emergency",
                    "route": emergency_route,
                    "phone": os.getenv("EMERGENCY_PHONE", "+1-800-555-0199")
                }
            }

    # 2. Greeting
    if any(g in msg_lower for g in ["hello", "hi", "hey", "greetings", "namaste"]):
        name = visit.patient_name if visit else "there"
        reply = f"Hello {name}! I am your hospital assistant. How can I help you today?"
        return {"reply": reply, "gesture": "wave", "card": None}

    # 3. My status / Next step
    if any(k in msg_lower for k in ["status", "next step", "where do i go", "what now", "current task", "where should i go"]):
        if not visit:
            return {"reply": "Please log in to check your visit status.", "gesture": "none", "card": None}
        
        status_info = get_my_status(db, visit)
        if not status_info["has_current_task"]:
            return {"reply": status_info["message"], "gesture": "nod", "card": None}
        
        target_name = status_info["target_label"]
        fl = f"Floor {status_info['floor']}" if status_info['floor'] > 0 else "Ground floor"
        wait = status_info["wait_minutes"]
        
        doc_str = f" with {status_info['doctor']['name']}" if status_info.get("doctor") else ""
        reply = f"Your current step is {status_info['kind']}{doc_str}. Please proceed to {target_name} on the {fl}. Estimated wait is {wait} minutes."
        
        if status_info["status"] == "called":
            reply = f"You have been called! Please go in now to {target_name} on the {fl}."

        return {
            "reply": reply,
            "gesture": "point",
            "card": {"type": "route", "data": status_info["route"]}
        }

    # 4. What is pending
    if any(k in msg_lower for k in ["pending", "tasks left", "remaining", "schedule", "my visit"]):
        if not visit:
            return {"reply": "Please log in to view your visit plan.", "gesture": "none", "card": None}
        
        tasks = (
            db.query(VisitTask)
            .filter(VisitTask.visit_id == visit.id)
            .order_by(VisitTask.seq)
            .all()
        )
        if not tasks:
            return {"reply": "You have no scheduled tasks.", "gesture": "nod", "card": None}

        task_list_str = []
        for t in tasks:
            st_mark = "✓" if t.status == "done" else ("➔" if t.status in ["waiting", "called"] else "x")
            task_list_str.append(f"{st_mark} Step {t.seq}: {t.kind.capitalize()} ({t.status})")
        
        reply = "Here is your visit outline:\n" + "\n".join(task_list_str)
        return {"reply": reply, "gesture": "nod", "card": None}

    # 5. Doctor lookup / Department search
    for dept in ["cardiology", "general medicine", "orthopaedics", "paediatrics"]:
        if dept in msg_lower:
            docs = find_doctor(db, dept)
            if not docs:
                return {"reply": f"No doctors found in {dept.capitalize()} department.", "gesture": "none", "card": None}
            doc = docs[0]
            r = route(visit.current_location_node if visit else "entrance", doc["room_node"])
            reply = f"{doc['name']} ({doc['department']}) is in {doc['room_label']} on Floor {doc['floor']}. Status: {doc['status'].upper()}."
            return {"reply": reply, "gesture": "point", "card": {"type": "route", "data": r}}

    if "doctor" in msg_lower:
        docs = db.query(Doctor).all()
        doc_names = ", ".join([d.name for d in docs])
        return {"reply": f"Our doctors on duty today: {doc_names}.", "gesture": "nod", "card": None}

    # Department location routing
    dept_nodes = {
        "pharmacy": "pharmacy",
        "billing": "billing",
        "registration": "registration",
        "helpdesk": "helpdesk",
        "diagnostics": "diagnostics",
        "lab": "diagnostics",
        "discharge": "helpdesk"
    }
    for kw, node_id in dept_nodes.items():
        if kw in msg_lower:
            r = route(visit.current_location_node if visit else "entrance", node_id)
            node_info = NODES[node_id]
            reply = f"The {node_info['label']} is located on the Ground floor."
            return {"reply": reply, "gesture": "point", "card": {"type": "route", "data": r}}

    # 6. Wait time query
    if any(k in msg_lower for k in ["wait time", "how long", "wait", "delay", "queue"]):
        if visit:
            status_info = get_my_status(db, visit)
            if status_info.get("has_current_task"):
                w = status_info["wait_minutes"]
                p = status_info["patients_ahead"]
                reply = f"The estimated wait time for your {status_info['kind']} is {w} minutes with {p} patients ahead of you."
                return {"reply": reply, "gesture": "nod", "card": None}
        
        reply = "Average wait times are 10 minutes for registration, 20 minutes for consultation, and 30 minutes for diagnostics."
        return {"reply": reply, "gesture": "nod", "card": None}

    # 7. Accessibility query
    if any(k in msg_lower for k in ["wheelchair", "accessible", "elevator", "lift", "stairs-free"]):
        if visit:
            status_info = get_my_status(db, visit)
            if status_info.get("has_current_task"):
                acc_route = route(visit.current_location_node, status_info["target_node"], accessible=True)
                reply = f"Here is the step-free accessible route using Lift A to reach {status_info['target_label']}."
                return {"reply": reply, "gesture": "point", "card": {"type": "route", "data": acc_route}}

        acc_route = route("entrance", "lift_g", accessible=True)
        return {
            "reply": "All main corridors and Lift A are fully wheelchair accessible.",
            "gesture": "nod",
            "card": {"type": "route", "data": acc_route}
        }

    # 8. Help query
    if any(k in msg_lower for k in ["help", "options", "what can you do"]):
        reply = "I can guide you through your visit! Try asking: 'Where do I go next?', 'What is pending?', 'How long is the wait?', or 'Where is the pharmacy?'."
        return {"reply": reply, "gesture": "wave", "card": None}

    # Fallback response
    return {"reply": "Please ask the help desk for further assistance.", "gesture": "none", "card": None}
