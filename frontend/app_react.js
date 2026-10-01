import { api } from './api.js';
import { t, setLanguage, getLanguage } from './i18n.js';
import { HospitalMap } from './map.js';

const { useState, useEffect, useRef } = React;

function App() {
  const [lang, setLang] = useState(getLanguage());
  const [screen, setScreen] = useState('welcome');
  const [visitType, setVisitType] = useState('appointment');
  const [visit, setVisit] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [statusInfo, setStatusInfo] = useState(null);
  const [accessible, setAccessible] = useState(false);
  const [graphNodes, setGraphNodes] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Auth Form State
  const [phone, setPhone] = useState('9876543210');
  const [patientName, setPatientName] = useState('Asha Kumar');
  const [aptId, setAptId] = useState('APT-1001');
  const [otpStep, setOtpStep] = useState(1);
  const [otpCode, setOtpCode] = useState('123456');
  const [authErr, setAuthErr] = useState('');

  // Directions Screen State
  const [doctorsList, setDoctorsList] = useState([]);
  const [dirSearch, setDirSearch] = useState('');
  const [activeDeptFilter, setActiveDeptFilter] = useState('ALL');

  // 3D Nurse instance ref
  const nurseRef = useRef(null);

  useEffect(() => {
    api.getNodes().then(data => {
      setGraphNodes(data.nodes);
      window.hospitalMap = new HospitalMap("map-viewport-container");
      window.hospitalMap.init(data.nodes, data.edges);
    }).catch(console.error);

    // Global map node click listener
    window.handleMapNodeSelect = (targetNodeId) => {
      const srcNode = visit ? visit.current_location_node : 'entrance';
      api.getRoute(srcNode, targetNodeId, accessible).then(r => {
        if (window.hospitalMap) window.hospitalMap.renderRoute(r);
        renderStepsList('patient-step-list', r.steps);
      });
    };

    const token = sessionStorage.getItem("visit_token");
    if (token) {
      fetchVisitState();
    }
  }, []);

  const changeLanguage = (newLang) => {
    setLanguage(newLang);
    setLang(newLang);
  };

  const fetchVisitState = async () => {
    try {
      const data = await api.getMyInfo();
      setVisit(data.visit);
      setTasks(data.tasks);
      setStatusInfo(data.status_info);

      if (data.visit.status === 'closed') {
        setScreen('discharge');
        return;
      }

      setScreen('patient');
      connectWS(sessionStorage.getItem("visit_token"));

      if (data.status_info && data.status_info.has_current_task) {
        renderRoutePath(data.visit.current_location_node, data.status_info.target_node, accessible);
      }
    } catch (e) {
      sessionStorage.removeItem("visit_token");
      setScreen('welcome');
    }
  };

  const renderRoutePath = async (src, dst, isAccessible) => {
    try {
      const routeData = await api.getRoute(src, dst, isAccessible);
      if (window.hospitalMap) {
        window.hospitalMap.renderRoute(routeData);
      }
      renderStepsList('patient-step-list', routeData.steps);
    } catch (e) {
      console.error(e);
    }
  };

  const renderStepsList = (containerId, steps) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = steps.map((s, idx) => `
      <li class="step-item">
        <span class="step-number">${idx + 1}</span>
        <span>${s}</span>
      </li>
    `).join("");
  };

  const connectWS = (token) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.type === "visit_update") {
        fetchVisitState();
      } else if (data.type === "visit_closed") {
        setScreen('discharge');
      }
    };
    ws.onclose = () => setWsConnected(false);
  };

  const handleVisitTypeSelect = (type) => {
    setVisitType(type);
    if (type === 'emergency') {
      setScreen('emergency');
      api.getRoute('entrance', 'emergency', false).then(r => {
        if (window.hospitalMap) window.hospitalMap.renderRoute(r);
        renderStepsList('emergency-step-list', r.steps);
      });
    } else if (type === 'directions') {
      setScreen('directions');
      api.getDoctors().then(setDoctorsList);
    } else {
      setOtpStep(1);
      setScreen('auth');
    }
  };

  const handleRequestOTP = async () => {
    setAuthErr('');
    try {
      await api.requestOTP(phone);
      setOtpStep(2);
    } catch (e) {
      setAuthErr(e.message);
    }
  };

  const handleVerifyOTP = async () => {
    setAuthErr('');
    try {
      await api.verifyOTP(phone, otpCode, patientName, visitType, aptId);
      fetchVisitState();
    } catch (e) {
      setAuthErr(e.message);
    }
  };

  const handleLocationChange = async (newNodeId) => {
    if (!newNodeId || !visit) return;
    await api.updateLocation(newNodeId);
    fetchVisitState();
  };

  const handleToggleAccessible = (e) => {
    const val = e.target.checked;
    setAccessible(val);
    if (statusInfo && statusInfo.has_current_task) {
      renderRoutePath(visit.current_location_node, statusInfo.target_node, val);
    }
  };

  return (
    <div>
      {/* Header Topbar */}
      <header class="header-topbar">
        <a href="#" class="brand-logo" onClick={() => setScreen('welcome')}>
          <svg class="brand-cross-icon" viewBox="0 0 24 24">
            <path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z" fill="currentColor"/>
          </svg>
          <span class="font-tech">{t('hospital_name')}</span>
        </a>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {wsConnected && (
            <span class="cyber-badge badge-done" style={{ fontSize: '11px', padding: '4px 10px' }}>
              <span class="status-dot"></span> LIVE LINK
            </span>
          )}
          <select class="cyber-select" value={lang} onChange={(e) => changeLanguage(e.target.value)} style={{ minHeight: '38px', fontSize: '14px' }}>
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
          </select>
          <a href="/staff/desk.html" class="cyber-btn cyber-btn-secondary cyber-btn-sm">Staff Portal &rarr;</a>
        </div>
      </header>

      <main class="container" style={{ paddingTop: '24px' }}>
        
        {/* SCREEN: Welcome */}
        {screen === 'welcome' && (
          <div class="cyber-card">
            <h1>{t('welcome')}</h1>
            <p class="text-muted">{t('select_visit_type')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              <button class="cyber-btn cyber-btn-primary" onClick={() => handleVisitTypeSelect('appointment')}>{t('appointment')}</button>
              <button class="cyber-btn cyber-btn-secondary" onClick={() => handleVisitTypeSelect('walkin')}>{t('walkin')}</button>
              <button class="cyber-btn cyber-btn-secondary" onClick={() => handleVisitTypeSelect('directions')}>{t('directions')}</button>
              <button class="cyber-btn cyber-btn-danger" onClick={() => handleVisitTypeSelect('emergency')}>{t('emergency')}</button>
            </div>
          </div>
        )}

        {/* SCREEN: Auth */}
        {screen === 'auth' && (
          <div class="cyber-card">
            <h2>Patient Verification</h2>
            {otpStep === 1 ? (
              <div class="form-group">
                <label class="form-label">{t('enter_phone')}</label>
                <input type="tel" class="cyber-input" value={phone} onChange={e => setPhone(e.target.value)} />

                <label class="form-label">{t('enter_name')}</label>
                <input type="text" class="cyber-input" value={patientName} onChange={e => setPatientName(e.target.value)} />

                {visitType === 'appointment' && (
                  <div>
                    <label class="form-label">{t('apt_id_prompt')}</label>
                    <input type="text" class="cyber-input" value={aptId} onChange={e => setAptId(e.target.value)} />
                  </div>
                )}
                <button class="cyber-btn cyber-btn-primary" style={{ marginTop: '12px' }} onClick={handleRequestOTP}>Request OTP</button>
              </div>
            ) : (
              <div class="form-group">
                <p class="text-muted">{t('demo_otp_note')}</p>
                <label class="form-label">{t('enter_otp')}</label>
                <input type="text" class="cyber-input" value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                <button class="cyber-btn cyber-btn-primary" style={{ marginTop: '12px' }} onClick={handleVerifyOTP}>{t('verify')}</button>
              </div>
            )}
            {authErr && <div class="text-danger" style={{ marginTop: '8px' }}>{authErr}</div>}
          </div>
        )}

        {/* SCREEN: Emergency */}
        {screen === 'emergency' && (
          <div class="cyber-card full-width">
            <div class="cyber-badge badge-danger">
              <span class="status-dot"></span>
              {t('emergency_title')}
            </div>
            <p>{t('emergency_desc')}</p>
            <button class="cyber-btn cyber-btn-danger" onClick={() => window.location.href="tel:+18005550199"}>
              {t('call_staff')} (+1-800-555-0199)
            </button>
            <div class="map-viewport" id="map-viewport-container" style={{ marginTop: '12px' }}></div>
            <ul class="step-list" id="emergency-step-list" style={{ marginTop: '12px' }}></ul>
          </div>
        )}

        {/* SCREEN: Directions */}
        {screen === 'directions' && (
          <div class="cyber-card">
            <h2>{t('find_doctor')}</h2>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
              {['ALL', 'Cardiology', 'General Medicine', 'Orthopaedics', 'Paediatrics'].map(dept => (
                <button key={dept} class={`quick-reply-btn ${activeDeptFilter === dept ? 'active' : ''}`} onClick={() => setActiveDeptFilter(dept)}>{dept}</button>
              ))}
            </div>
            <input type="text" class="cyber-input" placeholder="Search doctor or room..." value={dirSearch} onChange={e => setDirSearch(e.target.value)} style={{ marginTop: '8px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {doctorsList.filter(d => (activeDeptFilter === 'ALL' || d.department === activeDeptFilter) && (d.name.toLowerCase().includes(dirSearch.toLowerCase()) || d.department.toLowerCase().includes(dirSearch.toLowerCase()))).map(d => (
                <div key={d.id} class="cyber-card" style={{ padding: '12px', cursor: 'pointer' }} onClick={() => {
                  api.getRoute('entrance', d.room_node, false).then(r => {
                    if (window.hospitalMap) window.hospitalMap.renderRoute(r);
                    renderStepsList('directions-step-list', r.steps);
                  });
                }}>
                  <div class="flex-between">
                    <div>
                      <strong>{d.name}</strong> ({d.department})
                      <div class="text-muted">{d.room_label} • Floor {d.floor}</div>
                    </div>
                    <span class={`cyber-badge badge-${d.status}`}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
            <ul class="step-list" id="directions-step-list" style={{ marginTop: '12px' }}></ul>
          </div>
        )}

        {/* SCREEN: Patient Dashboard */}
        {screen === 'patient' && visit && (
          <div>
            {/* 3D AI Doll Viewport */}
            <AIDollPanel nurseRef={nurseRef} lang={lang} isMuted={isMuted} setIsMuted={setIsMuted} />

            <div class="patient-grid" style={{ marginTop: '24px' }}>
              
              {/* NOW Card */}
              <div class="cyber-card">
                <div class="card-header">
                  <h2>{t('now')}</h2>
                  <button class="cyber-btn cyber-btn-secondary cyber-btn-sm" onClick={() => window.location.href='tel:+18005550199'}>{t('talk_to_staff')}</button>
                </div>
                {statusInfo && statusInfo.has_current_task ? (
                  <div>
                    <div class="flex-between">
                      <span class={`cyber-badge badge-${statusInfo.status}`}>
                        <span class="status-dot"></span>
                        {statusInfo.status === 'called' ? t('please_go_in') : statusInfo.status}
                      </span>
                      {statusInfo.status !== 'called' && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--neon-cyan)' }}>{statusInfo.wait_minutes}m</div>
                          <div class="text-muted">{t('estimated_wait')}</div>
                        </div>
                      )}
                    </div>
                    <h3 style={{ marginTop: '12px' }}>{statusInfo.kind.toUpperCase()}: {statusInfo.target_label}</h3>
                    {statusInfo.doctor && <p style={{ marginTop: '4px' }}><strong>{t('doctor')}:</strong> {statusInfo.doctor.name}</p>}
                    <p class="text-muted" style={{ marginTop: '2px' }}><strong>{t('floor')}:</strong> {statusInfo.floor === 1 ? t('first_floor') : t('ground_floor')}</p>
                  </div>
                ) : (
                  <div>
                    <span class="cyber-badge badge-done">All Tasks Completed</span>
                    <p style={{ marginTop: '8px' }}>Please proceed to Helpdesk for discharge.</p>
                  </div>
                )}
              </div>

              {/* DIRECTIONS Card */}
              <div class="cyber-card">
                <div class="card-header">
                  <h2>{t('directions_title')}</h2>
                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={accessible} onChange={handleToggleAccessible} />
                    {t('accessible_route')}
                  </label>
                </div>

                <select class="cyber-select" style={{ fontSize: '14px', minHeight: '38px' }} onChange={e => handleLocationChange(e.target.value)}>
                  <option value="">{t('somewhere_else')}...</option>
                  {Object.values(graphNodes).filter(n => ["entrance", "lobby", "helpdesk", "f1_waiting", "g_junction"].includes(n.id)).map(n => (
                    <option key={n.id} value={n.id}>{n.label} (Floor {n.floor})</option>
                  ))}
                </select>

                <div class="map-viewport" id="map-viewport-container"></div>
                <div class="text-muted" style={{ fontSize: '12px', textAlign: 'center', marginTop: '4px' }}>💡 Tap any room on the map above for instant routing</div>
                <ul class="step-list" id="patient-step-list" style={{ marginTop: '8px' }}></ul>
              </div>

              {/* TIMELINE Card */}
              <div class="cyber-card">
                <h2>{t('your_visit')}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {tasks.map(t => {
                    const isDone = t.status === 'done';
                    const isActive = t.status === 'waiting' || t.status === 'called';
                    return (
                      <div key={t.id} class={`timeline-item-react ${isDone ? 'completed' : ''} ${isActive ? 'active' : ''}`}>
                        <div class="timeline-node">{isDone ? '✓' : t.seq}</div>
                        <div class="timeline-card-body">
                          <strong>{t.kind.toUpperCase()}</strong> - {t.target_label}
                          {t.doctor_name && <div class="text-muted" style={{ fontSize: '13px' }}>With {t.doctor_name}</div>}
                          <div style={{ marginTop: '4px' }}>
                            <span class={`cyber-badge badge-${t.status}`}>{t.status}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI DOLL CHAT Card */}
              <AIChatCard nurseRef={nurseRef} lang={lang} />

            </div>
          </div>
        )}

        {/* SCREEN: Discharge */}
        {screen === 'discharge' && (
          <div class="cyber-card">
            <h1>{t('discharge_title')}</h1>
            <p>{t('discharge_desc')}</p>
            <div style={{ display: 'flex', gap: '10px', margin: '16px 0' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} class="star-btn active" onClick={() => alert("Thank you!")}>{star} ⭐</button>
              ))}
            </div>
            <button class="cyber-btn cyber-btn-primary" onClick={() => { sessionStorage.removeItem("visit_token"); setScreen('welcome'); }}>Complete & Return Home</button>
          </div>
        )}

      </main>
    </div>
  );
}

function AIDollPanel({ nurseRef, lang, isMuted, setIsMuted }) {
  useEffect(() => {
    const canvas = document.getElementById("react-nurse-canvas");
    if (canvas) {
      import('./nurse3d.js').then(({ Nurse3D }) => {
        const n = new Nurse3D(canvas);
        if (n.init()) {
          nurseRef.current = n;
        }
      });
    }
  }, []);

  return (
    <div class="ai-doll-viewport full-width">
      <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '8px', zIndex: 10 }}>
        <button class="icon-btn" title="AI Diagnostic Scan" onClick={() => {
          if (nurseRef.current) {
            nurseRef.current.triggerGesture('scan');
            nurseRef.current.speak("Diagnostic Scan engaged. All vital sensors nominal.", lang === 'hi' ? 'hi-IN' : 'en-US');
          }
        }}>🔍</button>
        <button class="icon-btn" title="Toggle Voice Mute" onClick={() => {
          if (nurseRef.current) {
            const m = nurseRef.current.toggleMute();
            setIsMuted(m);
          }
        }}>{isMuted ? '🔇' : '🔊'}</button>
      </div>
      <canvas id="react-nurse-canvas" style={{ width: '100%', height: '100%', display: 'block' }}></canvas>
      <div id="assistant-caption" class="ai-subtitle-banner" style={{ display: 'none' }}></div>
    </div>
  );
}

