# Implementation Log

Running record of [PLAN.md](PLAN.md) as it gets built. One section per phase, written
when the phase lands. [CLAUDE.MD](CLAUDE.MD) stays the spec; this file is the history.

| Phase | Status |
| --- | --- |
| 1 — Decouple Category from Saldo | **Done** |
| 2 — Foundations | **Done** |
| 3 — Settings CRUD | **Done** |
| 4 — Monthly transactions view | **Done** |
| 5 — Transaction create / edit / duplicate / delete | **Done** |
| 6 — Budget planning | **Done** |
| 7 — Polish and documentation | **Done** |

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

---

## Phase 3 — Settings CRUD

The first usable screens. Accounts, saldos and categories can now be created,
renamed, re-based, archived and restored from the browser — which is the
prerequisite for everything else, since a transaction needs all three to exist.

### Form adapters — `src/app/_actions/`

`accounts.ts`, `saldos.ts`, `categories.ts`, each `"use server"` and each
exporting `create…Form` / `update…Form` / `archive…Form` / `unarchive…Form` in
the `(previousState, formData)` shape. Every one does the same four things:
parse `FormData`, call the data-layer action, `revalidatePath` on success, and
return `fromResult(...)`.

They stay thin because the data layer already does the work — the accounts and
saldos adapters are line-for-line parallel, mirroring `createBalanceEntity`
existing once beneath them.

Two additions to `form-state.ts`:

- `FormAction` — the shared signature, so managers can take actions as props.
  Server actions are serializable across the server/client boundary, which is
  what makes the whole page-passes-actions-to-manager arrangement work.
- `textField(formData, field)` — `FormData.get` returns `File | string | null`
  and every field here is text. Narrowing it in one place keeps the three
  adapters from each repeating the check. A missing field becomes `""`, which
  `nonEmptyString` then rejects with a proper message.

### Components

| Component | Kind | Notes |
| --- | --- | --- |
| `BalanceEntityManager` | client | Create form + table for accounts **and** saldos — one component, because the two entities are structurally identical. |
| `BalanceEntityRow` | client | Inline-editable row: name, `initialAmount`, both balances, save, archive/restore. |
| `NamedEntityManager` | client | The name-only variant, for categories. |
| `NamedEntityRow` | client | One editable field, no balance columns. |
| `ArchivedToggle` | server | Flips `?archived=1`. |
| `ErrorBanner` | server | Renders a failed `ActionResult.error`. |
| `entity-labels.ts` | — | The `EntityLabels` shape plus `archiveConfirmFor`. |

Three implementation details worth knowing:

- **Inline editing inside a table uses the HTML `form` attribute.** A `<form>`
  may not span table cells, so each row renders its form in the first `<td>` and
  the other inputs point at it by id. The consequence: the save button is not a
  descendant of its form, so `useFormStatus` cannot see it — the pending flag
  comes from `useActionState`'s **third** return value instead.
- **`useActionState` does not reset the form** the way a bare `<form action>`
  does, so a successful create clears it explicitly through a `ref`. Without
  that, the next entity starts with the previous one's name still in the box.
- **`EntityLabels.archiveConfirm` is a template string, not a function.** It was
  written as `(name) => string` first, which would have thrown at runtime:
  these labels are defined in Server Components and passed to Client Components,
  and only serializable values cross that boundary. `archiveConfirmFor`
  substitutes `{name}` on the client side.

Labels are passed in rather than derived from the entity name because Portuguese
articles and participles agree in gender — "Nome **da** conta" vs "Nome **do**
saldo", "arquivad**a**" vs "arquivad**o**". An earlier draft sniffed the noun
to pick the article, which is exactly the kind of thing that breaks on the
fourth entity.

### Routes

- **`src/app/settings/layout.tsx`** — sub-navigation (Contas · Saldos ·
  Categorias) shared by the three screens. `NavLink` prefix-matches, so the
  top-level "Configurações" stays highlighted throughout.
- **`/settings`** now redirects to `/settings/accounts` rather than rendering an
  index of links. PLAN.md sketched an index page; a layout with tabs is fewer
  clicks and one less screen to maintain, and contas is what you need first
  anyway.
- **`/settings/accounts`, `/settings/saldos`, `/settings/categories`** — each
  awaits `searchParams`, turns `?archived=1` into `includeArchived`, calls its
  list action, and renders either the manager or an `ErrorBanner`. Archived
  state lives in the URL, not in client state: the server does the filtering, so
  the URL should say which view you are looking at.

Each page carries a short lead explaining what the entity is for — including, on
the categories page, that categories do not belong to a saldo.

**Archiving asks for confirmation; restoring does not.** Archiving is reversible
but it stops new postings, so an accidental click is worth catching. Restore is
a single click away and harmless. This is the first real use of `ConfirmSubmit`
from Phase 2.

### How Phase 3 was verified

