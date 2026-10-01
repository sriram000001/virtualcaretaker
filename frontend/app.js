import { api } from './api.js';
import { t, setLanguage, getLanguage } from './i18n.js';
import { HospitalMap } from './map.js';

let currentVisit = null;
let currentTasks = [];
let nurse3d = null;
let ws = null;
let graphNodes = {};

document.addEventListener("DOMContentLoaded", async () => {
  window.hospitalMap = new HospitalMap("map-container");

  // Load hospital nodes & edges for map
  try {
    const data = await api.getNodes();
    graphNodes = data.nodes;
    window.hospitalMap.init(data.nodes, data.edges);
    populateSomewhereElseDropdown(data.nodes);
  } catch (e) {
    console.error("Failed to load map graph data:", e);
  }

  // Setup Language Selector
  const langSelect = document.getElementById("lang-select");
  if (langSelect) {
    langSelect.value = getLanguage();
    langSelect.addEventListener("change", (e) => {
      setLanguage(e.target.value);
      updateUILabels();
      if (currentVisit) refreshPatientState();
    });
  }

  // Bind Visit Type Selection Buttons
  document.querySelectorAll("[data-visit-type]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const vType = e.currentTarget.getAttribute("data-visit-type");
      handleVisitTypeSelect(vType);
    });
  });

  // Bind Auth Forms
  document.getElementById("btn-request-otp")?.addEventListener("click", handleRequestOTP);
  document.getElementById("btn-verify-otp")?.addEventListener("click", handleVerifyOTP);
  document.getElementById("btn-emergency-call")?.addEventListener("click", () => {
    window.location.href = "tel:+18005550199";
  });

  // Directions search
  document.getElementById("directions-search")?.addEventListener("input", handleDirectionsSearch);

  // Accessible toggle switch
  document.getElementById("accessible-toggle")?.addEventListener("change", (e) => {
    if (currentVisit) renderCurrentTaskRoute(e.target.checked);
  });

  // "I'm somewhere else" selector
  document.getElementById("location-selector")?.addEventListener("change", async (e) => {
    const newNode = e.target.value;
    if (newNode && currentVisit) {
      await api.updateLocation(newNode);
      refreshPatientState();
    }
  });

  // Chat Input
  document.getElementById("chat-send-btn")?.addEventListener("click", handleSendChat);
  document.getElementById("chat-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSendChat();
  });

  // Quick reply buttons
  document.querySelectorAll(".quick-reply-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const msg = e.target.getAttribute("data-msg");
      if (msg) {
        document.getElementById("chat-input").value = msg;
        handleSendChat();
      }
    });
  });

  // Feedback form submit
  document.getElementById("btn-submit-feedback")?.addEventListener("click", handleSubmitFeedback);

  // Check if active session token exists in sessionStorage
  const token = sessionStorage.getItem("visit_token");
  if (token) {
    refreshPatientState();
  } else {
    showScreen("screen-welcome");
  }

  // Load 3D Nurse lazily
  initNurse3D();
});

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(screenId)?.classList.remove("hidden");
}

function updateUILabels() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
}

