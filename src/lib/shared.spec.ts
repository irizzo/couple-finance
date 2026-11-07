import { describe, expect, it } from "vitest";
import type { SharedTransaction } from "@/types";
import {
	categoryKey,
	filterShared,
	ledgerHref,
	ledgerPath,
	paymentHref,
	recordHref,
	resolveReturnTo,
	sharedCategoryOptions,
	sharedDashboard,
	sharedSummary,
} from "./shared";

const ANA = "ana";
const BIA = "bia";
const MONTH = "2026-10";

/** A shared expense split 50/50 unless `fields` says otherwise. */
function row(
	ownerId: string,
	totalAmount: number,
	categoryName = "Mercado",
	fields: Partial<SharedTransaction> = {},
): SharedTransaction {
	return {
		id: `${ownerId}-${totalAmount}-${categoryName}`,
		date: `${MONTH}-15`,
		description: "compra",
		totalAmount,
		sharedAmount: totalAmount / 2,
		categoryName,
		ownerId,
		kind: "expense",
		...fields,
	};
}

/** A shared expense whose other person's part is `sharedAmount`. */
function part(ownerId: string, totalAmount: number, sharedAmount: number) {
	return row(ownerId, totalAmount, "Mercado", { sharedAmount });
}

/**
 * A payment toward the acerto, as the projection builds it: the whole amount
 * counts, and it is dated early next month by default.
 */
function payment(
	ownerId: string,
	totalAmount: number,
	fields: Partial<SharedTransaction> = {},
): SharedTransaction {
	return row(ownerId, totalAmount, "Acerto", {
		id: `${ownerId}-payment-${totalAmount}`,
		date: "2026-11-05",
		sharedAmount: totalAmount,
		kind: "payment",
		...fields,
	});
}

describe("categoryKey", () => {
	it("merges case, surrounding spaces and accents", () => {
		for (const name of ["Mercado", "mercado ", "Mêrcado", "  MERCADO"]) {
			expect(categoryKey(name)).toBe("mercado");
		}
	});

	it("strips Portuguese accents and the cedilla", () => {
		expect(categoryKey("Saúde")).toBe("saude");
		expect(categoryKey("Alimentação")).toBe("alimentacao");
	});

	it("gives one key for composed and decomposed spellings", () => {
		expect(categoryKey("Sa\u00fade")).toBe(categoryKey("Sau\u0301de"));
	});
});

describe("sharedCategoryOptions", () => {
	it("merges both people's spellings into one option", () => {
		const options = sharedCategoryOptions(
			[row(BIA, 10, "mercado"), row(ANA, 20, "Mercado")],
			ANA,
		);
		expect(options).toEqual([{ key: "mercado", label: "Mercado" }]);
	});

	it("labels with the viewer's spelling, whichever row comes first", () => {
		const rows = [row(ANA, 20, "Mercado"), row(BIA, 10, "MERCADO")];
		expect(sharedCategoryOptions(rows, ANA)[0].label).toBe("Mercado");
		expect(sharedCategoryOptions(rows, BIA)[0].label).toBe("MERCADO");
		expect(sharedCategoryOptions([...rows].reverse(), ANA)[0].label).toBe(
			"Mercado",
		);
	});

	it("falls back to the partner's spelling", () => {
		expect(sharedCategoryOptions([row(BIA, 10, "Farmácia")], ANA)).toEqual([
			{ key: "farmacia", label: "Farmácia" },
		]);
	});

	it("sorts by key, so an accent does not move an option", () => {
		const options = sharedCategoryOptions(
			[row(ANA, 1, "Mercado"), row(ANA, 2, "Água"), row(BIA, 3, "lazer")],
			ANA,
		);
		expect(options.map((option) => option.label)).toEqual([
			"Água",
			"lazer",
			"Mercado",
		]);
	});

	it("is empty for an empty month", () => {
		expect(sharedCategoryOptions([], ANA)).toEqual([]);
	});
});

describe("filterShared", () => {
	const rows = [
		row(ANA, 100, "Mercado"),
		row(BIA, 40, "mercado"),
		row(BIA, 15, "Lazer"),
	];

	it("keeps everything without filters", () => {
		expect(filterShared(rows, {})).toEqual(rows);
	});

	it("narrows by owner", () => {
		expect(filterShared(rows, { ownerId: BIA })).toEqual([rows[1], rows[2]]);
	});

	it("narrows by merged category", () => {
		expect(filterShared(rows, { categoryKey: "mercado" })).toEqual([
			rows[0],
			rows[1],
		]);
	});

	it("applies both filters together", () => {
		expect(
			filterShared(rows, { ownerId: BIA, categoryKey: "mercado" }),
		).toEqual([rows[1]]);
	});
});

