import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from datetime import datetime, date
from backend.db import engine, Base, SessionLocal
from backend.models import Doctor, Schedule, Override, Appointment, Visit, VisitTask

def seed_database(reset: bool = False):
    if reset:
        print("Resetting database tables...")
        Base.metadata.drop_all(bind=engine)
    
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # Check if database is already seeded
        if db.query(Doctor).count() > 0:
            print("Database already contains data. Skipping seed.")
            return

        print("Seeding initial hospital data...")

        # 1. Doctors
        doctors_data = [
            {"id": 1, "name": "Dr. Rajesh Sharma", "department": "General Medicine", "room_label": "Room 101", "room_node": "room_101", "floor": 1},
            {"id": 2, "name": "Dr. Meera Iyer", "department": "Cardiology", "room_label": "Room 102", "room_node": "room_102", "floor": 1},
            {"id": 3, "name": "Dr. Ananya Verma", "department": "Orthopaedics", "room_label": "Room 103", "room_node": "room_103", "floor": 1},
            {"id": 4, "name": "Dr. Vikram Patel", "department": "Paediatrics", "room_label": "Room 104", "room_node": "room_104", "floor": 1},
            {"id": 5, "name": "Dr. Sunita Gupta", "department": "General Medicine", "room_label": "Room 101", "room_node": "room_101", "floor": 1},
            {"id": 6, "name": "Dr. Arjun Reddy", "department": "Cardiology", "room_label": "Room 102", "room_node": "room_102", "floor": 1}
        ]

        for d_info in doctors_data:
            doc = Doctor(**d_info)
            db.add(doc)
        db.commit()

        # 2. Schedules (Mon to Sat 09:00 - 17:00)
        for doc_id in range(1, 7):
            for weekday in range(0, 6):  # 0=Mon to 5=Sat
                sched = Schedule(
                    doctor_id=doc_id,
                    weekday=weekday,
                    start_time="09:00",
                    end_time="17:00"
                )
                db.add(sched)
        db.commit()

        # 3. Overrides (Today's date)
        today_str = date.today().isoformat()
        
        # Override 1: Dr. Sunita Gupta is on leave
        ov1 = Override(
            doctor_id=5,
            date=today_str,
            status="leave",
            room_node=None,
            note="Attending medical conference",
            updated_at=datetime.utcnow().isoformat()
        )
        # Override 2: Dr. Rajesh Sharma temporarily moved room node to helpdesk
        ov2 = Override(
            doctor_id=1,
            date=today_str,
            status="in",
            room_node="helpdesk",
            note="Relocated to Helpdesk for morning triage",
            updated_at=datetime.utcnow().isoformat()
        )
        db.add(ov1)
        db.add(ov2)
        db.commit()

        # 4. Appointments
        apt1 = Appointment(
            id="APT-1001",
            patient_name="Rohan Kumar",
            phone="9876543210",
            doctor_id=2,  # Dr. Meera Iyer
            scheduled_time="10:00 AM"
        )
        apt2 = Appointment(
            id="APT-1002",
            patient_name="Priya Nair",
            phone="9123456789",
            doctor_id=3,  # Dr. Ananya Verma
            scheduled_time="11:30 AM"
        )
        db.add(apt1)
        db.add(apt2)
        db.commit()

        print("Database successfully seeded.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    seed_database(reset=reset_flag)
