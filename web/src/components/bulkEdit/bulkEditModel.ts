export const KEEP = "__keep__";
export const CLEAR = "__clear__";

export function formatBulkTemplate(
    template: string,
    vars?: Record<string, unknown>,
): string {
    return Object.entries(vars || {}).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        template,
    );
}

type TextFieldState = { value: string; cleared: boolean };

export type BulkEditState = {
    verified: string;
    date: string;
    description: TextFieldState;
    notes: TextFieldState;
    category: string;
    account: string;
    from_account: string;
    to_account: string;
};

export type TextField = "description" | "notes";
type StringField =
    | "verified"
    | "date"
    | "category"
    | "account"
    | "from_account"
    | "to_account";

export const initialBulkEditState = (): BulkEditState => ({
    verified: "keep",
    date: "",
    description: { value: "", cleared: false },
    notes: { value: "", cleared: false },
    category: KEEP,
    account: KEEP,
    from_account: KEEP,
    to_account: KEEP,
});

export type BulkEditAction =
    | { type: "SET"; field: StringField; value: string }
    | { type: "SET_TEXT_VALUE"; field: TextField; value: string }
    | { type: "TOGGLE_TEXT_CLEARED"; field: TextField };

export function bulkEditReducer(
    state: BulkEditState,
    action: BulkEditAction,
): BulkEditState {
    switch (action.type) {
        case "SET":
            return { ...state, [action.field]: action.value };
        case "SET_TEXT_VALUE":
            return {
                ...state,
                [action.field]: { value: action.value, cleared: false },
            };
        case "TOGGLE_TEXT_CLEARED":
            return {
                ...state,
                [action.field]: {
                    value: state[action.field].value,
                    cleared: !state[action.field].cleared,
                },
            };
        default:
            return state;
    }
}

export const FIELD_ERROR_MAP: Record<string, string> = {
    category_direction_mismatch: "category",
    category_not_found: "category",
    invalid_category: "category",
    account_not_bank: "account",
    invalid_account: "account",
    invalid_date: "date",
    same_account_transfer: "to_account",
};

export function selectIdFromState(value: string): number | null | undefined {
    if (value === KEEP) return undefined;
    if (value === CLEAR || value === "") return null;
    return Number(value);
}
