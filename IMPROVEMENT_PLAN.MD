# Improvement Plan — `description` on the entities, plus the gaps the review found

> Written 2026-10-30, after a full review of the codebase against
> [PLAN.md](PLAN.md) (complete) and [CLAUDE.MD](CLAUDE.MD) (the spec).
> [CLAUDE.MD](CLAUDE.MD) stays the spec; this file is the execution track.
> Implement this plan, step by step. Check CLAUDE.MD and IMPROVMENT_IMPLEMENTATION.MD for the current implementation status and adopted conventions. After each step is completed, stop and document what has been done updating this file, CLAUDE.MD and IMPROVMENT_IMPLEMENTATION.md.
> Ask any necessary questions to complete the task.

| Phase | Status |
| --- | --- |
| A — `description` through the data layer | **Done**: see [IMPROVMENT_IMPLEMENTATION.MD](IMPROVMENT_IMPLEMENTATION.MD#phase-a--description-through-the-data-layer) |
| B — `description` in the UI | **Done**: see [IMPROVMENT_IMPLEMENTATION.MD](IMPROVMENT_IMPLEMENTATION.MD#phase-b--description-in-the-ui) |
| C — The four defects (G1–G4) | **Done**: see [IMPROVMENT_IMPLEMENTATION.MD](IMPROVMENT_IMPLEMENTATION.MD#phase-c--the-four-defects) |
| D — Tests over `src/lib` | Not started |
| E — The auth gate, and the deployment key | Not started |

## Context

[PLAN.md](PLAN.md) is done and it holds up. The review found no broken feature:
`npx tsc --noEmit` is clean, `npm run lint` is 0 errors and the 4 warnings
[CLAUDE.MD](CLAUDE.MD) already accounts for, the four goals are all met, and the
layering it describes — `src/database` route-unaware, `src/lib` pure,
`src/app/_actions` the `FormData` seam, `src/components` presentation — is
actually honoured everywhere. The unused `firebase` dependency is gone,
`serviceAccountKey.json` is ignored and untracked.

So this plan is not a rescue. It is one requested feature plus the short list of
real defects the review turned up:

| # | What | Severity |
| --- | --- | --- |
| **Feature** | `description: string` on `Saldo`, `Account` and `Category` | requested |
| **G1** | `/budget` renders an editable planned input on archived rows that can only ever fail to save | bug, user-visible |
| **G2** | Settings writes revalidate one route, but an entity's name and archived state are rendered on *every* screen | bug, stale data |
| **G3** | `copyBudgets` checks a target against one id set that unions saldos *and* categories, ignoring `scope` | latent, wrong shape |
| **G4** | An orphaned budget *plan* vanishes silently, unlike orphaned *spend*, which gets a `(removido)` row | correctness, totals |
| **G5** | `src/lib` carries every money and month rule in the app and has no tests | risk |
| **G6** | No authentication — the one item [CLAUDE.MD](CLAUDE.MD) calls blocking | blocking for deploy |

### Decisions (confirmed with the user)

1. **`description` is optional to fill, always stored.** The type is
   `description: string`, as asked. The input may be left blank and is written
   as `""` — never `undefined`, for exactly the reason `archived: false` is
   written explicitly today: a document missing the field reads back as
   `undefined` against a type that promises a `string`.
2. **It is shown in the three settings tables and in the budget table's target
   cell.** Not as `<option>` tooltips in the transaction form — an `<option>`
   cannot hold markup, and a tooltip nobody hovers is not a feature.
3. **All of G1–G6 are in scope**, phased below.

---

## Phase A — `description` through the data layer

No UI. Doing the data layer first means nothing is ever written against the old
shape, the same reason PLAN.md's Phase 1 went first.

**[src/types/index.ts](src/types/index.ts)** — add `description: string` to
`Account`, `Saldo` and `Category`, and make it optional on the way *in*:

```ts
/** Optional on input, stored as "" when omitted — see Phase A. */
type DescriptionInput = { description?: string };

export type CreateAccountInput =
  Omit<Account, "id" | "totalBalance" | "realBalance" | "archived" | "description">
  & DescriptionInput;
export type UpdateAccountInput =
  Partial<Pick<Account, "name" | "initialAmount" | "description">>;

export type CreateCategoryInput =
  Omit<Category, "id" | "archived" | "description"> & DescriptionInput;
export type UpdateCategoryInput = Partial<Pick<Category, "name" | "description">>;
```

Saldo mirrors Account. `Transaction` is untouched — it already has a
`description`, and that one is required and means something different (what the
lançamento *was*, not what the bucket is *for*).

**[src/database/validators.ts](src/database/validators.ts)** — two primitives in
the existing hand-rolled style, no dependency:

- `optionalText(value, maxLength = 280)` — `undefined`, `null` and `""` all
  pass; a non-string is `"must be text"`; over the cap is
  `` `must be at most ${maxLength} characters` ``.
- `trimmedText(value)` — the normalizer: a string trimmed, anything else `""`.
  This is what turns "field absent" into the stored `""`.

**[src/database/entities.ts](src/database/entities.ts)** — `description: string`
joins both shared shapes, `BalanceEntity` and `NamedEntity`, and then the four
generics carry it for all three entities at once:

- `createNamedEntity` / `createBalanceEntity` — add
  `description: optionalText(input?.description)` to the existing `collect({…})`,
  and write `description: trimmedText(input.description)` next to
  `archived: false`. Carry the same comment: it is **mandatory, not a default**.
- `updateNamedEntity` — currently `fail("Nothing to update")` when
  `input?.name === undefined`. That check must become "name *and* description
  both undefined", and the patch has to be built incrementally the way
  `updateBalanceEntity` already builds its own.
- `updateBalanceEntity` — add `description` to the conditional `collect` spread,
  to the patch, and to the three-way nothing-to-update guard.
- `assertActive` casts `withId<NamedEntity>(snap)` but reads only `.archived`.
  Narrow the cast to a local `{ archived: boolean }` so this guard stops
  claiming to read every field `NamedEntity` happens to grow.

**Backfill.** Existing documents have no `description`, so they read back as
`undefined` against a type that says `string` — `withId` is a blind cast and
will not catch it. Two things, both cheap:

1. A throwaway `scripts/backfill-descriptions.mts` — Admin SDK, iterate the
   three collections, `update({description: ""})` where the field is missing.
   `.mts` rather than `.mjs` because [tsconfig.json](tsconfig.json)'s `include`
   already lists `**/*.mts`, so the script is typechecked for free.
   Repeatable, unlike doing it by hand in the console, and the database is small
   (last recorded state: 1 account, 1 saldo, 2 categories).
2. Keep `?? ""` at every render site anyway. A missed document should show a
   blank cell, not the string `undefined`.

**Done when:** `npx tsc --noEmit` is clean, `createCategory({name: "X"})` still
works with no description, `createCategory({name: "X", description: "Y"})`
stores `"Y"`, `updateCategory(id, {description: ""})` clears it without
touching the name, and every existing document has the field.

---

## Phase B — `description` in the UI

**Adapters** — [accounts.ts](src/app/_actions/accounts.ts),
[saldos.ts](src/app/_actions/saldos.ts),
[categories.ts](src/app/_actions/categories.ts): add
`description: textField(formData, "description")` to both the create and the
update call. `textField` already returns `""` for an absent field, which on an
update correctly reads as "clear it" — the form always submits the input.

**[src/components/entity-labels.ts](src/components/entity-labels.ts)** —
`EntityLabels` gains `description` and `descriptionPlaceholder`. Passed in, not
derived, for the reason that interface already documents: Portuguese agrees in
gender ("Descrição **da** conta" / "Descrição **do** saldo").

**The two managers** —
[BalanceEntityManager](src/components/BalanceEntityManager.tsx) (contas, saldos)
and [NamedEntityManager](src/components/NamedEntityManager.tsx) (categorias).
The split mirrors the data layer's own two shapes, so the change lands twice and
no third time:

- Create form: a `Field` + `<input type="text" maxLength={280}>`, not a
  `<textarea>` — the row editor is a single line, and the create form should ask
  for the same thing the table lets you change.
- A `<th scope="col">Descrição</th>` after Nome.
- The empty-state `colSpan`: 5 → 6 (balance), 2 → 3 (named).

**The two rows** — [BalanceEntityRow](src/components/BalanceEntityRow.tsx) and
[NamedEntityRow](src/components/NamedEntityRow.tsx). `BalanceEntityView` and
`NamedEntityView` gain `description: string`, and each row gets a `<td>` whose
input is tied to the row's form by `form={formId}` — a `<form>` may not span
table cells, which is the pattern `BalanceEntityRow`'s `initialAmount` input
already uses. Also: add `updateState.fieldErrors?.description` to the `problem`
chain, and bump the error row's `colSpan` the same 5 → 6 / 2 → 3.

**The budget table.** This is the one place outside settings where a description
earns its keep — "what counts as Essenciais?" is exactly the question you have
while planning:

- [src/lib/rollup.ts](src/lib/rollup.ts) — `BudgetTarget` and `BudgetRow` each
  gain `description: string`; `buildBudgetRows` copies it through, and the
  trailing `(removido)` row gets `""`.
- [BudgetTable](src/components/BudgetTable.tsx) — render it as a muted second
  line in the target cell, only when non-empty. One new class in
  [BudgetTable.module.css](src/components/BudgetTable.module.css), built from
  the existing tokens.
- [src/app/budget/page.tsx](src/app/budget/page.tsx) needs **no change**: it
  already passes the whole saldo and category documents through.

**[CLAUDE.MD](CLAUDE.MD)** — document the field and its one rule, next to the
soft-delete bullet it rhymes with: *`description` is optional on input and
always stored as a string; writing `""` explicitly is mandatory for the same
reason `archived: false` is.*

**Done when:** a description can be set on create, edited in place, and cleared
on all three settings screens, and it appears under the target name on
`/budget`.

---

## Phase C — the four defects

### G1 — an archived budget row offers an input that cannot save

`/budget` loads saldos and categories with `includeArchived: true`, and
[`isWorthShowing`](src/lib/rollup.ts) deliberately keeps an archived row that
carries money. But [BudgetRowForm](src/components/BudgetRowForm.tsx) renders the
editable planned input on that row too, and
[`setBudget`](src/database/budgets.actions.ts) calls `assertActive` — so typing
a figure there can only ever come back `Saldo "…" is archived`. The one write
that *does* succeed on an archived row is clearing it, because `deleteBudget`
has no active check.

**Fix:** pass `editable={!row.archived}` down. An archived row shows its planned
figure as text plus a single "Limpar" button — which is precisely what the data
layer permits. Add the rule to [CLAUDE.MD](CLAUDE.MD): *an archived target may
not receive a new plan, only have an old one removed* — the planning twin of the
existing "archived entities reject new postings but stay editable".

### G2 — settings writes revalidate one route, but reach every screen

[accounts.ts](src/app/_actions/accounts.ts) and its two siblings
`revalidatePath("/settings/accounts")` and nothing else. That is too narrow:
archiving or renaming a saldo or category changes which options
`/transactions`'s filters and `/transactions/new`'s selects offer, the names and
`(arquivada)` hints in the ledger's columns, and — after G1 — which `/budget`
rows are even editable.

**Fix:** all six adapters in the three files revalidate `("/", "layout")`, the
same as a transaction write. Then rewrite the two [CLAUDE.MD](CLAUDE.MD) bullets
that currently say otherwise ("Entity writes revalidate only their own route",
and the "revalidate as narrowly as the write reaches" example): an entity's
name, description and archived state are rendered on every screen, so an entity
write *does* reach the layout. **Budgets stay narrow** — a plan moves no balance
and is rendered on one page, which is what makes it the real example of a narrow
write. This also closes the open item carried from Phase 3 to Phase 5 in
[IMPLEMENTATION.MD](IMPLEMENTATION.MD).

### G3 — `copyBudgets` ignores `scope` when checking the target is active

[budgets.actions.ts](src/database/budgets.actions.ts) builds one `active` set
unioning `saldos.docs` and `categories.docs`, then tests
`active.has(budget.targetId)` regardless of `budget.scope`. Firestore auto-ids
make a real collision essentially impossible, so this is a latent wrong shape
rather than a live bug — but it also hides the intent, right next to a comment
explaining why the collections are read whole.

**Fix:** two sets, chosen by scope:

```ts
const activeByScope: Record<BudgetScope, Set<string>> = {
  saldo: activeIds(saldos.docs),
  category: activeIds(categories.docs),
};
if (existing.has(id) || !activeByScope[budget.scope].has(budget.targetId)) { … }
```

### G4 — an orphaned plan vanishes, where orphaned spend is surfaced

`buildBudgetRows` goes out of its way to surface spend pointing at a deleted
target as a `(removido)` row, "otherwise the section total would silently
disagree with the ledger". The symmetric case is not handled: a budget whose
target document no longer exists never appears in `entities`, so its
`plannedAmount` is in neither `rows` nor `section.planned` — and the section's
planned total silently disagrees with `listBudgets`.

**Fix:** fold orphaned planned amounts into that same trailing row, as its
`planned`, with `budgetId: null` so it stays non-editable. The row must then
render when there is an orphaned plan *or* orphaned spend, not only spend.

---

## Phase D — tests over `src/lib`

[src/lib/](src/lib/) holds every money and month-boundary rule in the app and is
verified only by hand. It is also unusually cheap to cover: `month.ts` imports
nothing at all, and `money.ts` and `rollup.ts` reach no further than `round2`
from [validators.ts](src/database/validators.ts) and the types and
`TransactionType` enum from [src/types/index.ts](src/types/index.ts) — both of
which are themselves dependency-free. **No Firestore handle is reachable from
any of the three**, so there is nothing to mock.

Add `vitest` as the single dev dependency, `"test": "vitest run"`, and a
`vitest.config.ts` teaching it the `@/*` alias from
[tsconfig.json](tsconfig.json). Biome lints `**`, so the specs are formatted
like everything else.

| File | Cases that matter |
| --- | --- |
| `month.spec.ts` | `shiftMonth` across a year boundary in both directions; `monthBounds` for February in a leap year (`2028-02` → `…-29`) and out of one (`2027-02` → `…-28`); `resolveMonth` falling back on `2026-13`, `2026-00`, `""` and `undefined`; `formatMonthLabel` capitalizing |
| `money.spec.ts` | `parseAmount("1.234,56")` → `1234.56`; `parseAmount("90.5")` → `90.5`; `""`, `null` and `"abc"` → `NaN`, **not** `0`; `round2` drift across repeated adds |
| `rollup.spec.ts` | the canonical R$ 90 / R$ 45 split in `monthSummary`; a receita in the month **not** reducing a budget target; `statusFor` at exactly 80%; a zero target plus any spend → `over`; `ratioFor` clamped at 1 on an overrun; an archived empty target dropped but an archived one with spend kept; the `(removido)` row for both spend and plan (G4); `section.remaining` summing planned rows only |

Those last two rows are the behaviours Phase C changes, so D lands after C and
covers the new shape.

---

## Phase E — the auth gate, and the deployment key

[CLAUDE.MD](CLAUDE.MD) is right that this is the only open item that blocks
anything: every Server Action is reachable by anyone who can reach the app, and
the Admin SDK bypasses Firestore security rules by design.

A **shared password** is the right size here — this is a two-person app, and
[CLAUDE.MD](CLAUDE.MD) forbids the client `firebase` package, which rules out
Firebase Auth without changing that rule. Flag the consequence: if per-person
attribution is ever wanted, this has to become real per-user auth.

- `AUTH_PASSWORD` and `AUTH_SECRET` in `.env.local` — already ignored by
  `.env*` in [.gitignore](.gitignore).
- **`src/lib/session.ts`** — `sign(value)` / `verify(token)`, HMAC-SHA256 over
  `crypto.subtle`. Web Crypto is available in both the Edge and Node runtimes,
  so this needs no dependency and no runtime pin — `node:crypto` would force
  one. Pure, so it belongs in `src/lib` and gets a spec alongside Phase D's.
- **`middleware.ts`** at the repo root — anything without a valid session cookie
  redirects to `/login`; `matcher` excludes `/login`, `/_next/*` and static
  assets. **Verify, do not assume, that middleware intercepts Server Action
  POSTs**: the check is a `POST` to a page route carrying the action header with
  no cookie, which must redirect and leave Firestore untouched.
- **`src/app/login/page.tsx`** + **`src/app/_actions/auth.ts`** — one password
  field through the existing `Field` / `SubmitButton` / `FormState` machinery, a
  constant-time compare, an `httpOnly` `sameSite: "lax"` cookie (`secure` in
  production), then `redirect`. Plus `signOutForm` and a "Sair" control in the
  layout nav.
- **`src/app/_actions/session.ts`** — `requireSession()` at the top of every
  adapter function, as defence in depth for the day a `matcher` edit lets a POST
  through. ~20 one-line call sites; worth it, because the failure mode is
  silent.
- **The service account key.** [firebase.config.js](src/database/firebase.config.js)
  imports `serviceAccountKey.json` from disk. Switch it to read the credential
  from an env var, falling back to the file for local work. A gate in front of
  an app that ships its own admin credential in the image is not a gate, so this
  belongs in the same phase.

---

## Deliberately not in this plan

- **A client-side guard for `realAmount > totalAmount`.** The server rejects it
  with a field error and the typing survives, which is correct; a `max`
  attribute would have to track the total field live, and
  [IMPLEMENTATION.MD](IMPLEMENTATION.MD) already judged that not worth the
  client state. Nothing has changed.
- **Undo for a deleted transaction.** Hard delete is the design; the
  confirmation says the balances unwind.
- **`nonEmptyString(x)` read as a boolean.** `if (nonEmptyString(id))` means
  "if *invalid*", at [entities.ts:76](src/database/entities.ts#L76),
  [transactions.actions.ts:235](src/database/transactions.actions.ts#L235) and
  [budgets.actions.ts:97](src/database/budgets.actions.ts#L97). It is the one
  readability trap in an otherwise very legible data layer, and a four-call-site
  `invalid(check)` predicate would fix it — but it is cosmetic and touches
  working validation, so it is noted rather than scheduled. Say the word.

---

## Verification

Static, after each phase:

```bash
npx tsc --noEmit
npm run lint      # must stay 0 errors / 4 accepted warnings
npm test          # from Phase D on
npm run build
```

End-to-end against real Firestore via `npm run dev`:

1. **Description round-trip (A, B)** — create a category with a name only;
   create an account with both; edit a saldo's description without touching its
   name; clear a description by emptying the field and saving. All three tables
   show the column, and `/budget` shows the text under the target name.
2. **Backfill (A)** — every pre-existing document has `description`, and no cell
   anywhere renders the string `undefined`.
3. **Archived budget row (G1)** — plan R$ 300 on a category, spend against it,
   archive the category. The row stays (it carries money), its figure is no
   longer an input, and "Limpar" removes the plan.
4. **Staleness (G2)** — with `/transactions` open in one tab, archive a category
   in another; the ledger's filter select drops it and the row gains its
   `(arquivada)` hint without a hard reload. Rename a saldo and confirm the name
   changes on the ledger and on `/budget`.
5. **Copy (G3)** — "copiar plano" still copies both scopes, still skips archived
   targets and figures already set, and a second press still copies nothing.
6. **Orphaned plan (G4)** — delete a budgeted category document straight from
   the Firestore console. Its planned amount appears on the `(removido)` row and
   `section.planned` still agrees with `listBudgets`.
7. **Regression** — the canonical R$ 90 / R$ 45 split bill still moves Conta
   Corrente by −90/−45 and the saldo by −90/−45, and still unwinds exactly on
   delete. This is the check that must never go red.
8. **Auth (E)** — logged out, `/transactions` redirects to `/login`; a wrong
   password is refused; a `POST` of a Server Action with no cookie writes
   nothing to Firestore; "Sair" returns you to `/login`.
9. **`error.tsx`** — the one thing in this app never seen rendered, only proven
   reachable ([IMPLEMENTATION.MD](IMPLEMENTATION.MD)). It is a Client Component,
   so it needs one look in a real browser. Cheap to close while a dev server is
   already up.
