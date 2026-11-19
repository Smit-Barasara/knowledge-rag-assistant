import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy.exc import SQLAlchemyError

from app.db.postgres import PostgresManager, RailGuidanceDocument

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/rail/guidance", tags=["rail guidance"])


@router.get("/filters")
async def get_rail_guidance_filters():
    """Return categories and topics present in the indexed guidance corpus."""
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
            return [row[0] for row in rows]

        return {
            "categories": distinct(RailGuidanceDocument.category),
            "topics": distinct(RailGuidanceDocument.topic),
        }
    except SQLAlchemyError as error:
        logger.error("Database error fetching rail guidance filters: %s", error)
        raise HTTPException(status_code=503, detail="Guidance database unavailable") from error
    finally:
        session.close()
        postgres.close()


@router.get("/{document_id}")
async def get_rail_guidance_document(document_id: int):
    """Return one guidance record with its official source and verification date."""
    postgres = PostgresManager()
    session = postgres.get_session()
    try:
        document = (
            session.query(RailGuidanceDocument)
            .filter(RailGuidanceDocument.id == document_id)
            .first()
        )
        if not document:
            raise HTTPException(status_code=404, detail="Guidance document not found")
        return {
            "id": document.id,
            "title": document.title,
            "category": document.category,
            "topic": document.topic,
            "summary": document.summary,
            "content": document.content,
            "source_url": document.source_url,
            "last_verified": document.last_verified,
        }
    except HTTPException:
        raise
    except SQLAlchemyError as error:
        logger.error("Database error fetching rail guidance document %s: %s", document_id, error)
        raise HTTPException(status_code=503, detail="Guidance database unavailable") from error
    finally:
        session.close()
        postgres.close()


@router.get("")
async def list_rail_guidance(
    response: Response,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None, max_length=100),
    category: Optional[str] = Query(default=None, max_length=100),
    topic: Optional[str] = Query(default=None, max_length=100),
):
    """Search and paginate source-linked rail guidance."""
    postgres = PostgresManager()
    session = postgres.get_session()
    try:
        query = session.query(RailGuidanceDocument)
        if q:
            search = f"%{q}%"
            query = query.filter(
                RailGuidanceDocument.title.ilike(search)
                | RailGuidanceDocument.summary.ilike(search)
                | RailGuidanceDocument.content.ilike(search)
            )
        if category:
            query = query.filter(RailGuidanceDocument.category == category)
        if topic:
            query = query.filter(RailGuidanceDocument.topic == topic)

        total = query.count()
        documents = (
            query.order_by(RailGuidanceDocument.category, RailGuidanceDocument.title)
            .offset(offset)
            .limit(limit)
            .all()
        )
        response.headers["X-Total-Count"] = str(total)
        return [
            {
                "id": document.id,
                "title": document.title,
                "category": document.category,
                "topic": document.topic,
                "summary": document.summary,
                "source_url": document.source_url,
                "last_verified": document.last_verified,
            }
            for document in documents
        ]
    except SQLAlchemyError as error:
        logger.error("Database error listing rail guidance: %s", error)
        raise HTTPException(status_code=503, detail="Guidance database unavailable") from error
    finally:
        session.close()
        postgres.close()
