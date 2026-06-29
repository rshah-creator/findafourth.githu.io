import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import type { User } from '@supabase/supabase-js';
import type { Phase, SheetState, Thread, Friend, Player, Game, ReceivedRating } from '@/types';
import { THREADS } from '@/constants/Data';
import { Colors } from '@/constants/Colors';
import type { ColorScheme } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { IS_PRODUCTION } from '@/lib/appVariant';
import type { SocialProfileData } from '@/lib/auth';
import {
  sendFriendRequestToSupabase,
  cancelFriendRequestInSupabase,
  fetchOutgoingPendingRequests,
  fetchIncomingFriendRequests,
  fetchAcceptedFriends,
  respondToFriendRequest,
} from '@/lib/auth';
import {
  registerForPushNotifications,
  scheduleLocalPush,
  cancelScheduledNotification,
  NOTIF_CATEGORY,
} from '@/lib/notifications';
import {
  directThreadId,
  upsertThread,
  loadUserThreads,
} from '@/lib/chat';

export type ProfileStats = {
  handicap: string;
  tees: string;
  pace: string;
  cart: string;
  partners: string;
  music: string;
};

export type AvailEntry = { day: string; times: string[] };

export type FriendRequest = {
  id: string;
  name: string;
  who?: string;
  avatar_url?: string | null;
  initials?: string;
  hcp?: string;
  home?: string;
};

// ── Mock broadcast builder — previews each co-broadcaster role ─────────────────
// 'yousef' is the mock current user. Demonstrates: initiator with a pending
// co-broadcaster, you as a pending invitee, and you as a confirmed invitee.
export function mockBroadcastFor(role: 'initiator' | 'pending' | 'confirmed'): Game {
  const base = {
    id: 'my-game-mock',
    title: 'Looking for one more at DHA',
    venue: 'DHA Raya GC', city: 'Lahore',
    when: 'Today 4:00 PM',
    chips: [['brand', 'Hcp 12–18'], ['gray', 'Moderate']] as [string, string][],
    spots: 2, boosted: false,
    hcp_range: 'Hcp 12–18', pace: 'Moderate',
    tees: 'Blue', cart: 'Walking',
    holes: '9 Holes', format: 'Stroke Play',
  };

  if (role === 'initiator') {
    return {
      ...base,
      spots: 2,
      crew:       ['yousef', 'omar'],
      crewNames:  'You, Omar T.',
      crewRating: '4.5',
      broadcaster_id:  'yousef',
      co_broadcasters: ['omar'],
      pending_co_broadcasters: ['omar'],   // Omar greyed / awaiting confirmation
      joined_players:  ['hassan'],
      pending_joined_players: [],
    };
  }
  // pending | confirmed → Omar is the host, you were added
  return {
    ...base,
    crew:       ['omar', 'yousef'],
    crewNames:  'Omar T., You',
    crewRating: '4.5',
    broadcaster_id:  'omar',
    co_broadcasters: ['yousef'],
    pending_co_broadcasters: role === 'pending' ? ['yousef'] : [],
    joined_players:  [],
  };
}

interface AppContextValue {
  // Theme
  dark: boolean;
  setDark: (v: boolean) => void;
  colors: ColorScheme;

  // Phase / feature gating
  phase: Phase;
  setPhase: (v: Phase) => void;

  // Sheet overlay
  sheet: SheetState | null;
  openSheet: (sheet: SheetState) => void;
  closeSheet: () => void;

  // Messaging
  unread: number;
  setUnread: (n: number) => void;
  activeThread: Thread | null;
  setActiveThread: (t: Thread | null) => void;

  // Friends ↔ Discover cross-feature
  friendsOnly: boolean;
  setFriendsOnly: (v: boolean) => void;

  // Friends → Broadcast pre-selection
  broadcastFriend: Friend | null;
  setBroadcastFriend: (f: Friend | null) => void;

  // Dynamic thread list + group thread helpers
  threads: Thread[];
  setThreads: React.Dispatch<React.SetStateAction<Thread[]>>;
  findOrCreateGroupThread: (game: Game, joinAtEnd?: boolean) => Thread;
  findOrCreateDirectThread: (id: string, name: string, who: string) => Thread;

  // Home course(s) — shared between Profile and Broadcast
  homeCourse: string;
  setHomeCourse: (v: string) => void;
  homeCourses: string[];
  setHomeCourses: (v: string[]) => void;

  // Profile creation data — written by profile-setup flow, read by Profile tab
  profileName: string;
  setProfileName: (v: string) => void;
  profileCity: string;
  setProfileCity: (v: string) => void;
  profileImageUri: string | null;
  setProfileImageUri: (v: string | null) => void;
  profileStats: ProfileStats;
  setProfileStats: (v: ProfileStats) => void;
  availSchedule: AvailEntry[];
  setAvailSchedule: (v: AvailEntry[]) => void;

  // Safety
  blockedUserIds: string[];
  blockUser: (id: string) => void;
  reportedGameIds: string[];
  reportGame: (gameId: string, gameTitle: string) => void;

  // Split name + contact fields (set by profile-setup, used for account details)
  profileFirstName: string;
  setProfileFirstName: (v: string) => void;
  profileLastName: string;
  setProfileLastName: (v: string) => void;
  profileGender: string;
  setProfileGender: (v: string) => void;
  profilePhone: string;
  setProfilePhone: (v: string) => void;
  profileEmail: string;
  setProfileEmail: (v: string) => void;

