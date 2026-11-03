# Couple Finance — spec and current state

> Updated 2026-11-03, after Phase U8, the last of the new-features track, and
> U8.1, the owner's rule that a shared expense's real amount plus the
> partner's part may not exceed its total (on top of commit `4a4d8c5`, which
> is U7 and the shared amount). This file is the project's spec **and**
> the summary of where it stands: every convention below is in force, and every
> decision worth knowing is recorded here with its reason. The plans and
> implementation logs beside it in `docs/` are history (see "Docs map" at the
> end). Nothing here requires reading them.

## PURPOSE

A personal finance organizer for a couple, in Portuguese (pt-BR, R$). Many
everyday expenses are split with other people, so every transaction records two
amounts: the **total** that left the account and the **real** share actually
owed. An internet bill that takes R$ 90 out of the checking account, split
50/50, has `totalAmount` 90 and `realAmount` 45. Each transaction is also
tagged with an account, a saldo, a category, a date and a description.

### Vocabulary

| Term | Meaning |
| --- | --- |
| **Conta** (account) | Where money physically sits, such as a bank account. |
| **Saldo** | A broad bucket of money, such as "Essenciais". More generic than a category. |
| **Categoria** (category) | A specific kind of spending, such as "Moradia", "Saúde" or "Mercado". **Independent of saldos**: any category may pair with any saldo. |
| **Lançamento** | A transaction. Its type is **despesa** (expense), **receita** (income) or **transferência** (transfer). |
| **Total / real** | What moved in the bank vs. the share genuinely yours. `realAmount ≤ totalAmount`, always. |
| **Orçamento** (budget) | A planned amount for one month on one saldo or one category. |

### Goals

[X] CRUD all entities described at `src/types/index.ts`;
[X] See all the monthly transactions;
[X] Plan the monthly budget by "Saldos" and "Categories";
[X] Have a way of duplicating transactions (so for not fixed but recurrent
transactions I can just copy them instead of filling the information from
scratch).

All four are met. Beyond them, the app gained a `description` on accounts,
saldos and categories, transfers between accounts and saldos, per-user sign-in
with each person's data scoped to them, and a Vitest suite over the pure
helpers.

## STACK AND COMMANDS

| Piece | Choice |
| --- | --- |
| Framework | **Next.js 16.4.3** (App Router), pinned exactly. React 19.2.4. |
| Data | Cloud Firestore through **`firebase-admin` 14.5**: the Admin SDK only, on the server only. |
| Styling | CSS Modules plus the custom properties in `src/app/globals.css`. No UI library. |
| Lint / format | Biome 2.2: tabs, sorted imports, `style` rules as warnings. |
| Tests | Vitest 4.1 over `src/lib`. |
| Runtime | Node 24. |

This Next is newer than most training data. Read the guide in
`node_modules/next/dist/docs/` before writing framework code; `AGENTS.md` (a
block that `next dev` manages, now committed) says the same. Differences already
met here: `params` and `searchParams` are Promises, and `middleware.ts` is now
`proxy.ts`.

```bash
npm run dev       # next dev, http://localhost:3000
npm run build     # production build; must pass
npm test          # vitest run: 186 specs in 6 files
npm run lint      # biome check: 0 errors, 5 accepted warnings
npm run format    # biome format --write
npx tsc --noEmit  # must be clean
```

Runtime dependencies are exactly `next`, `react`, `react-dom`, `firebase-admin`
and `server-only`. A new one is a decision to make with the owner, not a
convenience.

## WHAT HAS BEEN DONE

| Track | What it delivered |
| --- | --- |
| Firestore setup | Entity types, CRUD for accounts, saldos, categories and transactions, stored balances. |
| **Plan, phases 1–7** | 1: categories decoupled from saldos. 2: app shell, design tokens, `src/lib`, form plumbing. 3: settings CRUD. 4: the monthly ledger. 5: create, edit, duplicate and delete transactions. 6: budgets by saldo and by category. 7: empty and error states, the 404 and the error boundary, dead code and the client `firebase` package removed, lint at zero errors. |
| **Improvement track, phases A–E** | A–B: `description` on accounts, saldos and categories, in the data layer and then the UI. C: four defects fixed (below). D: Vitest over `src/lib`. E: Next 16.2.9 → 16.4.3 for published advisories, São Paulo time pinned in code, the shared-password gate, the data layer taken off the Server Action list, the Admin credential read from the environment. |
| **Transfers** (commit `10d130c`) | A third transaction type that moves money between two account+saldo pairs. **Recorded in neither log**: this file is its only documentation. |
| **New features, phases U1–U8** (complete) | Two users, each with their own login and data, shared expenses and a shared dashboard; see `NEW_FEATURES.MD`. **U1 done** (`49ac92f`): the `users` collection, scrypt password hashing (`src/lib/password.ts`) and `src/database/users.actions.ts`. **U2 done** (`8360945`): per-user sign-up (`/signup`, invite code) and sign-in, a session that names its user, `requireUser` in every adapter and data page; the shared password is gone. **U3 done** (`1b6b8e9`): an `ownerId` on every document and the owner as the first argument of every data-layer function; someone else's document reads as not found. **U4 done**: the real data migrated to the owner (`irizzo`) by a throwaway script, after a backup that the owner chose on 2026-11-03 to keep. **U5 done** (`6409e74`): Perfil (`/settings/profile`) for the name, the saldo mode and a password change that signs out every other session; with saldos off a transaction needs no saldo and no screen shows one. **U6 done** (`e85232f`): an expense can be shared with the partner, read-only for them; `listSharedTransactions` is the one cross-owner read. **U7 done** (`4a4d8c5`): the shared dashboard (`/shared`), with what each person paid, the settlement, and filters by who paid and by a category merged by name. **Shared amount** (added after U7 at the owner's request, same commit): a shared expense carries the partner's part (`sharedAmount`), which the dashboard shows first and the settlement nets, so a bill need not be split 50/50. **U8 done**: the full two-user pass in one harness, and the handover docs. Still the owner's: the deploy checklist (see STATUS). **U8.1 done**: on a shared expense, real + part may not exceed the total. |

Every phase ended with `tsc`, lint and build clean, and from Phase 3 on, every
phase that changed runtime behaviour was also checked by an end-to-end harness
against the real app and real Firestore (see TOOLING). Phase D only added
specs. The
four Phase C defects are now conventions below: an archived budget row offered
an input that could never save (G1); entity writes revalidated only their own
route (G2); `copyBudgets` checked targets without regard to scope (G3); a plan
on a deleted target vanished from the totals (G4).

## ROUTES

