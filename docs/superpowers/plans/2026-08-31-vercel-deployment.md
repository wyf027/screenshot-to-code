# Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Vite frontend and FastAPI WebSocket backend from `wyf027/screenshot-to-code` as one Vercel Services project while keeping provider keys browser-only.

**Architecture:** Mount the complete existing FastAPI application under an opt-in `/backend` prefix and share that prefix with the frontend's same-origin URL builder. Define Vite and FastAPI as two Vercel Services, keep all runtime files under `/tmp`, and preserve the existing local empty-prefix behavior.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind CSS, FastAPI, Python 3.11, Poetry, pytest, Jest, Vercel Services, Fluid Compute, native WebSockets.

**Spec:** `docs/superpowers/specs/2026-08-31-vercel-deployment-design.md`

## Global Constraints

- The GitHub repository is public and retains the upstream MIT license.
- Provider keys remain browser BYOK and must not be stored in Git, Vercel environment variables, logs, screenshots, task cards, or documentation.
- Local startup retains its mixed existing routes; `/backend` is an opt-in ASGI mount through environment configuration.
- Vercel Hobby maximum duration is 300 seconds.
- The first Vercel deployment does not bundle Chromium; missing Chromium disables only screenshot preview.
- Existing multi-provider selection and four-variant image generation remain unchanged.
- Do not repair unrelated upstream lint or Pyright findings.
- If the Vercel account does not expose Services or Python WebSockets, stop before changing to the two-project fallback.

---

### Task 1: Add an opt-in backend application mount

**Files:**
- Create: `backend/tests/test_backend_path_prefix.py`
- Modify: `backend/config.py:1-37`
- Modify: `backend/main.py:1-61`
- Modify: `backend/uploaded_assets/store.py:43-57`
- Modify: `backend/routes/generate_code.py:20-32,739-760`

**Interfaces:**
- Consumes: `FastAPI`, the existing route modules, and `LOCAL_ASSET_DIR`.
- Produces: `normalize_path_prefix(value: str | None) -> str`, `BACKEND_PATH_PREFIX: str`, `create_route_app() -> FastAPI`, `create_app(path_prefix: str = BACKEND_PATH_PREFIX) -> FastAPI`, and prefix-aware local-asset base URLs.

- [x] **Step 1: Read the test-design rules**

Read `superpowers:test-driven-development` and its linked
`writing-good-tests.md` before editing the test file.

- [x] **Step 2: Write the failing backend prefix tests**

Create `backend/tests/test_backend_path_prefix.py`:

```python
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
```

- [x] **Step 3: Run the tests and verify RED**

Run:

```bash
cd backend
uvx --from poetry poetry run pytest tests/test_backend_path_prefix.py -v
```

Expected: collection fails because `normalize_path_prefix` and `create_app` do not exist.

- [x] **Step 4: Implement prefix normalization**

Add to `backend/config.py` before the derived configuration values:

```python
def normalize_path_prefix(value: str | None) -> str:
    cleaned = (value or "").strip()
    if not cleaned or cleaned == "/":
        return ""
    return f"/{cleaned.strip('/')}"


BACKEND_PATH_PREFIX = normalize_path_prefix(os.environ.get("BACKEND_PATH_PREFIX"))
```

- [x] **Step 5: Make generated asset URLs prefix-aware**

Update `infer_local_asset_base_url` in `backend/uploaded_assets/store.py` to accept
`path_prefix: str = ""` and return `f"{scheme}://{host}{path_prefix}"`. This
keeps local URLs unchanged and makes generated asset URLs point at
`/backend/local-assets` on Vercel.

- [x] **Step 6: Add an application factory**

Refactor `backend/main.py` so startup handlers remain module-level functions,
then define a route application containing the unchanged existing routes and a
host application that mounts it only when a prefix is configured:

