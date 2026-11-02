import { describe, expect, it } from "vitest";
import {
	type Budget,
	type BudgetScope,
	type Transaction,
	TransactionType,
} from "@/types";
import {
	type BudgetSection,
	type BudgetTarget,
	buildBudgetRows,
	monthSummary,
} from "./rollup";

const MONTH = "2026-10";

function expense(
	totalAmount: number,
	realAmount: number,
	fields: Partial<Transaction> = {},
): Transaction {
	return {
		id: "txn",
		date: `${MONTH}-15`,
		description: "lançamento",
		totalAmount,
		realAmount,
		accountId: "conta-corrente",
		saldoId: "essenciais",
		categoryId: "mercado",
		type: TransactionType.EXPENSE,
		...fields,
	};
}

function income(amount: number, fields: Partial<Transaction> = {}) {
	return expense(amount, amount, { type: TransactionType.INCOME, ...fields });
}

function transfer(amount: number, fields: Partial<Transaction> = {}) {
	return expense(amount, amount, {
		type: TransactionType.TRANSFER,
		toAccountId: "poupanca",
		toSaldoId: "reserva",
		...fields,
	});
}

function target(id: string, fields: Partial<BudgetTarget> = {}): BudgetTarget {
	return { id, name: id, description: "", archived: false, ...fields };
}

function budget(
	targetId: string,
	plannedAmount: number,
	scope: BudgetScope = "category",
): Budget {
	return {
		id: `${MONTH}__${scope}__${targetId}`,
		month: MONTH,
		scope,
		targetId,
		plannedAmount,
	};
}

function categories(
	entities: BudgetTarget[],
	budgets: Budget[],
	transactions: Transaction[],
): BudgetSection {
	return buildBudgetRows({
		scope: "category",
		entities,
		budgets,
		transactions,
	});
}

function rowFor(section: BudgetSection, targetId: string) {
	const row = section.rows.find((candidate) => candidate.targetId === targetId);
	if (!row) {
		throw new Error(`No row for ${JSON.stringify(targetId)}`);
	}
	return row;
}

describe("monthSummary", () => {
	it("splits the canonical R$ 90 bill into what moved and what is owed", () => {
		expect(monthSummary([expense(90, 45)])).toEqual({
			expenses: { total: 90, real: 45 },
			income: { total: 0, real: 0 },
			net: { total: -90, real: -45 },
			count: 1,
		});
	});

	it("nets income against expenses", () => {
		const summary = monthSummary([expense(90, 45), income(1000)]);
		expect(summary.net).toEqual({ total: 910, real: 955 });
		expect(summary.count).toBe(2);
	});

	it("rounds away float drift", () => {
		const summary = monthSummary([
			expense(0.1, 0.1),
			expense(0.1, 0.1),
			expense(0.1, 0.1),
		]);
		expect(summary.expenses).toEqual({ total: 0.3, real: 0.3 });
	});

	it("counts a transfer without reading it as income or spend", () => {
		expect(monthSummary([expense(90, 45), transfer(500)])).toEqual({
			expenses: { total: 90, real: 45 },
			income: { total: 0, real: 0 },
			net: { total: -90, real: -45 },
			count: 2,
		});
	});
});

