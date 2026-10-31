# CLAUDE Instructions

## RULES

I want to create a finance organizer, where I can store my transactions with flexibility and organization. Because I split a lot of everyday expenses with other people, I need to be able to register, for example, the total amount I paid and the real amount, discounting other people's part (for instance, a internet bill that I split, is dicounted as R$ 90 from my checking account, but I actually paid R$45 because it's split 50/50).
I want to be able to assing the account, the refereced saldo*, the category, date, description to each transaction.

*"Saldos" are like categories, but are more generic, as my categories are more specific. For instance, a "saldo" is "Essentials" and the categories are "Housing", "Health" and "Groceries".

The main features I want achieve in this project are:

[X] CRUD all entities described at `src/types/index.ts`;
[X] See all the monthly transactions;
[X] Plan the monthly budget by "Saldos" and "Categories";
[X] Have a way of duplicating transactions (so for not fixed but recurrent transactions I can just copy them instead of filling the information from scratch.);

## DATA LAYER

The Firestore data layer is built. Entities live in five root collections — `accounts`,
`saldos`, `categories`, `transactions`, `budgets` — and are reached only through Server
Actions.

### Files

| File | Purpose |
| --- | --- |
| `src/database/db.ts` | Exports the Firestore handle. **Admin SDK only** — never the client `firebase` package. |
| `src/database/*.actions.ts` | One file per entity, each marked `"use server"`. The only public API. |
| `src/database/entities.ts` | Shared CRUD behind accounts/saldos/categories. Two shapes: `createNamedEntity`/`updateNamedEntity` (name + description — categories) and `createBalanceEntity`/`updateBalanceEntity` (name + description + two balances — accounts and saldos, which are structurally identical, so their logic exists once). Also `assertActive(collection, id, label)`, the shared exists-and-not-archived guard. |
| `src/database/validators.ts` | Hand-rolled validation primitives, no dependency. **Must stay pure**: `src/lib` imports `round2` from it, and the client form components import `TEXT_MAX_LENGTH`, so a Firestore import here would leak into the browser bundle. |
| `src/database/result.ts` | The `ActionResult<T>` envelope. |
| `src/database/collections.ts` | Collection names, the `withId` snapshot mapper, and `budgetDocId` — the one derived document id in the app. |

`"use server"` files may only export async functions, so types, constants and sync
helpers have to stay in the non-action modules above.

### Conventions

* **Actions return errors, never throw.** Every action resolves to
  `ActionResult<T>` — `{ok: true, data}` or `{ok: false, error, fieldErrors?}`.
  `fieldErrors` carries all invalid fields at once, ready for `useActionState`.
* **Two balances per entity.** Account and Saldo each have a `totalBalance` and a
  `realBalance`. Every transaction posts *both* of its amounts to *both* the
  account and the saldo it references: `totalAmount` → `totalBalance`,
  `realAmount` → `realBalance`. The split internet bill moves the account to
  910/955 and the saldo to −90/−45. Expenses subtract, receitas add. A single
  `initialAmount` seeds both balances.
* **Balances are stored, not derived**, and every transaction write runs inside
  `db.runTransaction`. Deltas are accumulated per document before any write, so
  an edit that keeps the same account merges into one balance write instead of
  two that would overwrite each other. Firestore requires all reads before the
  first write — keep that read-phase/write-phase shape.
* **Soft delete.** Accounts, saldos and categories expose `archive`/`unarchive`,
  never a delete — transactions keep referencing them. Always write
  `archived: false` on create: a `where("archived", "==", false)` query silently
  skips documents missing the field. Archived entities reject *new* postings but
  stay editable, so archiving never freezes history.
* **`description` is optional on input and always stored as a string.** Accounts,
  saldos and categories carry one, saying what the bucket is *for*. That is not
  `Transaction.description`, which is required and says what the lançamento
  *was*. Writing `""` explicitly when it is omitted is mandatory for the same
  reason `archived: false` is: `withId` is a blind cast, and a missing field
  reads back as `undefined` against a `string` type. It is capped at 280
  characters (`optionalText`) and stored trimmed (`trimmedText`). Documents that
  predate the field were backfilled by `scripts/backfill-descriptions.mts`.
* **No composite indexes.** The selective `date` range runs in Firestore
  (ISO `YYYY-MM-DD` strings sort lexicographically); `archived` and id-equality
  filters are applied in memory. Personal-scale data, zero index setup.
