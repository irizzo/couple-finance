"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { ErrorBanner } from "./ErrorBanner";
import { Field } from "./Field";
import styles from "./LoginForm.module.css";
import { SubmitButton } from "./SubmitButton";

interface LoginFormProps {
	action: FormAction;
}

/**
 * Username and password. A refusal comes back as one form-level message —
 * "Usuário ou senha incorretos." covers both, so it belongs to neither field —
 * with the username kept and the password emptied, since only the username is
 * echoed. A success redirects from the action, so there is no success state to
 * render here.
 */
export function LoginForm({ action }: LoginFormProps) {
	const [state, signIn] = useActionState(action, IDLE_FORM_STATE);

	return (
		<form action={signIn} className={styles.form}>
			{state.status === "error" && state.error && (
				<ErrorBanner>{state.error}</ErrorBanner>
			)}
			<Field label="Usuário" name="username">
				<input
					autoCapitalize="none"
					autoComplete="username"
					defaultValue={state.values?.username}
					id="username"
					name="username"
					required={true}
					spellCheck={false}
					type="text"
				/>
			</Field>
			<Field label="Senha" name="password">
				<input
					autoComplete="current-password"
					id="password"
					name="password"
					required={true}
					type="password"
				/>
			</Field>
			<SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
		</form>
	);
}
