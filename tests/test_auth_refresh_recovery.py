"""Auth-provider failures must not masquerade as invalid student credentials."""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import auth


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(auth.router, prefix='/auth')
    return TestClient(app)


class Provider:
    def __init__(self, status, payload=None, error=None):
        self.status, self.payload, self.error = status, payload, error

    async def post(self, *args, **kwargs):
        if self.error:
            raise self.error
        return httpx.Response(self.status, json=self.payload)


@pytest.mark.parametrize('status', [400, 401, 403])
def test_rejected_refresh_credentials_require_login(client, monkeypatch, status):
    monkeypatch.setattr(auth, '_get_supabase_client', lambda: Provider(status, {'error': 'invalid_grant'}))
    response = client.post('/auth/refresh', json={'refresh_token': 'fake-token'})
    assert response.status_code == 401


@pytest.mark.parametrize('status', [404, 408, 429, 500, 502, 503])
def test_provider_failure_is_recoverable(client, monkeypatch, status):
    monkeypatch.setattr(auth, '_get_supabase_client', lambda: Provider(status, {'error': 'service unavailable'}))
    response = client.post('/auth/refresh', json={'refresh_token': 'fake-token'})
    assert response.status_code == 503
    assert 'log in' not in response.json()['detail']


@pytest.mark.parametrize('payload', [None, {}, {'access_token': 'incomplete'}, []])
def test_malformed_provider_session_is_recoverable(client, monkeypatch, payload):
    monkeypatch.setattr(auth, '_get_supabase_client', lambda: Provider(200, payload))
    assert client.post('/auth/refresh', json={'refresh_token': 'fake-token'}).status_code == 503


def test_network_failure_is_recoverable(client, monkeypatch):
    monkeypatch.setattr(auth, '_get_supabase_client', lambda: Provider(0, error=httpx.ConnectError('offline')))
    assert client.post('/auth/refresh', json={'refresh_token': 'fake-token'}).status_code == 503


def test_valid_session_refresh_survives_boundary(client, monkeypatch):
    payload = {'access_token': 'valid.fake.jwt', 'refresh_token': 'new-fake-token', 'expires_in': 3600}
    monkeypatch.setattr(auth, '_get_supabase_client', lambda: Provider(200, payload))
    response = client.post('/auth/refresh', json={'refresh_token': 'fake-token'})
    assert response.status_code == 200
    assert response.json() == payload


@pytest.mark.parametrize('payload', [[], None, {}, {'refresh_token': 123}, {'refresh_token': '  '}])
def test_invalid_body_is_a_bounded_client_error(client, payload):
    assert client.post('/auth/refresh', json=payload).status_code == 400
