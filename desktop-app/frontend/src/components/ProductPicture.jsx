import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Package, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";

export const MAX_PICTURE_BYTES = 10 * 1024 * 1024; // matches the backend limit
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

// {productId: data URL} for every product with a picture - one request for
// the whole list, shared by everything that shows product thumbnails.
export const useProductThumbnails = () =>
  useQuery({
    queryKey: ["product-thumbnails"],
    queryFn: async () => (await apiClient.get("/products/thumbnails")).data,
  }).data || {};

// Sends the picture chosen in the product form (or its removal) once the
// product itself has been saved.
export async function savePictureChange(productId, { file, remove }) {
  if (file) {
    const body = new FormData();
    body.append("file", file);
    // Explicit: the client defaults to JSON, which would turn the upload into JSON.
    await apiClient.put(`/products/${productId}/image`, body, { headers: { "Content-Type": "multipart/form-data" } });
  } else if (remove) {
    await apiClient.delete(`/products/${productId}/image`);
  }
}

// Returns an error message, or null when the file is acceptable.
export function checkPictureFile(file) {
  if (!ACCEPTED.includes(file.type)) return "Please choose a JPG, PNG or WEBP picture.";
  if (file.size > MAX_PICTURE_BYTES) return "That picture is over 10 MB - please use a smaller one.";
  return null;
}

export const ProductThumb = ({ product, src, onOpen, size = "h-10 w-10" }) =>
  src ? (
    <button type="button" onClick={() => onOpen(product)} title={`View picture of ${product.name}`}
      className={`${size} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500`}>
      <img src={src} alt={product.name} className="h-full w-full object-cover" />
    </button>
  ) : (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600`} aria-hidden="true">
      <Package size={16} />
    </div>
  );

// The full-size picture. Fetched with the signed-in request (an <img src>
// can't send the sign-in token) and shown from a blob: URL - the packaged
// CSP allows blob: images for this.
export const ProductPictureViewer = ({ product, onClose }) => {
  const { data: blob, isError } = useQuery({
    queryKey: ["product-image", product?.id],
    queryFn: async () => (await apiClient.get(`/products/${product.id}/image`, { responseType: "blob" })).data,
    enabled: Boolean(product),
    gcTime: 0,
  });
  const url = useObjectUrl(blob);

  return (
    <Modal isOpen={Boolean(product)} onClose={onClose} title={product?.name || ""} size="lg">
      <div className="flex min-h-64 items-center justify-center rounded-lg bg-slate-50">
        {isError ? (
          <p className="text-sm text-red-600">Couldn't load the picture.</p>
        ) : url ? (
          <img src={url} alt={product?.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
        ) : (
          <p className="text-sm text-slate-400">Loading picture…</p>
        )}
      </div>
    </Modal>
  );
};

function useObjectUrl(blob) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) return undefined;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [blob]);
  return url;
}

// Picture section of the product form. Changes are only staged here
// (`change` = {file, remove}); the form applies them on Save.
export const PictureField = ({ currentSrc, change, onChange }) => {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const pendingUrl = useObjectUrl(change.file);
  const shown = pendingUrl || (change.remove ? null : currentSrc);

  const pick = (file) => {
    if (!file) return;
    const problem = checkPictureFile(file);
    setError(problem);
    if (!problem) onChange({ file, remove: false });
  };

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">Picture</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
        className={`flex items-center gap-4 rounded-xl border border-dashed p-3 ${dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}
      >
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
          {shown ? <img src={shown} alt="Product" className="h-full w-full object-cover" /> : <Package size={28} aria-hidden="true" />}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-400">
              <ImagePlus size={16} /> {shown ? "Change picture" : "Choose picture"}
            </button>
            {shown && (
              <button type="button" onClick={() => { setError(null); onChange({ file: null, remove: true }); }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:text-red-600">
                <Trash2 size={16} /> Remove
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">JPG, PNG or WEBP up to 10 MB - or drag a photo here.</p>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </div>
        <input ref={inputRef} type="file" accept={ACCEPTED.join(",")} className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
};