```text
npx tsc --noEmit         clean
npx biome check src/     clean — same 4 pre-existing warnings, nothing new
npm run build            9 routes, all three settings screens server-rendered
```

Then a real end-to-end run against live Firestore. Next renders server-action
forms with hidden `$ACTION_*` fields for no-JS progressive enhancement, so a
script can scrape those and POST them back — exercising the actual adapter →
action → Firestore path rather than a reimplementation of it. **22 of 22
checks passed:**

| Area | Verified |
| --- | --- |
| Create | Exactly one document written; name trimmed; one `initialAmount` seeds *both* balances; `archived: false` written explicitly; the row renders in the table body |
| Validation | Blank name wrote nothing and returned "must be a non-empty text"; `"abc"` as an amount wrote nothing and returned "must be a number" — confirming `parseAmount`'s `NaN` reaches `finiteNumber` instead of silently becoming 0 |
| Update | Restating `initialAmount` 1000 → 1500 shifted `totalBalance` and `realBalance` by the same delta |
| Categories | Created without a saldo; **no `saldoId` field on the documents**, confirming Phase 1 end-to-end for the first time |
| Rename | Persisted through the row edit form |
| Archive | Set `archived: true`; hidden from the default view; visible under `?archived=1` with the badge and a Restaurar button; active rows still listed |
| Restore | Set `archived: false` |

One methodology note, because it nearly produced a false green: the first
harness asserted against page HTML, and "passed" on entities that had never been
written — the strings it searched for ("Essenciais", "Mercado") also appear in
the pages' own placeholder and lead copy. The database was empty the whole time.
The rewrite asserts against Firestore and scopes any HTML check to the
`<tbody>`. **The write path was broken at that point** (`$ACTION_REF_1` renders
with no `value` attribute, so the scraper dropped it and every POST failed with
"Failed to find Server Action") and the HTML assertions hid it completely.

### Left open after Phase 3

- **Seed data is now in Firestore** from the verification run: account "Conta
  Corrente" (R$ 1.500), saldo "Essenciais" (R$ 0), categories "Moradia" and
  "Mercado e feira". Real, editable through the UI, and useful for looking at
  Phase 4 — rename or archive it as you like.
- **`revalidatePath` only targets each settings route.** That is correct today,
  but Phase 4 puts balances on the transactions view too, and Phase 5's
  transaction writes move both an account and a saldo. PLAN.md already calls for
  `revalidatePath("/", "layout")` on transaction mutations; the settings
  adapters may need widening at the same time.
- **`updateAccountForm` always sends both fields.** The data layer accepts a
  partial patch, but the row form submits name *and* `initialAmount` together,
  so an unchanged amount is rewritten with the same value. Harmless — the delta
  is zero — but it means the row cannot express "rename only".

---

## Phase 4 — Monthly transactions view

The ledger. `/transactions?month=YYYY-MM` shows a month's lançamentos with a
summary, independent filters, and resolved account/saldo/category names. Still
read-only — creating and editing is Phase 5.

### Aggregation — [src/lib/rollup.ts](src/lib/rollup.ts)

`indexById(items)` for the name lookups and `monthSummary(transactions)` →
`{expenses, income, net, count}`, each as an `AmountPair` of `{total, real}`.

**The expense/receita sign rule stays in the data layer.** PLAN.md expected this
module to need it — either restated here or extracted from
`transactions.actions.ts` into a shared helper. Neither was necessary:
`monthSummary` groups by `type` and sums **magnitudes**, deriving `net` as
income − expenses. That reads better in the UI (an expense row shows
`R$ 90,00` beside a "Despesa" badge, not a `-R$ 90,00` whose sign has to agree
with a convention defined elsewhere) and leaves `postings`/`signed` untouched in
the one place that genuinely needs them: posting to a stored balance. **No
existing data-layer file was modified in this phase.**

`sumBy` — the third function PLAN.md lists here — was not written. Nothing in
the monthly view needs keyed sums; it lands in Phase 6 with `buildBudgetRows`,
which actually uses it.

[src/lib/month.ts](src/lib/month.ts) gained `formatDayMonth("2026-10-29")` →
`"29/10"`. Day and month only: the year is already in the page header and a
ledger column should stay narrow.

### Ledger components

| Component | Kind | Notes |
| --- | --- | --- |
| `TransactionsTable` | server | Eight columns: data, descrição, conta, **saldo**, **categoria**, tipo, total, real. Saldo and categoria are separate columns now that neither nests in the other. |
| `SummaryCards` | server | Despesas / Receitas / Resultado / Lançamentos. Each leads with the **real** figure and carries `total` beneath — on the split bill those differ by half, which is the whole point of the app. |
| `TransactionFilters` | server | Conta / saldo / categoria as a plain `GET` form. |

Two details:

