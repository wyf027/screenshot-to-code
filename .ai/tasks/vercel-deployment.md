# Vercel Deployment Task

## Objective

Publish `wyf027/screenshot-to-code` and deploy its Vite frontend plus FastAPI
WebSocket backend to the user's Vercel Hobby account without storing provider
keys outside the browser.

## Current State

- Status: revised `/backend` mount design approved; implementation in progress.
- Branch: `feat/vercel-deployment`.
- Worktree: `.worktrees/vercel-deployment`.
- Upstream base: `d026163f586dfa8c5c10d28c36edd59a9d3b0e88`.
- Fork housekeeping base: `92d251c` (`.worktrees/` ignored).
- GitHub fork: `https://github.com/wyf027/screenshot-to-code` (public).
- Vercel account: `Leno23's projects`, Hobby.
- Approved credential boundary: browser BYOK; no provider key in Vercel env.
- Approved deployment mount: `/backend`; existing internal routes remain
  unchanged (`/generate-code`, `/api/capabilities`, `/local-assets/*`).

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

## Next Action

Execute Task 1 from the revised implementation plan with a fresh failing test.
