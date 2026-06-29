import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { Avatar } from '@/components/Avatar';
import { PlayerSheet } from '@/components/PlayerSheet';
import { ReportBlockSheet } from '@/components/ReportBlockSheet';
import { FRIENDS, PLAYERS, VENUES_BY_CITY } from '@/constants/Data';
import { fetchAllProfiles, type RealProfile } from '@/lib/auth';
import type { Friend, Player } from '@/types';
import type { FriendRequest } from '@/context/AppContext';

export default function FriendsScreen() {
  const {
    colors, setBroadcastFriend, blockedUserIds, profileMode,
    findOrCreateDirectThread, profileCity, supabaseUser,
    pendingRequestIds, incomingRequests, extraFriends,
    sendFriendRequest, cancelFriendRequest, acceptFriendRequest, rejectFriendRequest,
    refreshFriendRequests,
  } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [search, setSearch]               = useState('');
  const [sheetFriend, setSheetFriend]     = useState<Friend | null>(null);
  const [optionsFriend, setOptionsFriend] = useState<Friend | null>(null);
  const [addFriendsOpen, setAddFriendsOpen] = useState(false);
  const [realProfiles, setRealProfiles]   = useState<RealProfile[]>([]);

  const activeFriends = [...(profileMode === 'mock' ? FRIENDS : []), ...extraFriends];
  const activePlayers = profileMode === 'mock' ? PLAYERS : [];

  useEffect(() => {
    if (profileMode !== 'real' || !supabaseUser) return;
    fetchAllProfiles(supabaseUser.id, supabaseUser.phone ?? undefined).then(setRealProfiles);
  }, [profileMode, supabaseUser?.id]);

  // Re-pull friend requests + discoverable profiles every time the tab gains
  // focus, so incoming requests surface even when realtime isn't delivering.
  useFocusEffect(
    React.useCallback(() => {
      if (profileMode !== 'real' || !supabaseUser) return;
      refreshFriendRequests();
      fetchAllProfiles(supabaseUser.id, supabaseUser.phone ?? undefined).then(setRealProfiles);
    }, [profileMode, supabaseUser?.id, refreshFriendRequests])
  );

  const filtered = activeFriends
    .filter(f => !blockedUserIds.includes(f.id))
    .filter(f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.home.toLowerCase().includes(search.toLowerCase())
    );
  const online  = filtered.filter(f => f.online);
  const offline = filtered.filter(f => !f.online);

  const FRIEND_IDS = new Set(activeFriends.map(f => f.id));
  const suggested  = activePlayers.filter(p => !FRIEND_IDS.has(p.id)).slice(0, 2);

  // "People using Find a Fourth" discovery list: exclude yourself, anyone already
  // a friend, and anyone you've blocked — so an accepted friend doesn't appear in
  // both the friends list and the discovery list.
  const discoverProfiles = realProfiles.filter(p =>
    p.id !== supabaseUser?.id &&
    !FRIEND_IDS.has(p.id) &&
    !blockedUserIds.includes(p.id)
  );

  const openMessage = (f: Friend) => {
    findOrCreateDirectThread(f.id, f.name, f.who);
    router.push(`/chat/${f.id}?from=friends`);
  };

  const openBroadcast = (f: Friend) => {
    setBroadcastFriend(f);
    router.push('/(tabs)/broadcast');
  };

  // Resolve friend to full Player object for the sheet (falls back to friend data)
  const playerForSheet = (f: Friend): Friend | Player =>
    activePlayers.find(p => p.id === f.id) ?? f;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg1 }]}>
      {/* Top nav */}
      <View style={[styles.topnav, { paddingTop: insets.top + 4, borderBottomColor: colors.br3 }]}>
        <View>
          <Text style={[styles.navTitle, { color: colors.tx1 }]}>Friends</Text>
          <Text style={[styles.navSub, { color: colors.tx3 }]}>{activeFriends.length} golf buddies</Text>
        </View>
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.bg2 }]}
          onPress={() => setAddFriendsOpen(true)}>
          <Ionicons name="person-add-outline" size={20} color={colors.tx2} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.tx3} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.bg2, color: colors.tx1, borderColor: colors.br3 }]}
          placeholder="Search friends"
          placeholderTextColor={colors.tx3}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Incoming friend requests */}
        {incomingRequests.length > 0 && (
          <>
            <View style={[styles.sectionLabel, { marginTop: 4 }]}>
              <Ionicons name="person-add-outline" size={11} color="#F59E0B" />
              <Text style={[styles.sectionLabelText, { color: '#F59E0B' }]}>
                Friend Requests · {incomingRequests.length}
              </Text>
            </View>
            {incomingRequests.map(req => (
              <FriendRequestRow
                key={req.id}
                request={req}
                colors={colors}
                onAccept={() => acceptFriendRequest(req.id)}
                onReject={() => rejectFriendRequest(req.id)}
              />
            ))}
          </>
        )}

        {/* Online */}
        {online.length > 0 && (
          <>
            <View style={styles.sectionLabel}>
              <View style={[styles.onlineDot]} />
              <Text style={[styles.sectionLabelText, { color: colors.tx3 }]}>
                Online · {online.length}
              </Text>
            </View>
            {online.map(f => (
              <FriendRow key={f.id} friend={f} colors={colors}
                onMessage={() => openMessage(f)}
                onProfile={() => setSheetFriend(f)}
                onBroadcast={() => openBroadcast(f)}
                onOptions={() => setOptionsFriend(f)}
              />
            ))}
          </>
        )}

        {/* Offline */}
        {offline.length > 0 && (
          <>
            <Text style={[styles.sectionLabelText, { color: colors.tx3, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }]}>
              Offline · {offline.length}
            </Text>
            {offline.map(f => (
              <FriendRow key={f.id} friend={f} colors={colors}
                onMessage={() => openMessage(f)}
                onProfile={() => setSheetFriend(f)}
                onBroadcast={() => openBroadcast(f)}
                onOptions={() => setOptionsFriend(f)}
              />
            ))}
          </>
        )}

        {/* Suggested — real mode: real Supabase profiles */}
        {profileMode === 'real' && discoverProfiles.length > 0 && (
          <>
            <View style={[styles.sectionLabel, { marginTop: 8 }]}>
              <Ionicons name="sparkles-outline" size={11} color={colors.tx3} />
              <Text style={[styles.sectionLabelText, { color: colors.tx3 }]}>People using Find a Fourth</Text>
            </View>
            {discoverProfiles.slice(0, 5).map(p => {
              const rName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Golfer';
              const rInitials = [p.first_name, p.last_name]
                .filter(Boolean).map(s => s!.charAt(0).toUpperCase()).join('') || '?';
              return (
                <RealProfileRow
                  key={p.id}
                  profile={p}
                  colors={colors}
                  isPending={pendingRequestIds.includes(p.id)}
                  onAdd={() => sendFriendRequest({
                    id: p.id,
                    name: rName,
                    avatar_url: p.avatar_url,
                    initials: rInitials,
                    hcp: p.handicap ? `Hcp ${p.handicap}` : undefined,
                    home: p.home_course || p.city || undefined,
                  })}
                  onCancel={() => cancelFriendRequest(p.id)}
                />
              );
            })}
          </>
        )}

        {/* Suggested — mock mode: non-friend players */}
        {profileMode === 'mock' && suggested.length > 0 && (
          <>
            <View style={[styles.sectionLabel, { marginTop: 8 }]}>
              <Ionicons name="sparkles-outline" size={11} color={colors.tx3} />
              <Text style={[styles.sectionLabelText, { color: colors.tx3 }]}>Suggested</Text>
            </View>
            {suggested.map(p => (
              <SuggestedRow
                key={p.id}
                player={p}
                colors={colors}
                isPending={pendingRequestIds.includes(p.id)}
                onAdd={() => sendFriendRequest({ id: p.id, name: p.name, who: p.who, hcp: p.hcp, home: p.home })}
              />
            ))}
          </>
        )}

        <View style={{ padding: 20, alignItems: 'center', gap: 6 }}>
          <Ionicons name="golf-outline" size={18} color={colors.tx3} />
          <Text style={[styles.emptyText, { color: colors.tx3 }]}>More golfers added as you play</Text>
        </View>
      </ScrollView>

      <PlayerSheet
        visible={!!sheetFriend}
        player={sheetFriend ? playerForSheet(sheetFriend) : null}
        onClose={() => setSheetFriend(null)}
        canBlock={true}
        onMessage={sheetFriend ? () => { openMessage(sheetFriend); setSheetFriend(null); } : undefined}
        onBroadcastWith={sheetFriend ? () => { openBroadcast(sheetFriend); setSheetFriend(null); } : undefined}
      />

      <ReportBlockSheet
        visible={!!optionsFriend}
        onClose={() => setOptionsFriend(null)}
        targetId={optionsFriend?.id ?? ''}
        targetName={optionsFriend?.name ?? ''}
        targetType="user"
        canBlock={true}
        initialStep="action-menu"
      />

      <AddFriendsSheet
        visible={addFriendsOpen}
        onClose={() => setAddFriendsOpen(false)}
        profileCity={profileCity}
        activeFriends={activeFriends}
        activePlayers={activePlayers}
        realProfiles={profileMode === 'real' ? discoverProfiles : []}
        colors={colors}
        pendingRequestIds={pendingRequestIds}
        onSendRequest={sendFriendRequest}
        onCancelRequest={cancelFriendRequest}
      />
    </View>
  );
}

