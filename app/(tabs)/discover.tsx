import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert,
  TouchableOpacity, TextInput, ActivityIndicator,
  RefreshControl, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { Avatar } from '@/components/Avatar';
import { Pill } from '@/components/Pill';
import { Stars } from '@/components/Stars';
import { Toggle } from '@/components/Toggle';
import { PlayerSheet } from '@/components/PlayerSheet';
import { ReportBlockSheet } from '@/components/ReportBlockSheet';
import { PLAYERS, GAMES, FRIENDS } from '@/constants/Data';
import { containsProfanity } from '@/utils/profanity';
import { fetchGamesByCity, fetchFriendsGames, cancelGame } from '@/lib/games';
import { GRAD_COLORS } from '@/constants/Colors';
import { RatePlayersSection } from '@/app/(tabs)/broadcast';
import type { Player, Game, Friend } from '@/types';
import type { AvailEntry } from '@/context/AppContext';

// ── Filter types & constants ──────────────────────────────────────────────────
type Filters = {
  hcp: string[]; tees: string[]; pace: string[];
  cart: string[]; music: string[]; holes: string[]; format: string[];
};

const DEFAULT_FILTERS: Filters = {
  hcp: ['Any'], tees: ['Any'], pace: ['Any'],
  cart: ['Any'], music: ['Any'], holes: ['Any'], format: ['Any'],
};

const FILTER_OPTIONS: Record<keyof Filters, string[]> = {
  hcp:    ['Any', '0–6', '6–12', '12–18', '18–24', '24+'],
  tees:   ['Any', 'Black', 'Blue', 'White', 'Yellow', 'Red'],
  pace:   ['Any', 'Fast', 'Moderate', 'Relaxed', 'Casual'],
  cart:   ['Any', 'Walking', 'Cart'],
  music:  ['Any', 'Yes', 'No music'],
  holes:  ['Any', '9 Holes', '18 Holes', '27 Holes', '36 Holes'],
  format: ['Any', 'Stroke Play', 'Match Play', 'Stableford'],
};

const FILTER_LABELS: Record<keyof Filters, string> = {
  hcp: 'Handicap', tees: 'Tees', pace: 'Pace',
  cart: 'Cart', music: 'Music', holes: 'Holes', format: 'Format',
};

// ── People lookup (for crew avatars) ─────────────────────────────────────────
const ALL_PEOPLE = [...PLAYERS, ...FRIENDS] as (Player | Friend)[];
const PEOPLE_MAP: Record<string, Player | Friend> = Object.fromEntries(
  ALL_PEOPLE.map(p => [p.id, p])
);

// ── Filter helpers ────────────────────────────────────────────────────────────
function hcpInRange(hcpStr: string, selected: string[]): boolean {
  if (selected.includes('Any')) return true;
  const n = parseInt(hcpStr.replace(/\D/g, ''), 10);
  if (isNaN(n)) return true;
  return selected.some(range => {
    if (range === '0–6')    return n >= 0  && n <= 6;
    if (range === '6–12')   return n >= 6  && n <= 12;
    if (range === '12–18')  return n >= 12 && n <= 18;
    if (range === '18–24')  return n >= 18 && n <= 24;
    if (range === '24+')    return n >= 24;
    return false;
  });
}

// Game fields may hold multi-select values joined with ', ' (e.g. "Blue, White")
function fieldMatches(val: string | undefined, selected: string[]): boolean {
  if (selected.includes('Any')) return true;
  if (!val || val === 'Any') return true;
  const vals = val.split(',').map(s => s.trim().toLowerCase());
  return selected.some(s => vals.includes(s.toLowerCase()));
}

function singleHcpRangeOverlaps(label: string, selected: string[]): boolean {
  const m = label.match(/(\d+)[–\-](\d+)/);
  if (!m) {
    // Handle "Hcp 24+" style
    const plusM = label.match(/(\d+)\+/);
    if (plusM) {
      const cMin = parseInt(plusM[1]);
      return selected.some(range => range === '24+' ? cMin >= 24 : false);
    }
    return true;
  }
  const cMin = parseInt(m[1]), cMax = parseInt(m[2]);
  return selected.some(range => {
    if (range === '0–6')    return cMin <= 6  && cMax >= 0;
    if (range === '6–12')   return cMin <= 12 && cMax >= 6;
    if (range === '12–18')  return cMin <= 18 && cMax >= 12;
    if (range === '18–24')  return cMin <= 24 && cMax >= 18;
    if (range === '24+')    return cMax >= 24;
    return false;
  });
}

function gameHcpOverlaps(chips: [string, string][], selected: string[]): boolean {
  if (selected.includes('Any')) return true;
  const hcpChip = chips.find(([, label]) => /hcp/i.test(label));
  if (!hcpChip) return true;
  // Multi-select games carry a joined label, e.g. "Hcp 6–12, Hcp 12–18"
  return hcpChip[1].split(',').some(part => singleHcpRangeOverlaps(part.trim(), selected));
}

function gamePaceMatches(chips: [string, string][], selected: string[]): boolean {
  if (selected.includes('Any')) return true;
  const paceChip = chips.find(([, label]) =>
    ['fast', 'moderate', 'relaxed', 'casual'].some(p => label.toLowerCase().includes(p))
  );
  if (!paceChip) return true;
  const paces = paceChip[1].split(',').map(s => s.trim().toLowerCase());
  return selected.some(s => paces.includes(s.toLowerCase()));
}

