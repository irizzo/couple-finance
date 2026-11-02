type FieldErrors = Record<string, string>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_LENGTH = 10;
/** The month range is spelled out, so `2026-13` and `2026-00` are rejected. */
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Currency is stored with two decimal places. */
const CENTS_PER_UNIT = 100;
/** Checked on the normalized form, so it allows lowercase only. */
const USERNAME = /^[a-z0-9._-]{3,32}$/;

/**
 * One line of free text — what the settings row editor has room for. Exported
 * so the inputs' `maxLength` and this validator cannot drift apart.
 */
export const TEXT_MAX_LENGTH = 280;

/**
 * Nothing rate-limits sign-in, so a password's length is the whole defence.
 * Exported for the same reason as `TEXT_MAX_LENGTH`: the inputs' `minLength`.
 */
export const PASSWORD_MIN_LENGTH = 12;

export function nonEmptyString(value: unknown): string | null {
	if (typeof value !== "string" || value.trim() === "") {
		return "must be a non-empty text";
	}
	return null;
}

/**
 * A field that may be left blank: `undefined`, `null` and `""` all pass. The
 * length cap is measured on the trimmed text, since that is what gets stored.
 */
export function optionalText(
	value: unknown,
	maxLength = TEXT_MAX_LENGTH,
): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== "string") {
		return "must be text";
	}
	if (value.trim().length > maxLength) {
		return `must be at most ${maxLength} characters`;
	}
	return null;
}

/**
 * The normalizer behind `optionalText`: a string comes back trimmed, anything
 * else as `""`. This is what turns "field absent" into a stored empty string.
 */
export function trimmedText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
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

/**
 * A budget month. No `Date` round-trip like `isoDate` needs: every `YYYY-MM`
 * that matches the pattern is a real month, there being no equivalent of
 * February 30th.
 */
export function isoMonth(value: unknown): string | null {
	if (typeof value !== "string" || !ISO_MONTH.test(value)) {
		return "must be a month in the YYYY-MM format";
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

export function booleanValue(value: unknown): string | null {
	if (typeof value !== "boolean") {
		return "must be true or false";
	}
	return null;
}

/**
 * The stored form of a username: trimmed and lowercased, or `""` for anything
 * that is not a string. Sign-up and sign-in both go through it, so "Ana " and
 * "ana" are one account.
 */
export function normalizedUsername(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Expects `normalizedUsername`'s output, which is what gets stored. */
export function username(value: unknown): string | null {
	if (typeof value !== "string" || !USERNAME.test(value)) {
		return "must be 3 to 32 characters: lowercase letters, digits, dots, hyphens or underscores";
	}
	return null;
}

/**
 * A password being set, at sign-up or on a change. Sign-in never runs it: what
 * is checked there is whether the password matches, not whether it is long.
 * Counted in code points, so an accented letter or an emoji is one character.
 * Never trimmed: every character typed is part of the password.
 */
export function newPassword(value: unknown): string | null {
	if (typeof value !== "string") {
		return "must be text";
	}
	if ([...value].length < PASSWORD_MIN_LENGTH) {
		return `must be at least ${PASSWORD_MIN_LENGTH} characters`;
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
