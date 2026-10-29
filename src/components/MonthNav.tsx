import Link from "next/link";
import { currentMonth, formatMonthLabel, shiftMonth } from "@/lib/month";
import styles from "./MonthNav.module.css";

interface MonthNavProps {
	month: string;
	/** Route the links point back at, e.g. `/transactions` or `/budget`. */
	basePath: string;
	/**
	 * Any other query parameters to carry across a month change — the Phase 4
	 * filters, for instance. Without this, stepping to the next month would
	 * silently reset whatever the user had narrowed the view to.
	 */
	params?: Record<string, string | undefined>;
}

/**
 * Previous / current / next month navigation.
 *
 * A Server Component on purpose, against the plan's original sketch of a client
 * component driving `useRouter`: these are three ordinary links whose targets
 * are fully known at render time, so plain `<Link>`s give prefetching and
 * working middle-click for free and ship no JavaScript.
 */
export function MonthNav({ month, basePath, params = {} }: MonthNavProps) {
	const href = (target: string) => {
		const query = new URLSearchParams();
		query.set("month", target);
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && key !== "month") {
				query.set(key, value);
			}
		}
		return `${basePath}?${query.toString()}`;
	};

	const now = currentMonth();

	return (
		<nav aria-label="Navegação de mês" className={styles.nav}>
			<Link
				aria-label="Mês anterior"
				className={styles.step}
				href={href(shiftMonth(month, -1))}
			>
				←
			</Link>
			<span className={styles.label}>{formatMonthLabel(month)}</span>
			<Link
				aria-label="Mês seguinte"
				className={styles.step}
				href={href(shiftMonth(month, 1))}
			>
				→
			</Link>
			{month !== now && (
				<Link className={styles.today} href={href(now)}>
					Mês atual
				</Link>
			)}
		</nav>
	);
}
