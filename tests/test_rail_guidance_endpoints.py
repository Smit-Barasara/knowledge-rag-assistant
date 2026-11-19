import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.postgres import Base, RailGuidanceDocument


@pytest.fixture(scope="module")
def rail_guidance_client(mock_database_startup):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    seed = session_factory()
    seed.add_all(
        [
            RailGuidanceDocument(
                id=1,
                title="Cancelling an IRCTC e-ticket",
                category="Tickets",
                topic="Cancellation and refunds",
                summary="Online cancellation and refund overview.",
                content="Check the current IRCTC cancellation and refund guidance before acting.",
                source_url="https://contents.irctc.co.in/en/eticketCancel.html",
                last_verified="2026-11-18",
            ),
            RailGuidanceDocument(
                id=2,
                title="Understanding Tatkal bookings",
                category="Booking",
                topic="Tatkal",
                summary="Tatkal booking overview.",
                content="Verify the current details with IRCTC.",
                source_url="https://contents.irctc.co.in/en/TatkalBooking.html",
                last_verified="2026-11-18",
            ),
        ]
    )
    seed.commit()
    seed.close()

    def make_manager():
        manager = MagicMock()
        manager.get_session = lambda: session_factory()
        manager.close = MagicMock()
        return manager

    with patch("app.api.routes.rail_guidance.PostgresManager", side_effect=make_manager):
        from app.api.main import app

        with TestClient(app) as client:
            mock_database_startup.return_value.create_tables.assert_called_once_with()
            mock_database_startup.return_value.upsert_rail_guidance_documents.assert_called_once()
            yield client
    engine.dispose()


def test_guidance_list_paginates_and_sets_total(rail_guidance_client):
    response = rail_guidance_client.get("/api/v1/rail/guidance?limit=1")
    assert response.status_code == 200
    assert response.headers["x-total-count"] == "2"
    assert response.json()[0]["title"] == "Understanding Tatkal bookings"
    assert response.json()[0]["source_url"].startswith("https://")


def test_guidance_search_and_filters(rail_guidance_client):
    response = rail_guidance_client.get("/api/v1/rail/guidance?q=refund")
    assert [document["id"] for document in response.json()] == [1]
    response = rail_guidance_client.get("/api/v1/rail/guidance?category=Booking&topic=Tatkal")
    assert [document["id"] for document in response.json()] == [2]


def test_filter_values_are_distinct_and_filter_route_is_not_parsed_as_id(rail_guidance_client):
    response = rail_guidance_client.get("/api/v1/rail/guidance/filters")
    assert response.status_code == 200
    assert response.json() == {
        "categories": ["Booking", "Tickets"],
        "topics": ["Cancellation and refunds", "Tatkal"],
    }


def test_guidance_detail_includes_source_and_missing_id_is_404(rail_guidance_client):
    response = rail_guidance_client.get("/api/v1/rail/guidance/1")
    assert response.status_code == 200
    assert response.json()["last_verified"] == "2026-11-18"
    assert "content" in response.json()
    assert rail_guidance_client.get("/api/v1/rail/guidance/999").status_code == 404
