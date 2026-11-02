"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { ErrorBanner } from "./ErrorBanner";
import { Field } from "./Field";
import styles from "./ProfileForms.module.css";
import { SaldoModeField } from "./SaldoModeField";
import { SubmitButton } from "./SubmitButton";

interface ProfileFormProps {
	action: FormAction;
	username: string;
	name: string;
	useSaldos: boolean;
}

/**
 * The display name and the saldo mode. The username is shown but not
 * submitted: it is immutable.
 */
export function ProfileForm({
	action,
	username,
	name,
	useSaldos,
}: ProfileFormProps) {
	const [state, save] = useActionState(action, IDLE_FORM_STATE);
	const fieldError = (field: string) => state.fieldErrors?.[field];

	return (
		<form action={save} className={styles.form}>
			{state.status === "error" && !state.fieldErrors && state.error && (
				<ErrorBanner>{state.error}</ErrorBanner>
			)}
			<Field
				hint="O usuário não pode ser mudado."
				label="Usuário"
				name="username"
			>
				<input
					aria-describedby="username-hint"
					id="username"
					readOnly={true}
					type="text"
					value={username}
				/>
			</Field>
			<Field error={fieldError("name")} label="Nome" name="name">
				<input
					aria-invalid={Boolean(fieldError("name"))}
					autoComplete="name"
					defaultValue={state.values?.name ?? name}
					id="name"
					name="name"
					required={true}
					type="text"
				/>
			</Field>
			<SaldoModeField
				error={fieldError("useSaldos")}
				useSaldos={
					state.values ? state.values.useSaldos !== "false" : useSaldos
				}
			/>
			<p className={styles.note}>
				Desligar os saldos não apaga nada. Os saldos ficam guardados, e um
				lançamento que já tem saldo continua com ele e continua movendo-o se for
				editado. Os novos lançamentos deixam de pedir saldo. Religue quando
				quiser.
			</p>
			<div className={styles.actions}>
				<SubmitButton pendingLabel="Salvando…">Salvar perfil</SubmitButton>
				{state.status === "ok" && state.message && (
					<output className={styles.saved}>{state.message}</output>
				)}
			</div>
		</form>
	);
}
