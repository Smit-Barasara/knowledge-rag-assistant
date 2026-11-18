import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.postgres import Base, DigimonMetadata


@pytest.fixture(scope="module")
def digimon_client():
    """TestClient backed by an in-memory SQLite DB instead of PostgreSQL."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    seed = Session()
    seed.add_all([
        DigimonMetadata(dapi_id=1, name="Agumon", level="Rookie", type="Reptile", attribute="Vaccine", image_url="http://img/1.png"),
        DigimonMetadata(dapi_id=2, name="Gabumon", level="Rookie", type="Animal", attribute="Data", image_url="http://img/2.png"),
        DigimonMetadata(dapi_id=3, name="Greymon", level="Champion", type="Dinosaur", attribute="Vaccine", image_url=None),
    ])
    seed.commit()
    seed.close()

    def make_manager():
        m = MagicMock()
        m.get_session = lambda: Session()
        m.close = MagicMock()
        return m

    with patch("app.api.routes.digimon.PostgresManager", side_effect=make_manager):
        from app.api.main import app
        with TestClient(app) as client:
            yield client


def test_list_is_backward_compatible_array(digimon_client):
    r = digimon_client.get("/api/v1/digimon?limit=10&offset=0")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 3
    assert {"id", "name", "level", "type"} <= set(data[0])


def test_list_adds_image_attribute_and_total_header(digimon_client):
    r = digimon_client.get("/api/v1/digimon?limit=2")
    assert r.headers["x-total-count"] == "3"
    assert len(r.json()) == 2
    assert r.json()[0]["image_url"] == "http://img/1.png"
    assert r.json()[0]["attribute"] == "Vaccine"


def test_list_is_ordered_and_paginates(digimon_client):
    ids = [d["id"] for d in digimon_client.get("/api/v1/digimon?limit=1&offset=1").json()]
    assert ids == [2]


def test_list_filters_and_search(digimon_client):
    r = digimon_client.get("/api/v1/digimon?level=Rookie")
    assert [d["name"] for d in r.json()] == ["Agumon", "Gabumon"]
    assert r.headers["x-total-count"] == "2"
    r = digimon_client.get("/api/v1/digimon?q=grey")
    assert [d["name"] for d in r.json()] == ["Greymon"]
    r = digimon_client.get("/api/v1/digimon?type=Animal")
    assert [d["name"] for d in r.json()] == ["Gabumon"]


def test_filters_route_not_shadowed_by_id_route(digimon_client):
    r = digimon_client.get("/api/v1/digimon/filters")
    assert r.status_code == 200
    body = r.json()
    assert body["levels"] == ["Champion", "Rookie"]
    assert "Reptile" in body["types"]
    assert body["attributes"] == ["Data", "Vaccine"]


def test_get_by_id_still_works(digimon_client):
    assert digimon_client.get("/api/v1/digimon/1").json()["name"] == "Agumon"
    assert digimon_client.get("/api/v1/digimon/999").status_code == 404
