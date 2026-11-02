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
	/**
	 * Set only when a success is worth reporting — "3 copiados, 1 ignorado". Most
	 * actions say nothing on success, because the re-rendered page already shows
	 * what happened; a bulk action's outcome isn't visible from its own result.
	 */
	message?: string;
}

export const IDLE_FORM_STATE: FormState = { status: "idle" };

/**
 * The shape every adapter in this folder exports, and the only shape
 * `useActionState` accepts. Server actions are serializable across the
 * server/client boundary, so a Server Component can pass one of these straight
 * into a Client Component as a prop.
 */
export type FormAction = (
	previous: FormState,
	formData: FormData,
) => Promise<FormState>;

/**
 * Reads one text field. `FormData.get` returns `File | string | null`, and every
 * field in this app is text — this narrows it in one place so the adapters don't
 * each repeat the check. A missing field becomes `""`, which the data layer's
 * `nonEmptyString` validator then rejects with a proper message.
 */
export function textField(formData: FormData, field: string): string {
	const value = formData.get(field);
	return typeof value === "string" ? value : "";
}

/**
 * Like `textField`, but a field the form did not render at all comes back as
 * `undefined`, not `""`. An update then keeps the stored value: with saldos off
 * the transaction form has no saldo fields, and an edit must not erase the
 * saldo a transaction was recorded with. A rendered but emptied field is still
 * `""`.
 */
export function presentField(
	formData: FormData,
	field: string,
): string | undefined {
	return formData.has(field) ? textField(formData, field) : undefined;
}

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
