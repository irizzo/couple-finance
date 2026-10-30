"use client";

import { useActionState } from "react";
import { type FormAction, IDLE_FORM_STATE } from "@/app/_actions/form-state";
import styles from "./BudgetTable.module.css";
import controls from "./controls.module.css";

interface CopyBudgetsButtonProps {
	action: FormAction;
	month: string;
	/** The source month, already formatted — "setembro de 2026". */
	fromLabel: string;
}

/**
 * Seeds this month's plan from the previous one.
 *
 * No confirmation: the copy is additive — it never overwrites a figure already
 * set, nor one whose target has been archived — so pressing it twice is
 * harmless. It does report what it did, because a copy of nothing and a copy of
 * everything otherwise look identical.
 */
export function CopyBudgetsButton({
	action,
	month,
	fromLabel,
}: CopyBudgetsButtonProps) {
	const [state, copy, pending] = useActionState(action, IDLE_FORM_STATE);

	return (
		<form action={copy} className={styles.copyForm}>
			<input name="month" type="hidden" value={month} />
			<button className={controls.button} disabled={pending} type="submit">
				{pending ? "Copiando…" : `Copiar plano de ${fromLabel}`}
			</button>
			{/* `<output>` rather than a span with role="status": it is literally the
			    result of this form's calculation, and carries the live region for free. */}
			{(state.message || state.error) && (
				<output className={state.error ? styles.rowError : styles.copyResult}>
					{state.error ?? state.message}
				</output>
			)}
		</form>
	);
}
