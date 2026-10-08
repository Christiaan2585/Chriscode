import React from "react";

// The header's running scene, left to right: a sheep, a cow, a red-and-white collie and the farmer's
// bakkie, all running left across a misty paddock at dusk with the bakkie's headlights on.
// Drawn from scratch as vector art and kept deliberately calm: slow parallax hills, a steady stride,
// no sway and no flicker, so it never tires the eye. (A first attempt that cut a photo into sprite
// layers looked bad - moving boxes and a jittery sway - so don't go back to photo cut-outs.)
//
// How it moves: the animals run on the spot while the hills, trees and grass slide past at different
// speeds, which is what makes them look like they are running. Each leg is two parts (thigh and shin)
// that swing on their own with a phase offset, giving a proper gallop. All motion is CSS in index.css
// (`.chase-*`); the packaged app's CSP blocks inline <style> elements.
// Everything is drawn facing right and mirrored, so the animals run left.

const W = 720;
const H = 124;
const GROUND = 112; // the y where hooves, paws and wheels touch the grass

// A limb that swings at the hip and bends at the knee: `thigh` and `shin` are the drawings of each part,
// the shin hanging `upper` below the hip.
const Limb = ({ x, y, upper, phase, thigh, shin }) => (
  <g transform={`translate(${x},${y})`}>
    <g className="chase-thigh" style={{ "--ph": phase }}>
      {thigh}
      <g transform={`translate(0,${upper})`}>
        <g className="chase-shin" style={{ "--ph": phase }}>{shin}</g>
      </g>
    </g>
  </g>
);

const Leg = ({ x, y, upper, lower, w = 6, phase, color, hoof = "#2a2521", knee = 0 }) => (
  <Limb
    x={x} y={y} upper={upper} phase={phase}
    thigh={<path d={`M${-w / 2 - 1},0 L${w / 2 + 1},0 L${w / 2 + knee},${upper} L${-w / 2 + knee},${upper} Z`} fill={color} />}
    shin={(
      <g transform={`translate(${knee},0)`}>
        <path d={`M${-w / 2},0 L${w / 2},0 L${w / 2 - 1},${lower - 3} L${-w / 2 + 1},${lower - 3} Z`} fill={color} />
        <path d={`M${-w / 2 + 0.5},${lower - 3.5} L${w / 2 - 0.5},${lower - 3.5} L${w / 2 + 1.5},${lower} L${-w / 2 - 0.5},${lower} Z`} fill={hoof} />
      </g>
    )}
  />
);

/* ------------------------------------------------------------------ the collie */

const FUR = { dark: "#6f2a12", red: "#9a431b", copper: "#bf6c2e", tan: "#dca667", white: "#f8f4ea", shade: "#d9d2c3", nose: "#1b1210" };

// Front leg: a white forearm under a copper shoulder, with a little feathering behind it.
const collieFront = (x, phase, far) => {
  const sock = far ? FUR.shade : FUR.white;
  return (
    <Limb
      x={x} y={-25} upper={13} phase={phase}
      thigh={(
        <g>
          <path d="M-4,0 C-4,-3 4.2,-3 4.2,0 L3.2,13.6 L-2.6,13.6 Z" fill={sock} />
          <path d="M-2.6,4 L-5.4,10.6 L-3.4,12 L-2.4,9 Z M-2.6,8 L-4.6,13 L-2.4,13 Z" fill={sock} />
          <ellipse cx="0" cy="-0.6" rx="5.2" ry="4.2" fill={far ? FUR.red : FUR.white} />
        </g>
      )}
      shin={(
        <g>
          <path d="M-2.6,-0.2 L3,-0.2 L2.2,9.6 L-1.8,9.6 Z" fill={sock} />
          <path d="M-2.8,9 C-2.6,7.2 3.2,7.2 3.2,9 C5,11 3.6,13.6 0.8,13.6 C-1.8,13.6 -3.4,11.4 -2.8,9 Z" fill={sock} />
          <path d="M-0.6,11.4 L-0.6,13 M1.4,11.4 L1.4,13" stroke="#bdb6a6" strokeWidth="0.5" />
        </g>
      )}
    />
  );
};

