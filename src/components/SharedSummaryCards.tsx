import type { SharedSummary } from "@/lib/shared";
import { Money } from "./Money";
import styles from "./SummaryCards.module.css";

interface SharedSummaryCardsProps {
	summary: SharedSummary;
	viewerId: string;
	partnerName: string;
}

/**
 * The shared month at a glance. Each card leads with the **shared** figure,
 * the part of whoever did not pay, which is what the settlement nets, and
 * carries the total underneath, as the ledger's cards lead with the real
 * figure. These follow the category filter but never the owner filter (see
 * `sharedDashboard`).
 */
export function SharedSummaryCards({
	summary,
	viewerId,
	partnerName,
}: SharedSummaryCardsProps) {
	const { settlement } = summary;

	let settlementText: React.ReactNode = "Tudo certo";
	if (settlement !== null && settlement.debtorId === viewerId) {
		settlementText = (
			<>
				Você deve <Money value={settlement.amount} /> a {partnerName}
			</>
		);
	} else if (settlement !== null) {
		settlementText = (
			<>
				{partnerName} deve <Money value={settlement.amount} /> a você
			</>
		);
	}

	return (
		<div className={styles.grid}>
			<div className={styles.card}>
				<span className={styles.label}>Total compartilhado</span>
				<span className={styles.value}>
					<Money secondary={summary.total.total} value={summary.total.shared} />
				</span>
				<span className={styles.count}>
					{summary.count === 1 ? "1 despesa" : `${summary.count} despesas`}
				</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Pago por você</span>
				<span className={styles.value}>
					<Money
						secondary={summary.paid.viewer.total}
						value={summary.paid.viewer.shared}
					/>
				</span>
				<span className={styles.count}>parte de {partnerName}</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Pago por {partnerName}</span>
				<span className={styles.value}>
					<Money
						secondary={summary.paid.partner.total}
						value={summary.paid.partner.shared}
					/>
				</span>
				<span className={styles.count}>sua parte</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Acerto</span>
				<span className={styles.sentence}>{settlementText}</span>
			</div>
		</div>
	);
}
