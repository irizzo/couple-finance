# Improvement Implementation Log

Running record of [IMPROVEMENT_PLAN.MD](IMPROVEMENT_PLAN.MD) as it gets built. One
section per phase, written when the phase lands. [CLAUDE.MD](CLAUDE.MD) stays the
spec; [IMPLEMENTATION.MD](IMPLEMENTATION.MD) is the history of the original plan;
this file is the history of the improvement track.

**Standing decision (from the owner, after Phase A):** keep
`scripts/backfill-descriptions.mts` for the whole improvement track, then
**delete it as the last step of Phase E**.

| Phase | Status |
| --- | --- |
| A — `description` through the data layer | **Done** |
| B — `description` in the UI | **Done** |
| C — The four defects (G1–G4) | **Done** |
| D — Tests over `src/lib` | **Done** |
| E — The auth gate, and the deployment key | Not started |

---

## Phase A — `description` through the data layer

`Account`, `Saldo` and `Category` now carry `description: string`. It is optional
on the way in and always stored: an omitted description is written as `""`, the
same way `archived: false` is always written. No UI yet. The settings screens
still send only what they sent before, and that keeps working unchanged.

### Changes in Phase A

**[src/types/index.ts](src/types/index.ts)**

- `description: string` on `Account`, `Saldo` and `Category`, plus a doc comment
  separating it from `Transaction.description`. That one is required and says
  what the lançamento *was*. This one says what the bucket is *for*.
- `DescriptionInput = { description?: string }`. The three `Create*Input` types
  now `Omit` `description` and intersect it back in as optional. The three
  `Update*Input` types add it to their `Pick`.

**[src/database/validators.ts](src/database/validators.ts)**: two primitives in
the existing style, no dependency.

- `optionalText(value, maxLength = 280)`. `undefined`, `null` and `""` pass. A
  non-string gets `"must be text"`. Text over the cap gets
  `"must be at most 280 characters"`.
- `trimmedText(value)`. A string comes back trimmed, anything else comes back
  `""`. This is what turns "field absent" into the stored `""`.

**[src/database/entities.ts](src/database/entities.ts)**

- `description: string` added to both shared shapes, `BalanceEntity` and
  `NamedEntity`. All three entities pick it up through the existing generics.
  None of the three `*.actions.ts` files needed an edit.
- `createNamedEntity` / `createBalanceEntity` validate with `optionalText`
  inside the existing `collect({…})`, so a bad description is reported together
  with a bad name. Both write `description: trimmedText(…)` next to
  `archived: false`, with the same "mandatory, not a default" comment.
- `updateNamedEntity` now returns "Nothing to update" only when name *and*
  description are both `undefined`. Validation and the patch are built
  conditionally, the way `updateBalanceEntity` already built its own.
- `updateBalanceEntity` adds `description` to the conditional `collect`, the
  patch, and the guard, which now checks three fields.
- `assertActive` reads `snap.data() as { archived: boolean }` instead of
  `withId<NamedEntity>(snap)`. The guard reads only `archived`, so it no longer
  claims to read every field `NamedEntity` grows.

**[scripts/backfill-descriptions.mts](scripts/backfill-descriptions.mts)**, new.
It uses the Admin SDK and iterates the three collections. Each document whose
`description` is not a string gets `{description: ""}`, in one batch per
collection. It is a `.mts` file, so `tsconfig.json`'s `**/*.mts` include
typechecks it. Node 24 strips the types natively, so it runs with plain
`node scripts/backfill-descriptions.mts` and no extra tooling.

### Departures from the plan in Phase A

- **`DescriptionInput` is exported.** The plan had it module-private. Biome's
  `useExportsLast` then flagged it as a fifth lint warning, because it sat
  between exports. Exporting it is the smallest fix, and the lint count is back
  to the 4 accepted warnings.
- **`optionalText` measures the trimmed text.** The stored value is trimmed, so
  the cap applies to that. 280 characters plus surrounding spaces is accepted.
  The UI's `maxLength={280}` in Phase B caps the raw input anyway.
- **`assertActive` casts `snap.data()`, not `withId<{archived}>`.** `withId`
  requires an `id` in its type parameter, and the guard has no use for one.
- **The backfill fixes any non-string `description`, not only a missing one.**
  Either way the document breaks the `string` type, so both get the same fix.
