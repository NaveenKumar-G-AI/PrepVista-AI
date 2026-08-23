"""
Application configuration.

All secrets and environment-specific values come from environment
variables (see .env.example). Nothing here is a hardcoded credential.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "PrepVista API"
    environment: str = "development"  # development | test | production
    debug: bool = True

    # --- Database ---
    database_url: str = "postgresql+psycopg://prepvista:prepvista_dev_pw@localhost:5432/prepvista_dev"

    # --- Auth / JWT ---
    # In production this MUST be overridden via the JWT_SECRET_KEY env var.
    # There is intentionally no safe default for production use.
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8 hours
    refresh_token_expire_minutes: int = 60 * 24 * 14  # 14 days

    # --- CORS ---
    cors_allow_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # --- Storage ---
    storage_backend: str = "local"  # local | s3 (s3 not implemented in Part 1, interface only)
    local_storage_path: str = "./storage/documents"

    # --- Rate limiting (auth) ---
    login_rate_limit_attempts: int = 10
    login_rate_limit_window_seconds: int = 300

    # --- Import ---
    import_max_rows: int = 20000
    import_allowed_extensions: list[str] = [".xlsx", ".xls", ".csv"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
