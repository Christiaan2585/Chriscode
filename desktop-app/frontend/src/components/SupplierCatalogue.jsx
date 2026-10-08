import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Link2, Upload, Wand2, X } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import SearchableSelect from "./SearchableSelect";
import { fetchDocumentPdf, saveBlob } from "../utils/documents";
import { pickerProducts } from "../utils/products";

export const LANGUAGE_NAMES = { en: "English", af: "Afrikaans" };
const BOOK_KEY = ["supplier-book"];

// The supplier's catalogue books (see app/api/catalogue.py): which languages
// are loaded, and every product in the book with its linked app products.
export const useSupplierBook = () =>
  useQuery({ queryKey: BOOK_KEY, queryFn: async () => (await apiClient.get("/catalogue/kyron")).data });

export const loadedLanguages = (book) => Object.keys(LANGUAGE_NAMES).filter((l) => book?.languages?.[l]);

const button =
  "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-400 disabled:opacity-50";

// The priced book, shown in the app's PDF viewer (same as document previews).
const BookFrame = ({ lang }) => {
  const url = `/catalogue/kyron/${lang}.pdf`;
  const { data: blob, isLoading, isError } = useQuery({
    queryKey: ["supplier-book-pdf", lang],
    queryFn: () => fetchDocumentPdf("catalogue", lang, url),
    gcTime: 0,
  });
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!blob) return undefined;
    const objectUrl = URL.createObjectURL(blob);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" disabled={!blob} className={button}
          onClick={() => saveBlob(blob, `Catalogue (${LANGUAGE_NAMES[lang]}).pdf`)}>
          <Download size={16} /> Download PDF
        </button>
      </div>
      <div className="h-[75vh] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        {isError ? (
          <p className="p-8 text-center text-sm text-red-600">Couldn't load the catalogue.</p>
        ) : isLoading || !src ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading the catalogue…</p>
        ) : (
          <iframe src={src} title={`Catalogue (${LANGUAGE_NAMES[lang]})`} className="h-full w-full border-0" />
        )}
      </div>
    </div>
  );
};

const UploadButton = ({ lang, loaded }) => {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState(null);
  const upload = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file);
      return (await apiClient.put(`/catalogue/kyron/${lang}`, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: (result) => {
      setMessage(result.warning || `Loaded: ${result.products} products on ${result.pages} pages.`);
      queryClient.invalidateQueries({ queryKey: BOOK_KEY });
      queryClient.invalidateQueries({ queryKey: ["supplier-book-pdf"] });
    },
  });
  return (
    <span className="flex flex-col">
      <label className={`${button} cursor-pointer ${upload.isPending ? "pointer-events-none opacity-50" : ""}`}>
        <Upload size={16} /> {upload.isPending ? "Loading…" : `${loaded ? "Replace" : "Load"} ${LANGUAGE_NAMES[lang]} PDF`}
        <input type="file" accept="application/pdf,.pdf" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload.mutate(f); }} />
      </label>
      {message && <span role="status" className="mt-1 text-xs text-slate-500">{message}</span>}
    </span>
  );
};

