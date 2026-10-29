import type { MonthSummary } from "@/lib/rollup";
import { Money } from "./Money";
import styles from "./SummaryCards.module.css";

/**
 * The month at a glance. Each card leads with the **real** figure — the share
 * genuinely owed — and carries `total` underneath, which is what actually left
 * the account. On the split internet bill those differ by half, and the pair is
 * the whole point of this app.
 */
export function SummaryCards({ summary }: { summary: MonthSummary }) {
	return (
		<div className={styles.grid}>
			<div className={styles.card}>
				<span className={styles.label}>Despesas</span>
				<span className={styles.value}>
					<Money
						secondary={summary.expenses.total}
						value={summary.expenses.real}
					/>
				</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Receitas</span>
				<span className={styles.value}>
					<Money secondary={summary.income.total} value={summary.income.real} />
				</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Resultado</span>
				<span className={styles.value}>
					<Money
						secondary={summary.net.total}
						tone="signed"
						value={summary.net.real}
					/>
				</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Lançamentos</span>
				<span className={styles.value}>{summary.count}</span>
				<span className={styles.count}>no período filtrado</span>
			</div>
		</div>
	);
}