// Hind leg: a strong copper thigh, tan feathering, white socks.
const collieHind = (x, phase, far) => (
  <Limb
    x={x} y={-27} upper={13} phase={phase}
    thigh={(
      <g>
        <path d="M-7,-3 C-3,-8 6,-6 6.6,0 C6.4,6 4.2,10 2.6,13.8 L-2.6,13.8 C-3.6,9.4 -8,4 -7,-3 Z" fill={far ? FUR.red : FUR.copper} />
        <path d="M-7,-1 C-9.4,3.4 -8,8.6 -4.6,12 L-2.4,9.4 C-4.6,6 -5,2 -4.4,-0.4 Z" fill={far ? FUR.tan : "#e2b479"} />
      </g>
    )}
    shin={(
      <g>
        <path d="M-2.6,-0.2 L3,-0.2 L2.4,9.6 L-1.8,9.6 Z" fill={far ? FUR.tan : "#e2b479"} />
        <path d="M-2.8,9 C-2.6,7.2 3.2,7.2 3.4,9 C5,11 3.6,13.6 1,13.6 C-1.8,13.6 -3.6,11.4 -2.8,9 Z" fill={far ? FUR.shade : FUR.white} />
      </g>
    )}
  />
);

// The plumed tail: red with a white tip. (Positioned and swung by whoever uses it.)
const CollieTail = ({ className = "chase-tail chase-tail-dog" }) => (
  <g transform="translate(-35,-38)">
    <g className={className}>
      <path d="M1,-3 C-12,-5 -27,-12 -35,-26 C-31,-33 -26,-31 -25,-26 C-22,-14 -12,-4 1,4 Z" fill={FUR.red} />
      <path d="M-4,-1 C-16,-2 -26,-10 -31,-21 C-24,-14 -14,-6 -3,2 Z" fill={FUR.copper} />
      <path d="M-35,-26 C-31,-33 -26,-31 -25,-26 C-27,-24 -30,-23 -32.5,-23.4 Z" fill={FUR.white} />
    </g>
  </g>
);

// Body, white chest and ruff, and the head - everything above the legs.
const CollieBody = ({ earClass = "" }) => (
  <g>
    <path d="M-38,-34 C-41,-46 -28,-51 -13,-49 C-2,-48 10,-50 23,-50 C32,-50 36,-44 36,-37 L32,-21 C24,-13 12,-13 4,-16 C-4,-19 -12,-19 -23,-21 C-34,-24 -40,-27 -38,-34 Z" fill="url(#chase-coat)" />
    <path d="M-34,-33 C-30,-26 -20,-24 -8,-24 C4,-24 14,-27 24,-31 L24,-25 C12,-18 -8,-19 -24,-22 C-33,-25 -38,-28 -34,-33 Z" fill={FUR.copper} opacity="0.6" />
    <path d="M-26,-21 C-18,-24 -10,-25 -4,-23 L-6,-19 C-12,-20 -20,-19 -26,-21 Z" fill={FUR.tan} />
    {/* white chest and the ruff round the neck */}
    <path d="M36,-44 C42,-40 41,-30 36,-24 L32,-20 C24,-12 14,-13 9,-16 C16,-22 22,-30 26,-42 Z" fill={FUR.white} />
    <path d="M30,-46 C38,-50 46,-47 46,-39 C46,-33 41,-27 36,-23 C38,-30 36,-38 30,-46 Z" fill={FUR.white} />
    <g fill={FUR.white}><circle cx="34" cy="-22" r="3" /><circle cx="29" cy="-18" r="3.2" /><circle cx="23" cy="-15" r="3" /><circle cx="17" cy="-14" r="2.8" /><circle cx="40" cy="-28" r="2.4" /></g>
    <path d="M28,-30 C31,-26 31,-22 28,-18 M22,-27 C25,-23 25,-19 22,-16" stroke={FUR.shade} strokeWidth="0.8" fill="none" strokeLinecap="round" />
    {/* head */}
    <path d="M34,-51 C38,-57 47,-57 51,-52 L62,-46 C65,-45 66,-42 63,-40 L53,-37 C49,-34 41,-35 37,-39 C32,-43 31,-48 34,-51 Z" fill={FUR.red} />
    <path d="M45,-55 C48,-54 51,-51 53,-49 L63,-45 C64,-44.4 64.4,-43 63.4,-41.6 L57,-43.6 L48,-50 Z" fill={FUR.white} />
    <path d="M52,-38 L63,-40.4 C61,-37.2 55,-35.6 51,-36 Z" fill={FUR.white} />
    <ellipse cx="42" cy="-41.5" rx="6.4" ry="4.2" fill={FUR.tan} opacity="0.9" />
    <ellipse cx="63" cy="-43" rx="2.1" ry="1.7" fill={FUR.nose} />
    <path d="M53,-37 C55,-33.4 59,-33 61,-35.6 C59,-35 56,-35.4 53,-37 Z" fill="#e2808a" />
    <path d="M62.4,-40.4 C58,-39.4 54,-38.6 50.6,-39" stroke="#3a1c10" strokeWidth="0.7" fill="none" />
    <ellipse cx="47.4" cy="-48" rx="1.9" ry="1.2" fill="#d79e30" /><circle cx="47.8" cy="-48" r="0.8" fill="#1b1210" />
    <circle cx="46" cy="-51.4" r="1.4" fill={FUR.tan} />
    <g transform="translate(37,-55)">
      <g className={earClass}>
        <path d="M0,0 C-2,-8 5,-11 11,-6 C7,-5.4 5,-3 4,1 Z" fill={FUR.dark} />
        <path d="M2,-1 C1.6,-5.4 5,-7.6 8,-5.6 C5.6,-5.2 4.4,-3.4 4,-0.6 Z" fill={FUR.copper} opacity="0.8" />
      </g>
    </g>
  </g>
);

