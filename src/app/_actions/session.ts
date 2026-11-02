import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";

/**
 * The session check for code that runs inside a request. Deliberately *not*
 * `"use server"`, like `form-state.ts`: every export of such a module is a
 * Server Action anyone can POST to, and this one should not be.
 */

/** True when the request carries a session cookie that is valid right now. */
export async function hasSession(): Promise<boolean> {
	const cookieStore = await cookies();
	return isValidSession(
		cookieStore.get(SESSION_COOKIE)?.value,
		process.env.AUTH_SECRET,
	);
}

/**
 * The first line of every adapter in this folder. The proxy already turns away
 * a request with no session, but only on the paths its `matcher` covers, and a
 * Server Action is a POST to whichever page uses it — a matcher edit could
 * expose one without anything failing. This makes each action check for
 * itself.
 *
 * Redirects rather than returning an error: by the time an action finds no
 * session, the page it was submitted from is no use either.
 */
export async function requireSession(): Promise<void> {
	if (!(await hasSession())) {
		redirect("/login");
	}
}
