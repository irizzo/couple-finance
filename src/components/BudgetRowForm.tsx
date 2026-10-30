"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import type { BudgetScope } from "@/types";
import styles from "./BudgetTable.module.css";
import controls from "./controls.module.css";

interface BudgetRowFormProps {
	action: FormAction;
	month: string;
	scope: BudgetScope;
	targetId: string;
	/** The existing budget document's id, or `""` when nothing is planned yet. */
	budgetId: string;
	planned: number | null;
	/** For the input's accessible name — the table header alone wouldn't say which row. */
	targetName: string;
}

/**
 * The editable planned amount for one budget row. **The table is the editor** —
 * there is no separate "create budget" screen, because a budget is a single
 * number and a whole form for it would be ceremony.
 *
 * Submitting an empty field clears the target rather than planning zero. Zero is
 * a legitimate target ("spend nothing here"), so the two cannot be the same
 * input value; the column header says so.
 */
export function BudgetRowForm({
	action,
	month,
	scope,
	targetId,
	budgetId,
	planned,
	targetName,
}: BudgetRowFormProps) {
	const [state, save, pending] = useActionState(action, IDLE_FORM_STATE);
	const message = state.fieldErrors?.plannedAmount ?? state.error;

	return (
		<form action={save} className={styles.plannedForm}>
			<input name="month" type="hidden" value={month} />
			<input name="scope" type="hidden" value={scope} />
			<input name="targetId" type="hidden" value={targetId} />
			<input name="budgetId" type="hidden" value={budgetId} />
			<input
				aria-invalid={Boolean(message)}
				aria-label={`Planejado para ${targetName}`}
				className={styles.plannedInput}
				defaultValue={
					state.values?.plannedAmount ??
					(planned === null ? "" : String(planned))
				}
				min="0"
				name="plannedAmount"
				step="0.01"
				type="number"
			/>
			<button
				className={`${controls.button} ${controls.compact}`}
				disabled={pending}
				type="submit"
			>
				{pending ? "…" : "Salvar"}
			</button>
			{message && (
				<span className={styles.rowError} role="alert">
					{message}
				</span>
			)}
		</form>
	);
}
