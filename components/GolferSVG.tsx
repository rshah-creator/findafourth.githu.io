/**
 * Pixel-art golfer — React Native SVG port of the HTML version.
 * 800×800 viewBox rendered at 200×200. Uses setInterval to cycle
 * through 3 poses: backswing → address → follow-through.
 */
import React, { useEffect, useState } from 'react';
import Svg, { Rect, G, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

const k = '#1A0A3C';
const d = '#3D1A78';
const b = '#9B72E6';
const m = '#7B4FD4';
const l = '#C4B5F4';

type R = [number, number, number, number, string];

// Helper so coords read as (x, y, w, h, color)
function rects(list: R[]) {
  return list.map(([x, y, w, h, c], i) => (
    <Rect key={i} x={x} y={y} width={w} height={h} fill={c} />
  ));
}

const BG:      R[] = [[0, 0, 800, 800, '#F3EFFE']];

const CLOUDS:  R[] = [
  [60,112,128,20,l],[84,88,80,24,l],[108,72,40,16,l],[72,56,24,16,l],
  [592,176,112,20,l],[616,152,64,24,l],[636,136,32,16,l],[620,120,24,16,l],
];

const PINE_L:  R[] = [
  [88,432,16,20,k],[76,452,40,24,k],[60,476,72,28,k],
  [44,504,104,28,k],[28,532,136,28,k],[12,560,168,28,k],
  [80,588,32,120,k],
];

const PINE_R:  R[] = [
  [660,456,16,20,k],[648,476,40,24,k],[636,500,64,24,k],
  [624,524,88,28,k],[612,552,112,28,k],
  [640,580,24,124,k],
];

const HILL:    R[] = [
  [280,620,240,20,k],[200,640,400,28,k],[120,668,560,28,k],
  [40,696,720,28,d],[0,724,800,28,d],[0,752,800,24,b],[0,776,800,24,m],
];

const BODY:    R[] = [
  [424,396,16,8,k],  // hat button
  [404,404,56,12,k], // hat cap
  [448,416,36,10,k], // hat brim
  [480,416,12,8,k],  // brim taper
  [412,416,36,36,k], // head
  [444,420,8,20,k],  // jaw
  [396,452,8,8,k],   // shoulder taper
  [400,452,48,36,k], // upper body
  [408,488,36,36,k], // lower body
  [400,524,24,72,k], // front leg
  [396,548,4,16,k],  // knee detail
  [436,524,24,72,k], // back leg
  [388,596,36,24,k], // front foot
  [436,596,24,24,k], // back foot
  [380,612,8,12,k],  // front toe
  [456,612,8,12,k],  // back heel
];

// Arms + club + ball per pose
const POSE: R[][] = [
  // 0 — backswing (club upper-left)
  [
    [340,428,72,12,k],[316,404,36,12,k],[292,380,24,12,k],[268,356,36,12,k],
    [256,332,12,12,k],[244,296,12,27,k],
    [472,608,12,12,k],
  ],
  // 1 — address (club down)
  [
    [352,464,48,12,k],[340,476,36,12,k],[328,488,24,12,k],[312,500,36,12,k],
    [300,512,12,12,k],[276,524,36,12,k],
    [472,608,12,12,k],
  ],
  // 2 — follow-through (club upper-right, ball flies)
  [
    [448,464,48,12,k],[484,440,24,24,k],[496,416,24,24,k],[508,392,36,12,k],
    [532,368,12,12,k],[544,344,27,12,k],
    [688,420,12,12,k],
  ],
];

const CYCLE = [0, 1, 2, 1]; // looping sequence

export function GolferSVG({ size = 200 }: { size?: number }) {
  const [frame, setFrame] = useState(0);
  const [p2visible, setP2visible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % CYCLE.length);
      setP2visible(v => !v);
    }, 600);
    return () => clearInterval(id);
  }, []);

  const pose = CYCLE[frame];

  return (
    <Svg viewBox="0 0 800 800" width={size} height={size}>
      {/* Background */}
      {rects(BG)}
      {/* Scene */}
      {rects(CLOUDS)}
      {/* PLAYER labels — drawn after clouds so they appear in front */}
      <SvgText x={40} y={72} fontFamily="PressStart2P_400Regular" fontSize={33} fill={k}>
        PLAYER 1
      </SvgText>
      {p2visible && (
        <SvgText x={760} y={72} fontFamily="PressStart2P_400Regular" fontSize={33} fill={k}
          textAnchor="end">
          PLAYER 2
        </SvgText>
      )}
      {rects(PINE_L)}
      {rects(PINE_R)}
      {rects(HILL)}
      {/* Golfer */}
      {rects(BODY)}
      {rects(POSE[pose])}
    </Svg>
  );
}
