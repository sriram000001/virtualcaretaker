const GEMINI_MODEL = "gemini-2.5-flash";

export function getStoredGeminiKey() {
  return localStorage.getItem("gemini_api_key") || "";
}

export function setStoredGeminiKey(key) {
  if (key) {
    localStorage.setItem("gemini_api_key", key.trim());
  } else {
    localStorage.removeItem("gemini_api_key");
  }
}

export async function generateGeminiNurseResponse(userMessage, contextData = {}) {
  const apiKey = getStoredGeminiKey();
  if (!apiKey) {
    return null; // Signals fallback to deterministic engine
  }

  const systemPrompt = `You are a warm, helpful, professional 3D Nurse AI Doll at City General Hospital. 
Your role is to guide patients smoothly through arrival, registration, consultations, room directions, and discharge.
CRITICAL SAFETY & FACT RULES:
1. Do NEVER invent medical diagnoses, treatment plans, or ungrounded hospital facts.
2. Ground all answers strictly in hospital context provided (Doctor list, Room numbers, Route steps, Wait times).
3. If an emergency is detected (chest pain, severe bleeding, difficulty breathing, seizure, stroke), instruct the patient immediately to proceed to the Emergency Room on the Ground Floor and call hospital staff.
4. Keep responses short, clear, friendly, and natural for text-to-speech reading (1 to 3 concise sentences).

Current Hospital Context:
- Active Patient Name: ${contextData.patientName || "Patient"}
- Current Visit Step: ${contextData.currentStep || "Registration"}
- Current Destination Node: ${contextData.targetNode || "Registration Desk"}
- Target Room / Doctor: ${contextData.doctorName || "Front Desk Staff"} (${contextData.roomLabel || "Registration Desk"}, Floor ${contextData.floor ?? 0})
- Estimated Wait: ${contextData.waitMins ?? 10} minutes (${contextData.patientsAhead ?? 0} patients ahead)
- Language: ${contextData.lang || "English"}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nPatient Query: ${userMessage}` }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 250
        }
      })
    });

    if (!response.ok) {
      console.warn("Gemini API error, falling back to local engine.");
      return null;
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (replyText) {
      // Basic gesture detection from response content
      let gesture = "nod";
      const replyLower = replyText.lower();
      if (replyLower.includes("hello") || replyLower.includes("welcome")) gesture = "wave";
      if (replyLower.includes("room") || replyLower.includes("proceed") || replyLower.includes("go to")) gesture = "point";

      return {
        reply: replyText.trim(),
        gesture: gesture,
        card: null
      };
    }
  } catch (err) {
    console.warn("Gemini API client fetch exception:", err);
  }

  return null;
}
