import React from "react";

// The header's running scene: a border collie chasing a cow and a sheep across
// a misty paddock at dusk, the farmer's bakkie following with its headlights on.
// Drawn from scratch as vector art (the idea comes from the picture the owner
// supplied) and kept deliberately calm: slow parallax hills, a steady stride,
// no sway and no flicker, so it never tires the eye.
//
// How it moves: the animals run on the spot while the hills, trees and grass
// slide past at different speeds, which is what makes them look like they are
// running. Each leg is two parts (thigh and shin) that swing on their own with
// a phase offset, giving a proper gallop. All motion is CSS in index.css
// (`.chase-*`); the packaged app's CSP blocks inline <style> elements.
// Everything is drawn facing right and mirrored, so the animals run left,
// like in the picture.

const W = 720;
const H = 124;
const GROUND = 112; // the y where hooves and wheels touch the grass

const Leg = ({ x, y, upper, lower, w = 6, phase, color, hoof = "#2a2521", knee = 0 }) => (
  <g transform={`translate(${x},${y})`}>
    <g className="chase-thigh" style={{ "--ph": phase }}>
      <path d={`M${-w / 2 - 1},0 L${w / 2 + 1},0 L${w / 2 + knee},${upper} L${-w / 2 + knee},${upper} Z`} fill={color} />
      <g transform={`translate(${knee},${upper})`}>
        <g className="chase-shin" style={{ "--ph": phase }}>
          <path d={`M${-w / 2},0 L${w / 2},0 L${w / 2 - 1},${lower - 3} L${-w / 2 + 1},${lower - 3} Z`} fill={color} />
          <path d={`M${-w / 2 + 0.5},${lower - 3.5} L${w / 2 - 0.5},${lower - 3.5} L${w / 2 + 1.5},${lower} L${-w / 2 - 0.5},${lower} Z`} fill={hoof} />
        </g>
      </g>
    </g>
  </g>
);

const Cow = () => (
  <g className="chase-animal" style={{ "--T": "0.78s" }}>
    <ellipse className="chase-shadow" cx="4" cy="1" rx="52" ry="3.2" fill="#0b1320" opacity="0.35" />
    <Leg x={-32} y={-34} upper={19} lower={15} w={8.5} phase={0.58} color="#c9c3b6" />
    <Leg x={34} y={-34} upper={19} lower={15} w={8} phase={0.1} color="#c9c3b6" />
    <g className="chase-bob">
      <defs>
        <clipPath id="chase-cow-body">
          <path d="M-52,-58 C-52,-70 -30,-75 -4,-73 C22,-75 44,-72 52,-62 C56,-52 54,-38 46,-31 C30,-26 -30,-26 -46,-32 C-54,-39 -54,-50 -52,-58 Z" />
        </clipPath>
      </defs>
      {/* tail swings from the rump */}
      <g transform="translate(-50,-62)"><g className="chase-tail"><path d="M0,0 C-7,4 -8,16 -6,27" stroke="#e9e4d8" strokeWidth="2.6" fill="none" strokeLinecap="round" /><ellipse cx="-6" cy="30" rx="3" ry="5.5" fill="#1b1c21" /></g></g>
      <path d="M-52,-58 C-52,-70 -30,-75 -4,-73 C22,-75 44,-72 52,-62 C56,-52 54,-38 46,-31 C30,-26 -30,-26 -46,-32 C-54,-39 -54,-50 -52,-58 Z" fill="#f4f0e7" />
      <g clipPath="url(#chase-cow-body)" fill="#1b1c21">
        <ellipse cx="-24" cy="-62" rx="17" ry="11" /><ellipse cx="10" cy="-50" rx="14" ry="11" /><ellipse cx="-44" cy="-44" rx="10" ry="14" />
        <ellipse cx="40" cy="-66" rx="9" ry="9" />
      </g>
      <path d="M-50,-34 C-30,-27 30,-27 46,-33 L46,-30 C30,-24 -30,-24 -48,-30 Z" fill="#cfc9bb" />
      <ellipse cx="-14" cy="-27" rx="7" ry="4" fill="#dca6a2" />
      {/* neck and head */}
      <path d="M44,-70 C54,-80 70,-78 80,-66 L90,-50 C92,-45 87,-41 82,-42 L73,-43 C65,-41 56,-47 50,-56 Z" fill="#1b1c21" />
      <path d="M72,-70 L81,-60 L86,-50 L80,-50 L74,-60 Z" fill="#f4f0e7" />
      <ellipse cx="86" cy="-45" rx="5.5" ry="4.2" fill="#dca6a2" />
      <path d="M58,-76 C54,-84 58,-88 62,-84 Z" fill="#cdbf9b" />
      <path d="M62,-74 C56,-82 48,-80 48,-72 C52,-70 58,-70 62,-74 Z" fill="#14151a" />
      <circle cx="74" cy="-62" r="1.8" fill="#f4f0e7" /><circle cx="74.4" cy="-62" r="0.9" fill="#0e0f13" />
    </g>
    <Leg x={-44} y={-34} upper={19} lower={15} w={8.5} phase={0.5} color="#f4f0e7" />
    <Leg x={44} y={-34} upper={19} lower={15} w={8} phase={0} color="#f4f0e7" />
  </g>
);