  // Supabase auth
  supabaseUser: User | null;
  setSupabaseUser: (u: User | null) => void;
  socialProfileData: SocialProfileData | null;
  setSocialProfileData: (d: SocialProfileData | null) => void;

  // Profile mode — 'real' for actual users, 'mock' for dev/demo
  profileMode: 'real' | 'mock';
  setProfileMode: (v: 'real' | 'mock') => void;
  loadMockProfile: () => void;
  loadRealProfile: () => void;

  // The game the current user has actively broadcast (shown at top of Discover)
  myActiveGame: Game | null;
  setMyActiveGame: (g: Game | null) => void;
  // Dev helper — reshapes the mock broadcast to preview each viewer role
  loadMockBroadcastAs: (role: 'initiator' | 'pending' | 'confirmed') => void;
  // Notifies the broadcast initiator (via in-app system thread) that an invite was declined/left
  notifyBroadcastDeclined: (declinerName: string, gameTitle: string, left?: boolean) => void;
  // Notifies all co-broadcasters and joined players that the broadcast was cancelled
  notifyBroadcastCancelled: (cancellerName: string, gameTitle: string, affectedIds: string[]) => void;

  // Join request flow
  myJoinedGame: Game | null;
  setMyJoinedGame: (g: Game | null) => void;
  rejectionNotice: { gameTitle: string; gameId: string } | null;
  setRejectionNotice: (v: { gameTitle: string; gameId: string } | null) => void;
  notifyPlayerJoined: (playerName: string, gameTitle: string) => void;
  notifyRejectedPlayer: (gameTitle: string, gameId: string) => void;
  // Dev helpers for testing join/reject flow
  simulatePendingJoin: () => void;
  simulateRejection: () => void;

  // Round lifecycle & ratings
  roundsPlayed: number;
  setRoundsPlayed: (n: number) => void;
  receivedRatings: Record<string, ReceivedRating>;
  submitRatings: (gameId: string, ratings: Record<string, number>) => void;
  hasSubmittedRatings: (gameId: string) => boolean;
  notifyRateReminder: (gameId: string, gameTitle: string, venue: string) => void;
  simulateRoundInProgress: () => void;
  simulateRoundCompleted: () => void;

  // Push notifications
  pushToken: string | null;
  notificationPrefs: { games: boolean; rounds: boolean; messages: boolean };
  setNotificationPrefs: (p: { games: boolean; rounds: boolean; messages: boolean }) => void;
  requestPushPermission: () => Promise<boolean>;

  // "Available now for games" toggle — on for 2 hours, then auto-off
  availableNow: boolean;
  availableUntil: number | null;   // ms timestamp when it expires
  setAvailable: (on: boolean) => void;

