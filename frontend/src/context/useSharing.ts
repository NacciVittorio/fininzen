import { useCallback } from "react";
import { fetchGrantsList } from "../api/sharing";
import type { GrantsResponse, ShareGrant } from "../api/sharing";
import type { ApiFetcher } from "../api/client";
import { logError } from "../utils/logger";
import type { Dispatch, SetStateAction } from "react";
import type { ViewAsAccount } from "./useAuthenticatedFetch";

type UseSharingArgs = {
  apiFetch: ApiFetcher;
  setGrants: Dispatch<SetStateAction<GrantsResponse>>;
  setViewAs: Dispatch<SetStateAction<ViewAsAccount | null>>;
};

export function useSharing({ apiFetch, setGrants, setViewAs }: UseSharingArgs) {
  const fetchGrants = useCallback(async () => {
    try {
      setGrants(await fetchGrantsList(apiFetch));
    } catch (error) {
      logError("fetchGrants:", error);
    }
  }, [apiFetch, setGrants]);

  const switchAccount = useCallback(
    (grant: ShareGrant | null) => {
      setViewAs(
        grant
          ? {
              userId: grant.owner_id!,
              email: grant.owner_email,
              permission: grant.permission,
            }
          : null,
      );
    },
    [setViewAs],
  );

  return { fetchGrants, switchAccount };
}