| Route | What it is |
| --- | --- |
| `/` | Redirects to `/transactions?month=<current>`. `force-dynamic`, because it reads the clock: a prerendered redirect would pin the month it was built in. |
| `/login` | Username and password. Outside the gate, with `/signup`. Shows "Criar conta" while sign-up is available. A signed-in visit redirects to `/`. |
| `/signup` | Invite code, usuário, nome, senha, confirmar senha and the saldo mode. Shows a closed message instead of the form once two users exist or while `SIGNUP_CODE` is unset. A signed-in visit redirects to `/`. |
| `/transactions?month=YYYY-MM` | The ledger: summary cards, conta/saldo/categoria filters, the month's lançamentos, and Editar · Duplicar · Excluir on each row. |
| `/transactions/new` | Create. `?from=<id>` prefills a duplicate. `?month=` sets the way back and the default date. `?returnTo=shared` sends the way back and the redirect after saving to `/shared`. |
| `/transactions/[id]/edit` | Edit. Takes `?returnTo=shared` too. |
| `/shared?month=YYYY-MM&owner=<id>&category=<key>` | The shared dashboard: both people's shared expenses, cards for each person's part (with the total beneath) and the settlement, "Quem pagou" and "Categoria" filters, and Editar · Duplicar · Excluir on the viewer's own rows only. |
| `/budget?month=YYYY-MM` | The plan by saldo and by category, edited in place, plus "copiar plano" from the previous month. |
| `/settings` | Redirects to `/settings/accounts`. A shared layout carries Contas · Saldos · Categorias · Perfil tabs; Saldos only while the user has saldos on. |
| `/settings/{accounts,saldos,categories}` | Create, rename, describe, re-base, archive and restore. `?archived=1` shows archived rows. With saldos off, `/settings/saldos` is a note pointing to Perfil. |
| `/settings/profile` | Perfil: the username (read-only), the name and the saldo mode; and a separate password change (senha atual, nova senha, confirmar). |

`not-found.tsx` and `error.tsx` sit at the app root. Every route is dynamic:
the layout reads the session cookie to decide whether to draw the nav.

## DATA LAYER

The Firestore data layer is built. Entities live in five root collections —
`accounts`, `saldos`, `categories`, `transactions`, `budgets` — and are reached
only through the `*.actions.ts` modules below. Since Phase U3 every document in
them belongs to one user (see "Ownership"). A sixth, `users` (since Phase U1),
holds the two people; sign-up, sign-in and the session check read it. Those
are server code, not Server Actions: the browser reaches them only through the
form adapters in `src/app/_actions`, which check the session first.

**There is one Firestore database, and it holds the couple's real data.** There
is no dev or test copy. Anything that writes to it for verification must use
its own fixtures and leave every real document byte-identical (see TOOLING).

### Files

| File | Purpose |
| --- | --- |
| `src/database/db.ts` | Exports the Firestore handle. **Admin SDK only** — never the client `firebase` package. |
| `src/database/*.actions.ts` | One file per entity, each opening with `import "server-only"`. The only API to Firestore, and deliberately **not** `"use server"`: every export of a `"use server"` module is an endpoint anyone can POST to, and these carry no session check. |
| `src/database/entities.ts` | Shared CRUD behind accounts/saldos/categories. Two shapes: `createNamedEntity`/`updateNamedEntity` (name + description — categories) and `createBalanceEntity`/`updateBalanceEntity` (name + description + two balances — accounts and saldos, which are structurally identical, so their logic exists once). Also `owned(snap, owner)`, the exists-and-belongs-to check every by-id access goes through, and `assertActive(owner, collection, id, label)`, the shared owned-and-not-archived guard. Every helper takes the owner first. |
| `src/database/users.actions.ts` | The two users: `createUser`, `findCredentials`, `loadSessionUser`, `getPartnerName`, `signUpOpen`, `updateProfile`, `changePassword`. See "Users" below. |
| `src/database/validators.ts` | Hand-rolled validation primitives, no dependency. **Must stay pure**: `src/lib` imports `round2` from it, and the client form components import `TEXT_MAX_LENGTH`, so a Firestore import here would leak into the browser bundle. |
| `src/database/result.ts` | The `ActionResult<T>` envelope. |
| `src/database/collections.ts` | Collection names, the `withId` snapshot mapper, and `budgetDocId` — the one derived document id in the app. |
| `src/database/firebase.config.js` | The Admin SDK app. Its credential is the JSON in `FIREBASE_SERVICE_ACCOUNT` when set, else the gitignored `src/database/serviceAccountKey.json` read **by path at startup**. Never `import` the key: an import compiles it into the build output. Invalid JSON raises a fixed message, because V8's parse error would quote part of the private key. |

Types, constants and sync helpers live in the shared modules above; each
`*.actions.ts` file keeps to one entity. Import `firebase-admin` by subpath
(`firebase-admin/app`, `firebase-admin/firestore`): its ESM entry has no default
export.

### Conventions

* **Actions return errors, never throw.** Every action resolves to
  `ActionResult<T>` — `{ok: true, data}` or `{ok: false, error, fieldErrors?}`.
  `fieldErrors` carries all invalid fields at once, ready for `useActionState`.
* **Two balances per entity.** Account and Saldo each have a `totalBalance` and a
  `realBalance`. Every transaction posts *both* of its amounts to *both* the
  account and the saldo it references (when it has one; see "Saldo mode"):
  `totalAmount` → `totalBalance`,
  `realAmount` → `realBalance`. The split internet bill moves the account to
  910/955 and the saldo to −90/−45. Expenses subtract, receitas add. A single
  `initialAmount` seeds both balances, and editing it shifts both by the same
  delta.
* **A transfer moves money between two account+saldo pairs.** `accountId` and
  `saldoId` are its origin; `toAccountId` and `toSaldoId` its destination. Both
  amounts leave the origin pair and land on the destination pair. The
  destination may repeat the origin's account (moving between saldos) or its
  saldo (moving between accounts), but **not both**: that would move nothing,
  and the clash is reported on both destination fields, since changing either
  resolves it. A shared end gets a debit and a matching credit, which the
  per-document accumulation below cancels into no write. The destination fields
  are the one exception to "always stored": they exist on transfers only.
  `normalize` drops them from any other type, so `undefined` there is a real
  state and needs no backfill. A transfer still carries a category, and still
  keeps `realAmount ≤ totalAmount`. With no saldo on either end (saldos off),
  only the accounts must differ, and the clash is reported on the account.
* **Balances are stored, not derived**, and every transaction write runs inside
  `db.runTransaction`. Deltas are accumulated per document before any write, so
  an edit that keeps the same account merges into one balance write instead of
  two that would overwrite each other. Firestore requires all reads before the
  first write — keep that read-phase/write-phase shape.
