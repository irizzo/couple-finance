import { round2 } from "@/database/validators";
import {
	type Budget,
	type BudgetScope,
	type Transaction,
	TransactionType,
} from "@/types";

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

/** Above this share of the planned amount a row is "close to the limit". */
const WARNING_RATIO = 0.8;

function statusFor(planned: number | null, spent: number): BudgetStatus {
	if (planned === null) {
		return "unplanned";
	}
	if (spent > planned) {
		return "over";
	}
	// A zero target is met only by spending nothing; any spend against it is over
	// budget, which the branch above has already caught.
	if (planned === 0 || spent / planned >= WARNING_RATIO) {
		return "warning";
	}
	return "ok";
}

function ratioFor(planned: number | null, spent: number): number {
	if (planned === null || spent <= 0) {
		return 0;
	}
	if (planned <= 0) {
		return 1;
	}
	return Math.min(spent / planned, 1);
}

/**
 * A row is shown when it is still active, or when it carries money — spend or a
 * planned figure. That keeps a long tail of archived targets out of the table
 * without ever hiding a number that belongs to the month.
 */
function isWorthShowing(
	entity: BudgetTarget,
	planned: number | null,
	spent: AmountPair | undefined,
): boolean {
	return (
		!entity.archived ||
		planned !== null ||
		(spent !== undefined && (spent.total !== 0 || spent.real !== 0))
	);
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

/** The minimum a saldo or category has to look like to be budgeted against. */
export interface BudgetTarget {
	id: string;
	name: string;
	description: string;
	archived: boolean;
}

export type BudgetStatus = "ok" | "warning" | "over" | "unplanned";

export interface BudgetRow {
	targetId: string;
	name: string;
	/** What the target is for — "what counts as Essenciais?". `""` when unset. */
	description: string;
	archived: boolean;
	/** `null` when nothing is planned for this target this month. */
	planned: number | null;
	/** The budget document's id, for deleting it. `null` when unplanned. */
	budgetId: string | null;
	/** Expense-only. `real` is what the target is measured against. */
	spent: AmountPair;
	/** `planned - spent.real`; negative means over budget. `null` when unplanned. */
	remaining: number | null;
	status: BudgetStatus;
	/** 0…1, for the proportional bar. Clamped, so an overrun doesn't overflow. */
	ratio: number;
}

export interface BudgetSection {
	scope: BudgetScope;
	rows: BudgetRow[];
	planned: number;
	/** Every row's spend, planned or not — this is what the ledger shows. */
	spent: AmountPair;
	/**
	 * Summed over the **planned** rows only, so it is not `planned - spent.real`
	 * whenever there is unplanned spend. Charging money against a target that was
	 * never budgeted to the plan's remainder would make the plan look broken by
	 * spending it never accounted for.
	 */
	remaining: number;
}

/** Keyed sums over whatever subset of transactions is handed in. */
export function sumBy(
	transactions: Transaction[],
	keyOf: (txn: Transaction) => string,
): Map<string, AmountPair> {
	const sums = new Map<string, AmountPair>();
	for (const txn of transactions) {
		const key = keyOf(txn);
		sums.set(key, add(sums.get(key) ?? ZERO, txn));
	}
	for (const [key, pair] of sums) {
		sums.set(key, rounded(pair));
	}
	return sums;
}

/**
 * One month's budget table for one dimension — called once with the saldos and
 * once with the categories.
 *
 * **Expenses only.** Netting a receita against a target would let a salary
 * deposit silently pay for an overrun, which is the opposite of what a plan is
 * for; income is reported separately on the ledger.
 *
 * Since Phase 1 the two dimensions are siblings, so this is one flat list rather
 * than a tree, and the saldo and category tables are **not reconciled**: they
 * sum the same transactions along different axes, and both totals are correct
 * for their own axis.
 */
export function buildBudgetRows({
	scope,
	entities,
	budgets,
	transactions,
}: {
	scope: BudgetScope;
	entities: BudgetTarget[];
	budgets: Budget[];
	transactions: Transaction[];
}): BudgetSection {
	const keyOf = (txn: Transaction) =>
		scope === "saldo" ? txn.saldoId : txn.categoryId;
	const spending = sumBy(
		transactions.filter((txn) => txn.type === TransactionType.EXPENSE),
		keyOf,
	);
	const planned = new Map(
		budgets
			.filter((budget) => budget.scope === scope)
			.map((budget) => [budget.targetId, budget]),
	);

	const rows: BudgetRow[] = [];
	for (const entity of entities) {
		const budget = planned.get(entity.id);
		const amount = budget?.plannedAmount ?? null;
		const spent = spending.get(entity.id);
		if (!isWorthShowing(entity, amount, spent)) {
			continue;
		}
		const real = spent?.real ?? 0;
		rows.push({
			targetId: entity.id,
			name: entity.name,
			description: entity.description,
			archived: entity.archived,
			planned: amount,
			budgetId: budget?.id ?? null,
			spent: spent ?? ZERO,
			remaining: amount === null ? null : round2(amount - real),
			status: statusFor(amount, real),
			ratio: ratioFor(amount, real),
		});
	}

	// Money pointing at a target that no longer exists — spend *or* a plan. Soft
	// delete means this shouldn't happen through the UI, so it is surfaced rather
	// than dropped: otherwise the section's spend would silently disagree with the
	// ledger, and its planned total with `listBudgets`. Everything orphaned lands
	// on one row with `budgetId: null`, so it stays read-only — there is no single
	// budget document behind a sum.
	const known = new Set(entities.map((entity) => entity.id));
	let orphanedSpend = ZERO;
	for (const [key, pair] of spending) {
		if (!known.has(key)) {
			orphanedSpend = {
				total: orphanedSpend.total + pair.total,
				real: orphanedSpend.real + pair.real,
			};
		}
	}
	let orphanedPlan: number | null = null;
	for (const [targetId, budget] of planned) {
		if (!known.has(targetId)) {
			orphanedPlan = (orphanedPlan ?? 0) + budget.plannedAmount;
		}
	}
	if (
		orphanedPlan !== null ||
		orphanedSpend.total !== 0 ||
		orphanedSpend.real !== 0
	) {
		const amount = orphanedPlan === null ? null : round2(orphanedPlan);
		const real = round2(orphanedSpend.real);
		rows.push({
			targetId: "",
			name: "(removido)",
			description: "",
			archived: false,
			planned: amount,
			budgetId: null,
			spent: rounded(orphanedSpend),
			// The same rules as any other row, so the section totals below need no
			// special case for this one.
			remaining: amount === null ? null : round2(amount - real),
			status: statusFor(amount, real),
			ratio: ratioFor(amount, real),
		});
	}

	return {
		scope,
		rows,
		planned: round2(rows.reduce((sum, row) => sum + (row.planned ?? 0), 0)),
		spent: rounded(
			rows.reduce(
				(sum, row) => ({
					total: sum.total + row.spent.total,
					real: sum.real + row.spent.real,
				}),
				ZERO,
			),
		),
		remaining: round2(rows.reduce((sum, row) => sum + (row.remaining ?? 0), 0)),
	};
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