describe("sharedSummary", () => {
	it("nets the parts: 100 and 40, each split 50/50, leave Bia owing 30", () => {
		const summary = sharedSummary([row(ANA, 100), row(BIA, 40)], ANA, BIA);
		expect(summary).toEqual({
			total: { shared: 70, total: 140 },
			paid: {
				viewer: { shared: 50, total: 100 },
				partner: { shared: 20, total: 40 },
			},
			count: 2,
			payments: { viewer: 0, partner: 0 },
			beforePayments: { debtorId: BIA, creditorId: ANA, amount: 30 },
			settlement: { debtorId: BIA, creditorId: ANA, amount: 30 },
		});
	});

	it("follows an uneven split: Bia's third of 90 against Ana's 20 of 60", () => {
		const summary = sharedSummary(
			[part(ANA, 90, 30), part(BIA, 60, 20)],
			ANA,
			BIA,
		);
		expect(summary.settlement).toEqual({
			debtorId: BIA,
			creditorId: ANA,
			amount: 10,
		});
	});

	it("turns the settlement around for the other viewer", () => {
		const rows = [part(ANA, 90, 30), part(BIA, 60, 20)];
		const summary = sharedSummary(rows, BIA, ANA);
		expect(summary.paid).toEqual({
			viewer: { shared: 20, total: 60 },
			partner: { shared: 30, total: 90 },
		});
		expect(summary.settlement).toEqual({
			debtorId: BIA,
			creditorId: ANA,
			amount: 10,
		});
	});

	it("takes a part of nothing and a part of everything", () => {
		const summary = sharedSummary(
			[part(ANA, 90, 0), part(BIA, 50, 50)],
			ANA,
			BIA,
		);
		expect(summary.settlement).toEqual({
			debtorId: ANA,
			creditorId: BIA,
			amount: 50,
		});
	});

	it("settles on the parts, not on who paid more", () => {
		const summary = sharedSummary(
			[part(ANA, 100, 30), part(BIA, 30, 30)],
			ANA,
			BIA,
		);
		expect(summary.total).toEqual({ shared: 60, total: 130 });
		expect(summary.settlement).toBeNull();
	});

	it("rounds the sums and the settlement", () => {
		const summary = sharedSummary(
			[part(ANA, 1, 0.1), part(ANA, 1, 0.2)],
			ANA,
			BIA,
		);
		expect(summary.paid.viewer.shared).toBe(0.3);
		expect(summary.total.shared).toBe(0.3);
		expect(summary.settlement?.amount).toBe(0.3);
	});

	it("has no settlement without a partner", () => {
		const summary = sharedSummary([row(ANA, 80)], ANA, null);
		expect(summary).toEqual({
			total: { shared: 40, total: 80 },
			paid: {
				viewer: { shared: 40, total: 80 },
				partner: { shared: 0, total: 0 },
			},
			count: 1,
			payments: { viewer: 0, partner: 0 },
			beforePayments: null,
			settlement: null,
		});
	});

	it("leaves a third owner's row out of every figure", () => {
		const summary = sharedSummary(
			[row(ANA, 10), row(BIA, 4), row("caio", 1000)],
			ANA,
			BIA,
		);
		expect(summary.total).toEqual({ shared: 7, total: 14 });
		expect(summary.count).toBe(2);
		expect(summary.settlement?.amount).toBe(3);
	});

	it("is all zeros, settled, for an empty month", () => {
		expect(sharedSummary([], ANA, BIA)).toEqual({
			total: { shared: 0, total: 0 },
			paid: {
				viewer: { shared: 0, total: 0 },
				partner: { shared: 0, total: 0 },
			},
			count: 0,
			payments: { viewer: 0, partner: 0 },
			beforePayments: null,
			settlement: null,
		});
	});
});

