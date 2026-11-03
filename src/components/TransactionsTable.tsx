import type { FormAction } from "@/app/_actions/form-state";
import { formatDayMonth } from "@/lib/month";
import {
	type Account,
	type Category,
	type Saldo,
	type Transaction,
	TransactionType,
} from "@/types";
import { Money } from "./Money";
import { TransactionRowActions } from "./TransactionRowActions";
import styles from "./TransactionsTable.module.css";

/** Every column but Saldo, which `showSaldo` adds. */
const BASE_COLUMN_COUNT = 8;

interface TransactionsTableProps {
	transactions: Transaction[];
	/** Keyed by id, built with `indexById`. Loaded with archived included, so a
	 * transaction whose account was archived still resolves to a name. */
	accounts: Map<string, Account>;
	saldos: Map<string, Saldo>;
	categories: Map<string, Category>;
	/** The user's saldo mode: off, the Saldo column is not rendered. */
	showSaldo: boolean;
	emptyMessage: string;
	/** Passed down rather than imported here: a Server Action is serializable
	 * across the boundary, and this table stays a Server Component. */
	deleteAction: FormAction;
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

interface EndsCellProps {
	lookup: Map<string, NonNullable<NameCellProps["entity"]>>;
	/** `undefined` for a saldo the transaction does not have. */
	from: string | undefined;
	/** A transfer's destination; `undefined` for anything else. */
	to: string | undefined;
	archivedLabel: string;
}

/**
 * A transfer names both of its ends. An end it keeps — the same account, moving
 * between saldos — is named once: "Nubank → Nubank" says nothing more.
 *
 * A transaction recorded with saldos off has no saldo, which is a dash: unlike
 * an id that no longer resolves, nothing is missing.
 */
function EndsCell({ lookup, from, to, archivedLabel }: EndsCellProps) {
	if (from === undefined && to === undefined) {
		return <span className={styles.none}>—</span>;
	}
	const name = (id: string | undefined) =>
		id === undefined ? (
			<span className={styles.none}>—</span>
		) : (
			<NameCell archivedLabel={archivedLabel} entity={lookup.get(id)} />
		);
	return (
		<>
			{name(from)}
			{to !== undefined && to !== from && (
				<>
					<span> → </span>
					{name(to)}
				</>
			)}
		</>
	);
}

const TYPE_BADGES: Record<TransactionType, { label: string; tone: string }> = {
	[TransactionType.EXPENSE]: { label: "Despesa", tone: styles.expense },
	[TransactionType.INCOME]: { label: "Receita", tone: styles.income },
	[TransactionType.TRANSFER]: { label: "Transferência", tone: styles.transfer },
};

export function TransactionsTable({
	transactions,
	accounts,
	saldos,
	categories,
	showSaldo,
	emptyMessage,
	deleteAction,
}: TransactionsTableProps) {
	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">Data</th>
						<th scope="col">Descrição</th>
						<th scope="col">Conta</th>
						{showSaldo && <th scope="col">Saldo</th>}
						<th scope="col">Categoria</th>
						<th scope="col">Tipo</th>
						<th className={styles.numeric} scope="col">
							Total
						</th>
						<th className={styles.numeric} scope="col">
							Real
						</th>
						<th className={styles.actionsCell} scope="col">
							Ações
						</th>
					</tr>
				</thead>
				<tbody>
					{transactions.length === 0 ? (
						<tr>
							<td
								className={styles.empty}
								colSpan={showSaldo ? BASE_COLUMN_COUNT + 1 : BASE_COLUMN_COUNT}
							>
								{emptyMessage}
							</td>
						</tr>
					) : (
						transactions.map((txn) => {
							const transfer = txn.type === TransactionType.TRANSFER;
							// Falls back to "Despesa" for a type this build doesn't know,
							// which is what the form preselects for one too.
							const badge =
								TYPE_BADGES[txn.type] ?? TYPE_BADGES[TransactionType.EXPENSE];
							return (
								<tr
									key={txn.id}
									className={
										txn.type === TransactionType.INCOME ||
										txn.realAmount === txn.totalAmount
											? ""
											: styles.splitTransaction
									}
								>
									<td className={styles.date}>{formatDayMonth(txn.date)}</td>
									<td className={styles.description}>
										{txn.description}
										{txn.shared && (
											<span className={styles.sharedTag}>Compartilhada</span>
										)}
									</td>
									<td className={styles.tag}>
										<EndsCell
											archivedLabel="arquivada"
											from={txn.accountId}
											lookup={accounts}
											to={transfer ? txn.toAccountId : undefined}
										/>
									</td>
									{showSaldo && (
										<td className={styles.tag}>
											<EndsCell
												archivedLabel="arquivado"
												from={txn.saldoId}
												lookup={saldos}
												to={transfer ? txn.toSaldoId : undefined}
											/>
										</td>
									)}
									<td className={styles.tag}>
										<NameCell
											archivedLabel="arquivada"
											entity={categories.get(txn.categoryId)}
										/>
									</td>
									<td>
										<span className={`${styles.badge} ${badge.tone}`}>
											{badge.label}
										</span>
									</td>
									<td className={styles.numeric}>
										<Money value={txn.totalAmount} />
									</td>
									<td className={styles.numeric}>
										<Money value={txn.realAmount} />
									</td>
									<td className={styles.actionsCell}>
										<TransactionRowActions
											deleteAction={deleteAction}
											description={txn.description}
											id={txn.id}
										/>
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