```python
ROUTERS = (
    generate_code.router,
    screenshot.router,
    home.router,
    capabilities.router,
    evals.router,
    export.router,
    design_systems.router,
    prompt_reports.router,
    agent_runs.router,
    eval_sets.router,
)


def create_route_app() -> FastAPI:
    route_app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
    configure_uploaded_asset_routes(route_app)
    for router in ROUTERS:
        route_app.include_router(router)
    return route_app


def create_app(path_prefix: str = BACKEND_PATH_PREFIX) -> FastAPI:
    route_app = create_route_app()
    application = route_app
    if path_prefix:
        application = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
        application.mount(path_prefix, route_app)
    application.add_event_handler("startup", log_debug_mode)
    application.add_event_handler("startup", probe_screenshot_preview_on_startup)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return application


app = create_app()
```

Import `BACKEND_PATH_PREFIX` alongside `IS_DEBUG_ENABLED`. Remove the old
decorator-bound global app construction. Do not add a prefix to any individual
router: the sub-application mount must preserve existing internal paths such as
`/generate-code` and `/api/capabilities`.

In `backend/routes/generate_code.py`, import `BACKEND_PATH_PREFIX` from
`config` and pass it to the asset URL inference call:

```python
param_extractor = ParameterExtractionStage(
    context.throw_error,
    infer_local_asset_base_url(context.websocket, BACKEND_PATH_PREFIX),
)
```

- [x] **Step 7: Run targeted tests and verify GREEN**

Run:

```bash
cd backend
uvx --from poetry poetry run pytest tests/test_backend_path_prefix.py tests/test_uploaded_assets.py -v
```

Expected: all selected tests pass.

- [x] **Step 8: Run backend regression and changed-file type checks**

Run:

```bash
cd backend
uvx --from poetry poetry run pytest
uvx --from poetry poetry run pyright config.py main.py routes/generate_code.py uploaded_assets/store.py tests/test_backend_path_prefix.py
```

Expected: 276 existing tests plus the new tests pass; changed files have zero
Pyright errors and no new warnings.

- [x] **Step 9: Commit the backend compatibility change**

```bash
git add backend/config.py backend/main.py backend/routes/generate_code.py backend/uploaded_assets/store.py backend/tests/test_backend_path_prefix.py
git commit -m "feat: mount backend under deployment prefix"
```

---

### Task 2: Build prefix-aware same-origin frontend URLs

**Files:**
- Create: `frontend/src/lib/backend-urls.ts`
- Create: `frontend/src/lib/backend-urls.test.ts`
- Modify: `frontend/src/config.ts:5-19`

**Interfaces:**
- Consumes: `window.location.origin`, `VITE_HTTP_BACKEND_URL`, `VITE_WS_BACKEND_URL`, and `VITE_BACKEND_PATH_PREFIX`.
- Produces: `normalizeBackendPathPrefix(value?: string) -> string` and `buildBackendUrls(origin: string, rawPrefix?: string) -> { http: string; ws: string }`.

- [x] **Step 1: Write the failing URL-builder tests**

Create `frontend/src/lib/backend-urls.test.ts`:

```typescript
import {
  buildBackendUrls,
  normalizeBackendPathPrefix,
} from "./backend-urls";

describe("backend URL construction", () => {
  test.each([
    [undefined, ""],
    ["", ""],
    ["/", ""],
    ["backend", "/backend"],
    ["/backend/", "/backend"],
  ])("normalizes %p to %p", (raw, expected) => {
    expect(normalizeBackendPathPrefix(raw)).toBe(expected);
  });

  test("keeps current same-origin behavior with no prefix", () => {
    expect(buildBackendUrls("https://example.vercel.app")).toEqual({
      http: "https://example.vercel.app",
      ws: "wss://example.vercel.app",
    });
  });

  test("adds the production prefix to HTTP and WebSocket origins", () => {
    expect(buildBackendUrls("https://example.vercel.app", "/backend")).toEqual({
      http: "https://example.vercel.app/backend",
      ws: "wss://example.vercel.app/backend",
    });
  });
});
```

- [x] **Step 2: Run the test and verify RED**

