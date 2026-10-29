# Implementation Log

Running record of [PLAN.md](PLAN.md) as it gets built. One section per phase, written
when the phase lands. [CLAUDE.MD](CLAUDE.MD) stays the spec; this file is the history.

| Phase | Status |
| --- | --- |
| 1 — Decouple Category from Saldo | **Done** |
| 2 — Foundations | Not started |
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

### Verification

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

### Carried forward

- **The data layer still can't be exercised outside the app.** The `.mjs` trick
  above reaches Firestore directly, but not through the `"use server"` action
  modules — those need TypeScript and the `@/*` path alias. Adding `tsx` as a dev
  dependency would make them runnable from a scratch script and let each
  remaining phase be checked before its UI exists. Not in PLAN.md — flagged as a
  choice, not done.
- **The database being empty means Phase 3 is the first usable screen.** There is
  no seed data to render, so the settings CRUD has to come before the monthly
  view can show anything — which is the order PLAN.md already has.