- **The filters ship no JavaScript.** A `<form method="GET">` writes the values
  into the query string, the page re-reads them server-side, and
  `listTransactions` applies them through its existing optional filters.
  `month` rides along in a hidden field so filtering never jumps you to a
  different month, and `MonthNav` receives the filters through the `params` prop
  added in Phase 2 — so stepping months keeps the view you had narrowed to.
- **An unresolvable id is flagged, not blanked.** `NameCell` renders
  `(removido)` in the negative colour. Accounts, saldos and categories are
  soft-deleted, so a missing id means the document was removed outside the app
  and the transaction now points nowhere — worth seeing rather than hiding.

Lookups load with `includeArchived: true`: a transaction stays listable after
its account is archived, so the map has to resolve those ids too. Archived
entities render with a muted `(arquivada)` / `(arquivado)` hint.

### Page

[src/app/transactions/page.tsx](src/app/transactions/page.tsx) awaits
`searchParams`, resolves the month, and fires all four reads in one
`Promise.all`. The four `ActionResult`s are then checked **one at a time**
rather than through a `.find` over the array — they are differently-typed
generics, and only an explicit `!result.ok` per value narrows the union enough
to reach `.data`. A first draft used `.find` and needed an unreachable fallback
branch to compile, which was a sign the shape was wrong.

If no account, saldo or category exists yet, the page says so and links to
settings instead of rendering an empty ledger.

### How Phase 4 was verified

```text
npx tsc --noEmit         clean
npx biome check src/     clean — same 4 pre-existing warnings
npm run build            8 routes
```

Then **28 of 28** end-to-end checks against the running app, with six
transactions seeded directly into Firestore and removed afterwards. Seeding raw
rather than through `createTransaction` is deliberate: the view reads only
transaction documents, so raw docs exercise exactly what this phase renders, and
because no balance deltas are ever posted the account and saldo balances stay
untouched — the database ended exactly as it started (verified: 0 transactions,
the two scratch entities deleted, the archived flag restored).

| Area | Verified |
| --- | --- |
| Range | Five October rows; the September transaction excluded; September shows its one row; `2026-01` shows the empty message and a zeroed summary |
| Arithmetic | Despesas real **415,00** / total **520,00**; resultado real **4.585,00** / total **4.480,00** — hand-computed from the seed, so the real/total split is confirmed, not just "a number rendered" |
| The split bill | R$ 90 and R$ 45 on the same row |
| Names | Accounts, saldos and categories all resolved; a dangling `categoryId` rendered `(removido)`; a transaction on an **archived** category still listed, marked `(arquivada)` |
| Order | Newest first — 25/10 above 05/10 |
| Filters | Account → 4 rows, saldo → 1, category → 2, account+category → 1. The category filter spanned **both saldos**, confirming saldo-independence in the UI. "Limpar" appears only when filtered |
| Month nav | Preserves the active filter across a month change |
| Bad input | `?month=banana` falls back instead of erroring |

A second methodology note, worth recording because it cost real time: the
archived-category assertion failed while the feature worked. React emits
`<!-- -->` separators between adjacent text nodes in SSR output, so the JSX
`({label})` renders as `(<!-- -->arquivada<!-- -->)` and a literal search for
`(arquivada)` misses. Normalizing those separators before matching fixed the
assertion. Combined with Phase 3's false-positive problem, the lesson is the
same both times: **HTML string matching is a weak oracle** — assert against the
database for state, and normalize markup before asserting on text.

### Left open after Phase 4

- **No row actions yet.** Edit, duplicate and delete buttons arrive in Phase 5
  along with the routes they need; adding dead buttons now would be worse.
- **`TransactionsTable` has no footer totals.** `SummaryCards` already sums the
  filtered set, and mixing expenses and receitas into one column total would be
  meaningless.
- **Still only the Phase 3 seed data** in Firestore: "Conta Corrente",
  "Essenciais", "Moradia", "Mercado e feira", and zero transactions. The ledger
  is genuinely empty until Phase 5 can write to it.

---

## Phase 5 — Transaction create / edit / duplicate / delete

The ledger is writable. A transaction can be entered, edited, duplicated and
deleted from the browser, and the balance arithmetic CLAUDE.MD describes is now
driven entirely through the UI. Two of the four project goals — the monthly view
and duplication — are met as of this phase.

### Adapter — [src/app/_actions/transactions.ts](src/app/_actions/transactions.ts)

`createTransactionForm`, `updateTransactionForm`, `deleteTransactionForm`, all in
the same unbound `(previous, formData)` shape as the Phase 3 adapters, over a
shared private `readInput(formData)`.

- **The id travels as a hidden field, not through `.bind(null, id)`.** PLAN.md
  sketched binding, which would give the edit action a different signature from
  the create action and force a per-row bound closure for delete. With a hidden
  `id` both routes share one `FormAction`, the form component needs no special
  case, and the delete action can be passed down through a Server Component
  (`TransactionsTable`) as a single serializable value. Trust is unaffected:
  nothing was ever safer about a bound id — the action validates the id against
  Firestore either way, and this app has no auth to speak of in the first place.
