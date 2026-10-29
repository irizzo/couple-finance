import styles from "./Placeholder.module.css";

interface PlaceholderProps {
	/** Which PLAN.md phase fills this in. */
	phase: string;
	children: React.ReactNode;
}

/**
 * Marks a route that exists so navigation resolves, but whose content lands in a
 * later phase. Temporary scaffolding — every use of this is deleted by the
 * phase named in `phase`.
 */
export function Placeholder({ phase, children }: PlaceholderProps) {
	return (
		<div className={styles.placeholder}>
			<span className={styles.phase}>{phase}</span>
			<p>{children}</p>
		</div>
	);
}
