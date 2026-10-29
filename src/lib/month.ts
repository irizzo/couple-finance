/**
 * Month arithmetic for the `?month=YYYY-MM` query parameter that drives the
 * monthly views. Pure and Firestore-free, so it cannot live in a `"use server"`
 * module.
 *
 * Two different time bases on purpose:
 *
 * * "What month/day is it *now*" reads **local** date parts. At 22:00 on
 *   31 October in Brazil (UTC−3) the UTC date is already 1 November, so
 *   `toISOString()` would drop the user into the wrong month.
 * * Arithmetic on an already-known month pins itself to **UTC** with
 *   `Date.UTC`, so no timezone or DST shift can roll a month boundary over.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR = 12;

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function parts(month: string): { year: number; monthIndex: number } {
	if (!MONTH_PATTERN.test(month)) {
		// Every entry point funnels through `resolveMonth`, so reaching here is a
		// programming error, not bad user input.
		throw new Error(`Not an ISO month: ${JSON.stringify(month)}`);
	}
	const [year, monthNumber] = month.split("-").map(Number);
	return { year, monthIndex: monthNumber - 1 };
}

export function isMonth(value: unknown): value is string {
	return typeof value === "string" && MONTH_PATTERN.test(value);
}

/** Current month in the viewer's own timezone. */
export function currentMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/**
 * Today as an ISO `YYYY-MM-DD` date, in the viewer's own timezone — the default
 * for a new transaction, and the new date a duplicate gets.
 */
export function today(): string {
	const now = new Date();
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Coerces an untrusted `?month=` value. Anything malformed falls back to the
 * current month rather than erroring: a hand-edited URL should not break a page.
 */
export function resolveMonth(value: unknown): string {
	return isMonth(value) ? value : currentMonth();
}

/** `shiftMonth("2026-01", -1)` → `"2025-12"`. Any delta, either direction. */
export function shiftMonth(month: string, delta: number): string {
	const { year, monthIndex } = parts(month);
	const total = year * MONTHS_PER_YEAR + monthIndex + delta;
	return `${Math.floor(total / MONTHS_PER_YEAR)}-${pad((total % MONTHS_PER_YEAR) + 1)}`;
}

/**
 * The inclusive ISO date range covering a month — exactly what
 * `listTransactions({from, to})` wants. Day 0 of the following month *is* the
 * last day of this one, which handles February and leap years for free.
 */
export function monthBounds(month: string): { from: string; to: string } {
	const { year, monthIndex } = parts(month);
	const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
	return { from: `${month}-01`, to: `${month}-${pad(lastDay)}` };
}

/** `"2026-10"` → `"Outubro de 2026"`. */
export function formatMonthLabel(month: string): string {
	const { year, monthIndex } = parts(month);
	const label = new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(year, monthIndex, 1)));
	return label.charAt(0).toUpperCase() + label.slice(1);
}
