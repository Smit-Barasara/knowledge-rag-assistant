from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from datetime import datetime, timezone
from typing import Optional
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()


class RailGuidanceDocument(Base):
    """Store source-linked Indian rail travel guidance."""
    __tablename__ = "rail_guidance_documents"
    
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    topic = Column(String(100), nullable=False)
    summary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    source_url = Column(String(1000), nullable=False)
    last_verified = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ConversationLog(Base):
    """Log conversation queries and responses for analytics."""
    __tablename__ = "conversation_logs"
    
    id = Column(Integer, primary_key=True)
    query = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    digimon_ids = Column(Text)  # JSON array of digimon IDs referenced
    latency_ms = Column(Integer)
    token_count = Column(Integer)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PostgresManager:
    def __init__(self):
        settings = get_settings()
        self.engine = create_engine(
            f"postgresql+psycopg://{settings.postgres_user}:{settings.postgres_password}"
            f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
        )
        self.SessionLocal = sessionmaker(bind=self.engine)
        
    def create_tables(self):
        """Create all tables."""
        Base.metadata.create_all(self.engine)
        logger.info("Created PostgreSQL tables")

    def upsert_rail_guidance_documents(self, documents: list[dict]):
        """Insert or update source-linked rail guidance records."""
        session = self.get_session()
        try:
            statement = pg_insert(RailGuidanceDocument).values(documents)
            statement = statement.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "title": statement.excluded.title,
                    "category": statement.excluded.category,
                    "topic": statement.excluded.topic,
                    "summary": statement.excluded.summary,
                    "content": statement.excluded.content,
                    "source_url": statement.excluded.source_url,
                    "last_verified": statement.excluded.last_verified,
                },
            )
            session.execute(statement)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
    
    def get_session(self) -> Session:
        """Get a database session."""
        return self.SessionLocal()
    
    def close(self):
        """Close the engine."""
        self.engine.dispose()
