/**
 * Month arithmetic for the `?month=YYYY-MM` query parameter that drives the
 * monthly views. Pure and Firestore-free, so it cannot live in a `"use server"`
 * module.
 *
 * Two different time bases on purpose:
 *
 * * "What month/day is it *now*" reads the date in **`HOME_TIME_ZONE`**. At
 *   22:00 on 31 October in Brazil (UTC−3) the UTC date is already 1 November,
 *   so `toISOString()` would drop the user into the wrong month.
 * * Arithmetic on an already-known month pins itself to **UTC** with
 *   `Date.UTC`, so no timezone or DST shift can roll a month boundary over.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR = 12;

/**
 * Where the couple lives. Named rather than left to the clock's "local" time,
 * because every caller of `currentMonth` / `today` is a Server Component: local
 * would mean the server process's zone, which is UTC on most hosts.
 */
const HOME_TIME_ZONE = "America/Sao_Paulo";

const homeDate = new Intl.DateTimeFormat("en-US", {
	timeZone: HOME_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

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

/**
 * Today as an ISO `YYYY-MM-DD` date in `HOME_TIME_ZONE` — the default for a new
 * transaction, and the new date a duplicate gets.
 */
export function today(): string {
	// Assembled from parts, not from a locale whose format happens to be ISO.
	const date = Object.fromEntries(
		homeDate.formatToParts(new Date()).map(({ type, value }) => [type, value]),
	);
	return `${date.year}-${date.month}-${date.day}`;
}

/** Current month in `HOME_TIME_ZONE`. */
export function currentMonth(): string {
	return today().slice(0, "YYYY-MM".length);
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
 * The months on offer around `anchor`, newest first: from `before` months
 * before it to `after` months after it. `keep`, a month already chosen, is
 * added when it falls outside the range, so editing an older record never
 * silently drops its value from a select. A malformed `keep` is ignored.
 */
export function monthChoices(
	anchor: string,
	before: number,
	after: number,
	keep?: string,
): string[] {
	const months: string[] = [];
	for (let delta = after; delta >= -before; delta -= 1) {
		months.push(shiftMonth(anchor, delta));
	}
	if (isMonth(keep) && !months.includes(keep)) {
		months.push(keep);
		// ISO months sort lexicographically.
		months.sort((a, b) => b.localeCompare(a));
	}
	return months;
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

/**
 * `"2026-10-29"` → `"29/10"`. Day and month only: the year is already in the
 * page header, and a ledger column should stay narrow.
 */
export function formatDayMonth(isoDate: string): string {
	const [, month, day] = isoDate.split("-");
	return `${day}/${month}`;
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