```bash
cd frontend
pnpm test --runInBand src/lib/backend-urls.test.ts
```

Expected: FAIL because `backend-urls.ts` does not exist.

- [x] **Step 3: Implement the pure URL helper**

Create `frontend/src/lib/backend-urls.ts`:

```typescript
export function normalizeBackendPathPrefix(value?: string): string {
  const cleaned = (value || "").trim();
  if (!cleaned || cleaned === "/") return "";
  return `/${cleaned.replace(/^\/+|\/+$/g, "")}`;
}

export function buildBackendUrls(origin: string, rawPrefix?: string) {
  const prefix = normalizeBackendPathPrefix(rawPrefix);
  const http = `${origin.replace(/\/$/, "")}${prefix}`;
  return { http, ws: http.replace(/^http/, "ws") };
}
```

- [x] **Step 4: Use the helper from the runtime config**

Update `frontend/src/config.ts`:

```typescript
import { buildBackendUrls } from "./lib/backend-urls";

const SAME_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://127.0.0.1:5173";
const SAME_ORIGIN_BACKEND = buildBackendUrls(
  SAME_ORIGIN,
  import.meta.env.VITE_BACKEND_PATH_PREFIX
);

export const WS_BACKEND_URL =
  import.meta.env.VITE_WS_BACKEND_URL || SAME_ORIGIN_BACKEND.ws;

export const HTTP_BACKEND_URL =
  import.meta.env.VITE_HTTP_BACKEND_URL || SAME_ORIGIN_BACKEND.http;
```

Keep `IS_RUNNING_ON_CLOUD` and `PICO_BACKEND_FORM_SECRET` unchanged.

- [x] **Step 5: Run targeted tests and lint**

```bash
cd frontend
pnpm test --runInBand src/lib/backend-urls.test.ts
pnpm exec eslint src/config.ts src/lib/backend-urls.ts src/lib/backend-urls.test.ts --max-warnings=0
```

Expected: the new tests pass and the three changed files have no lint findings.

- [x] **Step 6: Run frontend regression tests and build**

```bash
cd frontend
pnpm test --runInBand
pnpm build
```

Expected: the existing 42 tests plus the new tests pass, and the Vite production
build exits 0.

- [x] **Step 7: Commit the frontend URL change**

```bash
git add frontend/src/config.ts frontend/src/lib/backend-urls.ts frontend/src/lib/backend-urls.test.ts
git commit -m "feat: support prefixed backend URLs"
```

---

### Task 3: Define and test the Vercel Services topology

**Files:**
- Create: `vercel.json`
- Create: `frontend/vercel.json`
- Create: `backend/tests/test_vercel_config.py`

**Interfaces:**
- Consumes: Vercel Services configuration and the `/backend` prefix from Tasks 1-2.
- Produces: one public deployment with `frontend` and `backend` services, backend-first rewrites, Vite SPA fallback, Fluid Compute, and a 300-second backend duration.

- [x] **Step 1: Write the failing Vercel configuration test**

Create `backend/tests/test_vercel_config.py`:

```python
import json
from pathlib import Path


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
        "maxDuration": 300,
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
```

- [x] **Step 2: Run the test and verify RED**

```bash
cd backend
uvx --from poetry poetry run pytest tests/test_vercel_config.py -v
```

Expected: FAIL with `FileNotFoundError` for the absent root `vercel.json`.

- [x] **Step 3: Create the root Services configuration**

Create `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "fluid": true,
  "services": {
    "frontend": {
      "root": "frontend/",
      "framework": "vite"
    },
    "backend": {
      "root": "backend/",
      "framework": "fastapi",
      "entrypoint": "main:app",
      "maxDuration": 300
    }
  },
  "rewrites": [
    { "source": "/backend/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
```

- [x] **Step 4: Create the Vite SPA service configuration**

