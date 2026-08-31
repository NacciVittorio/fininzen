import { useCallback, useRef, useState } from "react";
import {
    createSplitContact,
    deleteSplitContact,
    fetchSplitContactsList,
    updateSplitContact,
} from "../../api/split";
import type {
    SplitContact,
    SplitContactPatchPayload,
    SplitContactPayload,
} from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitContactsArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
};

// Personal contact book (piano sez. 1.1): local-only contacts plus contacts
// backed by an accepted SplitPartnerLink (linked_user set). Same
// AbortController + requestSeq anti-race pattern as useTransactionFeeds.ts's
// loadCfFeed — a slower stale request must never clobber a newer one's result.
export function useSplitContacts({
    T,
    apiFetch,
    guardDemo,
}: UseSplitContactsArgs) {
    const [contacts, setContacts] = useState<SplitContact[]>([]);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [contactsError, setContactsError] = useState<string | null>(null);
    const requestSeqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const loadSplitContacts = useCallback(
        async (options?: { includeArchived?: boolean }) => {
            const requestSeq = ++requestSeqRef.current;
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setContactsLoading(true);
            setContactsError(null);
            try {
                const items = await fetchSplitContactsList(apiFetch, {
                    includeArchived: options?.includeArchived,
                    signal: controller.signal,
                });
                if (requestSeq !== requestSeqRef.current) return;
                setContacts(items);
            } catch (error) {
                if (isAbortError(error)) return;
                if (requestSeq === requestSeqRef.current) {
                    setContactsError(splitApiErrorMessage(error, T));
                }
            } finally {
                if (abortRef.current === controller) abortRef.current = null;
                if (requestSeq === requestSeqRef.current) {
                    setContactsLoading(false);
                }
            }
        },
        [apiFetch, T],
    );

    const addSplitContact = useCallback(
        async (payload: SplitContactPayload): Promise<SplitContact | null> => {
            if (guardDemo()) return null;
            try {
                const created = await createSplitContact(apiFetch, payload);
                setContacts((prev) =>
                    [...prev, created].sort((a, b) =>
                        a.display_name.localeCompare(b.display_name),
                    ),
                );
                setContactsError(null);
                return created;
            } catch (error) {
                setContactsError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const editSplitContact = useCallback(
        async (
            contactId: number | string,
            payload: SplitContactPatchPayload,
        ): Promise<SplitContact | null> => {
            if (guardDemo()) return null;
            try {
                const updated = await updateSplitContact(
                    apiFetch,
                    contactId,
                    payload,
                );
                setContacts((prev) =>
                    prev.map((c) => (c.id === updated.id ? updated : c)),
                );
                setContactsError(null);
                return updated;
            } catch (error) {
                setContactsError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    // DELETE soft-archives server-side when the contact is still referenced
    // (splitting/views/contacts.py::SplitContactViewSet.destroy) — either way
    // the row disappears from the default (non-archived) list, so a plain
    // client-side removal mirrors both outcomes without a second round trip.
    const removeSplitContact = useCallback(
        async (contactId: number | string): Promise<boolean> => {
            if (guardDemo()) return false;
            try {
                await deleteSplitContact(apiFetch, contactId);
                setContacts((prev) => prev.filter((c) => c.id !== contactId));
                setContactsError(null);
                return true;
            } catch (error) {
                setContactsError(splitApiErrorMessage(error, T));
                return false;
            }
        },
        [apiFetch, guardDemo, T],
    );

    return {
        contacts,
        contactsLoading,
        contactsError,
        setContactsError,
        loadSplitContacts,
        addSplitContact,
        editSplitContact,
        removeSplitContact,
    };
}
