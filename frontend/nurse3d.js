import * as THREE from 'three';

export class Nurse3D {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.renderer = null;
    this.scene = null;
    this.camera = null;

    // Animation state
    this.animFrameId = null;
    this.clock = new THREE.Clock();
    this.isMuted = false;
    this.isSpeaking = false;
    this.gestureState = 'idle';
    this.gestureTimer = 0;

    // Mesh references
    this.headGroup = null;
    this.rightArmPivot = null;
    this.leftArmPivot = null;
    this.bodyMesh = null;
    this.mouthMesh = null;
    this.leftEye = null;
    this.rightEye = null;

    this.blinkTimer = 0;
    this.isBlinking = false;
  }

  init() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true
      });
    } catch (e) {
      console.warn("WebGL not supported, falling back to 2D nurse avatar.");
      return false;
    }

    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    
    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.2, 3.2);
    this.camera.lookAt(0, 1.1, 0);

    // Warm soft clinical lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    this.buildFemaleNurseMesh();

    window.addEventListener('resize', () => this.onWindowResize());
    this.setupIntersectionObserver();

    this.start();
    return true;
  }

  buildFemaleNurseMesh() {
    const nurseGroup = new THREE.Group();

    // Matte Materials
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xFFDBAC });
    const scrubsMat = new THREE.MeshLambertMaterial({ color: 0x0B6E8E });
    const capMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const crossMat = new THREE.MeshLambertMaterial({ color: 0xB42318 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x4A3525 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x12262E });

    // 1. Female Torso / Scrubs
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.44, 1.0, 16);
    this.bodyMesh = new THREE.Mesh(bodyGeo, scrubsMat);
    this.bodyMesh.position.set(0, 0.5, 0);
    nurseGroup.add(this.bodyMesh);

    // White V-neck Collar
    const collarGeo = new THREE.ConeGeometry(0.18, 0.28, 3);
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xE4F1F6 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.rotation.x = Math.PI;
    collar.position.set(0, 0.9, 0.3);
    nurseGroup.add(collar);

    // 2. Head Group
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.2, 0);

    const headGeo = new THREE.SphereGeometry(0.27, 16, 16);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    this.headGroup.add(headMesh);

    // Female Hairpiece with Bun/Ponytail
    const hairGeo = new THREE.SphereGeometry(0.28, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hairMesh = new THREE.Mesh(hairGeo, hairMat);
    hairMesh.rotation.x = -0.2;
    this.headGroup.add(hairMesh);

    const bunGeo = new THREE.SphereGeometry(0.1, 12, 12);
    const bunMesh = new THREE.Mesh(bunGeo, hairMat);
    bunMesh.position.set(0, 0.1, -0.24);
    this.headGroup.add(bunMesh);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 8);
    this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    this.leftEye.position.set(-0.1, 0.04, 0.25);

    this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    this.rightEye.position.set(0.1, 0.04, 0.25);

    this.headGroup.add(this.leftEye);
    this.headGroup.add(this.rightEye);

    // Mouth Sync Mesh
    const mouthGeo = new THREE.BoxGeometry(0.08, 0.02, 0.02);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0xB42318 });
    this.mouthMesh = new THREE.Mesh(mouthGeo, mouthMat);
    this.mouthMesh.position.set(0, -0.1, 0.25);
    this.headGroup.add(this.mouthMesh);

    // Nurse Cap with Red Cross Emblem
    const capGeo = new THREE.CylinderGeometry(0.17, 0.19, 0.11, 12);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.set(0, 0.27, 0);

    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.01), crossMat);
    crossV.position.set(0, 0, 0.18);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.01), crossMat);
    crossH.position.set(0, 0, 0.18);

    capMesh.add(crossV);
    capMesh.add(crossH);
    this.headGroup.add(capMesh);

    nurseGroup.add(this.headGroup);

    // 3. Right Arm Shoulder Pivot
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.4, 0.9, 0);
    const armGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8);
    armGeo.translate(0, -0.3, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, scrubsMat);
    this.rightArmPivot.add(rightArmMesh);
    nurseGroup.add(this.rightArmPivot);

    // 4. Left Arm Shoulder Pivot
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.4, 0.9, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, scrubsMat);
    this.leftArmPivot.add(leftArmMesh);
    nurseGroup.add(this.leftArmPivot);

    this.scene.add(nurseGroup);
  }

  triggerGesture(gestureName) {
    this.gestureState = gestureName;
    this.gestureTimer = 0;
  }

  speak(text, lang = "en-US", onEnd) {
    this.updateCaptionUI(text);

    if (this.isMuted || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.pitch = 1.05; // Slightly higher natural pitch for Nova voice persona
    utterance.rate = 0.95;   // Clear speaking rate

    // Prioritize "Nova" voice persona first, falling back to natural female neural voices
    const voices = window.speechSynthesis.getVoices();
    const novaVoice = voices.find(v => v.name.toLowerCase().includes("nova")) ||
                      voices.find(v => v.lang.startsWith(lang.slice(0, 2)) && (v.name.includes("Female") || v.name.includes("Zira") || v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural") || v.name.includes("Samantha") || v.name.includes("Kalpana")));
    
    if (novaVoice) {
      utterance.voice = novaVoice;
    }

    utterance.onstart = () => { this.isSpeaking = true; };
    utterance.onend = () => {
      this.isSpeaking = false;
      this.updateCaptionUI("");
      if (onEnd) onEnd();
    };
    utterance.onerror = () => {
      this.isSpeaking = false;
      this.updateCaptionUI("");
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }

  updateCaptionUI(text) {
    const captionEl = document.getElementById("assistant-caption");
    if (captionEl) {
      captionEl.textContent = text ? `👩‍⚕️ Nurse Nova: "${text}"` : "";
      captionEl.style.display = text ? "block" : "none";
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.updateCaptionUI("");
    }
    return this.isMuted;
  }

  animate() {
    if (!this.renderer) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // 1. Idle breathing
    if (this.bodyMesh) {
      this.bodyMesh.scale.y = 1.0 + Math.sin(elapsed * 2.0) * 0.015;
    }

    // 2. Random Blinking
    this.blinkTimer += delta;
    if (this.blinkTimer > 3.5) {
      this.isBlinking = true;
      if (this.blinkTimer > 3.65) {
        this.isBlinking = false;
        this.blinkTimer = 0;
      }
    }
    if (this.leftEye && this.rightEye) {
      this.leftEye.scale.y = this.isBlinking ? 0.1 : 1.0;
      this.rightEye.scale.y = this.isBlinking ? 0.1 : 1.0;
    }

    // 3. Lip sync while speaking
    if (this.mouthMesh) {
      if (this.isSpeaking) {
        this.mouthMesh.scale.y = 1.0 + Math.abs(Math.sin(elapsed * 14.0)) * 2.8;
      } else {
        this.mouthMesh.scale.y = 1.0;
      }
    }

    // 4. Gestures
    this.gestureTimer += delta;

    if (this.gestureState === 'wave') {
      this.rightArmPivot.rotation.z = Math.PI - 0.4 + Math.sin(elapsed * 8.0) * 0.3;
      if (this.gestureTimer > 2.5) this.gestureState = 'idle';
    } else if (this.gestureState === 'point') {
      this.leftArmPivot.rotation.x = -Math.PI / 2.5;
      this.leftArmPivot.rotation.z = Math.PI / 4;
      if (this.gestureTimer > 2.5) this.gestureState = 'idle';
    } else if (this.gestureState === 'nod') {
      this.headGroup.rotation.x = Math.sin(elapsed * 6.0) * 0.15;
      if (this.gestureTimer > 2.0) {
        this.headGroup.rotation.x = 0;
        this.gestureState = 'idle';
      }
    } else {
      this.rightArmPivot.rotation.z = Math.max(0, this.rightArmPivot.rotation.z - delta * 2.0);
      this.leftArmPivot.rotation.x = Math.min(0, this.leftArmPivot.rotation.x + delta * 2.0);
      this.leftArmPivot.rotation.z = Math.min(0, this.leftArmPivot.rotation.z + delta * 2.0);
    }

    this.renderer.render(this.scene, this.camera);
    this.animFrameId = requestAnimationFrame(() => this.animate());
  }

  start() {
    if (!this.animFrameId) {
      this.animate();
    }
  }

  stop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !document.hidden) {
          this.start();
        } else {
          this.stop();
        }
      });
    });
    observer.observe(this.canvas);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  onWindowResize() {
    if (!this.renderer || !this.camera) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
