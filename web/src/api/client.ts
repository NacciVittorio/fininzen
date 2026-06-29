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

/**
 * Fetch every page of a DRF-paginated list endpoint and return the flattened
 * array. The backend caps list responses at PAGE_SIZE (LOW-11), so a single
 * request would silently truncate; this walks all pages so callers still get
 * the full collection.
 *
 * Pagination is driven by appending `?page=N` to the original path (not DRF's
 * absolute `next` URL) so it stays within this relative-path client. A bare
 * array response (an endpoint that does not paginate) is returned as-is.
 */
export async function fetchAllPagesWithFetcher<TItem>(
    fetcher: ApiFetcher,
    path: ApiPath,
    options: ApiRequestOptions = {},
): Promise<TItem[]> {
    const first = await requestJsonWithFetcher<
        TItem[] | PaginatedResponse<TItem>
    >(fetcher, path, options);
    if (Array.isArray(first)) return first;

    const items: TItem[] = [...first.results];
    const sep = path.includes("?") ? "&" : "?";
    let page = 2;
    // Stop on count reached, an empty page, or a hard cap that can never be hit
    // in normal use (1M rows at PAGE_SIZE 100) but prevents an unbounded loop if
    // `count` ever drifts mid-walk.
    while (items.length < first.count && first.results.length > 0) {
        const next = await requestJsonWithFetcher<PaginatedResponse<TItem>>(
            fetcher,
            `${path}${sep}page=${page}` as ApiPath,
            options,
        );
        if (!next.results.length) break;
        items.push(...next.results);
        page += 1;
        if (page > 10_000) break;
    }
    return items;
}
