# Vercel Deployment Task

## Objective

Publish `wyf027/screenshot-to-code` and deploy its Vite frontend plus FastAPI
WebSocket backend to the user's Vercel Hobby account without storing provider
keys outside the browser.

## Current State

- Status: written spec approved; implementation plan drafted; execution pending.
- Branch: `feat/vercel-deployment`.
- Worktree: `.worktrees/vercel-deployment`.
- Upstream base: `d026163f586dfa8c5c10d28c36edd59a9d3b0e88`.
- Fork housekeeping base: `92d251c` (`.worktrees/` ignored).
- GitHub fork: `https://github.com/wyf027/screenshot-to-code` (public).
- Vercel account: `Leno23's projects`, Hobby.
- Approved credential boundary: browser BYOK; no provider key in Vercel env.

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

## Implementation Plan

`docs/superpowers/plans/2026-08-31-vercel-deployment.md`

## Next Action

Commit and push the implementation plan, then obtain the user's execution-mode
choice before editing runtime code.
