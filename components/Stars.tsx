/**
 * Stars — proportional star rating display.
 * Each star fills exactly to the decimal fraction of the rating,
 * e.g. 4.3 → four full stars + a 30%-filled fifth star.
 * Uses react-native-svg (already in project) + a ClipPath rect.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect } from 'react-native-svg';

interface Props {
  value: number;       // e.g. 4.7
  size?: number;
  color?: string;
  emptyColor?: string; // defaults to 25%-opacity version of color
}

/** Generates a centred 5-pointed star path inside a `s × s` viewBox. */
function starPath(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const R  = s / 2 * 0.94;  // outer radius
  const r  = s / 2 * 0.40;  // inner radius (concave points)
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const outer = ((i * 72) - 90) * (Math.PI / 180);
    const inner = ((i * 72) + 36 - 90) * (Math.PI / 180);
    pts.push(`${cx + R * Math.cos(outer)},${cy + R * Math.sin(outer)}`);
    pts.push(`${cx + r * Math.cos(inner)},${cy + r * Math.sin(inner)}`);
  }
  return `M${pts[0]}L${pts.slice(1).join('L')}Z`;
}

export function Stars({ value, size = 12, color = '#F59E0B', emptyColor }: Props) {
  const d     = starPath(size);
  // Default empty-star colour: the fill colour at ~22% opacity
  const empty = emptyColor ?? (color.startsWith('#') ? `${color}38` : 'rgba(0,0,0,0.15)');

  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => {
        // How much of this star position is filled (0–1)
        const fill   = Math.min(1, Math.max(0, value - (i - 1)));
        const clipId = `sc-${i}-${size}`;

        return (
          <Svg key={i} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Empty star background */}
            <Path d={d} fill={empty} />

            {/* Filled slice — clipped to a rectangle of width proportional to fill */}
            {fill > 0 && (
              <>
                <Defs>
                  <ClipPath id={clipId}>
                    <Rect x={0} y={0} width={size * fill} height={size} />
                  </ClipPath>
                </Defs>
                <Path d={d} fill={color} clipPath={`url(#${clipId})`} />
              </>
            )}
          </Svg>
        );
      })}
    </View>
  );
}
