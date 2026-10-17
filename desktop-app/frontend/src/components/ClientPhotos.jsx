import { t } from "../utils/i18n";
import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { shortDate } from "../utils/format";
import { isNative } from "../utils/pairing";
import { PHOTOS_SENT } from "../utils/outbox";

const MAX_BYTES = 12 * 1024 * 1024;
const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

// Photos on the client's page: on a phone "Add a photo" offers the camera or the gallery (a sick animal, a gate, a
// delivery); the picture is shrunk on the office PC and kept with the client. Tap a thumbnail to see it full size.
const ClientPhotos = ({ clientId }) => {
  const queryClient = useQueryClient();
  const key = ["client-photos", String(clientId)];
  const { data: photos = [] } = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get(`/photos/client/${clientId}`)).data });
  const picker = useRef(null);
  const [chosen, setChosen] = useState(null); // { file, url } waiting for a caption
  const [caption, setCaption] = useState("");
  const [problem, setProblem] = useState("");
  const [viewing, setViewing] = useState(null); // { photo, url }
  const [waiting, setWaiting] = useState(0); // photos kept on the phone until the office PC can be reached
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!isNative()) return undefined;
    const refresh = () => import("../offline/photos").then(({ photoQueue }) => photoQueue.count(clientId)).then(setWaiting, () => {});
    const sent = () => { refresh(); setNotice(""); queryClient.invalidateQueries({ queryKey: key }); };
    refresh();
    window.addEventListener(PHOTOS_SENT, sent);
    return () => window.removeEventListener(PHOTOS_SENT, sent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => () => { if (chosen?.url) URL.revokeObjectURL(chosen.url); }, [chosen]);
  useEffect(() => () => { if (viewing?.url) URL.revokeObjectURL(viewing.url); }, [viewing]);

  const add = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", chosen.file);
      form.append("caption", caption);
      try {
        return (await apiClient.post(`/photos/client/${clientId}`, form, { headers: { "Content-Type": "multipart/form-data" }, silent: true, queueable: true })).data;
      } catch (err) {
        if (err?.response || !isNative()) throw err; // a real refusal (or the PC app itself): show it
        // On the phone with no signal: keep the photo on the phone and send it when the office PC can be reached.
        const { photoQueue } = await import("../offline/photos");
        await photoQueue.add({ clientId, caption, name: chosen.file.name, type: chosen.file.type, bytes: await chosen.file.arrayBuffer() });
        return { queued: true };
      }
    },
    onSuccess: (result) => {
      setChosen(null); setCaption(""); setProblem("");
      if (result?.queued) { setWaiting((n) => n + 1); setNotice(t("Saved on this phone. It will be added when the office PC can be reached.")); } else setNotice("");
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => setProblem(err?.response?.data?.detail?.toString?.() || "That didn't upload."),
  });
  const remove = useMutation({
    mutationFn: (id) => apiClient.delete(`/photos/${id}`, { silent: true }),
    onSuccess: () => { setViewing(null); queryClient.invalidateQueries({ queryKey: key }); },
    onError: (err) => setProblem(err?.response?.data?.detail?.toString?.() || "That couldn't be removed."),
  });

  const choose = (file) => {
    setProblem("");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setProblem("Choose a photo (JPEG or PNG).");
    if (file.size > MAX_BYTES) return setProblem("That photo is over 12 MB.");
    setChosen({ file, url: URL.createObjectURL(file) });
  };
  const open = async (photo) => {
    try {
      const blob = (await apiClient.get(`/photos/${photo.id}/image`, { responseType: "blob" })).data;
      setViewing({ photo, url: URL.createObjectURL(blob) });
    } catch {
      setProblem("Couldn't open that photo.");
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Camera size={18} className="text-emerald-600" /> {t("Photos")}</h3>
        <button type="button" onClick={() => picker.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-400">
          <Camera size={16} /> {t("Add a photo")}
        </button>
        <input ref={picker} type="file" accept="image/*" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {problem && !chosen && <p role="alert" className="mb-2 text-sm text-red-600">{problem}</p>}
      {notice && <p role="status" className="mb-2 text-sm text-emerald-700">{notice}</p>}
      {waiting > 0 && <p className="mb-2 text-sm text-amber-700">{t("{n} waiting to be added when the office PC can be reached.", { n: waiting })}</p>}
      {photos.length === 0 ? (
        <p className="text-sm text-slate-500">{t("No photos yet. Add one of an animal, a gate or a delivery and it stays with this client.")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => open(p)} className="group block w-full text-left" title={p.caption || "Open"}>
                <img src={p.thumb} alt={p.caption || "Client photo"} className="aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200 group-hover:ring-emerald-400" />
                <span className="mt-1 block truncate text-xs text-slate-500">{p.caption || shortDate(p.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={Boolean(chosen)} onClose={() => { setChosen(null); setCaption(""); setProblem(""); }} title={t("Add a photo")} size="md">
        {chosen && (
          <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <img src={chosen.url} alt="The photo you chose" className="max-h-72 w-full rounded-lg object-contain bg-slate-100" />
            <label className="block"><span className="text-xs text-slate-500">{t("What is it? (optional)")}</span>
              <input className={field} maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t("e.g. Sick ewe at the dam")} autoFocus /></label>
            {problem && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{problem}</p>}
            <button type="submit" disabled={add.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {add.isPending ? "Adding..." : "Add the photo"}
            </button>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.photo.caption || "Photo"} size="lg">
        {viewing && (
          <div className="space-y-3 text-sm">
            <img src={viewing.url} alt={viewing.photo.caption || "Client photo"} className="max-h-[65vh] w-full rounded-lg object-contain bg-slate-100" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
              <span>{shortDate(viewing.photo.created_at)}{viewing.photo.by ? ` · added by ${viewing.photo.by}` : ""}</span>
              <button type="button" onClick={() => { if (window.confirm("Remove this photo? It can't be brought back.")) remove.mutate(viewing.photo.id); }}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:border-red-300 hover:text-red-600"><Trash2 size={14} /> {t("Remove")}</button>
            </div>
            {problem && <p role="alert" className="text-red-600">{problem}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ClientPhotos;
