import React from "react";

// A small, purely decorative easter egg for the header: a border collie
// chasing a cow chasing a sheep across the header, on a loop. Pure
// CSS/SVG, no images, no external deps, and an original design (not the
// Aardman-owned Shaun the Sheep character).
//
// The running motion is a real 2-frame gallop cycle rather than
// continuous joint rotation: each animal has two whole leg-pose groups
// (front-forward/back-back vs front-back/back-forward) that snap between
// each other with a hard `steps(1)` toggle - the same technique classic
// sprite-sheet running animation uses - combined with a small vertical
// bounce and a shadow that squashes on each footfall. This reads as an
// actual run at icon scale in a way continuous rotation never quite did.
// All styling lives in index.css, not a <style> tag here: the packaged
// app's CSP (style-src 'self', no 'unsafe-inline') blocks inline <style>
// elements, which left this whole scene unstyled and frozen in production.
const GrazingHeaderStrip = () => (
  <div className="chase-strip relative h-12 w-full max-w-xs overflow-hidden select-none" aria-hidden="true">
    <Pasture />
    <div className="chase-group">
      <div className="runner runner-dog"><Dog /></div>
      <div className="runner runner-cow"><Cow /></div>
      <div className="runner runner-sheep"><Sheep /></div>
    </div>
  </div>
);

// Dust kicked up behind the hind feet. Drawn outside each animal's mirror
// group so "behind" is always the left side (the direction they came from).
const Dust = ({ y }) => (
  <g>
    <circle className="dust dust-1" cx="4" cy={y} r="1.6" fill="#c8b58a" />
    <circle className="dust dust-2" cx="2" cy={y - 1} r="1.2" fill="#d6c7a1" />
  </g>
);

// A little green pasture strip along the bottom of the header, so the
// chase has somewhere to actually run - a repeating SVG pattern (ground
// band + grass-tuft ticks) that stretches to fill the container at
// whatever width it ends up being.
const Pasture = () => (
  <svg
    className="absolute bottom-0 left-0 w-full h-3"
    viewBox="0 0 40 12"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <pattern id="grazing-grass-tuft" width="8" height="12" patternUnits="userSpaceOnUse">
        <rect x="0" y="3" width="8" height="9" fill="#86c47c" />
        <path d="M1.5 3 L1 0.5 M3 3 L3.4 0.2 M4.6 3 L4.2 0.6 M6.4 3 L6.9 0.8" stroke="#5da157" strokeWidth="0.6" strokeLinecap="round" />
      </pattern>
    </defs>
    <rect x="0" y="3" width="40" height="9" fill="url(#grazing-grass-tuft)" />
  </svg>
);

const Dog = () => (
  <svg width="30" height="24" viewBox="0 0 30 24" fill="none">
    <ellipse className="run-shadow" cx="15" cy="22" rx="10" ry="1.4" fill="#0f172a" opacity="0.25" />
    <Dust y={21} />
    {/* Mirrored so the head leads on the right, matching the direction of
       travel (the shapes below were drawn head-on-the-left). */}
    <g transform="scale(-1,1) translate(-30,0)">
      <g className="gallop-body">
        <g className="legs-a" fill="#111827">
          <path d="M8 15l-4 5.5h2.4L10 16z" />
          <path d="M12 16l1 5.5h2l-1.6-6z" />
          <path d="M19 15l4.4 5.5H21L17 16z" />
          <path d="M22 13.5l3.6 3.8-1.4 1.4-4-4.4z" />
        </g>
        <g className="legs-b" fill="#111827">
          <path d="M9 16l1.4 5.5h2l-2-6z" />
          <path d="M13 15l-3.6 5.5h2.3l3-5z" />
          <path d="M21 16l1.6 5.5H25l-2-6z" />
          <path d="M18 13.8l-4 4.4-1.5-1.3 3.7-4z" />
        </g>

        {/* Body: black with a white chest blaze, tail curling up behind */}
        <path d="M6 16c-.5-3 2-6.5 7-6.5s10 1 12.5-1c1.4-1 2 .3 1 1.4-1.3 1.4-2.8 2.1-4 2.4 1.6.6 2.7 2 2.7 3.7 0 2.6-3 4-8.7 4S6.6 18.7 6 16Z" fill="#0f172a" />
        <path d="M9 15.3c0-2 2-3.6 4.6-3.6 1 0 1.8.7 1.8 1.7 0 1.7-1.6 3-3.6 3-1.5 0-2.8-.5-2.8-1.1Z" fill="#f8fafc" />

        {/* Head, pointed ear, open-mouth chase face */}
        <g>
          <path d="M5.2 12.5c-1.6-.3-2.8.4-3 1.7-.2 1.4 1 2.3 2.6 2.3 1.8 0 3.2-1 3.2-2.4 0-.9-.8-1.5-2.8-1.6Z" fill="#0f172a" />
          <path d="M4.6 12c.2-1.4 1-2.6 2.2-2.9-.4 1-.4 2 0 2.8Z" fill="#0f172a" />
          <path d="M3 14.6c.9.5 2 .6 2.8.2" stroke="#f8fafc" strokeWidth="0.7" strokeLinecap="round" />
          <circle cx="4.3" cy="13.2" r="0.5" fill="#f8fafc" />
        </g>
      </g>
    </g>
  </svg>
);

