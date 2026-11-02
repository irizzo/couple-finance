/**
 * The session behind the shared-password gate: a signed expiry, nothing else.
 * There is one password for both people, so a session carries no identity —
 * only "someone who knew the password signed in, and it has not run out".
 *
 * Pure and over Web Crypto (`crypto.subtle`), which the proxy, the Server
 * Actions and the specs all have without an import. Every function takes the
 * secret as an argument rather than reading `process.env`, so the specs can
 * pass their own.
 *
 * A token is `<value>.<hex HMAC-SHA256 of value>`. Changing `AUTH_SECRET`
 * invalidates every outstanding session at once; there is no other revocation.
 */

const SECONDS_PER_DAY = 86_400;
const SESSION_DAYS = 30;
const MILLISECONDS_PER_SECOND = 1000;
const SHA256_HEX_LENGTH = 64;
const HEX_PAIR = 2;
const HEX_RADIX = 16;
const MAC_PATTERN = new RegExp(`^[0-9a-f]{${SHA256_HEX_LENGTH}}$`);
const EXPIRY_PATTERN = /^\d+$/;

const encoder = new TextEncoder();

/**
 * Fails closed and loudly: a missing secret is a deploy mistake, and signing
 * with `""` would make every token forgeable.
 */
function hmacKey(secret: string | undefined): Promise<CryptoKey> {
	if (!secret || secret.length < MIN_SECRET_LENGTH) {
		throw new Error(
			`AUTH_SECRET must be set, at least ${MIN_SECRET_LENGTH} characters long.`,
		);
	}
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer), (byte) =>
		byte.toString(HEX_RADIX).padStart(HEX_PAIR, "0"),
	).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(hex.length / HEX_PAIR);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(
			hex.slice(index * HEX_PAIR, (index + 1) * HEX_PAIR),
			HEX_RADIX,
		);
	}
	return bytes;
}

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * SECONDS_PER_DAY;
/** 32 bytes of hex or base64 is at least this long; anything shorter is a typo. */
export const MIN_SECRET_LENGTH = 32;

/** `value` with its MAC appended. */
export async function sign(
	value: string,
	secret: string | undefined,
): Promise<string> {
	const key = await hmacKey(secret);
	const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
	return `${value}.${toHex(mac)}`;
}

/**
 * The signed value, or `null` for anything not signed with this secret.
 * `subtle.verify` does the comparison, so it does not leak timing.
 */
export async function verify(
	token: string,
	secret: string | undefined,
): Promise<string | null> {
	const key = await hmacKey(secret);
	// The MAC is hex, so the last dot is the separator whatever `value` holds.
	const dot = token.lastIndexOf(".");
	if (dot === -1) {
		return null;
	}
	const value = token.slice(0, dot);
	const mac = token.slice(dot + 1);
	if (!MAC_PATTERN.test(mac)) {
		return null;
	}
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		fromHex(mac),
		encoder.encode(value),
	);
	return valid ? value : null;
}

/** A fresh token that expires `SESSION_MAX_AGE_SECONDS` from now. */
export function issueSession(secret: string | undefined): Promise<string> {
	const expiresAt =
		Date.now() + SESSION_MAX_AGE_SECONDS * MILLISECONDS_PER_SECOND;
	return sign(String(expiresAt), secret);
}

/**
 * True for a token this secret signed whose expiry is still ahead. The cookie's
 * own `maxAge` is the browser's business; this is the one the server enforces.
 */
export async function isValidSession(
	token: string | undefined,
	secret: string | undefined,
): Promise<boolean> {
	if (!token) {
		// Still checks the secret, so a misconfigured deploy fails on the first
		// request rather than on the first sign-in.
		await hmacKey(secret);
		return false;
	}
	const expiresAt = await verify(token, secret);
	return (
		expiresAt !== null &&
		EXPIRY_PATTERN.test(expiresAt) &&
		Number(expiresAt) > Date.now()
	);
}

/**
 * Compares a submitted password with the configured one without leaking where
 * they differ. Both sides go through the HMAC first, so what is compared is two
 * fixed-length MACs: the timing says nothing about the password's length or its
 * prefix, whatever `subtle.verify` does internally.
 */
export async function passwordMatches(
	candidate: string,
	expected: string | undefined,
	secret: string | undefined,
): Promise<boolean> {
	if (!expected) {
		throw new Error("AUTH_PASSWORD must be set.");
	}
	const key = await hmacKey(secret);
	const expectedMac = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(expected),
	);
	return crypto.subtle.verify(
		"HMAC",
		key,
		expectedMac,
		encoder.encode(candidate),
	);
}