Create `frontend/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [x] **Step 5: Run configuration tests and syntax checks**

```bash
cd backend
uvx --from poetry poetry run pytest tests/test_vercel_config.py -v
cd ..
jq empty vercel.json frontend/vercel.json
git diff --check
```

Expected: configuration tests pass, both JSON files parse, and the diff has no
whitespace errors.

- [x] **Step 6: Commit the Vercel topology**

```bash
git add vercel.json frontend/vercel.json backend/tests/test_vercel_config.py
git commit -m "feat: configure Vercel services"
```

---

### Task 4: Document deployment and browser BYOK

**Files:**
- Modify: `README.md`
- Modify: `.ai/tasks/vercel-deployment.md`

**Interfaces:**
- Consumes: the implementation and environment names from Tasks 1-3.
- Produces: a reproducible public deployment guide and an auditable task state.

- [x] **Step 1: Add a Vercel deployment section to the README**

Document all of the following verbatim environment assignments, while stating
that none is a provider credential:

```dotenv
BACKEND_PATH_PREFIX=/backend
VITE_BACKEND_PATH_PREFIX=/backend
LOCAL_ASSET_DIR=/tmp/screenshot-to-code/local-assets
LOGS_PATH=/tmp/screenshot-to-code
PROMPT_REPORTS_ENABLED=false
```

The section must also state:

- select the Vercel `Services` framework;
- apply variables to Production and Preview;
- provider keys are entered in the application Settings dialog and must not be
  added to Vercel;
- Hobby generation connections can run for at most 300 seconds;
- screenshot preview is unavailable until a compatible Chromium deployment is
  added, while core code generation remains available;
- local development continues to use empty prefixes.

- [x] **Step 2: Update the task card**

Set `.ai/tasks/vercel-deployment.md` status to `implementation locally
verified` only after Task 5 finishes. Until then, set it to `implementation in
progress` and list the latest commit after each task.

- [x] **Step 3: Validate documentation and secret hygiene**

```bash
rg -n "BACKEND_PATH_PREFIX|VITE_BACKEND_PATH_PREFIX|browser BYOK|300 seconds" README.md
rg -n --hidden -g '!node_modules/**' -g '!.git/**' 'sk-[A-Za-z0-9_-]{16,}' .
git diff --check
```

Expected: the deployment instructions are present, the secret-pattern search
returns no matches, and the diff is clean.

- [ ] **Step 4: Commit the deployment documentation**

```bash
git add README.md .ai/tasks/vercel-deployment.md
git commit -m "docs: add Vercel deployment guide"
```

---

### Task 5: Run integrated local verification

**Files:**
- Modify: `.ai/tasks/vercel-deployment.md`

**Interfaces:**
- Consumes: all code and configuration from Tasks 1-4.
- Produces: repeatable local evidence for backend routing, frontend behavior, build output, types, and known upstream baselines.

- [ ] **Step 1: Run the complete backend suite**

```bash
cd backend
uvx --from poetry poetry run pytest
uvx --from poetry poetry run pyright
```

Expected: all tests pass; Pyright has zero errors and no warnings in changed
files. Record the total warnings separately from the 36-warning baseline.

- [ ] **Step 2: Run the complete frontend suite and build**

```bash
cd frontend
pnpm test --runInBand
pnpm build
pnpm exec eslint src/config.ts src/lib/backend-urls.ts src/lib/backend-urls.test.ts --max-warnings=0
```

Expected: all tests and the build pass; changed files have zero lint findings.

- [ ] **Step 3: Recheck the upstream full-lint baseline**

```bash
cd frontend
pnpm lint
```

Expected baseline: nonzero exit with 19 existing errors and 6 existing warnings.
If the counts or files change, inspect the diff and do not attribute new
findings to upstream.

- [ ] **Step 4: Smoke-test the prefixed FastAPI service**

Start the backend in a terminal with non-secret runtime variables:

```bash
cd backend
BACKEND_PATH_PREFIX=/backend \
LOCAL_ASSET_DIR=/tmp/screenshot-to-code/local-assets \
LOGS_PATH=/tmp/screenshot-to-code \
PROMPT_REPORTS_ENABLED=false \
uvx --from poetry poetry run uvicorn main:app --host 127.0.0.1 --port 7001
```

From another terminal:

```bash
curl --fail --silent --show-error http://127.0.0.1:7001/backend/api/capabilities
curl --fail --silent --show-error http://127.0.0.1:7001/backend/
```

Expected: both requests return successfully. Stop the Uvicorn process before
continuing.

- [ ] **Step 5: Record verification evidence in the task card**

Add exact test counts, build exit status, Pyright totals, lint baseline totals,
and prefixed API probe results to `.ai/tasks/vercel-deployment.md`.

- [ ] **Step 6: Commit the verified task state**

```bash
git add .ai/tasks/vercel-deployment.md
git commit -m "chore: record Vercel verification"
```

---

### Task 6: Review, merge, and synchronize GitHub

**Files:**
- Review: all changes relative to `origin/main`

**Interfaces:**
- Consumes: the locally verified feature branch.
- Produces: reviewed commits merged into the public fork's `main` branch.

- [ ] **Step 1: Run the final diff checks**

```bash
git status --short --branch
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: the worktree is clean and only planned files differ.

