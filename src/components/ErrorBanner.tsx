import styles from "./ErrorBanner.module.css";

/**
 * Renders a failed `ActionResult.error`. Every page that loads data needs one:
 * the actions return errors rather than throwing, so a page that ignores
 * `!result.ok` renders a confusingly empty screen instead of saying what broke.
 */
export function ErrorBanner({ children }: { children: React.ReactNode }) {
	return (
		<p className={styles.banner} role="alert">
			{children}
		</p>
	);
}
