import "server-only";

import { COLLECTIONS } from "@/database/collections";
import db from "@/database/db";
import { notFound, ref } from "@/database/entities";
import { type ActionResult, fail, failFrom, ok } from "@/database/result";
import {
	booleanValue,
	collect,
	newPassword,
	nonEmptyString,
	normalizedUsername,
	username,
} from "@/database/validators";
import { hashPassword } from "@/lib/password";
import type { CreateUserInput, SessionUser, User } from "@/types";

const COLLECTION = COLLECTIONS.users;
const LABEL = "User";
/**
 * The app is for exactly two people: the second to sign up becomes the first
 * one's partner, and sign-up then closes.
 */
const MAX_USERS = 2;
/** A password change bumps it, and every session carrying an older one fails. */
const FIRST_SESSION_VERSION = 1;

/**
 * Users: the two people, each with a username, a display name and a password.
 *
 * **`passwordHash` never leaves this file except through `findCredentials`**,
 * which only sign-in calls. Every other read builds its result field by field
 * rather than spreading the document, as `withId` would: a spread carries the
 * hash along at runtime, whatever the return type claims.
 */

type StoredUser = Omit<User, "id">;

function toVersionedUser(id: string, data: StoredUser): VersionedUser {
	return {
		id,
		username: data.username,
		name: data.name,
		useSaldos: data.useSaldos,
		partnerId: data.partnerId,
		sessionVersion: data.sessionVersion,
	};
}

/** `createUser`'s refusal of a third user, exported so callers can tell it apart. */
export const SIGN_UP_CLOSED_ERROR = "Sign-up is closed";

/** What sign-in needs to check a password and issue a session. */
export type Credentials = Pick<User, "id" | "passwordHash" | "sessionVersion">;

/** A `SessionUser` plus the version its session token must carry. */
export type VersionedUser = SessionUser & Pick<User, "sessionVersion">;

/**
 * Signs a person up. The first user has no partner; the second is linked to the
 * first, in both directions, and a third is refused.
 */
export async function createUser(
	input: CreateUserInput,
): Promise<ActionResult<VersionedUser>> {
	const key = normalizedUsername(input?.username);
	const fieldErrors = collect({
		username: username(key),
		name: nonEmptyString(input?.name),
		password: newPassword(input?.password),
		useSaldos: booleanValue(input?.useSaldos),
	});
	if (fieldErrors) {
		return fail<VersionedUser>("Invalid user", fieldErrors);
	}

	try {
		// Hashed before the transaction, not inside it: scrypt is slow on purpose,
		// and Firestore may run the callback more than once.
		const passwordHash = await hashPassword(input.password);
		return await db.runTransaction(async (tx) => {
			// The whole collection, which holds at most two documents. Reading it
			// inside the transaction is what makes the cap race-free: of two
			// concurrent sign-ups, the one that commits second is retried, and then
			// sees the first.
			const existing = await tx.get(ref(COLLECTION));
			if (existing.size >= MAX_USERS) {
				return fail<VersionedUser>(SIGN_UP_CLOSED_ERROR);
			}
			if (existing.docs.some((doc) => doc.data().username === key)) {
				return fail<VersionedUser>("Invalid user", {
					username: "is already taken",
				});
			}

			const partner = existing.empty ? null : existing.docs[0];
			const docRef = ref(COLLECTION).doc();
			// `partnerId` is always written, as `null` for the first user, so a
			// document never reads back `undefined` against `string | null`.
			const data: StoredUser = {
				username: key,
				name: input.name.trim(),
				passwordHash,
				useSaldos: input.useSaldos,
				partnerId: partner?.id ?? null,
				sessionVersion: FIRST_SESSION_VERSION,
			};
			tx.set(docRef, data);
			if (partner) {
				tx.update(partner.ref, { partnerId: docRef.id });
			}
			return ok(toVersionedUser(docRef.id, data));
		});
	} catch (cause) {
		return failFrom<VersionedUser>("Could not create the user", cause);
	}
}

/**
 * The one read that returns a password hash, and only sign-in calls it. An
 * unknown username is `null`, not a failure: sign-in still has to spend the
 * time verifying against a dummy hash, so the response does not tell the two
 * cases apart.
 */
export async function findCredentials(
	typedUsername: string,
): Promise<ActionResult<Credentials | null>> {
	try {
		const snap = await ref(COLLECTION)
			.where("username", "==", normalizedUsername(typedUsername))
			.limit(1)
			.get();
		if (snap.empty) {
			return ok(null);
		}
		const doc = snap.docs[0];
		const data = doc.data() as StoredUser;
		return ok({
			id: doc.id,
			passwordHash: data.passwordHash,
			sessionVersion: data.sessionVersion,
		});
	} catch (cause) {
		return failFrom<Credentials | null>("Could not look up the user", cause);
	}
}

/**
 * The signed-in person, for the session check. The caller compares
 * `sessionVersion` with the one in the token.
 */
export async function loadSessionUser(
	id: string,
): Promise<ActionResult<VersionedUser>> {
	if (nonEmptyString(id)) {
		return fail<VersionedUser>("A user id is required");
	}
	try {
		const snap = await ref(COLLECTION).doc(id).get();
		if (!snap.exists) {
			return notFound<VersionedUser>(LABEL, id);
		}
		return ok(toVersionedUser(snap.id, snap.data() as StoredUser));
	} catch (cause) {
		return failFrom<VersionedUser>("Could not load the user", cause);
	}
}

/**
 * The partner's display name, or `null` before the second person has signed
 * up. A `partnerId` whose document is gone also reads as no partner.
 */
export async function getPartnerName(
	user: Pick<User, "partnerId">,
): Promise<ActionResult<string | null>> {
	if (!user.partnerId) {
		return ok(null);
	}
	try {
		const snap = await ref(COLLECTION).doc(user.partnerId).get();
		return ok(snap.exists ? (snap.data() as StoredUser).name : null);
	} catch (cause) {
		return failFrom<string | null>("Could not load the partner", cause);
	}
}

/**
 * True while fewer than two users exist. Only the count: whether `SIGNUP_CODE`
 * is set is the caller's to check, since this layer never reads the
 * environment.
 */
export async function signUpOpen(): Promise<ActionResult<boolean>> {
	try {
		const snap = await ref(COLLECTION).count().get();
		return ok(snap.data().count < MAX_USERS);
	} catch (cause) {
		return failFrom<boolean>("Could not check whether sign-up is open", cause);
	}
}
