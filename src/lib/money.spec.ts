import { describe, expect, it } from "vitest";
import { round2 } from "@/database/validators";
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

describe("formatCurrency", () => {
	it("formats reais the pt-BR way, with a non-breaking space", () => {
		expect(formatCurrency(1234.56)).toBe("R$ 1.234,56");
		expect(formatCurrency(-90)).toBe("-R$ 90,00");
	});
});