- **The backfill gained a `--dry-run` flag.** It touches the live database, so
  the first run only reported what it would change.
- **The `description` convention went into [CLAUDE.MD](CLAUDE.MD) now, not in
  Phase B.** The rule lives in the data layer and holds from this phase on. The
  spec should not lag behind it by a phase.

### Backfill

The database had grown past the plan's last recorded state of 1 account,
1 saldo and 2 categories. It now has 2 accounts, 2 saldos and 3 categories, all
in real use. The dry run, the real run, and a second dry run:

```text
dry run   accounts: 2 documents, would backfill 2
          saldos: 2 documents, would backfill 2
          categories: 3 documents, would backfill 3
real run  backfilled 2 / 2 / 3
re-run    would backfill 0 / 0 / 0
```

All 7 documents now have `description: ""`, and the script is safe to run again.

### How Phase A was verified

```text
npx tsc --noEmit         clean, including scripts/backfill-descriptions.mts
npm run lint             0 errors, 4 accepted warnings
npm run build            10 routes
```

Then **33 of 33** checks against live Firestore. They called the real action
modules (`createCategory`, `updateCategory`, `createAccount`, `updateAccount`,
`createSaldo`, `assertActive`) and asserted against the stored documents, not
the return values:

| Area | Verified |
| --- | --- |
| Create, name only | `createCategory({name})` succeeds, and the document stores `description: ""`: present and empty, not missing. `archived: false` is still written. |
| Create, with text | `"  Moradia e contas fixas  "` is stored trimmed. Accounts and saldos store it too. |
| Validation | A non-string gets "must be text". 281 characters get "must be at most 280 characters". A blank name and a bad description are reported **together**. Nothing is written for any refused create. |
| Clear | `updateCategory(id, {description: ""})` clears it, and the name is untouched. |
| Rename | A name-only update leaves the description untouched. The returned record merges the patch over the stored document. |
| Nothing to update | `{}` is still refused, for categories and accounts alike. |
| Balance entities | A description-only `updateAccount` leaves `name`, `initialAmount` and both balances untouched. A rebase and a clear in one patch shift both balances and clear the text. |
| `assertActive` | Active → `null`, archived → "is archived", unknown id → "was not found". The narrowed cast changed nothing. |
| Teardown | Every fixture was deleted, and all three collections are back to their pre-run sizes. |

**Closing the Phase 1 open item without `tsx`.** [IMPLEMENTATION.MD](IMPLEMENTATION.MD)
noted that the `"use server"` action modules cannot run outside Next without
adding `tsx`, because of the `@/*` alias. Node 24 can do it alone. A
twenty-line resolve hook loaded with `--import` maps `@/` onto `src/`, adds the
extensions the bundler would infer, and loads `serviceAccountKey.json` as an ESM
default export. `--experimental-transform-types` covers the one non-erasable
construct, the `TransactionType` enum. The `"use server"` directive is a bare
string, so it is harmless outside Next. The hook and the harness lived in the
session scratchpad and are not part of the repo. Phase D's Vitest will cover
`src/lib` properly. This trick is for the Firestore-backed layer that Vitest
will not reach.

### Left open after Phase A

- **No UI path writes a description yet.** The adapters do not read the field,
  so every entity created from the settings screens gets `""`. That is correct,
  and it is Phase B's job.
- **`withId` is still a blind cast.** The backfill covers the documents that
  exist today. Phase B also adds `?? ""` at every render site, so a document
  that slipped through shows a blank cell, not `undefined`.
- **`scripts/backfill-descriptions.mts` is kept for now.** The plan calls it
  throwaway. It has run against the only database there is, and it is
  idempotent. **Decided by the owner:** keep it until the end of the improvement
  track, then delete it. See the standing decision at the top of this file.
- The Admin SDK prints "The `credentials` option is deprecated" when the script
  starts. That comes from `google-auth-library` inside `firebase-admin`, not from
  this code. It was not investigated further. Phase E rewrites how
  [firebase.config.js](src/database/firebase.config.js) builds its credential,
  which is the natural place to look at it.

---

## Phase B — `description` in the UI

A description can now be set on create, edited in place, and cleared on all
three settings screens. It also appears as a muted second line under the
target's name on `/budget`. As decided in the plan, it does not appear in the
transaction form's `<option>`s.

