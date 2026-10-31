import type { FormAction } from "@/app/_actions/form-state";
import type { BudgetRow, BudgetSection } from "@/lib/rollup";
import { BudgetRowForm } from "./BudgetRowForm";
import styles from "./BudgetTable.module.css";
import { Money } from "./Money";

interface BudgetTableProps {
	section: BudgetSection;
	month: string;
	setAction: FormAction;
	/** "Por saldo" / "Por categoria". */
	title: string;
	/** Column header for the first column: "Saldo" / "Categoria". */
	targetLabel: string;
	/** Gendered: "arquivado" for a saldo, "arquivada" for a categoria. */
	archivedLabel: string;
	emptyMessage: string;
}

const COLUMN_COUNT = 5;
const PERCENT = 100;

const STATUS_CLASS: Record<BudgetRow["status"], string> = {
	ok: styles.ok,
	warning: styles.warning,
	over: styles.over,
	unplanned: styles.unplanned,
};

/** Only a planned row has a consumption share to show. */
function Consumption({ row }: { row: BudgetRow }) {
	if (row.planned === null) {
		return <span className={styles.noPlan}>—</span>;
	}
	const percent = Math.round(row.ratio * PERCENT);
	return (
		<span className={styles.bar}>
			<span aria-hidden="true" className={styles.barTrack}>
				<span
					className={`${styles.barFill} ${STATUS_CLASS[row.status]}`}
					style={{ width: `${percent}%` }}
				/>
			</span>
			<span className={styles.barLabel}>
				{row.status === "over" ? "acima do planejado" : `${percent}%`}
			</span>
		</span>
	);
}

/**
 * One month's plan for one dimension. Rendered twice on `/budget` — once over
 * the saldos, once over the categories — because saldo and category are
 * independent tags, so neither nests inside the other and there is no tree to
 * draw.
 *
 * The two tables sum the **same** transactions along different axes. Their
 * totals are therefore both correct and not expected to agree with each other,
 * which is why each section footers its own.
 */
export function BudgetTable({
	section,
	month,
	setAction,
	title,
	targetLabel,
	archivedLabel,
	emptyMessage,
}: BudgetTableProps) {
	return (
		<section className={styles.section}>
			<h2 className={styles.title}>{title}</h2>
			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th scope="col">{targetLabel}</th>
							<th scope="col">Planejado</th>
							<th className={styles.numeric} scope="col">
								Gasto
							</th>
							<th className={styles.numeric} scope="col">
								Restante
							</th>
							<th scope="col">Consumo</th>
						</tr>
					</thead>
					<tbody>
						{section.rows.length === 0 ? (
							<tr>
								<td className={styles.empty} colSpan={COLUMN_COUNT}>
									{emptyMessage}
								</td>
							</tr>
						) : (
							section.rows.map((row) => (
								<tr key={row.targetId || row.name}>
									<td className={styles.target}>
										{row.name}
										{row.archived && (
											<span className={styles.archivedHint}>
												{" "}
												({archivedLabel})
											</span>
										)}
										{/* Truthiness, not `!== ""`: a document that missed the
										    backfill reads `undefined`, and must not print it. */}
										{row.description && (
											<span className={styles.targetDescription}>
												{row.description}
											</span>
										)}
									</td>
									<td>
										{row.targetId === "" ? (
											<span className={styles.noPlan}>—</span>
										) : (
											<BudgetRowForm
												action={setAction}
												budgetId={row.budgetId ?? ""}
												month={month}
												planned={row.planned}
												scope={section.scope}
												targetId={row.targetId}
												targetName={row.name}
											/>
										)}
									</td>
									<td className={styles.numeric}>
										<Money secondary={row.spent.total} value={row.spent.real} />
									</td>
									<td className={styles.numeric}>
										{row.remaining === null ? (
											<span className={styles.noPlan}>—</span>
										) : (
											<Money tone="signed" value={row.remaining} />
										)}
									</td>
									<td>
										<Consumption row={row} />
									</td>
								</tr>
							))
						)}
					</tbody>
					{section.rows.length > 0 && (
						<tfoot>
							<tr>
								<th scope="row">Total</th>
								<td className={styles.footTotal}>
									<Money value={section.planned} />
								</td>
								<td className={styles.numeric}>
									<Money
										secondary={section.spent.total}
										value={section.spent.real}
									/>
								</td>
								{/* Summed over the planned rows only — see `BudgetSection.remaining`. */}
								<td className={styles.numeric}>
									<Money tone="signed" value={section.remaining} />
								</td>
								<td />
							</tr>
						</tfoot>
					)}
				</table>
			</div>
		</section>
	);
}
