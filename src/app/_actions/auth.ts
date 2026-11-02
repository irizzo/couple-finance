"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
	issueSession,
	passwordMatches,
	SESSION_COOKIE,
	SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import { type FormState, textField } from "./form-state";

/**
 * Sign in and out. The only two actions here that run without a session — the
 * first is how you get one.
 *
 * One password for both people, from `AUTH_PASSWORD`. Nothing limits how often
 * it can be guessed, so its length is the whole defence: make it a long
 * passphrase.
 */

export async function signInForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const matches = await passwordMatches(
		textField(formData, "password"),
		process.env.AUTH_PASSWORD,
		process.env.AUTH_SECRET,
	);
	if (!matches) {
		// No `values` echo: a refused password is not worth keeping in the form.
		return { status: "error", fieldErrors: { password: "Senha incorreta." } };
	}

	const cookieStore = await cookies();
	cookieStore.set(SESSION_COOKIE, await issueSession(process.env.AUTH_SECRET), {
		httpOnly: true,
		sameSite: "lax",
		// Browsers accept a `secure` cookie on http://localhost, so `next start`
		// still works locally.
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: SESSION_MAX_AGE_SECONDS,
	});
	redirect("/");
}

/** A plain `<form action>`, so it takes no `FormState` and needs no JavaScript. */
export async function signOutForm(): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.delete(SESSION_COOKIE);
	redirect("/login");
}
