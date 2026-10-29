# Implementation Plan — Couple Finance UI & Budget Planning

> Approved 2026-10-29. [CLAUDE.MD](CLAUDE.MD) stays the spec; this file is the execution track — tick phases off here as they land.

## Context

[CLAUDE.MD](CLAUDE.MD) lists four goals. Only the first is done:

| Goal | State |
| --- | --- |
| CRUD all entities in [src/types/index.ts](src/types/index.ts) | **Done** — data layer verified against real Firestore |
| See all monthly transactions | Action exists (`listTransactions`), **no UI** |
| Plan the monthly budget by Saldos and Categories | **Nothing exists** — needs a new entity |
| Duplicate transactions | Action exists (`duplicateTransaction`), **no UI** |

So the work is: **build the entire UI**, and **add the one piece of missing data — budgets**. The app today is still create-next-app boilerplate ([src/app/page.tsx](src/app/page.tsx)); the data layer underneath it is complete and well-factored, and this plan consumes it rather than rewriting it.

One change to the existing model is now also in scope: **categories are no longer children of a saldo**. Saldo and category become two independent ways to tag a transaction. This reverses a rule the current data layer actively enforces, so it is Phase 1 — done before any UI exists to depend on the old shape.

The outcome is a working personal finance app: a month-by-month ledger that respects the split-expense model (total paid vs. real share), per-month budget targets on saldos and on categories independently, and one-click duplication of recurrent transactions.

---

## Decisions (confirmed with the user)