* **Saldo and category are independent tags.** A transaction carries both, but
  any category may pair with any saldo — neither nests inside the other. Each
  reference is validated only for existence and active status on write.
* **Budgets are the exception to both rules above.** One document per
  `(month, scope, targetId)`, with the id *derived* from those three
  (`budgetDocId`) so a target can only be planned once per month — the upsert
  needs no duplicate query and no transaction, and a double submit is
  idempotent. They also **hard-delete**: nothing references a budget, so soft
  delete would add a field no one reads. Each month stands alone; `copyBudgets`
  seeds the next one and is **additive** — it never overwrites a figure already
  set, nor copies a target whose saldo or category has been archived. Each
  budget is checked against the collection its own `scope` names, never a union
  of both.
* **An archived target may not receive a new plan, only have an old one
  removed.** This is the planning twin of "archived entities reject new
  postings". `setBudget` calls `assertActive`, and `deleteBudget` deliberately
  does not. `/budget` therefore renders an archived row's figure as text with a
  single "Limpar" button, never as an input that could only fail to save.
* **Money on a target that no longer exists is surfaced, not dropped.** Spend
  *and* plans pointing at a deleted saldo or category fold into one read-only
  `(removido)` row. Each section's spend then agrees with the ledger, and its
  planned total with `listBudgets`.
* **Budgets measure expenses only, against `realAmount`.** Netting a receita
  into a target would let a salary deposit silently pay for an overrun. And the
  saldo and category tables are **not reconciled**: they sum the same
  transactions along different axes, so each total is right for its own axis and
  the two are not expected to agree.
* `realAmount` may never exceed `totalAmount`; money is rounded to 2 decimals on
  every balance write.

## UI LAYER

Three thin layers sit on top of the data layer. `src/database` stays a pure,
route-unaware data API: it knows nothing about routes, `FormData`, or React.

| Layer | Purpose |
| --- | --- |
| `src/lib/*.ts` | Pure helpers — month arithmetic (`month.ts`), currency format and form parsing (`money.ts`), transaction aggregation (`rollup.ts`). Sync and Firestore-free, so they can be imported anywhere and cannot live in a `"use server"` module. Each has a `*.spec.ts` beside it. |
| `src/app/_actions/*.ts` | Form adapters. The data-layer actions take typed objects, but `useActionState` needs `(prevState, formData)`. Each adapter parses `FormData`, calls the action, calls `revalidatePath`, and returns a `FormState`. `form-state.ts` holds the shared shape and is deliberately *not* `"use server"`. |
| `src/components/*.tsx` | Shared presentation — form primitives, tables, navigation. |

### UI conventions

* **`revalidatePath` belongs to the adapters, not the actions.** Putting it in
  `src/database` would make the data layer depend on route names, the one
  coupling it is currently free of.
* **Server Components by default.** `"use client"` only where the browser is
  genuinely needed: `useFormStatus` (`SubmitButton`, `ConfirmSubmit`),
  `window.confirm` (`ConfirmSubmit`), `usePathname` (`NavLink`). Navigation that
  can be expressed as a link stays server-rendered — `MonthNav` is a Server
  Component for exactly this reason.
* **`searchParams` and `params` are Promises** (Next 16). Always `await` them.
  Every `?month=` value goes through `resolveMonth`, which falls back to the
  current month rather than erroring on a hand-edited URL.
* **Local time for "now", UTC for arithmetic.** `currentMonth()`/`today()` read
  local date parts — in UTC−3, `toISOString()` would report tomorrow after 21:00.
  Month arithmetic pins to `Date.UTC`, where no DST shift can roll a boundary.
  Every caller is a Server Component, so "local" means **the server process's
  timezone**, not the viewer's. The specs pin `TZ=America/Sao_Paulo`; a deploy
  has to as well (see Still open).
* **Design tokens, not literal values.** Colour, spacing and radius all come from
  the custom properties in `src/app/globals.css`, defined in *both* the light and
  dark block. Money uses `tabular-nums` so columns align on the decimal point.
* **Never swallow a failed `ActionResult`.** Render its `error` — a blank page is
  worse than a visible message. `ErrorBanner` is the component for it.
* **Only serializable props cross into a Client Component.** Server actions are
  the exception; plain functions are not. Label objects handed from a page to a
  manager use template strings with `{name}` placeholders, substituted on the
  client — see `entity-labels.ts`.
* **Inline editing inside a table ties inputs to their form by `id`.** A
  `<form>` may not span table cells, so each row's inputs carry `form="edit-…"`.
  The save button is therefore not a form descendant and `useFormStatus` cannot
  see it — take the pending flag from `useActionState`'s third return value.
