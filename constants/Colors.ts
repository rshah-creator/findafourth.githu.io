/**
 * Design tokens — mirrors the CSS custom properties in index.html.
 * Use via useColors() hook which returns the correct theme variant.
 */

const palette = {
  purple100: '#F3EFFE',
  purple200: '#EDE7FA',
  purple300: '#C4B5F4',
  purple400: '#9B72E6',
  purple500: '#7B4FD4',
  purple600: '#5C3AAD',
  purple700: '#3D1A78',
  purple800: '#1A0A3C',

  pink: '#C850C0',
  blue: '#4158D0',

  white: '#FFFFFF',
  black: '#000000',

  green: '#34C759',
  greenDark: '#30D158',
  red: '#E64545',
  redDark: '#FF453A',
  amber: '#F59E0B',
  amberDark: '#FFD60A',
};

export const GRAD_COLORS: [string, string, string] = [
  palette.pink,
  palette.purple500,
  palette.blue,
];

export const Colors = {
  light: {
    // Backgrounds
    bg1: '#FFFFFF',
    bg2: '#F8F7FC',
    bg3: '#F0EEF8',

    // Text
    tx1: '#1A0A3C',
    tx2: '#5B4B8A',
    tx3: '#9B8FBE',

    // Primary
    p1: palette.purple500,
    pTint: palette.purple200,
    pBorder: palette.purple300,
    pDark: palette.purple600,

    // Borders
    br2: '#E0DCF0',
    br3: '#EAE7F5',

    // Status
    green: palette.green,
    red: palette.red,
    amber: palette.amber,

    tabBar: '#FFFFFF',
    card: '#FFFFFF',
    shadow: 'rgba(100, 60, 200, 0.08)',
  },
  dark: {
    bg1: '#0F0A1E',
    bg2: '#1A1230',
    bg3: '#241A3E',

    tx1: '#F0ECF9',
    tx2: '#B8A8D8',
    tx3: '#7A6AA0',

    p1: palette.purple400,
    pTint: '#2A1A4E',
    pBorder: '#4A3380',
    pDark: '#C4A0FF',

    br2: '#2E2050',
    br3: '#241A3E',

    green: palette.greenDark,
    red: palette.redDark,
    amber: palette.amberDark,

    tabBar: '#0F0A1E',
    card: '#1A1230',
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
};

export type ColorScheme = typeof Colors.light;
