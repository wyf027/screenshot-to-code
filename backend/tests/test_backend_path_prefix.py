from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

from fastapi import WebSocket
from fastapi.testclient import TestClient
import pytest

from config import normalize_path_prefix
from main import create_app
from uploaded_assets import infer_local_asset_base_url


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, ""),
        ("", ""),
        ("/", ""),
        ("backend", "/backend"),
        ("/backend/", "/backend"),
    ],
)
def test_normalize_path_prefix(raw: str | None, expected: str) -> None:
    assert normalize_path_prefix(raw) == expected


def _client(
    path_prefix: str, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> TestClient:
    monkeypatch.setattr("uploaded_assets.store.LOCAL_ASSET_DIR", str(tmp_path))
    return TestClient(create_app(path_prefix))


def test_create_app_preserves_local_unprefixed_routes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    client = _client("", monkeypatch, tmp_path)
    assert client.get("/").status_code == 200
    assert client.get("/backend/").status_code == 404


def test_create_app_mounts_existing_http_routes_under_backend(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(
        "routes.capabilities.probe_screenshot_preview",
        AsyncMock(return_value=False),
    )
    client = _client("/backend", monkeypatch, tmp_path)
    assert client.get("/").status_code == 404
    assert client.get("/backend/").status_code == 200
    response = client.get("/backend/api/capabilities")
    assert response.status_code == 200
    assert response.json() == {"screenshot_preview": False}


def test_create_app_mounts_static_assets_under_backend(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "asset.png").write_bytes(b"asset-bytes")
    client = _client("/backend", monkeypatch, tmp_path)
    response = client.get("/backend/local-assets/asset.png")
    assert response.status_code == 200
    assert response.content == b"asset-bytes"


def test_create_app_mounts_websocket_under_backend(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    client = _client("/backend", monkeypatch, tmp_path)
    with pytest.raises(ValueError, match="Invalid generated code config"):
        with client.websocket_connect("/backend/generate-code") as websocket:
            websocket.send_json({})
            response = websocket.receive_json()
    assert response["type"] == "error"
    assert "Invalid generated code config" in response["value"]


def test_asset_base_url_includes_the_backend_prefix() -> None:
    websocket = cast(
        WebSocket,
        SimpleNamespace(
            headers={
                "x-forwarded-host": "example.vercel.app",
                "x-forwarded-proto": "https",
            },
            url=SimpleNamespace(scheme="wss", netloc="example.vercel.app"),
        ),
    )
    assert (
        infer_local_asset_base_url(websocket, "/backend")
        == "https://example.vercel.app/backend"
    )
