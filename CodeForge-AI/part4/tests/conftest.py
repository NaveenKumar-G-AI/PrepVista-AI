import os
import tempfile

import pytest

# Point at an isolated DB file BEFORE importing app.db anywhere else.
_tmp_dir = tempfile.mkdtemp(prefix="codeforge_test_db_")
os.environ["CODEFORGE_DB_PATH"] = os.path.join(_tmp_dir, "test.db")

from app.db import run_migrations
from app.seed import load_seed_data


@pytest.fixture(autouse=True, scope="session")
def _setup_db():
    run_migrations()
    load_seed_data()
    yield
