import {
    API,
    DEFAULT_FETCH_TIMEOUT_MS,
    authHeaders,
    fetchWithTimeout,
} from "../utils/api";

export type ApiPath = `/${string}`;

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
    body?: unknown;
    timeoutMs?: number;
};

export type ApiFetcher = (
    input: string,
    options?: Omit<RequestInit, "body"> & {
        body?: BodyInit | null;
        timeoutMs?: number;
    },
) => Promise<Response>;

export class ApiRequestError extends Error {
    readonly status: number;
    readonly payload: unknown;

    constructor(status: number, payload: unknown) {
        super(`API request failed with status ${status}`);
        this.name = "ApiRequestError";
        this.status = status;
        this.payload = payload;
    }
}

const parseJson = async (response: Response): Promise<unknown> => {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

export async function requestJson<TResponse>(
    path: ApiPath,
    options: ApiRequestOptions = {},
): Promise<TResponse> {
    const {
        body,
        headers,
        timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
        ...rest
    } = options;
    const response = await fetchWithTimeout(`${API}${path}`, {
        ...rest,
        timeoutMs,
        headers: {
            ...authHeaders(),
            ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await parseJson(response);
    if (!response.ok) {
        throw new ApiRequestError(response.status, payload);
    }
    return payload as TResponse;
}

export async function requestJsonWithFetcher<TResponse>(
    fetcher: ApiFetcher,
    path: ApiPath,
    options: ApiRequestOptions = {},
): Promise<TResponse> {
    const { body, headers, ...rest } = options;
    const response = await fetcher(`${API}${path}`, {
        ...rest,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await parseJson(response);
    if (!response.ok) {
        throw new ApiRequestError(response.status, payload);
    }
    return payload as TResponse;
}

export type PaginatedResponse<TItem> = {
    count: number;
    next: string | null;
    previous: string | null;
    results: TItem[];
};
