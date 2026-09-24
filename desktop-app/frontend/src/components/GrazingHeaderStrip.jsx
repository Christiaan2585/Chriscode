import React from "react";

// A small, purely decorative easter egg for the header: an original
// (not-Aardman) sheep and bull silhouette wandering across on a loop.
// Pure CSS/SVG, no images, no external deps - each animal is its own
// absolutely-positioned layer inside an overflow-hidden strip so they can
// each get their own walk speed/delay without fighting over layout.
const GrazingHeaderStrip = () => (
  <div className="relative h-10 w-40 sm:w-56 overflow-hidden select-none" aria-hidden="true">
    <div className="absolute bottom-0 left-0 w-full border-b border-dashed border-slate-200" />

    <div className="grazing-walker" style={{ animationDuration: "14s" }}>
      <Bull />
    </div>
    <div className="grazing-walker" style={{ animationDuration: "18s", animationDelay: "-6s" }}>
      <Sheep />
    </div>

    <style>{`
      .grazing-walker {
        position: absolute;
        bottom: 2px;
        left: 0;
        animation-name: graze-across;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      @keyframes graze-across {
        from { transform: translateX(-40px); }
        to { transform: translateX(168px); }
      }
      .grazing-bob {
        animation: graze-bob 0.9s ease-in-out infinite;
        transform-origin: center bottom;
      }
      @keyframes graze-bob {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        30% { transform: translateY(1px) rotate(-3deg); }
        60% { transform: translateY(0) rotate(2deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        .grazing-walker { animation: none; left: 20%; }
        .grazing-bob { animation: none; }
      }
    `}</style>
  </div>
);

const Bull = () => (
  <svg width="30" height="22" viewBox="0 0 30 22" fill="none" className="text-slate-500">
    <g className="grazing-bob">
      <path d="M6 8c-1.5-2-4-2-5 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="18" cy="12" rx="9" ry="6" fill="currentColor" />
      <circle cx="7" cy="9" r="4.2" fill="currentColor" />
      <path d="M4 6l-2-2.5M10 6l2-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="9" y="17" width="1.6" height="4" fill="currentColor" />
      <rect x="15" y="17" width="1.6" height="4" fill="currentColor" />
      <rect x="21" y="17" width="1.6" height="4" fill="currentColor" />
      <rect x="25" y="17" width="1.6" height="4" fill="currentColor" />
      <path d="M27 10c1.5 0 2.5 1 2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  </svg>
);

const Sheep = () => (
  <svg width="24" height="20" viewBox="0 0 24 20" fill="none" className="text-slate-400">
    <g className="grazing-bob" style={{ animationDelay: "-0.6s" }}>
      <ellipse cx="13" cy="10" rx="8" ry="6.5" fill="currentColor" />
      <circle cx="16" cy="6" r="3" fill="currentColor" opacity="0.7" />
      <circle cx="5" cy="9" r="3" fill="#334155" />
      <rect x="4" y="16" width="1.4" height="3.4" fill="#334155" />
      <rect x="9" y="16" width="1.4" height="3.4" fill="#334155" />
      <rect x="15" y="16" width="1.4" height="3.4" fill="#334155" />
      <rect x="19" y="16" width="1.4" height="3.4" fill="#334155" />
    </g>
  </svg>
);

export default GrazingHeaderStrip;