// Match each product in the book to this app's products (pack sizes) - their
// prices go in the column beside it.
const LinkProducts = ({ book, products, onClose }) => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const byId = useMemo(() => Object.fromEntries((products || []).map((p) => [p.id, p])), [products]);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: BOOK_KEY });
    queryClient.invalidateQueries({ queryKey: ["supplier-book-pdf"] });
  };
  const save = useMutation({
    mutationFn: ({ key, ids }) => apiClient.put(`/catalogue/kyron/links/${encodeURIComponent(key)}`, { product_ids: ids }),
    onSuccess: refresh,
  });
  const suggestAll = useMutation({ mutationFn: () => apiClient.post("/catalogue/kyron/links/suggested"), onSuccess: refresh });
  const q = filter.trim().toLowerCase();
  const entries = book.entries.filter((e) => !q || e.name.toLowerCase().includes(q) || (e.name_af || "").toLowerCase().includes(q));
  const linkedCount = book.entries.filter((e) => e.product_ids.length).length;

  return (
    <Modal isOpen onClose={onClose} title="Link the catalogue's products to yours" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Pick which of your products (pack sizes) belong to each product in the book. Their prices print in the column beside it.
          {" "}{linkedCount} of {book.entries.length} linked; {book.not_in_book} of your products aren't in the book - they're listed at the back.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a product in the book…"
            aria-label="Find a product in the book"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button type="button" className={button} disabled={suggestAll.isPending} onClick={() => suggestAll.mutate()}>
            <Wand2 size={16} /> Link all by name
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {entries.map((e) => (
            <li key={e.key} className="flex flex-wrap items-start gap-3 py-3">
              <div className="w-56 shrink-0">
                <div className="font-medium text-slate-800">{e.name}</div>
                <div className="text-xs text-slate-500">
                  Page {e.page}{e.name_af && e.name_af !== e.name ? ` · ${e.name_af}` : ""}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {e.product_ids.map((id) => (
                  <span key={id} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                    {byId[id]?.name || `#${id}`}
                    <button type="button" aria-label={`Unlink ${byId[id]?.name || id}`} className="hover:text-red-600"
                      onClick={() => save.mutate({ key: e.key, ids: e.product_ids.filter((x) => x !== id) })}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {!e.product_ids.length && e.suggested.length > 0 && (
                  <button type="button" className="text-xs font-medium text-emerald-700 hover:underline"
                    onClick={() => save.mutate({ key: e.key, ids: e.suggested })}>
                    Link {e.suggested.map((id) => byId[id]?.name).filter(Boolean).join(", ")}
                  </button>
                )}
                <div className="w-56">
                  <SearchableSelect value="" placeholder="Add a product…" searchPlaceholder="Search your products…"
                    options={pickerProducts(products).filter((p) => !e.product_ids.includes(p.id))
                      .map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))}
                    onChange={(v) => v && save.mutate({ key: e.key, ids: [...e.product_ids, Number(v)] })} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};

// Products -> Catalog once the supplier's book is loaded: the real pages, in
// English or Afrikaans, with this business's prices beside each product.
const SupplierCatalogue = ({ book, products, canEdit }) => {
  const languages = loadedLanguages(book);
  const [lang, setLang] = useState(languages[0]);
  const [linking, setLinking] = useState(false);
  const shown = languages.includes(lang) ? lang : languages[0];
  const linked = book.entries.filter((e) => e.product_ids.length).length;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Language">
          {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
            <button key={code} type="button" disabled={!languages.includes(code)} onClick={() => setLang(code)}
              aria-pressed={shown === code}
              className={`px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${shown === code ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              {name}
            </button>
          ))}
        </div>
        {canEdit && (
          <>
            <button type="button" className={button} onClick={() => setLinking(true)}>
              <Link2 size={16} /> Link products ({linked} of {book.entries.length})
            </button>
            {Object.keys(LANGUAGE_NAMES).map((code) => (
              <UploadButton key={code} lang={code} loaded={languages.includes(code)} />
            ))}
          </>
        )}
      </div>
      {shown && <BookFrame key={shown} lang={shown} />}
      {linking && <LinkProducts book={book} products={products} onClose={() => setLinking(false)} />}
    </div>
  );
};

// Shown above the card catalog until a book is loaded.
export const LoadBookPrompt = ({ canEdit }) => (
  <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
    <span className="min-w-full flex-1 sm:min-w-0">
      {canEdit
        ? "Load Kyron's catalogue PDFs (English and Afrikaans) to show the real catalogue here, with your prices beside each product."
        : "An admin can load Kyron's catalogue PDFs to show the real catalogue here."}
    </span>
    {canEdit && Object.keys(LANGUAGE_NAMES).map((code) => <UploadButton key={code} lang={code} loaded={false} />)}
  </div>
);

export default SupplierCatalogue;
