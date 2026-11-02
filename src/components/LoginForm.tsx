"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { Field } from "./Field";
import styles from "./LoginForm.module.css";
import { SubmitButton } from "./SubmitButton";

interface LoginFormProps {
	action: FormAction;
}

/**
 * The one password field. A wrong password comes back as a field error and the
 * input empties, since nothing is echoed; a right one redirects from the action,
 * so there is no success state to render here.
 */
export function LoginForm({ action }: LoginFormProps) {
	const [state, signIn] = useActionState(action, IDLE_FORM_STATE);
	const error = state.fieldErrors?.password;

	return (
		<form action={signIn} className={styles.form}>
			<Field error={error} label="Senha" name="password">
				<input
					aria-describedby={error ? "password-error" : undefined}
					aria-invalid={Boolean(error)}
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
