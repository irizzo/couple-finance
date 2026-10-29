"use client";

import { useFormStatus } from "react-dom";
import styles from "./controls.module.css";

interface SubmitButtonProps {
	children: React.ReactNode;
	/** Label swapped in while the action is in flight. */
	pendingLabel?: string;
	variant?: "primary" | "plain";
	compact?: boolean;
}

/**
 * Submit button that disables itself while its form is pending.
 *
 * `useFormStatus` reads the state of the *enclosing* form, which is why this is
 * a separate client component rather than markup inside each form: the hook only
 * reports pending state from a child of the `<form>`, never from the component
 * that renders the form itself.
 */
export function SubmitButton({
	children,
	pendingLabel,
	variant = "primary",
	compact = false,
}: SubmitButtonProps) {
	const { pending } = useFormStatus();

	const className = [
		styles.button,
		variant === "primary" ? styles.primary : "",
		compact ? styles.compact : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button className={className} disabled={pending} type="submit">
			{pending && pendingLabel ? pendingLabel : children}
		</button>
	);
}
