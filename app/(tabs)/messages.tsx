import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { Avatar } from '@/components/Avatar';
import { ReportBlockSheet } from '@/components/ReportBlockSheet';
import { FRIENDS } from '@/constants/Data';
import type { Thread } from '@/types';

export default function MessagesScreen() {
  const { colors, unread, setUnread, setActiveThread, threads, blockedUserIds, profileMode, findOrCreateDirectThread } = useApp();
  const FRIEND_IDS = new Set(profileMode === 'mock' ? FRIENDS.map(f => f.id) : []);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [optionsThread, setOptionsThread] = useState<Thread | null>(null);
  const [composeOpen,   setComposeOpen]   = useState(false);

  // Mark all read when screen mounts
  React.useEffect(() => { setUnread(0); }, []);

  const visibleThreads = threads.filter(t => !blockedUserIds.includes(t.who));

  const openThread = (thread: Thread) => {
    setActiveThread(thread);
    router.push(`/chat/${thread.id}`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg1 }]}>
      {/* Top nav */}
      <View style={[styles.topnav, { paddingTop: insets.top + 4, borderBottomColor: colors.br3 }]}>
        <View>
          <Text style={[styles.navTitle, { color: colors.tx1 }]}>Messages</Text>
          {unread > 0 && (
            <Text style={[styles.navSub, { color: colors.p1 }]}>{unread} unread</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.bg2 }]}
          onPress={() => setComposeOpen(true)}
        >
          <Ionicons name="create-outline" size={20} color={colors.tx2} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {visibleThreads.map(thread => {
          const isFriend = FRIEND_IDS.has(thread.who);
          return (
            <View key={thread.id} style={[styles.threadRow, { borderBottomColor: colors.br3 }]}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
                onPress={() => openThread(thread)}
              >
                {/* Avatar — system icon vs group icon vs single avatar */}
                {thread.who === 'system' ? (
                  <View style={[styles.groupAvatar, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
                    <Ionicons name="shield-checkmark-outline" size={22} color={colors.p1} />
                  </View>
                ) : thread.isGroup ? (
                  <View style={[styles.groupAvatar, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
                    <Ionicons name="people" size={22} color={colors.p1} />
                  </View>
                ) : (
                  <Avatar who={thread.who} size={48} />
                )}

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.threadName, { color: colors.tx1 }]}>{thread.name}</Text>
                    {thread.isGroup && (
                      <View style={[styles.groupTag, { backgroundColor: colors.bg3, borderColor: colors.br2 }]}>
                        <Text style={[styles.groupTagText, { color: colors.tx2 }]}>GROUP</Text>
                      </View>
                    )}
                    {!thread.isGroup && isFriend && (
                      <View style={[styles.friendTag, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
                        <Text style={[styles.friendTagText, { color: colors.p1 }]}>FRIEND</Text>
                      </View>
                    )}
                    <Text style={[styles.threadTime, { color: colors.tx3 }]}>{thread.time}</Text>
                  </View>
                  <Text
                    style={[
                      styles.threadLast,
                      { color: thread.unread > 0 ? colors.tx1 : colors.tx3 },
                      thread.unread > 0 && { fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                  >
                    {thread.last}
                  </Text>
                </View>
              </TouchableOpacity>

              {thread.unread > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.p1 }]}>
                  <Text style={styles.badgeText}>{thread.unread}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.optionsBtn}
                onPress={() => setOptionsThread(thread)}
              >
                <Ionicons
                  name={thread.isGroup ? 'flag-outline' : 'ellipsis-horizontal'}
                  size={16}
                  color={colors.tx3}
                />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Empty state for real accounts */}
        {profileMode === 'real' && visibleThreads.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.tx3 }]}>No messages yet</Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <ComposeModal
        visible={composeOpen}
        colors={colors}
        profileMode={profileMode}
        blockedUserIds={blockedUserIds}
        onClose={() => setComposeOpen(false)}
        onSelect={(id: string, name: string, who: string) => {
          setComposeOpen(false);
          findOrCreateDirectThread(id, name, who);
          router.push(`/chat/${id}`);
        }}
      />

      <ReportBlockSheet
        visible={!!optionsThread}
        onClose={() => setOptionsThread(null)}
        targetId={optionsThread?.who ?? ''}
        targetName={optionsThread?.name ?? ''}
        targetType={optionsThread?.isGroup ? 'broadcast' : 'user'}
        canBlock={!optionsThread?.isGroup}
        initialStep={optionsThread?.isGroup ? 'report-reasons' : 'action-menu'}
      />
    </View>
  );
}

// ── ComposeModal ──────────────────────────────────────────────────────────────
function ComposeModal({ visible, colors, profileMode, blockedUserIds, onClose, onSelect }: any) {
  const [search, setSearch] = useState('');
  const activeFriends = profileMode === 'mock' ? FRIENDS : [];

  const filtered = activeFriends
    .filter((f: typeof FRIENDS[0]) => !blockedUserIds.includes(f.id))
    .filter((f: typeof FRIENDS[0]) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.home.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[compose.sheet, { backgroundColor: colors.bg1 }]}>
        {/* Handle + header */}
        <View style={compose.handleRow}>
          <View style={[compose.handle, { backgroundColor: colors.br2 }]} />
        </View>
        <View style={[compose.header, { borderBottomColor: colors.br3 }]}>
          <Text style={[compose.title, { color: colors.tx1 }]}>New Message</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.tx2} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[compose.searchWrap, { borderBottomColor: colors.br3 }]}>
          <Ionicons name="search-outline" size={15} color={colors.tx3} style={compose.searchIcon} />
          <TextInput
            style={[compose.searchInput, { color: colors.tx1 }]}
            placeholder="Search friends…"
            placeholderTextColor={colors.tx3}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.tx3} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {filtered.length > 0
            ? filtered.map((f: typeof FRIENDS[0]) => (
                <TouchableOpacity
                  key={f.id}
                  style={[compose.row, { borderBottomColor: colors.br3 }]}
                  onPress={() => onSelect(f.id, f.name, f.who)}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <Avatar who={f.who} size={44} />
                    {f.online && (
                      <View style={[compose.onlineDot, { borderColor: colors.bg1 }]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[compose.rowName, { color: colors.tx1 }]}>{f.name}</Text>
                    <Text style={[compose.rowSub, { color: colors.tx3 }]}>{f.hcp} · {f.home}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.tx3} />
                </TouchableOpacity>
              ))
            : (
              <View style={compose.empty}>
                <Text style={[compose.emptyText, { color: colors.tx3 }]}>
                  {search ? `No friends matching "${search}"` : 'No friends yet — add some from Discover!'}
                </Text>
              </View>
            )
          }
        </ScrollView>
      </View>
    </Modal>
  );
}

const compose = StyleSheet.create({
  sheet:      { flex: 1 },
  handleRow:  { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:     { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  title:      { fontSize: 17, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  searchIcon:  { },
  searchInput: { flex: 1, fontSize: 15 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5,
  },
  rowName:   { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  rowSub:    { fontSize: 12 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#34C759', borderWidth: 1.5,
  },
  empty:     { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
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
  threadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5,
  },
  groupAvatar: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  threadName: { fontSize: 14, fontWeight: '600' },
  threadTime: { fontSize: 11, marginLeft: 'auto' },
  threadLast: { fontSize: 13 },
  groupTag: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5,
  },
  groupTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  friendTag: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5,
  },
  friendTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  optionsBtn:  { padding: 8, marginLeft: 4 },
  emptyState:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon:   { fontSize: 40, marginBottom: 12, textAlign: 'center' },
  emptyTitle:  { fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySub:    { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
