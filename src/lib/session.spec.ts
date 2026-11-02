import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	issueSession,
	isValidSession,
	MIN_SECRET_LENGTH,
	passwordMatches,
	SESSION_MAX_AGE_SECONDS,
	sign,
	verify,
} from "./session";

const SECRET = "a".repeat(MIN_SECRET_LENGTH);
const OTHER_SECRET = "b".repeat(MIN_SECRET_LENGTH);
const SIGNED_IN_AT = new Date("2026-10-31T12:00:00Z");
const MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

/** Flips one hex digit of the MAC, keeping the token well-formed. */
function tamperMac(token: string): string {
	const last = token.at(-1) === "0" ? "1" : "0";
	return `${token.slice(0, -1)}${last}`;
}

describe("sign / verify", () => {
	it("round-trips a value, dots and all", async () => {
		const token = await sign("1.5.x", SECRET);
		expect(token).toMatch(/^1\.5\.x\.[0-9a-f]{64}$/);
		expect(await verify(token, SECRET)).toBe("1.5.x");
	});

	it("refuses a token signed with another secret", async () => {
		expect(await verify(await sign("v", OTHER_SECRET), SECRET)).toBeNull();
	});

	it("refuses an altered MAC", async () => {
		expect(await verify(tamperMac(await sign("v", SECRET)), SECRET)).toBeNull();
	});

	it("accepts one spelling of a MAC only", async () => {
		// Hex parsing alone would read the upper-cased MAC as the same bytes.
		const token = await sign("v", SECRET);
		expect(await verify(token.toUpperCase().replace("V.", "v."), SECRET)).toBe(
			null,
		);
	});

	it("refuses an altered value under the original MAC", async () => {
		const mac = (await sign("1000", SECRET)).split(".")[1];
		expect(await verify(`9999.${mac}`, SECRET)).toBeNull();
	});

	it.each([
		"",
		"no-dot",
		"v.",
		"v.not-hex",
		`v.${"0".repeat(63)}`,
		`v.${"A".repeat(64)}`,
	])("refuses the malformed token %j", async (token) => {
		expect(await verify(token, SECRET)).toBeNull();
	});

	it.each([undefined, "", "short"])(
		"throws rather than sign with the secret %j",
		async (secret) => {
			await expect(sign("v", secret)).rejects.toThrow("AUTH_SECRET");
		},
	);
});

describe("sessions", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(SIGNED_IN_AT);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("accepts a fresh session", async () => {
		expect(await isValidSession(await issueSession(SECRET), SECRET)).toBe(true);
	});

	it("accepts it up to the last millisecond, and not at expiry", async () => {
		const token = await issueSession(SECRET);
		vi.setSystemTime(SIGNED_IN_AT.getTime() + MAX_AGE_MS - 1);
		expect(await isValidSession(token, SECRET)).toBe(true);
		vi.setSystemTime(SIGNED_IN_AT.getTime() + MAX_AGE_MS);
		expect(await isValidSession(token, SECRET)).toBe(false);
	});

	it("refuses a session once the secret rotates", async () => {
		const token = await issueSession(SECRET);
		expect(await isValidSession(token, OTHER_SECRET)).toBe(false);
	});

	it("refuses a tampered session", async () => {
		const token = tamperMac(await issueSession(SECRET));
		expect(await isValidSession(token, SECRET)).toBe(false);
	});

	// "9e99" is a number, and a far-future one: only the digits-only rule stops it.
	it.each(["forever", "9e99", "-1", ""])(
		"refuses the correctly signed non-expiry %j",
		async (value) => {
			expect(await isValidSession(await sign(value, SECRET), SECRET)).toBe(
				false,
			);
		},
	);

	it.each([undefined, ""])("refuses the missing cookie %j", async (token) => {
		expect(await isValidSession(token, SECRET)).toBe(false);
	});

	it("throws on a missing secret even with no cookie to check", async () => {
		// The proxy's first logged-out request must surface a bad deploy.
		await expect(isValidSession(undefined, undefined)).rejects.toThrow(
			"AUTH_SECRET",
		);
	});
});

describe("passwordMatches", () => {
	it("accepts the password", async () => {
		expect(
			await passwordMatches("correct horse", "correct horse", SECRET),
		).toBe(true);
	});

	it.each(["", "correct", "correct horse ", "Correct horse", "x"])(
		"refuses %j",
		async (candidate) => {
			expect(await passwordMatches(candidate, "correct horse", SECRET)).toBe(
				false,
			);
		},
	);

	it.each([undefined, ""])(
		"throws when the configured password is %j, so it never matches empty",
		async (expected) => {
			await expect(passwordMatches("", expected, SECRET)).rejects.toThrow(
				"AUTH_PASSWORD",
			);
		},
	);
});
