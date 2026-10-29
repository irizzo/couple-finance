/**
 * Display strings for the entity managers.
 *
 * Passed in rather than derived from the entity name: Portuguese articles and
 * participles agree in gender ("Nome **da** conta" / "Nome **do** saldo",
 * "arquivad**a**" / "arquivad**o**"), and inferring that from a noun inside the
 * component would mean sniffing strings to guess grammar.
 */
export interface EntityLabels {
	/** Create-form label and row `aria-label`: "Nome da conta". */
	name: string;
	/** Example value for the name input: "Conta corrente". */
	placeholder: string;
	/** Shown when nothing exists yet: "Nenhuma conta cadastrada ainda." */
	empty: string;
	/** Badge on an archived row: "arquivada" / "arquivado". */
	archivedTag: string;
	/**
	 * Confirmation asked before archiving, with `{name}` as the placeholder for
	 * the entity's name.
	 *
	 * A template string rather than a `(name) => string` builder because these
	 * labels are defined in Server Components and handed to Client Components:
	 * only serializable values cross that boundary, and a plain function does
	 * not.
	 */
	archiveConfirm: string;
}

/** Substitutes the entity name into an `archiveConfirm` template. */
export function archiveConfirmFor(labels: EntityLabels, name: string): string {
	return labels.archiveConfirm.replaceAll("{name}", name);
}