function populateSomewhereElseDropdown(nodes) {
  const select = document.getElementById("location-selector");
  if (!select) return;
  select.innerHTML = `<option value="">${t("somewhere_else")}...</option>`;
  Object.values(nodes).forEach(n => {
    if (["entrance", "lobby", "helpdesk", "f1_waiting", "g_junction", "f1_junction"].includes(n.id)) {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${n.label} (Floor ${n.floor})`;
      select.appendChild(opt);
    }
  });
}

// 3D Nurse Lazy Loader
async function initNurse3D() {
  try {
    // Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showNurse2DFallback();
      return;
    }

    const canvas = document.getElementById("nurse-canvas");
    if (!canvas) return;

    const { Nurse3D } = await import('./nurse3d.js');
    nurse3d = new Nurse3D(canvas);
    const success = nurse3d.init();
    if (!success) {
      showNurse2DFallback();
    } else {
      document.getElementById("nurse-2d-fallback")?.classList.add("hidden");
      canvas.classList.remove("hidden");

      // Bind mute button
      document.getElementById("mute-btn")?.addEventListener("click", () => {
        const isMuted = nurse3d.toggleMute();
        document.getElementById("mute-icon").textContent = isMuted ? "🔇" : "🔊";
      });
    }
  } catch (e) {
    console.warn("Failed to load 3D nurse module:", e);
    showNurse2DFallback();
  }
}

function showNurse2DFallback() {
  document.getElementById("nurse-canvas")?.classList.add("hidden");
  document.getElementById("nurse-2d-fallback")?.classList.remove("hidden");
}

// Visit Flow Handlers
function handleVisitTypeSelect(type) {
  if (type === "emergency") {
    showScreen("screen-emergency");
    loadEmergencyRoute();
  } else if (type === "directions") {
    showScreen("screen-directions");
    loadDirectionsList();
  } else {
    // appointment or walkin
    window.selectedVisitType = type;
    document.getElementById("apt-id-group").style.display = (type === "appointment") ? "block" : "none";
    showScreen("screen-auth");
  }
}

async function loadEmergencyRoute() {
  try {
    const routeData = await api.getRoute("entrance", "emergency", false);
    window.hospitalMap.renderRoute(routeData);
    renderStepTextList("emergency-steps", routeData.steps);
  } catch (e) {
    console.error("Failed to load emergency route:", e);
  }
}

async function loadDirectionsList() {
  try {
    const doctors = await api.getDoctors();
    const listEl = document.getElementById("doctors-dir-list");
    listEl.innerHTML = doctors.map(d => `
      <div class="card" style="cursor:pointer;" onclick="window.showDoctorRoute('${d.room_node}')">
        <div class="flex-between">
          <div>
            <h3>${d.name}</h3>
            <p class="text-muted">${d.department} • ${d.room_label} (Floor ${d.floor})</p>
          </div>
          <span class="status-badge status-${d.status}">${d.status.toUpperCase()}</span>
        </div>
      </div>
    `).join("");
  } catch (e) {}
}

window.showDoctorRoute = async function(targetNode) {
  try {
    const routeData = await api.getRoute("entrance", targetNode, false);
    window.hospitalMap.renderRoute(routeData);
    renderStepTextList("directions-steps", routeData.steps);
  } catch (e) {}
};

function handleDirectionsSearch(e) {
  const query = e.target.value.toLowerCase();
  document.querySelectorAll("#doctors-dir-list .card").forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(query) ? "flex" : "none";
  });
}

async function handleRequestOTP() {
  const phone = document.getElementById("auth-phone").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";

  try {
    const res = await api.requestOTP(phone);
    document.getElementById("otp-step-1").classList.add("hidden");
    document.getElementById("otp-step-2").classList.remove("hidden");
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleVerifyOTP() {
  const phone = document.getElementById("auth-phone").value;
  const name = document.getElementById("auth-name").value;
  const otp = document.getElementById("auth-otp").value;
  const aptId = document.getElementById("auth-apt-id")?.value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";

  try {
    const res = await api.verifyOTP(phone, otp, name, window.selectedVisitType, aptId);
    connectWebSocket(res.token);
    refreshPatientState();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

// Patient State Refresh & UI Render
async function refreshPatientState() {
  try {
    const data = await api.getMyInfo();
    currentVisit = data.visit;
    currentTasks = data.tasks;

    if (currentVisit.status === "closed") {
      showScreen("screen-discharge");
      return;
    }

    showScreen("screen-patient");
    connectWebSocket(sessionStorage.getItem("visit_token"));

    // Render "Now" Card
    const statusInfo = data.status_info;
    renderNowCard(statusInfo);

    // Render Directions Map & Steps
    if (statusInfo.has_current_task) {
      renderCurrentTaskRoute(document.getElementById("accessible-toggle")?.checked || false);
    }

    // Render Timeline
    renderTimeline(data.tasks);

  } catch (err) {
    console.error("Failed to fetch visit info:", err);
    sessionStorage.removeItem("visit_token");
    showScreen("screen-welcome");
  }
}

function renderNowCard(info) {
  const container = document.getElementById("now-card-body");
  if (!info || !info.has_current_task) {
    container.innerHTML = `
      <div class="status-badge status-done">All tasks completed</div>
      <p>Please proceed to the Helpdesk for discharge.</p>
    `;
    return;
  }

  const isCalled = info.status === "called";
  const docName = info.doctor ? info.doctor.name : null;
  const floorName = info.floor === 1 ? t("first_floor") : t("ground_floor");

  container.innerHTML = `
    <div class="flex-between">
      <div>
        <span class="status-badge status-${info.status}">
          <span class="status-dot"></span>
          ${isCalled ? t("please_go_in") : info.status.toUpperCase()}
        </span>
        <h2 style="margin-top: 8px;">${info.kind.toUpperCase()}: ${info.target_label}</h2>
        ${docName ? `<p><strong>${t("doctor")}:</strong> ${docName}</p>` : ''}
        <p class="text-muted"><strong>${t("floor")}:</strong> ${floorName}</p>
      </div>
      ${!isCalled ? `
        <div style="text-align: right;">
          <div style="font-size: 24px; font-weight: 600; color: var(--primary);">${info.wait_minutes}m</div>
          <div class="text-muted">${t("estimated_wait")}</div>
        </div>
      ` : ''}
    </div>
  `;

  // Speech utterance if called
  if (isCalled && nurse3d) {
    nurse3d.triggerGesture('wave');
    nurse3d.speak(`Attention ${currentVisit.patient_name}, please go in now to ${info.target_label}.`, getLanguage() === 'hi' ? 'hi-IN' : 'en-US');
  }
}

async function renderCurrentTaskRoute(accessible = false) {
  if (!currentVisit) return;
  const statusInfo = (await api.getMyInfo()).status_info;
  if (!statusInfo.has_current_task) return;

  try {
    const routeData = await api.getRoute(currentVisit.current_location_node, statusInfo.target_node, accessible);
    window.hospitalMap.renderRoute(routeData);
    renderStepTextList("patient-steps", routeData.steps);
  } catch (e) {
    console.error("Failed to render route:", e);
  }
}

function renderStepTextList(containerId, steps) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = steps.map((s, idx) => `
    <li class="step-item">
      <span class="step-number">${idx + 1}</span>
      <span>${s}</span>
    </li>
  `).join("");
}

function renderTimeline(tasks) {
  const container = document.getElementById("timeline-container");
  if (!container) return;

  container.innerHTML = tasks.map(t => {
    const isDone = t.status === "done";
    const isActive = t.status === "waiting" || t.status === "called";
    return `
      <div class="timeline-item ${isDone ? 'completed' : ''} ${isActive ? 'active' : ''}">
        <div class="timeline-marker">${isDone ? '✓' : t.seq}</div>
        <div class="timeline-content">
          <strong>${t.kind.toUpperCase()}</strong> - ${t.target_label}
          ${t.doctor_name ? `<br><small class="text-muted">With ${t.doctor_name}</small>` : ''}
          <div style="font-size: 13px; margin-top: 2px;">
            <span class="status-badge status-${t.status}">
              <span class="status-dot"></span>${t.status}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Chat functionality
async function handleSendChat() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  input.value = "";
  appendChatMessage(msg, "user");

  try {
    const res = await api.sendChatMessage(msg);
    appendChatMessage(res.reply, "bot");

    // Trigger 3D nurse gesture and speech
    if (nurse3d) {
      if (res.gesture) nurse3d.triggerGesture(res.gesture);
      nurse3d.speak(res.reply, getLanguage() === 'hi' ? 'hi-IN' : 'en-US');
    }

    // Render card if returned
    if (res.card && res.card.type === "route") {
      window.hospitalMap.renderRoute(res.card.data);
      renderStepTextList("patient-steps", res.card.data.steps);
    } else if (res.card && res.card.type === "emergency") {
      window.hospitalMap.renderRoute(res.card.route);
      renderStepTextList("patient-steps", res.card.route.steps);
    }
  } catch (e) {
    appendChatMessage("Sorry, I could not process your message.", "bot");
  }
}

function appendChatMessage(text, sender) {
  const container = document.getElementById("chat-messages");
  if (!container) return;
  const msgDiv = document.createElement("div");
  msgDiv.className = `msg msg-${sender}`;
  msgDiv.textContent = text;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Feedback
async function handleSubmitFeedback() {
  const ratingBtn = document.querySelector(".star-btn.selected");
  const rating = ratingBtn ? parseInt(ratingBtn.getAttribute("data-star")) : 5;
  const text = document.getElementById("feedback-text")?.value;

  try {
    await api.submitFeedback(rating, text);
    alert("Thank you for your feedback!");
    sessionStorage.removeItem("visit_token");
    showScreen("screen-welcome");
  } catch (e) {
    alert("Could not submit feedback.");
  }
}

window.selectStar = function(btn, star) {
  document.querySelectorAll(".star-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
};

// WebSocket Handler
function connectWebSocket(token) {
  if (ws) return;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "visit_update") {
        refreshPatientState();
      } else if (data.type === "visit_closed") {
        showScreen("screen-discharge");
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    ws = null;
  };
}
