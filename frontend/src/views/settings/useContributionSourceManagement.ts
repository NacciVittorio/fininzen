import { useState } from "react";
import {
    type ContributionSource,
    createContributionSource,
    deleteContributionSource,
    updateContributionSource,
} from "../../api/contributionSources";
import { ApiRequestError, type ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { REFRESH_REASONS } from "../../utils/refreshReasons";

type ContributionSourceForm = {
    name: string;
    sort_order: string;
    is_active: boolean;
};

type DeleteContributionSourceFlow = {
    source: ContributionSource;
    txChoice: string | null;
    txTarget: number | null;
};

type UseContributionSourceManagementArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    contributionSources: ContributionSource[];
    fetchContributionSources: () => void | Promise<void>;
    isDemo: boolean;
    refreshAfter: (reason: string) => void | Promise<void>;
};

const EMPTY_FORM: ContributionSourceForm = {
    name: "",
    sort_order: "0",
    is_active: true,
};

export function useContributionSourceManagement({
    T,
    apiFetch,
    contributionSources,
    fetchContributionSources,
    isDemo,
    refreshAfter,
}: UseContributionSourceManagementArgs) {
    const [showContributionSourceModal, setShowContributionSourceModal] =
        useState(false);
    const [editingContributionSourceId, setEditingContributionSourceId] =
        useState<number | null>(null);
    const [contributionSourceForm, setContributionSourceForm] =
        useState(EMPTY_FORM);
    const [contributionSourceError, setContributionSourceError] = useState("");
    const [deleteContributionSourceFlow, setDeleteContributionSourceFlow] =
        useState<DeleteContributionSourceFlow | null>(null);

    const closeContributionSourceModal = () => {
        setShowContributionSourceModal(false);
        setEditingContributionSourceId(null);
        setContributionSourceError("");
        setContributionSourceForm(EMPTY_FORM);
    };
    const openNewContributionSource = () => {
        setEditingContributionSourceId(null);
        setContributionSourceForm({
            ...EMPTY_FORM,
            sort_order: String(contributionSources.length),
        });
        setContributionSourceError("");
        setShowContributionSourceModal(true);
    };
    const openEditContributionSource = (source: ContributionSource) => {
        setEditingContributionSourceId(source.id);
        setContributionSourceForm({
            name: source.name || "",
            sort_order: String(source.sort_order ?? 0),
            is_active: source.is_active !== false,
        });
        setContributionSourceError("");
        setShowContributionSourceModal(true);
    };
    const saveContributionSource = async () => {
        if (isDemo) return setContributionSourceError(T("demo_modal_body"));
        if (!contributionSourceForm.name.trim())
            return setContributionSourceError(T("error_name_required"));
        const isEdit = editingContributionSourceId !== null;
        const body = {
            name: contributionSourceForm.name.trim(),
            sort_order:
                parseInt(contributionSourceForm.sort_order || "0", 10) || 0,
            is_active: contributionSourceForm.is_active,
        };
        try {
            if (isEdit)
                await updateContributionSource(
                    apiFetch,
                    editingContributionSourceId,
                    body,
                );
            else await createContributionSource(apiFetch, body);
            closeContributionSourceModal();
            refreshAfter(
                isEdit
                    ? REFRESH_REASONS.CONTRIBUTION_SOURCE_UPDATED
                    : REFRESH_REASONS.CONTRIBUTION_SOURCE_CREATED,
            );
        } catch (error) {
            const payload =
                error instanceof ApiRequestError ? error.payload : null;
            const message =
                payload && typeof payload === "object"
                    ? Object.values(payload).flat().join(" ")
                    : "";
            setContributionSourceError(message || T("error_network"));
        }
    };
    const openDeleteContributionSourceFlow = (source: ContributionSource) =>
        setDeleteContributionSourceFlow({
            source,
            txChoice: null,
            txTarget: null,
        });
    const confirmDeleteContributionSource = async () => {
        if (!deleteContributionSourceFlow || isDemo) return;
        const { source, txChoice, txTarget } = deleteContributionSourceFlow;
        await deleteContributionSource(apiFetch, source.id, {
            transactions_action: txChoice || "null",
            reassign_to: txTarget || null,
        });
        setDeleteContributionSourceFlow(null);
        refreshAfter(REFRESH_REASONS.CONTRIBUTION_SOURCE_DELETED);
        fetchContributionSources();
    };
    return {
        showContributionSourceModal,
        editingContributionSourceId,
        contributionSourceForm,
        setContributionSourceForm,
        contributionSourceError,
        deleteContributionSourceFlow,
        setDeleteContributionSourceFlow,
        openNewContributionSource,
        openEditContributionSource,
        closeContributionSourceModal,
        saveContributionSource,
        openDeleteContributionSourceFlow,
        confirmDeleteContributionSource,
    };
}
