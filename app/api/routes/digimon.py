from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy.exc import SQLAlchemyError
from app.db.postgres import PostgresManager, DigimonMetadata
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["digimon"])


# NOTE: must stay ABOVE "/digimon/{digimon_id}" — otherwise "filters" is parsed as an int id (422).
@router.get("/digimon/filters")
async def get_digimon_filters():
    """Distinct filter values present in the ingested data (for UI dropdowns)."""
    postgres = PostgresManager()
    session = postgres.get_session()

    try:
        def distinct(column):
            rows = (
                session.query(column)
                .filter(column.isnot(None), column != "")
                .distinct()
                .order_by(column)
                .all()
            )
            return [r[0] for r in rows]

        return {
            "levels": distinct(DigimonMetadata.level),
            "types": distinct(DigimonMetadata.type),
            "attributes": distinct(DigimonMetadata.attribute),
        }

    except SQLAlchemyError as e:
        logger.error(f"Database error fetching digimon filters: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    finally:
        session.close()
        postgres.close()


@router.get("/digimon/{digimon_id}")
async def get_digimon(digimon_id: int):
    """Get Digimon metadata by ID."""
    postgres = PostgresManager()
    session = postgres.get_session()

    try:
        digimon = session.query(DigimonMetadata).filter(
            DigimonMetadata.dapi_id == digimon_id
        ).first()

        if not digimon:
            raise HTTPException(status_code=404, detail="Digimon not found")

        return {
            "id": digimon.dapi_id,
            "name": digimon.name,
            "level": digimon.level,
            "type": digimon.type,
            "attribute": digimon.attribute,
            "description": digimon.description,
            "image_url": digimon.image_url,
        }

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching digimon {digimon_id}: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    finally:
        session.close()
        postgres.close()


@router.get("/digimon")
async def list_digimons(
    response: Response,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None, max_length=100, description="Case-insensitive name search"),
    level: Optional[str] = Query(default=None, max_length=100),
    type_: Optional[str] = Query(default=None, alias="type", max_length=100),
    attribute: Optional[str] = Query(default=None, max_length=100),
):
    """List Digimons with pagination. Total match count is returned in the X-Total-Count header."""
    postgres = PostgresManager()
    session = postgres.get_session()

    try:
        query = session.query(DigimonMetadata)
        if q:
            query = query.filter(DigimonMetadata.name.ilike(f"%{q}%"))
        if level:
            query = query.filter(DigimonMetadata.level == level)
        if type_:
            query = query.filter(DigimonMetadata.type == type_)
        if attribute:
            query = query.filter(DigimonMetadata.attribute == attribute)

        total = query.count()
        # Deterministic order — OFFSET pagination is unreliable without ORDER BY.
        digimons = query.order_by(DigimonMetadata.dapi_id).offset(offset).limit(limit).all()
        response.headers["X-Total-Count"] = str(total)

        return [
            {
                "id": d.dapi_id,
                "name": d.name,
                "level": d.level,
                "type": d.type,
                "attribute": d.attribute,
                "image_url": d.image_url,
            }
            for d in digimons
        ]

    except SQLAlchemyError as e:
        logger.error(f"Database error listing digimons: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    finally:
        session.close()
        postgres.close()
