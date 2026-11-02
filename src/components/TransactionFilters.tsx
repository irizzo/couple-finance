import Link from "next/link";
import type { Account, Category, Saldo } from "@/types";
import controls from "./controls.module.css";
import styles from "./TransactionFilters.module.css";

interface TransactionFiltersProps {
	month: string;
	accounts: Account[];
	saldos: Saldo[];
	categories: Category[];
	/** The user's saldo mode: off, there is no saldo filter. */
	showSaldo: boolean;
	selected: TransactionFilterValues;
}

export interface TransactionFilterValues {
	accountId?: string;
	saldoId?: string;
	categoryId?: string;
}

/**
 * Account / saldo / category filters, as a plain `GET` form.
 *
 * No JavaScript and no client state: submitting writes the values into the query
 * string, the page re-reads them server-side, and `listTransactions` applies
 * them. `month` rides along in a hidden field so filtering never silently jumps
 * you to a different month.
 *
 * The three selects are independent — since Phase 1 a category does not belong
 * to a saldo, so picking one never constrains the others.
 */
export function TransactionFilters({
	month,
	accounts,
	saldos,
	categories,
	showSaldo,
	selected,
}: TransactionFiltersProps) {
	const active = Boolean(
		selected.accountId || selected.saldoId || selected.categoryId,
	);

	return (
		<form action="/transactions" className={styles.filters} method="GET">
			<input name="month" type="hidden" value={month} />

			<div className={styles.field}>
				<label className={styles.label} htmlFor="accountId">
					Conta
				</label>
				<select
					defaultValue={selected.accountId ?? ""}
					id="accountId"
					name="accountId"
				>
					<option value="">Todas</option>
					{accounts.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
							{account.archived ? " (arquivada)" : ""}
						</option>
					))}
				</select>
			</div>

			{showSaldo && (
				<div className={styles.field}>
					<label className={styles.label} htmlFor="saldoId">
						Saldo
					</label>
					<select
						defaultValue={selected.saldoId ?? ""}
						id="saldoId"
						name="saldoId"
					>
						<option value="">Todos</option>
						{saldos.map((saldo) => (
							<option key={saldo.id} value={saldo.id}>
								{saldo.name}
								{saldo.archived ? " (arquivado)" : ""}
							</option>
						))}
					</select>
				</div>
			)}

			<div className={styles.field}>
				<label className={styles.label} htmlFor="categoryId">
					Categoria
				</label>
				<select
					defaultValue={selected.categoryId ?? ""}
					id="categoryId"
					name="categoryId"
				>
					<option value="">Todas</option>
					{categories.map((category) => (
						<option key={category.id} value={category.id}>
							{category.name}
							{category.archived ? " (arquivada)" : ""}
						</option>
					))}
				</select>
			</div>

			<div className={styles.actions}>
				<button className={controls.button} type="submit">
					Filtrar
				</button>
				{active && (
					<Link className={styles.clear} href={`/transactions?month=${month}`}>
						Limpar
					</Link>
				)}
			</div>
		</form>
	);
}