  // Friend request flow
  pendingRequestIds: string[];
  incomingRequests: FriendRequest[];
  extraFriends: Friend[];
  incomingRequestIds: Record<string, string>;
  sendFriendRequest: (profile: FriendRequest) => void;
  cancelFriendRequest: (receiverId: string) => void;
  acceptFriendRequest: (id: string) => void;
  rejectFriendRequest: (id: string) => void;
  refreshFriendRequests: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark]                     = useState(false);
  const [phase, setPhase]                   = useState<Phase>('free');
  const [sheet, setSheet]                   = useState<SheetState | null>(null);
  const [unread, setUnread]                 = useState(0);
  const [profileMode, setProfileMode]       = useState<'real' | 'mock'>('real');
  const [activeThread, setActiveThread]     = useState<Thread | null>(null);
  const [friendsOnly, setFriendsOnly]         = useState(false);
  const [broadcastFriend, setBroadcastFriend] = useState<Friend | null>(null);
  const [threads, setThreads]                 = useState<Thread[]>([]);

  // Friend request flow
  const [pendingRequestIds,  setPendingRequestIds]  = useState<string[]>([]);
  const [incomingRequests,   setIncomingRequests]   = useState<FriendRequest[]>([]);
  const [extraFriends,       setExtraFriends]       = useState<Friend[]>([]);
  const [incomingRequestIds, setIncomingRequestIds] = useState<Record<string, string>>({});

  // Push notifications
  const [pushToken,         setPushToken]         = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<{ games: boolean; rounds: boolean; messages: boolean }>({
    games: true, rounds: true, messages: true,
  });
  const rateReminderNotifIdRef = useRef<string | null>(null);

  // "Available now for games" — on for 2 hours then auto-off
  const [availableNow,   setAvailableNow]   = useState(false);
  const [availableUntil, setAvailableUntil] = useState<number | null>(null);

  function findOrCreateGroupThread(game: Game, joinAtEnd = false): Thread {
    const existingId = `${game.id}-thread`;
    const existing = threads.find(t => t.id === existingId);
    if (existing) {
      // If joining mid-conversation, record the index so only future messages are visible
      if (joinAtEnd && existing.joinedMsgIndex === undefined && existing.msgs.length > 0) {
        const updated = { ...existing, joinedMsgIndex: existing.msgs.length };
        setThreads(prev => prev.map(t => t.id === existingId ? updated : t));
        setActiveThread(updated);
        return updated;
      }
      setActiveThread(existing);
      return existing;
    }
    const participantIds = supabaseUser
      ? [supabaseUser.id, ...game.crew.filter(id => id !== supabaseUser.id)]
      : game.crew;
    const newThread: Thread = {
      id: existingId,
      who: game.crew[0] ?? 'unknown',
      name: game.title,
      last: 'Group chat started',
      time: 'Now',
      unread: 0,
      msgs: [],
      isGroup: true,
      crew: game.crew,
      joinedMsgIndex: joinAtEnd ? 0 : undefined,
      participant_ids: participantIds,
    };
    setThreads(prev => [newThread, ...prev]);
    setActiveThread(newThread);
    if (profileMode === 'real' && supabaseUser) {
      upsertThread(existingId, 'group', game.title, participantIds, game.id).catch(console.warn);
    }
    return newThread;
  }

  function findOrCreateDirectThread(id: string, name: string, who: string): Thread {
    // In real mode, use a deterministic thread ID based on both user IDs
    const realId = (profileMode === 'real' && supabaseUser)
      ? directThreadId(supabaseUser.id, id)
      : id;

    const existing = threads.find(t => t.id === realId || t.id === id || t.who === id);
    if (existing) {
      setActiveThread(existing);
      return existing;
    }
    const participantIds = supabaseUser ? [supabaseUser.id, id] : [id];
    const newThread: Thread = {
      id: realId,
      who: id,
      name,
      last: '',
      time: 'Now',
      unread: 0,
      msgs: [],
      participant_ids: participantIds,
    };
    setThreads(prev => [newThread, ...prev]);
    setActiveThread(newThread);
    if (profileMode === 'real' && supabaseUser) {
      upsertThread(realId, 'direct', name, participantIds).catch(console.warn);
    }
    return newThread;
  }
  const [homeCourse, setHomeCourse]         = useState('');
  const [homeCourses, setHomeCourses]       = useState<string[]>([]);

  // Profile creation data
  const [profileName, setProfileName]         = useState('');
  const [profileCity, setProfileCity]         = useState('');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [profileStats, setProfileStats]       = useState<ProfileStats>({
    handicap: '18', tees: 'Blue', pace: 'Moderate',
    cart: 'Either', partners: 'Any', music: 'Sometimes',
  });
  const [availSchedule, setAvailSchedule]     = useState<AvailEntry[]>([]);

  // Split name + contact — declared here so realProfileRef can reference them
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName,  setProfileLastName]  = useState('');
  const [profileGender,    setProfileGender]    = useState('');
  const [profilePhone,     setProfilePhone]     = useState('');
  const [profileEmail,     setProfileEmail]     = useState('');

  // Snapshot of real-user profile fields — updated whenever mode is 'real'.
  // Allows loadRealProfile() to restore data after a mock-mode visit.
  const realProfileRef = useRef({
    profileName: '', profileCity: '',
    profileFirstName: '', profileLastName: '', profileGender: '',
    profileImageUri: null as string | null,
    profileStats: { handicap: '18', tees: 'Blue', pace: 'Moderate', cart: 'Either', partners: 'Any', music: 'Sometimes' } as ProfileStats,
    homeCourse: '', homeCourses: [] as string[], availSchedule: [] as AvailEntry[],
  });
  useEffect(() => {
    if (profileMode !== 'real') return;
    realProfileRef.current = {
      profileName, profileCity,
      profileFirstName, profileLastName, profileGender,
      profileImageUri,
      profileStats,
      homeCourse, homeCourses, availSchedule,
    };
  }, [profileMode, profileName, profileCity, profileFirstName, profileLastName,
      profileGender, profileImageUri, profileStats, homeCourse, homeCourses, availSchedule]);

  // Active broadcast
  const [myActiveGame, setMyActiveGame] = useState<Game | null>(null);

  // Join request flow
  const [myJoinedGame,    setMyJoinedGame]    = useState<Game | null>(null);
  const [rejectionNotice, setRejectionNotice] = useState<{ gameTitle: string; gameId: string } | null>(null);

  // Safety
  const [blockedUserIds,  setBlockedUserIds]  = useState<string[]>([]);
  const [reportedGameIds, setReportedGameIds] = useState<string[]>([]);

  // Round lifecycle & ratings
  const [roundsPlayed,           setRoundsPlayed]           = useState(0);
  const [receivedRatings,        setReceivedRatings]        = useState<Record<string, ReceivedRating>>({});
  const [submittedRatingGameIds, setSubmittedRatingGameIds] = useState<string[]>([]);

  function blockUser(id: string) {
    setBlockedUserIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }

  function reportGame(gameId: string, gameTitle: string) {
    setReportedGameIds(prev => prev.includes(gameId) ? prev : [...prev, gameId]);
    // Add a system notification thread so the broadcaster sees a mild community-standards message
    const notifId = `report-notif-${gameId}`;
    const notifThread: Thread = {
      id:     notifId,
      who:    'system',
      name:   'Find a Fourth',
      last:   'Your game posting has been flagged for review.',
      time:   'Just now',
      unread: 1,
      msgs:   [
        {
          from: 'system',
          time: 'Just now',
          text: `Hi there — your game "${gameTitle}" was flagged by another player and is temporarily hidden from Discover while we review it.\n\nWe want to be fair: if you think this was a mistake, just reply here to start an appeal and we'll look into it promptly. Thanks for being part of the community.`,
        },
      ],
    };
    setThreads(prev => [notifThread, ...prev.filter(t => t.id !== notifId)]);
    setUnread(prev => prev + 1);
  }

  // Notifies co-broadcasters and joined players that the broadcast was cancelled.
  // In mock mode each affected person gets a system thread in Messages.
  function notifyBroadcastCancelled(cancellerName: string, gameTitle: string, affectedIds: string[]) {
    if (!affectedIds.length) return;
    const newThreads: Thread[] = affectedIds.map(id => ({
      id:     `broadcast-cancelled-${id}-${Date.now()}`,
      who:    'system',
      name:   'Find a Fourth',
      last:   `${cancellerName} cancelled the broadcast`,
      time:   'Just now',
      unread: 1,
      msgs:   [{
        from: 'system', time: 'Just now',
        text: `Heads up — ${cancellerName} cancelled the broadcast "${gameTitle}". No worries, there are plenty of other games to join in Discover!`,
      }],
    }));
    setThreads(prev => [...newThreads, ...prev]);
    setUnread(prev => prev + affectedIds.length);
    if (notificationPrefs.games) {
      scheduleLocalPush(
        'Broadcast cancelled',
        `${cancellerName} cancelled the broadcast "${gameTitle}". Check Discover for other games!`,
        NOTIF_CATEGORY.GAMES,
        { screen: 'discover' },
      );
    }
  }

  // Notify the broadcast initiator (via in-app system thread) that an invite
  // was declined, or that a confirmed co-broadcaster left.
  function notifyBroadcastDeclined(declinerName: string, gameTitle: string, left = false) {
    const notifId = `broadcast-decline-${Date.now()}`;
    const headline = left ? 'A co-broadcaster left' : 'Broadcast declined';
    const body = left
      ? `${declinerName} left your broadcast "${gameTitle}". The spot is open again — your broadcast is still live.`
      : `${declinerName} declined your invite to co-broadcast "${gameTitle}". The spot is open again — your broadcast is still live.`;
    const notifThread: Thread = {
      id:     notifId,
      who:    'system',
      name:   'Find a Fourth',
      last:   headline,
      time:   'Just now',
      unread: 1,
      msgs:   [{ from: 'system', time: 'Just now', text: `${headline} — ${body}` }],
    };
    setThreads(prev => [notifThread, ...prev]);
    setUnread(prev => prev + 1);
    if (notificationPrefs.games) {
      scheduleLocalPush(
        headline,
        left
          ? `${declinerName} left your broadcast "${gameTitle}". The spot is open again.`
          : `${declinerName} declined your invite to co-broadcast "${gameTitle}". The spot is open again.`,
        NOTIF_CATEGORY.GAMES,
        { screen: 'broadcast' },
      );
    }
  }

  // Notify broadcaster that a player wants to join
  function notifyPlayerJoined(playerName: string, gameTitle: string) {
    const notifId = `player-joined-${Date.now()}`;
    const notifThread: Thread = {
      id:     notifId,
      who:    'system',
      name:   'Find a Fourth',
      last:   `${playerName} wants to join your broadcast`,
      time:   'Just now',
      unread: 1,
      msgs:   [{
        from: 'system', time: 'Just now',
        text: `Player join request — ${playerName} wants to join your broadcast "${gameTitle}". Head to your Broadcast tab to accept or decline.`,
      }],
    };
    setThreads(prev => [notifThread, ...prev]);
    setUnread(prev => prev + 1);
    if (notificationPrefs.games) {
      scheduleLocalPush(
        `${playerName} wants to join`,
        `${playerName} wants to join your broadcast "${gameTitle}". Go to Broadcast to accept or decline.`,
        NOTIF_CATEGORY.GAMES,
        { screen: 'broadcast' },
      );
    }
  }

  // Notify rejected player and clear their joined game
  function notifyRejectedPlayer(gameTitle: string, gameId: string) {
    setMyJoinedGame(null);
    setRejectionNotice({ gameTitle, gameId });
    const notifId = `player-rejected-${Date.now()}`;
    const notifThread: Thread = {
      id:     notifId,
      who:    'system',
      name:   'Find a Fourth',
      last:   'Update on a game you joined',
      time:   'Just now',
      unread: 1,
      msgs:   [{
        from: 'system', time: 'Just now',
        text: `Heads up — the broadcasters for "${gameTitle}" had a change of plans. No worries, there are plenty of other games to join in Discover!`,
      }],
    };
    setThreads(prev => [notifThread, ...prev]);
    setUnread(prev => prev + 1);
    if (notificationPrefs.games) {
      scheduleLocalPush(
        'Update on a game you joined',
        `Heads up — the broadcasters for "${gameTitle}" had a change of plans. Check Discover for other games.`,
        NOTIF_CATEGORY.GAMES,
        { screen: 'discover' },
      );
    }
  }

  // Dev: simulate Hassan requesting to join your broadcast
  function simulatePendingJoin() {
    const game = mockBroadcastFor('initiator'); // already has hassan in pending_joined_players
    setMyActiveGame(game);
    notifyPlayerJoined('Hassan R.', game.title);
  }

  // Dev: simulate being rejected from a game you joined
  function simulateRejection() {
    const mockGame: Game = {
      id: 'g2',
      title: 'Saturday morning round',
      venue: 'DHA Raya GC', city: 'Lahore',
      when: 'Sat 7am',
      crew: ['hassan', 'ayesha'],
      crewNames: 'Hassan R., Ayesha M.',
      crewRating: '4.7',
      chips: [['brand', 'Hcp 6–12'], ['gray', 'Relaxed']] as [string, string][],
      spots: 1, boosted: false,
    };
    setMyJoinedGame(mockGame);
    // Immediately trigger rejection after a brief moment so the user sees the joined state first
    setTimeout(() => {
      notifyRejectedPlayer(mockGame.title, mockGame.id);
    }, 800);
  }

  // ── Round lifecycle & rating helpers ─────────────────────────────────────────

  function submitRatings(gameId: string, ratings: Record<string, number>) {
    // Cancel the pending rate-reminder push for this game, if any
    if (rateReminderNotifIdRef.current) {
      cancelScheduledNotification(rateReminderNotifIdRef.current);
      rateReminderNotifIdRef.current = null;
    }
    setSubmittedRatingGameIds(prev => prev.includes(gameId) ? prev : [...prev, gameId]);
    setReceivedRatings(prev => {
      const next = { ...prev };
      Object.entries(ratings).forEach(([id, stars]) => {
        const ex = next[id] ?? { total: 0, count: 0 };
        next[id] = { total: ex.total + stars, count: ex.count + 1 };
      });
      return next;
    });
  }

  function hasSubmittedRatings(gameId: string): boolean {
    return submittedRatingGameIds.includes(gameId);
  }

  function notifyRateReminder(gameId: string, gameTitle: string, venue: string) {
    if (submittedRatingGameIds.includes(gameId)) return;  // already rated
    const threadId = `rate-reminder-${gameId}`;
    const thread: Thread = {
      id:     threadId,
      who:    'system',
      name:   'Find a Fourth',
      last:   'How was your round? Rate your fellow golfers.',
      time:   'Just now',
      unread: 1,
      isGroup: false,
      msgs:   [{
        from: 'system', time: 'Just now',
        text: `How was your round? ⭐ Head to your Broadcast tab to rate your fellow golfers from "${gameTitle}" — they appreciate the feedback!`,
      }],
    };
    setThreads(prev => [thread, ...prev.filter(t => t.id !== threadId)]);
    setUnread(prev => prev + 1);
    if (notificationPrefs.rounds) {
      // Cancel any previous undelivered reminder for this game
      if (rateReminderNotifIdRef.current) {
        cancelScheduledNotification(rateReminderNotifIdRef.current);
      }
      // Schedule push for 4 hours after the round. The dev trigger fires this
      // immediately (the caller can pass a mock game that already has scheduledAt
      // in the past). To test the push without waiting 4h, temporarily change
      // the delay below to a small number like 10.
      scheduleLocalPush(
        'Rate your fellow golfers! ⭐',
        `How was your round at ${venue}? Take a moment to rate your playing partners.`,
        NOTIF_CATEGORY.ROUNDS,
        { screen: 'broadcast', gameId },
        4 * 60 * 60,
      ).then(id => { rateReminderNotifIdRef.current = id; });
    }
  }

  // Dev: set scheduledAt = now → round just started (not yet 8h old → 'in_progress')
  function simulateRoundInProgress() {
    const base = myActiveGame ?? mockBroadcastFor('initiator');
    setMyActiveGame({ ...base, scheduledAt: new Date().toISOString(), roundStatus: 'in_progress' });
  }

  // Dev: set scheduledAt = 9h ago → past the 8h threshold → 'completed'
  function simulateRoundCompleted() {
    const base = myActiveGame ?? mockBroadcastFor('initiator');
    setMyActiveGame({
      ...base,
      scheduledAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
      roundStatus: 'completed',
    });
    setRoundsPlayed(prev => prev + 1);
  }

  // Supabase auth state
  const [supabaseUser,      setSupabaseUser]      = useState<User | null>(null);
  const [socialProfileData, setSocialProfileData] = useState<SocialProfileData | null>(null);

  // ── Friend request helpers ────────────────────────────────────────────────
  function sendFriendRequest(profile: FriendRequest) {
    setPendingRequestIds(prev => prev.includes(profile.id) ? prev : [...prev, profile.id]);
    if (profileMode === 'real' && supabaseUser) {
      sendFriendRequestToSupabase(supabaseUser.id, profile.id).then(({ error }) => {
        if (error) {
          console.warn('[sendFriendRequest] error:', error.message, error);
          Alert.alert('Could not send request', error.message);
          setPendingRequestIds(prev => prev.filter(id => id !== profile.id));
        }
      }).catch(console.warn);
    }
  }

  function cancelFriendRequest(receiverId: string) {
    setPendingRequestIds(prev => prev.filter(id => id !== receiverId));
    if (profileMode === 'real' && supabaseUser) {
      cancelFriendRequestInSupabase(supabaseUser.id, receiverId).catch(console.warn);
    }
  }

  function acceptFriendRequest(id: string) {
    const req = incomingRequests.find(r => r.id === id);
    setIncomingRequests(prev => prev.filter(r => r.id !== id));
    setPendingRequestIds(prev => prev.filter(x => x !== id));
    if (!req) return;
    setExtraFriends(prev => prev.some(f => f.id === id) ? prev : [...prev, {
      id: req.id,
      who: req.who ?? req.id,
      name: req.name,
      avatar_url: req.avatar_url && req.avatar_url.startsWith('https://') ? req.avatar_url : null,
      hcp: req.hcp ?? '—',
      home: req.home ?? '—',
      tees: 'Blue' as const,
      online: false,
      games: 0,
    }]);
    // Notify the acceptor that the connection is now mutual
    const threadId = `friend-accepted-${id}`;
    const thread: Thread = {
      id: threadId,
      who: 'system',
      name: 'Find a Fourth',
      last: `You're now friends with ${req.name}`,
      time: 'Just now',
      unread: 1,
      msgs: [{
        from: 'system',
        time: 'Just now',
        text: `🎉 You and ${req.name} are now friends! Head to your Friends tab to message them or plan a round together.`,
      }],
    };
    setThreads(prev => [thread, ...prev.filter(t => t.id !== threadId)]);
    setUnread(prev => prev + 1);
    if (profileMode === 'real') {
      const reqRowId = incomingRequestIds[id];
      if (reqRowId) {
        respondToFriendRequest(reqRowId, 'accepted').then(({ error, updated }) => {
          if (error || updated === 0) {
            Alert.alert('Could not accept request',
              error?.message ?? 'The request could not be updated. It may have been withdrawn.');
          }
        }).catch(console.warn);
        setIncomingRequestIds(prev => { const n = {...prev}; delete n[id]; return n; });
      } else {
        console.warn('[acceptFriendRequest] no row id for', id);
      }
    }
  }

  function rejectFriendRequest(id: string) {
    setIncomingRequests(prev => prev.filter(r => r.id !== id));
    setPendingRequestIds(prev => prev.filter(x => x !== id));
    if (profileMode === 'real') {
      const reqRowId = incomingRequestIds[id];
      if (reqRowId) {
        respondToFriendRequest(reqRowId, 'rejected').catch(console.warn);
        setIncomingRequestIds(prev => { const n = {...prev}; delete n[id]; return n; });
      }
    }
  }

  // ── Mock / Real profile helpers ───────────────────────────────────────────
  const loadMockProfile = useCallback(() => {
    setProfileMode('mock');
    setProfileName('Yousef A.');
    setProfileCity('Lahore');
    setProfileFirstName('Yousef');
    setProfileLastName('A.');
    setHomeCourse('DHA Raya GC');
    setHomeCourses(['DHA Raya GC', 'Lahore Gymkhana GC']);
    setAvailSchedule([
      { day: 'Saturday', times: ['5am – 9am', '9am – 12pm'] },
      { day: 'Sunday',   times: ['9am – 12pm'] },
    ]);
    setThreads(THREADS);
    setUnread(2);
    setProfileImageUri(null);  // clear any real photo so pravatar shows
    // Seed a "your broadcast" (default: you're the initiator with a pending co-broadcaster)
    setMyActiveGame(mockBroadcastFor('initiator'));
    setReportedGameIds([]);
    setRoundsPlayed(31);
    setReceivedRatings({ yousef: { total: 115, count: 24 } }); // avg ~4.8, 24 ratings
    setSubmittedRatingGameIds([]);
    setPendingRequestIds([]);
    setIncomingRequests([]);
    setIncomingRequestIds({});
    setExtraFriends([]);
    AsyncStorage.setItem('f4f_profile_mode', 'mock');
  }, []);

  // Dev helper — reshape the mock broadcast to preview each viewer role
  const loadMockBroadcastAs = useCallback((role: 'initiator' | 'pending' | 'confirmed') => {
    setMyActiveGame(mockBroadcastFor(role));
  }, []);

  const loadRealProfile = useCallback(() => {
    setProfileMode('real');
    // Restore real-user profile fields from snapshot (preserved before mock was loaded)
    const snap = realProfileRef.current;
    setProfileName(snap.profileName);
    setProfileCity(snap.profileCity);
    setProfileFirstName(snap.profileFirstName);
    setProfileLastName(snap.profileLastName);
    setProfileGender(snap.profileGender);
    setProfileImageUri(snap.profileImageUri);
    setProfileStats(snap.profileStats);
    setHomeCourse(snap.homeCourse);
    setHomeCourses(snap.homeCourses);
    setAvailSchedule(snap.availSchedule);
    // Clear mock-only data
    setThreads([]);
    setUnread(0);
    setMyActiveGame(null);
    setReportedGameIds([]);
    setRoundsPlayed(0);
    setReceivedRatings({});
    setSubmittedRatingGameIds([]);
    setPendingRequestIds([]);
    setIncomingRequests([]);
    setIncomingRequestIds({});
    setExtraFriends([]);
    AsyncStorage.setItem('f4f_profile_mode', 'real');
  }, []);

  const setAvailable = useCallback((on: boolean) => {
    if (on) {
      const until = Date.now() + 2 * 60 * 60 * 1000;
      setAvailableNow(true);
      setAvailableUntil(until);
      AsyncStorage.setItem('f4f_available_until', String(until));
    } else {
      setAvailableNow(false);
      setAvailableUntil(null);
      AsyncStorage.removeItem('f4f_available_until');
    }
  }, []);

  // Auto-expiry: schedule a one-shot timeout to turn off when availableUntil is reached
  useEffect(() => {
    if (!availableUntil) return;
    const remaining = availableUntil - Date.now();
    if (remaining <= 0) { setAvailable(false); return; }
    const id = setTimeout(() => setAvailable(false), remaining);
    return () => clearTimeout(id);
  }, [availableUntil]);

  // Push permission request — called lazily (first broadcast post / game join, not on launch)
  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    const token = await registerForPushNotifications();
    setPushToken(token);
    return token !== null;
  }, []);

  // Persist notification preferences to AsyncStorage
  useEffect(() => {
    AsyncStorage.setItem('f4f_notif_prefs', JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  // Restore notification preferences on mount
  useEffect(() => {
    AsyncStorage.getItem('f4f_notif_prefs').then(raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        setNotificationPrefs(prev => ({ ...prev, ...saved }));
      } catch {}
    });
  }, []);

  // Restore "available now" expiry on mount
  useEffect(() => {
    AsyncStorage.getItem('f4f_available_until').then(raw => {
      if (!raw) return;
      const until = Number(raw);
      if (until > Date.now()) {
        setAvailableNow(true);
        setAvailableUntil(until);
      } else {
        AsyncStorage.removeItem('f4f_available_until');
      }
    });
  }, []);

  // Auto-save real profile to AsyncStorage whenever any field changes.
  // Skipped in mock mode so dev data never overwrites the user's real profile.
  useEffect(() => {
    if (profileMode !== 'real') return;
    // Don't persist a completely empty profile (e.g. default state before setup)
    if (!profileName && !profileCity && !profileFirstName) return;
    // Phone and email are PII — not stored in unencrypted AsyncStorage.
    // They are persisted to the Supabase profiles table on setup completion.
    AsyncStorage.setItem('f4f_real_profile', JSON.stringify({
      profileName, profileCity,
      profileFirstName, profileLastName, profileGender,
      profileImageUri,
      profileStats,
      homeCourse, homeCourses,
      availSchedule,
    }));
  }, [profileMode, profileName, profileCity, profileFirstName, profileLastName,
      profileGender, profileImageUri, profileStats,
      homeCourse, homeCourses, availSchedule]);

  // Restore persisted profile mode on mount — but never load mock if a real session exists
  useEffect(() => {
    // Production builds never allow mock mode — clears any stale flag from a TestFlight install.
    // The real-profile restore below must still run, so don't return early here.
    if (IS_PRODUCTION) {
      AsyncStorage.removeItem('f4f_profile_mode');
    }

    supabase.auth.getSession().then(({ data }) => {
      const hasSession = !!data.session?.user;
      if (hasSession) {
        // Real signed-in user → always real mode, clear any stale mock flag
        AsyncStorage.setItem('f4f_profile_mode', 'real');
      }
      // Restore saved real profile first (for both signed-in and anonymous users),
      // then apply profile mode. Signed-in users need their locally-cached profile
      // data restored on every launch (it's a cached copy of their Supabase profile).
      AsyncStorage.multiGet(['f4f_profile_mode', 'f4f_real_profile']).then(pairs => {
        const mode    = hasSession ? 'real' : pairs[0][1];
        const rawProf = pairs[1][1];

        // Restore real profile data regardless of mode (mock will overlay it)
        if (rawProf) {
          try {
            const s = JSON.parse(rawProf);
            if (s.profileName)    setProfileName(s.profileName);
            if (s.profileCity)    setProfileCity(s.profileCity);
            if (s.profileFirstName) setProfileFirstName(s.profileFirstName);
            if (s.profileLastName)  setProfileLastName(s.profileLastName);
            if (s.profileGender)    setProfileGender(s.profileGender);
            if (s.profileImageUri)  setProfileImageUri(s.profileImageUri);
            if (s.profileStats)     setProfileStats(s.profileStats);
            if (s.homeCourse)       setHomeCourse(s.homeCourse);
            if (s.homeCourses)      setHomeCourses(s.homeCourses);
            if (s.availSchedule)    setAvailSchedule(
              s.availSchedule.map((e: any) =>
                e.times ? e : { day: e.day, times: e.time ? [e.time] : [] }
              )
            );
            // profilePhone and profileEmail are not stored locally (PII — kept in Supabase only)
          } catch {}
        }

        if (mode === 'mock' && !IS_PRODUCTION) loadMockProfile();
      });
    });
  }, []);

  // Sync Supabase session on mount and on auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSupabaseUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSupabaseUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Merge accepted-friend profiles into the in-memory friends list (id-deduped).
  const mergeAcceptedFriends = useCallback((accepted: Awaited<ReturnType<typeof fetchAcceptedFriends>>) => {
    if (!accepted.length) return;
    setExtraFriends(prev => {
      const merged = [...prev];
      for (const a of accepted) {
        if (merged.some(f => f.id === a.id)) continue;
        merged.push({
          id: a.id, who: a.id, name: a.name,
          avatar_url: a.avatarUrl ?? null,
          hcp: a.handicap ? `Hcp ${a.handicap}` : '—',
          home: a.homeCourse || '—',
          tees: 'Blue' as const, online: false, games: 0,
        });
      }
      return merged;
    });
  }, []);

  // Single source of truth for pulling all friend-request state from Supabase.
  // Called on mount, on every realtime event, AND on demand (e.g. when the
  // Friends tab gains focus) so requests still surface even if realtime is off.
  const refreshFriendRequests = useCallback(async () => {
    if (profileMode !== 'real' || !supabaseUser) return;
    const userId = supabaseUser.id;
    try {
      // Outgoing pending → "Pending" badges on the sender's side
      fetchOutgoingPendingRequests(userId).then(setPendingRequestIds).catch(console.warn);

      // Incoming pending → Accept/Reject rows on the receiver's side
      const requests = await fetchIncomingFriendRequests(userId);
      setIncomingRequests(requests.map(r => ({
        id: r.senderId,
        name: r.senderName,
        avatar_url: r.avatarUrl,
        initials: r.senderName.charAt(0).toUpperCase(),
        hcp: r.handicap ? `Hcp ${r.handicap}` : undefined,
      })));
      const idMap: Record<string, string> = {};
      requests.forEach(r => { idMap[r.senderId] = r.requestId; });
      setIncomingRequestIds(idMap);

      // Accepted (either direction) → persistent friends list across restarts
      const accepted = await fetchAcceptedFriends(userId);
      mergeAcceptedFriends(accepted);
    } catch (e) {
      console.warn('[refreshFriendRequests] failed:', e);
    }
  }, [profileMode, supabaseUser?.id, mergeAcceptedFriends]);

  // Hydrate friend-request state + real-time subscription (real mode)
  useEffect(() => {
    if (profileMode !== 'real' || !supabaseUser) return;
    const userId = supabaseUser.id;

    refreshFriendRequests();

    const channel = supabase
      .channel(`friend-requests-${userId}`)
      // Any new/updated request where I'm the receiver → re-pull incoming list
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'friend_requests',
        filter: `receiver_id=eq.${userId}`,
      }, () => refreshFriendRequests())
      // My outgoing request changed (accepted/rejected) → update my side
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'friend_requests',
        filter: `sender_id=eq.${userId}`,
      }, (payload: any) => {
        const receiverId = payload.new.receiver_id;
        setPendingRequestIds(prev => prev.filter(id => id !== receiverId));
        if (payload.new.status === 'accepted') {
          supabase.from('profiles')
            .select('first_name, last_name, avatar_url, handicap, home_course, city')
            .eq('id', receiverId).single()
            .then(({ data }: { data: any }) => {
              if (!data) return;
              const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Golfer';
              const avatar = (data.avatar_url ?? '').startsWith('https://') ? data.avatar_url : null;
              setExtraFriends(prev => prev.some(f => f.id === receiverId) ? prev : [...prev, {
                id: receiverId, who: receiverId, name, avatar_url: avatar,
                hcp: data.handicap ? `Hcp ${data.handicap}` : '—',
                home: data.home_course || data.city || '—',
                tees: 'Blue' as const, online: false, games: 0,
              }]);
              const threadId = `friend-accepted-${receiverId}`;
              setThreads(prev => [{
                id: threadId, who: 'system', name: 'Find a Fourth',
                last: `You're now friends with ${name}`,
                time: 'Just now', unread: 1,
                msgs: [{ from: 'system', time: 'Just now',
                  text: `🎉 You and ${name} are now friends! Head to your Friends tab to message them or plan a round together.` }],
              }, ...prev.filter(t => t.id !== threadId)]);
              setUnread(prev => prev + 1);
            });
        }
      })
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[friend-requests] realtime subscribe status:', status,
            '— ensure friend_requests is in the supabase_realtime publication');
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [profileMode, supabaseUser?.id, refreshFriendRequests]);

  // Load real threads from Supabase on mount in real mode
  useEffect(() => {
    if (profileMode !== 'real' || !supabaseUser) return;
    const myId = supabaseUser.id;
    loadUserThreads().then(rows => {
      if (!rows.length) return;
      setThreads(rows.map(row => ({
        id: row.id,
        who: row.participant_ids.find((id: string) => id !== myId) ?? row.participant_ids[0] ?? '',
        name: row.name ?? '',
        last: row.last_message_text ?? '',
        time: row.last_message_at
          ? new Date(row.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : '',
        unread: 0,
        msgs: [],
        isGroup: row.type === 'group',
        participant_ids: row.participant_ids,
      })));
    });
  }, [profileMode, supabaseUser?.id]);

  // Auto-transition roundStatus based on scheduledAt
  // Runs every 60 seconds while a game with a scheduledAt is active.
  useEffect(() => {
    const tick = () => {
      setMyActiveGame(prev => {
        if (!prev?.scheduledAt || prev.roundStatus === 'completed') return prev;
        const start = new Date(prev.scheduledAt).getTime();
        const now   = Date.now();
        const computed: Game['roundStatus'] =
          now >= start + 8 * 60 * 60 * 1000 ? 'completed' :
          now >= start                       ? 'in_progress' :
                                               'open';
        if (computed === (prev.roundStatus ?? 'open')) return prev;
        // If transitioning to completed, increment rounds
        if (computed === 'completed') {
          setRoundsPlayed(n => n + 1);
        }
        return { ...prev, roundStatus: computed };
      });
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myActiveGame?.scheduledAt]);

  const colors = dark ? Colors.dark : Colors.light;

  return (
    <AppContext.Provider value={{
      dark, setDark, colors,
      phase, setPhase,
      sheet, openSheet: setSheet, closeSheet: () => setSheet(null),
      unread, setUnread,
      activeThread, setActiveThread,
      friendsOnly, setFriendsOnly,
      broadcastFriend, setBroadcastFriend,
      threads, setThreads, findOrCreateGroupThread, findOrCreateDirectThread,
      homeCourse, setHomeCourse,
      homeCourses, setHomeCourses,
      profileName, setProfileName,
      profileCity, setProfileCity,
      profileImageUri, setProfileImageUri,
      profileStats, setProfileStats,
      availSchedule, setAvailSchedule,
      blockedUserIds, blockUser,
      reportedGameIds, reportGame,
      myActiveGame, setMyActiveGame,
      loadMockBroadcastAs, notifyBroadcastDeclined, notifyBroadcastCancelled,
      myJoinedGame, setMyJoinedGame,
      rejectionNotice, setRejectionNotice,
      notifyPlayerJoined, notifyRejectedPlayer,
      simulatePendingJoin, simulateRejection,
      roundsPlayed, setRoundsPlayed,
      receivedRatings, submitRatings, hasSubmittedRatings,
      notifyRateReminder, simulateRoundInProgress, simulateRoundCompleted,
      pushToken, notificationPrefs, setNotificationPrefs, requestPushPermission,
      profileFirstName, setProfileFirstName,
      profileLastName, setProfileLastName,
      profileGender, setProfileGender,
      profilePhone, setProfilePhone,
      profileEmail, setProfileEmail,
      supabaseUser, setSupabaseUser,
      socialProfileData, setSocialProfileData,
      profileMode, setProfileMode, loadMockProfile, loadRealProfile,
      availableNow, availableUntil, setAvailable,
      pendingRequestIds, incomingRequests, incomingRequestIds, extraFriends,
      sendFriendRequest, cancelFriendRequest, acceptFriendRequest, rejectFriendRequest, refreshFriendRequests,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
