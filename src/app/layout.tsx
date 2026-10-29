import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLink } from "@/components/NavLink";
import "./globals.css";
import styles from "./layout.module.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Couple Finance",
	description:
		"Organizador de finanças com despesas divididas: valor total pago e valor real devido.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			className={`${geistSans.variable} ${geistMono.variable}`}
			lang="pt-BR"
		>
			<body>
				<div className={styles.shell}>
					<header className={styles.header}>
						<div className={styles.headerInner}>
							<span className={styles.brand}>Couple Finance</span>
							<nav aria-label="Seções" className={styles.nav}>
								<NavLink href="/transactions">Transações</NavLink>
								<NavLink href="/budget">Orçamento</NavLink>
								<NavLink href="/settings">Configurações</NavLink>
							</nav>
						</div>
					</header>
					<main className={styles.main}>{children}</main>
				</div>
			</body>
		</html>
	);
}
