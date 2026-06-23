import { MnwCompareGrid } from "./MnwCompareGrid";
import { MnwSingleGrid } from "./MnwSingleGrid";
import type { MnwGridProps } from "./mnwTypes";

export default function MnwGrid(props: MnwGridProps) {
    return props.mode === "compare" ? (
        <MnwCompareGrid {...props} />
    ) : (
        <MnwSingleGrid {...props} />
    );
}
