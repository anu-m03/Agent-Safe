# Context7 consistency report

This report compares the Agent-Safe codebase against **current documentation** fetched via Context7 MCP for the main libraries in use. It was generated so the system stays consistent with official docs (Next.js, Express, pnpm, viem, Zod).

---

## 1. Next.js 15 (App Router)

**Context7 source:** `/vercel/next.js` — App Router, root layout, env vars.

| Check | Status | Notes |
|-------|--------|--------|
| App directory | ✅ | `apps/web/src/app/` present with `layout.tsx` and pages. |
| Root layout | ✅ | `layout.tsx` has `<html lang="en">`, `<body>`, and `children: React.ReactNode`. |
| File-system routing | ✅ | Routes map to `app/**/page.tsx` (dashboard, defense, governance, etc.). |
| Env vars | ✅ | Server-side use of `process.env` is valid; use `connection()` or dynamic APIs when runtime evaluation is required (see Next.js env docs). |

**Note:** Root layout uses `'use client'` (e.g. for `usePathname`). This is valid; root layout can be a Client Component.

---

## 2. Express 4

**Context7 source:** `/expressjs/express` — middleware, routing, error handling.

| Check | Status | Notes |
|-------|--------|--------|
| `express.json()` | ✅ | Used for JSON body parsing before routes. |
| CORS | ✅ | `app.use(cors())` before routes. |
| Router mounting | ✅ | Routers mounted with `app.use('/api/...', router)`. |
| 404 fallback | ✅ | Catch-all 404 handler added after all routes: `res.status(404).json({ error: 'Route not found' })`. |
| Error-handling middleware | ✅ | 4-parameter handler `(err, req, res, next)` added after 404; logs stack and returns JSON with `message` and `status`. |

**Change made:** A global 404 handler and a central error-handling middleware were added in `apps/backend/src/index.ts` so the app matches Express’s recommended order: routes → 404 → error handler.

---

## 3. pnpm workspaces

**Context7 source:** `/pnpm/pnpm` — workspace config, workspace protocol.

| Check | Status | Notes |
|-------|--------|--------|
| `pnpm-workspace.yaml` | ✅ | Defines `packages: [ "apps/*", "packages/*" ]`. |
| Workspace protocol | ✅ | `@agent-safe/shared` referenced as `"workspace:*"` in backend and web. |
| Root packageManager | ✅ | `package.json` has `"packageManager": "pnpm@9.15.0"`. |

No changes needed.

---

## 4. Viem

**Context7 source:** `/wevm/viem` — public/wallet clients, chain, transport.

| Check | Status | Notes |
|-------|--------|--------|
| Public client | ✅ | `createPublicClient({ chain, transport: http(...) })` used in execution, verifyPayment, kiteChain, provenance. |
| Chain import | ✅ | `import { base } from 'viem/chains'` for Base. |
| Wallet client | ✅ | `createWalletClient` used where needed (kiteChain, provenance). |

No changes needed.

---

## 5. Zod

**Context7 source:** `/colinhacks/zod` — schemas, parse, safeParse.

| Check | Status | Notes |
|-------|--------|--------|
| User input validation | ✅ | Routes use `safeParse` and return 400 with error details on failure (e.g. execution, marketplace, streams). |
| Schema definitions | ✅ | Shared schemas in `packages/shared/src/schemas/` (intents, agent, governance, etc.) use `z.object`, `z.enum`, etc. |
| Throwing parse | ✅ | `.parse()` used only for trusted/validated data (e.g. healthcheck script, rules engine). |

No changes needed.

---

## 6. Turbo (monorepo)

**Context7:** Not queried; config checked against common usage.

| Check | Status | Notes |
|-------|--------|--------|
| `turbo.json` | ✅ | `build` depends on `^build`, outputs `dist/**`, `.next/**`; `dev` persistent; `globalDependencies: [".env"]`. |
| Root scripts | ✅ | `dev`, `build`, `lint`, `test`, `clean` delegate to turbo. |

No changes needed.

---

## Summary

- **Updated for consistency:** Express 4 — added global 404 and central error-handling middleware so the app aligns with Context7/Express docs.
- **Already consistent:** Next.js 15 app structure and layout, pnpm workspaces, viem client usage, Zod validation patterns, Turbo config.

To re-run a consistency pass, use Context7 in Cursor with prompts like: *“use context7 with /vercel/next.js for app router layout requirements”* or *“use context7 with /expressjs/express for error handling middleware”*.
