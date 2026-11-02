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
- **Transfers** move money between two accounts, between two saldos, or both.
  They are not counted as income or spending.
- **Duplication.** "Duplicar" opens a prefilled form for a recurring expense.
  Adjust this month's amount, then save.
- **Monthly budgets.** Plan each month by saldo and by category in two
  separate tables, edited in place. Each row shows planned, spent and remaining
  amounts with a progress bar. One button copies last month's plan.
- **Archive instead of delete.** Accounts, saldos and categories can be
  archived and restored. Past transactions keep pointing at them.
- **Shared password.** The whole app sits behind one password for both people.

## How balances work

Accounts and saldos each keep two stored balances, one for total amounts and
one for real amounts. Every transaction updates both balances on both its
account and its saldo. Expenses subtract and income adds. The R$ 90 / R$ 45
bill takes an account that started at R$ 1.000 to 910 (total) and 955 (real).

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
   AUTH_PASSWORD=a-long-passphrase-you-will-share
   AUTH_SECRET=<at least 32 characters; generate one with: openssl rand -hex 32>
   ```

   If either value is missing, or `AUTH_SECRET` is shorter than 32
   characters, every request fails with an error. There is no default.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000> and sign in with `AUTH_PASSWORD`.

5. Before entering transactions, go to **Configurações** and create at least
   one account, one saldo and one category.

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
  app/            Routes: /transactions, /budget, /settings, /login
    _actions/     Server Actions. Each checks the session, then calls the data layer
  components/     Shared UI: forms, tables, navigation
  database/       Firestore access (server-only), validation, Admin SDK setup
  lib/            Pure helpers for months, money, totals and sessions, with specs
  proxy.ts        Sends requests without a valid session to /login
  types/          Entity types
```

## Deploying

Set three environment variables on the host:

- `AUTH_PASSWORD`, the shared password;
- `AUTH_SECRET`, 32 or more random characters;
- `FIREBASE_SERVICE_ACCOUNT`, the service-account JSON. In a dotenv file, wrap
  it in single quotes so its `\n` escapes survive.

Serve the app over HTTPS: in production the session cookie is marked `Secure`.
No time zone setting is needed, because the app reads dates in
`America/Sao_Paulo` regardless of the server's zone.

## Security notes

- Sessions are signed cookies that last 30 days. Changing `AUTH_SECRET` signs
  everyone out.
- Sign-in attempts are not rate-limited, so use a long passphrase.
- The Firebase Admin key bypasses Firestore security rules. Keep it out of the
  repository and out of the browser.

## Documentation

Detailed design notes, conventions and the decision log are kept in `docs/`,
which is not committed. `AGENTS.md` holds the instructions that `next dev`
writes for coding agents.
