import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInForm } from "@/app/_actions/auth";
import { getSessionUser, signUpAvailable } from "@/app/_actions/session";
import { LoginForm } from "@/components/LoginForm";
import styles from "../pages.module.css";

export const metadata: Metadata = {
	title: "Entrar · Couple Finance",
};

/**
 * One of the two pages the proxy lets through without a session. Signed in
 * already — a bookmark, or the back button after signing in — it moves
 * straight on.
 */
export default async function LoginPage() {
	if (await getSessionUser()) {
		redirect("/");
	}
	// Only a hint: a failure here just hides the link, and /signup itself
	// reports it.
	const signUp = await signUpAvailable();

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Entrar</h1>
			</div>
			<LoginForm action={signInForm} />
			{signUp.ok && signUp.data && (
				<p className={styles.lead}>
					Ainda não tem conta? <Link href="/signup">Criar conta</Link>
				</p>
			)}
		</div>
	);
}
