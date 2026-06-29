import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Modal,
  TouchableOpacity, TextInput, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { Toggle } from '@/components/Toggle';
import { Avatar } from '@/components/Avatar';
import { FRIENDS, PLAYERS, VENUES } from '@/constants/Data';
import { GRAD_COLORS } from '@/constants/Colors';
import { containsProfanity } from '@/utils/profanity';
import { createGame, buildChipsFromGame, cancelGame, updateGame } from '@/lib/games';
import type { Friend, Player, Game } from '@/types';

// ── People lookup (for co-broadcaster display and search) ─────────────────────
const PEOPLE_MAP: Record<string, Player | Friend> = Object.fromEntries(
  [...PLAYERS, ...FRIENDS].map(p => [p.id, p])
);
const FRIEND_IDS = new Set(FRIENDS.map(f => f.id));
const HCP_RANGES = ['Open', 'Hcp 0–6', 'Hcp 6–12', 'Hcp 12–18', 'Hcp 18–24', 'Hcp 24+'];
const PACES = ['Any', 'Fast', 'Moderate', 'Relaxed', 'Casual'];
const HOLES   = ['9 Holes', '18 Holes', '27 Holes', '36 Holes'];
const FORMATS = ['Stroke Play', 'Match Play', 'Stableford'];
const TEES_OPTIONS = ['Any', 'Black', 'Blue', 'White', 'Yellow', 'Red'];
const CART_OPTIONS = ['Any', 'Walking', 'Cart'];

// Maps a numeric handicap onto its HCP_RANGES bucket
function hcpToRange(hcpNum: number): string {
  if (hcpNum <= 6)  return 'Hcp 0–6';
  if (hcpNum <= 12) return 'Hcp 6–12';
  if (hcpNum <= 18) return 'Hcp 12–18';
  if (hcpNum <= 24) return 'Hcp 18–24';
  return 'Hcp 24+';
}

// Multi-select toggle — same semantics as Discover's filters: the reset value
// ('Open'/'Any') clears the selection; emptying the selection reverts to it.
function toggleMultiValue(prev: string[], value: string, reset: string): string[] {
  if (value === reset) return [reset];
  const without = prev.filter(v => v !== reset);
  const next = without.includes(value)
    ? without.filter(v => v !== value)
    : [...without, value];
  return next.length ? next : [reset];
}

// Serialises a multi-selection back to the Game's single-string field
function joinSelection(values: string[], reset: string): string {
  return values.includes(reset) ? reset : values.join(', ');
}