function FriendRow({ friend, colors, onMessage, onProfile, onBroadcast, onOptions }: {
  friend: Friend;
  colors: ReturnType<typeof useApp>['colors'];
  onMessage: () => void;
  onProfile: () => void;
  onBroadcast: () => void;
  onOptions: () => void;
}) {
  return (
    <View style={[styles.friendRow, { borderBottomColor: colors.br3 }]}>
      <TouchableOpacity onPress={onProfile} style={{ position: 'relative' }}>
        <Avatar
          who={friend.who}
          uri={friend.avatar_url && friend.avatar_url.startsWith('http') ? friend.avatar_url : undefined}
          initials={friend.name?.charAt(0).toUpperCase()}
          size={44}
        />
        {friend.online && (
          <View style={[styles.onlineDotSmall, { borderColor: colors.bg1 }]} />
        )}
      </TouchableOpacity>

      <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={onProfile}>
        <Text style={[styles.friendName, { color: colors.tx1 }]}>{friend.name}</Text>
        <Text style={[styles.friendSub, { color: colors.tx3 }]}>
          {friend.hcp} · {friend.home}
        </Text>
        <Text style={[styles.friendGames, { color: colors.p1 }]}>
          {friend.games} game{friend.games !== 1 ? 's' : ''} together
        </Text>
      </TouchableOpacity>

      <View style={styles.actions}>
        <ActionBtn icon="chatbubble-outline" onPress={onMessage} colors={colors} />
        <ActionBtn icon="person-outline" onPress={onProfile} colors={colors} />
        <ActionBtn icon="radio-outline" onPress={onBroadcast} colors={colors} primary />
        <ActionBtn icon="ellipsis-horizontal" onPress={onOptions} colors={colors} />
      </View>
    </View>
  );
}

