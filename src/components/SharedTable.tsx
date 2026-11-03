import type { FormAction } from "@/app/_actions/form-state";
import { formatDayMonth } from "@/lib/month";
import type { SharedTransaction } from "@/types";
import { Money } from "./Money";
import { TransactionRowActions } from "./TransactionRowActions";
import styles from "./TransactionsTable.module.css";

const COLUMN_COUNT = 7;

interface SharedTableProps {
	rows: SharedTransaction[];
	viewerId: string;
	partnerName: string;
	emptyMessage: string;
	/** Passed down, as on the ledger, so this table stays a Server Component. */
	deleteAction: FormAction;
	/** Carried on the viewer's Editar and Duplicar links. */
	returnTo: string;
}

/**
 * Both people's shared expenses, in the seven fields of `SharedTransaction`
 * and nothing more: the account, the saldo and the real amount never reach
 * this table. "Compartilhado" leads, the part of whoever did not pay, with the
 * total muted beside it. The viewer's own rows get Editar · Duplicar ·
 * Excluir, which come back here after saving. The partner's rows are
 * read-only, and get none.
 */
export function SharedTable({
	rows,
	viewerId,
	partnerName,
	emptyMessage,
	deleteAction,
	returnTo,
}: SharedTableProps) {
	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">Data</th>
						<th scope="col">Descrição</th>
						<th scope="col">Categoria</th>
						<th scope="col">Pago por</th>
						<th className={styles.numeric} scope="col">
							Compartilhado
						</th>
						<th className={styles.numeric} scope="col">
							Total
						</th>
						<th className={styles.actionsCell} scope="col">
							Ações
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td className={styles.empty} colSpan={COLUMN_COUNT}>
								{emptyMessage}
							</td>
						</tr>
					) : (
						rows.map((row) => {
							const own = row.ownerId === viewerId;
							return (
								<tr key={row.id}>
									<td className={styles.date}>{formatDayMonth(row.date)}</td>
									<td className={styles.description}>{row.description}</td>
									<td className={styles.tag}>{row.categoryName}</td>
									<td className={styles.tag}>{own ? "Você" : partnerName}</td>
									<td className={styles.numeric}>
										<Money value={row.sharedAmount} />
									</td>
									<td className={styles.numeric}>
										<Money tone="muted" value={row.totalAmount} />
									</td>
									<td className={styles.actionsCell}>
										{own && (
											<TransactionRowActions
												deleteAction={deleteAction}
												description={row.description}
												id={row.id}
												returnTo={returnTo}
											/>
										)}
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
