import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 150;
const CARD_WIDTH = 288;
const GAP = 8;

// Below the trigger when there's room, above it otherwise, kept inside the
// window horizontally.
function placeCard(rect) {
  const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - CARD_WIDTH - GAP);
  return rect.bottom > window.innerHeight * 0.6
    ? { left, bottom: window.innerHeight - rect.top + GAP }
    : { left, top: rect.bottom + GAP };
}

// Shows `renderContent()` in a floating card after the pointer rests on (or
// keyboard focus lands on) the children. The content only mounts while the
// card is open, so any data it fetches is fetched on demand.
const HoverCard = ({ renderContent, children, className = "" }) => {
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const timer = useRef(null);
  const cardId = useId();

  const open = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPosition(placeCard(triggerRef.current.getBoundingClientRect())), OPEN_DELAY_MS);
  };
  const close = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPosition(null), CLOSE_DELAY_MS);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // The card is positioned against the viewport, so it would drift away from
  // its row on scroll - close it instead.
  useEffect(() => {
    if (!position) return undefined;
    const hide = () => setPosition(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [position]);

  return (
    <span
      ref={triggerRef}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      aria-describedby={position ? cardId : undefined}
      className={className}
    >
      {children}
      {position &&
        createPortal(
          <div
            id={cardId}
            role="tooltip"
            style={{ position: "fixed", width: CARD_WIDTH, ...position }}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={close}
            className="z-50 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm shadow-xl"
          >
            {renderContent()}
          </div>,
          document.body
        )}
    </span>
  );
};

export default HoverCard;
