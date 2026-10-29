# Implementation Log

Running record of [PLAN.md](PLAN.md) as it gets built. One section per phase, written
when the phase lands. [CLAUDE.MD](CLAUDE.MD) stays the spec; this file is the history.

| Phase | Status |
| --- | --- |
| 1 — Decouple Category from Saldo | **Done** |
| 2 — Foundations | **Done** |
| 3 — Settings CRUD | Not started |
| 4 — Monthly transactions view | Not started |
| 5 — Transaction create / edit / duplicate / delete | Not started |
| 6 — Budget planning | Not started |
| 7 — Polish and documentation | Not started |

---

## Phase 1 — Decouple Category from Saldo

Categories are no longer children of a saldo. A transaction still carries both a
`saldoId` and a `categoryId`, but the two are now independent tags: any category
may pair with any saldo. This reverses a rule the data layer previously enforced
on write.

### Changes

**[src/types/index.ts](src/types/index.ts)**

- `Category` lost its `saldoId` field; it is now `{id, name, archived}`.
- `UpdateCategoryInput` narrowed to `Partial<Pick<Category, "name">>`.
- `CreateCategoryInput` needed no edit — it is derived (`Omit<Category, "id" | "archived">`)
  and collapsed to `{name}` on its own.

**[src/database/entities.ts](src/database/entities.ts)** — three additions.
`Category` is now *exactly* the pre-existing `NamedEntity` shape, so `getEntity`,
`listEntities` and `setArchived` already served it unchanged; only create and
update were missing a generic.

- `createNamedEntity(collection, input, label)` — validates and trims the name,
  writes `archived: false` explicitly (a `where("archived", "==", false)` query
  silently skips documents missing the field).
- `updateNamedEntity(collection, id, input, label)` — the name-only counterpart
  to `updateBalanceEntity`. No `runTransaction`: renaming moves no balances.
- `assertActive(collection, id, label)` — the exists-and-not-archived guard,
  returning the problem as a message or `null`. Generalized from the private
  `assertActiveSaldo` that used to live in the categories actions, because
  Phase 6's budget actions need this same check against saldos **and**
  categories. One parameterized helper instead of two near-copies.

**[src/database/categories.actions.ts](src/database/categories.actions.ts)** —
cut from 146 lines to 56, now as thin as
[accounts.actions.ts](src/database/accounts.actions.ts).

- `createCategory` / `updateCategory` delegate to the new named-entity helpers.
  The hand-rolled validation, the parent-saldo existence check, and the `Saldo`
  import are all gone.
- **`listCategoriesBySaldo` deleted.** It has no meaning once categories aren't
  scoped to a saldo, and the budget rollup it was written for no longer wants it.
- `assertActiveSaldo` deleted (moved and generalized, above).
- `getCategory`, `listCategories`, `archiveCategory`, `unarchiveCategory`
  unchanged.

**[src/database/transactions.actions.ts](src/database/transactions.actions.ts)** —
the cross-check at the end of `checkTargets` is gone: the second
`withId<Category>` lookup, the `category.saldoId !== txn.saldoId` comparison, and
its error message. The function keeps its existence + archived loop over
account / saldo / category and then returns `null`. Nothing else in the file moved —
the balance posting, delta accumulation and read-phase/write-phase shape are
untouched. The `Category` type import stays; it is still used in the loop's
union cast.

**[CLAUDE.MD](CLAUDE.MD)** — two edits, since the doc is the spec:

- The convention bullet "Categories belong to a saldo via `saldoId`, and a
  transaction's category must belong to its saldo" is replaced by the new rule
  (independent tags, each validated only for existence and active status).
- The `entities.ts` row of the file table now describes both shapes it holds
  (named vs. balance entities) and `assertActive`.

### How Phase 1 was verified

```text
npx tsc --noEmit    clean
npx biome check     clean on every file touched
npm run build       compiled, TypeScript passed, 4 static pages generated
```

`grep` confirms no stale references to `listCategoriesBySaldo` or
`assertActiveSaldo` anywhere in `src/`, and every remaining `saldoId` in the
codebase belongs to `Transaction`, where it is still correct.

The *functional* checks from PLAN.md's verification section — creating a category
with only a name, and posting two transactions that pair the same category with
different saldos — have **not** been run yet. They need either a UI (Phase 3) or a
script runner, and nothing currently executes a `"use server"` module outside
Next. See the open item below.

### Dead-data cleanup — nothing to clean

PLAN.md assumed existing category documents would still carry an orphaned
`saldoId` needing a `FieldValue.delete()` pass. They don't: **the Firestore
database is empty.** Inspected every collection directly with the Admin SDK:

```text
accounts: 0    saldos: 0    categories: 0    transactions: 0    budgets: 0
```

