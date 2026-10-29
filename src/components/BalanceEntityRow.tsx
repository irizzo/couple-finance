"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { ConfirmSubmit } from "./ConfirmSubmit";
import controls from "./controls.module.css";
import styles from "./EntityManager.module.css";
import { archiveConfirmFor, type EntityLabels } from "./entity-labels";
import { Money } from "./Money";
import { SubmitButton } from "./SubmitButton";

interface BalanceEntityRowProps {
	entity: BalanceEntityView;
	labels: EntityLabels;
	updateAction: FormAction;
	archiveAction: FormAction;
	unarchiveAction: FormAction;
}

export interface BalanceEntityView {
	id: string;
	name: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
}

/**
 * One editable row. Name and opening amount are edited in place and saved with
 * the row's own button; archiving is a separate, self-contained form.
 *
 * The edit inputs sit in different `<td>`s, so they are tied to their `<form>`
 * by the HTML `form` attribute rather than by nesting — a `<form>` may not span
 * table cells. That also means the save button is not a descendant of the form,
 * so `useFormStatus` cannot see it; the pending flag comes from
 * `useActionState`'s third return value instead.
 */
export function BalanceEntityRow({
	entity,
	labels,
	updateAction,
	archiveAction,
	unarchiveAction,
}: BalanceEntityRowProps) {
	const [updateState, update, updatePending] = useActionState(
		updateAction,
		IDLE_FORM_STATE,
	);
	const [archiveState, archive] = useActionState(
		entity.archived ? unarchiveAction : archiveAction,
		IDLE_FORM_STATE,
	);

	const formId = `edit-${entity.id}`;
	const nameError = updateState.fieldErrors?.name;
	const amountError = updateState.fieldErrors?.initialAmount;
	const problem =
		updateState.error ??
		archiveState.error ??
		nameError ??
		amountError ??
		undefined;

	return (
		<>
			<tr className={entity.archived ? styles.archivedRow : undefined}>
				<td>
					<form action={update} id={formId}>
						<input name="id" type="hidden" value={entity.id} />
						<input
							aria-invalid={Boolean(nameError)}
							aria-label={labels.name}
							className={styles.nameInput}
							defaultValue={updateState.values?.name ?? entity.name}
							name="name"
							required={true}
							type="text"
						/>
					</form>
					{entity.archived && (
						<span className={styles.archivedTag}>{labels.archivedTag}</span>
					)}
				</td>
				<td className={styles.numeric}>
					<input
						aria-invalid={Boolean(amountError)}
						aria-label="Valor inicial"
						className={styles.amountInput}
						defaultValue={
							updateState.values?.initialAmount ?? entity.initialAmount
						}
						form={formId}
						name="initialAmount"
						required={true}
						step="0.01"
						type="number"
					/>
				</td>
				<td className={styles.numeric}>
					<Money tone="signed" value={entity.totalBalance} />
				</td>
				<td className={styles.numeric}>
					<Money tone="signed" value={entity.realBalance} />
				</td>
				<td className={styles.actionsCell}>
					<span className={styles.rowActions}>
						<button
							className={`${controls.button} ${controls.compact}`}
							disabled={updatePending}
							form={formId}
							type="submit"
						>
							{updatePending ? "Salvando…" : "Salvar"}
						</button>
						<form action={archive}>
							<input name="id" type="hidden" value={entity.id} />
							{entity.archived ? (
								<SubmitButton compact={true} variant="plain">
									Restaurar
								</SubmitButton>
							) : (
								<ConfirmSubmit
									compact={true}
									confirm={archiveConfirmFor(labels, entity.name)}
								>
									Arquivar
								</ConfirmSubmit>
							)}
						</form>
					</span>
				</td>
			</tr>
			{problem && (
				<tr>
					<td className={styles.rowError} colSpan={5}>
						{problem}
					</td>
				</tr>
			)}
		</>
	);
}