function gameMusicMatches(chips: [string, string][], selected: string[]): boolean {
  if (selected.includes('Any')) return true;
  const hasMusicOk = chips.some(([, label]) => label.toLowerCase().includes('music ok'));
  if (selected.includes('Yes'))      return hasMusicOk;
  if (selected.includes('No music')) return !hasMusicOk;
  return true;
}

// ── Availability matching ─────────────────────────────────────────────────────
function parseGameWhen(when: string): { day: string; hour: number } | null {
  const DAY_NAMES: Record<string, string> = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
    Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();

  const match = when.match(/^(Today|Tomorrow|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(.+)$/i);
  if (!match) return null;
  const [, dayPart, timePart] = match;

  let dayName: string | null = null;
  if (dayPart.toLowerCase() === 'today')         dayName = DAYS[today.getDay()];
  else if (dayPart.toLowerCase() === 'tomorrow') dayName = DAYS[(today.getDay() + 1) % 7];
  else                                           dayName = DAY_NAMES[dayPart] ?? null;
  if (!dayName) return null;

  const t = timePart.trim().toLowerCase().replace(/\s/g, '');
  const timeMatch = t.match(/^(\d+)(?::(\d+))?(am|pm)$/);
  if (!timeMatch) return null;
  let hour = parseInt(timeMatch[1], 10);
  if (timeMatch[3] === 'pm' && hour !== 12) hour += 12;
  if (timeMatch[3] === 'am' && hour === 12) hour = 0;

  return { day: dayName, hour };
}

function gameMatchesAvailability(when: string, availSchedule: AvailEntry[]): boolean {
  const parsed = parseGameWhen(when);
  if (!parsed) return false;
  const entry = availSchedule.find(e => e.day === parsed.day);
  if (!entry) return false;
  const RANGES: Record<string, [number, number]> = {
    '5am – 9am':  [5, 9],
    '9am – 12pm': [9, 12],
    '12pm – 4pm': [12, 16],
    '4pm – 6pm':  [16, 18],
  };
  return entry.times.some(t => {
    const r = RANGES[t];
    return r !== undefined && parsed.hour >= r[0] && parsed.hour < r[1];
  });
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function DiscoverScreen() {
  const {
    colors, friendsOnly, setFriendsOnly, setBroadcastFriend,
    findOrCreateGroupThread, findOrCreateDirectThread, blockedUserIds, profileMode,
    profileCity, reportedGameIds, reportGame,
    supabaseUser, myActiveGame, setMyActiveGame,
    myJoinedGame, setMyJoinedGame,
    rejectionNotice, setRejectionNotice,
    submitRatings, hasSubmittedRatings,
    roundsPlayed, setRoundsPlayed,
    pushToken, requestPushPermission,
    availSchedule, availableNow, extraFriends,
  } = useApp();

  // Request push permission the first time the user joins a game
  const handleJoinGame = (game: Game) => {
    if (!pushToken) requestPushPermission();
    setMyJoinedGame(game);
  };

  const meId = profileMode === 'mock' ? 'yousef' : (supabaseUser?.id ?? 'local');
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleMessageGroup = (game: Game) => {
    if (game.crew.length <= 1) {
      // Solo broadcaster — open a direct thread
      const crewId = game.crew[0] ?? game.id;
      const person = PEOPLE_MAP[crewId];
      findOrCreateDirectThread(crewId, person?.name ?? game.title, person?.who ?? crewId);
      router.push(`/chat/${crewId}?from=discover`);
    } else {
      findOrCreateGroupThread(game);
      router.push(`/chat/${game.id}-thread?from=discover`);
    }
  };

  const [search,         setSearch]        = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | Friend | null>(null);
  const [reportingGame,  setReportingGame]  = useState<Game | null>(null);
  const [filters,        setFilters]        = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen,    setFiltersOpen]    = useState(false);
  const [realGames,      setRealGames]      = useState<Game[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);

  const activeCount = Object.values(filters).filter(
    arr => !(arr.length === 1 && arr[0] === 'Any')
  ).length;

  function toggleFilter(key: keyof Filters, value: string) {
    setFilters(prev => {
      if (value === 'Any') return { ...prev, [key]: ['Any'] };
      const without = prev[key].filter(v => v !== 'Any');
      const next = without.includes(value)
        ? without.filter(v => v !== value)
        : [...without, value];
      return { ...prev, [key]: next.length ? next : ['Any'] };
    });
  }

  // Real-mode friend ids (accepted friends live in extraFriends).
  const realFriendIds = profileMode === 'real' ? extraFriends.map(f => f.id) : [];

  // ── Load real games from Supabase ──────────────────────────────────────────
  // City-scoped games + friends' games (any city), merged and de-duped, so a
  // friend's broadcast always shows even if they're in a different city.
  const loadGames = useCallback(async (isRefresh = false) => {
    if (profileMode !== 'real' || !supabaseUser) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    const [cityRes, friendRes] = await Promise.all([
      profileCity ? fetchGamesByCity(profileCity, supabaseUser.id)
                  : Promise.resolve({ games: [] }),
      fetchFriendsGames(realFriendIds, supabaseUser.id),
    ]);
    const byId = new Map<string, Game>();
    for (const g of [...cityRes.games, ...friendRes.games]) byId.set(g.id, g);
    setRealGames(Array.from(byId.values()));
    isRefresh ? setRefreshing(false) : setLoading(false);
  }, [profileMode, profileCity, supabaseUser?.id, realFriendIds.join(',')]);

  useEffect(() => { loadGames(); }, [loadGames]);

  // Re-pull games whenever Discover gains focus, so a friend's freshly posted
  // broadcast appears without a manual refresh.
  useFocusEffect(
    React.useCallback(() => { loadGames(); }, [loadGames])
  );

  // Also restore myActiveGame from Supabase on mount (real mode)
  useEffect(() => {
    if (profileMode === 'real' && supabaseUser && !myActiveGame) {
      import('@/lib/games').then(({ fetchMyGame }) => {
        fetchMyGame(supabaseUser.id).then(game => {
          if (game) setMyActiveGame(game);
        });
      });
    }
  }, [profileMode, supabaseUser]);

  const activeGames     = profileMode === 'mock' ? GAMES : realGames;
  const activeFriendIds = new Set(profileMode === 'mock' ? FRIENDS.map(f => f.id) : realFriendIds);

  const games = useMemo(() => {
    const q = search.toLowerCase();

    let list = activeGames
      .filter(g => !reportedGameIds.includes(g.id))
      .filter(g => !rejectionNotice || g.id !== rejectionNotice.gameId)
      .filter(g => !containsProfanity(g.title))
      // City filter — but always keep a friend's broadcast even if it's in another city.
      .filter(g =>
        g.crew.some(id => activeFriendIds.has(id)) ||
        !profileCity || !g.city || g.city.toLowerCase() === profileCity.toLowerCase()
      )
      .filter(g => !q ||
        g.title.toLowerCase().includes(q) ||
        g.venue.toLowerCase().includes(q) ||
        (g.city ?? '').toLowerCase().includes(q) ||
        g.crewNames.toLowerCase().includes(q) ||
        g.when.toLowerCase().includes(q) ||
        g.chips.some(([, label]) => label.toLowerCase().includes(q)) ||
        (g.tees   && g.tees   !== 'Any'        && g.tees.toLowerCase().includes(q)) ||
        (g.cart   && g.cart   !== 'Any'        && g.cart.toLowerCase().includes(q)) ||
        (g.holes  && g.holes  !== '18 Holes'   && g.holes.toLowerCase().includes(q)) ||
        (g.format && g.format !== 'Stroke Play' && g.format.toLowerCase().includes(q))
      );

    if (friendsOnly) list = list.filter(g => g.crew.some(id => activeFriendIds.has(id)));

    list = list.filter(g =>
      gameHcpOverlaps(g.chips as [string, string][], filters.hcp) &&
      gamePaceMatches(g.chips as [string, string][], filters.pace) &&
      gameMusicMatches(g.chips as [string, string][], filters.music) &&
      fieldMatches(g.tees,   filters.tees) &&
      fieldMatches(g.cart,   filters.cart) &&
      fieldMatches(g.holes,  filters.holes) &&
      fieldMatches(g.format, filters.format)
    );

    return list;
  }, [search, friendsOnly, profileMode, profileCity, filters, reportedGameIds, realGames, rejectionNotice]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg1 }]}>
      {/* Top nav */}
      <View style={[styles.topnav, { paddingTop: insets.top + 4, borderBottomColor: colors.br3 }]}>
        <View>
          <Text style={[styles.navTitle, { color: colors.tx1 }]}>Discover</Text>
          <Text style={[styles.navSub, { color: colors.tx3 }]}>
            {profileCity
              ? `${games.length} open game${games.length !== 1 ? 's' : ''} in ${profileCity}`
              : 'find broadcasted games near you'}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.tx3} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.bg2, color: colors.tx1, borderColor: colors.br3 }]}
          placeholder="Search games, players, venues, format…"
          placeholderTextColor={colors.tx3}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* ── Filter panel ── */}
      <View style={[styles.filterWrap, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
        <TouchableOpacity
          style={styles.filterHeader}
          onPress={() => setFiltersOpen(v => !v)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={15} color={colors.p1} />
          <Text style={[styles.filterHeaderLabel, { color: colors.tx1 }]}>Filters</Text>
          {activeCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: colors.p1 }]}>
              <Text style={styles.filterBadgeText}>{activeCount}</Text>
            </View>
          )}
          <Ionicons
            name={filtersOpen ? 'chevron-up' : 'chevron-down'}
            size={14} color={colors.tx3}
            style={{ marginLeft: 'auto' }}
          />
        </TouchableOpacity>

        {filtersOpen && (
          <>
            <View style={[styles.filterDivider, { backgroundColor: colors.br3 }]} />
            <View style={styles.filterBody}>
              {(Object.keys(FILTER_OPTIONS) as (keyof Filters)[]).map(key => (
                <View key={key} style={styles.filterRow}>
                  <Text style={[styles.filterRowLabel, { color: colors.tx3 }]}>
                    {FILTER_LABELS[key]}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterChips}
                  >
                    {FILTER_OPTIONS[key].map(opt => {
                      const active   = filters[key].includes(opt);
                      const isAnyOpt = opt === 'Any';
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[
                            styles.filterChip,
                            {
                              borderColor:     active ? colors.pBorder : colors.br2,
                              backgroundColor: active ? colors.pTint   : colors.bg1,
                            },
                          ]}
                          onPress={() => toggleFilter(key, opt)}
                        >
                          {active && !isAnyOpt && (
                            <Ionicons name="checkmark" size={12} color={colors.p1} />
                          )}
                          <Text style={[styles.filterChipText, { color: active ? colors.p1 : colors.tx2 }]}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ))}
            </View>
            {activeCount > 0 && (
              <TouchableOpacity
                style={[styles.clearFiltersBtn, { borderTopColor: colors.br3 }]}
                onPress={() => setFilters(DEFAULT_FILTERS)}
              >
                <Ionicons name="close-circle-outline" size={15} color={colors.tx3} />
                <Text style={[styles.clearFiltersBtnText, { color: colors.tx3 }]}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Friends-only toggle */}
      <View style={[styles.friendsToggle, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
        <Ionicons name="people-outline" size={15} color={colors.p1} />
        <Text style={[styles.friendsToggleLabel, { color: colors.tx1 }]}>Friends only</Text>
        <Toggle on={friendsOnly} onChange={setFriendsOnly} color={colors.p1} />
      </View>

      {/* Available Now strip */}
      {(() => {
        const availablePlayers = profileMode === 'mock' ? PLAYERS.filter(p => p.online) : [];
        const showStrip = availableNow || availablePlayers.length > 0;
        if (!showStrip) return null;
        return (
          <View style={styles.availStrip}>
            <Text style={[styles.availStripLabel, { color: colors.tx3 }]}>AVAILABLE NOW</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.availScroll}>
              {availableNow && (
                <View style={styles.availChip}>
                  <View style={styles.availAvatarWrap}>
                    <Avatar who="yousef" size={40} />
                    <View style={[styles.onlineDot, { borderColor: colors.bg1 }]} />
                  </View>
                  <Text style={[styles.availName, { color: colors.p1 }]}>You</Text>
                </View>
              )}
              {availablePlayers.map(p => (
                <TouchableOpacity key={p.id} style={styles.availChip}
                  onPress={() => setSelectedPlayer(p)}>
                  <View style={styles.availAvatarWrap}>
                    <Avatar who={p.who} size={40} />
                    <View style={[styles.onlineDot, { borderColor: colors.bg1 }]} />
                  </View>
                  <Text style={[styles.availName, { color: colors.tx2 }]} numberOfLines={1}>
                    {p.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );
      })()}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          profileMode === 'real'
            ? <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadGames(true)}
                tintColor={colors.p1}
              />
            : undefined
        }
      >
        {/* Loading state */}
        {loading && (
          <ActivityIndicator color={colors.p1} style={{ paddingVertical: 40 }} />
        )}

        {!loading && (
          <>
            {/* ── REJECTION NOTICE ── */}
            {rejectionNotice && (
              <View style={[styles.rejectionNotice, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.tx3} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rejectionTitle, { color: colors.tx1 }]}>Looks like plans changed!</Text>
                  <Text style={[styles.rejectionSub, { color: colors.tx3 }]}>
                    The golfers you joined had a change of plans. Feel free to join another game below.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setRejectionNotice(null)}>
                  <Ionicons name="close" size={18} color={colors.tx3} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── YOUR JOINED GAME ── */}
            {myJoinedGame && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.tx3 }]}>YOUR JOINED GAME</Text>
                <YourJoinedGameRow
                  game={myJoinedGame}
                  colors={colors}
                  meId={meId}
                  onLeave={() => setMyJoinedGame(null)}
                  onSubmitRatings={submitRatings}
                  alreadyRated={hasSubmittedRatings(myJoinedGame.id)}
                />
              </>
            )}

            {/* ── YOUR BROADCAST ── */}
            {myActiveGame && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.tx3 }]}>YOUR BROADCAST</Text>
                <YourGameRow
                  game={myActiveGame}
                  colors={colors}
                  meId={meId}
                  onCancel={async () => {
                    if (supabaseUser && myActiveGame.id && !myActiveGame.id.startsWith('temp-') && !myActiveGame.id.startsWith('my-game-mock')) {
                      await cancelGame(myActiveGame.id);
                    }
                    setMyActiveGame(null);
                  }}
                  onSubmitRatings={submitRatings}
                  alreadyRated={hasSubmittedRatings(myActiveGame.id)}
                  onMarkCompleted={() => {
                    const updated = { ...myActiveGame, roundStatus: 'completed' as const };
                    setMyActiveGame(updated);
                    setRoundsPlayed(roundsPlayed + 1);
                  }}
                />
              </>
            )}

            {/* ── OPEN GAMES ── */}
            {games.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.tx3 }]}>OPEN GAMES</Text>
                {games.map(g => (
                  <GameRow
                    key={g.id}
                    game={g}
                    colors={colors}
                    activeFriendIds={activeFriendIds}
                    isAvailable={availSchedule.length > 0 && gameMatchesAvailability(g.when, availSchedule)}
                    onMessageGroup={() => handleMessageGroup(g)}
                    onCrewPress={id => {
                      const p = PEOPLE_MAP[id];
                      if (p) setSelectedPlayer(p);
                    }}
                    onReport={() => setReportingGame(g)}
                  />
                ))}
              </>
            )}

            {/* Empty state */}
            {!loading && games.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: colors.tx1 }]}>
                  No open games in {profileCity || 'your city'} yet
                </Text>
                <Text style={[styles.emptySub, { color: colors.tx3 }]}>
                  Be the first to post a tee time.
                </Text>
              </View>
            )}
          </>
        )}

        {/* Persistent broadcast CTA — always visible */}
        <TouchableOpacity
          style={[styles.broadcastCta, { borderColor: colors.pBorder, backgroundColor: colors.pTint }]}
          onPress={() => router.push('/(tabs)/broadcast')}
          activeOpacity={0.75}
        >
          <Ionicons name="radio-outline" size={15} color={colors.p1} />
          <Text style={[styles.broadcastCtaText, { color: colors.p1 }]}>
            Want to broadcast your own game? Do it here →
          </Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

      <PlayerSheet
        visible={!!selectedPlayer}
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        canBlock={false}
        onMessage={() => setSelectedPlayer(null)}
        onBroadcastWith={() => {
          if (selectedPlayer && 'online' in selectedPlayer) {
            setBroadcastFriend(selectedPlayer as Friend);
          }
          setSelectedPlayer(null);
        }}
      />

      <ReportBlockSheet
        visible={!!reportingGame}
        onClose={() => setReportingGame(null)}
        onSubmitted={() => {
          if (reportingGame) reportGame(reportingGame.id, reportingGame.title);
          setReportingGame(null);
        }}
        targetId={reportingGame?.id ?? ''}
        targetName={reportingGame?.title ?? ''}
        targetType="broadcast"
        initialStep="report-reasons"
      />
    </View>
  );
}

