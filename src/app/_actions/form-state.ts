import type { ActionResult } from "@/database/result";

/**
 * The bridge between the data layer's `ActionResult<T>` and `useActionState`.
 *
 * This module is deliberately *not* `"use server"` — it exports a type and two
 * sync helpers, which a server-action module may not do. The adapters in this
 * folder carry the directive; this holds the shared shape they all return.
 *
 * No validation happens here. `fieldErrors` already arrives complete from the
 * actions (every invalid field at once, by design), so this is purely a shape
 * translation.
 */
export interface FormState {
	status: "idle" | "ok" | "error";
	/** The action's top-level message, shown above the form. */
	error?: string;
	/** Per-field messages, keyed by input `name`. */
	fieldErrors?: Record<string, string>;
	/**
	 * What the user submitted, echoed back so a rejected form re-renders with
	 * their input intact instead of blanking out.
	 */
	values?: Record<string, string>;
}

export const IDLE_FORM_STATE: FormState = { status: "idle" };

/** Collects the text entries of a submission, for the `values` echo. */
export function formValues(formData: FormData): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [key, value] of formData.entries()) {
		if (typeof value === "string") {
			values[key] = value;
		}
	}
	return values;
}

export function fromResult<T>(
	result: ActionResult<T>,
	submitted?: Record<string, string>,
): FormState {
	if (result.ok) {
		// Nothing echoed back on success: the form should reset.
		return { status: "ok" };
	}
	return {
		status: "error",
		error: result.error,
		fieldErrors: result.fieldErrors,
		values: submitted,
	};
}