* **`useActionState` does not auto-reset a form.** A successful create has to
  clear it through a `ref`, or the next entry starts with the last one's values.
* **A field's message outranks the form's.** A validation failure sets both
  `error` ("Invalid saldo") and `fieldErrors`. The create forms render each
  field message under its input and hide the banner. The settings rows have one
  error cell, so their `problem` chain lists the field messages *before*
  `error`. Leading with `error` hides the message that says what is wrong.
* **A description is shown where you decide, not where you pick.** It appears in
  the three settings tables and as a muted second line in the `/budget` target
  cell, where "what counts as Essenciais?" is the question at hand. It never
  goes into a transaction-form `<option>`, which cannot hold markup. Every
  render site guards against `undefined`.
* **Display strings are passed in, never derived from the entity name.**
  Portuguese agrees in gender ("Nome **da** conta" / "Nome **do** saldo"), and
  guessing that from a noun inside a component is how it breaks.
* **The sign rule stays in the data layer.** `postings`/`signed` describe how a
  transaction moves a *stored balance*. Views group by `type` and display
  magnitudes — an expense reads `R$ 90,00` beside a "Despesa" badge, not a
  negative number whose sign depends on a convention defined elsewhere.
* **Lookups load archived entities too.** A transaction stays listable and
  editable after its account is archived, so any id→name map feeding the ledger
  or an edit form uses `includeArchived: true`. An id that still fails to
  resolve is shown as `(removido)`, not hidden.
* **Check each `ActionResult` individually.** A page doing several reads cannot
  narrow them with one `.find` over an array — the generics differ, so an
  explicit `if (!result.ok)` per value is what makes `.data` reachable.
* **Form inputs are uncontrolled, with `defaultValue` from `state.values`.** That
  is what makes a rejected submit come back with the user's typing intact.
  Interactivity that has to change an input's value — mirroring `totalAmount`
  into `realAmount`, the "dividir 50/50" button — is done imperatively through a
  `ref`, because controlled state would fight those defaults.
* **An entity id in a form travels as a hidden field, not a `.bind`.** Both the
  create and edit routes then share one unbound `FormAction` signature, and a row
  action needs no per-row bound closure.
* **Transaction and entity writes revalidate `("/", "layout")`.** A transaction
  moves balances on *both* an account and a saldo, and those surface on the
  settings and budget screens as well as the ledger. An entity's name,
  description and archived state are rendered on every screen: the ledger's
  columns and filters, the transaction form's selects, and which `/budget` rows
  are editable. So creating, editing, archiving or restoring one reaches the
  whole layout, not just its settings route. Do not lean on Next refreshing
  every visited page after any `revalidatePath`: its docs call that temporary.
* **A write redirects to the month of the record, not the month of the form.**
  They differ whenever you backdate or duplicate forward, and landing on a month
  that doesn't contain what you just saved reads as a failure.
* **Revalidate as narrowly as the write reaches.** A budget is a plan: it moves
  no balance and is rendered on one page, so `/budget` is enough. That makes it
  the one genuinely narrow write. Transactions and entities reach every screen,
  so they take `("/", "layout")`.
