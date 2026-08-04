"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { Card, GroupedList } from "../../components/ui";
import Modal from "../../components/Modal";

const CONTACT_COLOR_CHOICES = [
    "#8e8e8e",
    "#e07a5f",
    "#3d5a80",
    "#81b29a",
    "#f2cc8f",
    "#9b5de5",
] as const;

// Rubrica + richieste di collegamento (piano sez. 1.1/1.2/7.5) — quasi-gemello
// di web/src/views/settings/SharingSection.tsx: stesso form email + liste
// sent/received, adattato al vocabolario Split (contatti locali + partner
// link reciproci invece di DataAccessGrant unidirezionali).
export default function SplitContactsSection() {
    const { T } = useApp();
    const {
        contacts,
        contactsLoading,
        contactsError,
        loadSplitContacts,
        addSplitContact,
        editSplitContact,
        removeSplitContact,
        partnerLinksSent,
        partnerLinksReceived,
        partnerLinksLoading,
        partnerLinksError,
        loadSplitPartnerLinks,
        sendSplitPartnerRequest,
        acceptSplitPartnerRequest,
        declineSplitPartnerRequest,
        groups,
    } = useSplit();

    const [contactName, setContactName] = useState("");
    const [contactColor, setContactColor] = useState<string>(
        CONTACT_COLOR_CHOICES[0],
    );
    const [savingContact, setSavingContact] = useState(false);
    const [pendingContact, setPendingContact] = useState<{
        name: string;
        color: string;
    } | null>(null);
    const [email, setEmail] = useState("");
    const [sendingRequest, setSendingRequest] = useState(false);
    const [editingContactId, setEditingContactId] = useState<number | null>(
        null,
    );
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState<string>(
        CONTACT_COLOR_CHOICES[0],
    );
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        loadSplitContacts();
        loadSplitPartnerLinks();
    }, [loadSplitContacts, loadSplitPartnerLinks]);

    const handleAddContact = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = contactName.trim();
        if (!trimmed) return;
        setPendingContact({ name: trimmed, color: contactColor });
    };

    const startEditContact = (contact: (typeof contacts)[number]) => {
        setEditingContactId(contact.id);
        setEditName(contact.display_name);
        setEditColor(contact.color ?? CONTACT_COLOR_CHOICES[0]);
    };

    const handleSaveEditContact = async (contactId: number) => {
        const trimmed = editName.trim();
        if (!trimmed) return;
        setSavingEdit(true);
        const updated = await editSplitContact(contactId, {
            display_name: trimmed,
            color: editColor,
        });
        setSavingEdit(false);
        if (updated) setEditingContactId(null);
    };

    const handleConfirmAddContact = async () => {
        if (!pendingContact) return;
        setSavingContact(true);
        const created = await addSplitContact({
            display_name: pendingContact.name,
            color: pendingContact.color,
        });
        setSavingContact(false);
        setPendingContact(null);
        if (created) {
            setContactName("");
            setContactColor(CONTACT_COLOR_CHOICES[0]);
        }
    };

    const handleSendRequest = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) return;
        setSendingRequest(true);
        const link = await sendSplitPartnerRequest(trimmed);
        setSendingRequest(false);
        if (link) {
            setEmail("");
            loadSplitContacts();
        }
    };

    // Groups a contact currently belongs to, so it's visible from the
    // rubrica without opening each group's detail page in turn — a contact
    // can be an active member of any number of groups at once
    // (SplitParticipant's uniqueness is scoped per-group, not globally).
    const groupNamesForContact = (
        contact: (typeof contacts)[number],
    ): string[] =>
        groups
            .filter((g) => !g.is_archived)
            .filter((g) =>
                g.members.some(
                    (member) =>
                        member.is_active &&
                        (member.contact === contact.id ||
                            (contact.linked_user != null &&
                                member.user === contact.linked_user)),
                ),
            )
            .map((g) => g.name);

    const pendingReceived = partnerLinksReceived.filter(
        (link) => link.status === "PENDING",
    );
    const pendingSent = partnerLinksSent.filter(
        (link) => link.status === "PENDING",
    );

    return (
        <div>
            <div className="grouped-list__title">
                {T("split_partner_requests_title")}
            </div>
            <Card style={{ padding: 16, marginBottom: 16 }}>
                <form
                    onSubmit={handleSendRequest}
                    className="row"
                    style={{ gap: 8, flexWrap: "wrap" }}
                >
                    <input
                        className="inp"
                        type="email"
                        required
                        placeholder={T("share_with_placeholder")}
                        value={email}
                        data-testid="split-partner-request-email"
                        onChange={(event) => setEmail(event.target.value)}
                        style={{ flex: 1, minWidth: 200 }}
                    />
                    <button
                        type="submit"
                        className="btn btn-p"
                        data-testid="split-partner-request-send"
                        disabled={sendingRequest || !email.trim()}
                    >
                        {sendingRequest ? "…" : T("split_partner_request_send")}
                    </button>
                </form>
                {partnerLinksError && (
                    <div
                        style={{
                            color: "var(--danger)",
                            fontSize: 12,
                            marginTop: 8,
                        }}
                    >
                        {partnerLinksError}
                    </div>
                )}
            </Card>

            {pendingReceived.length > 0 && (
                <GroupedList title={T("split_partner_requests_received")}>
                    {pendingReceived.map((link) => (
                        <GroupedList.Item
                            key={link.id}
                            label={link.requester_email}
                            subtitle={T("split_partner_request_pending")}
                            testId={`split-partner-link-row-${link.id}`}
                            action={
                                <div className="row" style={{ gap: 6 }}>
                                    <button
                                        type="button"
                                        className="btn btn-p btn-sm"
                                        data-testid={`split-partner-link-accept-${link.id}`}
                                        onClick={async () => {
                                            const accepted =
                                                await acceptSplitPartnerRequest(
                                                    link.id,
                                                );
                                            if (accepted) loadSplitContacts();
                                        }}
                                    >
                                        {T("split_partner_request_accept")}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-g btn-sm"
                                        data-testid={`split-partner-link-decline-${link.id}`}
                                        onClick={() =>
                                            declineSplitPartnerRequest(link.id)
                                        }
                                    >
                                        {T("split_partner_request_decline")}
                                    </button>
                                </div>
                            }
                        />
                    ))}
                </GroupedList>
            )}

            {pendingSent.length > 0 && (
                <GroupedList title={T("split_partner_requests_sent")}>
                    {pendingSent.map((link) => (
                        <GroupedList.Item
                            key={link.id}
                            label={link.recipient_email}
                            subtitle={T("split_partner_request_pending")}
                            testId={`split-partner-link-sent-${link.id}`}
                        />
                    ))}
                </GroupedList>
            )}

            <div
                className="between"
                style={{ alignItems: "center", marginBottom: 10 }}
            >
                <div className="grouped-list__title" style={{ margin: 0 }}>
                    {T("split_contacts_title")}
                </div>
            </div>

            <Card style={{ padding: 16, marginBottom: 16 }}>
                <form
                    onSubmit={handleAddContact}
                    className="row"
                    style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}
                >
                    <div className="row" style={{ gap: 6 }}>
                        {CONTACT_COLOR_CHOICES.map((choice) => (
                            <button
                                key={choice}
                                type="button"
                                aria-pressed={contactColor === choice}
                                aria-label={`${T("split_contact_color_choice_label")} ${choice}`}
                                onClick={() => setContactColor(choice)}
                                style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    background: choice,
                                    border:
                                        contactColor === choice
                                            ? "2px solid var(--fg)"
                                            : "2px solid transparent",
                                    cursor: "pointer",
                                }}
                            />
                        ))}
                    </div>
                    <input
                        className="inp"
                        placeholder={T("split_contact_name_placeholder")}
                        value={contactName}
                        data-testid="split-contact-name-input"
                        onChange={(event) => setContactName(event.target.value)}
                        style={{ flex: 1, minWidth: 160 }}
                    />
                    <button
                        type="submit"
                        className="btn btn-p btn-sm"
                        data-testid="split-contact-new-submit"
                        disabled={savingContact || !contactName.trim()}
                    >
                        {savingContact ? "…" : `+ ${T("split_contact_new")}`}
                    </button>
                </form>
            </Card>

            {contactsError && (
                <div
                    style={{
                        color: "var(--danger)",
                        fontSize: 13,
                        marginBottom: 10,
                    }}
                >
                    {contactsError}
                </div>
            )}

            {contactsLoading && contacts.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                    {T("loading")}
                </div>
            ) : contacts.length === 0 ? (
                <div
                    style={{ color: "var(--fg-soft)", fontSize: 13 }}
                    data-testid="split-contacts-empty"
                >
                    {T("split_contacts_empty")}
                </div>
            ) : (
                <div className="grouped-list">
                    {contacts.map((contact) => {
                        const groupNames = groupNamesForContact(contact);
                        const identityLine =
                            contact.linked_user_email ??
                            T("split_contact_local");

                        if (editingContactId === contact.id) {
                            return (
                                <Card
                                    key={contact.id}
                                    style={{ padding: 16 }}
                                    data-testid={`split-contact-edit-${contact.id}`}
                                >
                                    <div
                                        className="row"
                                        style={{
                                            gap: 8,
                                            flexWrap: "wrap",
                                            alignItems: "center",
                                        }}
                                    >
                                        <div className="row" style={{ gap: 6 }}>
                                            {CONTACT_COLOR_CHOICES.map(
                                                (choice) => (
                                                    <button
                                                        key={choice}
                                                        type="button"
                                                        aria-pressed={
                                                            editColor === choice
                                                        }
                                                        aria-label={`${T("split_contact_color_choice_label")} ${choice}`}
                                                        onClick={() =>
                                                            setEditColor(choice)
                                                        }
                                                        style={{
                                                            width: 22,
                                                            height: 22,
                                                            borderRadius: "50%",
                                                            background: choice,
                                                            border:
                                                                editColor ===
                                                                choice
                                                                    ? "2px solid var(--fg)"
                                                                    : "2px solid transparent",
                                                            cursor: "pointer",
                                                        }}
                                                    />
                                                ),
                                            )}
                                        </div>
                                        <input
                                            className="inp"
                                            value={editName}
                                            data-testid={`split-contact-edit-name-${contact.id}`}
                                            onChange={(event) =>
                                                setEditName(event.target.value)
                                            }
                                            style={{
                                                flex: 1,
                                                minWidth: 160,
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-g btn-sm"
                                            onClick={() =>
                                                setEditingContactId(null)
                                            }
                                        >
                                            {T("btn_cancel")}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-p btn-sm"
                                            data-testid={`split-contact-edit-save-${contact.id}`}
                                            disabled={
                                                savingEdit || !editName.trim()
                                            }
                                            onClick={() =>
                                                handleSaveEditContact(
                                                    contact.id,
                                                )
                                            }
                                        >
                                            {savingEdit ? "…" : T("btn_save")}
                                        </button>
                                    </div>
                                </Card>
                            );
                        }

                        return (
                            <GroupedList.Item
                                key={contact.id}
                                icon={
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            display: "inline-block",
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            background: contact.color,
                                        }}
                                    />
                                }
                                label={contact.display_name}
                                subtitle={
                                    groupNames.length > 0
                                        ? `${identityLine} · ${groupNames.join(", ")}`
                                        : identityLine
                                }
                                testId={`split-contact-row-${contact.id}`}
                                action={
                                    <div className="row" style={{ gap: 6 }}>
                                        <button
                                            type="button"
                                            className="btn btn-g btn-sm"
                                            data-testid={`split-contact-edit-${contact.id}`}
                                            onClick={() =>
                                                startEditContact(contact)
                                            }
                                        >
                                            {T("btn_edit")}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-r btn-sm"
                                            data-testid={`split-contact-remove-${contact.id}`}
                                            onClick={() =>
                                                removeSplitContact(contact.id)
                                            }
                                        >
                                            {T("btn_delete")}
                                        </button>
                                    </div>
                                }
                            />
                        );
                    })}
                </div>
            )}

            {partnerLinksLoading && (
                <div
                    style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        marginTop: 10,
                    }}
                >
                    {T("loading")}
                </div>
            )}

            {pendingContact && (
                <Modal
                    title={T("modal_add_contact")}
                    onClose={() => setPendingContact(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div
                            className="row"
                            style={{ gap: 8, alignItems: "center" }}
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    display: "inline-block",
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: pendingContact.color,
                                }}
                            />
                            <span style={{ fontSize: 14 }}>
                                {pendingContact.name}
                            </span>
                        </div>
                        <div
                            style={{
                                fontSize: 13,
                                color: "var(--fg-soft)",
                            }}
                        >
                            {T("split_add_contact_confirm_body")}
                        </div>
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => setPendingContact(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn btn-p"
                                data-testid="split-contact-new-confirm"
                                disabled={savingContact}
                                onClick={handleConfirmAddContact}
                            >
                                {T("btn_add")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
