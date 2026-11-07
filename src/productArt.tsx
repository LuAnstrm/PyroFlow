import { useId } from "react"

/**
 * Illustrated "product shots" for the catalogue. Each kind of firework gets its own
 * drawing on a soft studio backdrop, so every product has a picture without needing
 * uploaded photos. Picked by the product name first, then by its category.
 */
type Kind = "rocket" | "roman" | "sparkler" | "fountain" | "cake" | "spinner" | "smoke" | "firecracker" | "gift"

const BY_CATEGORY: Record<string, Kind> = {
  Rockets: "rocket",
  "Roman Candles": "roman",
  Sparklers: "sparkler",
  Fountains: "fountain",
  "Aerial Fireworks": "cake",
  "Ground Fireworks": "spinner",
  "Assorted Fireworks": "gift",
  Firecrackers: "firecracker",
}

function kindFor(name: string, category: string): Kind {
  const n = name.toLowerCase()
  if (n.includes("rocket")) return "rocket"
  if (n.includes("roman")) return "roman"
  if (n.includes("sparkler")) return "sparkler"
  if (n.includes("fountain")) return "fountain"
  if (n.includes("cake")) return "cake"
  if (n.includes("spinner") || n.includes("wheel")) return "spinner"
  if (n.includes("smoke")) return "smoke"
  if (n.includes("cracker")) return "firecracker"
  if (/(set|box|assorted|bundle|pack)/.test(n) && !n.includes("sparkler")) return "gift"
  return BY_CATEGORY[category] ?? "gift"
}

const BACKDROP: Record<Kind, [string, string]> = {
  rocket: ["#fff1ec", "#ffd6cc"],
  roman: ["#eef6ff", "#cfe4fb"],
  sparkler: ["#fff8e6", "#ffe5a8"],
  fountain: ["#ebfaf5", "#c4ece0"],
  cake: ["#f4f0ff", "#ddd2fb"],
  spinner: ["#effaf1", "#cdefd6"],
  smoke: ["#f7f0ff", "#e6d8fb"],
  firecracker: ["#fff0ef", "#ffcfcb"],
  gift: ["#eef4fc", "#d3e2f5"],
}

