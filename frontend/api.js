const API_BASE = "";

function getAuthHeader() {
  const token = sessionStorage.getItem("visit_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

function getStaffHeader() {
  const staffKey = sessionStorage.getItem("staff_key") || "demo-staff";
  return { "X-Staff-Key": staffKey };
}

async function handleResponse(response) {
  if (!response.ok) {
    let errMessage = "API Error";
    try {
      const data = await response.json();
      errMessage = data.detail || data.message || errMessage;
    } catch (e) {}
    throw new Error(errMessage);
  }
  return await response.json();
}

export const api = {
  // Public
  async requestOTP(phone) {
    const res = await fetch(`${API_BASE}/api/auth/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    return handleResponse(res);
  },

  async verifyOTP(phone, otp, patient_name, visit_type, appointment_id) {
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp, patient_name, visit_type, appointment_id })
    });
    const data = await handleResponse(res);
    if (data.token) {
      sessionStorage.setItem("visit_token", data.token);
    }
    return data;
  },

  async getDoctors() {
    const res = await fetch(`${API_BASE}/api/doctors`);
    return handleResponse(res);
  },

  async getNodes() {
    const res = await fetch(`${API_BASE}/api/nodes`);
    return handleResponse(res);
  },

  async getRoute(src, dst, accessible = false) {
    const res = await fetch(`${API_BASE}/api/route?src=${encodeURIComponent(src)}&dst=${encodeURIComponent(dst)}&accessible=${accessible}`);
    return handleResponse(res);
  },

  // Patient
  async getMyInfo() {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async updateLocation(node_id) {
    const res = await fetch(`${API_BASE}/api/me/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ node_id })
    });
    return handleResponse(res);
  },

  async submitFeedback(rating, text) {
    const res = await fetch(`${API_BASE}/api/me/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ rating, text })
    });
    return handleResponse(res);
  },

  async sendChatMessage(message) {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ message })
    });
    return handleResponse(res);
  },

  // Staff
  async getStaffQueue(dept) {
    const res = await fetch(`${API_BASE}/api/staff/queue?dept=${encodeURIComponent(dept)}`, {
      headers: { ...getStaffHeader() }
    });
    return handleResponse(res);
  },

  async createStaffVisit(phone, patient_name, visit_type) {
    const res = await fetch(`${API_BASE}/api/staff/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getStaffHeader() },
      body: JSON.stringify({ phone, otp: "123456", patient_name, visit_type })
    });
    return handleResponse(res);
  },

  async addVisitTask(visitId, kind, doctorId, note) {
    const res = await fetch(`${API_BASE}/api/staff/visits/${visitId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getStaffHeader() },
      body: JSON.stringify({ kind, doctor_id: doctorId, note })
    });
    return handleResponse(res);
  },

  async callTask(taskId) {
    const res = await fetch(`${API_BASE}/api/staff/tasks/${taskId}/call`, {
      method: "POST",
      headers: { ...getStaffHeader() }
    });
    return handleResponse(res);
  },

  async completeTask(taskId) {
    const res = await fetch(`${API_BASE}/api/staff/tasks/${taskId}/done`, {
      method: "POST",
      headers: { ...getStaffHeader() }
    });
    return handleResponse(res);
  },

  async skipTask(taskId) {
    const res = await fetch(`${API_BASE}/api/staff/tasks/${taskId}/skip`, {
      method: "POST",
      headers: { ...getStaffHeader() }
    });
    return handleResponse(res);
  },

  async assignDoctor(visitId, doctorId) {
    const res = await fetch(`${API_BASE}/api/staff/visits/${visitId}/doctor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getStaffHeader() },
      body: JSON.stringify({ doctor_id: doctorId })
    });
    return handleResponse(res);
  },

  async closeVisit(visitId) {
    const res = await fetch(`${API_BASE}/api/staff/visits/${visitId}/close`, {
      method: "POST",
      headers: { ...getStaffHeader() }
    });
    return handleResponse(res);
  },

  async getStaffDoctors() {
    const res = await fetch(`${API_BASE}/api/staff/doctors`, {
      headers: { ...getStaffHeader() }
    });
    return handleResponse(res);
  },

  async updateDoctorOverride(doctorId, status, roomNode, note) {
    const res = await fetch(`${API_BASE}/api/staff/doctors/${doctorId}/override`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getStaffHeader() },
      body: JSON.stringify({ status, room_node: roomNode, note })
    });
    return handleResponse(res);
  }
};
