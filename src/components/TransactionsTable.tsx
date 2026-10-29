import { formatDayMonth } from "@/lib/month";
import {
	type Account,
	type Category,
	type Saldo,
	type Transaction,
	TransactionType,
} from "@/types";
import { Money } from "./Money";
import styles from "./TransactionsTable.module.css";

interface TransactionsTableProps {
	transactions: Transaction[];
	/** Keyed by id, built with `indexById`. Loaded with archived included, so a
	 * transaction whose account was archived still resolves to a name. */
	accounts: Map<string, Account>;
	saldos: Map<string, Saldo>;
	categories: Map<string, Category>;
	emptyMessage: string;
}

interface NameCellProps {
	entity: { name: string; archived: boolean } | undefined;
	/** Gendered in Portuguese: "arquivada" for conta/categoria, "arquivado" for saldo. */
	archivedLabel: string;
}

/**
 * Resolves an id to a name. A miss is flagged rather than blanked: accounts,
 * saldos and categories are soft-deleted, so an unresolvable id means the
 * document was removed outside the app and the transaction now points nowhere.
 */
function NameCell({ entity, archivedLabel }: NameCellProps) {
	if (!entity) {
		return <span className={styles.missing}>(removido)</span>;
	}
	return (
		<>
			{entity.name}
			{entity.archived && (
				<span className={styles.archivedHint}> ({archivedLabel})</span>
			)}
		</>
	);
}

export function TransactionsTable({
	transactions,
	accounts,
	saldos,
	categories,
	emptyMessage,
}: TransactionsTableProps) {
	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">Data</th>
						<th scope="col">Descrição</th>
						<th scope="col">Conta</th>
						<th scope="col">Saldo</th>
						<th scope="col">Categoria</th>
						<th scope="col">Tipo</th>
						<th className={styles.numeric} scope="col">
							Total
						</th>
						<th className={styles.numeric} scope="col">
							Real
						</th>
					</tr>
				</thead>
				<tbody>
					{transactions.length === 0 ? (
						<tr>
							<td className={styles.empty} colSpan={8}>
								{emptyMessage}
							</td>
						</tr>
					) : (
						transactions.map((txn) => {
							const expense = txn.type === TransactionType.EXPENSE;
							return (
								<tr key={txn.id}>
									<td className={styles.date}>{formatDayMonth(txn.date)}</td>
									<td className={styles.description}>{txn.description}</td>
									<td className={styles.tag}>
										<NameCell
											archivedLabel="arquivada"
											entity={accounts.get(txn.accountId)}
										/>
									</td>
									<td className={styles.tag}>
										<NameCell
											archivedLabel="arquivado"
											entity={saldos.get(txn.saldoId)}
										/>
									</td>
									<td className={styles.tag}>
										<NameCell
											archivedLabel="arquivada"
											entity={categories.get(txn.categoryId)}
										/>
									</td>
									<td>
										<span
											className={`${styles.badge} ${
												expense ? styles.expense : styles.income
											}`}
										>
											{expense ? "Despesa" : "Receita"}
										</span>
									</td>
									<td className={styles.numeric}>
										<Money value={txn.totalAmount} />
									</td>
									<td className={styles.numeric}>
										<Money value={txn.realAmount} />
									</td>
								</tr>
							);
						})
					)}
				</tbody>
			</table>
		</div>
	);
}
