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

### Status

CRUD is done for all four entities, including `duplicateTransaction(id, overrides)`
for the recurrent-transaction copy feature and `listTransactions({from, to, ...})`
for the monthly view. Verified end-to-end against real Firestore.

Still open: the UI, monthly budget planning by saldo/category, and
`revalidatePath(...)` calls in the mutating actions once routes exist.
