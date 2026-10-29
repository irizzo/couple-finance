"use client";

import { useActionState, useEffect, useRef } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import styles from "./EntityManager.module.css";
import type { EntityLabels } from "./entity-labels";
import { Field } from "./Field";
import { NamedEntityRow, type NamedEntityView } from "./NamedEntityRow";
import { SubmitButton } from "./SubmitButton";

interface NamedEntityManagerProps {
	entities: NamedEntityView[];
	labels: EntityLabels;
	actions: {
		create: FormAction;
		update: FormAction;
		archive: FormAction;
		unarchive: FormAction;
	};
}

/**
 * Create form plus editable table for name-only entities — categories.
 *
 * The balance variant lives in `BalanceEntityManager`; the split mirrors the
 * data layer's own `createNamedEntity` / `createBalanceEntity` pair.
 */
export function NamedEntityManager({
	entities,
	labels,
	actions,
}: NamedEntityManagerProps) {
	const [state, create] = useActionState(actions.create, IDLE_FORM_STATE);
	const formRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		if (state.status === "ok") {
			formRef.current?.reset();
		}
	}, [state]);

	return (
		<div className={styles.manager}>
			<form action={create} className={styles.createForm} ref={formRef}>
				<div className={styles.grow}>
					<Field
						error={state.fieldErrors?.name}
						label={labels.name}
						name="name"
					>
						<input
							aria-invalid={Boolean(state.fieldErrors?.name)}
							defaultValue={state.values?.name ?? ""}
							id="name"
							name="name"
							placeholder={labels.placeholder}
							required={true}
							type="text"
						/>
					</Field>
				</div>
				<div className={styles.createAction}>
					<SubmitButton pendingLabel="Criando…">Adicionar</SubmitButton>
				</div>
				{state.status === "error" && !state.fieldErrors && (
					<p className={styles.formError} role="alert">
						{state.error}
					</p>
				)}
			</form>

			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th scope="col">Nome</th>
							<th className={styles.actionsCell} scope="col">
								Ações
							</th>
						</tr>
					</thead>
					<tbody>
						{entities.length === 0 ? (
							<tr>
								<td className={styles.empty} colSpan={2}>
									{labels.empty}
								</td>
							</tr>
						) : (
							entities.map((entity) => (
								<NamedEntityRow
									archiveAction={actions.archive}
									entity={entity}
									key={entity.id}
									labels={labels}
									unarchiveAction={actions.unarchive}
									updateAction={actions.update}
								/>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
