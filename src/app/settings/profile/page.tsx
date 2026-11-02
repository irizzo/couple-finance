import { changePasswordForm, updateProfileForm } from "@/app/_actions/profile";
import { requireUser } from "@/app/_actions/session";
import { PasswordForm } from "@/components/PasswordForm";
import { ProfileForm } from "@/components/ProfileForm";
import styles from "../../pages.module.css";

export default async function ProfilePage() {
	const user = await requireUser();

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Perfil</h1>
			</div>
			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Seus dados</h2>
				<ProfileForm
					action={updateProfileForm}
					name={user.name}
					useSaldos={user.useSaldos}
					username={user.username}
				/>
			</section>
			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Senha</h2>
				<p className={styles.lead}>
					Trocar a senha encerra as outras sessões: em qualquer outro aparelho
					será preciso entrar de novo, com a senha nova.
				</p>
				<PasswordForm action={changePasswordForm} />
			</section>
		</div>
	);
}
