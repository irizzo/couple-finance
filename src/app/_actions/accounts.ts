"use server";

import { revalidatePath } from "next/cache";
import {
	archiveAccount,
	createAccount,
	unarchiveAccount,
	updateAccount,
} from "@/database/accounts.actions";
import { parseAmount } from "@/lib/money";
import {
	type FormState,
	formValues,
	fromResult,
	textField,
} from "./form-state";
import { requireSession } from "./session";

/**
 * Form adapters for accounts. The data-layer actions take typed objects; these
 * translate a `FormData` submission into that shape, revalidate, and hand back a
 * `FormState` for `useActionState`.
 *
 * `revalidatePath` lives here rather than in `src/database` so the data layer
 * never learns route names.
 *
 * Every write revalidates `("/", "layout")`, not just `/settings/accounts`: an
 * entity's name, description and archived state are rendered on every screen —
 * the ledger's columns and filters, the transaction form's selects, the budget
 * rows — so a rename or an archive reaches all of them.
 */

export async function createAccountForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireSession();
	const result = await createAccount({
		name: textField(formData, "name"),
		description: textField(formData, "description"),
		initialAmount: parseAmount(formData.get("initialAmount")),
	});
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result, formValues(formData));
}

export async function updateAccountForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireSession();
	const result = await updateAccount(textField(formData, "id"), {
		name: textField(formData, "name"),
		// The row always submits the input, so `""` here means "cleared".
		description: textField(formData, "description"),
		initialAmount: parseAmount(formData.get("initialAmount")),
	});
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result, formValues(formData));
}

/** Accounts are never deleted — transactions keep referencing them. */
export async function archiveAccountForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireSession();
	const result = await archiveAccount(textField(formData, "id"));
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result);
}

export async function unarchiveAccountForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireSession();
	const result = await unarchiveAccount(textField(formData, "id"));
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result);
}
