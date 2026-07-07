// Superseded by CategoryCommand (terminal `>` override). Re-exported so
// existing imports keep working; safe to migrate call sites and delete.
export { CategoryCommand as CategorySelect, type CatOption } from "./CategoryCommand";
