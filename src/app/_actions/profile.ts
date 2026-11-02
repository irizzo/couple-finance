"use server";

import { revalidatePath } from "next/cache";
import { changePassword, updateProfile } from "@/database/users.actions";
import { type FormState, fromResult, textField } from "./form-state";
import { requireUser, startSession } from "./session";

/**
 * Form adapters for Perfil. Each changes only the signed-in user: the user's id
 * comes from the session, never from the form.
 */

export async function updateProfileForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const user = await requireUser();
	const values = {
		name: textField(formData, "name"),
		useSaldos: textField(formData, "useSaldos"),
	};
	// A value other than the two radios' is an error, not a silent default.
	if (values.useSaldos !== "true" && values.useSaldos !== "false") {
		return {
			status: "error",
			error: "Perfil inválido.",
			fieldErrors: { useSaldos: "Escolha como organizar as finanças." },
			values,
		};
	}

	const result = await updateProfile(user, {
		name: values.name,
		useSaldos: values.useSaldos === "true",
	});
	if (!result.ok) {
		return fromResult(result, values);
	}
	// The name is in the nav, and the saldo mode shapes every screen.
	revalidatePath("/", "layout");
	return { status: "ok", message: "Perfil salvo." };
}

/**
 * Changing the password signs out every other session, through the bumped
 * `sessionVersion`, and re-issues this browser's cookie so this one stays
 * signed in. No password is ever echoed back.
 */
export async function changePasswordForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const user = await requireUser();
	const next = textField(formData, "newPassword");
	if (textField(formData, "confirmPassword") !== next) {
		return {
			status: "error",
			error: "Troca de senha inválida.",
			fieldErrors: { confirmPassword: "As senhas não coincidem." },
		};
	}

	const result = await changePassword(
		user,
		textField(formData, "currentPassword"),
		next,
	);
	if (!result.ok) {
		return fromResult(result);
	}
	await startSession(user.id, result.data.sessionVersion);
	return {
		status: "ok",
		message: "Senha alterada. As outras sessões foram encerradas.",
	};
}
