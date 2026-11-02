import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type ActionResult, ok } from "@/database/result";
import { loadSessionUser, signUpOpen } from "@/database/users.actions";
import {
	issueSession,
	readSession,
	SESSION_COOKIE,
	SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import type { SessionUser } from "@/types";

/**
 * Who is signed in, for code that runs inside a request: the Data Access Layer
 * check from Next's authentication guide. Deliberately *not* `"use server"`,
 * like `form-state.ts`: every export of such a module is a Server Action anyone
 * can POST to, and none of these should be.
 */

/**
 * The signed-in user, or `null`. The proxy has only checked the signature;
 * this also reads the user and compares the stored `sessionVersion` with the
 * token's, so a password change signs out every other device at its next
 * request, and a deleted user is signed out everywhere.
 *
 * `cache` makes it one Firestore read per render, however many components ask.
 * A Server Action is not a render, so there every call reads again.
 *
 * Any failure reads as signed out, the direction that fails closed. A Firestore
 * outage then surfaces on /login, where sign-in reports the error.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
	const cookieStore = await cookies();
	const claims = await readSession(
		cookieStore.get(SESSION_COOKIE)?.value,
		process.env.AUTH_SECRET,
	);
	if (!claims) {
		return null;
	}
	const result = await loadSessionUser(claims.userId);
	if (!result.ok || result.data.sessionVersion !== claims.sessionVersion) {
		return null;
	}
	// Field by field, so the version stays here and never reaches a page.
	const { id, username, name, useSaldos, partnerId } = result.data;
	return { id, username, name, useSaldos, partnerId };
});

/**
 * The first line of every adapter in this folder, and of every page that reads
 * data. The proxy already turns away a request with no valid token, but only
 * on the paths its `matcher` covers, and a Server Action is a POST to whichever
 * page uses it — a matcher edit could expose one without anything failing.
 * This makes each action and page check for itself, against Firestore.
 *
 * Redirects rather than returning an error: by the time an action finds no
 * user, the page it was submitted from is no use either.
 */
export async function requireUser(): Promise<SessionUser> {
	const user = await getSessionUser();
	if (!user) {
		redirect("/login");
	}
	return user;
}

/**
 * Signs this browser in as `userId` at `sessionVersion`. Sign-in and sign-up
 * both end here, so the cookie's options exist once. Only callable where
 * cookies may be set: a Server Action, never a page.
 */
export async function startSession(
	userId: string,
	sessionVersion: number,
): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set(
		SESSION_COOKIE,
		await issueSession(userId, sessionVersion, process.env.AUTH_SECRET),
		{
			httpOnly: true,
			sameSite: "lax",
			// Browsers accept a `secure` cookie on http://localhost, so `next start`
			// still works locally.
			secure: process.env.NODE_ENV === "production",
			path: "/",
			maxAge: SESSION_MAX_AGE_SECONDS,
		},
	);
}

/** The invite code `/signup` asks for, or `undefined` while sign-up is off. */
export function signUpCode(): string | undefined {
	return process.env.SIGNUP_CODE || undefined;
}

/**
 * Whether `/signup` would accept a submission now: `SIGNUP_CODE` is set and
 * fewer than two users exist. Lives here because pages may not read
 * `process.env`; the data layer's `signUpOpen` only counts users.
 */
export async function signUpAvailable(): Promise<ActionResult<boolean>> {
	if (!signUpCode()) {
		return ok(false);
	}
	return signUpOpen();
}