const Dog = () => (
  <g className="chase-animal" style={{ "--T": "0.5s" }}>
    <ellipse className="chase-shadow" cx="2" cy="1" rx="36" ry="2.6" fill="#0b1320" opacity="0.35" />
    <defs>
      <linearGradient id="chase-coat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={FUR.dark} /><stop offset="0.45" stopColor={FUR.red} /><stop offset="1" stopColor={FUR.copper} />
      </linearGradient>
    </defs>
    {collieHind(-16, 0.1, true)}
    {collieFront(14, 0.58, true)}
    <g className="chase-bob chase-bob-dog">
      <CollieTail />
      <CollieBody />
    </g>
    {collieHind(-24, 0.55, false)}
    {collieFront(24, 0.0, false)}
  </g>
);

/* ------------------------------------------------------------------ the cow */

const Cow = () => (
  <g className="chase-animal" style={{ "--T": "0.78s" }}>
    <ellipse className="chase-shadow" cx="4" cy="1" rx="54" ry="3.2" fill="#0b1320" opacity="0.35" />
    <defs>
      <linearGradient id="chase-cow-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" /><stop offset="0.55" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#0b1320" stopOpacity="0.34" />
      </linearGradient>
      <clipPath id="chase-cow-body">
        <path d="M-54,-60 C-56,-70 -44,-76 -28,-75 C-8,-73 6,-76 26,-78 C40,-79 50,-77 56,-71 C60,-60 58,-44 48,-34 C34,-28 -30,-27 -46,-33 C-56,-39 -56,-50 -54,-60 Z" />
      </clipPath>
    </defs>
    <Leg x={-32} y={-34} upper={19} lower={15} w={8.5} phase={0.58} color="#bdb6a8" />
    <Leg x={34} y={-34} upper={19} lower={15} w={8} phase={0.1} color="#bdb6a8" />
    <g className="chase-bob">
      <g transform="translate(-52,-64)"><g className="chase-tail"><path d="M0,0 C-8,4 -9,17 -7,28" stroke="#ece7db" strokeWidth="2.4" fill="none" strokeLinecap="round" /><path d="M-7,27 C-11,31 -10,38 -7,40 C-4,38 -3,31 -7,27 Z" fill="#1b1c21" /></g></g>
      <path d="M-54,-60 C-56,-70 -44,-76 -28,-75 C-8,-73 6,-76 26,-78 C40,-79 50,-77 56,-71 C60,-60 58,-44 48,-34 C34,-28 -30,-27 -46,-33 C-56,-39 -56,-50 -54,-60 Z" fill="#f5f1e8" />
      <g clipPath="url(#chase-cow-body)">
        <g fill="#1b1c21">
          <path d="M-36,-76 C-24,-80 -6,-74 -8,-62 C-10,-52 -26,-50 -34,-56 C-42,-62 -42,-72 -36,-76 Z" />
          <path d="M2,-60 C14,-64 26,-58 24,-47 C22,-38 8,-37 0,-43 C-6,-48 -4,-57 2,-60 Z" />
          <path d="M-56,-52 C-48,-56 -40,-48 -42,-38 C-44,-30 -54,-32 -58,-40 Z" />
          <path d="M34,-80 C44,-82 52,-76 50,-66 C44,-62 34,-64 32,-72 Z" />
        </g>
        <rect x="-60" y="-80" width="124" height="54" fill="url(#chase-cow-shade)" />
      </g>
      <path d="M-34,-31 C-30,-26 -22,-24 -16,-26 C-10,-24 -3,-25 2,-29 C-6,-28 -26,-28 -34,-31 Z" fill="#e3a8a6" />
      <path d="M-13,-27 C-12,-22 -8,-20 -6,-24 C-5,-26 -8,-28 -13,-27 Z" fill="#d79491" />
      {/* neck, head, blaze, ear and horn */}
      <path d="M44,-72 C54,-82 72,-80 82,-69 L96,-52 C99,-46 94,-41 88,-43 L78,-45 C68,-43 57,-48 50,-58 Z" fill="#1b1c21" />
      <path d="M68,-74 C74,-72 80,-66 84,-60 L92,-50 L85,-49 L76,-58 Z" fill="#f5f1e8" />
      <path d="M85,-47 C90,-52 97,-50 97,-45 C96,-41 90,-41 85,-43 Z" fill="#e3a8a6" />
      <circle cx="91" cy="-47" r="1" fill="#a55f61" />
      <path d="M62,-76 C58,-86 62,-90 66,-86 Z" fill="#d9ccaa" />
      <path d="M62,-75 C54,-83 46,-80 47,-71 C52,-69 58,-70 62,-75 Z" fill="#14151a" />
      <path d="M55,-74 C52,-78 50,-76 51,-73 Z" fill="#c98986" opacity="0.8" />
      <ellipse cx="75" cy="-62" rx="2.1" ry="1.5" fill="#f5f1e8" /><circle cx="75.4" cy="-62" r="1" fill="#0e0f13" />
    </g>
    <Leg x={-44} y={-34} upper={19} lower={15} w={8.5} phase={0.5} color="#f5f1e8" />
    <Leg x={44} y={-34} upper={19} lower={15} w={8} phase={0} color="#f5f1e8" />
  </g>
);

