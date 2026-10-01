export const translations = {
  en: {
    hospital_name: "City General Hospital",
    welcome: "Welcome to City General Hospital",
    select_visit_type: "Select your visit type to begin:",
    appointment: "I have an appointment",
    walkin: "Walk-in visit",
    directions: "Just need directions",
    emergency: "Emergency",
    emergency_title: "Emergency Care",
    emergency_desc: "Please proceed directly to the Emergency Room on the Ground Floor.",
    call_staff: "Call hospital staff",
    enter_phone: "Enter phone number",
    enter_name: "Enter your full name",
    enter_otp: "Enter OTP code",
    verify: "Verify & Start Visit",
    demo_otp_note: "Demo OTP is 123456",
    apt_id_prompt: "Appointment ID (optional, e.g. APT-1001)",
    current_step: "Current Step",
    now: "Now",
    directions_title: "Directions",
    your_visit: "Your Visit",
    chat_title: "Assistant Chat",
    accessible_route: "Step-free accessible route",
    somewhere_else: "I'm somewhere else",
    estimated_wait: "Estimated wait",
    please_go_in: "Please go in now",
    talk_to_staff: "Talk to staff",
    doctor: "Doctor",
    room: "Room",
    floor: "Floor",
    ground_floor: "Ground Floor",
    first_floor: "1st Floor",
    discharge_title: "Visit Completed",
    discharge_desc: "Thank you for visiting City General Hospital. Please leave your feedback:",
    submit_feedback: "Submit Feedback",
    find_doctor: "Find a Doctor",
    where_next: "Where do I go next?",
    whats_pending: "What's pending?",
    how_long_wait: "How long is the wait?",
    type_message: "Ask a question...",
    send: "Send",
    speech_lang: "en-US"
  },
  hi: {
    hospital_name: "सिटी जनरल अस्पताल",
    welcome: "सिटी जनरल अस्पताल में आपका स्वागत है",
    select_visit_type: "शुरू करने के लिए अपनी यात्रा का प्रकार चुनें:",
    appointment: "मेरा अपॉइंटमेंट है",
    walkin: "बिना अपॉइंटमेंट (वॉक-इन)",
    directions: "केवल दिशा-निर्देश चाहिए",
    emergency: "आपातकालीन (इमरजेंसी)",
    emergency_title: "आपातकालीन सहायता",
    emergency_desc: "कृपया तुरंत भूतल (ग्राउंड फ्लोर) पर आपातकालीन कक्ष में जाएं।",
    call_staff: "अस्पताल कर्मचारियों को कॉल करें",
    enter_phone: "फोन नंबर दर्ज करें",
    enter_name: "अपना पूरा नाम दर्ज करें",
    enter_otp: "ओटीपी कोड दर्ज करें",
    verify: "सत्यापित करें और शुरू करें",
    demo_otp_note: "डेमो ओटीपी 123456 है",
    apt_id_prompt: "अपॉइंटमेंट आईडी (वैकल्पिक, जैसे APT-1001)",
    current_step: "वर्तमान चरण",
    now: "अभी",
    directions_title: "दिशा-निर्देश",
    your_visit: "आपकी यात्रा",
    chat_title: "सहायक चैट",
    accessible_route: "सीढ़ी-मुक्त सुगम मार्ग",
    somewhere_else: "मैं कहीं और हूँ",
    estimated_wait: "अनुमानित प्रतीक्षा समय",
    please_go_in: "कृपया अभी अंदर जाएं",
    talk_to_staff: "कर्मचारियों से बात करें",
    doctor: "डॉक्टर",
    room: "कमरा",
    floor: "मंज़िल",
    ground_floor: "भूतल (ग्राउंड फ्लोर)",
    first_floor: "पहली मंज़िल",
    discharge_title: "यात्रा समाप्त हुई",
    discharge_desc: "सिटी जनरल अस्पताल आने के लिए धन्यवाद। कृपया अपनी प्रतिक्रिया दें:",
    submit_feedback: "प्रतिक्रिया भेजें",
    find_doctor: "डॉक्टर खोजें",
    where_next: "मुझे आगे कहाँ जाना है?",
    whats_pending: "क्या लंबित है?",
    how_long_wait: "इंतजार कितना लंबा है?",
    type_message: "सवाल पूछें...",
    send: "भेजें",
    speech_lang: "hi-IN"
  }
};

let currentLang = "en";

export function setLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
  }
}

export function getLanguage() {
  return currentLang;
}

export function t(key) {
  return translations[currentLang]?.[key] || translations["en"]?.[key] || key;
}
