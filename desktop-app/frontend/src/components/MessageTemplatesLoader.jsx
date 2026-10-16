import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";
import { setMessageTemplates } from "../utils/clientSend";
import { useAuth } from "../context/AuthContext";

// Hands the business's own message wording (Settings -> Messages to clients) to utils/clientSend.js, so every message
// the app writes uses it. Same query as the rest of the app's business details, so it costs no extra request. Renders nothing.
const MessageTemplatesLoader = () => {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await apiClient.get("/business/")).data,
    enabled: Boolean(user),
  });
  useEffect(() => { setMessageTemplates(data?.message_templates || {}); }, [data]);
  return null;
};

export default MessageTemplatesLoader;
