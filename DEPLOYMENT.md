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
corepack pnpm qa:toolchain
corepack pnpm qa:deployment
```

If using DFX, `dfx.json` deploys the backend as a custom canister from the existing Mops build output and the frontend as an assets canister from `src/frontend/dist`.

## Independent DFX Deployment

Use the repo-owned deploy scripts instead of Caffeine.

Local validation:

```powershell
corepack pnpm deploy:local
```

Production IC deployment:

```powershell
corepack pnpm deploy:ic
```

Both scripts build the backend, refresh frontend bindings when the Caffeine
binding generator is available, deploy the backend, write `src/frontend/env.json`
with the backend canister ID, build the frontend, deploy frontend assets, and run
strict deployment verification. If `caffeine-bindgen` is unavailable, the scripts
use the committed generated binding files under `src/frontend/src/`.

Run binding generation manually only after backend Candid/API changes:

```powershell
corepack pnpm bindgen
```

Prerequisites:

- `dfx` installed and available on `PATH`.
- `mops` available on `PATH`.
- For `deploy:ic`, a configured DFX identity with cycles.

Check local deployment tooling with:

```powershell
corepack pnpm qa:toolchain
```

From `src/frontend/`:

```powershell
corepack pnpm env:check
corepack pnpm typecheck
corepack pnpm build
corepack pnpm qa:smoke
```

For local UI smoke testing without a deployed backend canister:

```powershell
$env:VITE_USE_MOCK_BACKEND="true"
corepack pnpm dev
```

Mock mode bypasses live actor calls and uses in-memory evaluation/history data. Do not enable it for production builds.

After the frontend and backend build artifacts exist, run this root-level check
to verify the deployment package shape:

```powershell
corepack pnpm qa:deployment
```

Use the strict variant only when `src/frontend/env.json` contains the real
deployed backend host and canister ID:

```powershell
corepack pnpm qa:deployment:strict
```

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
- Verify `dfx.json` with an installed DFX toolchain or adapt it for the chosen hosting platform.
- Replace the remaining Caffeine-specific bindgen/outcall dependencies only after the current deployment path is verified.

## Known Caffeine-Specific Runtime Dependencies

- `caffeine-bindgen` generates the frontend actor binding.
- `caffeineai-http-outcalls` is used by the backend HTTP outcall helper.

These dependencies are not visible branding. `caffeine-bindgen` still owns generated frontend bindings, and `caffeineai-http-outcalls` still owns backend HTTP requests. Removing them should be handled as separate tested migrations.
