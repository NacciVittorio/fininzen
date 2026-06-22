import type { ComponentProps } from "react";
import { CategoryEditorModal } from "./CategoryEditorModal";
import { DeleteCategoryModal } from "./DeleteCategoryModal";

type CategoryModalsProps = ComponentProps<typeof CategoryEditorModal> &
    ComponentProps<typeof DeleteCategoryModal>;

export function CategoryModals(props: CategoryModalsProps) {
    return (
        <>
            <CategoryEditorModal {...props} />
            <DeleteCategoryModal {...props} />
        </>
    );
}
