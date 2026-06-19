import { CategoryEditorModal } from "./CategoryEditorModal";
import { DeleteCategoryModal } from "./DeleteCategoryModal";

export function CategoryModals(props) {
  return (
    <>
      <CategoryEditorModal {...props} />
      <DeleteCategoryModal {...props} />
    </>
  );
}