// A few box colours so two "assorted" products don't look identical.
const GIFT_COLORS: [string, string][] = [
  ["#2C5EAD", "#1d3f7a"],
  ["#d1252b", "#8f1418"],
  ["#1f8a5b", "#11573a"],
  ["#7a3fc4", "#4e2385"],
]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export function ProductArt({ name, category, className = "" }: { name: string; category: string; className?: string }) {
  const kind = kindFor(name, category)
  const u = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [bgA, bgB] = BACKDROP[kind]
  const gift = GIFT_COLORS[hash(name) % GIFT_COLORS.length]

  // Horizontal shading that makes a flat rectangle read as a paper tube.
  const tube = (id: string, light: string, mid: string, dark: string) => (
    <linearGradient id={u + id} x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor={dark} />
      <stop offset=".35" stopColor={light} />
      <stop offset=".6" stopColor={mid} />
      <stop offset="1" stopColor={dark} />
    </linearGradient>
  )
  const spark = (x: number, y: number, r: number, color = "#ffffff", o = 0.9) => (
    <path d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`} fill={color} opacity={o} />
  )
  const burst = (x: number, y: number, r: number, color: string, rays = 12) => (
    <g>
      <circle cx={x} cy={y} r={r * 0.9} fill={color} opacity=".18" />
      {Array.from({ length: rays }, (_, i) => {
        const a = (i / rays) * Math.PI * 2
        const len = i % 2 ? r * 0.65 : r
        return <line key={i} x1={x + Math.cos(a) * r * 0.2} y1={y + Math.sin(a) * r * 0.2} x2={x + Math.cos(a) * len} y2={y + Math.sin(a) * len} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      })}
      <circle cx={x} cy={y} r={r * 0.16} fill="#fff" />
    </g>
  )

  let art: React.ReactNode
  if (kind === "rocket") {
    art = (
      <g transform="rotate(-14 80 70)">
        <rect x="78.5" y="66" width="3" height="50" rx="1.5" fill="#c79d62" />
        <path d="M70 70 L58 88 L70 83 Z M90 70 L102 88 L90 83 Z" fill="#1d3f7a" />
        <rect x="69" y="30" width="22" height="48" rx="3" fill={`url(#${u}red)`} />
        <rect x="69" y="50" width="22" height="9" fill="#fff" opacity=".92" />
        {spark(80, 54.5, 3.4, "#d1252b", 1)}
        <path d="M69 31 Q80 4 91 31 Z" fill={`url(#${u}navy)`} />
        <path d="M78 78 q2 6 -1 10" stroke="#5b4a3a" strokeWidth="1.2" fill="none" />
      </g>
    )
  } else if (kind === "roman") {
    art = (
      <g>
        <line x1="74" y1="22" x2="66" y2="8" stroke="#ff9a3c" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
        <circle cx="65" cy="7" r="3.2" fill="#ff3b30" />
        <line x1="82" y1="20" x2="94" y2="4" stroke="#7cff6b" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
        <circle cx="95" cy="3.5" r="3" fill="#2fbf55" />
        <circle cx="80" cy="13" r="2.4" fill="#ffc233" />
        <rect x="95" y="48" width="18" height="60" rx="3" fill={`url(#${u}redtube)`} />
        <ellipse cx="104" cy="48" rx="9" ry="2.6" fill="#7d0f12" />
        <rect x="66" y="26" width="24" height="82" rx="3.5" fill={`url(#${u}bluetube)`} />
        <g clipPath={`url(#${u}clip)`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M60 ${40 + i * 14} L96 ${28 + i * 14} L96 ${33 + i * 14} L60 ${45 + i * 14}Z`} fill="#ffd54a" opacity=".85" />
          ))}
        </g>
        <ellipse cx="78" cy="26" rx="12" ry="3.2" fill="#13294f" />
        <path d="M78 25 q4 -6 0 -9" stroke="#5b4a3a" strokeWidth="1.3" fill="none" />
      </g>
    )
  } else if (kind === "sparkler") {
    art = (
      <g>
        {[62, 70, 78, 86, 94].map((x, i) => (
          <g key={x}>
            <line x1={x} y1="70" x2={x + (i - 2) * 3} y2={22 + (i % 2) * 6} stroke="#9aa0aa" strokeWidth="3.2" strokeLinecap="round" />
            <line x1={x} y1="70" x2={x + (i - 2) * 1.2} y2="48" stroke="#5f6570" strokeWidth="1.1" />
          </g>
        ))}
        {burst(84, 22, 17, "#ffb300", 16)}
        {spark(100, 12, 3.5, "#ffd54a")}
        {spark(66, 14, 2.6, "#ffd54a")}
        <rect x="54" y="64" width="52" height="42" rx="3" fill={`url(#${u}redtube)`} />
        <rect x="54" y="74" width="52" height="11" fill="#ffd54a" />
        {spark(80, 79.5, 4, "#d1252b", 1)}
        {spark(66, 79.5, 2.4, "#d1252b", 1)}
        {spark(94, 79.5, 2.4, "#d1252b", 1)}
      </g>
    )
  } else if (kind === "fountain") {
    art = (
      <g>
        {Array.from({ length: 18 }, (_, i) => {
          const t = i / 17
          const x2 = 46 + t * 68
          const y2 = 14 + Math.abs(t - 0.5) * 34
          return <path key={i} d={`M80 38 Q${(80 + x2) / 2} ${y2 - 16} ${x2} ${y2 + 14}`} stroke={i % 3 ? "#ffc233" : "#fff1b8"} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".9" />
        })}
        {burst(80, 34, 9, "#ffe58a", 10)}
        <rect x="56" y="94" width="48" height="12" rx="2" fill="#13294f" />
        <path d="M61 94 L73 40 L87 40 L99 94 Z" fill={`url(#${u}tealtube)`} />
        <path d="M66.5 70 L93.5 70 L95.5 80 L64.5 80 Z" fill="#ffd54a" />
        {spark(80, 75, 3.4, "#0f6e5c", 1)}
        <ellipse cx="80" cy="40" rx="7" ry="2" fill="#0b4d40" />
      </g>
    )
  } else if (kind === "cake") {
    art = (
      <g>
        {burst(58, 18, 11, "#ff3b30")}
        {burst(104, 14, 9, "#ffc233")}
        <path d="M38 52 L56 36 L134 36 L116 52 Z" fill="#9b6be0" />
        {[0, 1, 2, 3].map((c) =>
          [0, 1].map((r) => <ellipse key={`${c}${r}`} cx={58 + c * 17 - r * 8} cy={41 + r * 7} rx="6" ry="2.3" fill="#3b1a6b" />),
        )}
        <path d="M116 52 L134 36 L134 88 L116 104 Z" fill="#4e2385" />
        <rect x="38" y="52" width="78" height="52" fill={`url(#${u}purpleface)`} />
        <rect x="47" y="62" width="60" height="32" rx="4" fill="#fff" opacity=".95" />
        {spark(62, 78, 6, "#ff3b30", 1)}
        {spark(77, 74, 4, "#2C5EAD", 1)}
        {spark(92, 80, 5, "#ffb300", 1)}
        <path d="M134 70 q8 -2 10 -10" stroke="#5b4a3a" strokeWidth="1.3" fill="none" />
      </g>
    )
  } else if (kind === "spinner") {
    art = (
      <g>
        <path d="M80 30 A36 36 0 0 1 116 66" stroke="#ffc233" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeDasharray="2 5" />
        <path d="M80 102 A36 36 0 0 1 44 66" stroke="#ff9a3c" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeDasharray="2 5" />
        {spark(118, 70, 4, "#ffc233")}
        {spark(42, 62, 4, "#ff9a3c")}
        <circle cx="80" cy="66" r="28" fill={`url(#${u}disc)`} />
        <path d="M80 66 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16 a20 20 0 1 1 -20 -20" stroke="#ffd54a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="80" cy="66" r="4.5" fill="#0b3d26" />
      </g>
    )
  } else if (kind === "smoke") {
    art = (
      <g>
        <circle cx="66" cy="30" r="17" fill="#ff7eb6" opacity=".55" />
        <circle cx="92" cy="24" r="19" fill="#9d7bff" opacity=".5" />
        <circle cx="80" cy="42" r="15" fill="#4fd1c5" opacity=".5" />
        <circle cx="104" cy="44" r="11" fill="#ffd54a" opacity=".45" />
        <circle cx="58" cy="50" r="10" fill="#9d7bff" opacity=".35" />
        <rect x="68" y="56" width="24" height="50" rx="4" fill={`url(#${u}navytube)`} />
        <rect x="68" y="72" width="24" height="12" fill="#ff7eb6" />
        <ellipse cx="80" cy="56" rx="12" ry="3" fill="#0b1d3d" />
        <circle cx="80" cy="50" r="4" stroke="#c8ced8" strokeWidth="2" fill="none" />
      </g>
    )
  } else if (kind === "firecracker") {
    art = (
      <g>
        {[-26, -13, 0, 13, 26].map((a, i) => (
          <g key={a} transform={`rotate(${a} 80 62)`}>
            <rect x="75.5" y="18" width="9" height="30" rx="2" fill={`url(#${u}redtube)`} />
            <rect x="75.5" y="22" width="9" height="2.5" fill="#ffd54a" />
            <rect x="75.5" y="41" width="9" height="2.5" fill="#ffd54a" />
            <line x1="80" y1="18" x2="80" y2={12 - (i % 2) * 2} stroke="#c8b78f" strokeWidth="1.2" />
          </g>
        ))}
        <rect x="50" y="50" width="60" height="56" rx="5" fill={`url(#${u}redface)`} />
        <rect x="55" y="55" width="50" height="46" rx="3" fill="none" stroke="#ffd54a" strokeWidth="1.8" />
        <circle cx="80" cy="78" r="12" fill="#ffd54a" />
        {spark(80, 78, 7, "#c4161c", 1)}
      </g>
    )
  } else {
    art = (
      <g>
        <g transform="rotate(-8 64 40)">
          <rect x="62" y="20" width="9" height="30" rx="2" fill="#d1252b" />
          <path d="M62 21 Q66.5 8 71 21 Z" fill="#1d3f7a" />
        </g>
        <line x1="90" y1="48" x2="98" y2="16" stroke="#9aa0aa" strokeWidth="3" strokeLinecap="round" />
        <line x1="96" y1="48" x2="108" y2="22" stroke="#9aa0aa" strokeWidth="3" strokeLinecap="round" />
        {spark(100, 12, 5, "#ffc233")}
        <rect x="80" y="24" width="8" height="26" rx="2" fill="#2fbf55" />
        <rect x="48" y="58" width="64" height="48" rx="3" fill={gift[0]} />
        <rect x="48" y="58" width="64" height="48" rx="3" fill={`url(#${u}shade)`} />
        <rect x="44" y="46" width="72" height="15" rx="3" fill={gift[0]} />
        <rect x="44" y="56" width="72" height="5" fill={gift[1]} opacity=".55" />
        <rect x="75" y="46" width="10" height="60" fill="#ffd54a" />
        <path d="M80 46 C68 32 58 40 72 46 Z M80 46 C92 32 102 40 88 46 Z" fill="#ffc233" />
        {spark(62, 84, 4, "#ffffff", 0.75)}
        {spark(98, 92, 3, "#ffffff", 0.6)}
      </g>
    )
  }

  return (
    <svg className={`product-art ${className}`} viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" role="img" aria-label={name}>
      <defs>
        <radialGradient id={u + "bg"} cx=".5" cy=".38" r=".8">
          <stop offset="0" stopColor={bgA} />
          <stop offset="1" stopColor={bgB} />
        </radialGradient>
        {tube("red", "#ff5a5f", "#d1252b", "#8f1418")}
        {tube("redtube", "#ff6b6b", "#d1252b", "#7d0f12")}
        {tube("bluetube", "#5d93e6", "#2C5EAD", "#173a73")}
        {tube("tealtube", "#3fd0b0", "#14957a", "#0b5446")}
        {tube("navytube", "#3c5f96", "#1d3f7a", "#0b1d3d")}
        {tube("navy", "#3c5f96", "#1d3f7a", "#0b1d3d")}
        <linearGradient id={u + "purpleface"} x1="0" x2="1">
          <stop offset="0" stopColor="#8d55d8" />
          <stop offset="1" stopColor="#6a34b4" />
        </linearGradient>
        <linearGradient id={u + "redface"} x1="0" x2="1">
          <stop offset="0" stopColor="#e5333a" />
          <stop offset="1" stopColor="#a8161c" />
        </linearGradient>
        <linearGradient id={u + "shade"} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".18" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".22" />
        </linearGradient>
        <radialGradient id={u + "disc"} cx=".4" cy=".35" r=".75">
          <stop offset="0" stopColor="#3ccf7a" />
          <stop offset="1" stopColor="#11633b" />
        </radialGradient>
        <clipPath id={u + "clip"}>
          <rect x="66" y="26" width="24" height="82" rx="3.5" />
        </clipPath>
      </defs>
      <rect width="160" height="120" fill={`url(#${u}bg)`} />
      {spark(22, 22, 4, "#ffffff", 0.8)}
      {spark(138, 30, 3, "#ffffff", 0.7)}
      {spark(130, 96, 2.5, "#ffffff", 0.6)}
      <ellipse cx="80" cy="110" rx="40" ry="5" fill="#0b1d3d" opacity=".1" />
      {art}
    </svg>
  )
}