const Dog = () => (
  <g className="chase-animal" style={{ "--T": "0.5s" }}>
    <ellipse className="chase-shadow" cx="2" cy="1" rx="30" ry="2.4" fill="#0b1320" opacity="0.35" />
    <Leg x={-18} y={-23} upper={11} lower={11} w={4} phase={0.55} color="#0d0f14" knee={1} hoof="#0d0f14" />
    <Leg x={20} y={-23} upper={11} lower={11} w={3.6} phase={0.08} color="#0d0f14" knee={-1} hoof="#0d0f14" />
    <g className="chase-bob chase-bob-dog">
      <g transform="translate(-27,-31)"><g className="chase-tail chase-tail-dog"><path d="M0,0 C-9,-1 -13,-8 -14,-15 C-9,-9 -5,-6 2,-5 Z" fill="#14161c" /></g></g>
      <path d="M-27,-31 C-25,-40 -8,-42 6,-40 C20,-40 28,-35 30,-29 C27,-21 14,-18 -4,-18 C-18,-18 -29,-23 -27,-31 Z" fill="#14161c" />
      <path d="M12,-22 C20,-26 26,-26 29,-28 C26,-20 18,-18 8,-18 Z" fill="#ece8df" />
      <path d="M-24,-36 C-10,-42 10,-42 22,-37 C10,-39 -10,-39 -24,-33 Z" fill="#242833" />
      {/* head */}
      <path d="M24,-40 C32,-47 42,-45 46,-39 L57,-34 C60,-32 58,-28 54,-28 L44,-28 C36,-28 28,-31 24,-36 Z" fill="#14161c" />
      <path d="M46,-39 L57,-34 C60,-32 58,-30 55,-30 L47,-31 Z" fill="#242833" />
      <path d="M26,-42 L24,-52 L33,-45 Z" fill="#14161c" /><path d="M35,-44 L38,-53 L42,-44 Z" fill="#0d0f14" />
      <path d="M51,-30 C54,-26 56,-24 54,-22" stroke="#e9a0a0" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="-38.5" r="1.4" fill="#e8d9a0" />
    </g>
    <Leg x={-22} y={-23} upper={11} lower={11} w={4.4} phase={0.5} color="#14161c" knee={1} hoof="#14161c" />
    <Leg x={22} y={-23} upper={11} lower={11} w={4} phase={0} color="#14161c" knee={-1} hoof="#14161c" />
  </g>
);

const WOOL = [[-22, -34, 11], [-8, -38, 12], [8, -38, 12], [22, -34, 11], [-26, -24, 9], [-12, -22, 11], [4, -22, 11], [18, -22, 11], [28, -26, 8], [-16, -30, 12], [10, -30, 13]];
const Sheep = () => (
  <g className="chase-animal" style={{ "--T": "0.58s" }}>
    <ellipse className="chase-shadow" cx="2" cy="1" rx="30" ry="2.6" fill="#0b1320" opacity="0.35" />
    <Leg x={-16} y={-17} upper={9} lower={8} w={4} phase={0.58} color="#4a403c" hoof="#2a2321" />
    <Leg x={19} y={-17} upper={9} lower={8} w={4} phase={0.1} color="#4a403c" hoof="#2a2321" />
    <g className="chase-bob chase-bob-sheep">
      <g fill="#d9d4c7">{WOOL.map(([x, y, r]) => <circle key={`s${x}${y}`} cx={x + 1.5} cy={y + 2} r={r} />)}</g>
      <g fill="#f1eee6">{WOOL.map(([x, y, r]) => <circle key={`w${x}${y}`} cx={x} cy={y} r={r} />)}</g>
      <g fill="#fffdf6" opacity="0.6">{WOOL.slice(0, 6).map(([x, y, r]) => <circle key={`h${x}${y}`} cx={x - 2} cy={y - 3} r={r * 0.55} />)}</g>
      <path d="M26,-36 C34,-42 44,-38 46,-30 C47,-25 43,-22 38,-23 C32,-24 27,-28 26,-36 Z" fill="#3b3330" />
      <path d="M30,-38 C34,-46 40,-45 42,-39 C38,-40 33,-39 30,-38 Z" fill="#5a4e49" />
      <circle cx="39" cy="-31" r="1.4" fill="#f1eee6" /><circle cx="39.4" cy="-31" r="0.7" fill="#0e0f13" />
      <ellipse cx="45" cy="-26" rx="2.4" ry="1.7" fill="#6b5c56" />
    </g>
    <Leg x={-21} y={-17} upper={9} lower={8} w={4.2} phase={0.5} color="#5a4e49" hoof="#2a2321" />
    <Leg x={23} y={-17} upper={9} lower={8} w={4} phase={0} color="#5a4e49" hoof="#2a2321" />
  </g>
);

