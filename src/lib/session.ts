/**
 * The session: who signed in, at which session version, and until when.
 *
 * Pure and over Web Crypto (`crypto.subtle`), which the proxy, the Server
 * Actions and the specs all have without an import. Every function takes the
 * secret as an argument rather than reading `process.env`, so the specs can
 * pass their own.
 *
 * A token is `<value>.<hex HMAC-SHA256 of value>`, and the value is
 * `<userId>.<sessionVersion>.<expiresAt ms>`. The signature proves this server
 * issued it; whether the user still exists at that version is a Firestore
 * read, which the proxy deliberately does not make (see `getSessionUser`).
 * Changing `AUTH_SECRET` invalidates every outstanding session at once.
 */

const SECONDS_PER_DAY = 86_400;
const SESSION_DAYS = 30;
const MILLISECONDS_PER_SECOND = 1000;
const SHA256_HEX_LENGTH = 64;
const HEX_PAIR = 2;
const HEX_RADIX = 16;
const MAC_PATTERN = new RegExp(`^[0-9a-f]{${SHA256_HEX_LENGTH}}$`);
const DIGITS = /^\d+$/;
/** Firestore's generated ids are 20 of these; nothing else is ever issued. */
const USER_ID_PATTERN = /^[A-Za-z0-9]+$/;
const SESSION_PARTS = 3;

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

/** What a valid token says. */
export interface SessionClaims {
	userId: string;
	sessionVersion: number;
	expiresAt: number;
}

/**
 * A fresh token for this user and version that expires
 * `SESSION_MAX_AGE_SECONDS` from now. Throws rather than issue a token that
 * `readSession` would refuse: an id with a dot in it would shift every part.
 */
export function issueSession(
	userId: string,
	sessionVersion: number,
	secret: string | undefined,
): Promise<string> {
	if (!USER_ID_PATTERN.test(userId)) {
		throw new Error("A session's user id must be alphanumeric.");
	}
	if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) {
		throw new Error("A session version must be a non-negative integer.");
	}
	const expiresAt =
		Date.now() + SESSION_MAX_AGE_SECONDS * MILLISECONDS_PER_SECOND;
	return sign(`${userId}.${sessionVersion}.${expiresAt}`, secret);
}

/**
 * The claims of a token this secret signed whose expiry is still ahead, or
 * `null`. Exactly three parts — an alphanumeric id, digits, digits — so a
 * token from before per-user sign-in (`<expiry>.<mac>`, one part) is refused
 * and its holder signs in again. The cookie's own `maxAge` is the browser's
 * business; this expiry is the one the server enforces.
 */
export async function readSession(
	token: string | undefined,
	secret: string | undefined,
): Promise<SessionClaims | null> {
	if (!token) {
		// Still checks the secret, so a misconfigured deploy fails on the first
		// request rather than on the first sign-in.
		await hmacKey(secret);
		return null;
	}
	const value = await verify(token, secret);
	if (value === null) {
		return null;
	}
	const parts = value.split(".");
	if (parts.length !== SESSION_PARTS) {
		return null;
	}
	const [userId, version, expiry] = parts;
	if (
		!(
			USER_ID_PATTERN.test(userId) &&
			DIGITS.test(version) &&
			DIGITS.test(expiry)
		)
	) {
		return null;
	}
	const expiresAt = Number(expiry);
	if (expiresAt <= Date.now()) {
		return null;
	}
	return { userId, sessionVersion: Number(version), expiresAt };
}

/**
 * The proxy's optimistic check: signed, well-formed and unexpired. No Firestore
 * read, so a deleted user or a stale version still passes here and is caught
 * by `requireUser` instead.
 */
export async function isValidSession(
	token: string | undefined,
	secret: string | undefined,
): Promise<boolean> {
	return (await readSession(token, secret)) !== null;
}

/**
 * Compares a submitted secret — the sign-up invite code — with the configured
 * one without leaking where they differ. Both sides go through the HMAC first,
 * so what is compared is two fixed-length MACs: the timing says nothing about
 * the secret's length or its prefix, whatever `subtle.verify` does internally.
 *
 * Throws on an empty `expected`, so an unset variable can never match an empty
 * submission. The caller decides what "unset" means before calling.
 */
export async function secretMatches(
	candidate: string,
	expected: string | undefined,
	secret: string | undefined,
): Promise<boolean> {
	if (!expected) {
		throw new Error("secretMatches needs a non-empty expected value.");
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
