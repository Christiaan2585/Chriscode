import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { readQr } from "../utils/qrScan";

const SCAN_EVERY_MS = 150; // plenty for a held-still code, light on a phone's battery
const MAX_FRAME_WIDTH = 640; // decoding a smaller copy of the frame is faster and just as reliable

const cameraProblem = (error) =>
  error?.name === "NotAllowedError" || error?.name === "SecurityError"
    ? "Camera access was denied. Allow Camera for Sandveld in the phone's app settings, or enter the details manually."
    : error?.name === "NotFoundError"
      ? "This phone has no camera Sandveld can use. Enter the details manually instead."
      : "Couldn't start the camera. Close other apps that use it, or enter the details manually.";

// Full-screen camera view that reads one QR code. `accept(text)` says whether
// the code is the kind we want; anything else is ignored with a hint and the
// camera keeps looking. The camera is released as soon as this closes.
const QrScanner = ({ accept, onResult, onClose }) => {
  const video = useRef(null);
  const [problem, setProblem] = useState(null);
  const [hint, setHint] = useState(null);
  const latest = useRef({ accept, onResult });
  latest.current = { accept, onResult };

  useEffect(() => {
    let stream = null;
    let timer = null;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const scan = () => {
      const el = video.current;
      if (stopped || !el) return;
      if (el.readyState >= 2 && el.videoWidth) {
        const scale = Math.min(1, MAX_FRAME_WIDTH / el.videoWidth);
        canvas.width = Math.round(el.videoWidth * scale);
        canvas.height = Math.round(el.videoHeight * scale);
        context.drawImage(el, 0, 0, canvas.width, canvas.height);
        const text = readQr(context.getImageData(0, 0, canvas.width, canvas.height));
        if (text) {
          if (latest.current.accept(text)) {
            stopped = true;
            latest.current.onResult(text);
            return;
          }
          setHint("That QR code isn't from the Sandveld app. Scan the one on the office PC.");
        }
      }
      timer = setTimeout(scan, SCAN_EVERY_MS);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.current.srcObject = s;
        return video.current.play().then(scan);
      })
      .catch((e) => !stopped && setProblem(cameraProblem(e)));

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div role="dialog" aria-label="Scan the QR code" className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-medium">Scan the QR code on the office PC</span>
        <button type="button" onClick={onClose} aria-label="Close the camera" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={video} muted playsInline className="h-full w-full object-cover" />
        {!problem && (
          <div aria-hidden="true" className="pointer-events-none absolute h-64 w-64 rounded-2xl border-4 border-emerald-400/90" />
        )}
      </div>
      <p role={problem ? "alert" : "status"} className="p-4 text-center text-sm text-white">
        {problem || hint || "Hold the phone so the whole code is inside the square."}
      </p>
    </div>
  );
};

export default QrScanner;
