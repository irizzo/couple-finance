import { describe, expect, it } from "vitest";
import { exceedsTotal, round2 } from "@/database/validators";
import { formatCurrency, parseAmount } from "./money";

describe("parseAmount", () => {
	it.each([
		// What `<input type="number">` submits.
		["90.5", 90.5],
		// Pasted pt-BR: a comma turns the dots into thousands separators.
		["1.234,56", 1234.56],
		["90,5", 90.5],
		[" 1 234,56 ", 1234.56],
		["33.333", 33.33],
		["0", 0],
	])("reads %j as %s", (raw, amount) => {
		expect(parseAmount(raw)).toBe(amount);
	});

	it("reads a lone dot as the decimal point", () => {
		// Without a comma there is nothing to say the dot groups thousands, and a
		// number input means "one and a bit" by it.
		expect(parseAmount("1.234")).toBe(1.23);
	});

	it.each(["", "   ", null, "abc", "1,2,3", "Infinity"])(
		"refuses %j with NaN, never 0",
		(raw) => {
			expect(parseAmount(raw)).toBeNaN();
		},
	);

	it("refuses a file entry", () => {
		expect(parseAmount(new File(["90"], "amount.txt"))).toBeNaN();
	});
});

describe("round2", () => {
	it("absorbs the drift of repeated adds", () => {
		let sum = 0;
		for (let step = 0; step < 10; step += 1) {
			sum += 0.1;
		}
		// The drift being guarded against: 0.9999999999999999.
		expect(sum).not.toBe(1);
		expect(round2(sum)).toBe(1);
	});

	it("keeps two-decimal arithmetic exact", () => {
		expect(0.1 + 0.2).not.toBe(0.3);
		expect(round2(0.1 + 0.2)).toBe(0.3);
		expect(round2(90 - 44.99)).toBe(45.01);
	});
});

// A shared expense's real amount plus the partner's part may not exceed its
// total; this is the comparison behind that rule.
describe("exceedsTotal", () => {
	it("allows parts that add up to exactly the total", () => {
		expect(exceedsTotal(90, 45, 45)).toBe(false);
		expect(exceedsTotal(100, 100, 0)).toBe(false);
		expect(exceedsTotal(0, 0, 0)).toBe(false);
	});

	it("allows parts that leave room for other people's", () => {
		// A R$ 120 dinner for three: you, your partner, a friend.
		expect(exceedsTotal(120, 40, 40)).toBe(false);
	});

	it("refuses parts that add up to more, even by one cent", () => {
		expect(exceedsTotal(100, 60, 50)).toBe(true);
		// Halving an odd-cent bill in both fields: someone has to take the cent.
		expect(exceedsTotal(90.01, 45.01, 45.01)).toBe(true);
	});

	it("counts in cents, so float drift cannot tip it", () => {
		expect(0.1 + 0.2 > 0.3).toBe(true);
		expect(exceedsTotal(0.3, 0.1, 0.2)).toBe(false);
		// A R$ 90,30 bill split 45,10 / 45,20, which a float sum puts over.
		expect(45.1 + 45.2 > 90.3).toBe(true);
		expect(exceedsTotal(90.3, 45.1, 45.2)).toBe(false);
	});

	it("counts a sub-cent part as the cent it is stored at", () => {
		// 33.333 is stored as 33.33, which fits beside 66.67.
		expect(exceedsTotal(100, 66.67, 33.333)).toBe(false);
	});
});

describe("formatCurrency", () => {
	it("formats reais the pt-BR way, with a non-breaking space", () => {
		expect(formatCurrency(1234.56)).toBe("R$ 1.234,56");
		expect(formatCurrency(-90)).toBe("-R$ 90,00");
	});
});
