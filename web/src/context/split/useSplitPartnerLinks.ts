import { useCallback, useRef, useState } from "react";
import {
    acceptSplitPartnerLink,
    createSplitPartnerLink,
    declineSplitPartnerLink,
    fetchSplitPartnerLinks,
} from "../../api/split";
import type { SplitPartnerLink } from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitPartnerLinksArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
};

// Partner requests (piano sez. 1.2): reciprocal in-app link between two
// fininzen users, resolved by email (no real email ever sent). Accepting a
// PENDING `received` link creates the reciprocal SplitContact server-side
// (splitting/services.py::accept_partner_link) — reloading contacts after
// accept/decline is the caller's job (see SplitProvider composing this with
// useSplitContacts).
export function useSplitPartnerLinks({
    T,
    apiFetch,
    guardDemo,
}: UseSplitPartnerLinksArgs) {
    const [partnerLinksSent, setPartnerLinksSent] = useState<
        SplitPartnerLink[]
    >([]);
    const [partnerLinksReceived, setPartnerLinksReceived] = useState<
        SplitPartnerLink[]
    >([]);
    const [partnerLinksLoading, setPartnerLinksLoading] = useState(false);
    const [partnerLinksError, setPartnerLinksError] = useState<string | null>(
        null,
    );
    const requestSeqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const loadSplitPartnerLinks = useCallback(async () => {
        const requestSeq = ++requestSeqRef.current;
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setPartnerLinksLoading(true);
        setPartnerLinksError(null);
        try {
            const data = await fetchSplitPartnerLinks(
                apiFetch,
                controller.signal,
            );
            if (requestSeq !== requestSeqRef.current) return;
            setPartnerLinksSent(data.sent ?? []);
            setPartnerLinksReceived(data.received ?? []);
        } catch (error) {
            if (isAbortError(error)) return;
            if (requestSeq === requestSeqRef.current) {
                setPartnerLinksError(splitApiErrorMessage(error, T));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (requestSeq === requestSeqRef.current) {
                setPartnerLinksLoading(false);
            }
        }
    }, [apiFetch, T]);

    const sendSplitPartnerRequest = useCallback(
        async (email: string): Promise<SplitPartnerLink | null> => {
            if (guardDemo()) return null;
            try {
                const link = await createSplitPartnerLink(apiFetch, email);
                setPartnerLinksError(null);
                // An opposite PENDING request auto-accepts server-side, so the
                // safest way to reflect either outcome (new PENDING vs.
                // immediate ACCEPTED) is a full reload rather than guessing
                // which list `link` belongs in.
                await loadSplitPartnerLinks();
                return link;
            } catch (error) {
                setPartnerLinksError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T, loadSplitPartnerLinks],
    );

    const acceptSplitPartnerRequest = useCallback(
        async (linkId: number | string): Promise<SplitPartnerLink | null> => {
            if (guardDemo()) return null;
            try {
                const link = await acceptSplitPartnerLink(apiFetch, linkId);
                setPartnerLinksReceived((prev) =>
                    prev.map((l) => (l.id === link.id ? link : l)),
                );
                setPartnerLinksError(null);
                return link;
            } catch (error) {
                setPartnerLinksError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const declineSplitPartnerRequest = useCallback(
        async (linkId: number | string): Promise<SplitPartnerLink | null> => {
            if (guardDemo()) return null;
            try {
                const link = await declineSplitPartnerLink(apiFetch, linkId);
                setPartnerLinksReceived((prev) =>
                    prev.map((l) => (l.id === link.id ? link : l)),
                );
                setPartnerLinksError(null);
                return link;
            } catch (error) {
                setPartnerLinksError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    return {
        partnerLinksSent,
        partnerLinksReceived,
        partnerLinksLoading,
        partnerLinksError,
        setPartnerLinksError,
        loadSplitPartnerLinks,
        sendSplitPartnerRequest,
        acceptSplitPartnerRequest,
        declineSplitPartnerRequest,
    };
}
