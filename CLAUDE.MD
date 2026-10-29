# CLAUDE Instructions

## RULES

I want to create a finance organizer, where I can store my transactions with flexibility and organization. Because I split a lot of everyday expenses with other people, I need to be able to register, for example, the total amount I paid and the real amount, discounting other people's part (for instance, a internet bill that I split, is dicounted as R$ 90 from my checking account, but I actually paid R$45 because it's split 50/50).
I want to be able to assing the account, the refereced saldo*, the category, date, description to each transaction.

*"Saldos" are like categories, but are more generic, as my categories are more specific. For instance, a "saldo" is "Essentials" and the categories are "Housing", "Health" and "Groceries".

The main features I want achieve in this project are:

[X] CRUD all entities described at `src/types/index.ts`;
[] See all the monthly transactions;
[] Plan the monthly budget by "Saldos" and "Categories";
[] Have a way of duplicating transactions (so for not fixed but recurrent transactions I can just copy them instead of filling the information from scratch.);

## DATA LAYER

The Firestore data layer is built. Entities live in four root collections — `accounts`,
`saldos`, `categories`, `transactions` — and are reached only through Server Actions.

### Files

| File | Purpose |
| --- | --- |
| `src/database/db.ts` | Exports the Firestore handle. **Admin SDK only** — never the client `firebase` package. |
| `src/database/*.actions.ts` | One file per entity, each marked `"use server"`. The only public API. |
| `src/database/entities.ts` | Shared CRUD behind accounts/saldos/categories. Two shapes: `createNamedEntity`/`updateNamedEntity` (name only — categories) and `createBalanceEntity`/`updateBalanceEntity` (name + two balances — accounts and saldos, which are structurally identical, so their logic exists once). Also `assertActive(collection, id, label)`, the shared exists-and-not-archived guard. |
| `src/database/validators.ts` | Hand-rolled validation primitives, no dependency. |
| `src/database/result.ts` | The `ActionResult<T>` envelope. |
| `src/database/collections.ts` | Collection names and the `withId` snapshot mapper. |

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
* **No composite indexes.** The selective `date` range runs in Firestore
  (ISO `YYYY-MM-DD` strings sort lexicographically); `archived` and id-equality
  filters are applied in memory. Personal-scale data, zero index setup.
* **Saldo and category are independent tags.** A transaction carries both, but
  any category may pair with any saldo — neither nests inside the other. Each
  reference is validated only for existence and active status on write.
* `realAmount` may never exceed `totalAmount`; money is rounded to 2 decimals on
  every balance write.

## UI LAYER

Three thin layers sit on top of the data layer. `src/database` stays a pure,
route-unaware data API: it knows nothing about routes, `FormData`, or React.

| Layer | Purpose |
| --- | --- |
| `src/lib/*.ts` | Pure helpers — month arithmetic (`month.ts`), currency format and form parsing (`money.ts`). Sync and Firestore-free, so they can be imported anywhere and cannot live in a `"use server"` module. |
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
* **Design tokens, not literal values.** Colour, spacing and radius all come from
  the custom properties in `src/app/globals.css`, defined in *both* the light and
  dark block. Money uses `tabular-nums` so columns align on the decimal point.
* **Never swallow a failed `ActionResult`.** Render its `error` — a blank page is
  worse than a visible message.

## STATUS

**Data layer** — CRUD is done for all four entities, including
`duplicateTransaction(id, overrides)` for the recurrent-transaction copy feature
and `listTransactions({from, to, ...})` for the monthly view. Note the Firestore
database is currently **empty**: the original end-to-end verification ran against
test data that was cleared afterwards.

**UI** — the app shell, design system, and all three layers above are in place.
The feature routes (`/transactions`, `/budget`, `/settings`) exist and resolve,
but render placeholders.

**Still open** — the settings CRUD screens, the monthly transactions view, the
transaction form with duplication, and monthly budget planning by
saldo/category, which also needs a new `budgets` collection.

See [PLAN.md](PLAN.md) for the phased plan and
[IMPLEMENTATION.MD](IMPLEMENTATION.MD) for what each finished phase actually
produced, including where it departed from the plan.
