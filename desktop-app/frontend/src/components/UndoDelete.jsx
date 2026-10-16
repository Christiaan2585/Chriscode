import React, { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import apiClient, { setDeleteNotifier } from "../api/client";
import { useToast } from "../context/ToastContext";
import { deletedMessage, newestN } from "../utils/undo";
import { t } from "../utils/i18n";

const UNDO_SECONDS = 12;

// After an admin deletes a record (a client, invoice, quote...) a toast says so with an "Undo" button. Every such
// delete already went to the recycle bin, so Undo just restores the newest entries. Registered once for the whole app
// (api/client.js reports each successful record delete), so no delete button needed changing. Renders nothing.
const UndoDelete = () => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const count = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    const settle = async () => {
      const n = count.current;
      count.current = 0;
      try {
        const bin = (await apiClient.get("/trash/", { silent: true })).data;
        const items = newestN(bin, n);
        if (!items.length) return;
        showToast(deletedMessage(items), "success", UNDO_SECONDS * 1000, {
          label: t("Undo"),
          onClick: async () => {
            try {
              for (const item of items) await apiClient.post(`/trash/${item.id}/restore`, null, { silent: true });
              queryClient.invalidateQueries();
              showToast(items.length === 1 ? t("Brought back.") : t("Brought back {n} items.", { n: items.length }), "success", 4000);
            } catch (err) {
              showToast(err?.response?.data?.detail?.toString?.() || "Couldn't bring it back. It may still be in Settings → Recycle bin.", "error");
            }
          },
        });
      } catch {
        // Not an admin, or the bin can't be read: the delete itself already worked, so say nothing.
      }
    };
    setDeleteNotifier(() => {
      count.current += 1;
      clearTimeout(timer.current);
      timer.current = setTimeout(settle, 500); // a bulk delete is one toast, not one per record
    });
    return () => { setDeleteNotifier(null); clearTimeout(timer.current); };
  }, [showToast, queryClient]);
  return null;
};

export default UndoDelete;
