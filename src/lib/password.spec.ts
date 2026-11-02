import { randomBytes, scryptSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

const PASSWORD = "correct horse battery staple";
const STORED_SHAPE = /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/;

/**
 * A stored value built here, with node:crypto directly and parameters other
 * than the module's, so verifying it proves they are read from the string.
 */
function storedWith(
	plain: string,
	{ cost = 1024, blockSize = 8, parallelization = 1, keyLength = 64 } = {},
): string {
	const salt = randomBytes(16);
	const hash = scryptSync(plain, salt, keyLength, {
		cost,
		blockSize,
		parallelization,
	});
	return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Flips one hex digit of the hash, keeping the value well-formed. */
function tamperHash(stored: string): string {
	const last = stored.at(-1) === "0" ? "1" : "0";
	return `${stored.slice(0, -1)}${last}`;
}

describe("hashPassword / verifyPassword", () => {
	// scrypt is slow on purpose, so the specs share one hash where they can.
	let stored: string;
	beforeAll(async () => {
		stored = await hashPassword(PASSWORD);
	});

	it("stores the parameters, a 16-byte salt and a 32-byte hash", () => {
		expect(stored).toMatch(STORED_SHAPE);
	});

	it("round-trips a password", async () => {
		expect(await verifyPassword(PASSWORD, stored)).toBe(true);
	});

	it.each([
		"correct horse battery stapl",
		"Correct horse battery staple",
		` ${PASSWORD}`,
		`${PASSWORD} `,
		"",
	])("refuses the wrong password %j", async (candidate) => {
		expect(await verifyPassword(candidate, stored)).toBe(false);
	});

	it("refuses an altered hash", async () => {
		expect(await verifyPassword(PASSWORD, tamperHash(stored))).toBe(false);
	});

	it("salts every hash, so two hashes of one password differ", async () => {
		const again = await hashPassword(PASSWORD);
		expect(again).not.toBe(stored);
		expect(await verifyPassword(PASSWORD, again)).toBe(true);
	});

	it("treats a composed and a decomposed accent as the same password", async () => {
		const composed = "senha do café 2026".normalize("NFC");
		const decomposed = composed.normalize("NFD");
		expect(decomposed).not.toBe(composed);
		expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(
			true,
		);
	});
});

describe("verifyPassword with parameters other than the module's", () => {
	it("reads the cost, block size, parallelization and length from the string", async () => {
		const other = storedWith(PASSWORD, { cost: 2048, parallelization: 2 });
		expect(await verifyPassword(PASSWORD, other)).toBe(true);
		expect(await verifyPassword("wrong password!", other)).toBe(false);
	});
});

describe("verifyPassword with a malformed stored value", () => {
	const salt = "ab".repeat(16);
	const hash = "cd".repeat(32);

	it.each([
		["empty", ""],
		["plain text", PASSWORD],
		["another scheme", `bcrypt$1024$8$1$${salt}$${hash}`],
		["a missing part", `scrypt$1024$8$${salt}$${hash}`],
		["a non-numeric cost", `scrypt$N$8$1$${salt}$${hash}`],
		["upper-case hex", `scrypt$1024$8$1$${salt.toUpperCase()}$${hash}`],
		["an odd hex digit", `scrypt$1024$8$1$${salt}$${hash}0`],
		["a short salt", `scrypt$1024$8$1$${"ab".repeat(8)}$${hash}`],
		["a short hash", `scrypt$1024$8$1$${salt}$${"cd".repeat(8)}`],
		["a cost that is not a power of two", `scrypt$1000$8$1$${salt}$${hash}`],
		["a cost over the memory ceiling", `scrypt$1073741824$8$1$${salt}$${hash}`],
		["a zero block size", `scrypt$1024$0$1$${salt}$${hash}`],
	])("returns false for %s", async (_label, stored) => {
		expect(await verifyPassword(PASSWORD, stored)).toBe(false);
	});

	it("returns false, not a match, for a short hash of the right password", async () => {
		// Eight bytes would be guessable; the minimum is checked before scrypt runs.
		const short = storedWith(PASSWORD, { keyLength: 8 });
		expect(await verifyPassword(PASSWORD, short)).toBe(false);
	});
});
