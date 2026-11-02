import styles from "./SaldoModeField.module.css";

interface SaldoModeFieldProps {
	/** Which card starts checked. */
	useSaldos: boolean;
	error?: string;
}

/**
 * "Contas e saldos" or "Só contas", as two radio cards named `useSaldos` with
 * the values `"true"` and `"false"`. Shared by sign-up and Perfil. No hooks, so
 * it renders inside either client form.
 */
export function SaldoModeField({ useSaldos, error }: SaldoModeFieldProps) {
	return (
		<fieldset className={styles.modes}>
			<legend className={styles.legend}>Como organizar as finanças</legend>
			<label className={styles.mode} htmlFor="useSaldos">
				<input
					defaultChecked={useSaldos}
					id="useSaldos"
					name="useSaldos"
					type="radio"
					value="true"
				/>
				<span className={styles.modeText}>
					<strong>Contas e saldos</strong>
					<span className={styles.modeHint}>
						Cada lançamento sai de uma conta e de um saldo, como “Essenciais” ou
						“Lazer”.
					</span>
				</span>
			</label>
			<label className={styles.mode} htmlFor="useSaldos-accounts">
				<input
					defaultChecked={!useSaldos}
					id="useSaldos-accounts"
					name="useSaldos"
					type="radio"
					value="false"
				/>
				<span className={styles.modeText}>
					<strong>Só contas</strong>
					<span className={styles.modeHint}>
						Cada lançamento sai só de uma conta.
					</span>
				</span>
			</label>
			{error && (
				<span className={styles.error} role="alert">
					{error}
				</span>
			)}
		</fieldset>
	);
}
