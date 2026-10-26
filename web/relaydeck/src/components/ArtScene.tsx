import { useId, type CSSProperties } from "react";
import panoramaUrl from "../assets/night-wires-panorama.webp";
import verticalUrl from "../assets/night-wires-vertical.webp";

// The Paper artwork with a restrained motion layer on top. The image and the
// SVG overlay share one coordinate space and both scale with "cover"
// semantics, so pulses stay on the drawn wires at any viewport size.

interface Scene {
  src: string;
  width: number;
  height: number;
  wires: string[];
  stars: [number, number, number][];
  lamps: { x: number; y: number; r: number; delay: number }[];
}

const PANORAMA: Scene = {
  src: panoramaUrl,
  width: 1376,
  height: 584,
  wires: [
    "M 252 128 Q 640 286 1004 284",
    "M 268 156 Q 660 312 1010 300",
    "M 1140 102 Q 1062 172 1032 256",
    "M 1226 186 Q 1112 246 1040 300",
    "M 442 330 Q 524 372 606 402",
    "M 0 64 Q 92 92 180 122",
  ],
  stars: [
    [422, 30, 1.4], [612, 58, 1.1], [736, 96, 1.3], [1012, 40, 1.5], [1292, 72, 1.1], [342, 112, 1.2],
    [822, 162, 1.0], [1102, 132, 1.3], [562, 150, 1.0], [962, 22, 1.2], [152, 92, 1.1], [906, 212, 1.0],
  ],
  lamps: [
    { x: 552, y: 523, r: 30, delay: 0 },
    { x: 576, y: 523, r: 30, delay: 1.4 },
  ],
};

const VERTICAL: Scene = {
  src: verticalUrl,
  width: 768,
  height: 1376,
  wires: ["M 0 448 Q 280 395 560 340", "M 230 610 Q 340 590 440 572", "M 0 640 Q 300 690 610 700"],
  stars: [
    [210, 330, 1.6], [330, 360, 1.3], [700, 330, 1.4], [460, 430, 1.2], [300, 720, 1.3], [120, 300, 1.2], [640, 480, 1.1],
  ],
  lamps: [
    { x: 254, y: 850, r: 44, delay: 0 },
    { x: 522, y: 800, r: 40, delay: 2.1 },
    { x: 281, y: 397, r: 14, delay: 0.7 },
    { x: 440, y: 575, r: 14, delay: 1.6 },
  ],
};

export function ArtScene({ art, animating, className = "" }: { art: "panorama" | "vertical"; animating: boolean; className?: string }) {
  const scene = art === "panorama" ? PANORAMA : VERTICAL;
  // Each instance needs its own gradient id; hidden copies would otherwise
  // capture the reference.
  const gradientId = `lamp-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className={`art-scene ${animating ? "is-moving" : "is-still"} ${className}`} aria-hidden>
      <div className="art-drift">
        <img className="art-image" src={scene.src} alt="" width={scene.width} height={scene.height} decoding="async" />
        <svg className="art-overlay" viewBox={`0 0 ${scene.width} ${scene.height}`} preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id={gradientId}>
              <stop offset="0" stopColor="#FF7FB6" stopOpacity="0.55" />
              <stop offset="1" stopColor="#FF4F9A" stopOpacity="0" />
            </radialGradient>
          </defs>
          {scene.lamps.map((lamp, index) => (
            <circle
              key={`lamp-${index}`}
              className="art-lamp"
              cx={lamp.x}
              cy={lamp.y}
              r={lamp.r}
              fill={`url(#${gradientId})`}
              style={{ animationDelay: `${lamp.delay}s` } as CSSProperties}
            />
          ))}
          {scene.stars.map(([x, y, r], index) => (
            <circle
              key={`star-${index}`}
              className="art-star"
              cx={x}
              cy={y}
              r={r}
              style={{ animationDelay: `${(index * 1.7) % 7}s`, animationDuration: `${5 + (index % 4) * 1.5}s` } as CSSProperties}
            />
          ))}
          {scene.wires.map((d, index) => (
            <path
              key={`wire-${index}`}
              className="art-pulse"
              d={d}
              pathLength={100}
              style={{ animationDelay: `${index * 2.3}s`, animationDuration: `${9 + (index % 3) * 3}s` } as CSSProperties}
            />
          ))}
        </svg>
      </div>
      <div className="art-grain" />
    </div>
  );
}
