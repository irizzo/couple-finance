"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { ConfirmSubmit } from "./ConfirmSubmit";
import controls from "./controls.module.css";
import styles from "./EntityManager.module.css";
import { archiveConfirmFor, type EntityLabels } from "./entity-labels";
import { SubmitButton } from "./SubmitButton";

interface NamedEntityRowProps {
	entity: NamedEntityView;
	labels: EntityLabels;
	updateAction: FormAction;
	archiveAction: FormAction;
	unarchiveAction: FormAction;
}

export interface NamedEntityView {
	id: string;
	name: string;
	archived: boolean;
}

/**
 * A name-only row — categories. Same mechanics as `BalanceEntityRow` (see its
 * note on the `form` attribute), with one editable field and no balance columns.
 */
export function NamedEntityRow({
	entity,
	labels,
	updateAction,
	archiveAction,
	unarchiveAction,
}: NamedEntityRowProps) {
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
	const problem =
		updateState.error ?? archiveState.error ?? nameError ?? undefined;

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
					<td className={styles.rowError} colSpan={2}>
						{problem}
					</td>
				</tr>
			)}
		</>
	);
}
