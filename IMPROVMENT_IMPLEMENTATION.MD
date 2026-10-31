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
| C — The four defects (G1–G4) | Not started |
| D — Tests over `src/lib` | Not started |
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
