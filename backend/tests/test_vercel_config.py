import json
from pathlib import Path
import tomllib


ROOT = Path(__file__).resolve().parents[2]


def _read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_root_vercel_config_declares_frontend_and_backend_services() -> None:
    config = _read_json(ROOT / "vercel.json")
    services = config["services"]
    assert isinstance(services, dict)
    assert services["frontend"] == {
        "root": "frontend/",
        "framework": "vite",
    }
    assert services["backend"] == {
        "root": "backend/",
        "framework": "fastapi",
        "entrypoint": "main:app",
    }
    assert config["fluid"] is True
    assert config["rewrites"] == [
        {"source": "/backend/(.*)", "destination": {"service": "backend"}},
        {"source": "/(.*)", "destination": {"service": "frontend"}},
    ]


def test_frontend_service_has_spa_fallback() -> None:
    config = _read_json(ROOT / "frontend" / "vercel.json")
    assert config["rewrites"] == [
        {"source": "/(.*)", "destination": "/index.html"}
    ]


def test_backend_service_declares_vercel_python_runtime_dependencies() -> None:
    backend = ROOT / "backend"
    python_version = (backend / ".python-version").read_text(encoding="utf-8")
    assert python_version.strip() == "3.12"
    project = tomllib.loads((backend / "pyproject.toml").read_text(encoding="utf-8"))
    dependencies = project["project"]["dependencies"]
    for package in ("fastapi", "openai", "playwright", "websockets"):
        assert any(dependency.startswith(package) for dependency in dependencies)
    assert not any(dependency.startswith("pre-commit") for dependency in dependencies)
    assert not any(dependency.startswith("types-pillow") for dependency in dependencies)
    lock = tomllib.loads((backend / "uv.lock").read_text(encoding="utf-8"))
    locked_names = {package["name"] for package in lock["package"]}
    for package in ("fastapi", "openai", "playwright", "websockets"):
        assert package in locked_names
    assert project["tool"]["uv"]["package"] is False
