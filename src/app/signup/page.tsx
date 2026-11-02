import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpForm } from "@/app/_actions/auth";
import { getSessionUser, signUpAvailable } from "@/app/_actions/session";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SignUpForm } from "@/components/SignUpForm";
import styles from "../pages.module.css";

export const metadata: Metadata = {
	title: "Criar conta · Couple Finance",
};

/**
 * The other page the proxy lets through without a session. The app is for
 * exactly two people: the form is offered only while `SIGNUP_CODE` is set and
 * fewer than two users exist, and `signUpForm` checks both again on submit.
 */
export default async function SignUpPage() {
	if (await getSessionUser()) {
		redirect("/");
	}
	const available = await signUpAvailable();

	let body: React.ReactNode;
	if (!available.ok) {
		body = <ErrorBanner>{available.error}</ErrorBanner>;
	} else if (available.data) {
		body = (
			<>
				<p className={styles.lead}>
					O app é para duas pessoas. Quem criar a segunda conta fica ligado a
					quem criou a primeira, e o cadastro então se fecha.
				</p>
				<SignUpForm action={signUpForm} />
			</>
		);
	} else {
		body = (
			<p className={styles.lead}>
				O cadastro está fechado: as duas contas já existem, ou o cadastro não
				foi aberto neste servidor.
			</p>
		);
	}

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Criar conta</h1>
			</div>
			{body}
			<p className={styles.lead}>
				Já tem conta? <Link href="/login">Entrar</Link>
			</p>
		</div>
	);
}
