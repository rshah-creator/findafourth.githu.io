/**
 * Pixel-art golf flag — matches the HTML prototype's design language.
 * 400×400 viewBox at 200×200. The flag waves via a 3-frame animation.
 */
import React, { useEffect, useState } from 'react';
import Svg, { Rect, Circle } from 'react-native-svg';

const k = '#1A0A3C';
const d = '#3D1A78';
const b = '#9B72E6';
const m = '#7B4FD4';
const l = '#C4B5F4';
const g = '#34C759'; // green

type R = [number, number, number, number, string];

function rects(list: R[]) {
  return list.map(([x, y, w, h, c], i) => (
    <Rect key={i} x={x} y={y} width={w} height={h} fill={c} />
  ));
}

// Flag wave: 3 frames of the flag shape shifting
const FLAG_FRAMES: R[][] = [
  // frame 0 — flag extended flat
  [
    [200, 60, 12, 220, k],           // pole
    [212, 60, 100, 20, m],           // flag top
    [212, 80, 100, 20, b],           // flag mid
    [212,100, 100, 20, l],           // flag bottom
  ],
  // frame 1 — slight wave
  [
    [200, 60, 12, 220, k],
    [212, 60,  96, 20, m],
    [212, 80, 104, 20, b],
    [212,100,  96, 20, l],
  ],
  // frame 2 — wave peak
  [
    [200, 60, 12, 220, k],
    [212, 60,  88, 20, m],
    [212, 80, 108, 20, b],
    [212,100,  88, 20, l],
  ],
];

// Static scene
const SCENE: R[] = [
  // Sky
  [0,   0, 400, 220, '#F3EFFE'],
  // Ground strips
  [0, 220, 400,  40, g],
  [0, 260, 400,  36, '#2DBE50'],
  [0, 296, 400,  28, '#28A847'],
  // Hill
  [80, 240, 240, 20, '#2DBE50'],
  [120,220, 160, 24, '#2DBE50'],
  // Hole
  [180, 330, 40, 12, d],
  // Clouds
  [40, 60, 80, 16, l], [60, 44, 48, 20, l], [80, 32, 28, 16, l],
  [260,80,  64, 16, l],[276, 64, 40, 20, l],[292, 52, 20, 16, l],
];

const STARS: Array<[number, number, number]> = [
  [80, 100, 6], [140, 60, 4], [300, 40, 6], [340, 90, 4], [60, 150, 4],
];

const CYCLE = [0, 1, 2, 1];

export function FlagSVG({ size = 200 }: { size?: number }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % CYCLE.length);
    }, 400);
    return () => clearInterval(id);
  }, []);

  const flagFrame = CYCLE[frame];

  return (
    <Svg viewBox="0 0 400 400" width={size} height={size}>
      {/* Background */}
      <Rect x={0} y={0} width={400} height={400} fill="#F3EFFE" rx={32} />
      {/* Stars in sky */}
      {STARS.map(([x, y, r], i) => (
        <Rect key={i} x={x - r/2} y={y - r/2} width={r} height={r} fill={l} />
      ))}
      {/* Scene */}
      {rects(SCENE)}
      {/* Animated flag */}
      {rects(FLAG_FRAMES[flagFrame])}
      {/* Shadow below pole base */}
      <Rect x={188} y={278} width={36} height={8} fill={d} />
    </Svg>
  );
}
