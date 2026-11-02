"use server";

import { revalidatePath } from "next/cache";
import {
	archiveCategory,
	createCategory,
	unarchiveCategory,
	updateCategory,
} from "@/database/categories.actions";
import {
	type FormState,
	formValues,
	fromResult,
	textField,
} from "./form-state";
import { requireUser } from "./session";

/**
 * Form adapters for categories. Name and description only — a category carries
 * no balances, and since Phase 1 no `saldoId` either. Every write revalidates
 * the whole layout, for the reason given in `accounts.ts`.
 */

export async function createCategoryForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireUser();
	const result = await createCategory({
		name: textField(formData, "name"),
		description: textField(formData, "description"),
	});
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result, formValues(formData));
}

export async function updateCategoryForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireUser();
	const result = await updateCategory(textField(formData, "id"), {
		name: textField(formData, "name"),
		// The row always submits the input, so `""` here means "cleared".
		description: textField(formData, "description"),
	});
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result, formValues(formData));
}

export async function archiveCategoryForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireUser();
	const result = await archiveCategory(textField(formData, "id"));
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result);
}

export async function unarchiveCategoryForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	await requireUser();
	const result = await unarchiveCategory(textField(formData, "id"));
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result);
}