* **Soft delete.** Accounts, saldos and categories expose `archive`/`unarchive`,
  never a delete — transactions keep referencing them. Always write
  `archived: false` on create: `listEntities` counts only `archived === false`
  as active, so a document missing the field drops out of every active list. Archived entities reject *new* postings but
  stay editable, so archiving never freezes history. On an edit, only a target
  the transaction did not already point at, in any role, must be active.
* **Transactions hard-delete.** Nothing references them, and deleting one
  unwinds every balance it moved. There is no undo; the confirmation says so.
* **Duplication has no action of its own.** It prefills the create form
  (`/transactions/new?from=<id>`), so nothing is written until the amount has
  been checked. A server-side copy would have to write immediately, and these
  transactions are recurrent but *variable*. `duplicateTransaction` existed once
  and was deleted for that reason; do not bring it back.
* **`description` is optional on input and always stored as a string.** Accounts,
  saldos and categories carry one, saying what the bucket is *for*. That is not
  `Transaction.description`, which is required and says what the lançamento
  *was*. Writing `""` explicitly when it is omitted is mandatory for the same
  reason `archived: false` is: `withId` is a blind cast, and a missing field
  reads back as `undefined` against a `string` type. It is capped at 280
  characters (`TEXT_MAX_LENGTH`, which the inputs' `maxLength` also uses, so the
  two caps cannot drift) and stored trimmed (`trimmedText`). Documents that
  predated the field were backfilled once, by a throwaway script since deleted.
* **No composite indexes.** Each query has at most one Firestore filter field:
  the `date` range for transactions (ISO `YYYY-MM-DD` strings sort
  lexicographically), `month ==` for budgets, `ownerId ==` for entity lists.
  Everything else (the owner, `archived`, the id filters) is applied in
  memory. Personal-scale data, zero index setup.
* **Saldo and category are independent tags.** A transaction carries both, but
  any category may pair with any saldo — neither nests inside the other. Each
  reference is validated only for existence and active status on write.
  `categoryId` stays required.
* **Budgets are the exception to both rules above.** One document per
  `(month, scope, targetId)`, with the id *derived* from those three
  (`budgetDocId`: `${month}__${scope}__${targetId}`) so a target can only be
  planned once per month — the upsert needs no duplicate query and no
  transaction, and a double submit is idempotent. `scope` + `targetId` rather
  than nullable `saldoId`/`categoryId` columns, because the two dimensions are
  siblings. Budgets also **hard-delete**: nothing references a budget, so soft
  delete would add a field no one reads. Each month stands alone; `copyBudgets`
  seeds the next one and is **additive** — it never overwrites a figure already
  set, nor copies a target whose saldo or category has been archived, and it
  returns `{copied, skipped}`. Each budget is checked against the collection
  its own `scope` names, never a union of both.
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
  into a target would let a salary deposit silently pay for an overrun, and a
  transfer out of a saldo is not spend — the money still exists. And the
  saldo and category tables are **not reconciled**: they sum the same
  transactions along different axes, so each total is right for its own axis and
  the two are not expected to agree.
* `realAmount` may never exceed `totalAmount`; money is rounded to 2 decimals on
  every balance write.

### Ownership (since Phase U3)

* **The owner is an argument.** Every data-layer function takes `owner: Owner`
  first (`SessionUser` satisfies it), and `src/database` still knows nothing
  about sessions. Callers pass the user from `requireUser()` as it is.
* **`ownerId` is always written, and only from that argument.** Every create
  writes `ownerId: owner.id` beside `archived: false`; transactions also write
  `shared` (see "Sharing"). No `Create*Input`/`Update*Input` type
  carries `ownerId`, and `normalize` builds the stored transaction field by
  field, so a smuggled `ownerId` is never written. Firestore refuses to store
  `undefined`, so no unowned document can be created.
* **Someone else's document reads exactly like a missing one.** Every by-id
  read or write checks `owned(snap, owner)` and returns the same `notFound`
  message, so probing an id reveals nothing. An owner with no id matches
  nothing, never the unstamped documents.
* **A transaction may only point at its owner's documents.** `checkTargets`
  reports a foreign account, saldo, category or transfer destination as "was
  not found". That is what stops a forged form from posting to, or
  transferring into, the partner's account.
* **Budgets are per user.** `setBudget` plans only the owner's active targets
  (`assertActive(owner, …)`), `copyBudgets` copies only the owner's plans onto
  the owner's targets, and every budget stores `ownerId` for listing.
  `budgetDocId` is unchanged: target ids are globally unique and each target
  has one owner, so the id needs no owner in it.
* **Documents without `ownerId` belong to no one** and are invisible to
  everyone. Since the U4 migration there are none: every real document was
  stamped with the owner's id, and every transaction with `shared: false`.

### Saldo mode (since Phase U5)

* **The preference decides what a new write must carry; the document decides
  what moves.** With `useSaldos` on, a transaction needs `saldoId` (and a
  transfer `toSaldoId`), as before. With it off, neither is required, and a
  saldo that is present is still checked like any target. `postings` and
  `targetsOf` include a saldo only when the document names one.
* **`saldoId` is optional**, like `toSaldoId`, and `normalize` stores either
  only when non-empty. Absent means "recorded with saldos off", a real state
  needing no backfill.
* **An edit keeps what the form did not send.** With saldos off the form has
  no saldo fields; `readInput` reads them through `presentField` as
  `undefined`, and `updateTransaction`'s merge keeps the stored saldo, which
  still moves by the delta. A saldo-less transaction edited after switching
  saldos back on is asked for one.
* **Switching deletes nothing.** Saldos, their balances and saldo plans stay
  stored and come back with the switch. `buildBudgetRows` ignores saldo-less
  transactions in the saldo scope (not "(removido)"), and `copyBudgets` skips
  saldo plans while saldos are off, counting them as skipped.

### Sharing (since Phase U6)

* **Only an expense can be shared.** `normalize` stores `shared: type ===
  EXPENSE && input.shared === true`, so turning a shared expense into a
  receita or a transfer unshares it, as a non-transfer drops its destination.
* **A shared expense is still the owner's alone.** It moves only the owner's
  balances, and every by-id access stays `owned`, so the partner can neither
  edit, duplicate, delete nor unshare it.
* **`listSharedTransactions(viewer, {from, to})` is the only read that crosses
  owners.** It keeps shared expenses of the viewer and the viewer's stored
  `partnerId` (never anything from a request), and returns the
  `SharedTransaction` projection — `id`, `date`, `description`,
  `totalAmount`, `sharedAmount`, `categoryName`, `ownerId` — built field by
  field even for
  the viewer's own rows, so the account, saldo and real amount cannot leak
  through it. Category names come from each owner's own categories, archived
  included; a missing one is "(removida)". A viewer without an id gets
  nothing. Anything else that crosses owners is a new decision, not a
  variation of this.
