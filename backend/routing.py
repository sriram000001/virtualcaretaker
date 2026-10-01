import math
import networkx as nx
from typing import Dict, List, Tuple, Any

NODES: Dict[str, Dict[str, Any]] = {
    # Ground Floor (floor 0)
    "entrance": {"id": "entrance", "label": "Hospital Entrance", "floor": 0, "x": 500, "y": 560, "type": "entrance"},
    "lobby": {"id": "lobby", "label": "Main Lobby", "floor": 0, "x": 500, "y": 430, "type": "junction"},
    "registration": {"id": "registration", "label": "Registration Desk", "floor": 0, "x": 230, "y": 430, "type": "desk"},
    "helpdesk": {"id": "helpdesk", "label": "Helpdesk & Discharge", "floor": 0, "x": 650, "y": 430, "type": "desk"},
    "diagnostics": {"id": "diagnostics", "label": "Diagnostics & Lab", "floor": 0, "x": 880, "y": 430, "type": "room"},
    "g_junction": {"id": "g_junction", "label": "Ground Corridor Junction", "floor": 0, "x": 500, "y": 280, "type": "junction"},
    "billing": {"id": "billing", "label": "Billing Desk", "floor": 0, "x": 230, "y": 280, "type": "desk"},
    "pharmacy": {"id": "pharmacy", "label": "Pharmacy", "floor": 0, "x": 780, "y": 280, "type": "room"},
    "lift_g": {"id": "lift_g", "label": "Lift A (Ground Floor)", "floor": 0, "x": 500, "y": 130, "type": "lift"},
    "stairs_g": {"id": "stairs_g", "label": "Stairs (Ground Floor)", "floor": 0, "x": 620, "y": 130, "type": "stairs"},
    "emergency": {"id": "emergency", "label": "Emergency Room", "floor": 0, "x": 60, "y": 560, "type": "room"},

    # 1st Floor (floor 1)
    "lift_1": {"id": "lift_1", "label": "Lift A (1st Floor)", "floor": 1, "x": 500, "y": 130, "type": "lift"},
    "stairs_1": {"id": "stairs_1", "label": "Stairs (1st Floor)", "floor": 1, "x": 620, "y": 130, "type": "stairs"},
    "f1_junction": {"id": "f1_junction", "label": "1st Floor Central Junction", "floor": 1, "x": 500, "y": 300, "type": "junction"},
    "f1_waiting": {"id": "f1_waiting", "label": "1st Floor Waiting Area", "floor": 1, "x": 500, "y": 450, "type": "waiting"},
    "f1_west": {"id": "f1_west", "label": "West Corridor", "floor": 1, "x": 320, "y": 300, "type": "junction"},
    "f1_east": {"id": "f1_east", "label": "East Corridor", "floor": 1, "x": 680, "y": 300, "type": "junction"},
    "room_101": {"id": "room_101", "label": "Room 101 (General Medicine)", "floor": 1, "x": 230, "y": 200, "type": "room"},
    "room_102": {"id": "room_102", "label": "Room 102 (Cardiology)", "floor": 1, "x": 230, "y": 400, "type": "room"},
    "room_103": {"id": "room_103", "label": "Room 103 (Orthopaedics)", "floor": 1, "x": 770, "y": 200, "type": "room"},
    "room_104": {"id": "room_104", "label": "Room 104 (Paediatrics)", "floor": 1, "x": 770, "y": 400, "type": "room"}
}

EDGES: List[Tuple[str, str, int, bool]] = [
    # Ground floor edges
    ("entrance", "lobby", 15, True),
    ("lobby", "registration", 20, True),
    ("lobby", "helpdesk", 15, True),
    ("helpdesk", "diagnostics", 20, True),
    ("lobby", "g_junction", 15, True),
    ("g_junction", "billing", 20, True),
    ("g_junction", "pharmacy", 25, True),
    ("g_junction", "lift_g", 15, True),
    ("g_junction", "stairs_g", 12, False),  # Not accessible
    ("lobby", "emergency", 35, True),

    # 1st floor edges
    ("lift_1", "f1_junction", 15, True),
    ("stairs_1", "f1_junction", 12, False),  # Not accessible
    ("f1_junction", "f1_west", 18, True),
    ("f1_junction", "f1_east", 18, True),
    ("f1_junction", "f1_waiting", 15, True),
    ("f1_west", "room_101", 15, True),
    ("f1_west", "room_102", 15, True),
    ("f1_east", "room_103", 15, True),
    ("f1_east", "room_104", 15, True),

    # Floor connection edges
    ("lift_g", "lift_1", 25, True),
    ("stairs_g", "stairs_1", 20, False)  # Not accessible
]

def build_hospital_graph(accessible_only: bool = False) -> nx.Graph:
    G = nx.Graph()
    for node_id, data in NODES.items():
        G.add_node(node_id, **data)
    for src, dst, cost, acc in EDGES:
        if accessible_only and not acc:
            continue
        G.add_edge(src, dst, weight=cost, accessible=acc)
    return G

