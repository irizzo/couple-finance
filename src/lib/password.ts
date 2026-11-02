import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for the two user accounts: scrypt from `node:crypto`, so no
 * dependency.
 *
 * Pure — no Firestore — but **Node-only, and slow on purpose**. Only the server
 * code that sets or checks a password imports it: the users data layer and the
 * auth adapters. Never the proxy, which runs on every request and must stay a
 * cheap signature check, and never a client component, where `node:crypto` does
 * not exist. That is also why this is not part of `session.ts`, which the proxy
 * imports.
 *
 * A stored hash is `scrypt$N$r$p$<salt hex>$<hash hex>`. The cost parameters
 * travel inside each hash, so raising them below changes new hashes only:
 * every existing one still verifies with the parameters it was made with.
 */

/**
 * One of OWASP's equivalents of N=2^17, r=8, p=1, at a quarter of the memory:
 * 32 MiB and about 300 ms per hash on the development machine.
 */
const COST = 32_768; // N, 2^15
const BLOCK_SIZE = 8; // r
const PARALLELIZATION = 3; // p
const SALT_BYTES = 16;
const HASH_BYTES = 32;
/** A truncated stored value must not verify against a lucky guess. */
const MIN_STORED_BYTES = 16;
/**
 * Node's default ceiling, 32 MiB, is just short of what the parameters above
 * need. This is a ceiling, not a target: it leaves room to raise the cost, and a
 * stored value asking for more fails to verify instead of exhausting memory.
 */
const MAX_MEMORY_MIB = 256;
const BYTES_PER_MIB = 1_048_576;
const MAX_MEMORY_BYTES = MAX_MEMORY_MIB * BYTES_PER_MIB;
const SEPARATOR = "$";
/** Hex in whole bytes, so `Buffer.from` never silently drops a trailing digit. */
const STORED_PATTERN =
	/^scrypt\$(\d+)\$(\d+)\$(\d+)\$((?:[0-9a-f]{2})+)\$((?:[0-9a-f]{2})+)$/;

interface CostParams {
	cost: number;
	blockSize: number;
	parallelization: number;
}

function derive(
	plain: string,
	salt: Buffer,
	keyLength: number,
	params: CostParams,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		// NFC, so a password typed on two keyboards — one sending "é" as one code
		// point, the other as "e" plus a combining accent — is the same password.
		// Node throws synchronously on parameters it refuses, which rejects this
		// promise.
		scrypt(
			plain.normalize("NFC"),
			salt,
			keyLength,
			{ ...params, maxmem: MAX_MEMORY_BYTES },
			(error, key) => (error ? reject(error) : resolve(key)),
		);
	});
}

/** A new hash with a fresh random salt: hashing one password twice differs. */
export async function hashPassword(plain: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const hash = await derive(plain, salt, HASH_BYTES, {
		cost: COST,
		blockSize: BLOCK_SIZE,
		parallelization: PARALLELIZATION,
	});
	return [
		"scrypt",
		COST,
		BLOCK_SIZE,
		PARALLELIZATION,
		salt.toString("hex"),
		hash.toString("hex"),
	].join(SEPARATOR);
}

/**
 * True when `plain` hashes to `stored` under the parameters, salt and length
 * `stored` carries. `timingSafeEqual` does the comparison, so it does not leak
 * where the two differ. A malformed stored value is `false`, never a throw.
 */
export async function verifyPassword(
	plain: string,
	stored: string,
): Promise<boolean> {
	const match = STORED_PATTERN.exec(stored);
	if (!match) {
		return false;
	}
	const [, cost, blockSize, parallelization, saltHex, hashHex] = match;
	const salt = Buffer.from(saltHex, "hex");
	const expected = Buffer.from(hashHex, "hex");
	if (salt.length < MIN_STORED_BYTES || expected.length < MIN_STORED_BYTES) {
		return false;
	}
	try {
		const actual = await derive(plain, salt, expected.length, {
			cost: Number(cost),
			blockSize: Number(blockSize),
			parallelization: Number(parallelization),
		});
		return timingSafeEqual(actual, expected);
	} catch {
		// Parameters Node refuses — an N that is not a power of two, a cost over
		// the memory ceiling — make a malformed value, not a server error.
		return false;
	}
}