describe("sharedSummary with payments", () => {
	// Ana's 40 of Bia's 80 against Bia's 10 of Ana's 20: Ana owes Bia 30.
	const expenses = [row(BIA, 80), row(ANA, 20)];

	it("lets the debtor's payment settle the month", () => {
		const summary = sharedSummary([...expenses, payment(ANA, 30)], ANA, BIA);
		expect(summary.payments).toEqual({ viewer: 30, partner: 0 });
		expect(summary.beforePayments).toEqual({
			debtorId: ANA,
			creditorId: BIA,
			amount: 30,
		});
		expect(summary.settlement).toBeNull();
	});

	it("reads the same from the creditor's side", () => {
		const summary = sharedSummary([...expenses, payment(ANA, 30)], BIA, ANA);
		expect(summary.payments).toEqual({ viewer: 0, partner: 30 });
		expect(summary.beforePayments).toEqual({
			debtorId: ANA,
			creditorId: BIA,
			amount: 30,
		});
		expect(summary.settlement).toBeNull();
	});

	it("leaves the rest of a partial payment owing", () => {
		const summary = sharedSummary([...expenses, payment(ANA, 12.5)], ANA, BIA);
		expect(summary.settlement).toEqual({
			debtorId: ANA,
			creditorId: BIA,
			amount: 17.5,
		});
	});

	it("adds up several payments", () => {
		const summary = sharedSummary(
			[...expenses, payment(ANA, 10.1), payment(ANA, 19.9, { id: "second" })],
			ANA,
			BIA,
		);
		expect(summary.payments.viewer).toBe(30);
		expect(summary.settlement).toBeNull();
	});

	it("turns the settlement around on an overpayment", () => {
		const summary = sharedSummary([...expenses, payment(ANA, 50)], ANA, BIA);
		expect(summary.settlement).toEqual({
			debtorId: BIA,
			creditorId: ANA,
			amount: 20,
		});
	});

	it("nets the partner's payment against what the partner owes", () => {
		// Bia owes Ana 30 here, and pays 30.
		const rows = [row(ANA, 80), row(BIA, 20), payment(BIA, 30)];
		const summary = sharedSummary(rows, ANA, BIA);
		expect(summary.payments).toEqual({ viewer: 0, partner: 30 });
		expect(summary.beforePayments?.debtorId).toBe(BIA);
		expect(summary.settlement).toBeNull();
	});

	it("counts a payment with nothing owed as money owed back", () => {
		const summary = sharedSummary([payment(ANA, 25)], ANA, BIA);
		expect(summary.beforePayments).toBeNull();
		expect(summary.settlement).toEqual({
			debtorId: BIA,
			creditorId: ANA,
			amount: 25,
		});
	});

	it("leaves payments out of the totals and the count", () => {
		const summary = sharedSummary([...expenses, payment(ANA, 30)], ANA, BIA);
		expect(summary.total).toEqual({ shared: 50, total: 100 });
		expect(summary.paid).toEqual({
			viewer: { shared: 10, total: 20 },
			partner: { shared: 40, total: 80 },
		});
		expect(summary.count).toBe(2);
	});

	it("rounds the payments and the settlement", () => {
		const summary = sharedSummary(
			[part(BIA, 1, 0.3), payment(ANA, 0.1), payment(ANA, 0.2, { id: "b" })],
			ANA,
			BIA,
		);
		expect(summary.payments.viewer).toBe(0.3);
		expect(summary.settlement).toBeNull();
	});

	it("leaves a third owner's payment out", () => {
		const summary = sharedSummary([...expenses, payment("caio", 30)], ANA, BIA);
		expect(summary.payments).toEqual({ viewer: 0, partner: 0 });
		expect(summary.settlement?.amount).toBe(30);
	});

	it("has no settlement without a partner, payments or not", () => {
		const summary = sharedSummary([payment(ANA, 30)], ANA, null);
		expect(summary.payments.viewer).toBe(30);
		expect(summary.settlement).toBeNull();
	});
});

describe("payments and the filters", () => {
	const rows = [
		row(BIA, 80, "Mercado"),
		row(ANA, 20, "Lazer"),
		payment(ANA, 30),
	];

	it("offers no category for a payment", () => {
		expect(sharedCategoryOptions(rows, ANA).map((o) => o.key)).toEqual([
			"lazer",
			"mercado",
		]);
	});

	it("leaves payments out of a category filter, even one named like it", () => {
		expect(filterShared(rows, { categoryKey: "mercado" })).toEqual([rows[0]]);
		expect(filterShared(rows, { categoryKey: "acerto" })).toEqual([]);
	});

	it("keeps payments under the owner filter", () => {
		expect(filterShared(rows, { ownerId: ANA })).toEqual([rows[1], rows[2]]);
	});
});