/* ------------------------------------------------------------------ the sheep */

const WOOL = [
  [-24, -36, 11], [-10, -41, 12], [6, -42, 12.5], [21, -38, 11.5], [31, -31, 9], [-30, -26, 9.5], [-18, -22, 11], [-3, -21, 11.5],
  [12, -21, 11], [24, -24, 9.5], [-17, -32, 12.5], [0, -33, 13], [14, -32, 12], [-26, -34, 8], [27, -35, 8.5],
];
const Sheep = () => (
  <g className="chase-animal" style={{ "--T": "0.58s" }}>
    <ellipse className="chase-shadow" cx="2" cy="1" rx="33" ry="2.6" fill="#0b1320" opacity="0.35" />
    <defs>
      <radialGradient id="chase-wool" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#fffdf7" /><stop offset="0.6" stopColor="#efebe0" /><stop offset="1" stopColor="#cfc9ba" />
      </radialGradient>
    </defs>
    <Leg x={-18} y={-18} upper={9} lower={9} w={5} phase={0.58} color="#3f3633" hoof="#221c1a" />
    <Leg x={21} y={-18} upper={9} lower={9} w={5} phase={0.1} color="#3f3633" hoof="#221c1a" />
    <g className="chase-bob chase-bob-sheep">
      <g fill="#bdb6a6">{WOOL.map(([x, y, r]) => <circle key={`s${x}${y}`} cx={x + 1.6} cy={y + 2.4} r={r} />)}</g>
      <g fill="url(#chase-wool)">{WOOL.map(([x, y, r]) => <circle key={`w${x}${y}`} cx={x} cy={y} r={r} />)}</g>
      <g fill="none" stroke="#d6d0c1" strokeWidth="0.8" strokeLinecap="round">
        <path d="M-20,-38 C-17,-42 -13,-42 -11,-39 M2,-44 C5,-48 9,-47 10,-44 M18,-40 C21,-43 25,-42 26,-39 M-8,-28 C-5,-31 -1,-31 1,-28 M10,-26 C13,-29 17,-28 18,-25" />
      </g>
      {/* head: a long dark face with a woolly poll and a lop ear */}
      <path d="M27,-38 C34,-45 45,-41 49,-32 C51,-26 47,-22 42,-23 C35,-24 29,-29 27,-38 Z" fill="#372f2c" />
      <path d="M30,-38 C34,-48 42,-47 45,-40 C40,-42 34,-41 30,-38 Z" fill="#f1eee4" />
      <path d="M31,-33 C28,-31 27,-27 29,-25 C32,-26 34,-29 33,-33 Z" fill="#4d423e" />
      <ellipse cx="48" cy="-27" rx="2.6" ry="1.9" fill="#6e5e58" />
      <circle cx="41" cy="-33" r="1.5" fill="#d8c58a" /><circle cx="41.4" cy="-33" r="0.75" fill="#0e0f13" />
    </g>
    <Leg x={-23} y={-18} upper={9} lower={9} w={5.2} phase={0.5} color="#51463f" hoof="#221c1a" />
    <Leg x={25} y={-18} upper={9} lower={9} w={5} phase={0} color="#51463f" hoof="#221c1a" />
  </g>
);

