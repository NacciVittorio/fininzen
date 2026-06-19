import { ContributionSourceEditorModal } from "./ContributionSourceEditorModal";
import { DeleteContributionSourceModal } from "./DeleteContributionSourceModal";

export function ContributionSourceModals(props) {
  return (
    <>
      <ContributionSourceEditorModal {...props} />
      <DeleteContributionSourceModal {...props} />
    </>
  );
}
