"use server";

import { COLLECTIONS, withId } from "@/database/collections";
import {
	getEntity,
	listEntities,
	notFound,
	ref,
	setArchived,
} from "@/database/entities";
import { type ActionResult, fail, failFrom, ok } from "@/database/result";
import { collect, nonEmptyString } from "@/database/validators";
import type {
	Category,
	CreateCategoryInput,
	ListOptions,
	Saldo,
	UpdateCategoryInput,
} from "@/types";

const COLLECTION = COLLECTIONS.categories;
const LABEL = "Category";

/**
 * Categories live under a saldo ("Essentials" > "Housing"), so the parent has to
 * exist and be active before anything points at it.
 */
async function assertActiveSaldo(saldoId: string): Promise<string | null> {
	const snap = await ref(COLLECTIONS.saldos).doc(saldoId).get();
	if (!snap.exists) {
		return `Saldo "${saldoId}" was not found`;
	}
	if (withId<Saldo>(snap).archived) {
		return `Saldo "${saldoId}" is archived`;
	}
	return null;
}

export async function createCategory(
	input: CreateCategoryInput,
): Promise<ActionResult<Category>> {
	const fieldErrors = collect({
		name: nonEmptyString(input?.name),
		saldoId: nonEmptyString(input?.saldoId),
	});
	if (fieldErrors) {
		return fail<Category>("Invalid category", fieldErrors);
	}

	try {
		const saldoError = await assertActiveSaldo(input.saldoId);
		if (saldoError) {
			return fail<Category>(saldoError);
		}

		const docRef = ref(COLLECTION).doc();
		const data = {
			name: input.name.trim(),
			saldoId: input.saldoId,
			archived: false,
		};
		await docRef.set(data);
		return ok({ id: docRef.id, ...data });
	} catch (cause) {
		return failFrom<Category>("Could not create the category", cause);
	}
}

export async function getCategory(id: string): Promise<ActionResult<Category>> {
	return getEntity<Category>(COLLECTION, id, LABEL);
}

export async function listCategories(
	options: ListOptions = {},
): Promise<ActionResult<Category[]>> {
	return listEntities<Category>(COLLECTION, LABEL, options);
}

/** Powers the budget-by-saldo rollup: every category under one bucket. */
export async function listCategoriesBySaldo(
	saldoId: string,
	options: ListOptions = {},
): Promise<ActionResult<Category[]>> {
	const result = await listEntities<Category>(COLLECTION, LABEL, options);
	if (!result.ok) {
		return result;
	}
	return ok(result.data.filter((category) => category.saldoId === saldoId));
}

export async function updateCategory(
	id: string,
	input: UpdateCategoryInput,
): Promise<ActionResult<Category>> {
	const fieldErrors = collect({
		...(input?.name !== undefined ? { name: nonEmptyString(input.name) } : {}),
		...(input?.saldoId !== undefined
			? { saldoId: nonEmptyString(input.saldoId) }
			: {}),
	});
	if (fieldErrors) {
		return fail<Category>("Invalid category", fieldErrors);
	}
	if (input?.name === undefined && input?.saldoId === undefined) {
		return fail<Category>("Nothing to update");
	}

	try {
		const docRef = ref(COLLECTION).doc(id);
		const snap = await docRef.get();
		if (!snap.exists) {
			return notFound<Category>(LABEL, id);
		}

		const patch: Partial<Category> = {};
		if (input.name !== undefined) {
			patch.name = input.name.trim();
		}
		if (input.saldoId !== undefined) {
			const saldoError = await assertActiveSaldo(input.saldoId);
			if (saldoError) {
				return fail<Category>(saldoError);
			}
			patch.saldoId = input.saldoId;
		}

		await docRef.update(patch);
		return ok({ ...withId<Category>(snap), ...patch });
	} catch (cause) {
		return failFrom<Category>("Could not update the category", cause);
	}
}

/** Categories are never hard-deleted: past transactions still reference them. */
export async function archiveCategory(
	id: string,
): Promise<ActionResult<Category>> {
	return setArchived<Category>(COLLECTION, id, true, LABEL);
}

export async function unarchiveCategory(
	id: string,
): Promise<ActionResult<Category>> {
	return setArchived<Category>(COLLECTION, id, false, LABEL);
}
