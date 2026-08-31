# Vercel Deployment Design

## Status

Approved in chat on 2026-08-31 and revised the same day after discovering the
upstream backend's mixed `/generate-code` and `/api/*` route layout. The
repository is the public GitHub fork
`wyf027/screenshot-to-code`, with `abi/screenshot-to-code` retained as the
upstream project and the MIT license preserved.

## Goal

Deploy the existing Vite/React frontend and FastAPI backend to the user's
Vercel Hobby account as one Vercel Services project while preserving the
upstream local-development flow.

The production deployment must support screenshot-to-code generation over a
WebSocket and must not persist or expose provider credentials.

## Approved Decisions

- Use a public GitHub repository.
- Prefer one Vercel project with two Services: `frontend` and `backend`.
- Use browser BYOK. OpenAI, Anthropic, Gemini, and Replicate keys remain local
  browser settings and are sent only with the generation request over HTTPS or
  WSS.
- Do not configure provider keys as Vercel environment variables.
- Keep upstream multi-provider and variant behavior unchanged.
- Do not bundle or require a Chromium browser in the first Vercel deployment.
  The existing capability probe will omit screenshot preview when Chromium is
  unavailable.
- Disable local `save_assets` and `extract_assets` tools on Vercel until a
  durable object store replaces the ephemeral Function filesystem.
- Preserve local routes and local startup commands by mounting the complete
  backend ASGI application under an opt-in production prefix.

## Architecture

The root `vercel.json` defines two Vercel Services:

- `frontend`: root `frontend/`, detected as Vite, exposed by the catch-all
  rewrite.
- `backend`: root `backend/`, FastAPI entrypoint `main:app`, exposed first by
  the `/backend/(.*)` rewrite.

Vercel evaluates the backend rewrite before the frontend catch-all. Public
traffic therefore follows this layout:

```text
https://<deployment>/                 -> frontend service
https://<deployment>/backend/...          -> backend service
wss://<deployment>/backend/generate-code  -> FastAPI WebSocket
```

The backend reads `BACKEND_PATH_PREFIX`. An empty value preserves current
local routes such as `/generate-code` and `/api/capabilities`. The Vercel
deployment sets it to `/backend` and mounts the entire existing FastAPI
application as a sub-application. Public routes therefore become
`/backend/generate-code`, `/backend/api/capabilities`, and
`/backend/local-assets/*` without rewriting any internal route.

The frontend reads `VITE_BACKEND_PATH_PREFIX`. Its default remains empty. On
Vercel it is `/backend`, so the existing same-origin URL calculation produces
preview-safe and production-safe HTTP and WSS URLs without hardcoding a Vercel
domain.

## Request and Data Flow

1. The browser loads the Vite application from the deployment origin.
2. The user opens Settings and enters at least one provider key.
3. The browser stores the key using the upstream client-side settings flow.
4. A screenshot generation opens
   `wss://<current-origin>/backend/generate-code`.
5. Vercel routes the connection to the FastAPI service. The connection remains
   pinned to that Function instance for the generation.
6. The backend sends model output and status messages over the same socket.
7. Generated code remains in browser application state. Local asset tools are
   disabled; optional logs exist only in the Function's temporary filesystem.

No provider key is written to Git, Vercel project configuration, task cards,
logs, screenshots, or documentation.

## Temporary Files and Runtime Limits

Vercel Functions have an ephemeral filesystem. Production configuration uses:

- `LOCAL_ASSET_DIR=/tmp/screenshot-to-code/local-assets`
- `LOGS_PATH=/tmp/screenshot-to-code`
- `PROMPT_REPORTS_ENABLED=false`
- `IS_PROD=true`
- `LOCAL_ASSET_TOOLS_ENABLED=false`

The application must create these directories lazily and must not depend on
their contents surviving a cold start or a later request.

The Hobby execution limit is 300 seconds. The WebSocket client must surface a
clear terminal error when Vercel closes a generation because of duration,
deployment recycling, or network loss. Automatic resumption is out of scope
because the upstream pipeline does not persist enough state to resume a model
turn safely.

## Security Boundary

- Provider keys are browser BYOK only.
- Server logs may state which provider setting was present, but must never log
  its value.
- The public repository contains placeholders and variable names only.
- The public deployment does not subsidize anonymous generation: visitors must
  supply their own provider key.
- Vercel preview and production deployments use HTTPS/WSS.

## Error Handling

- Missing provider key: preserve the upstream error and direct the user to
  Settings.
- Unsupported provider/model: preserve the provider-specific generation error.
- WebSocket close before completion: show a connection/timeout error and leave
  the UI retryable.
- Missing Chromium: report screenshot preview as unavailable and continue with
  core screenshot-to-code generation.
- Local asset tools disabled: do not stage uploaded assets or advertise
  `save_assets`/`extract_assets`; continue passing screenshots to the selected
  vision model.

## Expected Code and Configuration Changes

- `vercel.json`: define the two Services and backend-first rewrites. Fluid
  Compute supplies the Hobby plan's default 300-second maximum duration.
- `backend/config.py`: normalize an optional backend path prefix.
- `backend/main.py`: preserve the existing internal routes and mount the full
  FastAPI application under the configured prefix.
- `backend/uploaded_assets/store.py`: include the configured prefix in public
  local-asset base URLs.
- `backend/routes/generate_code.py`: derive the configured prefix from ASGI
  `root_path` and disable local asset staging when configured off.
- `backend/agent/tools/definitions.py` and
  `backend/agent/providers/factory.py`: omit local asset tools when the runtime
  disables ephemeral asset persistence.
- `backend/.python-version`, PEP 621 `backend/pyproject.toml`, and
  `backend/uv.lock`: pin Vercel Python 3.12 and expose locked dependencies to
  the Vercel Python builder while retaining Poetry development workflows.
- `frontend/src/config.ts`: apply the optional path prefix to same-origin HTTP
  and WebSocket base URLs.
- Backend and frontend tests: prove empty-prefix compatibility and `/backend`
  production routing.
- `README.md`: document Vercel Services deployment, browser BYOK, temporary
  storage, Hobby limits, and the first-deployment Chromium limitation.

No unrelated upstream lint or type cleanup is included.

## Verification

Automated verification:

- Backend tests: `cd backend && poetry run pytest`.
- Backend types: `cd backend && poetry run pyright`; no new warnings in changed
  files.
- Frontend tests: `cd frontend && pnpm test --runInBand`.
- Frontend lint on changed files, plus the documented full baseline.
- Frontend production build: `cd frontend && pnpm build`.
- JSON/schema validation for `vercel.json`.

Deployment verification:

- GitHub repository is public and contains no secrets.
- Vercel builds both services from the GitHub branch.
- The frontend loads on the Vercel preview URL.
- `/backend/api/capabilities` returns successfully.
- `/backend/generate-code` accepts a WebSocket connection.
- Missing-key behavior points to Settings.
- After the user enters a provider key in Chrome, one real screenshot-to-code
  generation completes and renders generated code.

Successful builds, a deployed URL, WebSocket connectivity, and a real provider
generation are reported as separate evidence layers.

## Availability and Stop Conditions

Vercel Services and native WebSockets are beta capabilities. If the user's
Hobby account does not expose the Services framework, or if Python WebSockets
cannot be enabled for the project, stop before changing architecture. Report
the exact Vercel limitation and request approval for the fallback: two Vercel
projects from the same GitHub repository, with the frontend configured to call
the backend deployment domain.

Stop and ask the user to enter the provider key themselves when live generation
requires it. Never request the key in chat or extract it from browser storage.