1. **Categories are independent of saldos.** `Category.saldoId` is removed. A transaction still carries both a `saldoId` and a `categoryId`, but any category may pair with any saldo.
2. **Budget model** — a `budgets` collection, one doc per `(month, scope, targetId)` where `scope` is `"saldo"` or `"category"`. Each month is independent; a "copy last month" action seeds a new month. Because the two dimensions are now siblings rather than parent/child, the budget screen is **two flat tables, not a tree**.
3. **Which amount** — `realAmount` drives budget-vs-actual (it's the genuine share owed); `totalAmount` is shown alongside so cash leaving the account stays visible.
4. **Styling** — CSS Modules + CSS custom properties in [src/app/globals.css](src/app/globals.css). No new dependencies.
5. **Scope** — all four features, phased; each phase independently usable.

### Assumptions to confirm during implementation

- **Budgets are expense-only.** A budget row compares planned against the sum of `EXPENSE` transactions. Income appears in a separate monthly summary rather than netted against targets — otherwise a salary deposit would silently "pay for" overspending.
- **Saldo and category budgets are not reconciled.** With the hierarchy gone, the two tables sum over the same transactions along different axes. Both totals are shown, and the plan does not try to make them agree.
- **`categoryId` stays required** on a transaction. Decoupling changes what a category *means*, not whether one is picked.
- **Budgets hard-delete.** Nothing references a budget doc, so they don't need the soft-delete treatment accounts/saldos/categories get.
- **No authentication.** Out of scope here, but flagged below.

---

## Architecture: three new layers

The existing [src/database/](src/database/) layer stays a pure, route-unaware data API. Three thin layers go on top:

| Layer | Location | Why it exists |
| --- | --- | --- |
| **Form adapters** | `src/app/_actions/*.ts` | Existing actions take typed objects (`createTransaction(input)`), but `useActionState` requires `(prevState, formData)`. Adapters parse `FormData`, call the data-layer action, call `revalidatePath`, and return a `FormState`. |
| **Pure helpers** | `src/lib/` | Month arithmetic, money formatting, transaction aggregation — sync, testable, no Firestore. Cannot live in a `"use server"` file. |
| **Components** | `src/components/` | Shared form primitives, tables, month navigation. |

**`revalidatePath` goes in the adapters, not in the data-layer actions.** CLAUDE.MD's open-items note suggests putting it in the mutating actions, but that would make [src/database/](src/database/) depend on route names — the one thing it is currently free of. The adapter layer is the correct seam; update that line in CLAUDE.MD in the final phase.

**Next 16 note:** `params` and `searchParams` are Promises in every page and layout. Every page below must `await props.searchParams` before reading `month`.

---

## Phase 1 — Decouple Category from Saldo

Pure data-layer refactor, no UI. Doing it first means nothing downstream is ever written against the old shape.

### What changes

**[src/types/index.ts](src/types/index.ts)**

```ts
export interface Category {
  id: string;
  name: string;
  archived: boolean;        // saldoId removed
}
export type CreateCategoryInput = Omit<Category, "id" | "archived">;   // -> { name }
export type UpdateCategoryInput = Partial<Pick<Category, "name">>;
```

`Transaction` is unchanged — it keeps `saldoId` and `categoryId`, now independent.

**[src/database/entities.ts](src/database/entities.ts)** — `Category` is now *exactly* the existing `NamedEntity` (id + name + archived). `getEntity`, `listEntities` and `setArchived` already serve it unchanged. Add the two missing generics so the categories actions can become as thin as [accounts.actions.ts](src/database/accounts.actions.ts):

- `createNamedEntity(collection, input, label)` — validate `nonEmptyString(name)`, trim, write `archived: false` (mandatory — a `where("archived","==",false)` query skips docs missing the field).
- `updateNamedEntity(collection, id, input, label)` — the name-only subset of `updateBalanceEntity`.
- `assertActive(collection, id, label)` — a generic replacement for the private `assertActiveSaldo` currently in [categories.actions.ts:28](src/database/categories.actions.ts#L28). Categories no longer need it, but Phase 5's budget actions need exactly this check against *both* saldos and categories, so it belongs here as one parameterized helper rather than two.

**[src/database/categories.actions.ts](src/database/categories.actions.ts)** — shrinks substantially:

- Delete `assertActiveSaldo` (moved and generalized above).
- `createCategory` → delegate to `createNamedEntity`. The hand-rolled validation, the saldo existence check, and the `Saldo` import all go.
- `updateCategory` → delegate to `updateNamedEntity`. The `saldoId` branch and its re-check go.
- **Delete `listCategoriesBySaldo`** ([categories.actions.ts:80](src/database/categories.actions.ts#L80)) outright — it has no meaning once categories aren't scoped to a saldo, and the budget rollup it was written for no longer wants it.
- `getCategory`, `listCategories`, `archiveCategory`, `unarchiveCategory` stay as-is.

**[src/database/transactions.actions.ts](src/database/transactions.actions.ts)** — remove the cross-check in `checkTargets` ([lines 147-154](src/database/transactions.actions.ts#L147-L154)): the `withId<Category>` lookup, the `category.saldoId !== txn.saldoId` comparison, and its error message. The function keeps its existence + archived loop over account/saldo/category and then simply returns `null`. The `Category` type import stays (still used in the loop's union cast); drop it only if TypeScript says it's now unused.

**Firestore migration** — existing category docs still carry a `saldoId` field. Reads ignore it, so nothing breaks, but leave the data clean: a one-off pass with `FieldValue.delete()` over `collection("categories")`. Either a throwaway Admin-SDK script or doing it by hand in the Firestore console — there are only a handful of docs. Not blocking; note it and move on.

**[CLAUDE.MD](CLAUDE.MD)** — delete the convention bullet "**Categories belong to a saldo** via `saldoId`, and a transaction's category must belong to its saldo — enforced on write" and replace it with the new rule: saldo and category are independent tags on a transaction, each validated only for existence and active status.

### What this simplifies downstream

Three things the earlier design needed are now gone before they were ever built: the client-side saldo→category select filtering in the transaction form, the grouped-by-saldo categories settings page, and the whole saldo/category reconciliation in the budget rollup.

**Done when:** `npx tsc --noEmit` is clean, a transaction can be created pairing any saldo with any category, and `createCategory({name})` works with no saldo in sight.

---

## Phase 2 — Foundations

**Goal:** an app shell with navigation and a design system; no features yet.

1. **[src/app/globals.css](src/app/globals.css)** — extend the existing `:root` / `prefers-color-scheme` blocks with tokens: `--surface`, `--surface-raised`, `--border`, `--muted`, `--accent`, `--positive`, `--negative`, `--warning`, a spacing scale (`--space-1`…`--space-6`), and a tabular-number treatment for money columns. The dark-mode scaffolding is already there — add new tokens to both blocks.
2. **[src/app/layout.tsx](src/app/layout.tsx)** — real `metadata` (title "Couple Finance", `lang="pt-BR"`) and a persistent nav: Transações · Orçamento · Configurações. Keep the existing Geist font setup.
3. **[src/app/page.tsx](src/app/page.tsx)** — replace the boilerplate with `redirect(\`/transactions?month=${currentMonth()}\`)`. Strip the now-unused rules from [src/app/page.module.css](src/app/page.module.css).
4. **`src/lib/money.ts`** — `formatBRL(value)` via `Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL"})`, and `parseAmount(formValue)` for `FormData` → number. Reuse `round2` from [src/database/validators.ts](src/database/validators.ts) rather than re-rounding.
5. **`src/lib/month.ts`** — `currentMonth(): "YYYY-MM"`, `shiftMonth(month, delta)`, `monthBounds(month): {from, to}` (last day via `Date.UTC(y, m, 0)`), `formatMonthLabel(month)` in pt-BR. `monthBounds` is what feeds `listTransactions({from, to})`.
6. **`src/app/_actions/form-state.ts`** — a `FormState` type (`{status: "idle"|"ok"|"error"; error?: string; fieldErrors?: Record<string,string>; values?: Record<string,string>}`) and `fromResult(result, submitted)` mapping an `ActionResult<T>` onto it. `fieldErrors` already arrives complete from the data layer ([src/database/result.ts](src/database/result.ts)) — this is shape translation, not new validation. **Echo submitted values back** so a failed form re-renders with the user's input intact.
7. **`src/components/`** primitives — `Field` (label + input + error), `SubmitButton` (client, `useFormStatus` pending state), `ConfirmSubmit` (client, `window.confirm` before a destructive submit), `MonthNav` (client, prev/next/today links rewriting `?month=`), `Money` (server, `formatBRL` + positive/negative token).

**Done when:** `npm run dev` serves a styled shell, `/` redirects to the current month, nav links resolve (pages may be stubs).

---

## Phase 3 — Settings CRUD (accounts, saldos, categories)

Before the transaction UI deliberately: you cannot create a transaction until an account, a saldo, and a category exist.

**Routes:** `src/app/settings/accounts/page.tsx`, `src/app/settings/saldos/page.tsx`, `src/app/settings/categories/page.tsx`.

Each is a Server Component that calls its list action directly (`listAccounts()`, `listSaldos()`, `listCategories()` — a `"use server"` function called from a Server Component is just an async call) and renders a table plus an inline create form.

**Adapters:** `src/app/_actions/accounts.ts`, `saldos.ts`, `categories.ts` — each `"use server"`, exporting `createXForm`, `updateXForm`, `archiveXForm`, `unarchiveXForm` in `(prevState, formData)` shape, calling through to the data layer and then `revalidatePath`ing the settings route.

**Two shared components, mirroring the two shapes in the data layer:**

- `BalanceEntityManager` — accounts and saldos. They are structurally identical (`createBalanceEntity` in [entities.ts](src/database/entities.ts) already exploits this), so parameterize by label + action set and build the form **once**. Columns: `initialAmount`, `totalBalance`, `realBalance`. Editing `initialAmount` shifts both balances by the same delta — already handled by `updateBalanceEntity`.
- `NamedEntityManager` — categories. After Phase 1 this is a flat name-only list: no saldo column, no saldo `<select>`, no grouping. Backed by the new `createNamedEntity` / `updateNamedEntity`.

Both: archive/unarchive only, never a delete button. Archived rows render dimmed behind a "show archived" toggle that sets `includeArchived: true`.

**Done when:** you can create, rename, archive and restore accounts, saldos and categories from the browser, and balances read back correctly.

---

## Phase 4 — Monthly transactions view

**Route:** `src/app/transactions/page.tsx` — reads `?month=YYYY-MM` (default `currentMonth()`), calls `monthBounds(month)` → `listTransactions({from, to})`, and in parallel `listAccounts({includeArchived:true})`, `listSaldos({includeArchived:true})`, `listCategories({includeArchived:true})` for name lookup. `Promise.all`.

**`src/lib/rollup.ts`** (pure, no Firestore):

- `indexById(items)` → `Map<string, T>` for the name lookups.
- `sumBy(transactions, keyFn)` → `Map<key, {total: number, real: number}>`, expense-signed by the same rule as [transactions.actions.ts:40](src/database/transactions.actions.ts#L40). Don't import from a `"use server"` file — either restate the sign rule here or export a shared `signed()` from a non-action module and have both use it.
- `monthSummary(transactions)` → `{expenses: {total, real}, income: {total, real}, net: {total, real}}`.

**`src/components/TransactionsTable.tsx`** (server) — columns: date, description, account, **saldo**, **category** (two separate columns now that neither nests inside the other), type, total, real. Resolve ids through the lookup maps; an id with no matching doc renders a muted "(removido)" rather than crashing. Sort already arrives `date desc` from the action.

**Page composition:** `MonthNav` → summary cards (expenses / income / net, real with total beneath) → filter bar (independent account, saldo and category `<select>`s writing to the query string, passed into `listTransactions`'s existing optional filters) → table.

**Done when:** a month of real transactions renders with correct names and totals, month navigation works, and each filter narrows the list independently.

---

## Phase 5 — Transaction create / edit / duplicate / delete

**`src/components/TransactionForm.tsx`** (client, `useActionState`) — shared by create and edit. Props: the action, initial `FormState`, and the account/saldo/category lists.

- Fields: `date` (`type="date"`), `description`, `type` (expense/income radio), `totalAmount` and `realAmount` (`type="number" step="0.01" min="0"`), `accountId`, `saldoId`, `categoryId`.
- **The saldo and category selects are independent** — full lists, no cross-filtering, no coupled client state. (This is the chunk of complexity Phase 1 removes.)
- **`realAmount` convenience.** Default `realAmount` to `totalAmount` as you type until the user edits it, plus a "dividir 50/50" button that halves it. This is the core ergonomic of the whole app — the R$90 bill where you really paid R$45.
- Surface `state.fieldErrors[field]` under each input and `state.error` at the top.
- **Archived targets on edit.** New-transaction selects use the default active-only lists. The **edit** form must load with `includeArchived: true` and label archived options "(arquivado)" — an existing transaction stays editable after its account is archived ([transactions.actions.ts:119-124](src/database/transactions.actions.ts#L119-L124)), and an active-only select would silently drop the current value.

**Routes:**

- `src/app/transactions/new/page.tsx` — empty form. Accepts optional `?from=<transactionId>`: calls `getTransaction(id)` and **prefills every field with the date reset to today**. This is the primary duplication path — nothing is written until you submit, so you can adjust this month's variable amount first.
- `src/app/transactions/[id]/edit/page.tsx` — `await params`, `getTransaction(id)`, `notFound()` if the result isn't `ok`.

**Adapter:** `src/app/_actions/transactions.ts` —

- `createTransactionForm(prev, formData)` → `createTransaction(...)` → on success `redirect` to `/transactions?month=<the transaction's month>`.
- `updateTransactionForm(id, prev, formData)` — bind `id` with `.bind(null, id)`.
- `deleteTransactionForm(id)` — behind a `ConfirmSubmit`.
- `quickDuplicateForm(id)` → `duplicateTransaction(id, {date: today})` for a row-level one-click exact copy, alongside the `?from=` prefill route.
- Transaction writes move account **and** saldo balances, which surface on the settings and budget pages too — revalidate broadly here: `revalidatePath("/", "layout")`.

**Done when:** the R$90/R$45 split bill can be entered, edited, duplicated into the next month and deleted, with account and saldo balances landing exactly where CLAUDE.MD's worked example says (account 910/955, saldo −90/−45) and unwinding on delete.

---

## Phase 6 — Budget planning by saldo and by category

### 6a. Data layer

**[src/types/index.ts](src/types/index.ts)** — add:

```ts
export type BudgetScope = "saldo" | "category";

export interface Budget {
  id: string;
  month: string;          // ISO "YYYY-MM"
  scope: BudgetScope;     // which dimension this target measures
  targetId: string;       // a saldoId or a categoryId, per `scope`
  plannedAmount: number;
}
export type SetBudgetInput = Omit<Budget, "id">;
```

A flat `scope` + `targetId` pair, rather than nullable `saldoId`/`categoryId` columns: with the hierarchy gone the two dimensions are siblings, and one discriminated shape says that plainly.

**[src/database/collections.ts](src/database/collections.ts)** — add `budgets: "budgets"` to `COLLECTIONS`.

**[src/database/validators.ts](src/database/validators.ts)** — add `isoMonth(value)` next to the existing `isoDate`, same hand-rolled style (`/^\d{4}-(0[1-9]|1[0-2])$/`).

**`src/database/budgets.actions.ts`** (`"use server"`, matching the existing files):

- `setBudget(input)` — **upsert on a deterministic doc id**: `` `${month}__${scope}__${targetId}` ``. A target is then unique by construction — no duplicate-detection query, no transaction, idempotent re-submits. Validate with `isoMonth`, `enumValue(scope, ["saldo","category"])`, `nonEmptyString(targetId)`, `nonNegativeNumber(plannedAmount)`; `round2` the amount; then `assertActive(scope === "saldo" ? COLLECTIONS.saldos : COLLECTIONS.categories, targetId, label)` using the Phase 1 helper. One call covers both scopes — this is why `assertActiveSaldo` was generalized.
- `listBudgets(month)` — a single `where("month", "==", month)`; scope filtering happens in memory, consistent with the existing no-composite-index convention.
- `deleteBudget(id)` — hard delete.
- `copyBudgets(fromMonth, toMonth)` — the recurrent-planning convenience: read `fromMonth` and write each doc into `toMonth` via `db.batch()`. Skip rather than overwrite targets already present in `toMonth`, and skip any whose saldo or category has since been archived. Return the count copied.

All of it returns `ActionResult<T>` and never throws, per the existing convention.

### 6b. Rollup

Extend `src/lib/rollup.ts` with **one** function used twice, instead of the tree the coupled model would have needed:

```ts
buildBudgetRows({ scope, entities, budgets, transactions }) => BudgetRow[]
```

where each row carries:

```ts
entity         // the saldo or category
planned        // from budgets, or null when unset
actualReal     // expense-only sum of realAmount for this target
actualTotal    // expense-only sum of totalAmount
remaining      // planned - actualReal, when planned is set
```

Call it once with `scope: "saldo"` keyed on `txn.saldoId`, once with `scope: "category"` keyed on `txn.categoryId`. Include a trailing "sem orçamento" row aggregating targets that have spend but no planned figure.

### 6c. UI

**Route:** `src/app/budget/page.tsx` — reads `?month=`, then `Promise.all([listBudgets(month), listTransactions(monthBounds(month)), listSaldos(), listCategories()])` → two `buildBudgetRows` calls.

Two sibling sections on one page — **Por Saldo** and **Por Categoria** — each a flat editable table: planned / actual-real / remaining, a proportional bar coloured by `--positive` / `--warning` / `--negative`, and `totalAmount` on a muted secondary line. Each row's planned figure is an inline number input submitting `setBudgetForm` on blur or via a save button — **no separate "create budget" screen; the table is the editor**. Each section footers its own planned and actual totals; since both sum the same transactions along different axes, label them per-section rather than implying one reconciles against the other. Header carries `MonthNav` and a "Copiar plano de \<previous month\>" button wired to `copyBudgets`.

**Adapter:** `src/app/_actions/budgets.ts` — `setBudgetForm`, `deleteBudgetForm`, `copyBudgetsForm`; `revalidatePath("/budget")`.

**Done when:** you can set a target on the "Essentials" saldo and, independently, on the "Groceries" category, see the month's real spend against each, and seed the next month from the current one in one click.

---

## Phase 7 — Polish and documentation

1. **[CLAUDE.MD](CLAUDE.MD)** — the doc is the project's spec, so it needs real edits here:
   - Tick the three remaining feature boxes.
   - Confirm the Phase 1 convention rewrite landed (categories independent of saldos; no `saldoId` on `Category`).
   - Add `budgets` to the collections list and `budgets.actions.ts` to the file table; document `createNamedEntity` / `updateNamedEntity` / `assertActive` in the `entities.ts` row.
   - Document the `src/app/_actions` adapter layer and `src/lib`.
   - Replace the "`revalidatePath` in the mutating actions" open item with the decision actually taken (adapters own revalidation).
2. **Empty and error states** — every list page needs a first-run empty state pointing at what must be created first (no accounts → link to settings). A `!result.ok` from any action renders its `error` string, never a blank page.
3. **Remove the unused `firebase` dependency** from [package.json](package.json). Only `firebase-admin` is used ([db.ts](src/database/db.ts), [firebase.config.js](src/database/firebase.config.js)); the client package is dead weight and CLAUDE.MD explicitly forbids it.
4. **`npm run lint`** — Biome with `style: "warn"` and the Next/React domains on. Expect `"use client"` placement fixes on the new components; finish with `npm run format` (tabs, per [biome.json](biome.json)).

---

## Flagged for the user — not planned here

- **There is no authentication.** Every Server Action is reachable by anyone who can reach the app, and the Admin SDK bypasses Firestore security rules by design. Fine on `localhost`; not fine deployed. If this goes anywhere public it needs an auth gate in front of the actions before the first deploy — say the word and I'll plan it.
- **`serviceAccountKey.json` is correctly gitignored** ([.gitignore](.gitignore)) and not tracked. Deployment will need it as an env var instead of a file, since [firebase.config.js](src/database/firebase.config.js) imports it from disk.
- **No test framework is installed.** Verification below is manual. Adding Vitest over `src/lib/rollup.ts` and `src/lib/month.ts` (pure functions, no Firestore) would be cheap and high-value — out of scope unless you want it.

---

## Verification

Static, after each phase:

```bash
npx tsc --noEmit      # Phase 1's type changes and Next 16's Promise params both surface here
npm run lint
npm run build
```

End-to-end against real Firestore via `npm run dev`:

1. **Decoupling (Phase 1)** — create a category with only a name. Then create one transaction on saldo "Essentials" / category "Groceries" and another on saldo "Leisure" / the *same* "Groceries" category. Both must succeed — under the old rule the second was rejected.
2. **Settings** — create account "Checking" with `initialAmount: 1000`, saldo "Essentials" with `0`, and categories "Housing", "Health", "Groceries" as a flat list.
3. **The split bill (the canonical case from CLAUDE.MD)** — new transaction: expense, R$90 total, R$45 real, Checking / Essentials / Housing. Expect **Checking 910 / 955** and **Essentials −90 / −45** on the settings pages. This is the single most important check in the plan.
4. **Monthly view** — it appears under the right month; prev/next navigation moves away and back; the account filter includes it and another account's filter excludes it; the saldo and category filters work independently of each other.
5. **Duplicate** — duplicate it into next month via `?from=`, change the amount before saving, confirm two independent transactions and balances moved twice.
6. **Edit across targets** — reassign it to a second account. The first returns to 1000/1000 and the second absorbs the posting — this exercises the delta-accumulation path in `accumulate`.
7. **Archive mid-history** — archive Checking. The existing transaction must still open and save in the edit form (its account shown "(arquivado)"), while a *new* transaction must refuse that account.
8. **Delete** — delete the transaction; every balance returns to its pre-transaction figure.
9. **Budget** — set the Essentials *saldo* target to 1200 and the Groceries *category* target to 300; spend R$480 real on Groceries; confirm the category row shows over-budget and the saldo row shows its own independent consumption. Then "copy plan from previous month" into the next month, confirm both targets land, and confirm a second run doesn't duplicate them.
