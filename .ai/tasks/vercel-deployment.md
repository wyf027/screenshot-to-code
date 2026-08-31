# Vercel Deployment Task

## Objective

Publish `wyf027/screenshot-to-code` and deploy its Vite frontend plus FastAPI
WebSocket backend to the user's Vercel Hobby account without storing provider
keys outside the browser.

## Current State

- Status: implementation locally verified; independent review and GitHub
  delivery pending.
- Branch: `feat/vercel-deployment`.
- Worktree: `.worktrees/vercel-deployment`.
- Upstream base: `d026163f586dfa8c5c10d28c36edd59a9d3b0e88`.
- Fork housekeeping base: `92d251c` (`.worktrees/` ignored).
- GitHub fork: `https://github.com/wyf027/screenshot-to-code` (public).
- Vercel account: `Leno23's projects`, Hobby.
- Approved credential boundary: browser BYOK; no provider key in Vercel env.
- Approved deployment mount: `/backend`; existing internal routes remain
  unchanged (`/generate-code`, `/api/capabilities`, `/local-assets/*`).
- Vercel production mode: `IS_PROD=true`; custom OpenAI Base URLs disabled.
- Vercel local asset policy: `LOCAL_ASSET_TOOLS_ENABLED=false` until durable
  object storage is implemented.

## Design Source

`docs/superpowers/specs/2026-08-31-vercel-deployment-design.md`

## Baseline Verification

- Backend dependency environment: Python 3.11.15 via Poetry.
- Backend tests: 276 passed in 291.56 seconds.
- Backend Pyright: exit 0, 0 errors, 36 existing warnings.
- Frontend tests: 42 passed, 6 skipped, 8 suites passed, 1 skipped.
- Frontend lint: existing baseline failure, 19 errors and 6 warnings; no task
  changes existed when captured.
- Initial Python 3.14 dependency installation was discarded after
  `pillow-heif 0.18.0` required unavailable `libheif` headers. Python 3.11 uses
  the supported wheel and installs successfully.

## Local Integrated Verification

- Backend tests: 292 passed after review fixes.
- Backend Pyright: exit 0, 0 errors, 36 existing warnings; no new warning in a
  changed file.
- Frontend tests: 49 passed, 6 skipped; 9 suites passed, 1 skipped.
- Frontend production build: exit 0; 1,331 modules transformed. Existing build
  warnings remain for Node `DEP0190` and a minified chunk over 500 kB.
- Changed frontend files lint: exit 0.
- Full frontend lint baseline: unchanged at 19 errors and 6 warnings, all in
  pre-existing files.
- Prefixed FastAPI probe: `/backend/api/capabilities` returned 200 with
  `screenshot_preview=false`; `/backend/` returned 200.
- Chromium probe: unavailable and automatically disabled, as designed for the
  first Vercel deployment.
- Provider secret-pattern scan: no matches.
- Python 3.12 locked environment: 93 packages resolved; 292 tests passed.

## Independent Review

- Review range: `d026163..6d4ec88`.
- Initial verdict: ready with fixes.
- Blocking manifest finding: addressed with `backend/.python-version`, PEP 621
  `[project].dependencies`, and `backend/uv.lock`; the clean Python 3.12 locked
  environment synchronized successfully and passed all 292 backend tests.
- Production-mode finding: addressed by requiring `IS_PROD=true` in Vercel.
- Ephemeral asset finding: addressed by disabling local asset staging,
  `save_assets`, and `extract_assets` on Vercel.
- Lifecycle finding: addressed with context-managed `TestClient` coverage.
- Prefix divergence finding: addressed by deriving the effective prefix from
  ASGI `root_path` instead of a module constant.
- Final review head: `10e3885`.
- Final verdict: ready to merge; no Critical, Important, or Minor findings.

## Boundaries

- Do not implement until the user approves the written spec.
- Preserve upstream behavior outside Vercel routing/runtime compatibility.
- Do not fix unrelated upstream lint or Pyright warnings.
- Do not store, display, log, commit, or inspect provider keys.
- If Vercel Services is unavailable, stop and request approval before using the
  two-project fallback.
- The invalid `/api` router-prefix attempt is preserved in
  `stash@{0}` as a recoverable checkpoint and must not be reapplied.

## Implementation Plan

`docs/superpowers/plans/2026-08-31-vercel-deployment.md`

## Implementation Commits

- `3de0f2a` - mount the existing FastAPI application under `/backend`.
- `ee3f4f8` - build same-origin frontend URLs with `/backend`.
- `2faa000` - define Vercel Services and Vite SPA configuration.

## Next Action

Create and merge the GitHub pull request, then import the repository into
Vercel.

## Vercel Schema Probe

- Services preset detected both `frontend` and `backend` on the Hobby account.
- Initial import schema rejected `services.backend.maxDuration` as unsupported.
- The field was removed; Hobby Fluid Compute retains its default 300-second
  duration.
