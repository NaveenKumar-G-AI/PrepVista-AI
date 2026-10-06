import os
import sys
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.deployment.start import run_deployment, bootstrap_roles

@pytest.fixture
def mock_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://prepvista_runtime:pass@localhost:5432/db")
    monkeypatch.setenv("MIGRATION_DATABASE_URL", "postgresql://postgres:admin@localhost:5432/db")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("PORT", "8000")

class MockExit(Exception):
    pass

@pytest.mark.asyncio
async def test_production_requires_migration_url(mock_env, monkeypatch):
    monkeypatch.delenv("MIGRATION_DATABASE_URL")
    
    with patch("app.deployment.start.sys.exit", side_effect=MockExit), \
         patch("app.deployment.start.logger.error") as mock_log:
        with pytest.raises(MockExit):
            await run_deployment()
        mock_log.assert_called_with("missing_migration_database_url_in_production")

@pytest.mark.asyncio
async def test_production_url_cannot_be_local(mock_env, monkeypatch):
    with patch("app.deployment.start.sys.exit", side_effect=MockExit), \
         patch("app.deployment.start.logger.error") as mock_log:
        with pytest.raises(MockExit):
            await run_deployment()
        mock_log.assert_called_with("production_url_cannot_be_local")

@pytest.mark.asyncio
async def test_database_url_must_not_use_postgres_admin_in_production(mock_env, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres:pass@remote:5432/db")
    monkeypatch.setenv("MIGRATION_DATABASE_URL", "postgresql://postgres:admin@remote:5432/db")
    
    with patch("app.deployment.start.sys.exit", side_effect=MockExit), \
         patch("app.deployment.start.logger.error") as mock_log:
        with pytest.raises(MockExit):
            await run_deployment()
        mock_log.assert_called_with("database_url_must_not_use_postgres_admin_in_production")

@pytest.mark.asyncio
async def test_successful_migration_starts_server_and_pops_env(mock_env, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://prepvista_runtime:pass@remote:5432/db")
    monkeypatch.setenv("MIGRATION_DATABASE_URL", "postgresql://postgres:admin@remote:5432/db")
    monkeypatch.setenv("PORT", "9000")
    monkeypatch.setenv("WEB_CONCURRENCY", "4")

    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = True  # roles exist

    with patch("app.deployment.start.asyncpg.connect", return_value=mock_conn), \
         patch("app.deployment.start._run_migrations", new_callable=AsyncMock), \
         patch("app.deployment.start.check_schema_readiness", new_callable=AsyncMock), \
         patch("app.deployment.start.os.execvp") as mock_execvp, \
         patch("app.deployment.start.subprocess.run") as mock_subprocess:
        
        await run_deployment()
        
        assert "MIGRATION_DATABASE_URL" not in os.environ

        expected_cmd = [
            "gunicorn", "app.main:app",
            "--worker-class", "uvicorn.workers.UvicornWorker",
            "--workers", "4",
            "--bind", "0.0.0.0:9000",
            "--timeout", "120",
            "--keep-alive", "65",
            "--graceful-timeout", "30",
            "--preload",
            "--access-logfile", "-",
            "--error-logfile", "-"
        ]

        if hasattr(os, "execvp"):
            mock_execvp.assert_called_once_with("gunicorn", expected_cmd)
        else:
            mock_subprocess.assert_called_once_with(expected_cmd)

@pytest.mark.asyncio
async def test_migration_failure_blocks_backend(mock_env, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://prepvista_runtime:pass@remote:5432/db")
    monkeypatch.setenv("MIGRATION_DATABASE_URL", "postgresql://postgres:admin@remote:5432/db")

    mock_conn = AsyncMock()
    
    with patch("app.deployment.start.asyncpg.connect", return_value=mock_conn), \
         patch("app.deployment.start._run_migrations", side_effect=Exception("DB Error")), \
         patch("app.deployment.start.sys.exit", side_effect=MockExit):
        
        with pytest.raises(MockExit):
            await run_deployment()
            
        mock_conn.execute.assert_called_with("SELECT pg_advisory_unlock($1)", 8137357283492)