* **A single-number record is edited in its own table row**, not on a dedicated
  screen — the budget table *is* the budget editor. An emptied field clears the
  record rather than storing zero, because zero is a real target ("spend nothing
  here") and the two must stay distinguishable.
* **Totals are computed in `src/lib`, not in JSX.** A footer that re-derives a
  sum duplicates the rule about which rows are included in it; the pure function
  returns the rows *and* their totals together.
* **A missing record is not a 404.** `not-found.tsx` is for a URL that isn't a
  route. A record that doesn't exist comes back as `{ok: false, error}` and the
  page renders that message, because "this transaction was deleted" and "this
  address does not exist" are different things to be told.
* **`error.tsx` is for bugs only.** Since the actions never throw, reaching the
  boundary means something broke where nothing was supposed to — so it shows the
  message *and* the `digest`, which in production is the only handle on the
  server log. Note it is a Client Component: it renders after hydration, so it
  cannot be verified by fetching HTML.
* **A link out of a form carries the record's month**, same as a write's
  redirect. Before the record is read there is no month, so an error branch can
  only point at the current one.

## STATUS

**The plan is complete.** All four goals above are met and verified end-to-end
against real Firestore.

**Data layer** — CRUD is done for all five collections, including
`listTransactions({from, to, ...})` for the monthly view and
`setBudget`/`listBudgets`/`deleteBudget`/`copyBudgets` for the plan. There is no
`duplicateTransaction`: duplication prefills the create form instead (see
below), so nothing is written until the amount has been checked.

**UI** — the app shell, design system, and all three layers above are in place.

* **Settings CRUD works.** Accounts, saldos and categories can be created,
  renamed, described, re-based, archived and restored at `/settings/*`.
* **The monthly ledger works.** `/transactions?month=YYYY-MM` shows the month's
  lançamentos with a real/total summary, independent conta/saldo/categoria
  filters, resolved names, and an Ações column.
* **Transactions are writable.** `/transactions/new` creates (with the
  total→real mirror and the 50/50 split button), `/transactions/[id]/edit`
  edits, and a row can be deleted — balances unwind on delete.
* **Duplication works via `/transactions/new?from=<id>`.** Every field is
  prefilled and the date resets, so a recurrent-but-variable expense only needs
  its amount adjusted before saving.
* **Budget planning works.** `/budget?month=YYYY-MM` plans the month over
  saldos and over categories independently, each a flat table editable in
  place, with planned / gasto / restante / consumption bar, per-section totals,
  and a "copy last month" button. A target's description shows under its name.
* **Nothing renders a blank page.** Every page reports a failed `ActionResult`
  in a banner and has a first-run empty state pointing at what must be created
  first. `not-found.tsx` covers a URL that isn't a route, `error.tsx` anything
  that throws.

All of it is verified end-to-end against real Firestore — including the
split-bill arithmetic above and an overrun against a category target.

### Tooling

`npm run lint` reports **zero errors and four warnings**. The four are
deliberate, not unfinished work:

* `noDefaultExport` on `src/database/db.ts` — `import db from …` reads the way
  the one global handle should.
* `noEnum` and two `useNamingConvention` on `TransactionType` — the enum's
  values (`"expense"`, `"income"`) are what is stored in Firestore documents,
  and `EXPENSE`/`INCOME` is the convention the data layer is written in.

Biome does not police `package.json`, `package-lock.json` or `.claude/`: other
tools rewrite those.

`npm test` runs Vitest over `src/**/*.spec.ts`, which today means `src/lib`.
Specs sit beside the module they cover and need no mocks, since nothing in
`src/lib` reaches Firestore. `vitest.config.mts` takes the `@/*` alias from
tsconfig (`resolve.tsconfigPaths`) and pins `TZ`. Two Biome overrides exist for
the tests: `noMagicNumbers` is off in `*.spec.ts`, where literal amounts are the
fixture, and the config may default-export, like `next.config.ts`. A change to
a money or month rule comes with a spec.

### Still open

**No authentication exists.** Every Server Action is reachable by anyone who can
reach the app, and the Admin SDK bypasses Firestore security rules by design.
That is fine on `localhost` and **must be fixed before any public deploy** — it
is the only open item that blocks anything.

Also: deploying needs `serviceAccountKey.json` supplied as an env var, since
`src/database/firebase.config.js` imports it from disk and the file is
gitignored. It also needs the process timezone set to `America/Sao_Paulo` (or
`month.ts` pinned to it): on a UTC host `today()` runs a day ahead every evening
from 21:00, and `currentMonth()` a month ahead on the last evening of each month.
Next 16.2.9 carries published advisories, among them a middleware/proxy bypass
on Turbopack, so it must be upgraded before any gate relies on middleware. And
`error.tsx` has never been seen rendered, only proven reachable; it needs one
look in a browser.

See [PLAN.md](PLAN.md) for the phased plan and
[IMPLEMENTATION.MD](IMPLEMENTATION.MD) for what each finished phase actually
produced, including where it departed from the plan.

**Improvement track, in progress.** [IMPROVEMENT_PLAN.MD](IMPROVEMENT_PLAN.MD)
schedules the items above, plus an entity `description` field and four defects
(G1–G4). [IMPROVMENT_IMPLEMENTATION.MD](IMPROVMENT_IMPLEMENTATION.MD) records
each phase as it lands. Phases A–D are done. `description` is stored,
validated, editable on the settings screens and shown on `/budget`. The four
defects are fixed: archived budget rows are read-only, entity writes revalidate
the layout, `copyBudgets` checks per scope, and orphaned plans are surfaced.
`src/lib` is covered by 69 Vitest specs (`npm test`). Next is Phase E, the auth
gate and the deployment key.