### Changes in Phase B

**Adapters**: [accounts.ts](src/app/_actions/accounts.ts),
[saldos.ts](src/app/_actions/saldos.ts) and
[categories.ts](src/app/_actions/categories.ts). Both the create and the update
call now pass `description: textField(formData, "description")`. On an update,
`""` means "cleared": the row always submits the input, so an empty field is a
deliberate choice, not an absent one. The comment on each update call says so.

**[entity-labels.ts](src/components/entity-labels.ts)**: `EntityLabels` gained
`description` and `descriptionPlaceholder`, passed in from each page so the
article agrees in gender:

| Page | `description` | `descriptionPlaceholder` |
| --- | --- | --- |
| Contas | Descrição **da** conta | Conta conjunta para as despesas da casa |
| Saldos | Descrição **do** saldo | Contas fixas, mercado e saúde |
| Categorias | Descrição **da** categoria | Compras do mês e da feira |

**The two managers**:
[BalanceEntityManager](src/components/BalanceEntityManager.tsx) and
[NamedEntityManager](src/components/NamedEntityManager.tsx).

- The create form has a description `Field` between the name and the amount, as
  an `<input type="text">`, not a `<textarea>`. The create form asks for the
  same one line the row lets you change. It carries the hint "Opcional", which
  is not gendered, so it is written inline like the existing "Saldo de
  abertura".
- A `Descrição` column follows `Nome`.
- The empty-state `colSpan` is now 6 for balance entities (was 5) and 3 for
  categories (was 2).

**The two rows**: [BalanceEntityRow](src/components/BalanceEntityRow.tsx) and
[NamedEntityRow](src/components/NamedEntityRow.tsx). `BalanceEntityView` and
`NamedEntityView` gained `description: string`. Each row has a new `<td>` whose
input joins the row's form through `form={formId}`. Its `defaultValue` ends in
`?? ""`, so a document that missed the backfill shows a blank cell. The error
row's `colSpan` is 6 and 3. A new `.descriptionInput` (`min-width: 14rem`) in
[EntityManager.module.css](src/components/EntityManager.module.css) stops the
column from collapsing next to the name.

**The budget table.**

- [rollup.ts](src/lib/rollup.ts): `BudgetTarget` and `BudgetRow` gained
  `description`. `buildBudgetRows` copies it through, and the `(removido)` row
  gets `""`.
- [BudgetTable](src/components/BudgetTable.tsx) renders it as a second line in
  the target cell, only when it is non-empty. The test is truthiness, not
  `!== ""`, so an `undefined` from an unbackfilled document prints nothing.
- [BudgetTable.module.css](src/components/BudgetTable.module.css) has one new
  class, `.targetDescription`, built from existing tokens (`--muted`,
  `--space-1`). It is `display: block` with `max-width: 24rem`. The cap limits
  the cell's intrinsic width, so a 280-character description wraps instead of
  stretching the table.
- [src/app/budget/page.tsx](src/app/budget/page.tsx) needed no change, as the
  plan predicted. It already passes the whole saldo and category documents.

### Departures from the plan in Phase B