/* ------------------------------------------------------------------ the bakkie: a 2006 Land Cruiser 79 */

const Wheel = ({ x }) => (
  <g transform={`translate(${x},-21)`}>
    <circle r="22" fill="#0b0d10" />
    <circle r="22" fill="none" stroke="#2a2f35" strokeWidth="1" strokeDasharray="3 2.2" />
    <circle r="18.4" fill="#15181c" />
    <circle r="16.4" fill="#242830" />
    <g className="chase-wheel">
      <circle r="12.2" fill="#c8cdd3" />
      <circle r="12.2" fill="none" stroke="#7d858e" strokeWidth="1.1" />
      <circle r="9" fill="#aeb5bd" />
      <g fill="#6f777f">
        <circle cx="0" cy="-6.4" r="1.2" /><circle cx="6.1" cy="-2" r="1.2" /><circle cx="3.8" cy="5.2" r="1.2" />
        <circle cx="-3.8" cy="5.2" r="1.2" /><circle cx="-6.1" cy="-2" r="1.2" /><circle cx="0" cy="6.4" r="0" />
      </g>
      <circle r="3.8" fill="#4a5058" /><circle r="1.6" fill="#9aa2aa" />
    </g>
  </g>
);

// A steel tube drawn with a lit edge, so it reads as round metal at small size.
const Tube = ({ d, w = 3, base = "#1d2126", lit = "#7d858e" }) => (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={base} strokeWidth={w} />
    <path d={d} stroke={lit} strokeWidth={Math.max(0.6, w * 0.22)} transform={`translate(${-w * 0.2},${-w * 0.2})`} opacity="0.85" />
  </g>
);

// The cattle rails: a tubular frame round the bed.
const CattleRails = () => {
  const frame = "M-117,-66 L-117,-97 Q-117,-101 -113,-101 L-30,-101 Q-26,-101 -26,-97 L-26,-66";
  return (
    <g>
      <Tube d={frame} w={3} base="#2b3036" lit="#d3d9df" />
      <Tube d="M-117,-88 L-26,-88 M-117,-77 L-26,-77" w={2.2} base="#2b3036" lit="#cfd5db" />
      <Tube d="M-94,-66 L-94,-101 M-71,-66 L-71,-101 M-48,-66 L-48,-101" w={2.2} base="#2b3036" lit="#cfd5db" />
      <Tube d="M-117,-79 L-100,-101" w={2} base="#2b3036" lit="#cfd5db" />
    </g>
  );
};

const Bullbar = () => (
  <g>
    <Tube d="M108,-34 C124,-34 133,-43 133,-56 C133,-66 128,-72 117,-73" w={3.6} />
    <Tube d="M110,-46 L133,-46 M111,-61 L132,-61" w={2.3} />
    <Tube d="M124,-35 L124,-68" w={2.4} />
    <Tube d="M110,-42 C106,-38 104,-34 102,-30" w={2.2} />
    <circle cx="133.5" cy="-60" r="3.4" fill="#2a2e34" /><circle cx="134.4" cy="-60" r="2.3" fill="#fff0b0" />
    <rect x="112" y="-39" width="10" height="5" rx="1.2" fill="#2a2e34" /><rect x="114" y="-38" width="6" height="1.6" fill="#7d858e" />
  </g>
);

