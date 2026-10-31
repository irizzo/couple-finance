export enum TransactionType { // despesa ou receita
	EXPENSE = "expense",
	INCOME = "income",
}

export interface Transaction {
	id: string;
	date: string; // ISO "YYYY-MM-DD"
	description: string;
	totalAmount: number;
	realAmount: number;
	accountId: string;
	saldoId: string;
	categoryId: string;
	type: TransactionType;
}

/**
 * `description` on Account, Saldo and Category says what the bucket is *for*.
 * Unrelated to `Transaction.description`, which is required and says what the
 * lançamento *was*.
 */
export interface Account {
	id: string;
	name: string;
	description: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
}

export interface Saldo {
	id: string;
	name: string;
	description: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
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
}

export type SetBudgetInput = Omit<Budget, "id">;

/**
 * Optional on input, but always stored: an omitted description is written as
 * `""`, so a document never reads back `undefined` against a `string` type.
 */
export type DescriptionInput = { description?: string };

export type CreateAccountInput = Omit<
	Account,
	"id" | "totalBalance" | "realBalance" | "archived" | "description"
> &
	DescriptionInput;
export type UpdateAccountInput = Partial<
	Pick<Account, "name" | "initialAmount" | "description">
>;

export type CreateSaldoInput = Omit<
	Saldo,
	"id" | "totalBalance" | "realBalance" | "archived" | "description"
> &
	DescriptionInput;
export type UpdateSaldoInput = Partial<
	Pick<Saldo, "name" | "initialAmount" | "description">
>;

export type CreateCategoryInput = Omit<
	Category,
	"id" | "archived" | "description"
> &
	DescriptionInput;
export type UpdateCategoryInput = Partial<
	Pick<Category, "name" | "description">
>;

export type CreateTransactionInput = Omit<Transaction, "id">;
export type UpdateTransactionInput = Partial<CreateTransactionInput>;

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
