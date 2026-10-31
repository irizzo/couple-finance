"use client";

import { useFormStatus } from "react-dom";
import styles from "./controls.module.css";

interface ConfirmSubmitProps {
	children: React.ReactNode;
	/** Shown in the browser confirm dialog. Name the specific record. */
	confirm: string;
	compact?: boolean;
}

/**
 * Submit button for a destructive action — deleting a transaction, archiving an
 * account. Cancelling the dialog calls `preventDefault`, so the form never
 * submits and the action never runs.
 *
 * Only the hard-to-undo paths use this: transaction delete (money moves and
 * balances unwind), archive (reversible, but it stops new postings), and
 * clearing an archived target's plan (it cannot be re-planned without a
 * restore). Ordinary saves use `SubmitButton`.
 */
export function ConfirmSubmit({
	children,
	confirm,
	compact = false,
}: ConfirmSubmitProps) {
	const { pending } = useFormStatus();

	const className = [
		styles.button,
		styles.danger,
		compact ? styles.compact : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button
			className={className}
			disabled={pending}
			onClick={(event) => {
				if (!window.confirm(confirm)) {
					event.preventDefault();
				}
			}}
			type="submit"
		>
			{children}
		</button>
	);
}
