"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import { ConfirmSubmit } from "./ConfirmSubmit";
import controls from "./controls.module.css";
import styles from "./TransactionsTable.module.css";

interface TransactionRowActionsProps {
	id: string;
	description: string;
	deleteAction: FormAction;
}

/**
 * Editar · Duplicar · Excluir for one ledger row.
 *
 * "Duplicar" is a plain link to `/transactions/new?from=<id>`, which prefills
 * the form and resets the date to today — nothing is written until submit, so a
 * recurrent-but-variable expense can have its amount adjusted first. That is the
 * feature CLAUDE.MD asks for: not retyping, rather than an exact copy.
 *
 * Only the delete needs client state, for its confirmation and to surface a
 * failure in place.
 */
export function TransactionRowActions({
	id,
	description,
	deleteAction,
}: TransactionRowActionsProps) {
	const [state, remove] = useActionState(deleteAction, IDLE_FORM_STATE);

	return (
		<div className={styles.rowActions}>
			<Link
				className={`${controls.button} ${controls.compact}`}
				href={`/transactions/${id}/edit`}
			>
				Editar
			</Link>
			<Link
				className={`${controls.button} ${controls.compact}`}
				href={`/transactions/new?from=${id}`}
			>
				Duplicar
			</Link>
			<form action={remove}>
				<input name="id" type="hidden" value={id} />
				<ConfirmSubmit
					compact={true}
					confirm={`Excluir "${description}"? Os saldos movimentados por ele voltam ao valor anterior. Esta ação não pode ser desfeita.`}
				>
					Excluir
				</ConfirmSubmit>
			</form>
			{state.error && (
				<span className={styles.missing} role="alert">
					{state.error}
				</span>
			)}
		</div>
	);
}
