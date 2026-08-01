"use client";

import { useEffect, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { SettingsCard } from "./SettingsRow";
import type { Translator } from "../../types";

type ProfileLike = {
    name?: string | null;
    email?: string | null;
    mfa_enabled?: boolean;
};
type AccountActionResult = { ok: true } | { ok: false; errorKey?: string };
type PasswordForm = { old: string; new: string; confirm: string };
type EmailForm = { password: string; newEmail: string };
type DeleteForm = { password: string; confirm: string };

export function UserSection({
    T,
    profile,
    updateProfile,
    changePassword,
    changeEmail,
}: {
    T: Translator;
    profile: ProfileLike;
    updateProfile: (payload: { name: string }) => Promise<boolean>;
    changePassword: (
        oldPassword: string,
        newPassword: string,
    ) => Promise<AccountActionResult>;
    changeEmail: (
        currentPassword: string,
        newEmail: string,
    ) => Promise<AccountActionResult>;
}) {
    const [nameVal, setNameVal] = useState(profile.name ?? "");
    const [nameSaved, setNameSaved] = useState(false);
    const [pwForm, setPwForm] = useState<PasswordForm>({
        old: "",
        new: "",
        confirm: "",
    });
    const [pwError, setPwError] = useState<string | null>(null);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwLoading, setPwLoading] = useState(false);
    const [emailForm, setEmailForm] = useState<EmailForm>({
        password: "",
        newEmail: "",
    });
    const [emailError, setEmailError] = useState<string | null>(null);
    const [emailSuccess, setEmailSuccess] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);

    useEffect(() => setNameVal(profile.name ?? ""), [profile.name]);

    const saveName = async () => {
        const ok = await updateProfile({ name: nameVal });
        if (ok) {
            setNameSaved(true);
            setTimeout(() => setNameSaved(false), 2000);
        }
    };

    const handlePwSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPwError(null);
        setPwSuccess(false);
        if (pwForm.new !== pwForm.confirm) {
            setPwError(T("password_change_error_mismatch"));
            return;
        }
        setPwLoading(true);
        const result = await changePassword(pwForm.old, pwForm.new);
        setPwLoading(false);
        if (result.ok) {
            setPwSuccess(true);
            setPwForm({ old: "", new: "", confirm: "" });
        } else {
            setPwError(T(result.errorKey ?? "error_save_failed"));
        }
    };

    const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setEmailError(null);
        setEmailSuccess(false);
        setEmailLoading(true);
        const result = await changeEmail(
            emailForm.password,
            emailForm.newEmail,
        );
        setEmailLoading(false);
        if (result.ok) {
            setEmailSuccess(true);
            setEmailForm({ password: "", newEmail: "" });
        } else {
            setEmailError(T(result.errorKey ?? "error_save_failed"));
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ProfileNameCard
                T={T}
                nameVal={nameVal}
                setNameVal={setNameVal}
                nameSaved={nameSaved}
                saveName={saveName}
            />
            <EmailChangeCard
                T={T}
                profile={profile}
                emailForm={emailForm}
                setEmailForm={setEmailForm}
                emailError={emailError}
                emailSuccess={emailSuccess}
                emailLoading={emailLoading}
                handleEmailSubmit={handleEmailSubmit}
            />
            <PasswordChangeCard
                T={T}
                pwForm={pwForm}
                setPwForm={setPwForm}
                pwError={pwError}
                pwSuccess={pwSuccess}
                pwLoading={pwLoading}
                handlePwSubmit={handlePwSubmit}
            />
        </div>
    );
}

