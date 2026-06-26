# RepoEval Pro Deployment Notes

This repository is currently an ICP/Motoko backend plus a Vite/React frontend. It was generated through Caffeine, but the frontend now creates the backend actor directly from `env.json` and no longer uses Caffeine's frontend identity/actor runtime.

## Current Build Targets

- Backend source: `src/backend/main.mo`
- Backend build output: `src/backend/dist/`
- Frontend source: `src/frontend/`
- Frontend build output: `src/frontend/dist/`
- Generated actor bindings: `src/frontend/src/backend.ts` and `src/frontend/src/declarations/`

## Required Local Tooling

- Node.js with Corepack enabled
- pnpm
- Mops and Motoko compiler
- Linux or WSL for standard `mops` commands on Windows

The current Windows checkout can typecheck/build the frontend. Standard `mops check` reports that Windows is not supported, so backend checks should be run in WSL/Linux for routine deployment work.

## Frontend Environment

The frontend copies `src/frontend/env.json` into `src/frontend/dist/env.json` during `pnpm build`.

Before a production build, replace the placeholder values in `src/frontend/env.json` using `src/frontend/env.example.json` as the template:

```json
{
  "backend_host": "https://icp-api.io",
  "backend_canister_id": "replace-with-backend-canister-id",
  "project_id": "repoeval-pro",
  "ii_derivation_origin": ""
}
```

Do not commit environment values that should remain private.

## Build Checklist

From the repository root:

```powershell
corepack pnpm install --prefer-offline
corepack pnpm bindgen
```

From `src/frontend/`:

```powershell
corepack pnpm typecheck
corepack pnpm build
```

For local UI smoke testing without a deployed backend canister:

```powershell
$env:VITE_USE_MOCK_BACKEND="true"
corepack pnpm dev
```

Mock mode bypasses live actor calls and uses in-memory evaluation/history data. Do not enable it for production builds.

From a Linux/WSL shell for the backend:

```bash
mops install
mops check
mops build
```

## Independent Hosting Status

Ready now:

- Frontend build passes.
- Backend Motoko compiler check and wasm build pass with the cached compiler.
- Generated `src/frontend/dist/` is ignored and should be rebuilt for each deployment.
- Visible Caffeine footer branding has been removed.

Still required before production:

- Replace placeholder `src/frontend/env.json` values with the deployed backend canister ID and host.
- Decide the final deployment path for the frontend assets.
- Add or verify a deployment manifest for the chosen hosting platform.
- Replace the remaining Caffeine-specific bindgen/outcall dependencies only after the current deployment path is verified.

## Known Caffeine-Specific Runtime Dependencies

- `caffeine-bindgen` generates the frontend actor binding.
- `caffeineai-http-outcalls` is used by the backend HTTP outcall helper.

These dependencies are not visible branding. `caffeine-bindgen` still owns generated frontend bindings, and `caffeineai-http-outcalls` still owns backend HTTP requests. Removing them should be handled as separate tested migrations.
