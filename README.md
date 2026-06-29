# Find a Fourth — Expo App

Golf matchmaking app. Converted from single-file HTML prototype to Expo Router + TypeScript.

## Setup

```bash
# 1. Install Node.js 20+ from https://nodejs.org if not already installed

# 2. Install dependencies
npm install

# 3. Start the dev server
npm start
```

Then press `i` for iOS Simulator, `a` for Android emulator, or scan the QR code with the **Expo Go** app on your phone.

## Project structure

```
app/
  _layout.tsx            Root layout — font loading, onboarding guard
  onboarding.tsx         3-screen swipeable onboarding flow
  (tabs)/
    _layout.tsx          Tab bar (Profile · Discover · Broadcast · Friends · Messages)
    index.tsx            Profile screen
    discover.tsx         Discover screen — players + games, friends-only filter
    broadcast.tsx        Broadcast screen — 3-step form
    friends.tsx          Friends screen — online/offline/suggested
    messages.tsx         Messages list
  chat/
    [id].tsx             Chat thread (full-screen, no tab bar)

components/
  Avatar.tsx             Circular avatar using pravatar.cc images
  BrandMark.tsx          "4F / FIND A / FOURTH" wordmark with SVG gradient
  Toggle.tsx             Animated iOS-style toggle
  Stars.tsx              Star rating display
  StatBox.tsx            Stat tile (Handicap, Tees, Pace, Music)
  Pill.tsx               Coloured label chip
  SectionLabel.tsx       Uppercase section header
  PlayerSheet.tsx        Full player profile modal sheet

constants/
  Colors.ts              Design tokens (light + dark theme)
  Data.ts                Mock data — PLAYERS, FRIENDS, GAMES, THREADS

context/
  AppContext.tsx          Global state — theme, phase, sheet, unread, etc.

types/
  index.ts               TypeScript interfaces
```

## Key dependencies

| Package | Purpose |
|---|---|
| `expo-router` | File-based navigation |
| `expo-linear-gradient` | Brand gradient + button fills |
| `react-native-svg` | BrandMark text gradient |
| `@expo-google-fonts/bricolage-grotesque` | UI typeface |
| `@expo/vector-icons` | Ionicons + MaterialCommunityIcons |
| `@react-native-async-storage/async-storage` | Onboarding persistence |
| `react-native-reanimated` | Smooth animations |

## Design tokens

All colours live in `constants/Colors.ts` and mirror the CSS variables from the HTML prototype:

| Token | Light | Dark |
|---|---|---|
| `p1` (primary purple) | `#7B4FD4` | `#9B72E6` |
| `bg1` | `#FFFFFF` | `#0F0A1E` |
| `tx1` | `#1A0A3C` | `#F0ECF9` |
| Gradient | `#C850C0 → #7B4FD4 → #4158D0` | same |

## Resetting onboarding

```js
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.removeItem('f4f_onboarding_done');
```

Or use the Profile tab → Dev settings panel in-app.
