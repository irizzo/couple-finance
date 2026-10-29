import type { ReactNode } from "react";
import styles from "./Field.module.css";

interface FieldProps {
	/** Must match the input's `name`, so `fieldErrors` keys line up. */
	name: string;
	label: string;
	/** The message from `FormState.fieldErrors[name]`, when there is one. */
	error?: string;
	hint?: string;
	children: ReactNode;
}

/**
 * Label + control + error message. No hooks, so it stays a Server Component and
 * works inside both server-rendered forms and client ones.
 *
 * The caller owns the input and must give it `id={name}` plus
 * `aria-invalid={Boolean(error)}`, and may point `aria-describedby` at the
 * rendered `${name}-error` / `${name}-hint` ids. Wiring the control from here
 * would mean cloning children, which breaks the moment a field holds a radio
 * group or a paired input.
 */
export function Field({ name, label, error, hint, children }: FieldProps) {
	return (
		<div className={styles.field}>
			<label className={styles.label} htmlFor={name}>
				{label}
			</label>
			{children}
			{hint && !error && (
				<span className={styles.hint} id={`${name}-hint`}>
					{hint}
				</span>
			)}
			{error && (
				<span className={styles.error} id={`${name}-error`} role="alert">
					{error}
				</span>
			)}
		</div>
	);
}
