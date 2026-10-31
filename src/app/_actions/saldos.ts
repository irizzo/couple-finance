"use server";

import { revalidatePath } from "next/cache";
import {
	archiveSaldo,
	createSaldo,
	unarchiveSaldo,
	updateSaldo,
} from "@/database/saldos.actions";
import { parseAmount } from "@/lib/money";
import {
	type FormState,
	formValues,
	fromResult,
	textField,
} from "./form-state";

/**
 * Form adapters for saldos. Structurally identical to the accounts adapters,
 * because Account and Saldo are structurally identical entities — the shared
 * logic they both delegate to already lives in `createBalanceEntity` /
 * `updateBalanceEntity`.
 */

const PATH = "/settings/saldos";

export async function createSaldoForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const result = await createSaldo({
		name: textField(formData, "name"),
		description: textField(formData, "description"),
		initialAmount: parseAmount(formData.get("initialAmount")),
	});
	if (result.ok) {
		revalidatePath(PATH);
	}
	return fromResult(result, formValues(formData));
}

export async function updateSaldoForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const result = await updateSaldo(textField(formData, "id"), {
		name: textField(formData, "name"),
		// The row always submits the input, so `""` here means "cleared".
		description: textField(formData, "description"),
		initialAmount: parseAmount(formData.get("initialAmount")),
	});
	if (result.ok) {
		revalidatePath(PATH);
	}
	return fromResult(result, formValues(formData));
}

export async function archiveSaldoForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const result = await archiveSaldo(textField(formData, "id"));
	if (result.ok) {
		revalidatePath(PATH);
	}
	return fromResult(result);
}

export async function unarchiveSaldoForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const result = await unarchiveSaldo(textField(formData, "id"));
	if (result.ok) {
		revalidatePath(PATH);
	}
	return fromResult(result);
}
