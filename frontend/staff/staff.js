import { api } from '../api.js';

export function checkStaffAuth() {
  let key = sessionStorage.getItem("staff_key");
  if (!key) {
    key = prompt("Enter Staff Access Key:", "demo-staff");
    if (key) {
      sessionStorage.setItem("staff_key", key);
    }
  }
}

// Front Desk Logic
export async function loadFrontDesk() {
  checkStaffAuth();
  await loadStaffDoctorsTable();

  document.getElementById("btn-lookup-visit")?.addEventListener("click", handleLookupVisit);
  document.getElementById("btn-assign-doc")?.addEventListener("click", handleAssignDoctor);
  document.getElementById("btn-add-task")?.addEventListener("click", handleAddTask);
  document.getElementById("btn-close-visit")?.addEventListener("click", handleCloseVisit);
}

async function loadStaffDoctorsTable() {
  const container = document.getElementById("staff-doctors-tbody");
  if (!container) return;

  try {
    const doctors = await api.getStaffDoctors();
    container.innerHTML = doctors.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td>${d.department}</td>
        <td>${d.room_label} (Floor ${d.floor})</td>
        <td>
          <select class="form-select" style="min-height:36px; padding:0 8px;" onchange="window.onDoctorOverrideChange(${d.id})">
            <option value="in" ${d.status === 'in' ? 'selected' : ''}>IN</option>
            <option value="out" ${d.status === 'out' ? 'selected' : ''}>OUT</option>
            <option value="leave" ${d.status === 'leave' ? 'selected' : ''}>ON LEAVE</option>
            <option value="delayed" ${d.status === 'delayed' ? 'selected' : ''}>DELAYED</option>
          </select>
        </td>
        <td>
          <input type="text" id="doc-room-override-${d.id}" class="form-input" style="min-height:36px; font-size:14px;" value="${d.room_node || ''}" placeholder="Node ID (e.g. room_102)">
        </td>
        <td>
          <input type="text" id="doc-note-${d.id}" class="form-input" style="min-height:36px; font-size:14px;" value="${d.note || ''}" placeholder="Note...">
        </td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="window.saveDoctorOverride(${d.id})">Save</button>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    alert("Authentication failed. Invalid staff key.");
    sessionStorage.removeItem("staff_key");
    checkStaffAuth();
  }
}

window.saveDoctorOverride = async function(docId) {
  const row = document.querySelector(`#doc-room-override-${docId}`).closest("tr");
  const status = row.querySelector("select").value;
  const roomNode = document.getElementById(`doc-room-override-${docId}`).value.trim() || null;
  const note = document.getElementById(`doc-note-${docId}`).value.trim() || null;

  try {
    await api.updateDoctorOverride(docId, status, roomNode, note);
    alert("Doctor status updated successfully!");
    loadStaffDoctorsTable();
  } catch (e) {
    alert(e.message);
  }
};

async function handleLookupVisit() {
  const phone = document.getElementById("lookup-phone").value.trim();
  if (!phone) return;
  
  try {
    const queueData = await api.getStaffQueue("registration");
    // Find matching visit in registration queue or lookup
    alert(`Looking up visit for phone: ${phone}. Enter Visit ID directly in actions below.`);
  } catch (e) {
    alert(e.message);
  }
}

async function handleAssignDoctor() {
  const visitId = parseInt(document.getElementById("action-visit-id").value);
  const doctorId = parseInt(document.getElementById("action-doctor-id").value);
  if (!visitId || !doctorId) return alert("Enter Visit ID and Doctor ID");

  try {
    await api.assignDoctor(visitId, doctorId);
    alert(`Assigned Doctor ID ${doctorId} to Visit #${visitId}`);
  } catch (e) {
    alert(e.message);
  }
}

async function handleAddTask() {
  const visitId = parseInt(document.getElementById("action-visit-id").value);
  const kind = document.getElementById("action-task-kind").value;
  const doctorId = parseInt(document.getElementById("action-doctor-id").value) || null;
  if (!visitId || !kind) return alert("Enter Visit ID and Task Kind");

  try {
    await api.addVisitTask(visitId, kind, doctorId);
    alert(`Added ${kind.toUpperCase()} task to Visit #${visitId}`);
  } catch (e) {
    alert(e.message);
  }
}

async function handleCloseVisit() {
  const visitId = parseInt(document.getElementById("action-visit-id").value);
  if (!visitId) return alert("Enter Visit ID");

  try {
    await api.closeVisit(visitId);
    alert(`Closed Visit #${visitId}`);
  } catch (e) {
    alert(e.message);
  }
}

// Department Dashboard Logic
export async function loadDashboard() {
  checkStaffAuth();
  
  const deptSelect = document.getElementById("dept-selector");
  if (deptSelect) {
    deptSelect.addEventListener("change", () => renderDashboardQueue());
  }

  renderDashboardQueue();
  setInterval(() => renderDashboardQueue(), 5000);  // Auto-refresh every 5s
}

async function renderDashboardQueue() {
  const dept = document.getElementById("dept-selector")?.value || "registration";
  const tbody = document.getElementById("queue-tbody");
  if (!tbody) return;

  try {
    const res = await api.getStaffQueue(dept);
    const queue = res.queue;

    if (queue.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;" class="text-muted">No active patients in ${dept.toUpperCase()} queue.</td></tr>`;
      return;
    }

    tbody.innerHTML = queue.map(q => `
      <tr>
        <td><strong>${q.visit_code}</strong> (ID: ${q.visit_id})</td>
        <td>${q.patient_name}</td>
        <td>${q.phone_masked}</td>
        <td>${q.minutes_waiting} mins</td>
        <td><span class="status-badge status-${q.status}">${q.status.toUpperCase()}</span></td>
        <td>${q.doctor_name || '-'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-primary btn-sm" onclick="window.callPatientTask(${q.task_id})">Call</button>
            <button class="btn btn-secondary btn-sm" onclick="window.completePatientTask(${q.task_id})">Done</button>
            <button class="btn btn-secondary btn-sm" onclick="window.skipPatientTask(${q.task_id})">Skip</button>
            <button class="btn btn-secondary btn-sm" onclick="window.promptAddNextStep(${q.visit_id})">+ Step</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    console.error("Failed to load queue:", e);
  }
}

window.callPatientTask = async function(taskId) {
  try {
    await api.callTask(taskId);
    renderDashboardQueue();
  } catch (e) { alert(e.message); }
};

window.completePatientTask = async function(taskId) {
  try {
    await api.completeTask(taskId);
    renderDashboardQueue();
  } catch (e) { alert(e.message); }
};

window.skipPatientTask = async function(taskId) {
  try {
    await api.skipTask(taskId);
    renderDashboardQueue();
  } catch (e) { alert(e.message); }
};

window.promptAddNextStep = async function(visitId) {
  const kind = prompt("Enter next step kind (consultation, diagnostics, pharmacy, billing, discharge):", "diagnostics");
  if (!kind) return;
  try {
    await api.addVisitTask(visitId, kind);
    alert(`Appended ${kind} to Visit #${visitId}`);
    renderDashboardQueue();
  } catch (e) { alert(e.message); }
};