const Bakkie = () => (
  <g className="chase-truck">
    <ellipse cx="2" cy="1" rx="134" ry="3.6" fill="#0b1320" opacity="0.35" />
    <defs>
      <linearGradient id="chase-paint" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" /><stop offset="0.4" stopColor="#eef1f4" /><stop offset="0.8" stopColor="#d3d9df" /><stop offset="1" stopColor="#aab2bb" />
      </linearGradient>
      <linearGradient id="chase-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fb2d6" /><stop offset="1" stopColor="#35557d" />
      </linearGradient>
      <clipPath id="chase-cab-clip"><path d="M-4,-94 L38,-94 C40,-94 42,-92 43,-90 L49,-74 L-4,-74 Z" /></clipPath>
    </defs>
    <g className="chase-truck-body">
      {/* chassis, fuel tank, rear bumper and tow ball */}
      <rect x="-116" y="-33" width="226" height="9" rx="2" fill="#14171b" />
      <rect x="-4" y="-30" width="42" height="9" rx="3.5" fill="#2a2e34" />
      <rect x="-129" y="-39" width="15" height="8" rx="1.6" fill="#2b2f35" /><circle cx="-125" cy="-33" r="2.2" fill="#8c949c" />
      {/* the collie riding in the back, ears and tail in the wind, standing behind the tub wall, inside the rails */}
      <g transform="translate(-84,-44) scale(0.82)">
        <g className="chase-rider">
          <CollieTail className="chase-tail chase-tail-wind" />
          <CollieBody earClass="chase-ear" />
        </g>
      </g>
      {/* the tub: drop sides, a galvanised lip, pressed ridges and the tail light */}
      <path d="M-120,-33 L-120,-63 C-120,-65 -119,-66 -117,-66 L-23,-66 L-23,-33 Z" fill="url(#chase-paint)" stroke="#8d949c" strokeWidth="0.7" />
      <rect x="-121" y="-68" width="99" height="3.4" rx="1.2" fill="#cfd5db" stroke="#8d949c" strokeWidth="0.5" />
      <path d="M-117,-55 L-26,-55 M-117,-45 L-26,-45" stroke="#bdc4cb" strokeWidth="1" />
      <path d="M-117,-54 L-26,-54 M-117,-44 L-26,-44" stroke="#ffffff" strokeWidth="0.5" opacity="0.8" />
      <rect x="-121.5" y="-62" width="3.6" height="13" rx="1" fill="#cf3a34" /><rect x="-121.5" y="-47" width="3.6" height="4" rx="1" fill="#f1a93a" />
      {/* the single cab: flat roof, upright windscreen, boxy bonnet */}
      <path d="M-23,-33 L-23,-97 C-23,-100 -21,-102 -18,-102 L38,-102 C42,-102 44,-100 45.5,-96 L57,-70 C58,-67 60,-66.6 63,-66.6 L107,-66.6 C111,-66.6 113,-64.6 113,-60 L114,-33 Z" fill="url(#chase-paint)" stroke="#8d949c" strokeWidth="0.7" />
      <path d="M-18,-102 L38,-102" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />
      <path d="M-23,-48 L112,-48" stroke="#c1c8cf" strokeWidth="1" /><path d="M-23,-47 L112,-47" stroke="#ffffff" strokeWidth="0.5" opacity="0.8" />
      {/* the door: window with its quarter vent, handle and shut lines */}
      <path d="M-9,-98 L44,-98 L54,-72 L54,-34 L-9,-34 Z" fill="none" stroke="#9aa2aa" strokeWidth="0.8" />
      <path d="M-4,-94 L38,-94 C40,-94 42,-92 43,-90 L49,-74 L-4,-74 Z" fill="url(#chase-glass)" />
      <path d="M-4,-94 L8,-94 L-2,-74 L-4,-74 Z" fill="#cfe2f5" opacity="0.4" />
      <path d="M31,-94 L33.5,-74" stroke="#1b1e22" strokeWidth="1.6" />
      <path d="M-4,-74 L49,-74" stroke="#b9c0c7" strokeWidth="1" />
      <rect x="-3" y="-67" width="9" height="2.6" rx="1.3" fill="#8c949c" />
      {/* the farmer at the wheel */}
      <g clipPath="url(#chase-cab-clip)">
        <ellipse cx="18" cy="-83" rx="5" ry="6" fill="#c8946e" />
        <path d="M12,-85.4 C12,-94 24,-94 24,-85.4 Z" fill="#5d4e30" />
        <path d="M8.6,-85.4 L27.4,-85.4 L26,-83.6 L10,-83.6 Z" fill="#473c26" />
        <circle cx="20.4" cy="-82" r="0.7" fill="#2b1d14" /><path d="M16.4,-78.6 L20,-78.6" stroke="#8a5a40" strokeWidth="0.8" />
        <path d="M7,-76 C8,-80.6 28,-80.6 29,-76 Z" fill="#6c4234" />
      </g>
      {/* the snorkel up the windscreen pillar, then the thick A-pillar, then the big truck mirror bolted to it and the door */}
      <Tube d="M63,-64 C66,-68 62,-82 58,-93 C56,-98 53,-102 49,-104 L45,-104" w={3.4} base="#14171b" lit="#6a727b" />
      <rect x="39" y="-108" width="8" height="7.4" rx="1.6" fill="#14171b" />
      <path d="M45.5,-97 L57,-70" stroke="#1b1e22" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M51,-86 L55.6,-86 M53.4,-72.4 L57,-78" stroke="#1b1e22" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="51.4" cy="-86" r="1.4" fill="#4a5058" /><circle cx="53.6" cy="-72.6" r="1.4" fill="#4a5058" />
      <rect x="55" y="-92.5" width="6.4" height="16.5" rx="1.9" fill="#1b1e22" /><rect x="56.2" y="-90.8" width="1.9" height="13" rx="0.9" fill="#5a626b" />
      {/* bonnet seam and highlight */}
      <path d="M62,-66 C80,-65 100,-65 110,-64" stroke="#aab2ba" strokeWidth="0.9" fill="none" />
      {/* front: grille, rectangular headlight, indicator, bumper */}
      <path d="M107,-66.6 C111,-66.6 113,-64.6 113,-60 L114,-37 L106,-37 L105,-66 Z" fill="#1b1e23" />
      <rect x="106" y="-55" width="8" height="2.2" fill="#b3bbc3" /><rect x="106" y="-50" width="8" height="2.2" fill="#b3bbc3" /><rect x="106" y="-45" width="8" height="2.2" fill="#b3bbc3" />
      <path d="M103,-65 L113,-64 L113,-56 L103,-57 Z" fill="#fff4c0" stroke="#8d949c" strokeWidth="0.6" />
      <circle className="chase-headlamp" cx="111" cy="-60" r="11" fill="url(#chase-lamp)" />
      <rect x="107" y="-41" width="7" height="3.4" rx="1" fill="#f2a93a" />
      <rect x="104" y="-37" width="14" height="7" rx="1.6" fill="#2a2e34" />
      {/* black wheel arches and the wide fender flares */}
      <path d="M-103,-30 C-103,-56 -45,-56 -45,-30 Z" fill="#0f1114" />
      <path d="M-105,-33 C-105,-61 -43,-61 -43,-33" fill="none" stroke="#1c1f24" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M-102,-34 C-102,-58 -46,-58 -46,-34" fill="none" stroke="#4a5058" strokeWidth="0.8" />
      <path d="M43,-30 C43,-56 101,-56 101,-30 Z" fill="#0f1114" />
      <path d="M41,-33 C41,-61 103,-61 103,-33" fill="none" stroke="#1c1f24" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M44,-34 C44,-58 100,-58 100,-34" fill="none" stroke="#4a5058" strokeWidth="0.8" />
      <rect x="-22" y="-36" width="64" height="3.4" rx="1.4" fill="#2a2e34" />
      <rect x="-101" y="-37" width="3.2" height="15" rx="1" fill="#15181c" />
      <Bullbar />
      <CattleRails />
    </g>
    <Wheel x={-74} />
    <Wheel x={72} />
  </g>
);

