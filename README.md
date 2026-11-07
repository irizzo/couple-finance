# Couple Finance

A personal finance organizer for a couple, built with Next.js and Cloud
Firestore. The interface is in Portuguese (pt-BR) and amounts are in reais
(R$).

Many everyday expenses are split with other people, so every transaction
records two amounts: the **total** that left the account and the **real**
share you actually owe. An internet bill that takes R$ 90 from the checking
account, split 50/50, is stored as R$ 90 total and R$ 45 real.

## Features

- **Monthly ledger.** See every transaction in a month with totals for
  expenses (despesas), income (receitas) and the result. Filter by account,
  saldo or category.
- **Split expenses.** Each transaction has a total and a real amount. The form
  copies the total into the real field as you type, and a "dividir 50/50"
  button halves it.
- **Three ways to tag money.** Every transaction has an **account** (conta,
  where the money sits), a **saldo** (a broad bucket such as "Essenciais") and
  a **category** (a specific kind of spending such as "Moradia" or "Mercado").
  Saldos and categories are independent: any category can go with any saldo.
- **Saldos are optional.** Each person chooses "Contas e saldos" or "Só
  contas" at sign-up, and can switch later. With "Só contas", no screen asks
  for a saldo or shows one. Switching deletes nothing.
- **Transfers** move money between two accounts, between two saldos, or both.
  They are not counted as income or spending.
- **Duplication.** "Duplicar" opens a prefilled form for a recurring expense.
  Adjust this month's amount, then save.
- **Monthly budgets.** Plan each month by saldo and by category in two
  separate tables, edited in place. Each row shows planned, spent and remaining
  amounts with a progress bar. One button copies last month's plan.
- **Archive instead of delete.** Accounts, saldos and categories can be
  archived and restored. Past transactions keep pointing at them.
- **A login for each person, and each person's own data.** Each of the two
  people signs up with a username and their own password. Sign-up needs an
  invite code and closes once two accounts exist. Accounts, saldos,
  categories, transactions and budgets belong to whoever created them, and
  the other person can neither see nor change them.
- **Shared expenses.** Choose "Dividir com …" on an expense and set the
  other person's part: what they owe you for it. It starts at total minus
  real, and your real amount plus their part can't be more than the total.
  The other person sees the description, date, total, their part,
  category and who paid. They never see your account, your saldo or your real
  amount, and only you can edit or delete the expense.
- **Shared dashboard** (Compartilhado). Both people's shared expenses for a
  month, what each paid, and who owes whom. The table can be filtered by who
  paid and by category, and categories with the same name are merged. The
  cards always count both people.
- **Paying what you owe.** When you send the other person money to settle a
  month, record it as an expense with "Pagamento a …" and pick the month it
  settles ("Referente a"). The dashboard's "Registrar pagamento" button opens
  the form already filled in. The payment counts toward that month's
  settlement even when you pay it later. For you it is an ordinary expense.
  Only the person who pays records it. The person who receives it can log
  an income with real amount 0 to correct their account balance.
- **Profile** (Perfil). Change your name, your saldo mode and your password.
  Changing the password signs out your other sessions.

## How balances work

Accounts and saldos each keep two stored balances, one for total amounts and
one for real amounts. Every transaction updates both balances on its account,
and on its saldo when it has one. Expenses subtract and income adds. The R$ 90 / R$ 45
bill takes an account that started at R$ 1.000 to 910 (total) and 955 (real).

A shared expense moves only the payer's balances. The other person's part
moves no balance. It only feeds the dashboard's settlement, which nets what
each person owes the other for the month in view, minus the payments
recorded toward that month.

Budgets compare the plan against **real** expense amounts only. Income never
offsets a budget, and a transfer is not spending. The saldo and category
tables sum the same transactions along different axes, so their totals are not
expected to match.

