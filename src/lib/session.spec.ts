import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	issueSession,
	isValidSession,
	MIN_SECRET_LENGTH,
	readSession,
	SESSION_MAX_AGE_SECONDS,
	secretMatches,
	sign,
	verify,
} from "./session";

const SECRET = "a".repeat(MIN_SECRET_LENGTH);
const OTHER_SECRET = "b".repeat(MIN_SECRET_LENGTH);
/** Shaped like Firestore's generated ids: twenty alphanumerics. */
const USER_ID = "Ab3dEf6hIj9lMn2pQr5t";
const OTHER_USER_ID = "Zy8xWv7uTs6rQp5oNm4l";
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

	const expiresAt = () => SIGNED_IN_AT.getTime() + MAX_AGE_MS;

	it("round-trips the user id, the version and the expiry", async () => {
		const token = await issueSession(USER_ID, 3, SECRET);
		expect(token).toMatch(
			new RegExp(`^${USER_ID}\\.3\\.${expiresAt()}\\.[0-9a-f]{64}$`),
		);
		expect(await readSession(token, SECRET)).toEqual({
			userId: USER_ID,
			sessionVersion: 3,
			expiresAt: expiresAt(),
		});
		expect(await isValidSession(token, SECRET)).toBe(true);
	});

	it("accepts it up to the last millisecond, and not at expiry", async () => {
		const token = await issueSession(USER_ID, 1, SECRET);
		vi.setSystemTime(expiresAt() - 1);
		expect(await readSession(token, SECRET)).not.toBeNull();
		expect(await isValidSession(token, SECRET)).toBe(true);
		vi.setSystemTime(expiresAt());
		expect(await readSession(token, SECRET)).toBeNull();
		expect(await isValidSession(token, SECRET)).toBe(false);
	});

	it("refuses a session once the secret rotates", async () => {
		const token = await issueSession(USER_ID, 1, SECRET);
		expect(await readSession(token, OTHER_SECRET)).toBeNull();
	});

	it("refuses a tampered MAC", async () => {
		const token = tamperMac(await issueSession(USER_ID, 1, SECRET));
		expect(await readSession(token, SECRET)).toBeNull();
	});

	it("refuses another user's id under the original MAC", async () => {
		const token = await issueSession(USER_ID, 1, SECRET);
		const forged = token.replace(USER_ID, OTHER_USER_ID);
		expect(forged).not.toBe(token);
		expect(await readSession(forged, SECRET)).toBeNull();
	});

	it("refuses a raised version under the original MAC", async () => {
		const token = await issueSession(USER_ID, 1, SECRET);
		expect(await readSession(token.replace(".1.", ".2."), SECRET)).toBeNull();
	});

	it("refuses a token issued before per-user sign-in", async () => {
		// `<expiry>.<mac>`: correctly signed, unexpired, and one part short of two.
		const legacy = await sign(String(expiresAt()), SECRET);
		expect(await readSession(legacy, SECRET)).toBeNull();
		expect(await isValidSession(legacy, SECRET)).toBe(false);
	});

	// "9e99" is a number, and a far-future one: only the digits-only rule stops it.
	it.each([
		["forever"],
		["9e99"],
		["-1"],
		[""],
		["u1.1"],
		["u1.1.FUTURE.extra"],
		[".1.FUTURE"],
		["u1..FUTURE"],
		["u1.1."],
		["u-1.1.FUTURE"],
		["u_1.1.FUTURE"],
		["u1.-1.FUTURE"],
		["u1.x.FUTURE"],
		["u1.1.9e99"],
		["u1.1.PAST"],
	])("refuses the correctly signed value %j", async (template) => {
		const value = template
			.replace("FUTURE", String(expiresAt()))
			.replace("PAST", String(SIGNED_IN_AT.getTime() - 1));
		expect(await readSession(await sign(value, SECRET), SECRET)).toBeNull();
	});

	it.each([undefined, ""])("refuses the missing cookie %j", async (token) => {
		expect(await readSession(token, SECRET)).toBeNull();
		expect(await isValidSession(token, SECRET)).toBe(false);
	});

	it("throws on a missing secret even with no cookie to check", async () => {
		// The proxy's first logged-out request must surface a bad deploy.
		await expect(isValidSession(undefined, undefined)).rejects.toThrow(
			"AUTH_SECRET",
		);
	});

	it.each(["", "a.b", "a-b", "a/b"])(
		"will not issue a token for the user id %j",
		(userId) => {
			expect(() => issueSession(userId, 1, SECRET)).toThrow("alphanumeric");
		},
	);

	it.each([-1, 1.5, Number.NaN])(
		"will not issue a token for the version %j",
		(version) => {
			expect(() => issueSession(USER_ID, version, SECRET)).toThrow(
				"non-negative integer",
			);
		},
	);

	it("issues version 0", async () => {
		const token = await issueSession(USER_ID, 0, SECRET);
		expect((await readSession(token, SECRET))?.sessionVersion).toBe(0);
	});
});

describe("secretMatches", () => {
	it("accepts the secret", async () => {
		expect(await secretMatches("correct horse", "correct horse", SECRET)).toBe(
			true,
		);
	});

	it.each(["", "correct", "correct horse ", "Correct horse", "x"])(
		"refuses %j",
		async (candidate) => {
			expect(await secretMatches(candidate, "correct horse", SECRET)).toBe(
				false,
			);
		},
	);

	it.each([undefined, ""])(
		"throws when the expected value is %j, so it never matches empty",
		async (expected) => {
			await expect(secretMatches("", expected, SECRET)).rejects.toThrow(
				"non-empty expected value",
			);
		},
	);
});