function ActionBtn({ icon, onPress, colors, primary = false }: {
  icon: string;
  onPress: () => void;
  colors: ReturnType<typeof useApp>['colors'];
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { borderColor: colors.br3, backgroundColor: primary ? colors.pTint : colors.bg2 },
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon as any} size={15} color={primary ? colors.p1 : colors.tx2} />
    </TouchableOpacity>
  );
}

function SuggestedRow({ player, colors, isPending, onAdd }: {
  player: Player;
  colors: ReturnType<typeof useApp>['colors'];
  isPending: boolean;
  onAdd: () => void;
}) {
  return (
    <View style={[styles.friendRow, { borderBottomColor: colors.br3 }]}>
      <Avatar who={player.who} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.friendName, { color: colors.tx1 }]}>{player.name}</Text>
        <Text style={[styles.friendSub, { color: colors.tx3 }]}>
          {player.hcp} · {player.home}
        </Text>
      </View>
      {isPending ? (
        <View style={[styles.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2, opacity: 0.6 }]}>
          <Ionicons name="time-outline" size={13} color={colors.tx3} />
          <Text style={[styles.addBtnText, { color: colors.tx3 }]}>Pending</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2 }]}
          onPress={onAdd}
        >
          <Ionicons name="person-add-outline" size={13} color={colors.tx2} />
          <Text style={[styles.addBtnText, { color: colors.tx2 }]}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RealProfileRow({ profile, colors, isPending, onAdd, onCancel }: {
  profile: RealProfile;
  colors: ReturnType<typeof useApp>['colors'];
  isPending: boolean;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Golfer';
  const hcp  = profile.handicap ? `Hcp ${profile.handicap}` : '—';
  const home = profile.home_course || profile.city || '—';
  const initials = [profile.first_name, profile.last_name]
    .filter(Boolean).map(s => s!.charAt(0).toUpperCase()).join('') || '?';
  return (
    <View style={[styles.friendRow, { borderBottomColor: colors.br3 }]}>
      <Avatar uri={profile.avatar_url ?? undefined} initials={initials} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.friendName, { color: colors.tx1 }]}>{name}</Text>
        <Text style={[styles.friendSub, { color: colors.tx3 }]}>{hcp} · {home}</Text>
      </View>
      {isPending ? (
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2 }]}
          onPress={onCancel}
        >
          <Ionicons name="time-outline" size={13} color={colors.tx3} />
          <Text style={[styles.addBtnText, { color: colors.tx3 }]}>Pending</Text>
          <View style={[styles.pendingDivider, { backgroundColor: colors.br2 }]} />
          <Ionicons name="close" size={13} color={colors.tx3} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2 }]}
          onPress={onAdd}
        >
          <Ionicons name="person-add-outline" size={13} color={colors.tx2} />
          <Text style={[styles.addBtnText, { color: colors.tx2 }]}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function FriendRequestRow({ request, colors, onAccept, onReject }: {
  request: FriendRequest;
  colors: ReturnType<typeof useApp>['colors'];
  onAccept: () => void;
  onReject: () => void;
}) {
  const initials = request.initials ?? request.name.charAt(0).toUpperCase();
  return (
    <View style={[styles.friendRow, { borderBottomColor: colors.br3 }]}>
      <Avatar uri={request.avatar_url ?? undefined} who={request.who} initials={initials} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.friendName, { color: colors.tx1 }]}>{request.name}</Text>
        <Text style={[styles.friendSub, { color: colors.tx3 }]}>
          {request.hcp ? `${request.hcp} · ` : ''}{request.home ?? 'Wants to be your friend'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}
          onPress={onAccept}
        >
          <Ionicons name="checkmark" size={15} color={colors.p1} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.bg2, borderColor: colors.br2 }]}
          onPress={onReject}
        >
          <Ionicons name="close" size={15} color={colors.tx3} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AddFriendsSheet({ visible, onClose, profileCity, activeFriends, activePlayers, realProfiles = [], colors, pendingRequestIds = [], onSendRequest, onCancelRequest }: {
  visible: boolean;
  onClose: () => void;
  profileCity: string;
  activeFriends: Friend[];
  activePlayers: Player[];
  realProfiles?: RealProfile[];
  colors: ReturnType<typeof useApp>['colors'];
  pendingRequestIds?: string[];
  onSendRequest?: (profile: FriendRequest) => void;
  onCancelRequest?: (receiverId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const friendIds = new Set(activeFriends.map(f => f.id));

  const cityVenues = new Set<string>(VENUES_BY_CITY[profileCity] ?? []);
  const cityLabel  = profileCity || 'your city';
  const useReal    = realProfiles.length > 0;

  // Real-mode results: filter by search query, or show all (cross-city for small beta)
  const realResults = query.trim()
    ? realProfiles.filter(p => {
        const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase();
        return name.includes(query.toLowerCase()) ||
               (p.home_course ?? '').toLowerCase().includes(query.toLowerCase()) ||
               (p.city ?? '').toLowerCase().includes(query.toLowerCase());
      })
    : realProfiles;

  // Mock-mode results: existing city + search logic
  const mockResults = query.trim()
    ? activePlayers.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.home.toLowerCase().includes(query.toLowerCase())
      )
    : activePlayers.filter(p => cityVenues.size === 0 || cityVenues.has(p.home));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[addSt.sheet, { backgroundColor: colors.bg1 }]}>
        {/* Handle */}
        <View style={[addSt.handle, { backgroundColor: colors.br3 }]} />

        {/* Header */}
        <View style={addSt.header}>
          <Text style={[addSt.title, { color: colors.tx1 }]}>Add Friends</Text>
          <TouchableOpacity style={[addSt.closeBtn, { backgroundColor: colors.bg2 }]} onPress={onClose}>
            <Ionicons name="close" size={18} color={colors.tx2} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={addSt.searchWrap}>
          <Ionicons name="search-outline" size={16} color={colors.tx3} style={addSt.searchIcon} />
          <TextInput
            style={[addSt.searchInput, { backgroundColor: colors.bg2, color: colors.tx1, borderColor: colors.br3 }]}
            placeholder="Search by name or course"
            placeholderTextColor={colors.tx3}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>

        {/* Section label */}
        <Text style={[addSt.sectionLabel, { color: colors.tx3 }]}>
          {query.trim()
            ? 'RESULTS'
            : useReal
              ? 'PEOPLE USING FIND A FOURTH'
              : `PEOPLE IN ${cityLabel.toUpperCase()}`}
        </Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {useReal ? (
            <>
              {realResults.length === 0 && (
                <View style={addSt.empty}>
                  <Ionicons name="golf-outline" size={22} color={colors.tx3} />
                  <Text style={[addSt.emptyText, { color: colors.tx3 }]}>
                    {query.trim() ? 'No golfers found' : 'No other golfers in Find a Fourth yet'}
                  </Text>
                </View>
              )}
              {realResults.map(p => {
                const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Golfer';
                const hcp  = p.handicap ? `Hcp ${p.handicap}` : '—';
                const home = p.home_course || p.city || '—';
                const isFriend = friendIds.has(p.id);
                const initials = [p.first_name, p.last_name]
                  .filter(Boolean).map(s => s!.charAt(0).toUpperCase()).join('') || '?';
                return (
                  <View key={p.id} style={[addSt.row, { borderBottomColor: colors.br3 }]}>
                    <Avatar uri={p.avatar_url ?? undefined} initials={initials} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[addSt.name, { color: colors.tx1 }]}>{name}</Text>
                      <Text style={[addSt.sub, { color: colors.tx3 }]}>{hcp} · {home}</Text>
                    </View>
                    {isFriend ? (
                      <View style={[addSt.friendBadge, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
                        <Text style={[addSt.friendBadgeText, { color: colors.p1 }]}>Friends</Text>
                      </View>
                    ) : pendingRequestIds.includes(p.id) ? (
                      <TouchableOpacity
                        style={[addSt.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2 }]}
                        onPress={() => onCancelRequest?.(p.id)}
                      >
                        <Ionicons name="time-outline" size={13} color={colors.tx3} />
                        <Text style={[addSt.addBtnText, { color: colors.tx3 }]}>Pending</Text>
                        <View style={[styles.pendingDivider, { backgroundColor: colors.br2 }]} />
                        <Ionicons name="close" size={13} color={colors.tx3} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[addSt.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2 }]}
                        onPress={() => {
                          const pName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Golfer';
                          const pInitials = [p.first_name, p.last_name]
                            .filter(Boolean).map(s => s!.charAt(0).toUpperCase()).join('') || '?';
                          onSendRequest?.({ id: p.id, name: pName, avatar_url: p.avatar_url, initials: pInitials, hcp: p.handicap ? `Hcp ${p.handicap}` : undefined, home: p.home_course || p.city || undefined });
                        }}
                      >
                        <Ionicons name="person-add-outline" size={13} color={colors.tx2} />
                        <Text style={[addSt.addBtnText, { color: colors.tx2 }]}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          ) : (
            <>
              {mockResults.length === 0 && (
                <View style={addSt.empty}>
                  <Ionicons name="golf-outline" size={22} color={colors.tx3} />
                  <Text style={[addSt.emptyText, { color: colors.tx3 }]}>
                    {query.trim() ? 'No golfers found' : `No golfers in ${cityLabel} yet`}
                  </Text>
                </View>
              )}
              {mockResults.map(p => {
                const isFriend = friendIds.has(p.id);
                const isPending = pendingRequestIds.includes(p.id);
                return (
                  <View key={p.id} style={[addSt.row, { borderBottomColor: colors.br3 }]}>
                    <Avatar who={p.who} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[addSt.name, { color: colors.tx1 }]}>{p.name}</Text>
                      <Text style={[addSt.sub, { color: colors.tx3 }]}>{p.hcp} · {p.home}</Text>
                    </View>
                    {isFriend ? (
                      <View style={[addSt.friendBadge, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
                        <Text style={[addSt.friendBadgeText, { color: colors.p1 }]}>Friends</Text>
                      </View>
                    ) : isPending ? (
                      <TouchableOpacity
                        style={[addSt.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2 }]}
                        onPress={() => onCancelRequest?.(p.id)}
                      >
                        <Ionicons name="time-outline" size={13} color={colors.tx3} />
                        <Text style={[addSt.addBtnText, { color: colors.tx3 }]}>Pending</Text>
                        <View style={[styles.pendingDivider, { backgroundColor: colors.br2 }]} />
                        <Ionicons name="close" size={13} color={colors.tx3} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[addSt.addBtn, { borderColor: colors.br2, backgroundColor: colors.bg2 }]}
                        onPress={() => onSendRequest?.({ id: p.id, name: p.name, who: p.who, hcp: p.hcp, home: p.home })}
                      >
                        <Ionicons name="person-add-outline" size={13} color={colors.tx2} />
                        <Text style={[addSt.addBtnText, { color: colors.tx2 }]}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const addSt = StyleSheet.create({
  sheet:       { flex: 1, paddingTop: 8 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title:       { fontSize: 16, fontWeight: '700' },
  closeBtn:    { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  searchWrap:  { paddingHorizontal: 14, paddingBottom: 4, position: 'relative' },
  searchIcon:  { position: 'absolute', left: 26, top: 11, zIndex: 1 },
  searchInput: { borderRadius: 12, borderWidth: 0.5, paddingVertical: 10, paddingLeft: 36, paddingRight: 14, fontSize: 14 },
  sectionLabel:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 0.5 },
  name:        { fontSize: 13, fontWeight: '600' },
  sub:         { fontSize: 11, marginTop: 2 },
  friendBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 0.5 },
  friendBadgeText: { fontSize: 11, fontWeight: '600' },
  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 0.5 },
  addBtnText:       { fontSize: 12, fontWeight: '600' },
  pendingDivider:   { width: 0.5, height: 12, marginHorizontal: 2 },
  empty:       { alignItems: 'center', gap: 8, paddingTop: 40 },
  emptyText:   { fontSize: 13 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topnav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  navTitle: { fontSize: 20, fontWeight: '700' },
  navSub: { fontSize: 12, marginTop: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, position: 'relative' },
  searchIcon: { position: 'absolute', left: 26, top: 21, zIndex: 1 },
  searchInput: {
    borderRadius: 12, borderWidth: 0.5, paddingVertical: 10,
    paddingLeft: 36, paddingRight: 14, fontSize: 14,
  },
  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
  },
  sectionLabelText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  onlineDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759',
  },
  onlineDotSmall: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#34C759', borderWidth: 1.5,
  },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 0.5,
  },
  friendName: { fontSize: 13, fontWeight: '600' },
  friendSub: { fontSize: 11, marginTop: 2 },
  friendGames: { fontSize: 10, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 10, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 0.5,
  },
  addBtnText: { fontSize: 12, fontWeight: '600' },
  pendingDivider: { width: 0.5, height: 12, marginHorizontal: 2 },
  emptyText: { fontSize: 12 },
});
