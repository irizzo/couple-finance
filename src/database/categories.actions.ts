"use server";

import { COLLECTIONS } from "@/database/collections";
import {
	createNamedEntity,
	getEntity,
	listEntities,
	setArchived,
	updateNamedEntity,
} from "@/database/entities";
import type { ActionResult } from "@/database/result";
import type {
	Category,
	CreateCategoryInput,
	ListOptions,
	UpdateCategoryInput,
} from "@/types";

const COLLECTION = COLLECTIONS.categories;
const LABEL = "Category";

export async function createCategory(
	input: CreateCategoryInput,
): Promise<ActionResult<Category>> {
	return createNamedEntity<Category>(COLLECTION, input, LABEL);
}

export async function getCategory(id: string): Promise<ActionResult<Category>> {
	return getEntity<Category>(COLLECTION, id, LABEL);
}

export async function listCategories(
	options: ListOptions = {},
): Promise<ActionResult<Category[]>> {
	return listEntities<Category>(COLLECTION, LABEL, options);
}

export async function updateCategory(
	id: string,
	input: UpdateCategoryInput,
): Promise<ActionResult<Category>> {
	return updateNamedEntity<Category>(COLLECTION, id, input, LABEL);
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
