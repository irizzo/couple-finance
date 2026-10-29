import type { SelectOption } from "./TransactionForm";

interface NamedArchivable {
	id: string;
	name: string;
	archived: boolean;
}

/**
 * Builds the `<select>` options for the transaction form.
 *
 * `archivedSuffix` is supplied by the caller because it agrees in gender —
 * "(arquivada)" for a conta or categoria, "(arquivado)" for a saldo. The edit
 * route passes archived entities through on purpose: a transaction stays
 * editable after its account has been archived, and an active-only list would
 * silently drop the value it currently holds.
 */
export function toOptions(
	entities: NamedArchivable[],
	archivedSuffix: string,
): SelectOption[] {
	return entities.map((entity) => ({
		id: entity.id,
		label: entity.archived ? `${entity.name} ${archivedSuffix}` : entity.name,
	}));
}