const Cow = () => (
  <svg width="38" height="28" viewBox="0 0 38 28" fill="none">
    <ellipse className="run-shadow" cx="19" cy="26" rx="13" ry="1.6" fill="#0f172a" opacity="0.25" />
    <Dust y={25} />
    <g className="gallop-body">
      <g className="legs-a" fill="#1e293b">
        <path d="M10 18l-4.6 6.5h2.8L12 19z" />
        <path d="M15 19l1 6.5h2.4l-1.8-7z" />
        <path d="M24 18l5 6.5h-2.8l-4.6-5.5z" />
        <path d="M28 16l4 4.4-1.6 1.6-4.6-5z" />
      </g>
      <g className="legs-b" fill="#1e293b">
        <path d="M11 19l1.6 6.5h2.4l-2.4-7z" />
        <path d="M16 18l-4.2 6.5h2.8l3.6-6z" />
        <path d="M26 19l2 6.5h2.8l-2.4-7z" />
        <path d="M22 16l-4.6 5-1.6-1.6 4-4.4z" />
      </g>

      {/* White body base */}
      <path d="M6 19c-.6-4 2.6-8 9-8 3 0 12 .2 14.4-1.6 1.3-1 2 .4 1 1.6-1 1.3-2.4 2.2-4 2.6 2 .6 3.6 2.3 3.6 4.6 0 3-4 4.8-12 4.8S6.7 22 6 19Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.4" />
      {/* Black Holstein patches */}
      <path d="M9 13c2-1.4 5-1.6 6.6-.4 1.6 1.2.6 3.2-1.6 3.6-2.4.4-6.6-1.6-5-3.2Z" fill="#111827" />
      <path d="M18 12.4c2.2-.6 5 0 5.6 1.4.6 1.4-1 2.6-3.4 2.6s-4.6-3.2-2.2-4Z" fill="#111827" />
      <path d="M24.5 17c1.4-.4 3 .2 3 1.4 0 1.2-1.6 2-3.2 1.6-1.6-.4-1.4-2.6.2-3Z" fill="#111827" />

      {/* Tail */}
      <path d="M7 15 Q3 15.5 2.4 19.5" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <ellipse cx="2.2" cy="20.4" rx="1.6" ry="1.1" fill="#111827" />

      {/* Head + horns, ears back (running pose) */}
      <g>
        <ellipse cx="32" cy="10" rx="4.6" ry="4.2" fill="#f8fafc" />
        <path d="M29 7c-1.6-1.4-2.8-1-3-1.6-.2-.6.6-1 1.8-.6 1.2.4 2 1.2 2.2 2Z" fill="#111827" />
        <path d="M34 7.4c1.4-1.6 2.6-1.4 2.7-2 .1-.6-.7-.9-1.8-.4-1.1.5-1.8 1.4-1.9 2.4Z" fill="#111827" />
        <path d="M28.2 3.4c-.8-1.4-.4-2.6.4-2.8.8-.2 1.4.8 1.2 2.2Z" fill="#e5b45a" />
        <path d="M35.4 3.6c.9-1.3.6-2.5-.2-2.8-.8-.3-1.5.6-1.4 2.1Z" fill="#e5b45a" />
        <ellipse cx="33.4" cy="11.4" rx="2" ry="1.6" fill="#111827" />
        <circle cx="34.3" cy="8.6" r="0.6" fill="#0f172a" />
      </g>
    </g>
  </svg>
);

const Sheep = () => (
  <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
    <ellipse className="run-shadow" cx="16" cy="22" rx="11" ry="1.5" fill="#0f172a" opacity="0.25" />
    <Dust y={21} />
    {/* Mirrored so the head leads on the right, matching the direction of
       travel (the shapes below were drawn head-on-the-left). */}
    <g transform="scale(-1,1) translate(-32,0)">
      <g className="gallop-body">
        <g className="legs-a" fill="#111827">
          <path d="M8 14.5l-3.8 5.5h2.4L10 15.3z" />
          <path d="M13 15.3l.8 5.7h2l-1.4-6z" />
          <path d="M21 14.5l4 5.5h-2.4l-3.4-4.7z" />
          <path d="M24.5 12.6l3.4 3.8-1.4 1.4-3.6-4z" />
        </g>
        <g className="legs-b" fill="#111827">
          <path d="M9 15.3l1.2 5.7h2l-1.8-6.2z" />
          <path d="M14 14.5l-3.4 5.7h2.4l2.6-5z" />
          <path d="M23 15.3l1.6 5.7h2.4l-1.8-6.2z" />
          <path d="M19.5 12.8l-3.6 4-1.4-1.3 3.4-3.8z" />
        </g>

        {/* Fluffy cream wool body */}
        <g fill="#f1ede4">
          <circle cx="12" cy="10.5" r="4.6" />
          <circle cx="17" cy="8.4" r="5.1" />
          <circle cx="22" cy="9.8" r="4.6" />
          <circle cx="17" cy="13" r="5.3" />
        </g>

        {/* Black face + ears, black legs already drawn above */}
        <g>
          <path d="M9 11c-1.2-2-2.6-2.8-4-2.8" stroke="#111827" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <ellipse cx="4" cy="7.6" rx="2.8" ry="2.5" fill="#111827" />
          <path d="M2.2 5.6l-1.6-1.2M5.6 5.4l1.6-1.3" stroke="#0f172a" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="5" cy="7" r="0.5" fill="#e2e8f0" />
        </g>
      </g>
    </g>
  </svg>
);

export default GrazingHeaderStrip;
