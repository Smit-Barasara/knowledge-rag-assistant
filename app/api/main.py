from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.chat import router as chat_router
from app.api.routes.health import router as health_router
from app.api.routes.rail_guidance import router as rail_guidance_router
from app.api.routes.agent import router as agent_router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.postgres import PostgresManager
from app.ingestion.ingest import load_guidance_documents
import logging

settings = get_settings()
setup_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Indian Rail Travel Assistant...")
    documents = load_guidance_documents()
    postgres = PostgresManager()
    try:
        postgres.create_tables()
        postgres.upsert_rail_guidance_documents(documents)
    finally:
        postgres.close()
    yield
    logger.info("Shutting down Indian Rail Travel Assistant...")


app = FastAPI(
    title="Indian Rail Travel Assistant",
    description="A source-grounded assistant for general Indian rail travel guidance",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()] or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(health_router)
app.include_router(rail_guidance_router)
app.include_router(agent_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.api.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=True,
    )
