# _archive

Files retired from Mnemo. They are **not part of the app**: excluded from
TypeScript (`tsconfig.json`), ESLint (`eslint.config.mjs`), and nothing in
`src/` imports them. Paths mirror the original location, so to bring one back,
move it to the same path without the `_archive/` prefix.

Delete this folder whenever you're sure you won't need them — git history keeps
everything anyway.

| File | Why archived |
| --- | --- |
| `src/components/error-boundary.tsx` | never imported |
| `src/components/ui/ai-ecosystem.tsx`, `logo-loop.tsx`, `aurora-background.tsx` | old landing effects, removed in the flat redesign |
| `src/components/ui/db-unavailable.tsx`, `src/lib/db-check.ts`, `src/lib/db-health.ts` | unused DB-status helpers |
| `src/lib/theme-utils.ts` | never imported |
| `src/components/landing/flow-diagram.tsx` | exported but never rendered |
| `docs/system-design.md`, `docs/mnemo-overview.md` | overlaps `docs/architecture.md` / `docs/product-vision.md` |
| `docs/browser-extension-plan.md` | planning doc; superseded by `extension/README.md` |
