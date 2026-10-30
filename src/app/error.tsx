"use client";

import Link from "next/link";
import controls from "@/components/controls.module.css";
import styles from "./pages.module.css";

/**
 * The last resort. Every *expected* failure is an `ActionResult` the page
 * renders inline, so reaching this boundary means something threw where nothing
 * was supposed to — a render bug, or Firestore failing outside an action.
 *
 * Client Component by requirement: Next needs `reset` to re-render the segment
 * in the browser. In production `error.message` is replaced by a generic string
 * and the real one is logged on the server under `digest`, which is why the
 * digest is shown rather than hidden — it is the only handle on the server log.
 */
// Next only cares that this is the segment's default export, so the component
// is named `RouteError` rather than `Error`, which would shadow the global.
export default function RouteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Algo deu errado</h1>
			</div>
			<p className={styles.errorBanner} role="alert">
				{error.message || "Erro inesperado."}
				{error.digest && ` (${error.digest})`}
			</p>
			<div className={styles.headerActions}>
				<button className={controls.button} onClick={reset} type="button">
					Tentar novamente
				</button>
				<Link href="/transactions">Voltar ao extrato</Link>
			</div>
		</div>
	);
}
