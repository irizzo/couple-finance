import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInForm } from "@/app/_actions/auth";
import { hasSession } from "@/app/_actions/session";
import { LoginForm } from "@/components/LoginForm";
import styles from "../pages.module.css";

export const metadata: Metadata = {
	title: "Entrar · Couple Finance",
};

/**
 * The one page the proxy lets through without a session. Signed in already —
 * a bookmark, or the back button after signing in — it moves straight on.
 */
export default async function LoginPage() {
	if (await hasSession()) {
		redirect("/");
	}

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Entrar</h1>
			</div>
			<LoginForm action={signInForm} />
		</div>
	);
}
