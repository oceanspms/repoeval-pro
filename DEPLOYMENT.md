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

For Vercel or Netlify, do not edit `src/frontend/env.json` manually. Set these
provider environment variables instead:

- `VITE_BACKEND_CANISTER_ID`: required, the deployed backend canister ID.
- `VITE_BACKEND_HOST`: optional, defaults to `https://icp-api.io`.
- `VITE_PROJECT_ID`: optional, defaults to `repoeval-pro`.
- `VITE_II_DERIVATION_ORIGIN`: optional.

Hosted builds run `scripts/write-frontend-env.mjs`, which writes the runtime
`env.json` before the frontend build.

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

## Free Vercel or Netlify Frontend Hosting

Vercel and Netlify can host the React frontend for free-tier web access. They do
not deploy the Motoko backend canister. Deploy the backend to IC first, then
point the hosted frontend at that backend canister.

Recommended order:

1. Deploy the backend canister:

```powershell
corepack pnpm deploy:ic
```

2. Copy the backend canister ID printed by the deploy script.

3. In Vercel or Netlify project settings, add:

```text
VITE_BACKEND_CANISTER_ID=<backend-canister-id>
VITE_BACKEND_HOST=https://icp-api.io
```

4. Connect the GitHub repository and deploy from `main`.

The checked-in provider configs are:

- `vercel.json`
  - install command: `corepack pnpm install --prefer-offline`
  - build command: `node scripts/write-frontend-env.mjs && corepack pnpm --dir src/frontend build`
  - output directory: `src/frontend/dist`
  - SPA rewrite: all routes serve `/index.html`
- `netlify.toml`
  - build command: `node scripts/write-frontend-env.mjs && corepack pnpm --dir src/frontend build`
  - publish directory: `src/frontend/dist`
  - SPA redirect: `/*` to `/index.html` with status `200`

Local hosted-frontend build simulation:

```powershell
$env:VITE_BACKEND_CANISTER_ID="<backend-canister-id>"
$env:VITE_BACKEND_HOST="https://icp-api.io"
corepack pnpm frontend:build:hosted
corepack pnpm qa:deployment:strict
```

After this simulation, restore the committed placeholder env if needed:

```powershell
git checkout -- src/frontend/env.json
```

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
