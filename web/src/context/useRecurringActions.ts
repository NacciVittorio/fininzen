import { usePacActions } from "./usePacActions";
import { useRecurringExpenseActions } from "./useRecurringExpenseActions";
import type { PacActionsOptions } from "./usePacActions";
import type { RecurringExpenseActionsOptions } from "./useRecurringExpenseActions";

type RecurringActionsOptions = PacActionsOptions &
    RecurringExpenseActionsOptions;

export function useRecurringActions(options: RecurringActionsOptions) {
    const recurringActions = useRecurringExpenseActions(options);
    const pacActions = usePacActions(options);
    return { ...recurringActions, ...pacActions };
}
