export class HospitalMap {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.nodes = {};
    this.edges = [];
    this.currentRoute = null;
    this.activeFloor = 0;
    this.onFloorChange = options.onFloorChange || null;
  }

  init(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
  }

  renderRoute(routeData) {
    this.currentRoute = routeData;

    // Determine default active floor (start node floor)
    if (routeData && routeData.path && routeData.path.length > 0) {
      this.activeFloor = routeData.path[0].floor;
    }

    this.draw();
  }

  setFloor(floorNum) {
    this.activeFloor = floorNum;
    if (this.onFloorChange) this.onFloorChange(floorNum);
    this.draw();
  }

  draw() {
    if (!this.container) return;

    const floorNodes = Object.values(this.nodes).filter(n => n.floor === this.activeFloor);
    const floorNodeIds = new Set(floorNodes.map(n => n.id));

    // Floor tabs if route spans both floors or by default
    let html = `
      <div class="floor-tabs">
        <button class="floor-tab ${this.activeFloor === 0 ? 'active' : ''}" onclick="window.hospitalMap.setFloor(0)">
          Ground Floor
        </button>
        <button class="floor-tab ${this.activeFloor === 1 ? 'active' : ''}" onclick="window.hospitalMap.setFloor(1)">
          1st Floor
        </button>
      </div>
      <svg class="map-svg" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
        <rect width="1000" height="600" fill="#F4F7F9"/>
    `;

    // Static Floor Layout Backgrounds & Room Outlines
    if (this.activeFloor === 0) {
      html += `
        <!-- Corridors & Walls -->
        <rect x="50" y="50" width="900" height="500" fill="none" stroke="#9FB3BD" stroke-width="4" rx="8"/>
        <path d="M 500 560 L 500 130 M 230 430 L 880 430 M 230 280 L 780 280" stroke="#E4F1F6" stroke-width="40" stroke-linecap="round"/>
        
        <!-- Room Rectangles -->
        <rect x="20" y="510" width="120" height="70" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="80" y="550" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Emergency</text>

        <rect x="420" y="510" width="160" height="70" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="500" y="550" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Entrance</text>

        <rect x="160" y="390" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="230" y="435" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Registration</text>

        <rect x="580" y="390" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="650" y="435" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Helpdesk</text>

        <rect x="810" y="390" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="880" y="435" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Diagnostics</text>

        <rect x="160" y="240" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="230" y="285" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Billing</text>

        <rect x="710" y="240" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="780" y="285" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Pharmacy</text>

        <rect x="460" y="90" width="80" height="70" fill="#EEF3F6" stroke="#0B6E8E" stroke-width="2" rx="4"/>
        <text x="500" y="130" font-size="12" font-weight="600" fill="#0B6E8E" text-anchor="middle">Lift A</text>

        <rect x="580" y="90" width="80" height="70" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="620" y="130" font-size="12" font-weight="500" fill="#56707B" text-anchor="middle">Stairs</text>
      `;
    } else {
      html += `
        <!-- 1st Floor Layout -->
        <rect x="50" y="50" width="900" height="500" fill="none" stroke="#9FB3BD" stroke-width="4" rx="8"/>
        <path d="M 500 130 L 500 450 M 320 300 L 680 300 M 230 200 L 320 300 L 230 400 M 770 200 L 680 300 L 770 400" stroke="#E4F1F6" stroke-width="40" stroke-linecap="round"/>

        <rect x="460" y="90" width="80" height="70" fill="#EEF3F6" stroke="#0B6E8E" stroke-width="2" rx="4"/>
        <text x="500" y="130" font-size="12" font-weight="600" fill="#0B6E8E" text-anchor="middle">Lift A</text>

        <rect x="580" y="90" width="80" height="70" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="620" y="130" font-size="12" font-weight="500" fill="#56707B" text-anchor="middle">Stairs</text>

        <rect x="160" y="160" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="230" y="205" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Room 101</text>

        <rect x="160" y="360" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="230" y="405" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Room 102</text>

        <rect x="700" y="160" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="770" y="205" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Room 103</text>

        <rect x="700" y="360" width="140" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="770" y="405" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Room 104</text>

        <rect x="420" y="410" width="160" height="80" fill="#EEF3F6" stroke="#9FB3BD" stroke-width="2" rx="4"/>
        <text x="500" y="455" font-size="13" font-weight="500" fill="#12262E" text-anchor="middle">Waiting Area</text>
      `;
    }

    // Draw active route segments on this floor
    if (this.currentRoute && this.currentRoute.path) {
      const pathNodes = this.currentRoute.path;
      let segments = [];
      let currentSeg = [];

      for (let i = 0; i < pathNodes.length; i++) {
        const node = pathNodes[i];
        if (node.floor === this.activeFloor) {
          currentSeg.push(node);
        } else {
          if (currentSeg.length > 0) {
            segments.push(currentSeg);
            currentSeg = [];
          }
        }
      }
      if (currentSeg.length > 0) segments.push(currentSeg);

      // Render route lines
      for (const seg of segments) {
        if (seg.length > 1) {
          const points = seg.map(n => `${n.x},${n.y}`).join(" ");
          html += `
            <polyline points="${points}" fill="none" stroke="#0B6E8E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          `;
        }
      }

      // Draw start dot & end pin if present on this floor
      const startNode = pathNodes[0];
      const endNode = pathNodes[pathNodes.length - 1];

      if (startNode.floor === this.activeFloor) {
        html += `
          <circle cx="${startNode.x}" cy="${startNode.y}" r="8" fill="#1E7F54" stroke="#FFFFFF" stroke-width="2"/>
          <text x="${startNode.x}" y="${startNode.y - 12}" font-size="11" font-weight="600" fill="#1E7F54" text-anchor="middle">Start</text>
        `;
      }

      if (endNode.floor === this.activeFloor) {
        html += `
          <circle cx="${endNode.x}" cy="${endNode.y}" r="10" fill="#0B6E8E" stroke="#FFFFFF" stroke-width="2"/>
          <circle cx="${endNode.x}" cy="${endNode.y}" r="4" fill="#FFFFFF"/>
          <text x="${endNode.x}" y="${endNode.y - 14}" font-size="12" font-weight="600" fill="#0B6E8E" text-anchor="middle">Destination</text>
        `;
      }
    }

    html += `</svg>`;
    this.container.innerHTML = html;
  }
}
