import { requestJson } from "./client";

export type HealthResponse = {
    status?: string;
    database?: string;
    version?: string;
};

// GET /api/health/ reports the backend's runtime version (read from the VERSION
// file on every request), so the app can display the running release even when
// the frontend build inlined an older NEXT_PUBLIC_APP_VERSION. drf-spectacular
// marks this endpoint as no-body, so the response shape is declared by hand.
export const fetchHealth = (): Promise<HealthResponse> =>
    requestJson<HealthResponse>("/health/");
