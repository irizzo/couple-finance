import "server-only";

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
	Owner,
	UpdateCategoryInput,
} from "@/types";

const COLLECTION = COLLECTIONS.categories;
const LABEL = "Category";

export async function createCategory(
	owner: Owner,
	input: CreateCategoryInput,
): Promise<ActionResult<Category>> {
	return createNamedEntity<Category>(owner, COLLECTION, input, LABEL);
}

export async function getCategory(
	owner: Owner,
	id: string,
): Promise<ActionResult<Category>> {
	return getEntity<Category>(owner, COLLECTION, id, LABEL);
}

export async function listCategories(
	owner: Owner,
	options: ListOptions = {},
): Promise<ActionResult<Category[]>> {
	return listEntities<Category>(owner, COLLECTION, LABEL, options);
}

export async function updateCategory(
	owner: Owner,
	id: string,
	input: UpdateCategoryInput,
): Promise<ActionResult<Category>> {
	return updateNamedEntity<Category>(owner, COLLECTION, id, input, LABEL);
}

/** Categories are never hard-deleted: past transactions still reference them. */
export async function archiveCategory(
	owner: Owner,
	id: string,
): Promise<ActionResult<Category>> {
	return setArchived<Category>(owner, COLLECTION, id, true, LABEL);
}

export async function unarchiveCategory(
	owner: Owner,
	id: string,
): Promise<ActionResult<Category>> {
	return setArchived<Category>(owner, COLLECTION, id, false, LABEL);
}