- [ ] **Step 2: Invoke independent code review**

Use `superpowers:requesting-code-review`. Review against
`docs/superpowers/specs/2026-08-31-vercel-deployment-design.md` and resolve all
material findings before continuing.

- [ ] **Step 3: Push the feature branch and create a pull request**

```bash
git push origin feat/vercel-deployment
gh pr create \
  --repo wyf027/screenshot-to-code \
  --base main \
  --head feat/vercel-deployment \
  --title "Deploy screenshot-to-code on Vercel" \
  --body-file .ai/tasks/vercel-deployment.md
```

Expected: GitHub returns a pull-request URL.

- [ ] **Step 4: Merge only after checks and review are green**

```bash
gh pr checks --repo wyf027/screenshot-to-code --watch
gh pr merge --repo wyf027/screenshot-to-code --merge --delete-branch
```

Expected: the pull request is merged and remote `main` contains the reviewed
commits.

- [ ] **Step 5: Fast-forward the primary fork checkout**

In `/Users/wuyangfan/Documents/Codex/2026-08-31/screenshot-to-code`:

```bash
git fetch origin
git switch main
git merge --ff-only origin/main
git status --short --branch
```

Expected: local `main` equals `origin/main` and user files remain untouched.

---

### Task 7: Create and deploy the Vercel Services project

**Files:**
- External state: Vercel project linked to `wyf027/screenshot-to-code`

**Interfaces:**
- Consumes: merged GitHub `main`, the user's authenticated Chrome Vercel session, and the five non-secret environment values from Task 4.
- Produces: a Vercel production deployment URL. It does not consume a provider key.

- [ ] **Step 1: Connect to the user's authenticated Chrome session**

Use `chrome:control-chrome`. Select Chrome explicitly, read its browser
documentation, and reuse the existing Vercel dashboard tab. Do not inspect
cookies, local storage, saved passwords, or extension data.

- [ ] **Step 2: Import the GitHub repository**

In `Leno23's projects`, choose Add New -> Project, import
`wyf027/screenshot-to-code`, and name the Vercel project
`screenshot-to-code` unless that name already exists.

- [ ] **Step 3: Select the Services framework or stop**

Set Framework Preset to `Services`. Confirm that Vercel recognizes the root
`vercel.json` and both `frontend` and `backend` services.

If `Services` is absent, stop and report the exact account limitation. Do not
create separate Vercel projects without new user approval.

- [ ] **Step 4: Configure only non-secret environment values**

Add the following to Production and Preview:

```dotenv
BACKEND_PATH_PREFIX=/backend
VITE_BACKEND_PATH_PREFIX=/backend
LOCAL_ASSET_DIR=/tmp/screenshot-to-code/local-assets
LOGS_PATH=/tmp/screenshot-to-code
PROMPT_REPORTS_ENABLED=false
```

