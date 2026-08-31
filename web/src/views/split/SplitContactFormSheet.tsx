"use client";

import { useEffect, useState } from "react";
import type { SplitContact } from "../../api/split";
import {
    BottomSheet,
    Label,
    ModalError,
    SegmentedControl,
    SheetTitle,
} from "../../components/ui";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";

const CONTACT_COLOR_CHOICES = [
    "#8e8e8e",
    "#e07a5f",
    "#3d5a80",
    "#81b29a",
    "#f2cc8f",
    "#9b5de5",
] as const;

type ContactMode = "local" | "fininzen";

export default function SplitContactFormSheet({
    open,
    contact,
    initialMode = "local",
    onClose,
}: {
    open: boolean;
    contact?: SplitContact | null;
    initialMode?: ContactMode;
    onClose: () => void;
}) {
    const { T } = useApp();
    const {
        contactsError,
        partnerLinksError,
        addSplitContact,
        editSplitContact,
        sendSplitPartnerRequest,
    } = useSplit();
    const [mode, setMode] = useState<ContactMode>(initialMode);
    const [name, setName] = useState("");
    const [color, setColor] = useState<string>(CONTACT_COLOR_CHOICES[0]);
    const [email, setEmail] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setMode(contact ? "local" : initialMode);
        setName(contact?.display_name ?? "");
        setColor(contact?.color ?? CONTACT_COLOR_CHOICES[0]);
        setEmail("");
    }, [contact, initialMode, open]);

    const handleSave = async () => {
        setSaving(true);
        if (mode === "fininzen" && !contact) {
            const link = await sendSplitPartnerRequest(email.trim());
            setSaving(false);
            if (link) onClose();
            return;
        }

        const trimmed = name.trim();
        const saved = contact
            ? await editSplitContact(contact.id, {
                  display_name: trimmed,
                  color,
              })
            : await addSplitContact({ display_name: trimmed, color });
        setSaving(false);
        if (saved) onClose();
    };

    const valid =
        mode === "fininzen" && !contact
            ? Boolean(email.trim())
            : Boolean(name.trim());

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            ariaLabel={
                contact ? T("split_contact_edit") : T("split_contact_new")
            }
            header={
                <SheetTitle style={{ marginBottom: 0 }}>
                    {contact ? T("split_contact_edit") : T("split_contact_new")}
                </SheetTitle>
            }
            footer={
                <div className="split-sheet-footer">
                    <button
                        type="button"
                        className="btn btn-g"
                        onClick={onClose}
                    >
                        {T("btn_cancel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-p"
                        data-testid={
                            mode === "fininzen" && !contact
                                ? "split-partner-request-send"
                                : contact
                                  ? `split-contact-edit-save-${contact.id}`
                                  : "split-contact-new-submit"
                        }
                        disabled={saving || !valid}
                        onClick={handleSave}
                    >
                        {saving
                            ? "…"
                            : mode === "fininzen" && !contact
                              ? T("split_partner_request_send")
                              : T("btn_save")}
                    </button>
                </div>
            }
        >
            <div className="split-sheet-form">
                {!contact && (
                    <SegmentedControl
                        value={mode}
                        onChange={(value) => setMode(value as ContactMode)}
                        options={[
                            {
                                value: "local",
                                label: T("split_contact_mode_local"),
                                testId: "split-contact-mode-local",
                            },
                            {
                                value: "fininzen",
                                label: T("split_contact_mode_fininzen"),
                                testId: "split-contact-mode-fininzen",
                            },
                        ]}
                    />
                )}

                {(contactsError || partnerLinksError) && (
                    <ModalError>
                        {mode === "fininzen"
                            ? partnerLinksError
                            : contactsError}
                    </ModalError>
                )}

                {mode === "fininzen" && !contact ? (
                    <label>
                        <Label>{T("email_label")}</Label>
                        <input
                            className="inp"
                            type="email"
                            required
                            style={{ width: "100%", minHeight: 44 }}
                            placeholder={T("share_with_placeholder")}
                            value={email}
                            data-testid="split-partner-request-email"
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </label>
                ) : (
                    <>
                        <label>
                            <Label>{T("split_contact_name_label")}</Label>
                            <input
                                className="inp"
                                style={{ width: "100%", minHeight: 44 }}
                                placeholder={T(
                                    "split_contact_name_placeholder",
                                )}
                                value={name}
                                data-testid={
                                    contact
                                        ? `split-contact-edit-name-${contact.id}`
                                        : "split-contact-name-input"
                                }
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                        </label>
                        <div>
                            <Label>{T("split_contact_color_label")}</Label>
                            <div className="split-choice-grid" role="group">
                                {CONTACT_COLOR_CHOICES.map((choice) => (
                                    <button
                                        key={choice}
                                        type="button"
                                        className="split-color-choice"
                                        aria-pressed={color === choice}
                                        aria-label={`${T("split_contact_color_choice_label")} ${choice}`}
                                        onClick={() => setColor(choice)}
                                        style={{ background: choice }}
                                    />
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </BottomSheet>
    );
}