describe("buildBudgetRows", () => {
	it("measures a target by what is owed, not by what moved", () => {
		const row = rowFor(
			categories(
				[target("mercado")],
				[budget("mercado", 100)],
				[expense(150, 75)],
			),
			"mercado",
		);
		expect(row.spent).toEqual({ total: 150, real: 75 });
		expect(row.remaining).toBe(25);
		expect(row.status).toBe("ok");
		expect(row.ratio).toBe(0.75);
	});

	it("does not let a receita reduce a target's spend", () => {
		const row = rowFor(
			categories(
				[target("mercado")],
				[budget("mercado", 100)],
				[expense(30, 30), income(50)],
			),
			"mercado",
		);
		expect(row.spent).toEqual({ total: 30, real: 30 });
		expect(row.remaining).toBe(70);
	});

	it.each([
		["saldo", "essenciais"],
		["category", "mercado"],
	] as const)("does not count a transfer as %s spend", (scope, targetId) => {
		const row = rowFor(
			buildBudgetRows({
				scope,
				entities: [target(targetId)],
				budgets: [budget(targetId, 100, scope)],
				transactions: [expense(30, 30), transfer(500)],
			}),
			targetId,
		);
		expect(row.spent).toEqual({ total: 30, real: 30 });
		expect(row.remaining).toBe(70);
	});

	it.each([
		[0, "ok", 0, 100],
		[79.99, "ok", 0.7999, 20.01],
		[80, "warning", 0.8, 20],
		[100, "warning", 1, 0],
		[100.01, "over", 1, -0.01],
		// Clamped, so an overrun does not overflow the bar.
		[250, "over", 1, -150],
	])(
		"against R$ 100, spending %s is %s at ratio %s",
		(spent, status, ratio, remaining) => {
			const row = rowFor(
				categories(
					[target("mercado")],
					[budget("mercado", 100)],
					[expense(spent, spent)],
				),
				"mercado",
			);
			expect(row.status).toBe(status);
			expect(row.ratio).toBeCloseTo(ratio);
			expect(row.remaining).toBe(remaining);
		},
	);

	it("puts any spend against a zero target over budget", () => {
		const row = rowFor(
			categories(
				[target("lazer")],
				[budget("lazer", 0)],
				[expense(0.01, 0.01, { categoryId: "lazer" })],
			),
			"lazer",
		);
		expect(row.status).toBe("over");
		expect(row.ratio).toBe(1);
		expect(row.remaining).toBe(-0.01);
	});

	it("holds a zero target with no spend at its limit", () => {
		const row = rowFor(
			categories([target("lazer")], [budget("lazer", 0)], []),
			"lazer",
		);
		expect(row.status).toBe("warning");
		expect(row.ratio).toBe(0);
	});

	it("reports unplanned spend without a remainder", () => {
		const row = rowFor(
			categories([target("mercado")], [], [expense(40, 20)]),
			"mercado",
		);
		expect(row).toMatchObject({
			planned: null,
			budgetId: null,
			remaining: null,
			status: "unplanned",
			ratio: 0,
		});
	});

	it("copies the target's identity onto its row", () => {
		const row = rowFor(
			categories(
				[
					target("mercado", {
						name: "Mercado",
						description: "Compras do mês e da feira",
					}),
				],
				[budget("mercado", 100)],
				[],
			),
			"mercado",
		);
		expect(row).toMatchObject({
			name: "Mercado",
			description: "Compras do mês e da feira",
			archived: false,
			budgetId: "2026-10__category__mercado",
		});
	});

	describe("archived targets", () => {
		it("drops one that carries no money", () => {
			const section = categories(
				[target("antiga", { archived: true })],
				[],
				[],
			);
			expect(section.rows).toEqual([]);
		});

		it("keeps one with spend", () => {
			const row = rowFor(
				categories(
					[target("antiga", { archived: true })],
					[],
					[expense(20, 10, { categoryId: "antiga" })],
				),
				"antiga",
			);
			expect(row.archived).toBe(true);
			expect(row.spent).toEqual({ total: 20, real: 10 });
		});

		it("keeps one with only a plan", () => {
			const row = rowFor(
				categories(
					[target("antiga", { archived: true })],
					[budget("antiga", 300)],
					[],
				),
				"antiga",
			);
			expect(row.planned).toBe(300);
		});

		it("keeps an active one even when it is empty", () => {
			const row = rowFor(categories([target("mercado")], [], []), "mercado");
			expect(row.status).toBe("unplanned");
		});
	});

	describe("the (removido) row", () => {
		it("carries spend against a deleted target", () => {
			const section = categories(
				[target("mercado")],
				[],
				[expense(25, 12.5, { categoryId: "apagada" })],
			);
			expect(section.rows.at(-1)).toEqual({
				targetId: "",
				name: "(removido)",
				description: "",
				archived: false,
				planned: null,
				budgetId: null,
				spent: { total: 25, real: 12.5 },
				remaining: null,
				status: "unplanned",
				ratio: 0,
			});
		});

		it("carries a plan on a deleted target", () => {
			const row = rowFor(
				categories([target("mercado")], [budget("apagada", 50)], []),
				"",
			);
			expect(row.planned).toBe(50);
			expect(row.remaining).toBe(50);
			expect(row.budgetId).toBeNull();
		});

		it("collapses every deleted target onto one row, plan and spend together", () => {
			const section = categories(
				[target("mercado")],
				[budget("apagada-1", 50)],
				[expense(70, 35, { categoryId: "apagada-2" })],
			);
			expect(section.rows.filter((row) => row.targetId === "")).toHaveLength(1);
			expect(rowFor(section, "")).toMatchObject({
				planned: 50,
				spent: { total: 70, real: 35 },
				remaining: 15,
				status: "ok",
				ratio: 0.7,
			});
		});

		it("is absent when nothing is orphaned", () => {
			const section = categories(
				[target("mercado")],
				[budget("mercado", 100)],
				[expense(30, 30)],
			);
			expect(section.rows.map((row) => row.targetId)).toEqual(["mercado"]);
		});

		it("does not mistake the other scope's budgets for orphans", () => {
			const section = categories(
				[target("mercado")],
				[budget("essenciais", 500, "saldo")],
				[],
			);
			expect(section.rows.map((row) => row.targetId)).toEqual(["mercado"]);
			expect(section.planned).toBe(0);
		});
	});

	describe("section totals", () => {
		it("sums the remainder over planned rows only", () => {
			const section = categories(
				[target("mercado"), target("lazer"), target("farmacia")],
				[budget("mercado", 100), budget("lazer", 50)],
				[
					expense(30, 30),
					expense(80, 80, { categoryId: "lazer" }),
					expense(50, 50, { categoryId: "farmacia" }),
				],
			);
			expect(section.planned).toBe(150);
			expect(section.spent).toEqual({ total: 160, real: 160 });
			// 70 left on mercado, 30 over on lazer; farmacia's unplanned 50 is not
			// charged to the plan.
			expect(section.remaining).toBe(40);
		});

		it("agree with the ledger and with the month's budgets, orphans included", () => {
			const transactions = [
				expense(90, 45),
				expense(25, 12.5, { categoryId: "apagada", saldoId: "apagado" }),
				income(1000),
			];
			const budgets = [
				budget("mercado", 100),
				budget("apagada", 40),
				budget("essenciais", 500, "saldo"),
			];
			const ledger = monthSummary(transactions).expenses;

			const byCategory = categories([target("mercado")], budgets, transactions);
			const bySaldo = buildBudgetRows({
				scope: "saldo",
				entities: [target("essenciais")],
				budgets,
				transactions,
			});

			// Same transactions, different axes: each section matches the ledger on
			// its own, and each plan total matches its own scope's budgets.
			expect(byCategory.spent).toEqual(ledger);
			expect(bySaldo.spent).toEqual(ledger);
			expect(byCategory.planned).toBe(140);
			expect(bySaldo.planned).toBe(500);
		});
	});
});
