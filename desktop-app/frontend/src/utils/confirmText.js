// The wording of a delete confirmation for the records that go to the recycle bin (clients, invoices, quotes, orders,
// products, purchase orders, programs): what else goes with it, and that it can be brought back.
export const UNDO_NOTE = "You can undo it straight after, or within 30 days from Settings > Recycle bin.";

export const deleteConfirm = (what, alsoGoes = "") => `Delete ${what}?${alsoGoes ? ` ${alsoGoes}` : ""} ${UNDO_NOTE}`;