CLAUDE.MD's "verified end-to-end against real Firestore" evidently ran against
test data that was removed afterwards. So no migration is needed, and Phase 1's
model change carries no data risk at all. The throwaway migration and inspection
scripts were deleted after running; nothing to keep.

A side finding worth having: a plain `.mjs` script **at the project root** can
talk to real Firestore with no extra tooling — Node resolves `firebase-admin` by
walking up from the script's own directory, so the scratchpad won't work but the
project root will. That covers direct-Firestore checks for free.

### Left open after Phase 1

- **The data layer still can't be exercised outside the app.** The `.mjs` trick
  above reaches Firestore directly, but not through the `"use server"` action
  modules — those need TypeScript and the `@/*` path alias. Adding `tsx` as a dev
  dependency would make them runnable from a scratch script and let each
  remaining phase be checked before its UI exists. Not in PLAN.md — flagged as a
  choice, not done.
- **The database being empty means Phase 3 is the first usable screen.** There is
  no seed data to render, so the settings CRUD has to come before the monthly
  view can show anything — which is the order PLAN.md already has.

---

## Phase 2 — Foundations

The app shell, a design system, and the three support layers every later phase
builds on. No features: the three feature routes exist so navigation resolves,
but each renders a placeholder naming the phase that fills it in.

### Design system — [src/app/globals.css](src/app/globals.css)

Extended the existing `:root` / `prefers-color-scheme` pair rather than replacing
it, so the dark-mode scaffolding that was already there keeps working. Added:

- **Surfaces** — `--surface`, `--surface-raised`, `--border`, `--border-strong`,
  `--muted`.
- **Accent** — `--accent`, `--accent-soft`, `--on-accent`.
- **Money tone** — `--positive`, `--negative`, `--warning`. The warning token is
  the "close to the limit" band Phase 6's budget bars need.
- **Scale** — `--space-1` … `--space-6`, `--radius`, `--radius-sm`,
  `--content-width`.
- **Base control styles** for `input` / `select` / `textarea`, a shared
  `:focus-visible` ring, and an `[aria-invalid="true"]` border so an invalid
  field looks invalid without each form restating it.
- `font-variant-numeric: tabular-nums` on money. Figures in a column have to
  align on the decimal point, or comparing a budget to its actual means counting
  digits.

Every token is defined in **both** the light and dark block.

### Pure helpers — `src/lib/`

**[src/lib/month.ts](src/lib/month.ts)** — `isMonth`, `currentMonth`, `today`,
`resolveMonth`, `shiftMonth`, `monthBounds`, `formatMonthLabel`.

Two time bases, deliberately:

- "What month is it *now*" reads **local** date parts. At 22:00 on 31 October in
  Brazil (UTC−3) the UTC date is already 1 November, so `toISOString()` would
  drop the user into the wrong month.
- Arithmetic on an already-known month pins to **UTC** via `Date.UTC`, where no
  timezone or DST shift can roll a boundary over. `monthBounds` gets the last day
  from day 0 of the following month, which handles February and leap years for
  free.

Two additions beyond PLAN.md's four functions: `resolveMonth` (every page needs
to coerce an untrusted `?month=` value, and a hand-edited URL should fall back,
not error) and `today` (Phase 5's duplicate-with-today's-date, kept here so the
local-timezone reasoning lives in one file).

**[src/lib/money.ts](src/lib/money.ts)** — `formatCurrency` and `parseAmount`.
Rounding delegates to `round2` from
[src/database/validators.ts](src/database/validators.ts); there stays one
definition of "money has two decimal places". `parseAmount` returns `NaN` rather
than `0` for unparseable input, so the data layer's `finiteNumber` validator
rejects it and the field gets a real message — silently saving a R$0 transaction
would be worse than refusing it. It also accepts a pasted pt-BR `"1.234,56"`,
where a comma means the dots are thousands separators.

### Form plumbing — [src/app/_actions/form-state.ts](src/app/_actions/form-state.ts)

`FormState`, `IDLE_FORM_STATE`, `formValues(formData)` and `fromResult(result,
submitted)`. Not a `"use server"` module on purpose — it exports a type and sync
helpers, which a server-action module may not do. The adapters added in Phase 3
carry the directive; this holds the shape they all return.

No validation here. `fieldErrors` already arrives complete from the actions
(every invalid field at once, by design), so this is purely shape translation.
`fromResult` echoes the submitted values back on failure so a rejected form
re-renders with the user's input intact, and drops them on success so the form
resets.

### Components — `src/components/`