- **`revalidatePath("/", "layout")`,** not a single route. A transaction write
  moves balances on both the account and the saldo, and those figures are
  rendered on `/settings/accounts` and `/settings/saldos` as well as here.
- **Create and update redirect to the month of the saved record**
  (`result.data.date.slice(0, 7)`), not the month the form was opened from. They
  differ whenever you backdate or duplicate forward, and landing on a month that
  doesn't contain what you just saved reads as a failure. **Delete does not
  redirect** — it is invoked from a row, so the ledger should stay put.

### Form — [src/components/TransactionForm.tsx](src/components/TransactionForm.tsx)

One client component shared by both routes. The parts worth knowing:

- **Inputs are uncontrolled, `defaultValue` fed from `state.values`.** That is
  what makes a rejected submit come back with the user's typing intact.
- **The total→real mirror is imperative.** `realAmount` follows `totalAmount` as
  you type until you touch it, via a `ref` and a `realEdited` flag — controlled
  state would fight those defaults. The flag initialises to `true` when the two
  amounts already differ, so opening an existing split bill and correcting the
  total cannot silently overwrite the real share.
- **"Dividir 50/50"** is `type="button"` (an unqualified `<button>` in a form
  submits it) and marks the field as edited, since halving *is* taking it over.
- The type radios sit in a `fieldset`/`legend`; the amounts carry a one-line
  explanation of what total and real mean, using the R$ 90 / R$ 45 example from
  CLAUDE.MD, because that distinction is the whole premise of the app.

`src/components/transaction-options.ts` builds the `<select>` options and takes
the "(arquivada)" / "(arquivado)" suffix as an argument — the page knows which
entity it is, and Portuguese agrees in gender.

### Routes added in Phase 5

| Route | Notes |
| --- | --- |
| `/transactions/new` | Active-only entity lists: an archived target would only be refused on submit. `?from=<id>` prefills every field for duplication. `?month=` keeps "Voltar ao extrato" pointing where you came from. |
| `/transactions/[id]/edit` | Lists loaded with `includeArchived: true`, so an archived account stays visible and selected rather than silently dropping the record's current value. |

Both pages refuse to render a form when no account, saldo or category exists,
linking to settings instead.

**The create form's default date follows the month in view.** Opening it from a
past or future month pre-dates it to that month's first day; the current month
gets today. Otherwise saving would redirect to a different month than the one
being read — the same reasoning as the redirect rule, applied to the default.

### Row actions

`TransactionRowActions` (client) renders Editar · Duplicar · Excluir;
`TransactionsTable` gained a ninth column and a `deleteAction` prop. The table
stays a **Server** Component — a Server Action is serializable across the
boundary, so the page hands it down rather than the table importing it.

Only the delete needs client state, for `ConfirmSubmit` and to surface a failure
in the row. Editar and Duplicar are plain `<Link>`s.

The ledger header gained a primary **Nova transação** button carrying the current
month.

### Deviations from PLAN.md

- **`quickDuplicateForm` was dropped entirely.** The plan listed a one-click
  `duplicateTransaction(id, {date: today()})` beside the `?from=` route.
  CLAUDE.MD asks for duplication of "**not fixed** but recurrent transactions" —
  the amount is precisely the thing that changes, so a one-click write saves a
  wrong figure and then needs an edit. It would also drop the new row into
  today's month, making it vanish from whichever month you were reading. The
  prefill route does the job with one affordance: nothing is written until you
  submit. **Consequence: the data-layer `duplicateTransaction` is now unused by
  the UI.** It stays — it works, it is verified, and it is the natural API if a
  "repeat for the next six months" feature ever shows up.
- **The edit route renders an `ErrorBanner` instead of calling `notFound()`.**
  "was not found" and a Firestore outage are different problems; the action
  already distinguishes them, and flattening both into a 404 throws that away.
- **The id is a hidden field rather than a bound argument** (reasoning above).

### How Phase 5 was verified

```text
npx tsc --noEmit         clean
npx biome check src/     clean — same 4 pre-existing warnings
npm run build            10 routes, including ƒ /transactions/[id]/edit
```

Then **63 of 63** end-to-end checks against the running app, driving the real
forms over HTTP and asserting against **Firestore** for every stateful claim.