* **The data layer does not require a partner to share**; the form offers the
  box only when one exists.
* **The partner's part is `sharedAmount`**, what the partner owes the owner
  for a shared expense. It is required on a shared expense, between 0 and
  `totalAmount`, stored only beside `shared: true` (`normalize` drops it with
  the flag, as a non-transfer drops its destination), and moves no balance.
  **`realAmount + sharedAmount` may not exceed `totalAmount`** (U8.1, the
  owner's decision): what the owner owes plus what the partner owes is at
  most the bill, or one of the two figures is wrong and either the budgets
  or the settlement with it. Less is fine, since a bill split with other
  people too leaves room for their parts. The sum is compared in whole
  cents (`exceedsTotal`), because a float sum like 45.10 + 45.20 lands above
  90.30. It is checked only once each amount fits the total on its own, so a
  field's own message comes first, and it is reported on both fields, since
  changing either resolves it. An edit whose form sends no part is checked
  against the stored one. It crosses owners on purpose,
  because it is what the other person owes. No shared expense existed when it
  was added, so nothing was backfilled.
* **The dashboard (`/shared`, since U7) reads nothing but this projection**
  and `getPartnerName`, so the real amount never reaches it.
* **Two layers keep private fields off the dashboard, and each needs its own
  check** (U8). The projection is built in a `.map((doc): SharedTransaction
  => …)`, so an extra *literal* property does not compile. And `/shared`
  renders its rows in Server Components: its one client component,
  `TransactionRowActions`, receives only the id, the description and the
  delete action, on the viewer's own rows. So a field spread into the
  projection still never reaches the browser, and no HTML check can see it.
  Check the projection itself by calling it, and the page by its response.
  Keep both layers: a client component given whole rows would put every
  projected field in the flight payload.

### Users (since Phase U1)

* **Exactly two users.** `createUser` hashes the password first (scrypt is slow,
  and a Firestore transaction may retry), then, inside `db.runTransaction`, reads
  the whole `users` collection. It refuses a third user ("Sign-up is closed")
  and a duplicate username (field error "is already taken"). The second user
  gets `partnerId` = the first's id, and the first is pointed back in the same
  transaction. Two concurrent sign-ups were observed to serialize, both from
  zero users and from one.
* **The hash never leaves `users.actions.ts`, except through
  `findCredentials`**, which only sign-in may call. Every other read builds its
  result field by field (`toVersionedUser`). Never `withId` or a spread: either
  would carry `passwordHash` along at runtime, whatever the type says.
* **Always written:** `partnerId` (`null` for the first user) and
  `sessionVersion` (starts at 1), for the same reason as `archived: false`.
* **Usernames are stored normalized**: trimmed and lowercased by
  `normalizedUsername`, then checked against `[a-z0-9._-]{3,32}`. Sign-up and
  sign-in must both go through it. A new password needs at least
  `PASSWORD_MIN_LENGTH` (12) code points, and is never trimmed.
* **Perfil writes through two functions.** `updateProfile(owner, {name?,
  useSaldos?})` validates both before writing either. `changePassword(owner,
  current, next)` verifies the current password, hashes the new one outside
  the transaction, then writes it with `sessionVersion + 1`, refusing if the
  hash changed in between. Both act only on `owner.id`, from the session.
* **`signUpOpen` only counts users.** Whether `SIGNUP_CODE` is set is the
  caller's to check: `src/database` never reads the environment.

## UI LAYER

Thin layers sit on top of the data layer, with the proxy in front of them all.
`src/database` stays a pure, route-unaware data API: it knows nothing about
routes, `FormData`, React or sessions.

| Layer | Purpose |
| --- | --- |
| `src/lib/*.ts` | Pure helpers — month arithmetic (`month.ts`), currency format and form parsing (`money.ts`), transaction aggregation (`rollup.ts`), the shared dashboard's arithmetic and the `returnTo` allowlist (`shared.ts`), session signing (`session.ts`), password hashing (`password.ts`). Firestore-free, so they can be imported anywhere and cannot live in a `"use server"` module. **The exception is `password.ts`**: it is Node-only (`node:crypto` scrypt) and deliberately slow, so only the users data layer and the auth adapters import it, never the proxy or a client component. Each has a `*.spec.ts` beside it. |
| `src/app/_actions/*.ts` | Form adapters — with `auth.ts` and `profile.ts`, **the app's only Server Actions**. The data-layer functions take typed objects, but `useActionState` needs `(prevState, formData)`. Each adapter starts with `const user = await requireUser();`, then parses `FormData`, calls the data layer with `user` as the owner, calls `revalidatePath`, and returns a `FormState`. `form-state.ts` (the shared shape) and `session.ts` (`getSessionUser`, `requireUser`, `startSession`, `signUpAvailable`) are deliberately *not* `"use server"`. `auth.ts` signs up, in and out. |
| `src/proxy.ts` | The optimistic gate in front of every route except `/login` and `/signup`. See AUTH below. |
| `src/components/*.tsx` | Shared presentation — form primitives, tables, navigation. |

The 17 adapters: `create`/`update`/`archive`/`unarchive` × accounts, saldos and
categories (12); `create`/`update`/`delete` for transactions (3);
`setBudgetForm` and `copyBudgetsForm` (2). Plus `signInForm`, `signOutForm` and
`signUpForm` (`auth.ts`), and `updateProfileForm` and `changePasswordForm`
(`profile.ts`).

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
* **São Paulo for "now", UTC for arithmetic.** `currentMonth()`/`today()` read
  the date in `HOME_TIME_ZONE` (`America/Sao_Paulo`) through `Intl` — in UTC−3,
  `toISOString()` would report tomorrow after 21:00. The zone is named in code
  because every caller is a Server Component: "local" would mean the server
  process's zone, UTC on most hosts. Month arithmetic pins to `Date.UTC`, where
  no DST shift can roll a boundary. The specs run at `Pacific/Honolulu` on
  purpose, to prove nothing leans on the process zone; a deploy needs no `TZ`.
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
* **The sign rule stays in the data layer.** `postings` describes how a
  transaction moves a *stored balance*. Views group by `type` and display
  magnitudes — an expense reads `R$ 90,00` beside a "Despesa" badge, not a
  negative number whose sign depends on a convention defined elsewhere.
  `Money`'s `plain` tone (the default) keeps amounts in the foreground colour;
  only `signed` colours by sign, for balances and nets. Painting every expense
  red would make the whole ledger red.
* **A transfer is counted, never summed.** `monthSummary` leaves it out of
  Despesas, Receitas and Resultado, since nothing was earned or spent, but
  "Lançamentos" counts it. The ledger shows both ends ("Nubank → Inter"), naming
  an end the transfer keeps only once. Filtering by an account or saldo matches
  either end.
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
  cannot be verified by fetching HTML. Its component is named `RouteError`, not
  `Error`, so it does not shadow the global.
* **A link out of a form carries the record's month**, same as a write's
  redirect. Before the record is read there is no month, so an error branch can
  only point at the current one.

### Screens

Behaviour specific to one screen, decided along the way.

* **The shared dashboard.** The arithmetic is in `src/lib/shared.ts`, and
  `sharedDashboard` builds the page from one month's rows.
  * **The cards follow the category filter but never the owner filter.**
    Filtering to one person would zero the other's card and turn the
    settlement into nonsense. Only the table narrows, and while the owner
    filter is on, a caption says so.
  * **Each figure leads with the shared part**, the total beneath it, as the
    ledger's cards lead with the real figure. The table's "Compartilhado"
    column comes before a muted "Total".
  * **The settlement nets the parts**: the partner's parts of what the viewer
    paid, against the viewer's parts of what the partner paid. Any split is
    in the parts themselves, so the card is "Acerto", not 50/50. It covers
    the month in view (and the category, if one is filtered), and reads
    "Tudo certo" when the parts cancel out.
  * **Categories merge by `categoryKey`** (trimmed, lowercased, accents
    removed), each option labelled in the viewer's own spelling when they
    have one. A filtered category the month lacks keeps an option, labelled
    with its key, so the select never reads "Todas" over an empty table.
  * **Filters from the URL.** `owner` counts only as the viewer's or the
    partner's id, and a repeated parameter is ignored.
  * **The partner's rows have no actions.** The viewer's carry
    `returnTo=shared`, so saving lands on `/shared?month=` of the record.
  * **Before the partner signs up**, the page only explains itself.
* **`returnTo` is an allowlist of one value.** Only exactly `"shared"` leads
  to `/shared`, and anything else, from a URL or a forged form, leads to
  `/transactions`: `ledgerHref` never uses the value as a path. The new and
  edit pages use it for their way back ("Voltar ao compartilhado"), and the
  adapters use it for the redirect.

* **Sharing in the form.** "Compartilhar com {partner}" is a checkbox shown
  only for a despesa (it follows the `type` state) and only once a partner
  exists (`partnerName`, from `getPartnerName`). Its help says what the
  partner sees and does not. Edit starts checked when shared, a duplicate
  copies the flag, and after a refused submit the echo decides (an unchecked
  box is simply absent). The ledger tags a shared row "Compartilhada", filled
  rather than outlined so it never reads as a type badge.
* **The partner's part in the form.** "Parte de {partner}" is rendered only
  while the box is checked (a `sharing` state mirrors it, and the box's
  default follows that state, so the two stay in step across a type switch).
  It starts at total minus real, and follows both amounts the way real
  follows the total, until the user types in it. Each time the field
  appears, an empty one is filled, and a value that is not total minus real
  counts as chosen and is left alone. An edit whose form sends no part keeps
  the stored one. The default always fits beside the real amount; a part
  the user typed may not, after real is raised, and then the server refuses
  the submit with a message under both fields and the typing kept. There is
  no client-side guard, for the same reason as for real over total.
* **Saldos off ("Só contas").** The Saldos tab is hidden and
  `/settings/saldos` is a note; `TransactionForm` (`showSaldos`) renders no
  saldo selects and its transfer help says the destination must be another
  account; the ledger (`showSaldo` on `TransactionsTable` and
  `TransactionFilters`) has no Saldo column or filter and ignores a stray
  `?saldoId=`; `/budget` has no "Por saldo" table; the first-run notices ask
  for an account and a category only. With saldos on, a saldo-less
  transaction shows "—", not "(removido)". The mode cards are one component,
  `SaldoModeField`, shared by sign-up and Perfil.

* **Settings.** Archived visibility lives in the URL (`?archived=1`), not in
  client state, because the server does the filtering. Archiving asks for
  confirmation, since it stops new postings; restoring is one harmless click
  and does not. Each page has a first-run empty state inside its table.
* **Ledger filters ship no JavaScript.** They are a plain `GET` form, with
  `month` in a hidden field so filtering never changes month, and `MonthNav`
  carries the filters through its `params` prop so changing month keeps them.
  The filters list archived entities, labelled `(arquivada)`/`(arquivado)`,
  because past transactions still point at them.
* **Summary cards lead with the real figure**, with the total beneath it. On a
  split bill the two differ by half, which is the point of the app.
* **The transaction form.** `/transactions/new` offers active entities only,
  because an archived one would only be refused on submit. The edit form loads
  archived ones too, so a record's current account is never silently dropped
  from its select. The create form's default date follows the month in view:
  that month's first day for a past or future month, today for the current one.
  `realAmount` mirrors `totalAmount` until the user edits it; the "edited" flag
  starts `true` when the two already differ, so correcting the total of an
  existing split bill cannot overwrite its real share. "Dividir 50/50" is a
  `type="button"` that halves the total and counts as editing.
* **Transfers in the form.** The type radios stay uncontrolled. The only client
  state mirrors which one is checked, to decide whether the destination selects
  are rendered at all: hidden but present, their `required` would block saving
  an expense. On a transfer, the origin fields are relabelled "Conta de
  origem"/"Saldo de origem".
* **Delete stays put.** It is a row action on the ledger, so it does not
  redirect. Create and update redirect to the record's month.
* **Budget rows.** A row's status is `unplanned` with no plan, `over` once spend
  exceeds the plan, `warning` from 80% of it, otherwise `ok`. A zero target is
  `over` on any spend. The bar's ratio is clamped at 1. A section's `remaining`
  sums planned rows only, so spend on an unbudgeted target does not eat into the
  plan's remainder. Rows shown: every active target, plus any archived one that
  carries money this month (spend or a plan). "Limpar" on an archived row asks
  for confirmation, since the target cannot be planned again while archived.
* **"Copiar plano" reports what it did** through `FormState.message`
  ("3 valores copiados · 1 já definido(s) ou arquivado(s)"). A copy of nothing
  and a copy of everything otherwise look identical.
* **`parseAmount` returns `NaN`, never 0, for unparseable input**, so the data
  layer's validator rejects it with a message. Silently saving R$ 0 would be
  worse. It accepts a pasted pt-BR `1.234,56`; a lone dot is a decimal point.

## AUTH

Per-user sign-in since Phase U2: each of the two people has a username and
their own password. The client `firebase` package is ruled out above, so
Firebase Auth is too; users live in Firestore (see "Users" under DATA LAYER).
Since U3 each person reaches only their own data (see "Ownership"); since U4
the data that predates it belongs to the owner.

* **A session names its user.** `src/lib/session.ts` signs
  `<userId>.<sessionVersion>.<expiry ms>.<hex HMAC-SHA256>` with `AUTH_SECRET`
  (32+ characters) over Web Crypto. 30 days, in a cookie named `session`:
  `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` in production, set only
  by `startSession` in `src/app/_actions/session.ts`. `readSession` requires
  exactly three parts (alphanumeric id, digits, an unexpired digit expiry), so
  a pre-U2 `<expiry>.<mac>` token reads as signed out. `issueSession` throws
  rather than sign anything `readSession` would refuse.
* **Revocation is the session version.** A token is good only while the user
  document still exists with the same `sessionVersion`; bumping it signs out
  every copy of every session. Perfil's password change does exactly that,
  then `changePasswordForm` re-issues this browser's cookie through
  `startSession`, and the page re-renders signed in (Next re-renders after a
  cookie is set in a Server Action). "Sair" clears this
  browser's cookie; rotating `AUTH_SECRET` signs everyone out.
* **Two layers, both required.** `src/proxy.ts` is the *optimistic* check
  (Next's authentication guide): signature and expiry only, no Firestore,
  since it runs on every request including prefetches. It turns away a request
  without a valid token — a page with a 307 to `/login`, a Server Action fetch
  with a 401 carrying `x-action-redirect: /login` (Next's own action-redirect
  header, so the client navigates instead of landing on `error.tsx`), any other
  POST with a 303. Its `matcher` exempts only `/login`, `/signup`, `/_next/`
  and the favicon, anchored so `/loginx` and `/signup/x` stay behind the gate.
  The *secure* check is `requireUser()`: `getSessionUser` (React `cache`, one
  read per render) loads the user and compares the version, and anything wrong
  redirects to `/login`. A path the matcher skips also skips the actions posted
  to it, Next forwards an action id posted to *any* page to the page that owns
  it, and a deleted user's or an old password's token passes the proxy — so
  **`const user = await requireUser();` is the first line of every adapter and
  of every page that reads data**, and `user` is what scopes every data-layer
  call after it. A new adapter or page without it is open; nothing else
  fails.
* **It fails closed and loudly.** A missing or short `AUTH_SECRET` throws on
  the first request, not the first sign-in. A failed user read reads as signed
  out, never as signed in. Never default `AUTH_SECRET`.
* **Only the adapters and `auth.ts` are Server Actions.** Any module marked
  `"use server"` exposes every export as an endpoint, and the manifest lists
  exactly 22: the 17 adapters plus `signInForm`, `signOutForm`, `signUpForm`,
  `updateProfileForm` and `changePasswordForm`. Code that must not be one — the data layer, the session check,
  `startSession` — is `import "server-only"` instead.
* **Sign-in never says which part was wrong.** `signInForm` normalizes the
  username, calls `findCredentials`, and verifies an unknown username against a
  dummy hash made once per process (`hashPassword(randomUUID())`, so it always
  has the current cost), so both failures take one scrypt run. Measured in
  U8 in ABBA order, an unknown username took 1.02–1.03× as long as a wrong
  password. Both return the
  form-level "Usuário ou senha incorretos." and echo only the username. Nothing
  rate-limits sign-in: the 12-character minimum is the defence.
* **Sign-up needs the invite code** (`SIGNUP_CODE`), compared as HMACs
  (`secretMatches`) so the timing reveals neither length nor prefix. With the
  variable unset, `/signup` is closed. The code is checked *first*, so someone
  without it learns nothing (not even whether a username is taken); then
  "confirmar senha" and the saldo mode; then `createUser`, whose refusal of a
  third user (`SIGN_UP_CLOSED_ERROR`) becomes "O cadastro está fechado.". The
  code and the passwords are never echoed. `/login` shows "Criar conta" only
  while `signUpAvailable()` (code set and fewer than two users).
* **Password hashes** are `scrypt$N$r$p$<salt hex>$<hash hex>`: N = 2^15,
  r = 8, p = 3, a 16-byte salt and a 32-byte hash, about 280 ms each. The
  parameters travel in the string, so raising them affects new hashes only.
  `maxmem` is set to 256 MiB, because Node's 32 MiB default refuses these
  parameters. Passwords are NFC-normalized before hashing. `verifyPassword`
  compares with `timingSafeEqual`, and returns `false` for any malformed stored
  value, including a salt or hash under 16 bytes.
* **Sign-in and sign-up always land on `/`.** There is no `next` parameter, so
  there is no open-redirect surface to validate. No field has `autoFocus`, per
  Biome's a11y rule. A signed-in visit to either page redirects to `/`.
* **Configuration enters in four files** — the proxy, `auth.ts`,
  `_actions/session.ts` and `firebase.config.js` — the only ones where Biome
  allows `process.env`. Pages ask `signUpAvailable()` rather than read
  `SIGNUP_CODE`. `.env.local` (gitignored by `.env*`) holds `AUTH_SECRET` and
  `SIGNUP_CODE` locally; a deploy also sets `FIREBASE_SERVICE_ACCOUNT` to the
  key JSON (in a dotenv file, single-quoted so its `\n` escapes survive).
  `AUTH_PASSWORD` is gone.

## TOOLING AND TESTING

`npm run lint` reports **zero errors and five warnings**. The five are
deliberate, not unfinished work:

* `noDefaultExport` on `src/database/db.ts` — `import db from …` reads the way
  the one global handle should.
* `noEnum` and three `useNamingConvention` on `TransactionType` — the enum's
  values (`"expense"`, `"income"`, `"transfer"`) are what is stored in Firestore
  documents, and `EXPENSE`/`INCOME`/`TRANSFER` is the convention the data layer
  is written in.

Biome does not police `package.json`, `package-lock.json` or `.claude/`: other
tools rewrite those. Its overrides, each scoped to exactly the files that need
it: `noDefaultExport` and `useComponentExportOnlyModules` are off in
`src/app/**` (Next requires a default export and co-located `metadata`);
`next.config.ts` and `vitest.config.mts` may default-export; `noMagicNumbers`
is off in `*.spec.ts`, where literal amounts are the fixture; `noProcessEnv` is
off for the four files where configuration enters (see AUTH). The codebase's
only inline `biome-ignore` is on `TZ` in the Vitest config, an environment
variable's name.

`npm test` runs Vitest over `src/**/*.spec.ts`, which today means `src/lib`:
186 specs (`month` 27, `money` 22, `password` 24, `rollup` 31, `session` 55,
`shared` 27). `money.spec.ts` also covers `round2` and `exceedsTotal`, which
live in the pure `validators.ts`.
Specs sit beside the module they cover and need no mocks, since nothing in
`src/lib` reaches Firestore. `password.spec.ts` takes about 3 s, because scrypt
is slow on purpose; it shares one hash across specs where it can. `vitest.config.mts` takes the `@/*` alias from tsconfig
(`resolve.tsconfigPaths`) and pins `TZ` to a zone that is deliberately not São
Paulo. A change to a money or month rule comes with a spec. The suite was
mutation-checked when written: every deliberate breakage of a rule turned at
least one spec red.

* **Vitest 4, not 5,** because Vitest 5 requires `@types/node` 22 or later and
  the project is on `^20`. Raising both is a small, separate change.
* **`vitest.config.mts`, not `.ts`,** because `package.json` has no
  `"type": "module"`, and Vite warns that it will stop loading an ESM `.ts`
  config as CommonJS.

### Verifying against the running app

Static checks cannot see a balance move, so each phase was also verified end to
end. The method that works, and the traps it took to find it:

* **Drive the real forms over HTTP.** Next renders each Server Action form with
  hidden `$ACTION_*` fields; scrape them (they are HTML-entity-encoded, and a
  `$ACTION_REF` may render with no `value`), add any input joined by
  `form="edit-…"`, and POST them back. That exercises adapter → action →
  Firestore, not a reimplementation of it. Find a form by `id`, not
  `name="description"`, which also matches `<meta name="description">`.
* **Assert state against Firestore, not HTML.** HTML string matching is a weak
  oracle: it passed on entities never written, because the same words appear in
  page copy. When asserting on text, strip `<script>` blocks first (Next
  serializes every boundary the route *could* render into the flight payload,
  `not-found` included, and the page's search params too, so a URL value the
  page dropped is still in the response) and remove React's `<!-- -->`
  separators. The reverse holds for leaks: "the partner never receives this"
  is checked against the whole response, scripts included.
* **Use fixtures, never real data.** Create the harness's own entities, write
  in an empty far-future month (2031 was used), refuse to start if it is not
  empty, delete transactions through the delete action so balances unwind, and
  compare every real document byte for byte afterwards.
* **Two users need a fixture couple** (since U3): insert both through the
  Admin SDK with `hashPassword`, linked by `partnerId` to each other only, sign
  them in through `/login`, and delete everything they own by `ownerId`. With
  the owner's user document now real, fingerprint `users` too. Forge an attack
  by taking your own row's form (its `$ACTION_*` fields) and posting the other
  user's id. Keep failure details free of real data: a failing check that
  prints a document prints the couple's finances. Match hidden inputs by
  `name` and `value`, not attribute order: React writes `type` first.
* **"Looks exactly as before" can be checked mechanically** (U4): check the
  older commit out into a scratchpad `git worktree`, symlink `node_modules`,
  build it with `next build --webpack` (Turbopack refuses a symlinked
  `node_modules`), and serve it with the environment from `.env.local` and the
  credential in `FIREBASE_SERVICE_ACCOUNT`. Render the same pages on both
  builds and compare them with scripts, styles, `<link>`/`<meta>`, class
  attributes and `$ACTION_*` fields removed: those differ by bundler and
  build, and the rest is data. Capture twice to prove it deterministic, and
  delete captures of real pages afterwards. Remove the worktree's
  `node_modules` link before `git worktree remove`.
* **Budget Firestore reads.** The project has a daily quota, and the
  database is the real one: on 2026-11-02 verification traffic exhausted it
  (`8 RESOURCE_EXHAUSTED: Quota exceeded`), which also took the owner's app
  down until the reset around midnight US Pacific. The heavy items were
  U4's 231-page captures run four times and repeated full harness runs.
  Prefer one full run plus targeted reruns; never repeat bulk captures; and
  make cleanup survive a mid-run failure (a fixture sweep that only touches
  usernames starting with `e2e-` and what they own).
* **Mutation-check the harness** when the claim is a refusal: break the guard,
  rebuild, and confirm the checks turn red (U3: 38 red with `owned` reduced to
  "exists", 19 with only `checkTargets`' owner test removed). A data-layer
  function the harness imports and calls itself needs no rebuild: only code
  reached through the server does. A mutation that `next build` refuses tests
  nothing, so get it past the type checker without weakening what it
  breaks: an extra property went in through a spread in U8. A mutation that
  turns nothing red is a finding, not a pass. In U8 it showed that an HTML
  check cannot see a projection leak.
* **A full pass is one harness** (U8): 86 checks numbered after the plan's,
  over one fixture couple, with one saldos on and one in "Só contas". It
  costs about one harness run's reads, where rerunning every phase's harness
  would cost five. One survey pass gives both the fingerprint and the real
  ids that pages must never carry. The harness and its run script lived in
  the session scratchpad.
* **Timing checks interleave in ABBA order.** A fixed order (wrong password,
  then unknown username, 6 times) swung from 0.87 to 1.35 on noise between
  runs. In ABBA order it measured 1.02–1.03.
* **Running a data-layer module outside Next** needs Node 24's type stripping,
  `--experimental-transform-types` for the `TransactionType` enum, and a small
  resolve hook loaded with `--import` that maps `@/` onto `src/`. Since the
  data layer imports `server-only`, also pass `--conditions=react-server`, or
  that import throws. Harnesses live in the session scratchpad, never in the
  repo.
* **`error.tsx` and anything after hydration need a browser.** Headless Chrome
  was used in Phase E for the login page, both themes, the two-tab staleness
  check, a session dropped mid-use, and `error.tsx` via a throwing probe
  route. Such a probe cannot be kept: a page that throws fails
  `npm run build`. It was used again for the shared amount's client-side
  default, driven over the DevTools protocol with Node 24's own `WebSocket`
  (no dependency): launch `google-chrome --headless=new
  --remote-debugging-port=0`, read the port from its stderr, set the session
  cookie with `Network.setCookie`, and wait for an input to carry
  `__reactProps…` before touching it, since that is when hydration has
  happened. Type through the prototype's `value` setter plus an `input`
  event, or React does not notice. Scope every selector to the form:
  `button[type="submit"]` alone matches the nav's "Sair" first.

The check that must never go red: the R$ 90 / R$ 45 split bill moves the
account by −90/−45 and the saldo by −90/−45, and deleting it brings both back
to the cent.

## DELIBERATELY NOT BUILT

Each of these was considered and rejected or deferred for the stated reason.
Raise them with the owner rather than building them unasked.

* **A one-click or server-side duplicate.** It would save a wrong amount and
  drop the copy into another month (see "Duplication has no action of its
  own").
* **A client-side guard for `realAmount > totalAmount`.** The server rejects it
  with a field error and the typing survives. A `max` would have to track the
  total live, which is not worth the client state.
* **Undo for a deleted transaction.** Hard delete is the design.
* **A running settlement across months, or marking one as paid.** The
  dashboard's settlement covers the month in view only.
* **Sharing an income or a transfer, or letting the partner edit a shared
  expense.** An income has no "paid by", and a transfer between your own
  accounts is not the partner's business. A shared expense stays its owner's
  alone (see "Sharing").
* **The partner's part on the ledger** (decided by the owner, 2026-11-03).
  The ledger keeps only the "Compartilhada" tag. The part is in the form and
  on `/shared`, and it usually equals the gap between the Total and Real
  columns. The ledger lists only your own transactions, so it could show
  only what the partner owes you, never what you owe them.
* **Invitations, roles or a partner picker.** The app is for exactly two
  people: the second to sign up becomes the first's partner, and sign-up
  closes.
* **Changing a username, deleting a user, or resetting a password by
  email.** There is no email. A forgotten password needs a scratchpad script
  that writes a new hash (`hashPassword`) through the Admin SDK and bumps
  `sessionVersion`.
* **A separate budget-create screen or a per-row delete button.** The table is
  the editor, and emptying the field clears the plan.
* **Firebase Auth, a sign-in rate limit, a post-login `next` redirect.** See
  AUTH.
* **Composite indexes.** Not needed at this scale.
* **Translated server messages.** Data-layer errors ("must be a non-empty
  text", "cannot be negative") are still English in a Portuguese UI. That is
  app-wide and unscheduled.
* **An `invalid(check)` predicate.** `if (nonEmptyString(id))` means "if
  *invalid*" in a few places, the one readability trap in the data layer. It is
  cosmetic and touches working validation, so it is noted, not scheduled.

## STATUS

**All four goals and all three tracks are complete, and transfers have been
added along the way.** The third track, new features, gave the app two users,
each with their own data, plus shared expenses and the shared dashboard at
`/shared`. Every read and write is
scoped to its user, and the real data belongs to the owner (`irizzo`), who
sees exactly what they saw before U3. Each person manages their name, saldo
mode and password in Perfil. **As of 2026-11-03 the partner has not signed
up**: `users` holds only the owner, with no partner. The pre-migration
backup is still at
`~/couple-finance-backups/firestore-before-u4-2026-11-02.json`, kept at the
owner's choice (2026-11-03). Every page reports a failed `ActionResult` in a banner
and has a first-run empty state pointing at what must be created first. Each
person signs in with their own username and password: `/login` and `/signup`
are the only open pages, every Server Action and data page checks the user
against Firestore, and "Sair" in the nav signs out.

Everything is verified end to end against real Firestore. U8's full pass,
with a fixture couple, covered:

* sign-in, the pre-U2 cookie and a password change;
* isolation between the two people;
* the split bill, with saldos and in "Só contas";
* switching saldo mode;
* sharing, including what the partner's response never contains;
* the dashboard's arithmetic;
* the 22-action manifest;
* a transfer created, edited into an expense and deleted, with every balance
  back where it started.

### Still open

**The deploy checklist**, which is the owner's to run:

1. **Deploy.** Nothing in the data blocks it: U4 has run, and there is one
   database. The host needs `AUTH_SECRET`, `FIREBASE_SERVICE_ACCOUNT` and
   HTTPS, since the cookie is `Secure` in production.
2. **Set `SIGNUP_CODE`.**
3. **The partner signs up** at `/signup`. Sign-up then closes.
4. **Remove `SIGNUP_CODE`.**

The partner can just as well sign up on the local app before the deploy,
since it is the same database.

What else remains is known and accepted:

* **Sign-in has no rate limit**, and a copied session cookie outlives "Sair"
  until it expires or the user's `sessionVersion` changes (see AUTH).
* **A stale cookie is not cleared.** Pages cannot set cookies, so a token whose
  user is gone or whose version is old stays until the next sign-in or "Sair";
  each request with it simply lands on `/login`.
* **The client-side `useActionState` path of `/login`, `/signup` and Perfil was
  not browser-tested** (U2, U5). The harness posts forms without JavaScript,
  which runs the same actions and renders the same `FormState`.
  `TransactionForm`'s client behaviour was browser-tested in U7.1: the share
  box, the part's default and a submit through `useActionState`.
* **The proxy's answer to a Server Action fetch relies on `x-action-redirect`**,
  which Next uses internally rather than documents. Re-check it on Next
  upgrades: with the cookie deleted, submitting a form should land on `/login`,
  not on `error.tsx`.
* **An orphaned budget cannot be cleaned up from the UI.** If a saldo or
  category document is ever deleted in the Firestore console, its budget
  documents must be deleted there too. The `(removido)` row has no single
  document behind it. Soft delete makes this unreachable through the app.
* **`round2` rounds the binary value**: `round2(1.005)` is `1`. No form can
  reach it, since money inputs use `step="0.01"`.
* **The ledger scrolls sideways at about 1280 px.** By design: the table is
  `overflow-x: auto` with `nowrap` cells.
* **Upstream noise.** firebase-admin logs "The `credentials` option is
  deprecated" whenever it is initialized with `cert()`; app code cannot avoid
  it. `npm audit` reports six moderate findings inside firebase-admin's own
  dependency tree, none reachable from a request.
* `@types/node` is `^20` against Node 24, which is what holds Vitest at 4.

## DOCS MAP

`docs/` is gitignored, so everything in it, this file included, exists only on
this machine. `README.md` at the repo root is the only tracked documentation.

| File | What it is |
| --- | --- |
| `CLAUDE.MD` | This file: the spec and the current state. Keep it current. |
| `PLAN.md` | The original seven-phase plan (approved 2026-10-29), with each phase's deviations noted inline. |
| `IMPLEMENTATION.MD` | What phases 1–7 actually produced, how each was verified, and what each left open. |
| `IMPROVEMENT_PLAN.MD` | The improvement track (written 2026-10-30): `description` and defects G1–G6. |
| `IMPROVMENT_IMPLEMENTATION.MD` | What phases A–E actually produced and how each was verified. |
| `NEW_FEATURES.MD` | The new-features track (written 2026-11-02), phases U1–U8: users, ownership, the data migration, saldo mode, sharing, the shared dashboard. Its status table is current. |
| `NEW_FEATURES_IMPLEMENTATION.MD` | What each U phase actually produced, its departures from the plan, how it was verified, and what it left for the next phase. Read it before starting a phase. |

The working agreement in every plan: implement one step at a time; after each
step, stop and record what was done in the plan, its log and this file; ask
before deciding anything the owner should decide.
