import { SplitProvider } from "../../../context/split/SplitProvider";

// Mounts SplitProvider only for routes under /split (piano sez. 7.4) — every
// other tab renders under the (app) layout without it, so Split's data never
// loads for a user who hasn't opened the tab.
export default function SplitLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <SplitProvider>{children}</SplitProvider>;
}
