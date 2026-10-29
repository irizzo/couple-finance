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

export interface Account {
	id: string;
	name: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
}

export interface Saldo {
	id: string;
	name: string;
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
	archived: boolean;
}

export type CreateAccountInput = Omit<
	Account,
	"id" | "totalBalance" | "realBalance" | "archived"
>;
export type UpdateAccountInput = Partial<
	Pick<Account, "name" | "initialAmount">
>;

export type CreateSaldoInput = Omit<
	Saldo,
	"id" | "totalBalance" | "realBalance" | "archived"
>;
export type UpdateSaldoInput = Partial<Pick<Saldo, "name" | "initialAmount">>;

export type CreateCategoryInput = Omit<Category, "id" | "archived">;
export type UpdateCategoryInput = Partial<Pick<Category, "name">>;

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