- **The row error chain was reordered, not just extended.** The plan said to
  add `fieldErrors?.description` to each row's `problem` chain. As written,
  that line would have been dead code. The chain started with
  `updateState.error`, and a validation failure *always* sets that ("Invalid
  saldo") alongside its `fieldErrors`. So every field message after it, the
  existing `nameError` and `amountError` included, could never be shown. The
  harness caught it: a 281-character description came back as "Invalid saldo"
  instead of the cap message. The chain now puts the field messages first,
  which is the precedence the create forms already had: `Field` shows each
  message under its input, and the banner is hidden whenever `fieldErrors`
  exist. This bug predates this track. In the browser it was nearly invisible,
  because `required`, `type="number"` and now `maxLength` stop most invalid
  input before it is sent.
- **The 280 cap is one exported constant.** The plan wrote `maxLength={280}`
  as a literal in four places. [validators.ts](src/database/validators.ts) now
  exports `TEXT_MAX_LENGTH`, `optionalText` uses it as its default, and all four
  inputs import it, so the client cap and the server cap cannot drift apart.
  This is the first time a component imports from `src/database`. That is safe
  only because `validators.ts` is pure, the same reason `src/lib` already
  imports `round2` from it. [CLAUDE.MD](CLAUDE.MD) now says the file must stay
  that way.
- **[CLAUDE.MD](CLAUDE.MD)'s field rule was already written in Phase A.** This
  phase adds the two UI conventions it exposed instead: where a description is
  shown, and field-before-form error precedence.

### How Phase B was verified

```text
npx tsc --noEmit         clean
npm run lint             0 errors, 4 accepted warnings
npm run build            10 routes
```

Then **41 of 41** end-to-end checks against `npm run dev`. The harness drove
the real forms over HTTP: it scraped each form's `$ACTION_*` fields, plus every
input joined to it by `form="edit-…"`, and POSTed them back. It asserted state
against Firestore, and text against HTML with scripts stripped and `<!-- -->`
separators removed.

| Area | Verified |
| --- | --- |
| Columns | All three settings tables have `Descrição` right after `Nome`. All three create forms have the field with `maxLength="280"`. |
| Name-only create (plan check 1) | A category created with the field left blank writes exactly one document with `description: ""`, and its row renders an empty input. |
| Create with both | An account with a name, a description and R$ 250 stores the text **trimmed** and seeds both balances at 250. Its row input shows the stored text. |
| Edit without the name | A saldo's description saved from its row. The name and `initialAmount` are unchanged. |
| Clear | Emptying an account's field and saving stores `""`. The name and both balances are untouched. |
| Validation, create | A 281-character description, POSTed past `maxLength`, writes nothing. The cap message is rendered, and the typed name is echoed back. |
| Validation, row | The same in a row leaves the stored text unchanged and shows the **cap message**, not "Invalid saldo". A blank name shows "must be a non-empty text". The error row spans 6 columns, or 3 for categories. |
| `/budget` | The saldo's and the category's descriptions render under their names, inside the same target cell. A target with an empty description renders **no** second line. There is exactly one second line per described target. |
| `undefined` (plan check 2) | None of `/settings/accounts`, `/settings/saldos`, `/settings/categories`, `/budget` or `/transactions` renders the string anywhere. |
| Teardown | Every fixture deleted. The backfill dry-run reports 2 / 2 / 3 documents and 0 missing the field, which is exactly the pre-run state. |

The first run was 37 of 38. The one failure was the error-chain bug above, a
real defect and not a harness mistake. The plan's own instruction would have
left it in place.

### Left open after Phase B

- **Server messages are still English.** The cap message reads "must be at most
  280 characters" in an otherwise Portuguese UI. That is true of every message
  from the data layer ("must be a non-empty text", "cannot be negative"), so it
  is an app-wide choice rather than something this phase introduced. Not
  scheduled.
- **No visual check in a browser.** The harness proves the markup, the classes
  and the data, but not how the new column and the budget second line look in
  either theme. The plan's verification step 9 (`error.tsx`) already calls for
  one browser session. Both can be looked at together.
- **`scripts/backfill-descriptions.mts` stays** until the end of Phase E, per
  the standing decision.

---

## Phase C — The four defects

G1–G4 are all fixed. None changes the data model. G3 and G4 change no visible
behaviour on today's data, G1 changes one cell on archived budget rows, and G2
changes no visible behaviour on the current Next version. Each is described
below by what was actually wrong.

### G1 — an archived budget row offered an input that could not save

**[BudgetRowForm](src/components/BudgetRowForm.tsx)** gained an `editable`
prop. A read-only row renders exactly what the data layer permits:

| Row | Planned cell |
| --- | --- |
| Active target | The input and "Salvar", unchanged |
| Archived, with a plan | The figure as text, and one **"Limpar"** button |
| Archived, no plan (shown only for its spend) | `—` |
| `(removido)` (see G4) | The figure as text, or `—`. No button: there is no single budget document behind a sum. |

"Limpar" submits a hidden empty `plannedAmount` plus the `budgetId`. That is the
adapter's existing "remove this target" signal, which calls `deleteBudget`, and
`deleteBudget` has no active check. It goes through `ConfirmSubmit`. Once
removed, an archived target cannot be planned again in that month without
restoring it first, so it counts as a hard-to-undo action. The confirm text says
"o alvo está arquivado", which avoids the saldo/categoria gender agreement.
`ConfirmSubmit`'s doc comment now lists it as the third such path.

**[BudgetTable](src/components/BudgetTable.tsx)** lost its own branch. It used
to special-case `row.targetId === ""` with a `—`. It now always renders
`BudgetRowForm` with `editable={!row.archived && row.targetId !== ""}`, and
every read-only case is decided in one place.

### G2 — settings writes revalidated one route

All **12** write adapters across [accounts.ts](src/app/_actions/accounts.ts),
[saldos.ts](src/app/_actions/saldos.ts) and
[categories.ts](src/app/_actions/categories.ts) now call
`revalidatePath("/", "layout")`. That is create, update, archive and unarchive
in each file. The `PATH` constants are gone. The reason is written once, in the
`accounts.ts` header, and the other two files point at it. The
[budgets.ts](src/app/_actions/budgets.ts) header now contrasts budgets with
"a transaction or entity write". The grep afterwards: 12 entity calls and 3
transaction calls use the layout, and only the 3 budget calls stay narrow.

**What this fixes, honestly stated.** Next 16's bundled docs
(`node_modules/next/dist/docs/…/revalidatePath.md`) say that a Server Function's
`revalidatePath` *currently* "causes all previously visited pages to refresh
when navigated to again. This behavior is temporary." Every page here is also
dynamic, so the server renders fresh on each request anyway. The narrow calls
therefore worked **by accident**. `("/", "layout")` is the documented way to
purge the client cache, so the app now depends on the contract, not on behaviour
Next has said it will remove. This is a latent bug fixed, not a visible one.
[CLAUDE.MD](CLAUDE.MD) now warns against relying on the temporary behaviour.

It also closes the item [IMPLEMENTATION.MD](IMPLEMENTATION.MD) carried from
Phase 3 to Phase 5 ("the settings adapters may need widening"). That historical
log is left as written.

### G3 — `copyBudgets` ignored `scope` when checking the target was active

[budgets.actions.ts](src/database/budgets.actions.ts) now has a small
`activeIds(docs)` helper and a `Record<BudgetScope, Set<string>>`. Each source
budget is checked only against the collection its own `scope` names, the same
lookup `setBudget` makes through `collectionFor`. The lookup is
`activeByScope[budget.scope]?.has(…)`. The `?.` is there because `withId` is a
blind cast, so a stored budget with an unknown scope is skipped rather than
crashing the whole copy.

### G4 — an orphaned plan vanished

[rollup.ts](src/lib/rollup.ts)'s `buildBudgetRows` now sums the planned amounts
of budgets whose target id is not among the entities, next to the orphaned
spend it already summed. The trailing `(removido)` row renders when **either**
is present, not only spend. It carries `planned` (or `null`), `budgetId: null`,
and `remaining`, `status` and `ratio` computed by the **same** `statusFor` and
`ratioFor` as every other row. Because of that, `section.planned` and
`section.remaining` need no special case. The section's planned total now agrees
with `listBudgets` whatever has been deleted out from under it.

### Departures from the plan in Phase C

- **"All six adapters" became all twelve.** The plan said six, but each of the
  three files has four writes, and archive and unarchive are exactly the ones
  the plan names as reaching other screens. All twelve were widened.
- **Plan check 4 described the filter wrongly.** It expected the ledger's
  filter select to *drop* an archived category. The filters deliberately list
  archived entities, with an "(arquivada)" suffix, because a past transaction
  can still point at them. The check was run as "gains the suffix".
- **G2 is latent, not visible.** The plan said settings writes left other
  screens stale. On Next 16.2 they did not, for the two reasons above. The fix
  still stands, for the reason above.
- **"Limpar" asks for confirmation.** The plan said "a single Limpar button",
  and it is one button. It confirms first because the removal cannot be redone
  while the target stays archived.
- **The `(removido)` row computes remaining and status like any other row.**
  The plan only said to fold the plan in. Giving the row the same rules was the
  way to keep the footer sums free of a special case.

### How Phase C was verified

```text
npx tsc --noEmit         clean
npm run lint             0 errors, 4 accepted warnings
npm run build            10 routes
```

Then **41 of 41** end-to-end checks against `npm run dev`. They drove the real
transaction, budget, copy, archive, rename and delete forms over HTTP, and
asserted every state claim against Firestore. **All of it ran on fixture
entities**: their own account, two saldos and four categories, in 2031-02 and
2031-03. The harness refused to start unless both months were empty, and it
compared every real account, saldo and category byte for byte afterwards.

| Area | Verified |
| --- | --- |
| Regression (plan check 7) | The R$ 90 / R$ 45 split bill redirected to its month, wrote one document, moved the account to 910 / 955 and the saldo by −90 / −45. Deleting it from the ledger row brought both back to 1000 / 1000 and 0 / 0. |
| G1 (plan check 3) | R$ 300 planned on a category, R$ 45 spent, then the category archived. The row stays, marked "(arquivada)". There is no number input, and `plannedAmount` appears only as Limpar's hidden empty field. It shows R$ 300,00 as text and exactly one "Limpar". An active row next to it is still editable. Forcing a figure through the Limpar form is refused with "is archived", and the stored plan is unchanged. Limpar deletes the document. Afterwards the row stays for its R$ 45 spend, and its Planejado cell is a bare `—`. |
| G2 (plan check 4) | After the archive, the ledger's filter lists the category with "(arquivada)" and the ledger row shows the hint. After a saldo rename from its settings row, the new name appears on the ledger row and on `/budget`. |
| G4 (plan check 6) | Plans of R$ 200 and R$ 50 on two categories, then the second category document deleted with the Admin SDK. A `(removido)` row appears with **no** orphaned spend. It carries R$ 50,00 and has no input and no Limpar. The category footer reads R$ 250,00, which is the sum of `listBudgets` for that scope. The saldo section has no `(removido)` row. |
| G3 (plan check 5) | February held six budgets: two saldos, three categories, and one saldo-scoped budget pointing at an active **category** id. That last one is the wrong shape the old union set would have accepted. "Copiar plano" reported "3 valores copiados · 3 já definido(s) ou arquivado(s)". It copied both scopes (S1 1000, S2 400, C4 60). It did not overwrite the R$ 200 already set, skipped the archived category, and skipped the mis-scoped budget. A second press copied 0 and added nothing. |
| Teardown | Every fixture budget, transaction and entity was deleted. The real documents are byte-identical to before, and nothing remains in 2031. |

The first run was 40 of 41, and the failure was in the **harness**. It
asserted that the archived row contained no `plannedAmount` input at all, but
Limpar's form needs a hidden empty one. The rendered row was checked first and
was exactly what G1 intends, so the assertion was tightened to "no number input,
and `plannedAmount` only as a hidden empty field".

### Left open after Phase C

- **The plan's two-tab staleness check (plan check 4, as written) needs a
  browser.** Over HTTP every page is fresh by construction, so the harness can
  prove the screens agree but not that the client cache was purged. Add it to
  the single browser session already owed for `error.tsx` and Phase B's visuals.
- **A historical orphaned budget is visible but cannot be cleaned up from the
  UI.** By design, `(removido)` has no single document to delete. If a target
  is ever hard-deleted from the console, its budget documents have to be
  removed there too. Soft delete makes this unreachable through the app.
- **`scripts/backfill-descriptions.mts` stays** until the end of Phase E.

---

## Phase D — Tests over `src/lib`

`src/lib` now has **69 specs** in three files, each beside the module it covers,
run by `npm test`. No application code changed. Nothing outside the specs, the
config and the tooling files was edited. No spec needed a mock, because nothing
they reach touches Firestore.

### Changes in Phase D

**Tooling**

- `vitest@^4.1.12` is the one new dev dependency, which brings Vite 8.3.5 with
  it. `"test": "vitest run"` is the one new script.
- **[vitest.config.mts](vitest.config.mts)** sets three things:
  - `resolve.tsconfigPaths: true`. Vite 8 reads `@/*` from
    [tsconfig.json](tsconfig.json) itself, so the alias is defined once, not
    twice.
  - `include: ["src/**/*.spec.ts"]`.
  - `env: { TZ: "America/Sao_Paulo" }`. See the timezone pin below.
- **[biome.json](biome.json)** gained two override entries:
  - `vitest.config.mts` joins `next.config.ts` in being allowed a default
    export, which a config file needs.
  - `**/*.spec.ts` turns off `noMagicNumbers`. The R$ 90 and R$ 45 in a spec
    *are* the fixture, and naming every amount would hide what is being
    asserted.

  The codebase's only inline `biome-ignore` is on `TZ` in the config. It is an
  environment variable's name, so it cannot be camelCase.

**The specs**

| File | Specs | What they pin |
| --- | --- | --- |
| [month.spec.ts](src/lib/month.spec.ts) | 26 | `currentMonth` and `today` at 22:00 on 31 October in São Paulo, which is already November in UTC, read October and the 31st. `resolveMonth` passes `2027-02` through. It falls back on `2026-13`, `2026-00`, `""`, `undefined`, `null`, `2026-1`, `" 2026-10"`, and on an array (the shape `?month=a&month=b` arrives in). `shiftMonth` crosses the year boundary both ways, moves by more than a year and by 0, and throws on a malformed month. `monthBounds` handles February in 2028, 2027, 2100 and 2000, a 30-day month, and December. `formatMonthLabel` capitalizes, including `Março`. `formatDayMonth` drops the year. |
| [money.spec.ts](src/lib/money.spec.ts) | 17 | `parseAmount` reads `90.5`, `1.234,56`, `90,5`, `" 1 234,56 "`, `0`, and `33.333` as `33.33`. A lone dot is the decimal point: `1.234` → `1.23`. `""`, whitespace, `null`, `abc`, `1,2,3`, `Infinity` and a `File` all give `NaN`, never 0. `round2` absorbs the drift of ten `0.1` adds and of `0.1 + 0.2`. `formatCurrency` keeps its non-breaking space. |
| [rollup.spec.ts](src/lib/rollup.spec.ts) | 26 | `monthSummary` on the canonical R$ 90 / R$ 45 split, netted against income and rounded. A target is measured by `real`, not `total`, and a receita does not reduce it. Status, ratio and remaining against R$ 100 at 0, 79.99, exactly 80, 100, 100.01 and 250 (the ratio clamps). A zero target is over on R$ 0,01 and at its limit with no spend. Unplanned spend has no remainder. Name, description and budget id are copied onto the row. An archived target is dropped when empty and kept with spend or with only a plan; an empty active target stays. The `(removido)` row appears for spend, for a plan, and for both, with two deleted targets collapsed onto one row. It is absent when nothing is orphaned, and the other scope's budgets do not trigger it. `section.remaining` sums planned rows only, and an overrun offsets it. Both sections' spend equals the ledger's, and each plan total equals its own scope's budgets. |

**The timezone pin.** Every caller of `currentMonth` and `today` is a Server
Component: [page.tsx](src/app/page.tsx), [MonthNav](src/components/MonthNav.tsx)
and [transactions/new](src/app/transactions/new/page.tsx). Their "local time" is
therefore the server process's, not the viewer's. The config pins `TZ` to the
users' zone so the clock specs mean the same thing on any machine. Without the
pin they fail on a UTC machine (checked below). [CLAUDE.MD](CLAUDE.MD)'s "local
time" convention now says whose local time it is.

### Departures from the plan in Phase D

- **Vitest 4, not the current 5.** Vitest 5.0.5 declares `@types/node`
  `^22 || >=24` as a peer. This project pins `@types/node ^20`, so npm refused
  the install. Taking 5 would have meant a second dev-dependency change. 4.1.12
  accepts `^20` and keeps the plan's "single dev dependency".
- **`vitest.config.mts`, not `.ts`.** The package has no `"type": "module"`.
  Vite warned that an ESM `.ts` config gets loaded as CommonJS, which its
  upcoming native config loader will not do. `.mts` marks the file as ESM
  without changing how anything else loads, and tsconfig already includes
  `**/*.mts`.
- **No second copy of the alias.** The plan said to teach Vitest the `@/*`
  alias. Vite 8 can read it from tsconfig, so the config points at the existing
  definition instead.
- **Two Biome overrides the plan did not foresee.** "Formatted like everything
  else" holds: tabs, sorted imports, every rule but one. The exceptions are
  `noMagicNumbers` (96 fixture literals) and `noDefaultExport` on the config,
  each scoped to exactly those files. The baseline stays at 0 errors and 4
  warnings.
- **More cases than the plan's table.** The extras are:
  - local-vs-UTC `currentMonth`;
  - `formatMonthLabel` under UTC−3;
  - `real` versus `total`;
  - a zero target with no spend;
  - the section totals agreeing with the ledger.

  Each is a rule already stated in a doc comment or in [CLAUDE.MD](CLAUDE.MD)
  that nothing was checking.
- **`statusFor` and `ratioFor` are tested through `buildBudgetRows`.** They
  stay private, and the specs assert the rows they produce.

### How Phase D was verified

```text
npm test                 3 files, 69 passed
npx tsc --noEmit         clean (specs and config included)
npm run lint             0 errors, 4 accepted warnings
npm run build            10 routes
```

**The specs were mutation-checked.** 26 deliberate breakages were made, one at
a time, on a scratch copy of `src/lib`, `src/types` and `validators.ts`. Each
one turned at least one spec red, so none survived. Some of them, with the
number of specs that failed:

| Breakage | Failed |
| --- | --- |
| Exactly 80% no longer a warning | 1 |
| Ratio no longer clamped | 1 |
| Status measured on `total` instead of `real` | 1 |
| Receitas counted as spend | 2 |
| Budgets not filtered by scope | 2 |
| G4 reverted: orphaned plan dropped | 3 |
| G4 reverted: orphaned spend dropped | 3 |
| Section remainder charged with unplanned spend | 1 |
| `currentMonth` reading UTC | 9 |
| Leap years ignored | 2 |
| `formatMonthLabel` not pinned to UTC | 3 |
| An empty field parsed as 0 | 4 |
| `round2` made a no-op | 7 |

**The timezone pin was checked both ways.** With `TZ=UTC` in the shell, the
suite still passes 69 of 69. With the pin removed from the config and
`TZ=UTC` still set, the clock specs fail, because `currentMonth` reads November.

There was no end-to-end run in this phase and Firestore was not touched. No
runtime code changed, so Phase C's 41 of 41 still describes the app.

### Left open after Phase D

- **A UTC server would get "now" wrong.** This follows from the timezone pin
  above. On a host left at UTC, `today()` would run a day ahead every evening
  from 21:00 São Paulo time. On the last evening of each month,
  `currentMonth()` would run a month ahead too: `/` would redirect to next
  month, `MonthNav` would call next month "current", and a new transaction
  would default to tomorrow. There are two ways to fix it, and choosing one
  belongs to the deployment:
  - run the process with `TZ=America/Sao_Paulo`;
  - have both helpers format with
    `Intl.DateTimeFormat(…, { timeZone: "America/Sao_Paulo" })`.
- **`@types/node` is `^20`, but the runtime is Node 24.** That gap is what kept
  Vitest at 4. Raising the types to `^24` and Vitest to 5 is a small, separate
  change.
- **`round2` rounds the stored binary value, not the decimal one.**
  `round2(1.005)` is `1`, because `1.005` is stored as `1.00499…`. No form can
  reach this, since every money input has `step="0.01"`, so it is noted and not
  pinned by a spec.
- **The browser session is still owed:** Phase B's visuals, `error.tsx`, and the
  two-tab staleness check.
- **`scripts/backfill-descriptions.mts` stays** until the end of Phase E.

### Found ahead of Phase E

- **Next 16.2.9 has published advisories that bear directly on the gate.**
  `npm audit` ran when Vitest was added, and none of its 9 findings come from
  Vitest. Among them:
  - "Middleware / Proxy bypass in App Router applications using Turbopack and
    single locale", fixed in 16.2.11;
  - "Unauthenticated disclosure of internal Server Function endpoints", also
    fixed in 16.2.11;
  - RCEs in the image optimizer and in `use cache`, open through 16.4.0.

  `npm audit` names 16.4.3 as the fix. A middleware gate on 16.2.9 would sit
  behind a published bypass. `next` is pinned exactly, so the upgrade is a
  deliberate edit.
- **`middleware.ts` is `proxy.ts` in Next 16.** The bundled upgrade guide
  deprecates the `middleware` file name and export in favour of `proxy`, which
  always runs on Node. The plan's file names predate the rename.
- **The bundled docs back `requireSession()`.** `proxy.md` says a matcher that
  excludes a path also skips the Server Function calls on that path, and
  advises: "Always verify authentication and authorization inside each Server
  Function rather than relying on Proxy alone."