function ProfileNameCard({
    T,
    nameVal,
    setNameVal,
    nameSaved,
    saveName,
}: {
    T: Translator;
    nameVal: string;
    setNameVal: Dispatch<SetStateAction<string>>;
    nameSaved: boolean;
    saveName: () => void;
}) {
    return (
        <SettingsCard title={T("user_name")}>
            <div style={{ display: "flex", gap: 8 }}>
                <input
                    className="inp"
                    placeholder={T("user_name_placeholder")}
                    value={nameVal}
                    onChange={(event) => setNameVal(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && saveName()}
                    style={{ flex: 1 }}
                />
                <button
                    className="btn btn-p"
                    onClick={saveName}
                    style={{ whiteSpace: "nowrap" }}
                >
                    {nameSaved ? `✓ ${T("user_name_saved")}` : T("btn_save")}
                </button>
            </div>
        </SettingsCard>
    );
}

function EmailChangeCard({
    T,
    profile,
    emailForm,
    setEmailForm,
    emailError,
    emailSuccess,
    emailLoading,
    handleEmailSubmit,
}: {
    T: Translator;
    profile: ProfileLike;
    emailForm: EmailForm;
    setEmailForm: Dispatch<SetStateAction<EmailForm>>;
    emailError: string | null;
    emailSuccess: boolean;
    emailLoading: boolean;
    handleEmailSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <SettingsCard title={T("change_email")} description={profile.email}>
            <form
                onSubmit={handleEmailSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
                <input
                    className="inp"
                    type="email"
                    placeholder={T("new_email")}
                    value={emailForm.newEmail}
                    onChange={(event) =>
                        setEmailForm((state) => ({
                            ...state,
                            newEmail: event.target.value,
                        }))
                    }
                    autoComplete="email"
                />
                <input
                    className="inp"
                    type="password"
                    placeholder={T("current_password")}
                    value={emailForm.password}
                    onChange={(event) =>
                        setEmailForm((state) => ({
                            ...state,
                            password: event.target.value,
                        }))
                    }
                    autoComplete="current-password"
                />
                {emailError && (
                    <div style={{ fontSize: 13, color: "var(--danger)" }}>
                        {emailError}
                    </div>
                )}
                {emailSuccess && (
                    <div style={{ fontSize: 13, color: "var(--success)" }}>
                        {T("email_change_success")}
                    </div>
                )}
                <button
                    type="submit"
                    className="btn btn-p"
                    disabled={
                        emailLoading ||
                        !emailForm.newEmail ||
                        !emailForm.password
                    }
                    style={{ alignSelf: "flex-start" }}
                >
                    {emailLoading ? "…" : T("change_email")}
                </button>
            </form>
        </SettingsCard>
    );
}

function PasswordChangeCard({
    T,
    pwForm,
    setPwForm,
    pwError,
    pwSuccess,
    pwLoading,
    handlePwSubmit,
}: {
    T: Translator;
    pwForm: PasswordForm;
    setPwForm: Dispatch<SetStateAction<PasswordForm>>;
    pwError: string | null;
    pwSuccess: boolean;
    pwLoading: boolean;
    handlePwSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <SettingsCard title={T("change_password")}>
            <form
                onSubmit={handlePwSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
                <input
                    className="inp"
                    type="password"
                    placeholder={T("current_password")}
                    value={pwForm.old}
                    onChange={(event) =>
                        setPwForm((state) => ({
                            ...state,
                            old: event.target.value,
                        }))
                    }
                    autoComplete="current-password"
                />
                <input
                    className="inp"
                    type="password"
                    placeholder={T("new_password")}
                    value={pwForm.new}
                    onChange={(event) =>
                        setPwForm((state) => ({
                            ...state,
                            new: event.target.value,
                        }))
                    }
                    autoComplete="new-password"
                />
                <input
                    className="inp"
                    type="password"
                    placeholder={T("confirm_password")}
                    value={pwForm.confirm}
                    onChange={(event) =>
                        setPwForm((state) => ({
                            ...state,
                            confirm: event.target.value,
                        }))
                    }
                    autoComplete="new-password"
                />
                {pwError && (
                    <div style={{ fontSize: 13, color: "var(--danger)" }}>
                        {pwError}
                    </div>
                )}
                {pwSuccess && (
                    <div style={{ fontSize: 13, color: "var(--success)" }}>
                        {T("password_change_success")}
                    </div>
                )}
                <button
                    type="submit"
                    className="btn btn-p"
                    disabled={
                        pwLoading ||
                        !pwForm.old ||
                        !pwForm.new ||
                        !pwForm.confirm
                    }
                    style={{ alignSelf: "flex-start" }}
                >
                    {pwLoading ? "…" : T("change_password")}
                </button>
            </form>
        </SettingsCard>
    );
}

export function DeleteAccountCard({
    T,
    deleteAccount,
}: {
    T: Translator;
    deleteAccount: (
        password: string,
        confirm: string,
    ) => Promise<AccountActionResult>;
}) {
    const [deleteForm, setDeleteForm] = useState<DeleteForm>({
        password: "",
        confirm: "",
    });
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const handleDeleteAccount = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setDeleteError(null);
        setDeleteLoading(true);
        const result = await deleteAccount(
            deleteForm.password,
            deleteForm.confirm,
        );
        setDeleteLoading(false);
        if (!result.ok)
            setDeleteError(T(result.errorKey ?? "error_save_failed"));
    };

    return (
        <SettingsCard
            title={T("account_delete_title", "Delete account")}
            description={T(
                "account_delete_desc",
                "This permanently deletes your account and all associated data.",
            )}
            danger
        >
            <form
                onSubmit={handleDeleteAccount}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
                <input
                    className="inp"
                    type="password"
                    placeholder={T("current_password")}
                    value={deleteForm.password}
                    onChange={(event) =>
                        setDeleteForm((state) => ({
                            ...state,
                            password: event.target.value,
                        }))
                    }
                    autoComplete="current-password"
                />
                <input
                    className="inp"
                    placeholder={T(
                        "account_delete_confirm_placeholder",
                        "Type DELETE",
                    )}
                    value={deleteForm.confirm}
                    onChange={(event) =>
                        setDeleteForm((state) => ({
                            ...state,
                            confirm: event.target.value,
                        }))
                    }
                />
                {deleteError && (
                    <div style={{ fontSize: 13, color: "var(--danger)" }}>
                        {deleteError}
                    </div>
                )}
                <button
                    type="submit"
                    className="btn btn-r"
                    disabled={
                        deleteLoading ||
                        !deleteForm.password ||
                        deleteForm.confirm !== "DELETE"
                    }
                    style={{ alignSelf: "flex-start" }}
                >
                    {deleteLoading
                        ? "…"
                        : T("account_delete_button", "Delete account")}
                </button>
            </form>
        </SettingsCard>
    );
}