// ── YourGameRow ───────────────────────────────────────────────────────────────
function YourGameRow({ game, colors, meId, onCancel, onSubmitRatings, alreadyRated, onMarkCompleted }: {
  game: Game;
  colors: ReturnType<typeof useApp>['colors'];
  meId: string;
  onCancel: () => void;
  onSubmitRatings: (gameId: string, ratings: Record<string, number>) => void;
  alreadyRated: boolean;
  onMarkCompleted?: () => void;
}) {
  const isRoundActive = game.roundStatus === 'in_progress' || game.roundStatus === 'completed';

  const handleShare = async () => {
    await Share.share({
      message: `I'm looking for golf partners at ${game.venue} — ${game.when}. Join me on Find a Fourth!`,
    });
  };

  return (
    <View style={[styles.yourGameCard, { borderColor: isRoundActive ? colors.br3 : colors.pBorder }]}>
      {/* Badge — round status or YOUR BROADCAST */}
      {game.roundStatus === 'in_progress' ? (
        <View style={[styles.roundBadge, { backgroundColor: colors.amber + '22', borderColor: colors.amber }]}>
          <View style={[styles.roundBadgeDot, { backgroundColor: colors.amber }]} />
          <Text style={[styles.roundBadgeText, { color: colors.amber }]}>Round in progress</Text>
        </View>
      ) : game.roundStatus === 'completed' ? (
        <View style={[styles.roundBadge, { backgroundColor: colors.green + '22', borderColor: colors.green }]}>
          <Ionicons name="checkmark-circle" size={14} color={colors.green} />
          <Text style={[styles.roundBadgeText, { color: colors.green }]}>Round completed</Text>
        </View>
      ) : (
        <LinearGradient
          colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.yourGameBadge}
        >
          <Text style={styles.yourGameBadgeText}>YOUR BROADCAST</Text>
        </LinearGradient>
      )}

      {/* Title + spots (hide spots during round) */}
      <View style={styles.gameHeader}>
        <Text style={[styles.gameTitle, { color: colors.tx1 }]}>{game.title}</Text>
        {!isRoundActive && (
          <View style={[styles.spotsBadge, { backgroundColor: colors.p1 }]}>
            <Text style={[styles.spotsText, { color: 'white' }]}>
              {game.spots} spot{game.spots !== 1 ? 's' : ''} open
            </Text>
          </View>
        )}
      </View>

      {/* Venue + time */}
      <View style={styles.gameMeta}>
        <Ionicons name="location-outline" size={13} color={isRoundActive ? colors.tx3 : colors.p1} />
        <Text style={[styles.gameMetaText, { color: isRoundActive ? colors.tx2 : colors.pDark }]}>{game.venue}</Text>
        <Ionicons name="time-outline" size={13} color={isRoundActive ? colors.tx3 : colors.p1} style={{ marginLeft: 8 }} />
        <Text style={[styles.gameMetaText, { color: isRoundActive ? colors.tx2 : colors.pDark }]}>{game.when}</Text>
      </View>

      {/* "Not playing?" inline message */}
      {game.roundStatus === 'in_progress' && (
        <Text style={[styles.notPlayingText, { color: colors.tx3 }]}>
          Not playing?{' '}
          <Text
            style={{ color: colors.red, fontWeight: '700' }}
            onPress={() => Alert.alert(
              'Remove broadcast?',
              'This removes the broadcast for all players.',
              [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: onCancel },
              ]
            )}
          >
            Remove
          </Text>
          {' '}the broadcast if your plans changed.
        </Text>
      )}

      {/* Chips (hide during round) */}
      {!isRoundActive && game.chips.length > 0 && (
        <View style={[styles.gamePills, { marginBottom: 2 }]}>
          {game.chips.map(([v, label]) => <Pill key={label} label={label} variant={v as any} />)}
          {game.tees   && game.tees   !== 'Any' && <Pill label={`${game.tees} tees`} variant="gray" />}
          {game.cart   && game.cart   !== 'Any' && <Pill label={game.cart}            variant="gray" />}
          {game.holes  && game.holes  !== '18 Holes'   && <Pill label={game.holes}   variant="gray" />}
          {game.format && game.format !== 'Stroke Play' && <Pill label={game.format} variant="gray" />}
        </View>
      )}

      {/* Rate players section */}
      {isRoundActive && (
        <View style={[styles.rateSection, { borderTopColor: colors.br3 }]}>
          <RatePlayersSection
            game={game}
            meId={meId}
            colors={colors}
            onSubmit={onSubmitRatings}
            alreadySubmitted={alreadyRated}
          />
        </View>
      )}

      {/* Actions */}
      <View style={[styles.gameActions, { borderTopColor: isRoundActive ? colors.br3 : colors.pBorder }]}>
        {!isRoundActive && (
          <>
            <TouchableOpacity style={styles.gameAction} onPress={handleShare}>
              <Ionicons name="share-outline" size={13} color={colors.p1} />
              <Text style={[styles.gameActionText, { color: colors.p1 }]}>Share</Text>
            </TouchableOpacity>
            <View style={[styles.gameActionDivider, { backgroundColor: colors.pBorder }]} />
            <TouchableOpacity style={styles.gameAction} onPress={onCancel}>
              <Ionicons name="close-circle-outline" size={13} color={colors.red} />
              <Text style={[styles.gameActionText, { color: colors.red }]}>Cancel broadcast</Text>
            </TouchableOpacity>
          </>
        )}
        {game.roundStatus === 'in_progress' && onMarkCompleted && (
          <TouchableOpacity style={styles.gameAction} onPress={() => Alert.alert(
            'Mark round as completed?',
            'This lets everyone rate their fellow golfers.',
            [
              { text: 'Not yet', style: 'cancel' },
              { text: 'Mark completed', onPress: onMarkCompleted },
            ]
          )}>
            <Ionicons name="checkmark-circle-outline" size={13} color={colors.green} />
            <Text style={[styles.gameActionText, { color: colors.green }]}>Mark as completed</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── YourJoinedGameRow ─────────────────────────────────────────────────────────
function YourJoinedGameRow({ game, colors, meId, onLeave, onSubmitRatings, alreadyRated }: {
  game: Game;
  colors: ReturnType<typeof useApp>['colors'];
  meId: string;
  onLeave: () => void;
  onSubmitRatings: (gameId: string, ratings: Record<string, number>) => void;
  alreadyRated: boolean;
}) {
  const isRoundActive = game.roundStatus === 'in_progress' || game.roundStatus === 'completed';

  return (
    <View style={[styles.yourGameCard, { borderColor: isRoundActive ? colors.br3 : colors.br2 }]}>
      {/* Badge */}
      {game.roundStatus === 'in_progress' ? (
        <View style={[styles.roundBadge, { backgroundColor: colors.amber + '22', borderColor: colors.amber }]}>
          <View style={[styles.roundBadgeDot, { backgroundColor: colors.amber }]} />
          <Text style={[styles.roundBadgeText, { color: colors.amber }]}>Round in progress</Text>
        </View>
      ) : game.roundStatus === 'completed' ? (
        <View style={[styles.roundBadge, { backgroundColor: colors.green + '22', borderColor: colors.green }]}>
          <Ionicons name="checkmark-circle" size={14} color={colors.green} />
          <Text style={[styles.roundBadgeText, { color: colors.green }]}>Round completed</Text>
        </View>
      ) : (
        <View style={[styles.joinedBadge, { backgroundColor: colors.bg3, borderColor: colors.br2 }]}>
          <Text style={[styles.joinedBadgeText, { color: colors.tx2 }]}>JOINED</Text>
        </View>
      )}

      {/* Title + spots */}
      <View style={styles.gameHeader}>
        <Text style={[styles.gameTitle, { color: colors.tx1 }]}>{game.title}</Text>
        {!isRoundActive && (
          <View style={[styles.spotsBadge, { backgroundColor: colors.bg3 }]}>
            <Text style={[styles.spotsText, { color: colors.tx2 }]}>
              {game.spots} spot{game.spots !== 1 ? 's' : ''} open
            </Text>
          </View>
        )}
      </View>

      {/* Venue + time */}
      <View style={styles.gameMeta}>
        <Ionicons name="location-outline" size={13} color={colors.tx3} />
        <Text style={[styles.gameMetaText, { color: colors.tx2 }]}>{game.venue}</Text>
        <Ionicons name="time-outline" size={13} color={colors.tx3} style={{ marginLeft: 8 }} />
        <Text style={[styles.gameMetaText, { color: colors.tx2 }]}>{game.when}</Text>
      </View>

      {/* "Not playing?" inline message */}
      {game.roundStatus === 'in_progress' && (
        <Text style={[styles.notPlayingText, { color: colors.tx3 }]}>
          Not playing?{' '}
          <Text
            style={{ color: colors.red, fontWeight: '700' }}
            onPress={() => Alert.alert(
              'Leave?',
              'This removes you from the broadcast. Others continue their round.',
              [
                { text: 'Stay', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: onLeave },
              ]
            )}
          >
            Leave
          </Text>
          {' '}the broadcast if your plans changed.
        </Text>
      )}

      {/* Rate players section */}
      {isRoundActive && (
        <View style={[styles.rateSection, { borderTopColor: colors.br3 }]}>
          <RatePlayersSection
            game={game}
            meId={meId}
            colors={colors}
            onSubmit={onSubmitRatings}
            alreadySubmitted={alreadyRated}
          />
        </View>
      )}

      {/* Actions */}
      {!isRoundActive && (
        <View style={[styles.gameActions, { borderTopColor: colors.br3 }]}>
          <TouchableOpacity style={styles.gameAction} onPress={() => {
            Alert.alert('Leave game?', "You'll be removed from this game.", [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: onLeave },
            ]);
          }}>
            <Ionicons name="exit-outline" size={13} color={colors.red} />
            <Text style={[styles.gameActionText, { color: colors.red }]}>Leave game</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── GameRow ───────────────────────────────────────────────────────────────────
function GameRow({ game, colors, activeFriendIds, isAvailable, onMessageGroup, onCrewPress, onReport }: {
  game: Game;
  colors: ReturnType<typeof useApp>['colors'];
  activeFriendIds: Set<string>;
  isAvailable?: boolean;
  onMessageGroup: () => void;
  onCrewPress: (id: string) => void;
  onReport: () => void;
}) {
  const isSolo    = game.crew.length <= 1;
  const msgLabel  = isSolo ? 'Message Player' : 'Message Group';
  const hasFriend = game.crew.some(id => activeFriendIds.has(id));

  return (
    <View style={[styles.gameCard, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
      {/* Header */}
      <View style={styles.gameHeader}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Text style={[styles.gameTitle, { color: colors.tx1 }]}>{game.title}</Text>
          {hasFriend && (
            <View style={[styles.friendTag, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
              <Text style={[styles.friendTagText, { color: colors.p1 }]}>FRIEND</Text>
            </View>
          )}
        </View>
        <View style={[styles.spotsBadge, { backgroundColor: colors.pTint }]}>
          <Text style={[styles.spotsText, { color: colors.p1 }]}>
            {game.spots} spot{game.spots !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Venue + time */}
      <View style={styles.gameMeta}>
        <Ionicons name="location-outline" size={13} color={colors.tx3} />
        <Text style={[styles.gameMetaText, { color: colors.tx3 }]}>{game.venue}</Text>
        <Ionicons name="time-outline" size={13} color={colors.tx3} style={{ marginLeft: 8 }} />
        <Text style={[styles.gameMetaText, { color: colors.tx3 }]}>{game.when}</Text>
        {isAvailable && (
          <View style={styles.availBadge}>
            <Text style={styles.availBadgeText}>Available</Text>
          </View>
        )}
      </View>

      {/* Crew avatars + info */}
      {game.crew.length > 0 && (
        <View style={styles.crewSection}>
          <View style={styles.crewAvatarRow}>
            {game.crew.slice(0, 4).map((id, idx) => {
              const person = PEOPLE_MAP[id];
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.crewAvatarWrap, { marginLeft: idx === 0 ? 0 : -8, zIndex: 10 - idx }]}
                  onPress={() => onCrewPress(id)}
                >
                  <Avatar who={person?.who ?? id} size={32} />
                </TouchableOpacity>
              );
            })}
            {game.crew.length > 4 && (
              <View style={[styles.crewMore, { backgroundColor: colors.bg3, marginLeft: -8 }]}>
                <Text style={[styles.crewMoreText, { color: colors.tx2 }]}>+{game.crew.length - 4}</Text>
              </View>
            )}
          </View>
          <View style={styles.crewInfo}>
            <Text style={[styles.crewNames, { color: colors.tx2 }]}>{game.crewNames}</Text>
            <View style={styles.crewRatingRow}>
              <Stars value={parseFloat(game.crewRating) || 0} size={11} color={colors.p1} />
              <Text style={[styles.crewRatingText, { color: colors.tx3 }]}>{game.crewRating}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Chips */}
      <View style={styles.gamePills}>
        {game.chips.map(([v, label]) => (
          <Pill key={label} label={label} variant={v as any} />
        ))}
        {game.tees   && game.tees   !== 'Any'         && <Pill label={`${game.tees} tees`} variant="gray" />}
        {game.cart   && game.cart   !== 'Any'         && <Pill label={game.cart}            variant="gray" />}
        {game.holes  && game.holes  !== '18 Holes'    && !game.chips.some(([,l]) => l === game.holes) && (
          <Pill label={game.holes!} variant="gray" />
        )}
        {game.format && game.format !== 'Stroke Play' && !game.chips.some(([,l]) => l === game.format) && (
          <Pill label={game.format!} variant="gray" />
        )}
      </View>

      {/* Actions */}
      <View style={[styles.gameActions, { borderTopColor: colors.br3 }]}>
        <TouchableOpacity style={styles.gameAction} onPress={onMessageGroup}>
          <Ionicons name="chatbubble-outline" size={13} color={colors.p1} />
          <Text style={[styles.gameActionText, { color: colors.p1 }]}>{msgLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.p1} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        <View style={[styles.gameActionDivider, { backgroundColor: colors.br3 }]} />
        <TouchableOpacity style={styles.gameAction} onPress={onReport}>
          <Ionicons name="flag-outline" size={13} color={colors.tx3} />
          <Text style={[styles.gameActionText, { color: colors.tx3 }]}>Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  topnav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  navTitle: { fontSize: 20, fontWeight: '700' },
  navSub:   { fontSize: 12, marginTop: 1 },

  searchWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, position: 'relative' },
  searchIcon: { position: 'absolute', left: 26, top: 21, zIndex: 1 },
  searchInput: {
    borderRadius: 12, borderWidth: 0.5, paddingVertical: 10,
    paddingLeft: 36, paddingRight: 14, fontSize: 14,
  },

  // Filter panel
  filterWrap:        { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 0.5, overflow: 'hidden' },
  filterHeader:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  filterHeaderLabel: { fontSize: 14, fontWeight: '600' },
  filterBadge:       { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText:   { color: 'white', fontSize: 10, fontWeight: '700' },
  filterDivider:     { height: 0.5 },
  filterBody:        { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 10, gap: 10 },
  filterRow:         { gap: 6 },
  filterRowLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  filterChips:       { flexDirection: 'row', gap: 6, paddingRight: 4 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, borderWidth: 0.5,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  clearFiltersBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginHorizontal: 12, marginBottom: 12,
    borderTopWidth: 0.5,
  },
  clearFiltersBtnText: { fontSize: 13, fontWeight: '600' },

  // Friends toggle
  friendsToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 14, marginTop: 8,
    padding: 10, borderRadius: 11, borderWidth: 0.5,
  },
  friendsToggleLabel: { flex: 1, fontSize: 13, fontWeight: '500' },

  availStrip:      { paddingTop: 10, paddingHorizontal: 14 },
  availStripLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  availScroll:     { gap: 12, paddingBottom: 4 },
  availChip:       { alignItems: 'center', gap: 4, width: 52 },
  availAvatarWrap: { position: 'relative' as const },
  onlineDot:       { position: 'absolute' as const, bottom: 1, right: 1, width: 11, height: 11,
                     borderRadius: 6, backgroundColor: '#34C759', borderWidth: 2 },
  availName:       { fontSize: 10, fontWeight: '600', textAlign: 'center' as const },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
  },

  // YOUR BROADCAST card
  yourGameCard: {
    marginHorizontal: 14, marginBottom: 10, borderRadius: 16,
    borderWidth: 1, padding: 14,
    backgroundColor: 'transparent',
  },
  yourGameBadge: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  yourGameBadgeText: { color: 'white', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Round status badges (shared)
  roundBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 99, borderWidth: 0.5, marginBottom: 10,
  },
  roundBadgeDot:  { width: 8, height: 8, borderRadius: 4 },
  roundBadgeText: { fontSize: 12, fontWeight: '700' },

  // "Not playing?" message
  notPlayingText: { fontSize: 12, lineHeight: 18, marginBottom: 8 },

  // Rate players section border container
  rateSection: { borderTopWidth: 0.5, marginTop: 4 },

  // Game cards (shared styles)
  gameCard: {
    marginHorizontal: 14, marginBottom: 10, borderRadius: 16,
    borderWidth: 0.5, padding: 14,
  },
  gameHeader:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  gameTitle:    { fontSize: 14, fontWeight: '600', flex: 1, flexShrink: 1 },
  spotsBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8, flexShrink: 0 },
  spotsText:    { fontSize: 11, fontWeight: '600' },
  friendTag:    { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5, flexShrink: 0 },
  friendTagText:{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  gameMeta:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 10 },
  gameMetaText: { fontSize: 12 },

  // Crew section
  crewSection:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  crewAvatarRow:  { flexDirection: 'row', alignItems: 'center' },
  crewAvatarWrap: { borderRadius: 16 },
  crewMore:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  crewMoreText:   { fontSize: 10, fontWeight: '700' },
  crewInfo:       { flex: 1, gap: 3 },
  crewNames:      { fontSize: 12 },
  crewRatingRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crewRatingText: { fontSize: 11 },

  gamePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },

  gameActions: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 0.5, marginTop: 10,
  },
  gameActionDivider: { width: 0.5, alignSelf: 'stretch' },
  gameAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 10, paddingHorizontal: 4,
  },
  gameActionText: { fontSize: 13, fontWeight: '600' },

  availBadge:     { borderRadius: 6, borderWidth: 0.5, borderColor: '#34C759', backgroundColor: '#E6F9ED', paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  availBadgeText: { fontSize: 10, fontWeight: '700', color: '#1A7F37' },

  // Empty + CTA
  emptyState:       { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  emptyTitle:       { fontSize: 16, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptySub:         { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  broadcastCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 14, marginTop: 12, marginBottom: 4,
    paddingVertical: 13, borderRadius: 14, borderWidth: 0.5,
  },
  broadcastCtaText: { fontSize: 14, fontWeight: '600' },

  // Rejection notice
  rejectionNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 14, marginTop: 12, padding: 12,
    borderRadius: 12, borderWidth: 0.5,
  },
  rejectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  rejectionSub:   { fontSize: 12, lineHeight: 17 },

  // Joined game badge
  joinedBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 0.5, marginBottom: 8,
  },
  joinedBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
});
