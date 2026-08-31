"use client";

import { useEffect, useState } from "react";
import type { SplitContact } from "../../api/split";
import { Card, GroupedList, ModalError } from "../../components/ui";
import Modal from "../../components/Modal";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import SplitActionRow from "./SplitActionRow";
import SplitContactFormSheet from "./SplitContactFormSheet";

export default function SplitContactsSection({
    createOpen,
    onCreateOpenChange,
}: {
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
}) {
    const { T } = useApp();
    const {
        contacts,
        contactsLoading,
        contactsError,
        loadSplitContacts,
        removeSplitContact,
        partnerLinksSent,
        partnerLinksReceived,
        partnerLinksLoading,
        partnerLinksError,
        loadSplitPartnerLinks,
        acceptSplitPartnerRequest,
        declineSplitPartnerRequest,
        groups,
    } = useSplit();
    const [localCreateOpen, setLocalCreateOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<SplitContact | null>(
        null,
    );
    const [deleteTarget, setDeleteTarget] = useState<SplitContact | null>(null);
    const [deleting, setDeleting] = useState(false);
    const sheetOpen =
        Boolean(createOpen ?? localCreateOpen) || !!editingContact;

    useEffect(() => {
        loadSplitContacts();
        loadSplitPartnerLinks();
    }, [loadSplitContacts, loadSplitPartnerLinks]);

    const setCreateOpen = (open: boolean) => {
        if (onCreateOpenChange) onCreateOpenChange(open);
        else setLocalCreateOpen(open);
        if (!open) setEditingContact(null);
    };

    const groupNamesForContact = (contact: SplitContact): string[] =>
        groups
            .filter((group) => !group.is_archived)
            .filter((group) =>
                group.members.some(
                    (member) =>
                        member.is_active &&
                        (member.contact === contact.id ||
                            (contact.linked_user != null &&
                                member.user === contact.linked_user)),
                ),
            )
            .map((group) => group.name);

    const pendingReceived = partnerLinksReceived.filter(
        (link) => link.status === "PENDING",
    );
    const pendingSent = partnerLinksSent.filter(
        (link) => link.status === "PENDING",
    );

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        const removed = await removeSplitContact(deleteTarget.id);
        setDeleting(false);
        if (removed) setDeleteTarget(null);
    };

    return (
        <section data-testid="split-contacts-section">
            <div className="split-section-heading">
                <div className="grouped-list__title" style={{ padding: 0 }}>
                    {T("split_contacts_title")}
                </div>
                <button
                    type="button"
                    className="btn btn-p btn-sm desktop-only"
                    data-testid="split-contact-new-btn"
                    onClick={() => setCreateOpen(true)}
                >
                    + {T("split_contact_new")}
                </button>
            </div>

            {(contactsError || partnerLinksError) && (
                <div style={{ marginBottom: 12 }}>
                    <ModalError>
                        {contactsError ?? partnerLinksError}
                    </ModalError>
                </div>
            )}

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

            {contactsLoading && contacts.length === 0 ? (
                <Card className="split-empty-state">{T("loading")}</Card>
            ) : contacts.length === 0 ? (
                <Card
                    className="split-empty-state"
                    data-testid="split-contacts-empty"
                >
                    {T("split_contacts_empty")}
                </Card>
            ) : (
                <div className="grouped-list">
                    {contacts.map((contact) => {
                        const groupNames = groupNamesForContact(contact);
                        const identityLine =
                            contact.linked_user_email ??
                            T("split_contact_local");
                        return (
                            <SplitActionRow
                                key={contact.id}
                                rowId={`contact-${contact.id}`}
                                testId={`split-contact-row-${contact.id}`}
                                icon={
                                    <span
                                        aria-hidden="true"
                                        className="split-contact-dot"
                                        style={{ background: contact.color }}
                                    />
                                }
                                label={contact.display_name}
                                subtitle={
                                    groupNames.length > 0
                                        ? `${identityLine} · ${groupNames.join(", ")}`
                                        : identityLine
                                }
                                onOpen={() => setEditingContact(contact)}
                                onEdit={() => setEditingContact(contact)}
                                onDelete={() => setDeleteTarget(contact)}
                                editTestId={`split-contact-edit-${contact.id}`}
                                deleteTestId={`split-contact-remove-${contact.id}`}
                            />
                        );
                    })}
                </div>
            )}

            {partnerLinksLoading && (
                <div className="split-inline-loading">{T("loading")}</div>
            )}

            <SplitContactFormSheet
                open={sheetOpen}
                contact={editingContact}
                onClose={() => setCreateOpen(false)}
            />

            {deleteTarget && (
                <Modal
                    title={T("modal_delete_contact")}
                    onClose={() => setDeleteTarget(null)}
                >
                    <div className="split-confirm-content">
                        <div>{deleteTarget.display_name}</div>
                        <div className="split-confirm-hint">
                            {T("action_cannot_be_undone")}
                        </div>
                        <div className="split-confirm-actions">
                            <button
                                type="button"
                                className="btn btn-g"
                                onClick={() => setDeleteTarget(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-r"
                                data-testid="split-contact-remove-confirm"
                                disabled={deleting}
                                onClick={confirmDelete}
                            >
                                {deleting ? "…" : T("btn_delete")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
}