## Tech stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js 16.4 (App Router, Server Components, Server Actions), React 19 |
| Data | Cloud Firestore through the `firebase-admin` SDK, used only on the server |
| Styling | CSS Modules and CSS custom properties, with light and dark themes |
| Lint and format | Biome |
| Tests | Vitest, over the pure helpers in `src/lib` |
| Runtime | Node.js 24 |

## Getting started

You need Node.js 24 and a Firebase project with a Firestore database.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Give the app a Firestore credential. In the Firebase console, open
   **Project settings → Service accounts** and generate a new private key.
   Save the file as `src/database/serviceAccountKey.json`. It is gitignored.
   Alternatively, put the key's JSON in the `FIREBASE_SERVICE_ACCOUNT`
   environment variable.

3. Create `.env.local` in the project root. It is gitignored.

   ```bash
   AUTH_SECRET=<at least 32 characters; generate one with: openssl rand -hex 32>
   SIGNUP_CODE=<an invite code; generate one with: openssl rand -hex 16>
   ```

   If `AUTH_SECRET` is missing or shorter than 32 characters, every request
   fails with an error. There is no default. While `SIGNUP_CODE` is unset,
   sign-up is closed.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000/signup>, enter the invite code, and choose a
   username, a name, a password and a saldo mode. Passwords need at least 12
   characters. The second person signs up the same way and becomes the
   first person's partner. Sign-up then closes.

5. Before entering transactions, go to **Configurações** and create at least
   one account and one category, plus one saldo if you chose "Contas e
   saldos".

The app reads and writes whichever Firestore database the credential belongs
to, so local development uses real data unless you point it at a separate
Firebase project.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serves the production build |
| `npm test` | Runs the Vitest suite once |
| `npm run lint` | Biome lint and format check |
| `npm run format` | Formats the code with Biome |

## Project structure

```text
src/
  app/            Routes: /transactions, /shared, /budget, /settings, /login, /signup
    _actions/     Server Actions. Each checks the session, then calls the data layer
  components/     Shared UI: forms, tables, navigation
  database/       Firestore access (server-only), validation, Admin SDK setup
  lib/            Pure helpers for months, money, totals and sessions, with specs
  proxy.ts        Sends requests without a valid session to /login
  types/          Entity types
```

## Deploying

Set these environment variables on the host:

- `AUTH_SECRET`, 32 or more random characters;
- `SIGNUP_CODE`, only while someone still has to sign up. Remove it once both
  people have accounts;
- `FIREBASE_SERVICE_ACCOUNT`, the service-account JSON. In a dotenv file, wrap
  it in single quotes so its `\n` escapes survive.

Serve the app over HTTPS: in production the session cookie is marked `Secure`.
No time zone setting is needed, because the app reads dates in
`America/Sao_Paulo` regardless of the server's zone.

The order, when one person has signed up and the other has not:

1. Deploy with `AUTH_SECRET` and `FIREBASE_SERVICE_ACCOUNT`.
2. Set `SIGNUP_CODE`.
3. The second person signs up at `/signup`.
4. Remove `SIGNUP_CODE`.

## Security notes

- Sessions are signed cookies that last 30 days. Changing `AUTH_SECRET` signs
  everyone out, and changing your password signs out your other sessions.
- Every read and write is checked on the server against the signed-in
  person. Someone else's record reads exactly like a missing one.
- The shared dashboard receives only the shared fields listed above. A
  shared expense's account, saldo and real amount, and a payment's category,
  never leave the server for the other person.
- Sign-in attempts are not rate-limited, so passwords need at least 12
  characters. A wrong password and an unknown username get the same message.
- Passwords are stored as scrypt hashes, never in plain text.
- The Firebase Admin key bypasses Firestore security rules. Keep it out of the
  repository and out of the browser.

## Documentation

Detailed design notes, conventions and the decision log are kept in `docs/`,
which is not committed. `AGENTS.md` holds the instructions that `next dev`
writes for coding agents.
