import { MnwCompareGrid } from "./MnwCompareGrid";
import { MnwSingleGrid } from "./MnwSingleGrid";

export { getVisibleMonths, MONTH_NAMES_SHORT } from "./mnwConstants";

export default function MnwGrid(props) {
  return props.mode === "compare" ? (
    <MnwCompareGrid {...props} />
  ) : (
    <MnwSingleGrid {...props} />
  );
}
