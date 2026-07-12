// Tiny module-level toast store — a pub/sub so any layer (including the context
// action hooks) can raise a transient confirmation without threading state
// through React context. The single <ToastHost/> mounted in the app layout
// subscribes and renders. Deliberately dependency-free.

export type ToastAction = {
    label: string;
    onAction: () => void;
};

export type ToastSpec = {
    id: number;
    message: string;
    action?: ToastAction;
    /** Auto-dismiss delay in ms. */
    duration: number;
};

type Listener = (toasts: readonly ToastSpec[]) => void;

let toasts: ToastSpec[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit() {
    for (const listener of listeners) listener(toasts);
}

export function subscribeToasts(listener: Listener): () => void {
    listeners.add(listener);
    listener(toasts);
    return () => {
        listeners.delete(listener);
    };
}

export function dismissToast(id: number): void {
    const next = toasts.filter((toast) => toast.id !== id);
    if (next.length !== toasts.length) {
        toasts = next;
        emit();
    }
}

export function showToast(
    spec: Omit<ToastSpec, "id" | "duration"> & { duration?: number },
): number {
    const id = ++seq;
    toasts = [...toasts, { duration: 5000, ...spec, id }];
    emit();
    return id;
}
