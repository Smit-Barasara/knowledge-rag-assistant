from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


def _client():
    from app.api.main import app
    return TestClient(app)


def test_graph_returns_rewritten_query_when_present():
    final_state = {"generation": "ok", "iterations": 1, "documents": [{}], "rewritten_query": "e-ticket cancellation"}
    with (
        patch("app.api.routes.agent._assert_rail_query", new=AsyncMock()),
        patch("app.api.routes.agent.graph") as g,
        patch("app.api.routes.agent.LangfuseManager", return_value=MagicMock()),
    ):
        g.ainvoke = AsyncMock(return_value=final_state)
        r = _client().post("/api/v1/agent/graph", json={"query": "ticket cancellation?"})
    assert r.status_code == 200
    assert r.json()["rewritten_query"] == "e-ticket cancellation"
    assert {"response", "iterations", "documents_used", "latency_ms"} <= set(r.json())


def test_graph_rewritten_query_null_when_not_rewritten():
    final_state = {"generation": "ok", "iterations": 0, "documents": [{}]}
    with (
        patch("app.api.routes.agent._assert_rail_query", new=AsyncMock()),
        patch("app.api.routes.agent.graph") as g,
        patch("app.api.routes.agent.LangfuseManager", return_value=MagicMock()),
    ):
        g.ainvoke = AsyncMock(return_value=final_state)
        r = _client().post("/api/v1/agent/graph", json={"query": "ticket cancellation?"})
    assert r.json()["rewritten_query"] is None
