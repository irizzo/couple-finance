import { redirect } from "next/navigation";

/** Contas is the first thing you need, so /settings lands there. */
export default function SettingsPage() {
	redirect("/settings/accounts");
}
