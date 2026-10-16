import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import { sendKindOf } from "./sends";

// {document id: the newest send of that kind} for the lists (Invoices, Quotes) and the preview.
export function useSends(kind) {
  return useQuery({
    queryKey: ["sends", kind],
    queryFn: async () => (await apiClient.get("/sends/latest", { params: { kind }, silent: true })).data,
    enabled: Boolean(kind),
    staleTime: 30000,
  });
}

// Records that a preview's document was sent (WhatsApp, email or from the app). Never gets in the way: a failure is ignored.
export function useRecordSend() {
  const queryClient = useQueryClient();
  return async (doc, via, to) => {
    const kind = sendKindOf(doc);
    if (!kind) return;
    const perDocument = kind !== "statement" && kind !== "order-form";
    try {
      await apiClient.post("/sends/", { kind, via, to: to || null, doc_id: perDocument ? doc.id : null, client_id: doc.send?.clientId ?? null }, { silent: true, queueable: true });
      queryClient.invalidateQueries({ queryKey: ["sends", kind] });
    } catch {
      // The history is a convenience - a send that could not be noted is not worth an error.
    }
  };
}