Verify that no `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or
`REPLICATE_API_KEY` exists in the project configuration.

- [ ] **Step 5: Deploy and inspect the build**

Start the deployment. Inspect both service build logs and record the deployment
commit SHA. If either build fails, preserve the logs, reproduce locally where
possible, use `superpowers:systematic-debugging`, fast-forward local `main`,
create `fix/vercel-deployment`, add a failing regression test, and repeat the
review -> pull request -> merge -> deployment loop.

- [ ] **Step 6: Record the production URL and deployed SHA**

Do not call the deployment complete yet. Record the Vercel URL, deployment
status, deployed commit SHA, and service build results as their own evidence
layer.

---

### Task 8: Verify the deployed WebSocket flow and one real generation

**Files:**
- External state: deployed Vercel application
- Modify if needed: `.ai/tasks/vercel-deployment.md`

**Interfaces:**
- Consumes: the Vercel production URL and a provider key entered manually by the user in Chrome.
- Produces: HTTP, WebSocket, missing-key, and real screenshot-to-code acceptance evidence.

- [ ] **Step 1: Probe the public HTTP routes**

```bash
curl --fail --silent --show-error "$DEPLOYMENT_URL/"
curl --fail --silent --show-error "$DEPLOYMENT_URL/backend/api/capabilities"
```

Set `DEPLOYMENT_URL` to the exact HTTPS production URL recorded in Task 7.
Expected: the frontend HTML and a capabilities JSON response both return 2xx.

- [ ] **Step 2: Probe the WebSocket handshake without a provider key**

Use the installed backend Python environment to open and cleanly close
the WebSocket URL formed by replacing the `https` scheme in `DEPLOYMENT_URL`
with `wss` and appending `/backend/generate-code`. Expected: the WebSocket upgrade
succeeds. Do not send a provider key or record browser storage.

- [ ] **Step 3: Verify missing-key behavior in Chrome**

Open the deployed application in Chrome with provider settings empty. Start a
generation with a non-sensitive public sample image. Expected: the UI reports
that a provider key is required and directs the user to Settings.

- [ ] **Step 4: Pause for user-owned key entry**

Ask the user to enter their OpenAI API key directly in the deployed
application's Settings dialog and tell Codex when it is ready. Do not type,
read, copy, inspect, screenshot, or log the key.

- [ ] **Step 5: Run one real screenshot-to-code acceptance test**

After the user confirms key entry, use a non-sensitive public page screenshot,
select HTML + Tailwind, and generate once. Expected evidence:

- the WebSocket remains connected;
- at least one variant completes;
- generated code renders in the preview;
- no provider key appears in browser-visible errors or Vercel logs.

- [ ] **Step 6: Capture user-facing evidence**

Capture screenshots of the deployed landing state and completed generated
preview, excluding the Settings dialog and all credentials. Screenshots prove
visual behavior, not deployment SHA or full E2E by themselves.

- [ ] **Step 7: Update and publish the final task record**

Record separately in `.ai/tasks/vercel-deployment.md`:

- local tests/build/types/lint;
- GitHub pull request and merge SHA;
- Vercel deployed SHA and URL;
- HTTP probe;
- WebSocket handshake;
- missing-key behavior;
- real generation outcome;
- screenshot locations.

From the fast-forwarded primary checkout, create a final evidence branch and
publish the task-card update without any secret values:

```bash
git switch main
git fetch origin
git merge --ff-only origin/main
git switch -c chore/vercel-deployment-evidence
git add .ai/tasks/vercel-deployment.md
git commit -m "docs: record Vercel deployment evidence"
git push -u origin chore/vercel-deployment-evidence
gh pr create \
  --repo wyf027/screenshot-to-code \
  --base main \
  --head chore/vercel-deployment-evidence \
  --title "Record Vercel deployment evidence" \
  --body "Records verified deployment and acceptance evidence without credentials."
gh pr merge --repo wyf027/screenshot-to-code --merge --delete-branch
```

Expected: the evidence pull request is merged and contains no credential value.