function AIChatCard({ nurseRef, lang }) {
  const [messages, setMessages] = useState([
    { text: "Hello! I am your futuristic AI Doll guide. How can I assist your visit today?", sender: 'bot' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (evt) => {
      const transcript = evt.results[0][0].transcript;
      setChatInput(transcript);
      setIsListening(false);
      sendChat(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const sendChat = async (msgText) => {
    const text = msgText || chatInput;
    if (!text.trim()) return;

    setChatInput('');
    setMessages(prev => [...prev, { text, sender: 'user' }]);

    try {
      const res = await api.sendChatMessage(text);
      setMessages(prev => [...prev, { text: res.reply, sender: 'bot' }]);

      if (nurseRef.current) {
        if (res.gesture) nurseRef.current.triggerGesture(res.gesture);
        nurseRef.current.speak(res.reply, lang === 'hi' ? 'hi-IN' : 'en-US');
      }

      if (res.card && res.card.type === 'route' && window.hospitalMap) {
        window.hospitalMap.renderRoute(res.card.data);
      }
    } catch (e) {
      setMessages(prev => [...prev, { text: "System error processing message.", sender: 'bot' }]);
    }
  };

  return (
    <div class="cyber-card chat-window">
      <h2>AI Doll Assistant</h2>
      <div class="chat-scroll">
        {messages.map((m, idx) => (
          <div key={idx} class={`chat-bubble chat-bubble-${m.sender}`}>{m.text}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginTop: '6px' }}>
        <button class="quick-reply-btn" onClick={() => sendChat("Where do I go next?")}>Where do I go next?</button>
        <button class="quick-reply-btn" onClick={() => sendChat("What's pending?")}>What's pending?</button>
        <button class="quick-reply-btn" onClick={() => sendChat("How long is the wait?")}>How long is the wait?</button>
        <button class="quick-reply-btn" onClick={() => sendChat("Find a doctor")}>Find a doctor</button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button class={`icon-btn ${isListening ? 'active' : ''}`} title="Speak to AI Doll" onClick={startVoiceInput} style={{ background: isListening ? 'var(--neon-cyan)' : 'var(--bg-surface)' }}>
          🎙️
        </button>
        <input type="text" class="cyber-input" style={{ flex: 1 }} placeholder="Ask AI Doll or click 🎙️..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendChat()} />
        <button class="cyber-btn cyber-btn-primary" onClick={() => sendChat()}>Send</button>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
