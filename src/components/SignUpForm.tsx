"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { PASSWORD_MIN_LENGTH } from "@/database/validators";
import { ErrorBanner } from "./ErrorBanner";
import { Field } from "./Field";
import styles from "./SignUpForm.module.css";
import { SubmitButton } from "./SubmitButton";

interface SignUpFormProps {
	action: FormAction;
}

/**
 * The invite code, the account and the saldo mode. A refused submit comes back
 * with the username, name and mode kept; the code and both passwords are never
 * echoed, so they empty. A success redirects from the action.
 */
export function SignUpForm({ action }: SignUpFormProps) {
	const [state, signUp] = useActionState(action, IDLE_FORM_STATE);
	const fieldError = (field: string) => state.fieldErrors?.[field];
	const accountsOnly = state.values?.useSaldos === "false";

	return (
		<form action={signUp} className={styles.form}>
			{state.status === "error" && !state.fieldErrors && state.error && (
				<ErrorBanner>{state.error}</ErrorBanner>
			)}
			<Field error={fieldError("code")} label="Código de convite" name="code">
				<input
					aria-invalid={Boolean(fieldError("code"))}
					autoComplete="off"
					id="code"
					name="code"
					required={true}
					spellCheck={false}
					type="text"
				/>
			</Field>
			<Field
				error={fieldError("username")}
				hint="3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado. Não pode ser mudado depois."
				label="Usuário"
				name="username"
			>
				<input
					aria-describedby={
						fieldError("username") ? "username-error" : "username-hint"
					}
					aria-invalid={Boolean(fieldError("username"))}
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
			<Field error={fieldError("name")} label="Nome" name="name">
				<input
					aria-invalid={Boolean(fieldError("name"))}
					autoComplete="name"
					defaultValue={state.values?.name}
					id="name"
					name="name"
					required={true}
					type="text"
				/>
			</Field>
			<Field
				error={fieldError("password")}
				hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`}
				label="Senha"
				name="password"
			>
				<input
					aria-describedby={
						fieldError("password") ? "password-error" : "password-hint"
					}
					aria-invalid={Boolean(fieldError("password"))}
					autoComplete="new-password"
					id="password"
					minLength={PASSWORD_MIN_LENGTH}
					name="password"
					required={true}
					type="password"
				/>
			</Field>
			<Field
				error={fieldError("confirmPassword")}
				label="Confirmar senha"
				name="confirmPassword"
			>
				<input
					aria-invalid={Boolean(fieldError("confirmPassword"))}
					autoComplete="new-password"
					id="confirmPassword"
					name="confirmPassword"
					required={true}
					type="password"
				/>
			</Field>
			<fieldset className={styles.modes}>
				<legend className={styles.legend}>Como organizar as finanças</legend>
				<label className={styles.mode} htmlFor="useSaldos">
					<input
						defaultChecked={!accountsOnly}
						id="useSaldos"
						name="useSaldos"
						type="radio"
						value="true"
					/>
					<span className={styles.modeText}>
						<strong>Contas e saldos</strong>
						<span className={styles.modeHint}>
							Cada lançamento sai de uma conta e de um saldo, como “Essenciais”
							ou “Lazer”.
						</span>
					</span>
				</label>
				<label className={styles.mode} htmlFor="useSaldos-accounts">
					<input
						defaultChecked={accountsOnly}
						id="useSaldos-accounts"
						name="useSaldos"
						type="radio"
						value="false"
					/>
					<span className={styles.modeText}>
						<strong>Só contas</strong>
						<span className={styles.modeHint}>
							Cada lançamento sai só de uma conta.
						</span>
					</span>
				</label>
				{fieldError("useSaldos") && (
					<span className={styles.error} role="alert">
						{fieldError("useSaldos")}
					</span>
				)}
			</fieldset>
			<SubmitButton pendingLabel="Criando…">Criar conta</SubmitButton>
		</form>
	);
}