describe("sharedDashboard", () => {
	const people = { viewerId: ANA, partnerId: BIA };
	const rows = [
		row(ANA, 100, "Mercado"),
		row(BIA, 40, "mercado"),
		row(BIA, 15, "Lazer"),
	];

	it("narrows the table, never the cards, by owner", () => {
		const view = sharedDashboard(rows, people, { ownerId: ANA });
		expect(view.rows).toEqual([rows[0]]);
		expect(view.summary.paid).toEqual({
			viewer: { shared: 50, total: 100 },
			partner: { shared: 27.5, total: 55 },
		});
		expect(view.summary.settlement).toEqual({
			debtorId: BIA,
			creditorId: ANA,
			amount: 22.5,
		});
	});

	it("narrows the cards and the table by category", () => {
		const view = sharedDashboard(rows, people, { categoryKey: "mercado" });
		expect(view.rows).toEqual([rows[0], rows[1]]);
		expect(view.summary.total).toEqual({ shared: 70, total: 140 });
		expect(view.summary.settlement?.amount).toBe(30);
	});

	it("offers every category of the month, whatever is filtered", () => {
		const view = sharedDashboard(rows, people, {
			ownerId: BIA,
			categoryKey: "lazer",
		});
		expect(view.categories).toEqual([
			{ key: "lazer", label: "Lazer" },
			{ key: "mercado", label: "Mercado" },
		]);
	});

	it("nets payments into the cards and lists them in the table", () => {
		// Bia owes 22.50 here: half of 100, against half of 40 and of 15.
		const view = sharedDashboard([...rows, payment(BIA, 22.5)], people, {});
		expect(view.rows).toHaveLength(4);
		expect(view.summary.settlement).toBeNull();
		expect(view.paymentsHidden).toBe(false);
	});

	it("says when a category filter leaves payments out", () => {
		const view = sharedDashboard([...rows, payment(BIA, 30)], people, {
			categoryKey: "mercado",
		});
		expect(view.rows).toEqual([rows[0], rows[1]]);
		expect(view.summary.payments).toEqual({ viewer: 0, partner: 0 });
		expect(view.summary.settlement?.amount).toBe(30);
		expect(view.paymentsHidden).toBe(true);
	});

	it("hides nothing under a category filter in a month without payments", () => {
		const view = sharedDashboard(rows, people, { categoryKey: "mercado" });
		expect(view.paymentsHidden).toBe(false);
	});

	it("keeps an option for a selected category the month does not have", () => {
		const view = sharedDashboard(rows, people, { categoryKey: "farmacia" });
		expect(view.rows).toEqual([]);
		expect(view.categories.map((option) => option.key)).toEqual([
			"farmacia",
			"lazer",
			"mercado",
		]);
		expect(view.categories[0].label).toBe("farmacia");
	});
});

describe("recordHref", () => {
	const paid = {
		date: "2026-11-05",
		settlement: true as const,
		settlesMonth: "2026-10",
	};

	it("lands a payment on the acerto it settles, from the dashboard", () => {
		expect(recordHref(paid, "shared")).toBe("/shared?month=2026-10");
	});

	it("lands a payment on the month of its date, from the ledger", () => {
		expect(recordHref(paid, undefined)).toBe("/transactions?month=2026-11");
		expect(recordHref(paid, "/shared")).toBe("/transactions?month=2026-11");
	});

	it("lands anything else on the month of its date", () => {
		const expense = { date: "2026-11-05" };
		expect(recordHref(expense, "shared")).toBe("/shared?month=2026-11");
		expect(recordHref(expense, "")).toBe("/transactions?month=2026-11");
	});
});

describe("paymentHref", () => {
	it("opens the create form as a payment toward the month, back to /shared", () => {
		expect(paymentHref(MONTH, 30.5)).toBe(
			"/transactions/new?settles=2026-10&amount=30.5&returnTo=shared",
		);
	});
});

describe("returnTo", () => {
	it("sends a form back to the dashboard only for exactly 'shared'", () => {
		expect(resolveReturnTo("shared")).toBe("shared");
		expect(ledgerPath("shared")).toBe("/shared");
		expect(ledgerHref(MONTH, "shared")).toBe("/shared?month=2026-10");
	});

	it("sends anything else to the ledger, never to the value itself", () => {
		for (const value of [
			undefined,
			"",
			"Shared",
			"/shared",
			"//evil.example",
			"https://evil.example/shared",
			["shared"],
		]) {
			expect(resolveReturnTo(value)).toBeUndefined();
			expect(ledgerHref(MONTH, value)).toBe("/transactions?month=2026-10");
		}
	});
});
