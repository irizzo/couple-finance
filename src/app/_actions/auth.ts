"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
	createUser,
	findCredentials,
	SIGN_UP_CLOSED_ERROR,
} from "@/database/users.actions";
import { collect, normalizedUsername } from "@/database/validators";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, secretMatches } from "@/lib/session";
import { type FormState, fromResult, textField } from "./form-state";
import { signUpCode, startSession } from "./session";

/**
 * Sign up, sign in and sign out. The only actions here that run without a
 * session — the first two are how you get one.
 *
 * Nothing limits how often a password or the invite code can be guessed, so
 * their length is the whole defence: passwords need 12 characters, and
 * `SIGNUP_CODE` should be long and removed once both people have signed up.
 */

const WRONG_CREDENTIALS = "Usuário ou senha incorretos.";
const SIGN_UP_CLOSED = "O cadastro está fechado.";

/**
 * A hash no submitted password matches, made once per server process with the
 * current scrypt parameters. An unknown username is verified against it, so it
 * costs the same time as a known one with a wrong password. Hashed here rather
 * than pasted as a constant, which would go stale — and so become measurably
 * faster or slower — the day the parameters change.
 */
const dummyHash = hashPassword(randomUUID());

export async function signInForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const username = normalizedUsername(textField(formData, "username"));
	// The username comes back so a typo in the password costs only the
	// password; the password itself is never echoed.
	const values = { username };

	const found = await findCredentials(username);
	if (!found.ok) {
		return { status: "error", error: found.error, values };
	}
	const credentials = found.data;
	const matches = await verifyPassword(
		textField(formData, "password"),
		credentials?.passwordHash ?? (await dummyHash),
	);
	if (!(credentials && matches)) {
		// One message for both, so the form does not say which usernames exist.
		return { status: "error", error: WRONG_CREDENTIALS, values };
	}

	await startSession(credentials.id, credentials.sessionVersion);
	redirect("/");
}

export async function signUpForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const expected = signUpCode();
	if (!expected) {
		return { status: "error", error: SIGN_UP_CLOSED };
	}
	// Never the code or the passwords.
	const values = {
		username: textField(formData, "username"),
		name: textField(formData, "name"),
		useSaldos: textField(formData, "useSaldos"),
	};

	// The code is checked before anything else, so someone without it learns
	// nothing — not even whether a username is taken.
	const codeMatches = await secretMatches(
		textField(formData, "code"),
		expected,
		process.env.AUTH_SECRET,
	);
	if (!codeMatches) {
		return {
			status: "error",
			error: "Código de convite incorreto.",
			fieldErrors: { code: "Código de convite incorreto." },
			values,
		};
	}

	const password = textField(formData, "password");
	const formErrors = collect({
		confirmPassword:
			textField(formData, "confirmPassword") === password
				? null
				: "As senhas não coincidem.",
		useSaldos:
			values.useSaldos === "true" || values.useSaldos === "false"
				? null
				: "Escolha como organizar as finanças.",
	});
	if (formErrors) {
		return {
			status: "error",
			error: "Cadastro inválido.",
			fieldErrors: formErrors,
			values,
		};
	}

	const result = await createUser({
		username: values.username,
		name: values.name,
		password,
		useSaldos: values.useSaldos === "true",
	});
	if (!result.ok) {
		return result.error === SIGN_UP_CLOSED_ERROR
			? { status: "error", error: SIGN_UP_CLOSED }
			: fromResult(result, values);
	}

	await startSession(result.data.id, result.data.sessionVersion);
	redirect("/");
}

/** A plain `<form action>`, so it takes no `FormState` and needs no JavaScript. */
export async function signOutForm(): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.delete(SESSION_COOKIE);
	redirect("/login");
}
