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
	 * Always stored. Only an expense can be shared: any other type stores
	 * `false`, so turning a shared expense into a receita or a transfer unshares
	 * it. A shared expense is still the owner's alone to edit, and moves only
	 * the owner's balances; the partner sees it through `SharedTransaction`.
	 */
	shared: boolean;
	/**
	 * Shared expenses only: the partner's part, what they owe the owner for this
	 * expense. Between 0 and `totalAmount`, with `realAmount + sharedAmount` at
	 * most `totalAmount`, and stored only while `shared` is true, so `undefined`
	 * is a real state. It is not derived from `realAmount`: a bill may be split
	 * with other people too. It moves no balance; only the shared dashboard's
	 * settlement reads it.
	 */
	sharedAmount?: number;
	/**
	 * Expenses only: a payment to the partner toward the acerto, recorded by
	 * whoever paid (owner's decision, 2026-11-06). Never together with `shared`.
	 * Stored only when true, so `undefined` is a real state, not a missing
	 * backfill. It moves balances like any expense; the shared dashboard nets
	 * its whole `totalAmount` into the acerto of `settlesMonth`.
	 */
	settlement?: true;
	/**
	 * The acerto a payment counts toward, as "YYYY-MM". Stored only beside
	 * `settlement`. It may differ from `date`'s month: a PIX on 05/04 can settle
	 * March.
	 */
	settlesMonth?: string;
}

/** A shared expense, or a payment toward the acerto. */
export type SharedKind = "expense" | "payment";

/**
 * A shared expense or a payment as either person may see it: these eight
 * fields and nothing else, even on the viewer's own rows. Never the account,
 * the saldo or the real amount, which stay private to the owner.
 */
export interface SharedTransaction {
	id: string;
	date: string;
	description: string;
	totalAmount: number;
	/**
	 * What counts toward the acerto. On an expense, the part of whoever did not
	 * pay: what they owe the owner. On a payment, the whole `totalAmount`.
	 */
	sharedAmount: number;
	/**
	 * Resolved from the owner's categories; "(removida)" when gone. Empty on a
	 * payment, which is not "for" a category: the partner never learns the one
	 * the payer filed it under.
	 */
	categoryName: string;
	ownerId: string;
	kind: SharedKind;
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

/** What the one cross-owner read needs: who is asking, and their partner. */
export type Viewer = Pick<User, "id" | "partnerId">;

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

/**
 * `shared` is optional: absent means not shared. `sharedAmount` is required
 * only on a shared expense, and dropped from anything else. `settlement` is
 * likewise optional, and `settlesMonth` required only on a payment.
 */
export type CreateTransactionInput = Omit<
	Transaction,
	"id" | "ownerId" | "shared" | "settlement"
> & { shared?: boolean; settlement?: boolean };
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