/* ------------------------------------------------------------------ the scenery */

// A repeating strip: the same drawing twice so it can slide by one width and loop with no seam.
const Loop = ({ className, children }) => (
  <g className={className}>
    {children}
    <g transform={`translate(${-W},0)`}>{children}</g>
  </g>
);

const TUFTS = [8, 41, 77, 109, 152, 188, 219, 262, 301, 337, 372, 414, 447, 489, 523, 566, 601, 638, 677, 702];
const Tuft = ({ x, h }) => (
  <path d={`M${x},124 C${x - 1},${124 - h * 0.5} ${x - 3},${124 - h} ${x - 4},${124 - h * 1.1} C${x},${124 - h * 0.7} ${x + 1},${124 - h * 0.4} ${x + 2},124 Z M${x + 2},124 C${x + 3},${124 - h * 0.6} ${x + 6},${124 - h * 0.9} ${x + 8},${124 - h} C${x + 5},${124 - h * 0.5} ${x + 4},${124 - h * 0.3} ${x + 5},124 Z`} />
);

const Scenery = () => (
  <>
    <defs>
      <linearGradient id="chase-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#16264a" /><stop offset="0.5" stopColor="#2f4f82" /><stop offset="0.72" stopColor="#6c8ab4" />
      </linearGradient>
      <linearGradient id="chase-field" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b5a4f" /><stop offset="0.5" stopColor="#2a4339" /><stop offset="1" stopColor="#1a2b26" />
      </linearGradient>
      <linearGradient id="chase-mist" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#cfdcef" stopOpacity="0" /><stop offset="0.5" stopColor="#cfdcef" stopOpacity="0.34" /><stop offset="1" stopColor="#cfdcef" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="chase-lamp"><stop offset="0" stopColor="#fff3b8" stopOpacity="0.95" /><stop offset="0.5" stopColor="#ffe08a" stopOpacity="0.35" /><stop offset="1" stopColor="#ffe08a" stopOpacity="0" /></radialGradient>
      <linearGradient id="chase-beam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.3" /><stop offset="0.6" stopColor="#ffe9a8" stopOpacity="0.1" /><stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width={W} height={H} fill="url(#chase-sky)" />
    <g fill="#e8f0ff" opacity="0.7"><circle cx="90" cy="14" r="0.9" /><circle cx="210" cy="9" r="0.7" /><circle cx="330" cy="18" r="0.8" /><circle cx="470" cy="8" r="0.9" /><circle cx="590" cy="16" r="0.7" /><circle cx="668" cy="10" r="0.8" /></g>
    <Loop className="chase-layer chase-layer-far">
      <path d="M0,76 C60,64 110,70 170,66 S280,58 340,66 S470,70 540,64 S660,62 720,76 L720,96 L0,96 Z" fill="#3c5a8c" />
    </Loop>
    <Loop className="chase-layer chase-layer-mid">
      <path d="M0,84 C70,74 130,80 200,76 S330,72 400,80 S560,82 620,76 S690,76 720,84 L720,100 L0,100 Z" fill="#2d4a77" />
      <g fill="#1f3556"><ellipse cx="120" cy="74" rx="11" ry="10" /><ellipse cx="136" cy="72" rx="12" ry="12" /><ellipse cx="152" cy="75" rx="9" ry="9" /><rect x="116" y="76" width="42" height="9" /></g>
      <g fill="#ffd98a"><circle cx="86" cy="80" r="1.5" /><circle cx="93" cy="80" r="1.3" /></g>
      <g fill="#1f3556"><ellipse cx="460" cy="76" rx="8" ry="8" /><ellipse cx="474" cy="74" rx="10" ry="10" /><rect x="456" y="77" width="28" height="8" /></g>
    </Loop>
    <rect className="chase-mist" x="-200" y="66" width="360" height="30" fill="url(#chase-mist)" />
    <rect x="0" y="86" width={W} height={H - 86} fill="url(#chase-field)" />
    <Loop className="chase-layer chase-layer-grass"><g fill="#4d7a5f" opacity="0.75">{TUFTS.map((x, i) => <Tuft key={x} x={x} h={7 + (i % 4) * 2} />)}</g></Loop>
  </>
);

const GrazingHeaderStrip = () => (
  <div className="chase-strip relative w-80 max-w-full select-none overflow-hidden rounded-lg ring-1 ring-white/10" style={{ aspectRatio: `${W} / ${H}` }} aria-hidden="true">
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <Scenery />
      {/* the animals run left: each is drawn facing right and mirrored into place. Order, front to back: sheep, cow, collie, bakkie */}
      <g transform={`translate(578,${GROUND}) scale(-1,1)`}>
        <polygon className="chase-beam" points="116,-60 330,-104 330,-6" fill="url(#chase-beam)" />
      </g>
      <g transform={`translate(60,${GROUND}) scale(-1,1)`}><g className="chase-lunge chase-lunge-sheep"><Sheep /></g></g>
      <g transform={`translate(202,${GROUND}) scale(-1,1)`}><Cow /></g>
      <g transform={`translate(348,${GROUND}) scale(-1,1)`}><g className="chase-lunge chase-lunge-dog"><Dog /></g></g>
      <g transform={`translate(578,${GROUND}) scale(-1,1)`}><Bakkie /></g>
    </svg>
  </div>
);

export default GrazingHeaderStrip;
