import Link from "next/link";
import type { SharedCategoryOption } from "@/lib/shared";
import controls from "./controls.module.css";
import styles from "./TransactionFilters.module.css";

interface SharedFiltersProps {
	month: string;
	viewerId: string;
	partnerId: string;
	partnerName: string;
	/** Both people's categories, merged by `categoryKey`. */
	categories: SharedCategoryOption[];
	selected: { owner?: string; category?: string };
}

/**
 * "Quem pagou" and the merged "Categoria", as a plain `GET` form like
 * `TransactionFilters`: no JavaScript, and `month` rides along in a hidden
 * field so filtering never changes month.
 */
export function SharedFilters({
	month,
	viewerId,
	partnerId,
	partnerName,
	categories,
	selected,
}: SharedFiltersProps) {
	const active = Boolean(selected.owner || selected.category);

	return (
		<form action="/shared" className={styles.filters} method="GET">
			<input name="month" type="hidden" value={month} />

			<div className={styles.field}>
				<label className={styles.label} htmlFor="owner">
					Quem pagou
				</label>
				<select defaultValue={selected.owner ?? ""} id="owner" name="owner">
					<option value="">Ambos</option>
					<option value={viewerId}>Você</option>
					<option value={partnerId}>{partnerName}</option>
				</select>
			</div>

			<div className={styles.field}>
				<label className={styles.label} htmlFor="category">
					Categoria
				</label>
				<select
					defaultValue={selected.category ?? ""}
					id="category"
					name="category"
				>
					<option value="">Todas</option>
					{categories.map((option) => (
						<option key={option.key} value={option.key}>
							{option.label}
						</option>
					))}
				</select>
			</div>

			<div className={styles.actions}>
				<button className={controls.button} type="submit">
					Filtrar
				</button>
				{active && (
					<Link className={styles.clear} href={`/shared?month=${month}`}>
						Limpar
					</Link>
				)}
			</div>
		</form>
	);
}