def get_turn_direction(p1: Dict[str, Any], p2: Dict[str, Any], p3: Dict[str, Any]) -> str:
    """
    Computes heading turn direction using vector cross product in SVG coordinates (y points down).
    v1 = p2 - p1
    v2 = p3 - p2
    cross_product = v1.x * v2.y - v1.y * v2.x
    """
    v1_x = p2["x"] - p1["x"]
    v1_y = p2["y"] - p1["y"]
    v2_x = p3["x"] - p2["x"]
    v2_y = p3["y"] - p2["y"]

    cross_prod = v1_x * v2_y - v1_y * v2_x

    # Dot product and vector magnitudes to get turn angle
    dot_prod = v1_x * v2_x + v1_y * v2_y
    mag1 = math.sqrt(v1_x**2 + v1_y**2)
    mag2 = math.sqrt(v2_x**2 + v2_y**2)

    if mag1 == 0 or mag2 == 0:
        return "straight"

    cos_angle = max(-1.0, min(1.0, dot_prod / (mag1 * mag2)))
    angle_rad = math.acos(cos_angle)
    angle_deg = math.degrees(angle_rad)

    if angle_deg < 25:
        return "straight"
    elif cross_prod > 0:
        return "right"
    else:
        return "left"

def generate_step_text(path: List[str]) -> List[str]:
    if not path:
        return []
    if len(path) == 1:
        n = NODES.get(path[0], {})
        return [f"You are already at {n.get('label', path[0])}."]

    node_objs = [NODES[nid] for nid in path if nid in NODES]
    raw_instructions = []

    # First leg
    first_node = node_objs[0]
    second_node = node_objs[1]

    # Floor change at start?
    if first_node["floor"] != second_node["floor"]:
        if "lift" in first_node["type"] or "lift" in second_node["type"]:
            fl_name = "1st floor" if second_node["floor"] == 1 else "Ground floor"
            raw_instructions.append(f"Take Lift A to the {fl_name}")
        else:
            fl_name = "1st floor" if second_node["floor"] == 1 else "Ground floor"
            raw_instructions.append(f"Take stairs to the {fl_name}")
    else:
        raw_instructions.append(f"Walk to {second_node['label']}")

    # Subsequent legs
    for i in range(1, len(node_objs) - 1):
        prev_n = node_objs[i - 1]
        curr_n = node_objs[i]
        next_n = node_objs[i + 1]

        # Floor change?
        if curr_n["floor"] != next_n["floor"]:
            fl_name = "1st floor" if next_n["floor"] == 1 else "Ground floor"
            if "lift" in curr_n["type"] or "lift" in next_n["type"]:
                raw_instructions.append(f"Take Lift A to the {fl_name}")
            else:
                raw_instructions.append(f"Take stairs to the {fl_name}")
            continue

        turn = get_turn_direction(prev_n, curr_n, next_n)
        if turn == "left":
            raw_instructions.append(f"Turn left at {curr_n['label']} towards {next_n['label']}")
        elif turn == "right":
            raw_instructions.append(f"Turn right at {curr_n['label']} towards {next_n['label']}")
        else:
            raw_instructions.append(f"Continue straight past {curr_n['label']} towards {next_n['label']}")

    # Final destination sentence enhancement
    dest_n = node_objs[-1]
    if len(raw_instructions) > 0 and not raw_instructions[-1].endswith("."):
        raw_instructions[-1] += f" to reach {dest_n['label']}"

    # Merge consecutive straight instructions
    merged_steps = []
    for instr in raw_instructions:
        if merged_steps and "Continue straight" in merged_steps[-1] and "Continue straight" in instr:
            # combine straight
            parts = instr.split(" towards ")
            if len(parts) > 1:
                merged_steps[-1] = merged_steps[-1].split(" towards ")[0] + f" towards {parts[1]}"
        else:
            merged_steps.append(instr)

    return merged_steps

def route(src: str, dst: str, accessible: bool = False) -> Dict[str, Any]:
    if src not in NODES or dst not in NODES:
        raise ValueError(f"Invalid route nodes: src='{src}', dst='{dst}'")

    G = build_hospital_graph(accessible_only=accessible)
    try:
        path = nx.dijkstra_path(G, src, dst, weight="weight")
        total_cost = int(nx.dijkstra_path_length(G, src, dst, weight="weight"))
    except nx.NetworkXNoPath:
        raise ValueError(f"No route found between '{src}' and '{dst}'")

    path_nodes = [NODES[nid] for nid in path]
    steps = generate_step_text(path)

    return {
        "src": src,
        "dst": dst,
        "accessible": accessible,
        "path": path_nodes,
        "node_ids": path,
        "total_cost": total_cost,
        "steps": steps
    }
