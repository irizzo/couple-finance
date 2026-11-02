"use client";

import { useActionState, useEffect, useRef } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { PASSWORD_MIN_LENGTH } from "@/database/validators";
import { ErrorBanner } from "./ErrorBanner";
import { Field } from "./Field";
import styles from "./ProfileForms.module.css";
import { SubmitButton } from "./SubmitButton";

interface PasswordFormProps {
	action: FormAction;
}

/**
 * Senha atual, nova senha and its confirmation. Nothing typed here is ever
 * echoed back, so a refused submit empties all three.
 */
export function PasswordForm({ action }: PasswordFormProps) {
	const [state, change] = useActionState(action, IDLE_FORM_STATE);
	const fieldError = (field: string) => state.fieldErrors?.[field];
	const formRef = useRef<HTMLFormElement>(null);

	// `useActionState` does not reset the form, and a changed password must not
	// stay in the boxes.
	useEffect(() => {
		if (state.status === "ok") {
			formRef.current?.reset();
		}
	}, [state]);

	return (
		<form action={change} className={styles.form} ref={formRef}>
			{state.status === "error" && !state.fieldErrors && state.error && (
				<ErrorBanner>{state.error}</ErrorBanner>
			)}
			<Field
				error={fieldError("currentPassword")}
				label="Senha atual"
				name="currentPassword"
			>
				<input
					aria-invalid={Boolean(fieldError("currentPassword"))}
					autoComplete="current-password"
					id="currentPassword"
					name="currentPassword"
					required={true}
					type="password"
				/>
			</Field>
			<Field
				error={fieldError("newPassword")}
				hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`}
				label="Nova senha"
				name="newPassword"
			>
				<input
					aria-describedby={
						fieldError("newPassword") ? "newPassword-error" : "newPassword-hint"
					}
					aria-invalid={Boolean(fieldError("newPassword"))}
					autoComplete="new-password"
					id="newPassword"
					minLength={PASSWORD_MIN_LENGTH}
					name="newPassword"
					required={true}
					type="password"
				/>
			</Field>
			<Field
				error={fieldError("confirmPassword")}
				label="Confirmar nova senha"
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
			<div className={styles.actions}>
				<SubmitButton pendingLabel="Trocando…">Trocar senha</SubmitButton>
				{state.status === "ok" && state.message && (
					<output className={styles.saved}>{state.message}</output>
				)}
			</div>
		</form>
	);
}
