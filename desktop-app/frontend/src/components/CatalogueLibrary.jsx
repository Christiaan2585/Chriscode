import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Download, Eye, Plus } from "lucide-react";
import apiClient from "../api/client";
import DocumentPreview from "./DocumentPreview";
import InlineEdit from "./InlineEdit";
import { BulkBar, SelectBox } from "./BulkSelect";
import { fetchDocumentPdf, saveBlob } from "../utils/documents";
import { shortDate } from "../utils/format";
import { useSelection } from "../utils/useSelection";

const LIBRARY = ["catalogue-library"];
const iconButton = "p-1.5 text-slate-400 transition-colors hover:text-emerald-600";

const sizeLabel = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// "More catalogues": any number of extra catalogue PDFs, each one added below
// the others (app/api/catalogue.py /catalogue/library). Admins add, rename and
// delete; everyone can open and download them.
const CatalogueLibrary = ({ canEdit }) => {
  const queryClient = useQueryClient();
  const { data: books = [] } = useQuery({ queryKey: LIBRARY, queryFn: async () => (await apiClient.get("/catalogue/library")).data });
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(null); // {done, total, failed: [..]}
  const selection = useSelection(books.map((b) => b.id));
  const refresh = () => queryClient.invalidateQueries({ queryKey: LIBRARY });

  const addFiles = async (files) => {
    const list = [...files];
    const failed = [];
    for (let i = 0; i < list.length; i += 1) {
      setProgress({ done: i, total: list.length, failed });
      const form = new FormData();
      form.append("file", list[i]);
      try {
        await apiClient.post("/catalogue/library", form, { headers: { "Content-Type": "multipart/form-data" } });
        refresh(); // each one shows up in the list as soon as it is in
      } catch (error) {
        const detail = error?.response?.data?.detail;
        failed.push(`${list[i].name}: ${typeof detail === "string" ? detail : "it couldn't be added"}`);
      }
    }
    setProgress(failed.length ? { done: list.length, total: list.length, failed } : null);
  };

  const rename = (id) => async (name) => {
    await apiClient.patch(`/catalogue/library/${id}`, { name });
    refresh();
  };
  const open = (book) => setPreview({
    kind: "catalogue-library", id: book.id, title: book.name, url: `/catalogue/library/${book.id}.pdf`, filename: `${book.name}.pdf`,
  });
  const download = async (book) => saveBlob(await fetchDocumentPdf("catalogue-library", book.id, `/catalogue/library/${book.id}.pdf`), `${book.name}.pdf`);

  return (
    <section aria-label="More catalogues" className="space-y-3 border-t border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <BookOpen size={18} className="text-emerald-600" /> More catalogues <span className="text-sm font-normal text-slate-400">{books.length}</span>
        </h3>
        {canEdit && (
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-400 ${progress && progress.done < progress.total ? "pointer-events-none opacity-50" : ""}`}>
            <Plus size={16} />
            {progress && progress.done < progress.total ? `Adding ${progress.done + 1} of ${progress.total}…` : "Add a catalogue"}
            <input type="file" multiple accept="application/pdf,.pdf" className="sr-only"
              onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; if (files.length) addFiles(files); }} />
          </label>
        )}
      </div>

      {progress?.failed.length > 0 && progress.done >= progress.total && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <p className="font-medium">{progress.failed.length === 1 ? "One file wasn't added:" : `${progress.failed.length} files weren't added:`}</p>
          <ul className="list-disc pl-5">{progress.failed.map((f) => <li key={f}>{f}</li>)}</ul>
          <button type="button" className="mt-1 text-emerald-800 hover:underline" onClick={() => setProgress(null)}>Dismiss</button>
        </div>
      )}

      {canEdit && (
        <div className="space-y-2 empty:hidden">
          <BulkBar selection={selection} noun="catalogue" describe={(id) => books.find((b) => b.id === id)?.name || id}
            deleteOne={(id) => apiClient.delete(`/catalogue/library/${id}`, { silent: true })} onDone={refresh} />
        </div>
      )}

      {books.length === 0 ? (
        <p className="text-sm text-slate-500">
          {canEdit ? "No other catalogues yet. Add a PDF and it is listed here; add more and each one goes below the last."
            : "No other catalogues have been added yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {books.map((book) => (
            <li key={book.id} className="flex items-center gap-3 px-3 py-2.5">
              {canEdit && <SelectBox selection={selection} id={book.id} label={`Select ${book.name}`} />}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">
                  {canEdit ? <InlineEdit value={book.name} label="Catalogue name" required onSave={rename(book.id)} /> : book.name}
                </div>
                <div className="text-xs text-slate-400">{book.pages} {book.pages === 1 ? "page" : "pages"} · {sizeLabel(book.size)} · added {shortDate(book.uploaded_at)}</div>
              </div>
              <button type="button" onClick={() => open(book)} title="View" aria-label={`View ${book.name}`} className={iconButton}><Eye size={16} /></button>
              <button type="button" onClick={() => download(book)} title="Download" aria-label={`Download ${book.name}`} className={iconButton}><Download size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </section>
  );
};

export default CatalogueLibrary;
