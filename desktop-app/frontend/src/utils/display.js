// Text size and high contrast (Settings -> General -> Appearance), for older eyes or a bright farm office. Kept on this
// computer / phone like the colour scheme. The whole app is sized in rem, so changing the page's base size scales
// everything; high contrast is the `high-contrast` class on <html> (rules in index.css).
import { readStored, writeStored } from "./stored.js";

export const TEXT_SIZES = [
  { id: "normal", label: "Normal", percent: 100 },
  { id: "large", label: "Large", percent: 112.5 },
  { id: "xlarge", label: "Extra large", percent: 125 },
];

const SIZE_KEY = "sandveld_text_size";
const CONTRAST_KEY = "sandveld_contrast";
export const DISPLAY_CHANGED = "sandveld-display";

export const cleanTextSize = (id) => (TEXT_SIZES.some((s) => s.id === id) ? id : "normal");
export const cleanContrast = (value) => (value === "high" ? "high" : "normal");
export const sizePercent = (id) => TEXT_SIZES.find((s) => s.id === cleanTextSize(id)).percent;

export const getTextSize = () => cleanTextSize(readStored(SIZE_KEY, "normal"));
export const getContrast = () => cleanContrast(readStored(CONTRAST_KEY, "normal"));

export function applyDisplay(root = document.documentElement) {
  root.style.fontSize = `${sizePercent(getTextSize())}%`;
  root.classList.toggle("high-contrast", getContrast() === "high");
  if (typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new Event(DISPLAY_CHANGED));
}

export function setTextSize(id, root) {
  writeStored(SIZE_KEY, cleanTextSize(id));
  applyDisplay(root);
}

export function setContrast(value, root) {
  writeStored(CONTRAST_KEY, cleanContrast(value));
  applyDisplay(root);
}
