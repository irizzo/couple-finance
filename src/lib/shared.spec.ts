import { describe, expect, it } from "vitest";
import type { SharedTransaction } from "@/types";
import {
	categoryKey,
	filterShared,
	ledgerHref,
	ledgerPath,
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
		...fields,
	};
}

/** A shared expense whose other person's part is `sharedAmount`. */
function part(ownerId: string, totalAmount: number, sharedAmount: number) {
	return row(ownerId, totalAmount, "Mercado", { sharedAmount });
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
			settlement: null,
		});
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
