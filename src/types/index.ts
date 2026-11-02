export enum TransactionType { // despesa, receita ou transferência
	EXPENSE = "expense",
	INCOME = "income",
	TRANSFER = "transfer",
}

export interface Transaction {
	id: string;
	date: string; // ISO "YYYY-MM-DD"
	description: string;
	totalAmount: number;
	realAmount: number;
	/** On a transfer, the origin: where the money leaves from. */
	accountId: string;
	/**
	 * Absent on a transaction recorded with saldos off ("Só contas"), and kept
	 * on one recorded before they were switched off. Like the destination
	 * fields, `undefined` is a real state, not a missing backfill: the document,
	 * not the current preference, decides which balances move.
	 */
	saldoId?: string;
	categoryId: string;
	type: TransactionType;
	/**
	 * Transfer only: where the money lands. Stored on transfers and absent on
	 * every other type, so `undefined` here is a real state rather than a missing
	 * backfill. The destination may repeat the origin's account or its saldo, but
	 * not both — that would move nothing. `toSaldoId` is also absent on a
	 * transfer recorded with saldos off.
	 */
	toAccountId?: string;
	toSaldoId?: string;
	ownerId: string;
	/**
	 * Always stored. Always `false` until Phase U6 puts the checkbox in the form;
	 * written now so the U4 migration touches the real data only once.
	 */
	shared: boolean;
}

/**
 * `description` on Account, Saldo and Category says what the bucket is *for*.
 * Unrelated to `Transaction.description`, which is required and says what the
 * lançamento *was*.
 *
 * `ownerId`, on these and on Transaction and Budget, is the user the document
 * belongs to. The data layer writes it from its `owner` argument on create and
 * never changes it; no input type carries it.
 */
export interface Account {
	id: string;
	name: string;
	description: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
	ownerId: string;
}

export interface Saldo {
	id: string;
	name: string;
	description: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
	ownerId: string;
}

/**
 * Independent of Saldo: a transaction carries both a `saldoId` and a
 * `categoryId`, but any category may pair with any saldo.
 */
export interface Category {
	id: string;
	name: string;
	description: string;
	archived: boolean;
	ownerId: string;
}

export type BudgetScope = "saldo" | "category";

/**
 * A planned amount for one month on one target.
 *
 * `scope` + `targetId` rather than nullable `saldoId` / `categoryId` columns:
 * since saldo and category are independent tags, the two dimensions are siblings
 * and one discriminated pair says that plainly. Each month stands alone — there
 * is no "recurring budget" record, only `copyBudgets` to seed the next one.
 */
export interface Budget {
	id: string;
	month: string; // ISO "YYYY-MM"
	scope: BudgetScope;
	targetId: string; // a saldoId or a categoryId, per `scope`
	plannedAmount: number;
	ownerId: string;
}

export type SetBudgetInput = Omit<Budget, "id" | "ownerId">;

/**
 * One of the two people. The app is for exactly two: the second to sign up
 * becomes the first one's partner, and sign-up closes.
 */
export interface User {
	id: string;
	username: string; // lowercase, unique, immutable
	name: string;
	passwordHash: string; // never leaves src/database, except to sign-in
	useSaldos: boolean;
	partnerId: string | null;
	sessionVersion: number; // bumped on password change
}

/** What pages and components may see. Never carries the hash. */
export type SessionUser = Pick<
	User,
	"id" | "username" | "name" | "useSaldos" | "partnerId"
>;

/** What the data layer needs to scope a call. `SessionUser` satisfies it. */
export type Owner = Pick<User, "id" | "useSaldos">;

/**
 * Optional on input, but always stored: an omitted description is written as
 * `""`, so a document never reads back `undefined` against a `string` type.
 */
export type DescriptionInput = { description?: string };

export type CreateAccountInput = Omit<
	Account,
	"id" | "totalBalance" | "realBalance" | "archived" | "description" | "ownerId"
> &
	DescriptionInput;
export type UpdateAccountInput = Partial<
	Pick<Account, "name" | "initialAmount" | "description">
>;

export type CreateSaldoInput = Omit<
	Saldo,
	"id" | "totalBalance" | "realBalance" | "archived" | "description" | "ownerId"
> &
	DescriptionInput;
export type UpdateSaldoInput = Partial<
	Pick<Saldo, "name" | "initialAmount" | "description">
>;

export type CreateCategoryInput = Omit<
	Category,
	"id" | "archived" | "description" | "ownerId"
> &
	DescriptionInput;
export type UpdateCategoryInput = Partial<
	Pick<Category, "name" | "description">
>;

/** `shared` joins the input in Phase U6, with the checkbox that sets it. */
export type CreateTransactionInput = Omit<
	Transaction,
	"id" | "ownerId" | "shared"
>;
export type UpdateTransactionInput = Partial<CreateTransactionInput>;

/** What Perfil may change. The username is immutable. */
export type UpdateProfileInput = Partial<Pick<User, "name" | "useSaldos">>;

/** `password` is the plain text: `createUser` hashes it, and stores only the hash. */
export type CreateUserInput = Pick<User, "username" | "name" | "useSaldos"> & {
	password: string;
};

export interface ListOptions {
	includeArchived?: boolean;
}

export interface TransactionFilters {
	from: string;
	to: string;
	accountId?: string;
	saldoId?: string;
	categoryId?: string;
}
