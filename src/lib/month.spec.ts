import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	currentMonth,
	formatDayMonth,
	formatMonthLabel,
	monthBounds,
	resolveMonth,
	shiftMonth,
	today,
} from "./month";

/** 22:00 on 31 October in São Paulo (UTC−3): already 1 November in UTC. */
const LATE_ON_THE_LAST_DAY = new Date("2026-11-01T01:00:00Z");

describe("the clock-reading helpers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(LATE_ON_THE_LAST_DAY);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("read local date parts, not UTC ones", () => {
		// Not vacuous: in UTC this instant is already the next month.
		expect(LATE_ON_THE_LAST_DAY.toISOString().slice(0, 7)).toBe("2026-11");
		expect(currentMonth()).toBe("2026-10");
		expect(today()).toBe("2026-10-31");
	});

	it("resolveMonth passes a well-formed month through", () => {
		expect(resolveMonth("2027-02")).toBe("2027-02");
	});

	it.each([
		"2026-13",
		"2026-00",
		"",
		undefined,
		null,
		"2026-1",
		" 2026-10",
		// `?month=a&month=b` reaches a page as an array.
		["2027-02", "2027-03"],
	])("resolveMonth falls back to the current month on %j", (value) => {
		expect(resolveMonth(value)).toBe("2026-10");
	});
});

describe("shiftMonth", () => {
	it.each([
		["2026-01", -1, "2025-12"],
		["2025-12", 1, "2026-01"],
		["2026-03", -15, "2024-12"],
		["2026-11", 14, "2028-01"],
		["2026-10", 0, "2026-10"],
	])("shifts %s by %i to %s", (month, delta, expected) => {
		expect(shiftMonth(month, delta)).toBe(expected);
	});

	it("throws on a malformed month, which only a programming error can pass", () => {
		expect(() => shiftMonth("2026-13", 1)).toThrow("Not an ISO month");
	});
});

describe("monthBounds", () => {
	it.each([
		["2028-02", "2028-02-29"],
		["2027-02", "2027-02-28"],
		// Divisible by 100 but not by 400, then by 400.
		["2100-02", "2100-02-28"],
		["2000-02", "2000-02-29"],
		["2026-04", "2026-04-30"],
		["2026-12", "2026-12-31"],
	])("covers %s through %s", (month, to) => {
		expect(monthBounds(month)).toEqual({ from: `${month}-01`, to });
	});
});

describe("formatMonthLabel", () => {
	// The specs run at UTC−3, where midnight UTC on the 1st is still the previous
	// month locally — so these also prove the formatter is pinned to UTC.
	it.each([
		["2026-10", "Outubro de 2026"],
		["2026-03", "Março de 2026"],
		["2027-01", "Janeiro de 2027"],
	])("labels %s as %s", (month, label) => {
		expect(formatMonthLabel(month)).toBe(label);
	});
});

describe("formatDayMonth", () => {
	it("drops the year", () => {
		expect(formatDayMonth("2026-10-29")).toBe("29/10");
	});
});
