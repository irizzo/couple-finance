"use client";

import { useActionState, useEffect, useRef } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { TEXT_MAX_LENGTH } from "@/database/validators";
import { BalanceEntityRow, type BalanceEntityView } from "./BalanceEntityRow";
import styles from "./EntityManager.module.css";
import type { EntityLabels } from "./entity-labels";
import { Field } from "./Field";
import { SubmitButton } from "./SubmitButton";

interface BalanceEntityManagerProps {
	entities: BalanceEntityView[];
	labels: EntityLabels;
	actions: {
		create: FormAction;
		update: FormAction;
		archive: FormAction;
		unarchive: FormAction;
	};
}

/**
 * Create form plus editable table for the two balance-carrying entities.
 *
 * Accounts and saldos share this component because they are structurally
 * identical — a name and description plus `initialAmount`, `totalBalance` and
 * `realBalance` —
 * the same reason `createBalanceEntity` exists once in the data layer. Only the
 * labels and the action set differ.
 */
export function BalanceEntityManager({
	entities,
	labels,
	actions,
}: BalanceEntityManagerProps) {
	const [state, create] = useActionState(actions.create, IDLE_FORM_STATE);
	const formRef = useRef<HTMLFormElement>(null);

	// `useActionState` does not reset the form on completion the way a bare
	// `<form action>` does, so a successful create has to clear it explicitly —
	// otherwise the next entity starts with the previous one's name in the box.
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
				<div className={styles.grow}>
					{/* One line, not a textarea: ask for what the row editor can change. */}
					<Field
						error={state.fieldErrors?.description}
						hint="Opcional"
						label={labels.description}
						name="description"
					>
						<input
							aria-invalid={Boolean(state.fieldErrors?.description)}
							defaultValue={state.values?.description ?? ""}
							id="description"
							maxLength={TEXT_MAX_LENGTH}
							name="description"
							placeholder={labels.descriptionPlaceholder}
							type="text"
						/>
					</Field>
				</div>
				<div className={styles.amount}>
					<Field
						error={state.fieldErrors?.initialAmount}
						hint="Saldo de abertura"
						label="Valor inicial"
						name="initialAmount"
					>
						<input
							aria-invalid={Boolean(state.fieldErrors?.initialAmount)}
							defaultValue={state.values?.initialAmount ?? "0"}
							id="initialAmount"
							name="initialAmount"
							required={true}
							step="0.01"
							type="number"
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
							<th scope="col">Descrição</th>
							<th className={styles.numeric} scope="col">
								Inicial
							</th>
							<th className={styles.numeric} scope="col">
								Saldo total
							</th>
							<th className={styles.numeric} scope="col">
								Saldo real
							</th>
							<th className={styles.actionsCell} scope="col">
								Ações
							</th>
						</tr>
					</thead>
					<tbody>
						{entities.length === 0 ? (
							<tr>
								<td className={styles.empty} colSpan={6}>
									{labels.empty}
								</td>
							</tr>
						) : (
							entities.map((entity) => (
								<BalanceEntityRow
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