// ── Date / time options ───────────────────────────────────────────────────────
function buildDateOptions(): string[] {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const base = new Date();
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (i === 0) return 'Today';
    if (i === 1) return 'Tomorrow';
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONS[d.getMonth()]}`;
  });
}

function buildTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 5; h <= 18; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 18 && m > 0) break;
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h === 12 ? 12 : h > 12 ? h - 12 : h;
      opts.push(`${h12}:${m.toString().padStart(2, '0')} ${period}`);
    }
  }
  return opts;
}

// Returns the next future 15-min slot as a formatted string matching TIME_OPTIONS
function getMinFutureTime(): string {
  const now = new Date();
  let h = now.getHours();
  let m = Math.floor(now.getMinutes() / 15) * 15 + 15; // always advance one slot
  if (m >= 60) { m = 0; h += 1; }
  if (h > 18 || (h === 18 && m > 0)) return '';
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 12 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function getInitialTime(): string {
  const min = getMinFutureTime();
  if (!min) return TIME_OPTIONS[0];
  const idx = TIME_OPTIONS.indexOf(min);
  return idx >= 0 ? TIME_OPTIONS[idx] : TIME_OPTIONS[0];
}

const DATE_OPTIONS = buildDateOptions();
const TIME_OPTIONS = buildTimeOptions();

export default function BroadcastScreen() {
  const {
    colors, phase, broadcastFriend, setBroadcastFriend,
    homeCourse, profileMode, profileCity, profileStats,
    supabaseUser, myActiveGame, setMyActiveGame,
    profileName, notifyBroadcastDeclined, notifyBroadcastCancelled, notifyRejectedPlayer,
    findOrCreateGroupThread,
    submitRatings, hasSubmittedRatings,
    roundsPlayed, setRoundsPlayed,
    pushToken, requestPushPermission,
  } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Form state — free/freePro locked to homeCourse; pro can pick any
  const [venue, setVenue]       = useState(phase !== 'pro' ? homeCourse : '');
  const [date, setDate]         = useState('Today');
  const [time, setTime]         = useState(() => getInitialTime());
  const [title, setTitle]       = useState('');
  const [titleErr, setTitleErr] = useState('');
  const [hcpRanges, setHcpRanges] = useState<string[]>(['Open']);
  const [paces,     setPaces]     = useState<string[]>(['Any']);
  const [teesArr,   setTeesArr]   = useState<string[]>(['Any']);
  const [cartArr,   setCartArr]   = useState<string[]>(['Any']);
  const detailsTouched = useRef(false);
  const [holes, setHoles]       = useState('18 Holes');
  const [format, setFormat]     = useState('Stroke Play');
  const [spots, setSpots]       = useState(3);
  const [notifyFriends, setNotifyFriends]   = useState<string[]>([]);
  const [coBroadcasters, setCoBroadcasters] = useState<string[]>([]);
  const [coSearchOpen,   setCoSearchOpen]   = useState(false);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [boost, setBoost]       = useState(phase === 'pro');
  const [posting, setPosting]   = useState(false);

  // Max open spots = 4 (foursome) − 1 (you) − co-broadcasters
  const maxSpots = 4 - 1 - coBroadcasters.length;
  const availableSpotsOpts = ['1 more', '2 more', '3 more'].slice(0, maxSpots);

  // Auto-clamp spots when co-broadcasters are added
  useEffect(() => {
    if (spots > maxSpots) setSpots(maxSpots);
  }, [coBroadcasters.length]);

  // Pre-select Details options matching the broadcaster(s)' profiles.
  // Stops once the user edits any picker manually (detailsTouched).
  useEffect(() => {
    if (detailsTouched.current) return;
    const ranges = new Set<string>();
    const paceSet = new Set<string>();
    const teeSet  = new Set<string>();
    const cartSet = new Set<string>();
    const myHcp = parseInt(profileStats.handicap, 10);
    if (!isNaN(myHcp)) ranges.add(hcpToRange(myHcp));
    if (PACES.includes(profileStats.pace))        paceSet.add(profileStats.pace);
    if (TEES_OPTIONS.includes(profileStats.tees)) teeSet.add(profileStats.tees);
    if (CART_OPTIONS.includes(profileStats.cart)) cartSet.add(profileStats.cart);
    for (const id of coBroadcasters) {
      const p = PEOPLE_MAP[id] as any;
      if (!p) continue;
      const n = parseInt((p.hcp ?? '').replace(/\D/g, ''), 10);
      if (!isNaN(n)) ranges.add(hcpToRange(n));
      if (p.pace && PACES.includes(p.pace))        paceSet.add(p.pace);
      if (p.tees && TEES_OPTIONS.includes(p.tees)) teeSet.add(p.tees);
      if (p.cart && CART_OPTIONS.includes(p.cart)) cartSet.add(p.cart);
    }
    setHcpRanges(ranges.size ? [...ranges] : ['Open']);
    setPaces(paceSet.size ? [...paceSet] : ['Any']);
    setTeesArr(teeSet.size ? [...teeSet] : ['Any']);
    setCartArr(cartSet.size ? [...cartSet] : ['Any']);
  }, [coBroadcasters, profileStats]);

  // Sync venue with homeCourse once context loads (homeCourse starts '' and populates async)
  useEffect(() => {
    if (phase !== 'pro' && homeCourse) setVenue(homeCourse);
  }, [homeCourse, phase]);

  // Pre-select friend coming from Friends tab
  useEffect(() => {
    if (broadcastFriend) {
      setNotifyFriends(ids => ids.includes(broadcastFriend.id) ? ids : [...ids, broadcastFriend.id]);
      setBroadcastFriend(null);
    }
  }, [broadcastFriend]);

  const toggleFriend = (id: string) => {
    setNotifyFriends(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const reset = () => {
    setStep(0);
    setVenue(phase !== 'pro' ? homeCourse : ''); setDate('Today'); setTime(getInitialTime());
    setTitle(''); setTitleErr('');
    setHcpRanges(['Open']); setPaces(['Any']); setTeesArr(['Any']); setCartArr(['Any']);
    setHoles('18 Holes'); setFormat('Stroke Play'); setSpots(3);
    setNotifyFriends([]); setCoBroadcasters([]);
    detailsTouched.current = false; // next broadcast re-seeds from profiles
  };

  // Picker toggles — mark Details as manually edited so the seeding effect backs off
  const togglePicker = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    reset: string,
  ) => (value: string) => {
    detailsTouched.current = true;
    setter(prev => toggleMultiValue(prev, value, reset));
  };

  // Joined single-string forms used by Review, post payload and game chips
  const hcpRangeStr = joinSelection(hcpRanges, 'Open');
  const paceStr     = joinSelection(paces, 'Any');
  const teesStr     = joinSelection(teesArr, 'Any');
  const cartStr     = joinSelection(cartArr, 'Any');

  // Validate title when advancing from Details (step 1) → Review (step 2)
  const handleContinue = () => {
    if (step === 1) {
      const trimmed = title.trim();
      if (!trimmed) { setTitleErr('Please give your game a name'); return; }
      if (containsProfanity(trimmed)) { setTitleErr('Please use appropriate language'); return; }
    }
    setStep(s => s + 1);
  };

  // Post to Supabase + optimistically update Discover
  const handlePost = async () => {
    // Request push permission the first time the user posts a broadcast
    if (!pushToken) requestPushPermission();
    setPosting(true);
    const chips = buildChipsFromGame({ hcp_range: hcpRangeStr, pace: paceStr, holes, format });
    const coNames   = coBroadcasters.map(id => PEOPLE_MAP[id]?.name ?? id);
    const crewNames = coNames.length > 0 ? `You, ${coNames.join(', ')}` : 'You';
    const selfId = profileMode === 'mock' ? 'yousef' : (supabaseUser?.id ?? 'local');
    const localGame: Game = {
      id:              `temp-${Date.now()}`,
      broadcaster_id:  selfId,
      title, venue, city: profileCity,
      when: `${date} ${time}`,
      crew:            [selfId, ...coBroadcasters],
      crewNames,
      crewRating:      '—',
      chips, spots, boosted: boost,
      hcp_range: hcpRangeStr, pace: paceStr, tees: teesStr, cart: cartStr, holes, format,
      co_broadcasters: coBroadcasters,
      pending_co_broadcasters: coBroadcasters, // added users must confirm
      joined_players:  [],
      pending_joined_players: [],
    };
    setMyActiveGame(localGame);

    if (supabaseUser) {
      const { game } = await createGame(supabaseUser.id, {
        title, venue, city: profileCity,
        when_date: date, when_time: time,
        hcp_range: hcpRangeStr, pace: paceStr, tees: teesStr, cart: cartStr,
        holes, format, spots, boosted: boost,
        co_broadcasters: coBroadcasters,
      });
      if (game) setMyActiveGame({ ...localGame, id: game.id });
    }
    setPosting(false);
    reset();
  };

  // ── If a broadcast is already active, show the active view instead ──────────
  if (myActiveGame) {
    const meId = profileMode === 'mock' ? 'yousef' : (supabaseUser?.id ?? 'local');
    const isPersisted = !!supabaseUser && !!myActiveGame.id &&
      !myActiveGame.id.startsWith('temp-') && !myActiveGame.id.startsWith('my-game-mock');
    const myName = profileName || 'A player';

    return (
      <ActiveBroadcastView
        game={myActiveGame}
        meId={meId}
        myName={myName}
        colors={colors}
        insets={insets}
        editDetailsOpen={editDetailsOpen}
        setEditDetailsOpen={setEditDetailsOpen}
        onUpdate={(updated: Game) => {
          setMyActiveGame(updated);
          if (isPersisted) {
            updateGame(myActiveGame.id, {
              hcp_range: updated.hcp_range, pace: updated.pace,
              tees: updated.tees, cart: updated.cart,
              holes: updated.holes, format: updated.format,
              co_broadcasters: updated.co_broadcasters,
              pending_co_broadcasters: updated.pending_co_broadcasters,
              spots: updated.spots,
            });
          }
        }}
        onCancel={async () => {
          // Notify co-broadcasters and joined players
          const affected = [
            ...(myActiveGame.co_broadcasters ?? []),
            ...(myActiveGame.joined_players ?? []),
            ...(myActiveGame.pending_joined_players ?? []),
          ];
          notifyBroadcastCancelled(myName, myActiveGame.title, affected);
          if (isPersisted) await cancelGame(myActiveGame.id);
          setMyActiveGame(null);
        }}
        onLeaveOrDecline={async (declined: boolean) => {
          // You are leaving/declining someone else's broadcast → notify host, clear your slot
          notifyBroadcastDeclined(myName, myActiveGame.title, !declined);
          if (isPersisted) await cancelGame(myActiveGame.id); // real path would update host's game
          setMyActiveGame(null);
        }}
        onRejectJoiner={(joinerId: string) => {
          notifyRejectedPlayer(myActiveGame.title, myActiveGame.id);
        }}
        onMessageGroup={() => {
          findOrCreateGroupThread(myActiveGame);
          router.push(`/chat/${myActiveGame.id}-thread`);
        }}
        onRecordJoin={() => {
          findOrCreateGroupThread(myActiveGame, true);  // joinAtEnd=true, no navigation
        }}
        onSubmitRatings={submitRatings}
        alreadyRated={hasSubmittedRatings(myActiveGame.id)}
        onMarkCompleted={() => {
          const updated = { ...myActiveGame, roundStatus: 'completed' as const };
          setMyActiveGame(updated);
          setRoundsPlayed(roundsPlayed + 1);
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg1 }]}>
      {/* Top nav */}
      <View style={[styles.topnav, { paddingTop: insets.top + 4, borderBottomColor: colors.br3 }]}>
        {step > 0 ? (
          <TouchableOpacity onPress={() => setStep(s => s - 1)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.p1} />
            <Text style={[styles.backBtnText, { color: colors.p1 }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Text style={[styles.navTitle, { color: colors.tx1 }]}>Broadcast</Text>
            <Text style={[styles.navSub, { color: colors.tx3 }]}>Post a tee time · find your fourth</Text>
          </View>
        )}
      </View>

      {/* Step indicators */}
      <View style={styles.steps}>
        {['Venue & Format', 'Details', 'Review'].map((label, i) => (
          <React.Fragment key={i}>
            <TouchableOpacity
              style={styles.stepItem}
              onPress={() => i < step ? setStep(i) : undefined}
              disabled={i >= step}
            >
              <View style={[
                styles.stepDot,
                { borderColor: i <= step ? colors.p1 : colors.br2 },
                i < step && { backgroundColor: colors.p1 },
                i === step && { backgroundColor: colors.pTint },
              ]}>
                {i < step
                  ? <Ionicons name="checkmark" size={12} color="white" />
                  : <Text style={[styles.stepNum, { color: i === step ? colors.p1 : colors.tx3 }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: i <= step ? colors.p1 : colors.tx3 }]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
            {i < 2 && <View style={[styles.stepLine, { backgroundColor: i < step ? colors.p1 : colors.br3 }]} />}
          </React.Fragment>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {step === 0 && (
          <Step1VenueFormat
            colors={colors}
            phase={phase}
            homeCourse={homeCourse}
            venue={venue} setVenue={setVenue}
            date={date} setDate={setDate}
            time={time} setTime={setTime}
            holes={holes} setHoles={setHoles}
            format={format} setFormat={setFormat}
            spots={spots} setSpots={setSpots}
            availableSpotsOpts={availableSpotsOpts}
            coBroadcasters={coBroadcasters}
            setCoBroadcasters={setCoBroadcasters}
            setCoSearchOpen={setCoSearchOpen}
          />
        )}
        {/* Co-broadcaster search modal — rendered at screen level so it overlays everything */}
        <CoBroadcasterSearchModal
          visible={coSearchOpen}
          onClose={() => setCoSearchOpen(false)}
          selected={coBroadcasters}
          onAdd={(id: string) => {
            const total = 1 + coBroadcasters.length + 1; // you + existing co + new
            if (total > 4) {
              Alert.alert('Good news!', 'Looks like you already have four players — no more spots needed!');
              return;
            }
            setCoBroadcasters(prev => [...prev, id]);
          }}
          onRemove={(id: string) => setCoBroadcasters(prev => prev.filter(x => x !== id))}
          profileMode={profileMode}
          colors={colors}
        />
        {step === 1 && (
          <Step2Details
            colors={colors}
            title={title} setTitle={setTitle} titleErr={titleErr} setTitleErr={setTitleErr}
            hcpRanges={hcpRanges} toggleHcpRange={togglePicker(setHcpRanges, 'Open')}
            paces={paces} togglePace={togglePicker(setPaces, 'Any')}
            teesArr={teesArr} toggleTees={togglePicker(setTeesArr, 'Any')}
            cartArr={cartArr} toggleCart={togglePicker(setCartArr, 'Any')}
            coBroadcasters={coBroadcasters}
            notifyFriends={notifyFriends} toggleFriend={toggleFriend}
            activeFriends={profileMode === 'mock' ? FRIENDS : []}
            onReset={() => {
              setTitle(''); setTitleErr('');
              detailsTouched.current = true; // explicit reset shouldn't be re-seeded
              setHcpRanges(['Open']); setPaces(['Any']); setTeesArr(['Any']); setCartArr(['Any']);
              setNotifyFriends([]);
            }}
          />
        )}
        {step === 2 && (
          <Step3Review
            colors={colors}
            phase={phase}
            title={title}
            venue={venue} date={date} time={time}
            hcpRange={hcpRangeStr} pace={paceStr} tees={teesStr} cart={cartStr}
            holes={holes} format={format} spots={spots}
            notifyFriends={notifyFriends}
            activeFriends={profileMode === 'mock' ? FRIENDS : []}
            boost={boost} setBoost={setBoost}
            posting={posting}
            onEdit={() => setStep(0)}
            onPost={handlePost}
          />
        )}
      </ScrollView>

      {/* Footer CTA */}
      {step < 2 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8, borderTopColor: colors.br3 }]}>
          <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaBtn}>
            <TouchableOpacity style={styles.ctaBtnInner} onPress={handleContinue}>
              <Text style={styles.ctaBtnText}>Continue →</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

// ── Step 1: Venue & Format ───────────────────────────────────────────────────
function Step1VenueFormat({ colors, phase, homeCourse, venue, setVenue, date, setDate, time, setTime, holes, setHoles, format, setFormat, spots, setSpots, availableSpotsOpts, coBroadcasters, setCoBroadcasters, setCoSearchOpen }: any) {
  const isPro = phase === 'pro';

  // When Today is selected, only show times still in the future
  const timeItems = React.useMemo(() => {
    if (date !== 'Today') return TIME_OPTIONS;
    const min = getMinFutureTime();
    if (!min) return TIME_OPTIONS;
    const idx = TIME_OPTIONS.indexOf(min);
    return idx >= 0 ? TIME_OPTIONS.slice(idx) : TIME_OPTIONS;
  }, [date]);

  // If the user switches back to Today and the selected time is now in the past, snap forward
  useEffect(() => {
    if (date === 'Today' && timeItems.length > 0 && !timeItems.includes(time)) {
      setTime(timeItems[0]);
    }
  }, [date, timeItems]);

  return (
    <View style={stepStyles.wrap}>
      <Text style={[stepStyles.sectionHead, { color: colors.tx3 }]}>VENUE</Text>

      {isPro ? (
        /* Pro — full venue picker */
        VENUES.map(v => (
          <TouchableOpacity
            key={v}
            style={[stepStyles.optionRow, { borderBottomColor: colors.br3 }]}
            onPress={() => setVenue(v)}
          >
            <Ionicons
              name={venue === v ? 'radio-button-on' : 'radio-button-off'}
              size={20} color={venue === v ? colors.p1 : colors.tx3}
            />
            <Text style={[stepStyles.optionText, { color: colors.tx1 }]}>{v}</Text>
          </TouchableOpacity>
        ))
      ) : (
        /* Free / freePro — locked to home course */
        <>
          <View style={[stepStyles.lockedVenue, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
            <Ionicons name="golf-outline" size={18} color={colors.p1} />
            <View style={{ flex: 1 }}>
              <Text style={[stepStyles.lockedVenueName, { color: colors.pDark }]}>{homeCourse}</Text>
              <Text style={[stepStyles.lockedVenueSub, { color: colors.p1 }]}>Your home course</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={colors.p1} />
          </View>
          <View style={stepStyles.lockedHint}>
            <Ionicons name="information-circle-outline" size={13} color={colors.tx3} />
            <Text style={[stepStyles.lockedHintText, { color: colors.tx3 }]}>
              Edit your profile to change your home course
            </Text>
          </View>
        </>
      )}

      <Text style={[stepStyles.sectionHead, { color: colors.tx3, marginTop: 16 }]}>DATE & TIME</Text>
      <View style={[stepStyles.wheelCard, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
        <WheelScroll items={DATE_OPTIONS} value={date} onChange={setDate} colors={colors} />
        <View style={[stepStyles.wheelVDivider, { backgroundColor: colors.br3 }]} />
        <WheelScroll items={timeItems} value={time} onChange={setTime} colors={colors} />
      </View>
      <View style={stepStyles.dtHint}>
        <Ionicons name="information-circle-outline" size={13} color={colors.tx3} />
        <Text style={[stepStyles.dtHintText, { color: colors.tx3 }]}>
          Booking tee times is the responsibility of the broadcaster(s) — confirm available tee times with your {isPro ? 'course marshal(s)' : 'course marshal'}
        </Text>
      </View>

      {/* Holes, Format, Looking for */}
      <ChipPicker label="Holes"       options={HOLES}             value={holes}   onChange={setHoles}  colors={colors} />
      <ChipPicker label="Format"      options={FORMATS}           value={format}  onChange={setFormat} colors={colors} />
      <ChipPicker
        label="Looking for"
        options={availableSpotsOpts}
        value={`${spots} more`}
        onChange={(v: string) => setSpots(parseInt(v[0], 10))}
        colors={colors}
      />

      {/* ── Co-broadcasters ── */}
      <Text style={[stepStyles.fieldLabel, { color: colors.tx3 }]}>
        CO-BROADCASTERS
        <Text style={{ fontWeight: '400' }}>{' '}· optional  ({coBroadcasters.length}/2)</Text>
      </Text>

      {coBroadcasters.map((id: string) => {
        const person = PEOPLE_MAP[id];
        return (
          <View key={id} style={[stepStyles.coBroadRow, { borderBottomColor: colors.br3 }]}>
            <Avatar who={person?.who ?? id} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={[stepStyles.coBroadName, { color: colors.tx1 }]}>{person?.name ?? id}</Text>
              {(person as any)?.hcp && (
                <Text style={[{ fontSize: 11, marginTop: 1 }, { color: colors.tx3 }]}>{(person as any).hcp}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setCoBroadcasters((prev: string[]) => prev.filter((x: string) => x !== id))}>
              <Ionicons name="close-circle" size={22} color={colors.tx3} />
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Add button — hidden when at max (2) or when foursome already complete */}
      {coBroadcasters.length < 2 && (4 - 1 - coBroadcasters.length) > 0 && (
        <TouchableOpacity
          style={[stepStyles.addCoBroadBtn, { borderColor: colors.pBorder, backgroundColor: colors.pTint }]}
          onPress={() => setCoSearchOpen(true)}
        >
          <Ionicons name="person-add-outline" size={16} color={colors.p1} />
          <Text style={[stepStyles.addCoBroadText, { color: colors.p1 }]}>Add user to broadcast</Text>
        </TouchableOpacity>
      )}

      {/* freePro — Pro upsell banner */}
      {phase === 'freePro' && <BroadcastProBanner colors={colors} />}
    </View>
  );
}

// ── Broadcast Pro upsell banner (freePro) ────────────────────────────────────
function BroadcastProBanner({ colors }: any) {
  return (
    <View style={[stepStyles.proBanner, { borderColor: colors.pBorder }]}>
      <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={stepStyles.proBannerHead}>
        <View style={stepStyles.proBannerPill}>
          <Text style={stepStyles.proBannerPillText}>PRO</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={stepStyles.proBannerTitle}>Broadcast from multiple clubs</Text>
          <Text style={stepStyles.proBannerSub}>Reach players in every city</Text>
        </View>
      </LinearGradient>
      <View style={[stepStyles.proBannerBody, { backgroundColor: colors.pTint }]}>
        <View style={stepStyles.proBannerRow}>
          <Ionicons name="lock-closed" size={14} color={colors.p1} />
          <View style={{ flex: 1 }}>
            <Text style={[stepStyles.proBannerFeature, { color: colors.pDark }]}>Multiple home courses</Text>
            <Text style={[stepStyles.proBannerFeatureSub, { color: colors.p1 }]}>Broadcast from any of your clubs at once</Text>
          </View>
        </View>
        <View style={[stepStyles.proBannerRow, { borderTopWidth: 0.5, borderTopColor: colors.pBorder }]}>
          <Ionicons name="lock-closed" size={14} color={colors.p1} />
          <View style={{ flex: 1 }}>
            <Text style={[stepStyles.proBannerFeature, { color: colors.pDark }]}>Broadcast across cities</Text>
            <Text style={[stepStyles.proBannerFeatureSub, { color: colors.p1 }]}>Reach players in Karachi, Islamabad & more</Text>
          </View>
        </View>
        <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={stepStyles.proBannerBtn}>
          <TouchableOpacity style={stepStyles.proBannerBtnInner}>
            <Text style={stepStyles.proBannerBtnText}>Upgrade to Pro</Text>
            <Ionicons name="arrow-up-circle-outline" size={15} color="white" />
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );
}

// ── iOS-style wheel picker ────────────────────────────────────────────────────
const WP_H = 44;   // row height
const WP_N = 3;    // visible rows: 1 ghost · selected · 1 ghost

function WheelScroll({ items, value, onChange, colors }: {
  items: string[]; value: string; onChange: (v: string) => void; colors: any;
}) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = Math.max(0, items.indexOf(value));
    const timer = setTimeout(() => {
      ref.current?.scrollTo({ y: idx * WP_H, animated: false });
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[wpStyles.col, { backgroundColor: colors.bg2 }]}>
      {/* Thin separator lines framing the selected row */}
      <View style={[wpStyles.sepLine, { top: WP_H,       backgroundColor: colors.br2 }]} pointerEvents="none" />
      <View style={[wpStyles.sepLine, { top: WP_H * 2,   backgroundColor: colors.br2 }]} pointerEvents="none" />

      <ScrollView
        ref={ref}
        snapToInterval={WP_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: WP_H }}
        onMomentumScrollEnd={e => {
          const i = Math.round(e.nativeEvent.contentOffset.y / WP_H);
          onChange(items[Math.max(0, Math.min(i, items.length - 1))]);
        }}
      >
        {items.map(item => {
          const active = item === value;
          return (
            <View key={item} style={wpStyles.row}>
              <Text style={[
                wpStyles.itemText,
                { color: colors.tx1 },
                active ? wpStyles.itemActive : wpStyles.itemGhost,
              ]}>
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Gradient fade — top */}
      <LinearGradient
        colors={[colors.bg2, colors.bg2 + '00']}
        style={[wpStyles.fade, { top: 0 }]}
        pointerEvents="none"
      />
      {/* Gradient fade — bottom */}
      <LinearGradient
        colors={[colors.bg2 + '00', colors.bg2]}
        style={[wpStyles.fade, { bottom: 0 }]}
        pointerEvents="none"
      />
    </View>
  );
}

const wpStyles = StyleSheet.create({
  col: {
    flex: 1,
    height: WP_H * WP_N,
    overflow: 'hidden',
  },
  sepLine: {
    position: 'absolute', left: 0, right: 0,
    height: 0.5, zIndex: 2,
  },
  row:        { height: WP_H, alignItems: 'center', justifyContent: 'center' },
  itemText:   { fontSize: 14 },
  itemActive: { fontWeight: '600', fontSize: 15 },
  itemGhost:  { opacity: 0.25 },
  fade: {
    position: 'absolute', left: 0, right: 0,
    height: WP_H * 0.85, zIndex: 1,
  },
});

// ── Step 2: Details ──────────────────────────────────────────────────────────
function Step2Details({ colors, title, setTitle, titleErr, setTitleErr, hcpRanges, toggleHcpRange, paces, togglePace, teesArr, toggleTees, cartArr, toggleCart, coBroadcasters, notifyFriends, toggleFriend, activeFriends, onReset }: any) {
  return (
    <View style={stepStyles.wrap}>
      {/* Game title */}
      <Text style={[stepStyles.fieldLabel, { color: colors.tx3 }]}>GAME TITLE</Text>
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
        <TextInput
          style={[
            stepStyles.titleInput,
            { backgroundColor: colors.bg2, color: colors.tx1,
              borderColor: titleErr ? '#FF3B30' : colors.br2 },
          ]}
          placeholder='e.g. "Threesome needs a 4th"'
          placeholderTextColor={colors.tx3}
          value={title}
          onChangeText={v => { setTitle(v); if (titleErr) setTitleErr(''); }}
          maxLength={60}
          returnKeyType="done"
        />
        {!!titleErr && (
          <Text style={{ color: '#FF3B30', fontSize: 11, marginTop: 4 }}>{titleErr}</Text>
        )}
      </View>

      <MultiChipPicker label="Handicap range" options={HCP_RANGES}   values={hcpRanges} onToggle={toggleHcpRange} colors={colors} />
      <MultiChipPicker label="Pace"           options={PACES}         values={paces}     onToggle={togglePace}     colors={colors} />
      <MultiChipPicker label="Tees"           options={TEES_OPTIONS}  values={teesArr}   onToggle={toggleTees}     colors={colors} />
      <MultiChipPicker label="Cart"           options={CART_OPTIONS}  values={cartArr}   onToggle={toggleCart}     colors={colors} />

      <View style={stepStyles.autoNoteRow}>
        <Ionicons name="sparkles-outline" size={12} color={colors.tx3} />
        <Text style={[stepStyles.autoNote, { color: colors.tx3 }]}>
          {(coBroadcasters?.length ?? 0) > 0
            ? 'Options matching the broadcasters’ profiles are automatically selected — tap to adjust.'
            : 'Options matching the broadcaster’s profile are automatically selected — tap to adjust.'}
        </Text>
      </View>

      {/* Notify friends */}
      <Text style={[stepStyles.fieldLabel, { color: colors.tx3 }]}>
        NOTIFY FRIENDS <Text style={{ color: colors.tx3, fontWeight: '400' }}>· optional</Text>
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
          {activeFriends.map((f: any) => {
            const sel = notifyFriends.includes(f.id);
            return (
              <TouchableOpacity
                key={f.id}
                style={[friendChipStyles.chip, { opacity: sel ? 1 : 0.45 }]}
                onPress={() => toggleFriend(f.id)}
              >
                <View>
                  <Avatar who={f.who} size={40} />
                  {sel && (
                    <View style={[friendChipStyles.check, { backgroundColor: colors.p1 }]}>
                      <Ionicons name="checkmark" size={10} color="white" />
                    </View>
                  )}
                </View>
                <Text style={[friendChipStyles.name, { color: colors.tx2 }]}>
                  {f.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Reset all selections */}
      <TouchableOpacity
        style={[stepStyles.fullResetBtn, { borderColor: colors.br2 }]}
        onPress={onReset}
      >
        <Ionicons name="refresh-outline" size={14} color={colors.tx3} />
        <Text style={[stepStyles.fullResetText, { color: colors.tx3 }]}>Reset all options</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Step 3: Review ───────────────────────────────────────────────────────────
function Step3Review({ colors, phase, title, venue, date, time, hcpRange, pace, tees, cart, holes, format, spots, notifyFriends, activeFriends, boost, setBoost, posting, onEdit, onPost }: any) {
  const notified = (activeFriends ?? []).filter((f: any) => notifyFriends.includes(f.id));
  const postLabel = phase === 'pro' && boost ? 'Post & boost broadcast' : 'Post broadcast';

  return (
    <View style={stepStyles.wrap}>
      <View style={[stepStyles.reviewCard, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
        {!!title && <ReviewRow icon="create-outline"        label="Title"        value={title}                   colors={colors} />}
        <ReviewRow icon="location-outline"   label="Venue"        value={venue || '—'}            colors={colors} />
        <ReviewRow icon="time-outline"       label="When"         value={`${date} ${time}`.trim() || '—'} colors={colors} />
        <ReviewRow icon="people-outline"     label="Looking for"  value={`${spots} more`}         colors={colors} />
        <ReviewRow icon="flag-outline"       label="Holes"        value={holes}                   colors={colors} />
        <ReviewRow icon="list-outline"       label="Format"       value={format}                  colors={colors} />
        <ReviewRow icon="golf-outline"       label="Handicap"     value={hcpRange}                colors={colors} />
        <ReviewRow icon="walk-outline"       label="Pace"         value={pace}                    colors={colors} />
        {tees && tees !== 'Any' && <ReviewRow icon="color-palette-outline" label="Tees" value={tees} colors={colors} />}
        {cart && cart !== 'Any' && <ReviewRow icon="car-outline"           label="Cart" value={cart} colors={colors} />}
        {notified.length > 0 && (
          <View style={[stepStyles.reviewRowView, { borderTopColor: colors.br3 }]}>
            <Ionicons name="people-outline" size={16} color={colors.tx3} />
            <Text style={[stepStyles.reviewLabel, { color: colors.tx3 }]}>Notifying</Text>
            <Text style={[stepStyles.reviewValue, { color: colors.tx1, flex: 1 }]}>
              {notified.map((f: any) => f.name.split(' ')[0]).join(', ')}
            </Text>
          </View>
        )}
      </View>

      {/* Boost — pro only */}
      {phase === 'pro' && (
        <>
          <Text style={[stepStyles.fieldLabel, { color: colors.tx3 }]}>
            BOOST{'  '}
            <Text style={{ color: colors.p1, fontWeight: '600' }}>· 3 left this week</Text>
          </Text>
          <View style={[stepStyles.boostRow, { borderColor: colors.br3 }]}>
            <View>
              <Text style={[stepStyles.boostTitle, { color: colors.tx1 }]}>Pin to top of Discover</Text>
              <Text style={[stepStyles.boostSub, { color: colors.tx2 }]}>24 hours</Text>
            </View>
            <Toggle on={boost} onChange={setBoost} color={colors.p1} />
          </View>
        </>
      )}

      {/* Boost lock card — freePro */}
      {phase === 'freePro' && (
        <>
          <Text style={[stepStyles.fieldLabel, { color: colors.tx3 }]}>BOOST THIS BROADCAST</Text>
          <View style={[stepStyles.lockCard, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
            <Ionicons name="lock-closed" size={16} color={colors.p1} />
            <View style={{ flex: 1 }}>
              <Text style={[stepStyles.boostTitle, { color: colors.pDark }]}>Pin to top of Discover</Text>
              <Text style={[stepStyles.boostSub, { color: colors.p1 }]}>Pro: 3/week · or per-boost</Text>
            </View>
            <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={stepStyles.upgradePill}>
              <TouchableOpacity style={stepStyles.upgradePillInner}>
                <Text style={stepStyles.upgradePillText}>Upgrade ↗</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </>
      )}

      <TouchableOpacity style={[stepStyles.editBtn, { borderColor: colors.br2 }]} onPress={onEdit}>
        <Text style={[{ color: colors.tx2, fontSize: 14, fontWeight: '500' }]}>Edit details</Text>
      </TouchableOpacity>

      <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[stepStyles.postBtn, { marginHorizontal: 16 }]}>
        <TouchableOpacity style={styles.ctaBtnInner} onPress={onPost} disabled={posting}>
          {posting
            ? <ActivityIndicator color="white" size="small" />
            : <>
                <Ionicons name="radio-outline" size={18} color="white" />
                <Text style={styles.ctaBtnText}>{postLabel}</Text>
              </>
          }
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

function ReviewRow({ icon, label, value, colors }: any) {
  return (
    <View style={[stepStyles.reviewRowView, { borderTopColor: colors.br3 }]}>
      <Ionicons name={icon} size={16} color={colors.tx3} />
      <Text style={[stepStyles.reviewLabel, { color: colors.tx3 }]}>{label}</Text>
      <Text style={[stepStyles.reviewValue, { color: colors.tx1 }]}>{value}</Text>
    </View>
  );
}

function ChipPicker({ label, options, value, onChange, colors }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[stepStyles.fieldLabel, { color: colors.tx3 }]}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
        {options.map((o: string) => (
          <TouchableOpacity
            key={o}
            style={[
              stepStyles.chip,
              { borderColor: colors.br2, backgroundColor: colors.bg1 },
              value === o && { backgroundColor: colors.pTint, borderColor: colors.pBorder },
            ]}
            onPress={() => onChange(o)}
          >
            <Text style={[stepStyles.chipText, { color: value === o ? colors.p1 : colors.tx2 }]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Multi-select variant — mirrors Discover's filter chips (checkmark on active, 'Any'/'Open' resets)
function MultiChipPicker({ label, options, values, onToggle, colors }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[stepStyles.fieldLabel, { color: colors.tx3 }]}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
        {options.map((o: string, i: number) => {
          const active = values.includes(o);
          const isReset = i === 0; // 'Open'/'Any' is always the first option
          return (
            <TouchableOpacity
              key={o}
              style={[
                stepStyles.chip,
                { flexDirection: 'row', alignItems: 'center', gap: 4 },
                { borderColor: colors.br2, backgroundColor: colors.bg1 },
                active && { backgroundColor: colors.pTint, borderColor: colors.pBorder },
              ]}
              onPress={() => onToggle(o)}
            >
              {active && !isReset && <Ionicons name="checkmark" size={12} color={colors.p1} />}
              <Text style={[stepStyles.chipText, { color: active ? colors.p1 : colors.tx2 }]}>{o}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  wrap: { paddingTop: 16 },
  sectionHead: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingBottom: 6,
  },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingBottom: 8, marginTop: 12,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5,
  },
  optionText: { fontSize: 14 },

  // Date & time wheel card
  wheelCard: {
    flexDirection: 'row', alignItems: 'stretch',
    marginHorizontal: 16, borderRadius: 12, borderWidth: 0.5, overflow: 'hidden',
  },
  wheelVDivider: { width: 0.5 },
  dtHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  dtHintText: { fontSize: 11, flex: 1, lineHeight: 16 },

  titleInput: {
    borderRadius: 12, borderWidth: 0.5, paddingVertical: 12,
    paddingHorizontal: 14, fontSize: 14,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  reviewCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 0.5,
    overflow: 'hidden', marginBottom: 12,
  },
  reviewRowView: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderTopWidth: 0.5,
  },
  reviewLabel: { fontSize: 13, width: 72 },
  reviewValue: { fontSize: 13, fontWeight: '600' },
  editBtn: {
    marginHorizontal: 16, marginBottom: 12,
    paddingVertical: 13, borderRadius: 14, borderWidth: 0.5,
    alignItems: 'center',
  },
  postBtn: { borderRadius: 16, overflow: 'hidden' },

  // Boost section
  boostRow: {
    marginHorizontal: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: 0.5, padding: 14,
  },
  boostTitle: { fontSize: 14, fontWeight: '600' },
  boostSub:   { fontSize: 12, marginTop: 2 },

  // Auto-selection note beneath the Details pickers
  autoNoteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    paddingHorizontal: 16, marginTop: 2, marginBottom: 10,
  },
  autoNote: { fontSize: 11, lineHeight: 15, flex: 1 },

  // Reset all options button
  fullResetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    paddingVertical: 12, borderRadius: 12, borderWidth: 0.5,
  },
  fullResetText: { fontSize: 13, fontWeight: '500' },

  // Locked venue (free / freePro)
  lockedVenue: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, padding: 14,
    borderRadius: 12, borderWidth: 0.5,
  },
  lockedVenueName: { fontSize: 15, fontWeight: '600' },
  lockedVenueSub:  { fontSize: 12, marginTop: 2 },
  lockedHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  lockedHintText: { fontSize: 12 },

  // FreePro broadcast pro upsell banner
  proBanner: {
    marginHorizontal: 16, marginTop: 20,
    borderRadius: 16, borderWidth: 0.5, overflow: 'hidden',
  },
  proBannerHead:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  proBannerPill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
  proBannerPillText:   { color: 'white', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  proBannerTitle:      { color: 'white', fontSize: 14, fontWeight: '700' },
  proBannerSub:        { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  proBannerBody:       { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  proBannerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10,
  },
  proBannerFeature:    { fontSize: 13, fontWeight: '600' },
  proBannerFeatureSub: { fontSize: 11, marginTop: 2 },
  proBannerBtn:        { borderRadius: 10, overflow: 'hidden', marginTop: 10 },
  proBannerBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11,
  },
  proBannerBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },

  // Co-broadcasters
  coBroadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5,
  },
  coBroadName: { fontSize: 14, fontWeight: '500' },
  addCoBroadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    paddingVertical: 12, borderRadius: 12, borderWidth: 0.5,
  },
  addCoBroadText: { fontSize: 14, fontWeight: '600' },

  // FreePro lock card
  lockCard: {
    marginHorizontal: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 0.5, padding: 12,
  },
  upgradePill:      { borderRadius: 8, overflow: 'hidden' },
  upgradePillInner: { paddingHorizontal: 10, paddingVertical: 6 },
  upgradePillText:  { color: 'white', fontSize: 12, fontWeight: '700' },
});

const friendChipStyles = StyleSheet.create({
  chip: { alignItems: 'center', gap: 4 },
  check: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'white',
  },
  name: { fontSize: 9, maxWidth: 40, textAlign: 'center' },
});

// ── CoBroadcasterSearchModal ──────────────────────────────────────────────────
function CoBroadcasterSearchModal({ visible, onClose, selected, onAdd, onRemove, profileMode, colors }: any) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();

  // Real accounts have no other users yet — only mock mode shows demo people
  const sourceFriends = profileMode === 'mock' ? FRIENDS : [];
  const sourcePlayers = profileMode === 'mock' ? PLAYERS : [];

  const friends = sourceFriends.filter(f =>
    !selected.includes(f.id) &&
    (f.name.toLowerCase().includes(q) || f.home.toLowerCase().includes(q))
  );
  const availableNow = sourcePlayers.filter(p =>
    !selected.includes(p.id) &&
    !FRIEND_IDS.has(p.id) &&
    p.online &&
    (p.name.toLowerCase().includes(q) || p.home.toLowerCase().includes(q))
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[coSt.sheet, { backgroundColor: colors.bg1 }]}>
        {/* Header */}
        <View style={[coSt.header, { borderBottomColor: colors.br3 }]}>
          <View style={coSt.handle} />
          <Text style={[coSt.headerTitle, { color: colors.tx1 }]}>Add to Broadcast</Text>
          <TouchableOpacity style={coSt.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={colors.tx2} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[coSt.searchWrap, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
          <Ionicons name="search-outline" size={15} color={colors.tx3} />
          <TextInput
            style={[coSt.searchInput, { color: colors.tx1 }]}
            placeholder="Search by name or course"
            placeholderTextColor={colors.tx3}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Selected */}
          {selected.length > 0 && (
            <>
              <Text style={[coSt.sectionLabel, { color: colors.tx3 }]}>ADDED ({selected.length}/2)</Text>
              {selected.map((id: string) => {
                const p = PEOPLE_MAP[id];
                return (
                  <View key={id} style={[coSt.personRow, { borderBottomColor: colors.br3, backgroundColor: colors.pTint }]}>
                    <Avatar who={p?.who ?? id} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={[coSt.name, { color: colors.tx1 }]}>{p?.name ?? id}</Text>
                      <Text style={[coSt.sub, { color: colors.tx3 }]}>{(p as any)?.hcp ?? ''}</Text>
                    </View>
                    <TouchableOpacity onPress={() => onRemove(id)}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.p1} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}

          {/* Friends */}
          {friends.length > 0 && (
            <>
              <Text style={[coSt.sectionLabel, { color: colors.tx3 }]}>FRIENDS</Text>
              {friends.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[coSt.personRow, { borderBottomColor: colors.br3 }]}
                  onPress={() => onAdd(f.id)}
                >
                  <View style={{ position: 'relative' }}>
                    <Avatar who={f.who} size={40} />
                    {f.online && <View style={coSt.onlineDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[coSt.name, { color: colors.tx1 }]}>{f.name}</Text>
                      <View style={[coSt.friendBadge, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
                        <Text style={[coSt.friendBadgeText, { color: colors.p1 }]}>FRIEND</Text>
                      </View>
                    </View>
                    <Text style={[coSt.sub, { color: colors.tx3 }]}>{f.hcp} · {f.home}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.p1} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Available Now */}
          {availableNow.length > 0 && (
            <>
              <Text style={[coSt.sectionLabel, { color: colors.tx3 }]}>
                <Text style={{ color: '#34C759' }}>● </Text>AVAILABLE NOW
              </Text>
              {availableNow.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[coSt.personRow, { borderBottomColor: colors.br3 }]}
                  onPress={() => onAdd(p.id)}
                >
                  <View style={{ position: 'relative' }}>
                    <Avatar who={p.who} size={40} />
                    <View style={coSt.onlineDot} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[coSt.name, { color: colors.tx1 }]}>{p.name}</Text>
                    <Text style={[coSt.sub, { color: colors.tx3 }]}>{p.hcp} · {p.home}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.p1} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {friends.length === 0 && availableNow.length === 0 && (
            <View style={{ paddingVertical: 40, paddingHorizontal: 32, alignItems: 'center', gap: 6 }}>
              <Ionicons name="people-outline" size={28} color={colors.br2} />
              <Text style={{ color: colors.tx2, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                {query ? 'No players found' : 'No players nearby yet'}
              </Text>
              {!query && (
                <Text style={{ color: colors.tx3, fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
                  As more golfers in your city join Find a Fourth, they'll appear here to broadcast with.
                </Text>
              )}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const coSt = StyleSheet.create({
  sheet:       { flex: 1 },
  header: {
    alignItems: 'center', paddingTop: 8, paddingBottom: 14,
    paddingHorizontal: 20, borderBottomWidth: 0.5,
  },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', marginBottom: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  closeBtn: {
    position: 'absolute', right: 16, top: 20,
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 14, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  name:        { fontSize: 14, fontWeight: '600' },
  sub:         { fontSize: 12, marginTop: 2 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#34C759', borderWidth: 1.5, borderColor: 'white',
  },
  friendBadge:     { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5 },
  friendBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
});

// ── ActiveBroadcastView ───────────────────────────────────────────────────────
function ActiveBroadcastView({ game, meId, myName, colors, insets, editDetailsOpen, setEditDetailsOpen, onUpdate, onCancel, onLeaveOrDecline, onRejectJoiner, onMessageGroup, onRecordJoin, onSubmitRatings, alreadyRated, onMarkCompleted }: any) {
  const isClosed = game.spots === 0;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isClosed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(0);
    }
    return () => pulse.stopAnimation();
  }, [isClosed]);

  // ── Role derivation ──
  const pending     = game.pending_co_broadcasters ?? [];
  const coIds       = game.co_broadcasters ?? [];
  const initiatorId = game.broadcaster_id;
  const isInitiator = initiatorId === meId;
  const amPending   = !isInitiator && pending.includes(meId);
  const amConfirmed = !isInitiator && coIds.includes(meId) && !amPending;
  const canEdit     = isInitiator || amConfirmed;

  // Broadcasters: initiator first, then co-broadcasters
  const broadcasterIds: string[] = [initiatorId, ...coIds.filter((id: string) => id !== initiatorId)];

  const pendingJoiners = (game.pending_joined_players ?? []).map((id: string) => ({
    id,
    label: PEOPLE_MAP[id]?.name ?? id,
  }));
  const confirmedJoiners = (game.joined_players ?? []).map((id: string) => ({
    id,
    label: PEOPLE_MAP[id]?.name ?? id,
  }));

  const totalPlayers = broadcasterIds.length + confirmedJoiners.length + pendingJoiners.length;

  // ── Accept / Reject joined player handlers ──
  const handleAcceptJoiner = (joinerId: string) => {
    const updated: Game = {
      ...game,
      pending_joined_players: (game.pending_joined_players ?? []).filter((id: string) => id !== joinerId),
      joined_players: [...(game.joined_players ?? []), joinerId],
      spots: Math.max(0, game.spots - 1),
    };
    onUpdate(updated);
    // Record the joiner's entry point in the group thread (they can only see messages from now on)
    onRecordJoin?.();
  };

  const handleRemoveJoiner = (joinerId: string) => {
    const joinerName = PEOPLE_MAP[joinerId]?.name ?? joinerId;
    Alert.alert(
      `Remove ${joinerName}?`,
      `They'll be notified that the spot didn't work out. If plans changed, please remove your broadcast so others can find a game!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => {
            const updated: Game = {
              ...game,
              joined_players: (game.joined_players ?? []).filter((id: string) => id !== joinerId),
              spots: game.spots + 1,
            };
            onUpdate(updated);
            onRejectJoiner(joinerId);
          },
        },
      ],
    );
  };

  const handleRejectJoiner = (joinerId: string) => {
    const joinerName = PEOPLE_MAP[joinerId]?.name ?? joinerId;
    Alert.alert(
      'Reject this player?',
      `${joinerName} will be notified. If your foursome is sorted or plans changed, please remove your broadcast so others can find a game!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive',
          onPress: () => {
            const updated: Game = {
              ...game,
              pending_joined_players: (game.pending_joined_players ?? []).filter((id: string) => id !== joinerId),
            };
            onUpdate(updated);
            onRejectJoiner(joinerId);
          },
        },
      ],
    );
  };

  const navSub =
    isInitiator ? 'Your active game' :
    amPending   ? "You've been invited" :
                  "You're co-broadcasting";

  // ── Confirm / Decline / Leave handlers ──
  const handleConfirm = () => {
    onUpdate({ ...game, pending_co_broadcasters: pending.filter((id: string) => id !== meId) });
  };
  const handleDecline = () => {
    Alert.alert('Decline broadcast?', "You'll be removed and the broadcaster will be notified.", [
      { text: 'Stay', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => onLeaveOrDecline(true) },
    ]);
  };
  const handleLeave = () => {
    Alert.alert('Leave broadcast?', "You'll be removed from this broadcast and the host will be notified.", [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => onLeaveOrDecline(false) },
    ]);
  };

  return (
    <View style={[actSt.screen, { backgroundColor: colors.bg1 }]}>
      {/* Top nav */}
      <View style={[actSt.topnav, { paddingTop: insets.top + 4, borderBottomColor: colors.br3 }]}>
        <View>
          <Text style={[actSt.navTitle, { color: colors.tx1 }]}>Broadcast</Text>
          <Text style={[actSt.navSub, { color: colors.tx3 }]}>{navSub}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Pending-invite banner (you were added, not yet confirmed) ── */}
        {amPending && (
          <View style={[actSt.inviteBanner, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
            <Ionicons name="mail-unread-outline" size={18} color={colors.p1} />
            <Text style={[actSt.inviteBannerText, { color: colors.pDark }]}>
              {PEOPLE_MAP[initiatorId]?.name ?? 'A player'} added you to this broadcast. Confirm below to join.
            </Text>
          </View>
        )}

        {/* ── Status indicator ── */}
        <View style={[actSt.statusCard, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
          <View style={actSt.statusRow}>
            {!isClosed && !game.roundStatus && (
              <Animated.View style={[actSt.ledDot, { opacity: pulse }]} />
            )}
            {game.roundStatus === 'in_progress' ? (
              <View style={[actSt.roundBadge, { backgroundColor: colors.amber + '22', borderColor: colors.amber }]}>
                <View style={[actSt.roundBadgeDot, { backgroundColor: colors.amber }]} />
                <Text style={[actSt.roundBadgeText, { color: colors.amber }]}>Round in progress</Text>
              </View>
            ) : game.roundStatus === 'completed' ? (
              <View style={[actSt.roundBadge, { backgroundColor: colors.green + '22', borderColor: colors.green }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                <Text style={[actSt.roundBadgeText, { color: colors.green }]}>Round completed</Text>
              </View>
            ) : (
              <Text style={[actSt.statusText, { color: isClosed ? colors.tx3 : colors.green }]}>
                {isClosed ? 'Broadcast closed' : 'Broadcast open'}
              </Text>
            )}
            {isClosed && !game.roundStatus && <Ionicons name="lock-closed" size={13} color={colors.tx3} />}
            <View style={{ flex: 1 }} />
            {!game.roundStatus && (
              <View style={[actSt.spotsPill, { backgroundColor: isClosed ? colors.bg3 : colors.pTint }]}>
                <Text style={[actSt.spotsText, { color: isClosed ? colors.tx3 : colors.p1 }]}>
                  {isClosed ? 'Full' : `${game.spots} spot${game.spots !== 1 ? 's' : ''} open`}
                </Text>
              </View>
            )}
          </View>

          <Text style={[actSt.gameTitle, { color: colors.tx1 }]}>{game.title}</Text>
          <View style={actSt.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.tx3} />
            <Text style={[actSt.metaText, { color: colors.tx3 }]}>{game.venue}</Text>
            <Ionicons name="time-outline" size={13} color={colors.tx3} style={{ marginLeft: 8 }} />
            <Text style={[actSt.metaText, { color: colors.tx3 }]}>{game.when}</Text>
          </View>

          {/* Player count bar */}
          <View style={actSt.playerBar}>
            {[1, 2, 3, 4].map(n => (
              <View
                key={n}
                style={[
                  actSt.playerBarSlot,
                  { backgroundColor: n <= totalPlayers ? colors.p1 : colors.bg3 },
                ]}
              />
            ))}
            <Text style={[actSt.playerBarLabel, { color: colors.tx3 }]}>{totalPlayers}/4 players</Text>
          </View>
        </View>

        {/* ── "Not playing?" inline message (Round in progress only) ── */}
        {game.roundStatus === 'in_progress' && (
          <View style={[actSt.notPlayingRow, { borderColor: colors.br3, backgroundColor: colors.bg2 }]}>
            <Text style={[actSt.notPlayingText, { color: colors.tx3 }]}>
              Not playing?{' '}
              {(isInitiator || amConfirmed) ? (
                <Text
                  style={[actSt.notPlayingLink, { color: colors.red }]}
                  onPress={() => {
                    Alert.alert(
                      'Remove broadcast?',
                      'This removes the broadcast for all players and sends everyone a notification.',
                      [
                        { text: 'Keep it', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: onCancel },
                      ]
                    );
                  }}
                >
                  Remove
                </Text>
              ) : (
                <Text
                  style={[actSt.notPlayingLink, { color: colors.red }]}
                  onPress={() => {
                    Alert.alert(
                      'Leave?',
                      'This removes you from the broadcast. Others continue their round.',
                      [
                        { text: 'Stay', style: 'cancel' },
                        { text: 'Leave', style: 'destructive', onPress: () => onLeaveOrDecline(false) },
                      ]
                    );
                  }}
                >
                  Leave
                </Text>
              )}
              {' '}the broadcast if your plans changed.
            </Text>
          </View>
        )}

        {/* ── "Mark as completed" button (in_progress, broadcaster only) ── */}
        {game.roundStatus === 'in_progress' && canEdit && (
          <TouchableOpacity
            style={[actSt.markCompletedBtn, { borderColor: colors.green }]}
            onPress={() => {
              Alert.alert(
                'Mark round as completed?',
                'This lets everyone rate their fellow golfers.',
                [
                  { text: 'Not yet', style: 'cancel' },
                  { text: 'Mark completed', onPress: onMarkCompleted },
                ]
              );
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.green} />
            <Text style={[actSt.markCompletedText, { color: colors.green }]}>Mark round as completed</Text>
          </TouchableOpacity>
        )}

        {/* ── Message group button (shown when ≥ 2 people in broadcast) ── */}
        {(broadcasterIds.length + confirmedJoiners.length) >= 2 && (
          <TouchableOpacity
            style={[actSt.messageGroupBtn, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}
            onPress={onMessageGroup}
          >
            <Ionicons name="chatbubbles-outline" size={15} color={colors.p1} />
            <Text style={[actSt.messageGroupText, { color: colors.p1 }]}>Message group</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.p1} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        )}

        {/* ── Broadcasters ── */}
        <Text style={[actSt.sectionLabel, { color: colors.tx3 }]}>BROADCASTER{broadcasterIds.length > 1 ? 'S' : ''}</Text>
        <View style={[actSt.membersCard, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
          {broadcasterIds.map((id: string, i: number) => {
            const isMe      = id === meId;
            const isHost    = id === initiatorId;
            const isPending = pending.includes(id);
            const label     = isMe ? 'You' : (PEOPLE_MAP[id]?.name ?? id);
            return (
              <View key={id} style={[actSt.memberRow, { borderTopColor: colors.br3, borderTopWidth: i === 0 ? 0 : 0.5 }, isPending && { opacity: 0.5 }]}>
                {isMe
                  ? <View style={[actSt.youAvatar, { backgroundColor: colors.pTint }]}>
                      <Ionicons name="person" size={18} color={colors.p1} />
                    </View>
                  : <Avatar who={PEOPLE_MAP[id]?.who ?? id} size={36} />
                }
                <View style={{ flex: 1 }}>
                  <Text style={[actSt.memberName, { color: colors.tx1 }]}>{label}</Text>
                  {isPending && (
                    <Text style={[actSt.pendingTag, { color: colors.amber }]}>Pending confirmation</Text>
                  )}
                </View>
                {isHost && (
                  <View style={[actSt.roleBadge, { backgroundColor: colors.bg3, borderColor: colors.br2 }]}>
                    <Text style={[actSt.roleBadgeText, { color: colors.tx2 }]}>HOST</Text>
                  </View>
                )}
                {isMe && (
                  <View style={[actSt.roleBadge, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
                    <Text style={[actSt.roleBadgeText, { color: colors.p1 }]}>YOU</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Pending join requests (visible to broadcaster/confirmed co-casters only) ── */}
        {canEdit && pendingJoiners.length > 0 && (
          <>
            <Text style={[actSt.sectionLabel, { color: colors.amber }]}>WANTS TO JOIN</Text>
            <View style={[actSt.membersCard, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
              {pendingJoiners.map((p: any, i: number) => (
                <View key={p.id} style={[actSt.memberRow, { borderTopColor: colors.br3, borderTopWidth: i === 0 ? 0 : 0.5 }]}>
                  <Avatar who={PEOPLE_MAP[p.id]?.who ?? p.id} size={36} />
                  <Text style={[actSt.memberName, { color: colors.tx1, flex: 1 }]}>{p.label}</Text>
                  <TouchableOpacity
                    style={[actSt.joinerBtn, { backgroundColor: colors.greenTint ?? '#E8F8EC', borderColor: colors.green }]}
                    onPress={() => handleAcceptJoiner(p.id)}
                  >
                    <Ionicons name="checkmark" size={16} color={colors.green} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[actSt.joinerBtn, { borderColor: colors.red }]}
                    onPress={() => handleRejectJoiner(p.id)}
                  >
                    <Ionicons name="close" size={16} color={colors.red} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Confirmed joined players ── */}
        <Text style={[actSt.sectionLabel, { color: colors.tx3 }]}>
          PLAYERS JOINED
          <Text style={{ fontWeight: '400' }}> ({confirmedJoiners.length} of {game.spots + confirmedJoiners.length} spot{game.spots + confirmedJoiners.length !== 1 ? 's' : ''} filled)</Text>
        </Text>
        <View style={[actSt.membersCard, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
          {confirmedJoiners.length > 0
            ? confirmedJoiners.map((p: any, i: number) => (
                <View key={p.id} style={[actSt.memberRow, { borderTopColor: colors.br3, borderTopWidth: i === 0 ? 0 : 0.5 }]}>
                  <Avatar who={PEOPLE_MAP[p.id]?.who ?? p.id} size={36} />
                  <Text style={[actSt.memberName, { color: colors.tx1, flex: 1 }]}>{p.label}</Text>
                  {canEdit && (
                    <TouchableOpacity
                      style={[actSt.joinerBtn, { borderColor: colors.red }]}
                      onPress={() => handleRemoveJoiner(p.id)}
                    >
                      <Ionicons name="close" size={16} color={colors.red} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            : <View style={actSt.emptyJoined}>
                <Text style={[actSt.emptyJoinedText, { color: colors.tx3 }]}>Waiting for players to join…</Text>
              </View>
          }
        </View>

        {/* ── Rate players (shown when round in progress or completed) ── */}
        {(game.roundStatus === 'in_progress' || game.roundStatus === 'completed') && (() => {
          const rateableIds = [
            game.broadcaster_id,
            ...(game.co_broadcasters ?? []),
            ...(game.joined_players ?? []),
          ].filter(Boolean).filter((id: string) => id !== meId);
          return rateableIds.length > 0 ? (
            <>
              <Text style={[actSt.sectionLabel, { color: colors.tx3 }]}>RATE YOUR ROUND</Text>
              <View style={[actSt.membersCard, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
                <RatePlayersSection
                  game={game}
                  meId={meId}
                  colors={colors}
                  onSubmit={onSubmitRatings}
                  alreadySubmitted={alreadyRated}
                />
              </View>
            </>
          ) : null;
        })()}

        {/* ── Game details ── */}
        <View style={actSt.detailsHeader}>
          <Text style={[actSt.sectionLabel, { color: colors.tx3, marginBottom: 0 }]}>GAME DETAILS</Text>
          {canEdit && (
            <TouchableOpacity
              style={[actSt.editBtn, { borderColor: colors.pBorder, backgroundColor: colors.pTint }]}
              onPress={() => setEditDetailsOpen(true)}
            >
              <Ionicons name="pencil-outline" size={12} color={colors.p1} />
              <Text style={[actSt.editBtnText, { color: colors.p1 }]}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[actSt.detailsCard, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
          {[
            ['golf-outline',          'Handicap', game.hcp_range ?? 'Open'],
            ['walk-outline',          'Pace',     game.pace ?? 'Any'],
            ['flag-outline',          'Holes',    game.holes ?? '18 Holes'],
            ['list-outline',          'Format',   game.format ?? 'Stroke Play'],
            game.tees && game.tees !== 'Any' ? ['color-palette-outline', 'Tees', game.tees] : null,
            game.cart && game.cart !== 'Any' ? ['car-outline', 'Cart', game.cart] : null,
          ].filter(Boolean).map(([icon, label, value]: any, i) => (
            <View key={label} style={[actSt.detailRow, { borderTopColor: colors.br3, borderTopWidth: i === 0 ? 0 : 0.5 }]}>
              <Ionicons name={icon} size={15} color={colors.tx3} />
              <Text style={[actSt.detailLabel, { color: colors.tx3 }]}>{label}</Text>
              <Text style={[actSt.detailValue, { color: colors.tx1 }]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Per-day note */}
        <View style={actSt.dayNote}>
          <Ionicons name="information-circle-outline" size={13} color={colors.tx3} />
          <Text style={[actSt.dayNoteText, { color: colors.tx3 }]}>
            You can only broadcast one game per day.
          </Text>
        </View>

        {/* ── Footer actions by role ── */}
        {isInitiator && (
          <TouchableOpacity
            style={[actSt.cancelBtn, { borderColor: colors.red }]}
            onPress={() => {
              Alert.alert('Cancel broadcast?', 'This will remove your game from Discover for everyone.', [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Cancel broadcast', style: 'destructive', onPress: onCancel },
              ]);
            }}
          >
            <Ionicons name="close-circle-outline" size={16} color={colors.red} />
            <Text style={[actSt.cancelText, { color: colors.red }]}>Cancel broadcast</Text>
          </TouchableOpacity>
        )}

        {amPending && (
          <View style={actSt.footerStack}>
            <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={actSt.confirmBtn}>
              <TouchableOpacity style={actSt.confirmBtnInner} onPress={handleConfirm}>
                <Ionicons name="checkmark-circle-outline" size={18} color="white" />
                <Text style={actSt.confirmBtnText}>Confirm Broadcast</Text>
              </TouchableOpacity>
            </LinearGradient>
            <TouchableOpacity style={[actSt.cancelBtn, { borderColor: colors.red, marginTop: 10 }]} onPress={handleDecline}>
              <Ionicons name="close-circle-outline" size={16} color={colors.red} />
              <Text style={[actSt.cancelText, { color: colors.red }]}>Decline Broadcast</Text>
            </TouchableOpacity>
          </View>
        )}

        {amConfirmed && (
          <TouchableOpacity style={[actSt.cancelBtn, { borderColor: colors.red }]} onPress={handleLeave}>
            <Ionicons name="exit-outline" size={16} color={colors.red} />
            <Text style={[actSt.cancelText, { color: colors.red }]}>Leave Broadcast</Text>
          </TouchableOpacity>
        )}

        {/* Edit details modal */}
        <EditBroadcastModal
          visible={editDetailsOpen}
          game={game}
          colors={colors}
          onSave={(updated: Game) => { onUpdate(updated); setEditDetailsOpen(false); }}
          onClose={() => setEditDetailsOpen(false)}
        />
      </ScrollView>
    </View>
  );
}

const actSt = StyleSheet.create({
  screen: { flex: 1 },
  topnav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  navTitle: { fontSize: 20, fontWeight: '700' },
  navSub:   { fontSize: 12, marginTop: 1 },

  statusCard: {
    margin: 14, borderRadius: 16, borderWidth: 0.5, padding: 16,
  },
  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ledDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759' },
  statusText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  spotsPill:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  spotsText:  { fontSize: 11, fontWeight: '600' },
  gameTitle:  { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  metaText:   { fontSize: 12 },
  playerBar:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playerBarSlot: { height: 6, flex: 1, borderRadius: 3 },
  playerBarLabel: { fontSize: 11, marginLeft: 6 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },

  membersCard: { marginHorizontal: 14, borderRadius: 14, borderWidth: 0.5, overflow: 'hidden' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  youAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  memberName: { fontSize: 14, fontWeight: '600' },
  pendingTag:  { fontSize: 11, fontWeight: '600', marginTop: 2 },
  roleBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5, marginLeft: 6 },
  roleBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  emptyJoined:     { padding: 16, alignItems: 'center' },
  emptyJoinedText: { fontSize: 13 },
  joinerBtn: {
    width: 32, height: 32, borderRadius: 10, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  messageGroupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 0.5,
  },
  messageGroupText: { fontSize: 14, fontWeight: '600' },

  inviteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 14, marginTop: 14, padding: 12,
    borderRadius: 12, borderWidth: 0.5,
  },
  inviteBannerText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },

  footerStack: { marginTop: 16 },
  confirmBtn:  { marginHorizontal: 14, borderRadius: 14, overflow: 'hidden' },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14,
  },
  confirmBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },

  detailsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: 14,
  },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 0.5,
  },
  editBtnText: { fontSize: 12, fontWeight: '600' },

  detailsCard: { marginHorizontal: 14, borderRadius: 14, borderWidth: 0.5, overflow: 'hidden' },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  detailLabel: { fontSize: 13, width: 68 },
  detailValue: { fontSize: 13, fontWeight: '600', flex: 1 },

  dayNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  dayNoteText: { fontSize: 12 },

  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 14, marginTop: 16, paddingVertical: 13,
    borderRadius: 14, borderWidth: 0.5,
  },
  cancelText: { fontSize: 14, fontWeight: '600' },

  // Round lifecycle styles
  roundBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 99, borderWidth: 0.5,
  },
  roundBadgeDot:  { width: 8, height: 8, borderRadius: 4 },
  roundBadgeText: { fontSize: 12, fontWeight: '700' },

  notPlayingRow: {
    marginHorizontal: 14, marginTop: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 0.5,
  },
  notPlayingText: { fontSize: 12, lineHeight: 18 },
  notPlayingLink: { fontWeight: '700' },

  markCompletedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 14, marginTop: 10, paddingVertical: 12,
    borderRadius: 12, borderWidth: 0.5,
  },
  markCompletedText: { fontSize: 14, fontWeight: '600' },
});

// ── EditBroadcastModal ────────────────────────────────────────────────────────
// Splits a stored comma-joined field back into a selection array
function splitSelection(val: string | undefined, reset: string): string[] {
  if (!val || val === reset) return [reset];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

function EditBroadcastModal({ visible, game, colors, onSave, onClose }: any) {
  const [hcpRanges, setHcpRanges] = useState<string[]>(splitSelection(game?.hcp_range, 'Open'));
  const [paces,     setPaces]     = useState<string[]>(splitSelection(game?.pace, 'Any'));
  const [teesArr,   setTeesArr]   = useState<string[]>(splitSelection(game?.tees, 'Any'));
  const [cartArr,   setCartArr]   = useState<string[]>(splitSelection(game?.cart, 'Any'));
  const [holes,    setHoles]    = useState(game?.holes     ?? '18 Holes');
  const [format,   setFormat]   = useState(game?.format    ?? 'Stroke Play');
  const [saving,   setSaving]   = useState(false);

  // Re-sync when game changes (e.g. initial load)
  useEffect(() => {
    if (game) {
      setHcpRanges(splitSelection(game.hcp_range, 'Open'));
      setPaces(splitSelection(game.pace, 'Any'));
      setTeesArr(splitSelection(game.tees, 'Any'));
      setCartArr(splitSelection(game.cart, 'Any'));
      setHoles(game.holes ?? '18 Holes');
      setFormat(game.format ?? 'Stroke Play');
    }
  }, [game?.id]);

  const handleSave = () => {
    setSaving(true);
    const hcp_range = joinSelection(hcpRanges, 'Open');
    const pace = joinSelection(paces, 'Any');
    const tees = joinSelection(teesArr, 'Any');
    const cart = joinSelection(cartArr, 'Any');
    const newChips = buildChipsFromGame({ hcp_range, pace, holes, format });
    // Parent (ActiveBroadcastView.onUpdate) persists to Supabase when applicable
    onSave({ ...game, hcp_range, pace, tees, cart, holes, format, chips: newChips });
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[editSt.sheet, { backgroundColor: colors.bg1 }]}>
        <View style={[editSt.header, { borderBottomColor: colors.br3 }]}>
          <TouchableOpacity onPress={onClose} style={editSt.headerSide}>
            <Text style={[editSt.headerAction, { color: colors.p1 }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[editSt.headerTitle, { color: colors.tx1 }]}>Edit Details</Text>
          <TouchableOpacity onPress={handleSave} style={editSt.headerSide} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={colors.p1} />
              : <Text style={[editSt.headerAction, { color: colors.p1, fontWeight: '700' }]}>Save</Text>
            }
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <MultiChipPicker label="Handicap range" options={HCP_RANGES}   values={hcpRanges} onToggle={(v: string) => setHcpRanges(prev => toggleMultiValue(prev, v, 'Open'))} colors={colors} />
          <MultiChipPicker label="Pace"           options={PACES}         values={paces}     onToggle={(v: string) => setPaces(prev => toggleMultiValue(prev, v, 'Any'))}      colors={colors} />
          <MultiChipPicker label="Tees"           options={TEES_OPTIONS}  values={teesArr}   onToggle={(v: string) => setTeesArr(prev => toggleMultiValue(prev, v, 'Any'))}    colors={colors} />
          <MultiChipPicker label="Cart"           options={CART_OPTIONS}  values={cartArr}   onToggle={(v: string) => setCartArr(prev => toggleMultiValue(prev, v, 'Any'))}    colors={colors} />
          <ChipPicker label="Holes"          options={['9 Holes', '18 Holes', '27 Holes', '36 Holes']}      value={holes}    onChange={setHoles}    colors={colors} />
          <ChipPicker label="Format"         options={['Stroke Play', 'Match Play', 'Stableford']}          value={format}   onChange={setFormat}   colors={colors} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const editSt = StyleSheet.create({
  sheet:  { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  headerSide:   { width: 72 },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  headerAction: { fontSize: 16 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topnav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  navTitle: { fontSize: 20, fontWeight: '700' },
  navSub: { fontSize: 12, marginTop: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backBtnText: { fontSize: 16, fontWeight: '600' },
  steps: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 14,
  },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { fontSize: 11, fontWeight: '700' },
  stepLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  stepLine: { width: 24, height: 1.5, marginBottom: 14 },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 0.5,
  },
  ctaBtn: { borderRadius: 16, overflow: 'hidden' },
  ctaBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
  },
  ctaBtnText: { color: 'white', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});

// ── RatePlayersSection ────────────────────────────────────────────────────────
// Exported so discover.tsx can import and use it for YourGameRow / YourJoinedGameRow.
export function RatePlayersSection({ game, meId, colors, onSubmit, alreadySubmitted }: {
  game: Game;
  meId: string;
  colors: any;
  onSubmit: (gameId: string, ratings: Record<string, number>) => void;
  alreadySubmitted: boolean;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [starValues, setStarValues] = useState<Record<string, number>>({});

  const rateableIds = [
    game.broadcaster_id,
    ...(game.co_broadcasters ?? []),
    ...(game.joined_players ?? []),
  ].filter(Boolean).filter((id): id is string => id !== meId);

  if (rateableIds.length === 0) return null;

  if (alreadySubmitted) {
    return (
      <View style={[rateSt.collapsedRow, { borderTopWidth: 0 }]}>
        <Ionicons name="checkmark-circle" size={18} color={colors.green} />
        <Text style={[rateSt.collapsedLabel, { color: colors.green }]}>Ratings submitted</Text>
      </View>
    );
  }

  if (!expanded) {
    return (
      <TouchableOpacity style={[rateSt.collapsedRow, { borderTopWidth: 0 }]} onPress={() => setExpanded(true)}>
        <View style={rateSt.stackedAvatars}>
          {rateableIds.slice(0, 4).map((id, idx) => (
            <View key={id} style={[rateSt.stackAvatarWrap, { marginLeft: idx === 0 ? 0 : -10, zIndex: 10 - idx }]}>
              <Avatar who={PEOPLE_MAP[id]?.who ?? id} size={28} />
            </View>
          ))}
        </View>
        <Text style={[rateSt.collapsedLabel, { color: colors.tx1 }]}>Rate players</Text>
        <Ionicons name="chevron-down" size={14} color={colors.tx3} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>
    );
  }

  const allRated = Object.keys(starValues).length === rateableIds.length;

  return (
    <View>
      {rateableIds.map((id, i) => (
        <View
          key={id}
          style={[
            rateSt.playerRateRow,
            { borderTopWidth: i === 0 ? 0 : 0.5, borderColor: colors.br3 },
          ]}
        >
          <Avatar who={PEOPLE_MAP[id]?.who ?? id} size={34} />
          <Text style={[rateSt.playerName, { color: colors.tx1 }]}>
            {PEOPLE_MAP[id]?.name ?? id}
          </Text>
          <View style={rateSt.starsRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity
                key={star}
                onPress={() => setStarValues(prev => ({ ...prev, [id]: star }))}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Ionicons
                  name={star <= (starValues[id] ?? 0) ? 'star' : 'star-outline'}
                  size={22}
                  color={star <= (starValues[id] ?? 0) ? colors.p1 : colors.br2}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <LinearGradient
        colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[rateSt.confirmBtn, !allRated && { opacity: 0.5 }]}
      >
        <TouchableOpacity
          style={rateSt.confirmBtnInner}
          onPress={() => { onSubmit(game.id, starValues); setExpanded(false); }}
          disabled={!allRated}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color="white" />
          <Text style={rateSt.confirmBtnText}>Confirm ratings</Text>
        </TouchableOpacity>
      </LinearGradient>

      <TouchableOpacity style={rateSt.cancelExpand} onPress={() => setExpanded(false)}>
        <Text style={[rateSt.cancelExpandText, { color: colors.tx3 }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const rateSt = StyleSheet.create({
  collapsedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  collapsedLabel: { fontSize: 14, fontWeight: '600' },
  stackedAvatars: { flexDirection: 'row', alignItems: 'center' },
  stackAvatarWrap: {},
  playerRateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  playerName: { fontSize: 14, fontWeight: '500', flex: 1 },
  starsRow:   { flexDirection: 'row', gap: 3 },
  confirmBtn: { marginHorizontal: 14, borderRadius: 12, overflow: 'hidden', marginTop: 10 },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12,
  },
  confirmBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  cancelExpand: { paddingVertical: 12, alignItems: 'center' },
  cancelExpandText: { fontSize: 13 },
});
