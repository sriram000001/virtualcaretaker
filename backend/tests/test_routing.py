import pytest
from backend.routing import route, build_hospital_graph

def test_route_entrance_to_registration():
    r = route("entrance", "registration", accessible=False)
    assert r["src"] == "entrance"
    assert r["dst"] == "registration"
    assert "entrance" in r["node_ids"]
    assert "lobby" in r["node_ids"]
    assert "registration" in r["node_ids"]
    assert len(r["steps"]) > 0
    assert r["total_cost"] > 0

def test_route_floor_change_lift():
    r = route("entrance", "room_102", accessible=True)
    assert "lift_g" in r["node_ids"]
    assert "lift_1" in r["node_ids"]
    assert "room_102" in r["node_ids"]
    # Check lift step text generated
    lift_step_found = any("Lift A" in step for step in r["steps"])
    assert lift_step_found, f"Steps should mention Lift A: {r['steps']}"

def test_route_accessible_excludes_stairs():
    # Attempt route using stairs explicitly
    graph_accessible = build_hospital_graph(accessible_only=True)
    assert not graph_accessible.has_edge("g_junction", "stairs_g")
    assert not graph_accessible.has_edge("stairs_g", "stairs_1")

    # Route with accessible=True must use lift_g -> lift_1
    r = route("g_junction", "room_101", accessible=True)
    assert "stairs_g" not in r["node_ids"]
    assert "lift_g" in r["node_ids"]

def test_invalid_node_raises_exception():
    with pytest.raises(ValueError):
        route("invalid_start", "registration")
