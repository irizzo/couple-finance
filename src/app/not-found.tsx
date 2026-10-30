import Link from "next/link";
import styles from "./pages.module.css";

/**
 * The 404 for an unmatched URL — a hand-edited path, or a stale bookmark.
 *
 * A *missing record* does not come here: the actions return
 * `{ok: false, error}` rather than throwing, and each page renders that message
 * itself, because "this transaction was deleted" and "this route does not
 * exist" are different things to be told.
 */
export default function NotFound() {
	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Página não encontrada</h1>
			</div>
			<p className={styles.lead}>
				Esse endereço não existe.{" "}
				<Link href="/transactions">Voltar ao extrato</Link>.
			</p>
		</div>
	);
}
