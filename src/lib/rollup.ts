import { round2 } from "@/database/validators";
import { type Transaction, TransactionType } from "@/types";

/**
 * Aggregation over a month's transactions. Pure and Firestore-free — the pages
 * fetch, these functions reduce.
 *
 * Note what is *not* here: the expense/receita sign rule. That lives in the data
 * layer (`postings` in `transactions.actions.ts`), where it belongs, because it
 * describes how a transaction moves a stored balance. For display, grouping by
 * type and summing magnitudes is clearer and keeps the rule in one place: an
 * expense row shows `R$ 90,00` next to a "Despesa" badge rather than `-R$ 90,00`
 * whose sign has to agree with a convention defined somewhere else.
 */

const ZERO: AmountPair = { total: 0, real: 0 };

function add(pair: AmountPair, txn: Transaction): AmountPair {
	return {
		total: pair.total + txn.totalAmount,
		real: pair.real + txn.realAmount,
	};
}

function rounded(pair: AmountPair): AmountPair {
	return { total: round2(pair.total), real: round2(pair.real) };
}

/** The two figures every transaction carries: what moved, and what is owed. */
export interface AmountPair {
	total: number;
	real: number;
}

export interface MonthSummary {
	/** Magnitudes, not signed — `type` says which direction it went. */
	expenses: AmountPair;
	income: AmountPair;
	/** Signed: income minus expenses. Negative means the month ran at a loss. */
	net: AmountPair;
	count: number;
}

export function indexById<T extends { id: string }>(
	items: T[],
): Map<string, T> {
	return new Map(items.map((item) => [item.id, item]));
}

export function monthSummary(transactions: Transaction[]): MonthSummary {
	let expenses = ZERO;
	let income = ZERO;

	for (const txn of transactions) {
		if (txn.type === TransactionType.EXPENSE) {
			expenses = add(expenses, txn);
		} else {
			income = add(income, txn);
		}
	}

	return {
		expenses: rounded(expenses),
		income: rounded(income),
		net: rounded({
			total: income.total - expenses.total,
			real: income.real - expenses.real,
		}),
		count: transactions.length,
	};
}