| Component | Kind | Notes |
| --- | --- | --- |
| `Field` | server | Label + control + error/hint, with `${name}-error` / `${name}-hint` ids. The caller owns the input: wiring it from here would mean cloning children, which breaks the moment a field holds a radio group or a paired input. |
| `SubmitButton` | client | `useFormStatus` pending state. Separate component because the hook only reports from a child of the `<form>`, never from whatever renders the form. |
| `ConfirmSubmit` | client | `window.confirm` then `preventDefault` on cancel — for transaction delete and archive. |
| `Money` | server | `formatCurrency` plus a tone. `signed` colours by sign for balances and nets; `plain` stays foreground, because painting every expense red makes the whole ledger red. Optional `secondary` renders `totalAmount` beneath a real figure. |
| `MonthNav` | **server** | Prev / next / "mês atual". |
| `NavLink` | client | Top nav with `aria-current="page"`; prefix-matched so `/settings/accounts` still highlights Configurações. |
| `Placeholder` | server | Temporary — marks a route whose content lands later. Every use is deleted by the phase it names. |

Two deliberate departures from PLAN.md:

- **`MonthNav` is a Server Component**, not the sketched client component driving
  `useRouter`. All three targets are known at render time, so plain `<Link>`s
  give prefetching and working middle-click and ship no JavaScript.
- **It takes a `params` prop** to carry other query parameters across a month
  change. Without that, Phase 4's filters would silently reset every time the
  user stepped to the next month.

Shared button styling lives in one `controls.module.css` used by both button
components; page furniture (title row, section block, error banner, card grid)
lives in `src/app/pages.module.css` so the Phase 3-6 pages don't each reinvent a
header.

### Shell and routes

- **[src/app/layout.tsx](src/app/layout.tsx)** — real metadata, `lang="pt-BR"`,
  and a persistent header: brand + Transações / Orçamento / Configurações. Kept
  the existing Geist font setup and wired `--font-geist-sans` into `body`, which
  the boilerplate declared but never applied.
- **[src/app/page.tsx](src/app/page.tsx)** — now just
  `redirect(/transactions?month=<current>)`. Marked `force-dynamic`: it reads the
  clock, and a prerendered redirect would pin the app to whatever month it was
  built in.
- `src/app/page.module.css` **deleted** — 142 lines of create-next-app landing
  styles with nothing left importing them.
- **Stub routes** at `/transactions`, `/budget`, `/settings`, each awaiting
  `searchParams` (a Promise in Next 16) and resolving `?month=`. The settings
  sub-routes are not stubbed; nav points at `/settings` only until Phase 3.

### Tooling — [biome.json](biome.json)

Added an `overrides` entry turning off `noDefaultExport` and
`useComponentExportOnlyModules` for `src/app/**`. Next *requires* a default
export from every page and layout, and requires `metadata` / `dynamic` to be
exported from the same module — so those two rules fire on correct code, and
would have fired once per page for the rest of the project.

Also fixed a pre-existing unsorted-import error in
[src/database/firebase.config.js](src/database/firebase.config.js), the only
lint error in `src/`.

### How Phase 2 was verified

```text
npx tsc --noEmit         clean
npx biome check src/     clean — only 4 pre-existing style warnings remain
                         (noEnum + useNamingConvention on TransactionType,
                         noDefaultExport on db.ts), all in untouched code
npm run build            compiled; routes ƒ / , ƒ /budget, ○ /settings, ƒ /transactions
```

`month.ts` was unit-checked directly with `node --experimental-strip-types` —
**16 cases, all passing**: year rollover in both directions (`2026-01` − 1 →
`2025-12`, `2026-12` + 1 → `2027-01`), multi-month shifts, 31/30/28/29-day month
bounds including leap February 2028, the pt-BR capitalized label, and rejection
of `2026-13` / `2026-00` / a full date.

Live smoke test against `npm run dev`:

| Check | Result |
| --- | --- |
| `GET /` | `307 → /transactions?month=2026-10` (the real current month) |
| `?month=2026-03` | renders "Março de 2026" |
| `?month=not-a-month` | falls back to "Outubro de 2026" instead of erroring |
| December prev/next links | `2026-11` and `2027-01` — rollover correct in the rendered page |
| Nav active state | `aria-current="page"` on Transações only |
| `/budget`, `/settings` | resolve and render their placeholders |

### Left open after Phase 2

- **`money.ts` is not unit-checked.** The `--experimental-strip-types` trick that
  covered `month.ts` can't resolve the `@/*` alias, and `money.ts` imports
  `round2` through it. It passes `tsc` and gets exercised by Phase 3's first real
  form. This is the same gap the `tsx` question from Phase 1 would close.
- **`npm run lint` is still red on four files** — `.claude/settings.local.json`,
  `next.config.ts`, `package.json`, `tsconfig.json` — all 2-space-indented
  against Biome's `indentStyle: "tab"`. None was touched by this work, and
  reformatting the project's config files is a cosmetic repo-wide decision, so
  it is left for the owner to call. Everything under `src/` is clean.
- **`Placeholder` and its three stub bodies are scaffolding**, due for deletion
  in Phases 3, 4 and 6 respectively.
