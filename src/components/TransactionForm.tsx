"use client";

import Link from "next/link";
import { useActionState, useCallback, useRef, useState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { round2 } from "@/database/validators";
import controls from "./controls.module.css";
import { Field } from "./Field";
import { SubmitButton } from "./SubmitButton";
import styles from "./TransactionForm.module.css";

/**
 * Total minus real, as an input value: the part of the bill that is not the
 * owner's. `null` until both amounts are filled in, or when real exceeds total.
 */
function remainder(
	total: HTMLInputElement | null,
	real: HTMLInputElement | null,
): string | null {
	if (!total || !real || total.value === "" || real.value === "") {
		return null;
	}
	const rest = Number(total.value) - Number(real.value);
	return Number.isFinite(rest) && rest >= 0 ? String(round2(rest)) : null;
}

interface TransactionFormProps {
	action: FormAction;
	accounts: SelectOption[];
	saldos: SelectOption[];
	categories: SelectOption[];
	/**
	 * The user's saldo mode. Off, neither saldo select is rendered, so the
	 * adapter reads both as absent and an edit keeps whatever saldo the
	 * transaction was recorded with.
	 */
	showSaldos: boolean;
	/**
	 * The partner's display name, or `null` before the partner has signed up.
	 * The "Compartilhar com …" box is offered only when there is one.
	 */
	partnerName: string | null;
	initial: TransactionFormValues;
	/** Present when editing; omitted when creating. */
	transactionId?: string;
	/**
	 * `"shared"` when the form was opened from the shared dashboard. Sent as a
	 * hidden field, and the adapter redirects there after saving instead of to
	 * the ledger.
	 */
	returnTo?: string;
	submitLabel: string;
	cancelHref: string;
}

export interface SelectOption {
	id: string;
	/**
	 * Already carries an "(arquivada)" / "(arquivado)" suffix where relevant. The
	 * page builds it, because the page knows which entity it is and Portuguese
	 * agrees in gender.
	 */
	label: string;
}

/** Everything the form needs as defaults, as strings ready for an input. */
export interface TransactionFormValues {
	date: string;
	description: string;
	totalAmount: string;
	realAmount: string;
	accountId: string;
	/** `""` when the transaction has no saldo. */
	saldoId: string;
	categoryId: string;
	type: string;
	/** `""` unless the transaction is a transfer. */
	toAccountId: string;
	toSaldoId: string;
	/** The one non-string default: a checkbox's checked state. */
	shared: boolean;
	/** The partner's part; `""` unless the expense is shared. */
	sharedAmount: string;
}

/**
 * The create/edit form, shared by both routes.
 *
 * Inputs are uncontrolled so `defaultValue` can come straight from
 * `state.values` after a rejected submit, which is how the user's typing
 * survives a validation error. Keeping `realAmount` in step with `totalAmount`
 * is done imperatively through refs for the same reason: controlled state would
 * fight those defaults. The type radios stay uncontrolled too; the only state
 * here mirrors which one is checked, to decide whether a transfer's destination
 * selects are rendered at all — hidden but present, their `required` would
 * block saving an expense.
 *
 * The saldo and categoria selects are independent. Since Phase 1 a category
 * does not belong to a saldo, so neither choice constrains the other. With
 * saldos off (`showSaldos`), there are no saldo selects at all.
 *
 * Only a despesa can be shared, so the "Compartilhar" box follows the `type`
 * state like the destination selects do, and appears only once there is a
 * partner to share with. The partner's part is rendered only while the box is
 * checked (a `sharing` state mirrors it), for the same reason as the
 * destination: hidden but present, its `required` would block an unshared
 * expense. It starts at total minus real and follows both, like `realAmount`
 * follows the total, until the user types in it.
 */
export function TransactionForm({
	action,
	accounts,
	saldos,
	categories,
	showSaldos,
	partnerName,
	initial,
	transactionId,
	returnTo,
	submitLabel,
	cancelHref,
}: TransactionFormProps) {
	const [state, submit] = useActionState(action, IDLE_FORM_STATE);

	const totalRef = useRef<HTMLInputElement>(null);
	const realRef = useRef<HTMLInputElement>(null);
	// If the two amounts already differ, the real share was set deliberately, so
	// typing in `total` must not overwrite it.
	const realEdited = useRef(
		initial.realAmount !== "" && initial.realAmount !== initial.totalAmount,
	);

	const value = (field: Exclude<keyof TransactionFormValues, "shared">) =>
		state.values?.[field] ?? initial[field];
	// After a refused submit the echo decides, since an unchecked box is simply
	// absent from it; falling back to `initial` would re-check a box the user
	// had just cleared.
	const sharedDefault = state.values
		? state.values.shared === "on"
		: initial.shared;
	const fieldError = (field: string) => state.fieldErrors?.[field];

	const shareRef = useRef<HTMLInputElement>(null);
	// Set whenever the part's input appears: a value that is not total minus
	// real was chosen on purpose, and typing in the amounts must not replace it.
	const shareEdited = useRef(false);
	const [sharing, setSharing] = useState(sharedDefault);

	/**
	 * Runs when the part's input appears: the box was checked, or the type came
	 * back to despesa. An empty field starts at total minus real.
	 */
	const attachShare = useCallback((input: HTMLInputElement | null) => {
		shareRef.current = input;
		if (input === null) {
			return;
		}
		const rest = remainder(totalRef.current, realRef.current);
		if (input.value === "" && rest !== null) {
			input.value = rest;
		}
		shareEdited.current =
			input.value !== "" &&
			(rest === null || Number(input.value) !== Number(rest));
	}, []);

	/** Keep the part at total minus real until the user takes it over. */
	function followShare() {
		if (shareEdited.current || !shareRef.current) {
			return;
		}
		const rest = remainder(totalRef.current, realRef.current);
		if (rest !== null) {
			shareRef.current.value = rest;
		}
	}

	/** Mirror the total into the real share until the user takes it over. */
	function mirrorTotal(event: React.ChangeEvent<HTMLInputElement>) {
		if (!realEdited.current && realRef.current) {
			realRef.current.value = event.target.value;
		}
		followShare();
	}

	function splitInHalf() {
		const total = Number(totalRef.current?.value);
		if (!Number.isFinite(total) || !realRef.current) {
			return;
		}
		realRef.current.value = (total / 2).toFixed(2);
		realEdited.current = true;
		followShare();
	}

	// The radios' defaults come from `initial` / `state.values` like every other
	// input; `type` only follows the user's clicks, to show the destination.
	const defaultType = value("type");
	const [type, setType] = useState(defaultType);
	const transfer = type === "transfer";
	// Matches the radios: anything that is not a receita or a transfer is shown
	// as a despesa.
	const expense = type !== "income" && !transfer;

	function selectType(event: React.ChangeEvent<HTMLInputElement>) {
		setType(event.target.value);
	}

	return (
		<form action={submit} className={styles.form}>
			{transactionId && <input name="id" type="hidden" value={transactionId} />}
			{returnTo && <input name="returnTo" type="hidden" value={returnTo} />}

			{state.status === "error" && !state.fieldErrors && (
				<p className={styles.error} role="alert">
					{state.error}
				</p>
			)}

			<div className={styles.row}>
				<div className={styles.narrow}>
					<Field error={fieldError("date")} label="Data" name="date">
						<input
							aria-invalid={Boolean(fieldError("date"))}
							defaultValue={value("date")}
							id="date"
							name="date"
							required={true}
							type="date"
						/>
					</Field>
				</div>
				<div className={styles.grow}>
					<Field
						error={fieldError("description")}
						label="Descrição"
						name="description"
					>
						<input
							aria-invalid={Boolean(fieldError("description"))}
							defaultValue={value("description")}
							id="description"
							name="description"
							placeholder="Internet"
							required={true}
							type="text"
						/>
					</Field>
				</div>
				<fieldset className={styles.typeGroup}>
					<legend className={styles.legend}>Tipo</legend>
					<div className={styles.radios}>
						<label className={styles.radio} htmlFor="type">
							<input
								defaultChecked={
									defaultType !== "income" && defaultType !== "transfer"
								}
								id="type"
								name="type"
								onChange={selectType}
								type="radio"
								value="expense"
							/>
							Despesa
						</label>
						<label className={styles.radio} htmlFor="type-income">
							<input
								defaultChecked={defaultType === "income"}
								id="type-income"
								name="type"
								onChange={selectType}
								type="radio"
								value="income"
							/>
							Receita
						</label>
						<label className={styles.radio} htmlFor="type-transfer">
							<input
								defaultChecked={defaultType === "transfer"}
								id="type-transfer"
								name="type"
								onChange={selectType}
								type="radio"
								value="transfer"
							/>
							Transferência
						</label>
					</div>
				</fieldset>
			</div>

			<div className={styles.amounts}>
				<p className={styles.help}>
					<strong>Total</strong> é o que saiu da conta. <strong>Real</strong> é
					a sua parte — numa conta de internet de R$ 90 dividida ao meio, o real
					é R$ 45. O real nunca pode ser maior que o total.
				</p>
				<div className={styles.narrow}>
					<Field
						error={fieldError("totalAmount")}
						label="Valor total"
						name="totalAmount"
					>
						<input
							aria-invalid={Boolean(fieldError("totalAmount"))}
							defaultValue={value("totalAmount")}
							id="totalAmount"
							min="0"
							name="totalAmount"
							onChange={mirrorTotal}
							ref={totalRef}
							required={true}
							step="0.01"
							type="number"
						/>
					</Field>
				</div>
				<div className={styles.splitAction}>
					<button
						className={`${controls.button} ${controls.compact}`}
						onClick={splitInHalf}
						type="button"
					>
						Dividir 50/50
					</button>
				</div>
				<div className={styles.narrow}>
					<Field
						error={fieldError("realAmount")}
						label="Valor real"
						name="realAmount"
					>
						<input
							aria-invalid={Boolean(fieldError("realAmount"))}
							defaultValue={value("realAmount")}
							id="realAmount"
							min="0"
							name="realAmount"
							onChange={() => {
								realEdited.current = true;
								followShare();
							}}
							ref={realRef}
							required={true}
							step="0.01"
							type="number"
						/>
					</Field>
				</div>
			</div>

			<div className={styles.row}>
				<div className={styles.grow}>
					<Field
						error={fieldError("accountId")}
						label={transfer ? "Conta de origem" : "Conta"}
						name="accountId"
					>
						<select
							aria-invalid={Boolean(fieldError("accountId"))}
							defaultValue={value("accountId")}
							id="accountId"
							name="accountId"
							required={true}
						>
							<option value="">Selecione…</option>
							{accounts.map((option) => (
								<option key={option.id} value={option.id}>
									{option.label}
								</option>
							))}
						</select>
					</Field>
				</div>
				{showSaldos && (
					<div className={styles.grow}>
						<Field
							error={fieldError("saldoId")}
							label={transfer ? "Saldo de origem" : "Saldo"}
							name="saldoId"
						>
							<select
								aria-invalid={Boolean(fieldError("saldoId"))}
								defaultValue={value("saldoId")}
								id="saldoId"
								name="saldoId"
								required={true}
							>
								<option value="">Selecione…</option>
								{saldos.map((option) => (
									<option key={option.id} value={option.id}>
										{option.label}
									</option>
								))}
							</select>
						</Field>
					</div>
				)}
				<div className={styles.grow}>
					<Field
						error={fieldError("categoryId")}
						label="Categoria"
						name="categoryId"
					>
						<select
							aria-invalid={Boolean(fieldError("categoryId"))}
							defaultValue={value("categoryId")}
							id="categoryId"
							name="categoryId"
							required={true}
						>
							<option value="">Selecione…</option>
							{categories.map((option) => (
								<option key={option.id} value={option.id}>
									{option.label}
								</option>
							))}
						</select>
					</Field>
				</div>
			</div>

			{expense && partnerName !== null && (
				<div className={styles.share}>
					<label className={styles.shareLabel} htmlFor="shared">
						{/* Follows `sharing`, not the echo, so the box and the part stay
						    in step when the type leaves despesa and comes back. */}
						<input
							defaultChecked={sharing}
							id="shared"
							name="shared"
							onChange={(event) => setSharing(event.target.checked)}
							type="checkbox"
						/>
						Compartilhar com {partnerName}
					</label>
					{sharing && (
						<div className={styles.shareAmount}>
							<Field
								error={fieldError("sharedAmount")}
								label={`Parte de ${partnerName}`}
								name="sharedAmount"
							>
								<input
									aria-invalid={Boolean(fieldError("sharedAmount"))}
									defaultValue={value("sharedAmount")}
									id="sharedAmount"
									min="0"
									name="sharedAmount"
									onChange={() => {
										shareEdited.current = true;
									}}
									ref={attachShare}
									required={true}
									step="0.01"
									type="number"
								/>
							</Field>
						</div>
					)}
					<p className={styles.shareHelp}>
						A parte de {partnerName} é o que {partnerName} deve a você por esta
						despesa; começa em total menos real. {partnerName} verá a descrição,
						a data, o valor total, essa parte, a categoria e quem pagou — não a
						conta, o saldo nem o valor real. Só você pode editar ou excluir este
						lançamento.
					</p>
				</div>
			)}

			{transfer && (
				<div className={styles.destination}>
					{showSaldos ? (
						<p className={styles.help}>
							O destino pode repetir a <strong>conta</strong> ou o{" "}
							<strong>saldo</strong> da origem — para mover dinheiro entre
							saldos da mesma conta, ou entre contas do mesmo saldo — mas não os
							dois.
						</p>
					) : (
						<p className={styles.help}>
							O dinheiro sai da conta de origem e entra na{" "}
							<strong>conta de destino</strong>, que precisa ser outra.
						</p>
					)}
					<div className={styles.grow}>
						<Field
							error={fieldError("toAccountId")}
							label="Conta de destino"
							name="toAccountId"
						>
							<select
								aria-invalid={Boolean(fieldError("toAccountId"))}
								defaultValue={value("toAccountId")}
								id="toAccountId"
								name="toAccountId"
								required={true}
							>
								<option value="">Selecione…</option>
								{accounts.map((option) => (
									<option key={option.id} value={option.id}>
										{option.label}
									</option>
								))}
							</select>
						</Field>
					</div>
					{showSaldos && (
						<div className={styles.grow}>
							<Field
								error={fieldError("toSaldoId")}
								label="Saldo de destino"
								name="toSaldoId"
							>
								<select
									aria-invalid={Boolean(fieldError("toSaldoId"))}
									defaultValue={value("toSaldoId")}
									id="toSaldoId"
									name="toSaldoId"
									required={true}
								>
									<option value="">Selecione…</option>
									{saldos.map((option) => (
										<option key={option.id} value={option.id}>
											{option.label}
										</option>
									))}
								</select>
							</Field>
						</div>
					)}
				</div>
			)}

			<div className={styles.actions}>
				<SubmitButton pendingLabel="Salvando…">{submitLabel}</SubmitButton>
				<Link className={styles.cancel} href={cancelHref}>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