const Wheel = ({ x }) => (
  <g transform={`translate(${x},-15)`}>
    <circle r="15.5" fill="#1b1d22" />
    <circle r="11" fill="#2a2d33" />
    <g className="chase-wheel">
      <circle r="8.2" fill="#9aa1a9" />
      <g stroke="#5d646c" strokeWidth="1.6" strokeLinecap="round">
        <path d="M0,0 L0,-7" /><path d="M0,0 L6.7,-2.2" /><path d="M0,0 L4.1,5.7" /><path d="M0,0 L-4.1,5.7" /><path d="M0,0 L-6.7,-2.2" />
      </g>
      <circle r="2.4" fill="#41464d" />
    </g>
  </g>
);

const Bakkie = () => (
  <g className="chase-truck">
    <ellipse cx="0" cy="1" rx="122" ry="3.4" fill="#0b1320" opacity="0.35" />
    <g className="chase-truck-body">
      {/* the collie riding in the bed */}
      <g className="chase-rider">
        <path d="M-52,-60 C-52,-70 -46,-76 -38,-77 C-31,-77 -28,-72 -28,-66 L-28,-60 Z" fill="#14161c" />
        <path d="M-46,-76 L-44,-84 L-39,-77 Z" fill="#14161c" />
        <path d="M-37,-78 C-35,-83 -31,-82 -30,-77 Z" fill="#14161c" />
        <path d="M-47,-70 L-40,-77 L-37,-69 L-41,-62 L-47,-62 Z" fill="#f2efe8" />
        <circle cx="-38" cy="-71" r="1.3" fill="#e8d9a0" />
      </g>
      <rect x="-120" y="-60" width="102" height="38" rx="3" fill="#eef0f2" />
      <rect x="-120" y="-60" width="102" height="4" fill="#3b4048" />
      <rect x="-120" y="-34" width="102" height="12" fill="#cfd3d8" />
      <path d="M-18,-60 L-14,-84 L38,-84 L60,-60 L122,-56 L122,-24 L-18,-24 Z" fill="#f3f5f7" />
      <path d="M-18,-34 L122,-34 L122,-24 L-18,-24 Z" fill="#cfd3d8" />
      <path d="M-8,-79 L34,-79 L52,-62 L-10,-62 Z" fill="#6d93c2" />
      <path d="M-8,-79 L12,-79 L-2,-62 L-10,-62 Z" fill="#8fb1da" opacity="0.55" />
      <ellipse cx="14" cy="-67" rx="6.4" ry="4.4" fill="#b88a64" />
      <path d="M6,-68 C6,-77 22,-77 22,-68 Z" fill="#6b5b3c" /><path d="M3,-68 L25,-68 L24,-65 L4,-65 Z" fill="#54462f" />
      <path d="M2,-62 C8,-65 22,-65 32,-62 L32,-58 L2,-58 Z" fill="#7a4a3a" />
      <rect x="56" y="-62" width="3" height="38" fill="#cfd3d8" opacity="0.7" />
      <rect x="112" y="-34" width="14" height="12" rx="2" fill="#3b4048" />
      <rect x="116" y="-52" width="8" height="9" rx="2" fill="#2d3239" />
      <circle cx="120" cy="-47" r="4" fill="#fff4c4" /><circle className="chase-headlamp" cx="120" cy="-47" r="9" fill="url(#chase-lamp)" />
      <path d="M-120,-30 L122,-30" stroke="#a8946f" strokeWidth="5" opacity="0.18" />
    </g>
    <Wheel x={-72} />
    <Wheel x={72} />
  </g>
);

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
      {/* the animals run left: each is drawn facing right and mirrored into place */}
      <g transform={`translate(560,${GROUND}) scale(-1,1)`}>
        <polygon className="chase-beam" points="118,-47 340,-96 340,-8" fill="url(#chase-beam)" />
      </g>
      <g transform={`translate(96,${GROUND}) scale(-1,1)`}><g className="chase-lunge chase-lunge-dog"><Dog /></g></g>
      <g transform={`translate(248,${GROUND}) scale(-1,1)`}><Cow /></g>
      <g transform={`translate(372,${GROUND}) scale(-1,1)`}><g className="chase-lunge chase-lunge-sheep"><Sheep /></g></g>
      <g transform={`translate(560,${GROUND}) scale(-1,1)`}><Bakkie /></g>
    </svg>
  </div>
);

export default GrazingHeaderStrip;
