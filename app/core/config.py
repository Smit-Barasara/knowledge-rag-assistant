from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # Embeddings
    voyage_api_key: str = ""
    voyage_embedding_model: str = "voyage-3"
    voyage_embed_batch_size: int = 20
    voyage_rpm: int = 3

    # Qdrant
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection_name: str = "rail_guidance_knowledge"

    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "digimon_db"
    postgres_user: str = "digimon"
    postgres_password: str = ""

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # Langfuse
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "http://localhost:3000"

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"
    cors_origins: str = "*"  # comma-separated; "*" keeps the previous behaviour


@lru_cache
def get_settings() -> Settings:
    return Settings()
