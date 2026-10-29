type FieldErrors = Record<string, string>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_LENGTH = 10;
/** Currency is stored with two decimal places. */
const CENTS_PER_UNIT = 100;

export function nonEmptyString(value: unknown): string | null {
	if (typeof value !== "string" || value.trim() === "") {
		return "must be a non-empty text";
	}
	return null;
}

export function finiteNumber(value: unknown): string | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return "must be a number";
	}
	return null;
}

export function nonNegativeNumber(value: unknown): string | null {
	return (
		finiteNumber(value) ?? ((value as number) < 0 ? "cannot be negative" : null)
	);
}

export function isoDate(value: unknown): string | null {
	if (typeof value !== "string" || !ISO_DATE.test(value)) {
		return "must be a date in the YYYY-MM-DD format";
	}
	// Rejects well-formed-but-impossible dates such as 2026-02-30, which `Date`
	// would otherwise roll over into March.
	const parsed = new Date(`${value}T00:00:00Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, ISO_DATE_LENGTH) !== value
	) {
		return "is not a real date";
	}
	return null;
}

export function enumValue(
	value: unknown,
	allowed: readonly string[],
): string | null {
	if (typeof value !== "string" || !allowed.includes(value)) {
		return `must be one of: ${allowed.join(", ")}`;
	}
	return null;
}

/**
 * Drops the passing checks and returns every failure at once, so a form can
 * highlight all of its invalid fields in a single round trip.
 */
export function collect(
	checks: Record<string, string | null>,
): FieldErrors | null {
	const errors: FieldErrors = {};
	for (const [field, message] of Object.entries(checks)) {
		if (message !== null) {
			errors[field] = message;
		}
	}
	return Object.keys(errors).length > 0 ? errors : null;
}

/** Keeps float drift from accumulating across many balance increments. */
export function round2(value: number): number {
	return Math.round(value * CENTS_PER_UNIT) / CENTS_PER_UNIT;
}

export type { FieldErrors };