| Area | Verified |
| --- | --- |
| Create | The canonical split bill — R$ 90 total / R$ 45 real on Conta Corrente / Essenciais / Moradia — written as one document with the right date, saldo and category |
| Balances | Account moved **−90 / −45** and the saldo likewise, asserted as deltas against the live baseline (this database starts at 1500/1500, so the figures are 1410/1455 where CLAUDE.MD's 1000-real example says 910/955) |
| Ledger | The row renders in `<tbody>` with its account name; the Ações header, all three row actions and the Nova transação button are present |
| Rejection | `realAmount` 200 against a 90 total wrote **nothing**, named `realAmount` as the failing field, and echoed the typed description back |
| Archived mid-history | With Conta Corrente archived, the edit form still offers it, labels it "(arquivada)" and keeps it selected; a *new* transaction is not offered it at all, and forcing the id through is refused and writes nothing |
| Edit across accounts | Reassigning to a second account returned the first to its exact baseline and moved −90/−30 onto the second — the delta-accumulation path |
| Duplicate | `?from=` prefilled description, the **edited** real share and the same saldo, carried no `id`, and **wrote nothing on GET**; submitting with a changed amount produced a second independent document and moved the balances twice |
| Delete | Both documents hard-deleted; every account and saldo balance back to its pre-run figure to the cent; zero transactions left |

The harness and its fixture account were deleted afterwards, and the database was
re-inspected: identical to its pre-run state.

Two harness bugs, both worth recording since they are the same trap in a new
guise: Next's `$ACTION_*` payload is **HTML-entity-encoded** in the attribute
(`&quot;`), and POSTing it back raw fails with "Failed to find Server Action" —
indistinguishable from the Phase 3 missing-`value` bug unless you look at the
response text. And `firebase-admin`'s ESM entry has no default export; the
subpath imports (`firebase-admin/app`, `firebase-admin/firestore`) are what work,
exactly as [src/database/firebase.config.js](src/database/firebase.config.js)
already does it.

### Left open after Phase 5

- **`duplicateTransaction` has no caller.** Dead code in the strict sense, kept
  deliberately (above). Phase 7 should decide: keep as API, or delete.
- **Deleting from the ledger has no undo.** Transactions hard-delete by design
  (nothing references them), and the confirmation says the balances will unwind.
  Fine for a two-person app; worth knowing it is final.
- **The form has no client-side guard for `realAmount > totalAmount`.** The
  server rejects it with a field error and the typing survives, which is correct
  but costs a round trip. A `max` attribute would need to track the total field
  live; not obviously worth the client state.
- **Phase 3's open item about widening `revalidatePath` on the settings adapters
  is still open.** Transaction writes now revalidate the whole layout, so the
  ledger is never stale after a write; the reverse case — editing an account's
  `initialAmount` while the ledger is cached — still only revalidates
  `/settings/accounts`. The ledger shows no account balances today, so nothing
  is visibly wrong. Phase 6's budget page may change that.
- **Firestore is back to exactly the Phase 3 seed**: "Conta Corrente"
  (1500/1500), "Essenciais" (0/0), "Moradia", "Mercado e feira", zero
  transactions. Phase 6's budget screen needs real transactions to show
  anything — they can now be entered through the UI.

---

## Phase 6 — Budget planning by saldo and by category

The last of CLAUDE.MD's four goals. `/budget?month=YYYY-MM` plans a month over
saldos and over categories **independently**, each as a flat table you edit in
place, plus a one-click copy of the previous month's plan.

### Data model

**[src/types/index.ts](src/types/index.ts)** — `BudgetScope = "saldo" | "category"`,
`Budget {id, month, scope, targetId, plannedAmount}` and `SetBudgetInput`.

A discriminated `scope` + `targetId` pair rather than nullable `saldoId` /
`categoryId` columns. Since Phase 1 the two dimensions are siblings, not
parent/child, and one pair says that plainly — it also makes
`buildBudgetRows({scope})` one function called twice instead of two.

**`budgets` added to `COLLECTIONS`**, and `isoMonth` to the validators. Unlike
`isoDate` it needs no `Date` round-trip: there is no `YYYY-MM` equivalent of
February 30th, so the pattern alone is sufficient — the month range is spelled
out in the regex so `2026-13` and `2026-00` fail.

### Actions — [src/database/budgets.actions.ts](src/database/budgets.actions.ts)

`setBudget`, `listBudgets(month)`, `deleteBudget`, `copyBudgets(from, to)`.

- **The document id is derived, not generated**: `${month}__${scope}__${targetId}`.
  One target can only be planned once in one month, so making that the id
  enforces it in Firestore itself — the upsert is a plain `set` with no
  duplicate-detection query, no `runTransaction`, and a double-submitted form is
  idempotent instead of a second row. **It lives in
  [collections.ts](src/database/collections.ts) as `budgetDocId`**, not in this
  module: a `"use server"` file may only export async functions, and an id
  derivation has no business being awaited. (PLAN.md had it inside the actions
  file; writing it there produced an `async` function returning a template
  string, which is what made the problem obvious.)
- **`setBudget` reuses `assertActive`** from `entities.ts` against whichever
  collection the scope names. This is the payoff for generalizing it in Phase 1
  rather than leaving it a saldo-only helper — one call covers both scopes.
- **Budgets hard-delete.** Nothing references a budget document, so the
  soft-delete treatment the other entities get would only add a field no one
  reads.
- **`copyBudgets` is additive.** A target already planned in the destination
  month is left alone, and a target whose saldo or category has since been
  archived is skipped; it returns `{copied, skipped}`. Copying is a shortcut for
  typing, so it must never overwrite a figure set by hand — which also makes it
  safe to press twice. It reads both entity collections once and checks a `Set`,
  rather than calling `assertActive` per budget: a copy touches all of them.

### Rollup — [src/lib/rollup.ts](src/lib/rollup.ts)

`sumBy(transactions, keyOf)` — finally written, in the phase that actually needed
it (Phase 4 didn't) — and `buildBudgetRows({scope, entities, budgets, transactions})`.

- **Expenses only.** A receita in the month does not reduce a target, or a
  salary deposit would silently pay for an overrun.
- **It returns a `BudgetSection`, not a `BudgetRow[]`** — rows plus `planned`,
  `spent` and `remaining` totals. The footer figures are part of the same
  reduction, and recomputing them in JSX would duplicate the rule about which
  rows count toward them.
- **Section `remaining` sums the planned rows only**, so it is deliberately *not*
  `planned - spent`. Charging spend on an unbudgeted target against the plan's
  remainder would make the plan look broken by money it never claimed to cover.
- **Which rows appear**: every active target, plus any archived one that carries
  money this month (spend or a planned figure). That keeps a long tail of
  archived targets out of the table without ever hiding a number.
- **The "sem orçamento" row from PLAN.md became a `(removido)` row.** Every
  target already gets a row whether planned or not, so the only spend with
  nowhere to go is spend pointing at a document that no longer exists. Surfaced
  rather than dropped, or the section total would silently disagree with the
  ledger.
- `status` (`ok` / `warning` / `over` / `unplanned`) and a clamped `ratio` are
  computed here too, so the component only picks a class and a width.

### UI

| Piece | Kind | Notes |
| --- | --- | --- |
| `BudgetTable` | server | One section: the five columns, the per-section footer, and the consumption bar. |
| `BudgetRowForm` | client | The editable planned amount for one row — `useActionState` for the pending flag and the per-row error. |
| `CopyBudgetsButton` | client | Seeds the month from the previous one and reports the count. |

- **The table is the editor.** No separate "create budget" screen: a budget is a
  single number, and a whole form for it would be ceremony. Each row's form
  lives inside its own `<td>`, so unlike the Phase 3 settings rows it needs no
  `form` attribute gymnastics.
- **An emptied field clears the target; `0` is stored as a real target.**
  "Spend nothing here" and "don't plan this" are different intentions, so one
  input value cannot mean both. The page lead says so explicitly, since the
  behaviour is otherwise invisible.
- **`FormState` gained an optional `message`** for the copy result. A copy of
  nothing and a copy of everything look identical on the re-rendered page;
  every other action in the app is self-evident on success and sets nothing.
- The bar's percentage label sits **beside** the track, not inside it, so it
  stays legible at any fill width in either theme.

**`Placeholder` and its stylesheet were deleted** — `/budget` was their last
user, which is what PLAN.md said would happen.

### How Phase 6 was verified

```text
npx tsc --noEmit         clean
npx biome check src/     clean — same 4 pre-existing warnings
npm run build            10 routes
```

Then **60 of 60** end-to-end checks against the running app, driving the real
budget forms *and* the real transaction form over HTTP, asserting against
Firestore for every stateful claim.

| Area | Verified |
| --- | --- |
| Empty plan | A row per target, all unplanned; **rendering the page writes nothing** |
| Set | A saldo target of 1200 and a category target of 300, written under the derived ids with the right `scope` — two documents, no more |
| Upsert | Re-saving the saldo at 1000 replaced the amount and left the count at two; the row came back carrying its budget id |
| Independence | R$ 480 real (R$ 960 total) on "Mercado e feira"/"Essenciais" consumed **48% of the saldo's own 1000** while the category showed **acima do planejado** against its 300 — the two axes measured separately, from one transaction |
| Expense-only | A R$ 5.000 receita in the same month changed neither row |
| Real vs total | The row leads with 480,00 and carries 960,00 beneath |
| Remaining | −180,00 on the category |
| Clear vs zero | An empty field deleted the document and left the other target alone; `0` was stored as a target, and a zero target with spend reads as over budget |
| Validation | −50 refused ("cannot be negative"), `"abc"` refused ("must be a number"), an unknown `targetId` refused ("was not found") — and nothing written in any of the three cases |
| Copy | An unplanned target copied at its source amount; an already-planned one **not overwritten**; the result reported; a second press duplicated nothing |
| Isolation | The next month shows neither the spend nor the targets; `?month=banana` falls back instead of erroring |

The harness deleted its two transactions **through the delete action** so the
balances unwound, removed all five budget documents, and re-asserted the account
and saldo against their pre-run figures. Firestore ended identical to its
pre-run state.

One assertion failed on the first run and was the *harness* being wrong: it
expected the hidden `budgetId` of an unplanned row to be absent, where React
renders `value=""`. Confirmed against the actual HTML before changing anything —
the third time in this project that an HTML-shaped assumption, not the code, was
at fault.

### Left open after Phase 6

- **Nothing archives a stale budget.** Archiving a saldo stops `copyBudgets`
  from carrying its target forward, but the current month's budget document
  survives, and the row stays visible because it carries money. That is the
  intended reading — the plan for a month that already happened shouldn't
  silently change — but there is no way to clean up such a row except emptying
  its field, and an archived target's row is still editable.
- **The two section footers invite a comparison they don't support.** They are
  labelled per-section and the page lead says the axes don't reconcile, but two
  "Total" rows with different numbers on one screen is the kind of thing worth
  re-reading once there is real data in it.
- **Still no test framework.** `buildBudgetRows` is the most logic-dense pure
  function in the app — status thresholds, row inclusion, three different totals
  — and it is covered only through the UI. Vitest over `src/lib` remains the
  cheap, high-value addition flagged since Phase 1.
- **Firestore is back to the Phase 3 seed** with zero transactions and zero
  budgets, so the app is ready to be used for real.

---

## Phase 7 — Polish and documentation

The last phase. No features: a sweep over the error and empty states, the
removal of two pieces of dead weight, and the tooling made to report zero errors
so that it stays worth running.

### The empty/error-state audit found nothing missing

Every one of the eleven routes was read end to end. The pattern the earlier
phases established had already been applied everywhere:

| Route | On a failed read | On a first run |
| --- | --- | --- |
| `/transactions` | `ErrorBanner` per result, header still drawn | "crie uma conta, um saldo e uma categoria", linked to settings |
| `/transactions/new` | ditto, plus a separate banner when only the `?from=` source fails | same three-way check, against the **active** lists |
| `/transactions/[id]/edit` | ditto — deliberately *not* `notFound()` | n/a |
| `/budget` | `ErrorBanner` per result | "crie ao menos um saldo e uma categoria", linked to settings |
| `/settings/{accounts,saldos,categories}` | `ErrorBanner` instead of the manager | `EntityLabels.empty`, inside the table |

Two gaps were real, and both were about *reachability* rather than a missing
message.

**The edit form's "Voltar ao extrato" dropped the month.** The link in the
header pointed at a bare `/transactions` while the cancel button beside the form
pointed at the month the record belongs to, so leaving by the header silently
moved you to the current month and the transaction you had just been editing was
nowhere on screen. The header is now a function of its href: the error branches
pass `/transactions`, because before the record is read there is no month to go
back to, and the success branch passes the record's own month. This is the
convention CLAUDE.MD already stated for *writes* — "a write redirects to the
month of the record, not the month of the form" — applied to the way out as well
as the way through.

**Nothing handled a URL that isn't a route, or a throw that isn't an
`ActionResult`.** Two files, both new:

- [src/app/not-found.tsx](src/app/not-found.tsx) — the 404, inside the app shell
  with a link back to the ledger. It is explicitly *not* where a missing record
  lands: `getTransaction` returns `{ok: false, error}` and the page renders that
  message, because "this transaction was deleted" and "this address does not
  exist" are different things to be told. Verified both ways round.
- [src/app/error.tsx](src/app/error.tsx) — the boundary for anything that
  throws. Reaching it means a bug, since the actions never throw, so it shows
  `error.message`, the `digest` (in production that digest is the only handle on
  the server-side log, where the real message goes), a `reset` button and a way
  out. Named `RouteError`, not `Error`: Biome's `noShadowRestrictedNames` is
  right that shadowing the global is a trap, and Next only cares that it is the
  segment's default export.

### `duplicateTransaction` was deleted

Phase 5 replaced it with the `?from=` prefill route and it has had no caller
since. Keeping a verified-but-unused action looked harmless, but it is an
affordance pointing the wrong way: a server-side copy must write immediately,
and these transactions are recurrent yet *variable*, so it would save the wrong
amount and then need an edit. A comment in its place in
[src/database/transactions.actions.ts](src/database/transactions.actions.ts)
records why duplication has no action of its own, which is the part that was
worth keeping. `strip` and `UpdateTransactionInput` both stay — `updateTransaction`
still uses them.

### The `firebase` client package is gone

`npm uninstall firebase` — 80-odd transitive packages out of the lockfile. Only
`firebase-admin` was ever imported (verified by grep across `src/` first), and
CLAUDE.MD forbids the client SDK outright, so the dependency was a standing
invitation to write code that bypasses the whole Server Action layer.

### Tooling — `npm run lint` now reports zero errors

It reported four before, none of them about this project's code: the formatter
disagreeing with `package.json`, `.claude/settings.local.json`, `next.config.ts`
and `tsconfig.json`. A lint command that always fails is a lint command nobody
reads, so [biome.json](biome.json) now draws the line at ownership —

- `package.json`, `package-lock.json` and `.claude/` are **excluded**. npm and
  Claude Code rewrite those on their own schedule; tab-formatting them is a
  fight that restarts with the next install.
- `next.config.ts` and `tsconfig.json` were **formatted** — they are hand-edited
  and stable, so they should match the project.
- `next.config.ts` gets the same `noDefaultExport: "off"` override `src/app/**`
  already had, for the same reason: the framework requires the default export.

Four **warnings** remain, all in files written before this plan started, and all
deliberately left:

| Warning | Why it stays |
| --- | --- |
| `noDefaultExport` on [src/database/db.ts](src/database/db.ts) | `import db from "@/database/db"` reads the way the one global handle should; renaming it touches every action file to satisfy a style rule |
| `noEnum` on `TransactionType` | The enum's *values* (`"expense"`, `"income"`) are stored in Firestore documents. A union of string literals would be equivalent, but this is the vocabulary the data is written in |
| `useNamingConvention` ×2 on `EXPENSE` / `INCOME` | Biome wants `Expense`/`Income`. Screaming case for enum members is the more common TypeScript convention and the members are referenced throughout the data layer |

They are listed in CLAUDE.MD so that a future reader sees four accepted
warnings rather than four unfinished jobs.

### How Phase 7 was verified

```text
npx tsc --noEmit         clean
npm run lint             0 errors, 4 accepted warnings
npm run format           clean
npm run build            10 routes
```

Then **35 of 35** end-to-end checks against the running app:

| Area | Verified |
| --- | --- |
| Routes | All 11 URLs render 200, including `?month=`, `?archived=1` and `?from=` |
| 404 | `/nao-existe` returns **404** with the app's own page, the shell and nav intact, and a link back |
| 404 vs missing record | `/transactions/<unknown>/edit` returns **200** with `Transaction "…" was not found` in a `role="alert"` banner, and does *not* claim the route is missing |
| Regression | The canonical R$ 90 / R$ 45 split bill still moves the account by −90/−45 and writes exactly one document, after the `transactions.actions.ts` edit |
| Back link | The edit page's "Voltar ao extrato" points at `?month=2026-10` — the record's month — and no month-less copy is left on the page |
| Duplication | `?from=` still opens prefilled, announces itself as a duplication, and **writes nothing on GET**, with `duplicateTransaction` deleted |
| Budget | Both sections render and the plan measures the R$ 45 real share |
| Teardown | Deleted through the delete action; balances back to 1500/1500; no budget documents created |

Firestore ended identical to its pre-run state (1 account, 1 saldo, 2
categories, 0 transactions, 0 budgets).

**What the harness could *not* check: `error.tsx`.** A probe route that throws
proved the boundary is reached — the dev server answered 500 and serialized
`{digest, message: "boom: …"}` into the flight payload, which is exactly what
the component consumes — but `error.tsx` is a Client Component, so it renders
after hydration and `curl` only ever sees the shell. The probe also had to be
deleted rather than kept: a page that throws is prerendered at build time and
**fails `npm run build`**. So the boundary is wired and its input confirmed; its
rendered output is unverified and needs a browser.

Two harness bugs were found and fixed before any product code was touched, both
the same weak-oracle mistake in a new costume:

1. `name="description"` matched the `<meta name="description">` in `<head>`
   before the form, so the scraped "form" contained no `$ACTION_*` fields and
   every POST failed. Switched to `id="description"`.
2. Asserting on raw HTML found "Página não encontrada" on a page that never
   displays it: Next serializes **every boundary the route can render**,
   `not-found` included, into the RSC flight payload inside `<script>` tags.
   The harness now strips script blocks before matching.

### Left open after Phase 7

- **`error.tsx` has never been seen rendered.** See above — it needs one manual
  look in a browser, and there is no way to provoke it that survives a build.
- **No authentication.** Unchanged and unplanned: every Server Action is
  reachable by anyone who can reach the app, and the Admin SDK bypasses
  Firestore security rules by design. Fine on `localhost`, and the one thing
  that must be built before this is deployed anywhere public.
- **Deployment needs the service account as an env var.**
  [src/database/firebase.config.js](src/database/firebase.config.js) imports
  `serviceAccountKey.json` from disk, and that file is gitignored, so a deploy
  will not have it.
- **Still no test framework.** Flagged in every phase since the first and never
  taken up. `src/lib/rollup.ts` and `src/lib/month.ts` are pure, Firestore-free
  and the densest logic in the app; Vitest over them stays the cheapest
  available improvement.
- **The archived-target budget row**, carried over from Phase 6: archiving a
  saldo stops `copyBudgets` carrying it forward, but a target already set for
  the current month survives and its row stays editable. Intended, and still
  worth a second look once there is real data.
