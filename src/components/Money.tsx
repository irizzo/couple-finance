import { formatCurrency } from "@/lib/money";
import styles from "./Money.module.css";

interface MoneyProps {
	value: number;
	/**
	 * `signed` colours by sign — for balances and nets, where negative is
	 * genuinely bad news. `plain` stays foreground-coloured: an expense row is
	 * already labelled an expense, so painting every one of them red just makes
	 * the whole ledger red.
	 */
	tone?: "signed" | "plain" | "muted";
	/** A second figure rendered beneath — used for `totalAmount` under `realAmount`. */
	secondary?: number;
	secondaryPrefix?: string;
}

function toneClassFor(tone: MoneyProps["tone"], value: number): string {
	if (tone === "muted") {
		return styles.muted;
	}
	if (tone !== "signed" || value === 0) {
		return "";
	}
	return value > 0 ? styles.positive : styles.negative;
}

export function Money({
	value,
	tone = "plain",
	secondary,
	secondaryPrefix = "total ",
}: MoneyProps) {
	const toneClass = toneClassFor(tone, value);

	return (
		<span className={`${styles.money} ${toneClass}`.trim()}>
			{formatCurrency(value)}
			{secondary !== undefined && (
				<span className={styles.secondary}>
					{secondaryPrefix}
					{formatCurrency(secondary)}
				</span>
			)}
		</span>
	);
}
