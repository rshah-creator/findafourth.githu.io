import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { Avatar } from '@/components/Avatar';
import { ReportBlockSheet } from '@/components/ReportBlockSheet';
import { PLAYERS, FRIENDS } from '@/constants/Data';
import type { Message } from '@/types';
import {
  loadMessagesFromSupabase,
  sendMessageToSupabase,
  subscribeToThreadMessages,
} from '@/lib/chat';

const ALL_PEOPLE = [...PLAYERS, ...FRIENDS];
function getSenderFirstName(who: string, senderName?: string): string {
  if (senderName) return senderName.split(' ')[0];
  const person = ALL_PEOPLE.find(p => p.id === who || p.who === who);
  return person ? person.name.split(' ')[0] : who;
}

export default function ChatScreen() {
  const { colors, activeThread, profileMode, supabaseUser } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const handleBack = () => {
    if (from === 'discover') {
      router.replace('/(tabs)/discover');
    } else if (from === 'friends') {
      router.replace('/(tabs)/friends');
    } else {
      // Default — always return to Messages (router.back() is unreliable with tab navigators)
      router.replace('/(tabs)/messages');
    }
  };

  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>(activeThread?.msgs ?? []);
  const [reportVisible, setReportVisible] = useState(false);

  // Load message history from Supabase in real mode
  useEffect(() => {
    if (profileMode !== 'real' || !supabaseUser || !activeThread) return;
    loadMessagesFromSupabase(activeThread.id, supabaseUser.id).then(loaded => {
      if (loaded.length > 0) setMessages(loaded);
    });
  }, [activeThread?.id]);

  // Subscribe to real-time new messages in real mode
  useEffect(() => {
    if (profileMode !== 'real' || !supabaseUser || !activeThread) return;
    const myId = supabaseUser.id;
    const channel = subscribeToThreadMessages(activeThread.id, row => {
      if (row.sender_id === myId) return; // already added optimistically
      const time = new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages(m => [...m, { id: row.id, from: row.sender_id, text: row.text, time }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => { channel.unsubscribe(); };
  }, [activeThread?.id]);

  // Only show messages from the user's join point onwards (privacy: new members can't see history)
  const joinedMsgIndex = activeThread?.joinedMsgIndex;
  const visibleMessages = joinedMsgIndex !== undefined && joinedMsgIndex > 0
    ? messages.slice(joinedMsgIndex)
    : messages;

  const send = () => {
    const t = text.trim();
    if (!t) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(m => [...m, { from: 'me', text: t, time: now }]);
    setText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    if (profileMode === 'real' && supabaseUser && activeThread) {
      sendMessageToSupabase(activeThread.id, supabaseUser.id, t).catch(console.warn);
    }
  };

  if (!activeThread) {
    handleBack();
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bg1 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4, borderBottomColor: colors.br3 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="chevron-back" size={24} color={colors.p1} />
        </TouchableOpacity>
        {activeThread.who === 'system' ? (
          <View style={[styles.groupAvatarHdr, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.p1} />
          </View>
        ) : activeThread.isGroup ? (
          <View style={[styles.groupAvatarHdr, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
            <Ionicons name="people" size={20} color={colors.p1} />
          </View>
        ) : (
          <Avatar who={activeThread.who} size={36} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.tx1 }]}>{activeThread.name}</Text>
          <Text style={[styles.headerSub, { color: colors.tx3 }]}>
            {activeThread.who === 'system'
              ? 'Community support'
              : activeThread.isGroup
              ? `${activeThread.crew?.length ?? 0} members`
              : 'Golf buddy'}
          </Text>
        </View>
        {activeThread.isGroup && (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.bg2 }]}
            onPress={() => setReportVisible(true)}
          >
            <Ionicons name="flag-outline" size={18} color={colors.tx3} />
          </TouchableOpacity>
        )}
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {/* "You joined this conversation" separator — shown when user joined mid-conversation */}
        {joinedMsgIndex !== undefined && joinedMsgIndex > 0 && (
          <View style={styles.joinSeparator}>
            <View style={[styles.joinSepLine, { backgroundColor: colors.br3 }]} />
            <Text style={[styles.joinSepText, { color: colors.tx3 }]}>You joined this conversation</Text>
            <View style={[styles.joinSepLine, { backgroundColor: colors.br3 }]} />
          </View>
        )}

        {visibleMessages.map((msg, i) => {
          const isMe     = msg.from === 'me';
          const isGroup  = activeThread.isGroup;
          const isSystem = msg.from === 'system';
          return (
            <View key={i} style={[styles.msgRow, isMe && styles.msgRowMe]}>
              {!isMe && (
                isSystem
                  ? <View style={[{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="shield-checkmark-outline" size={20} color="#7B4FD4" />
                    </View>
                  : <Avatar who={isGroup ? msg.from : activeThread.who} size={28} />
              )}
              <View style={isGroup && !isMe ? { flexShrink: 1 } : undefined}>
                {isGroup && !isMe && (
                  <Text style={[styles.senderName, { color: colors.tx3 }]}>
                    {getSenderFirstName(msg.from, msg.senderName)}
                  </Text>
                )}
                <View style={[
                  styles.bubble,
                  isMe
                    ? { backgroundColor: colors.p1 }
                    : { backgroundColor: colors.bg2, borderColor: colors.br3, borderWidth: 0.5 },
                ]}>
                  <Text style={[styles.bubbleText, { color: isMe ? 'white' : colors.tx1 }]}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, borderTopColor: colors.br3 }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.bg2, color: colors.tx1, borderColor: colors.br3 }]}
          placeholder="Message"
          placeholderTextColor={colors.tx3}
          value={text}
          onChangeText={setText}
          multiline
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.p1 : colors.bg3 }]}
          onPress={send}
          disabled={!text.trim()}
        >
          <Ionicons name="send" size={16} color={text.trim() ? 'white' : colors.tx3} />
        </TouchableOpacity>
      </View>
      <ReportBlockSheet
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetId={activeThread.id}
        targetName={activeThread.name}
        targetType="broadcast"
        initialStep="report-reasons"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  backBtn: { padding: 2 },
  headerName: { fontSize: 15, fontWeight: '700' },
  headerSub: { fontSize: 11 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupAvatarHdr: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center',
  },
  messageList: { padding: 14, gap: 10 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowMe: { flexDirection: 'row-reverse' },
  senderName: { fontSize: 10, marginBottom: 3, marginLeft: 2 },
  bubble: {
    maxWidth: '72%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 0.5,
  },
  input: {
    flex: 1, flexShrink: 1, minWidth: 0,
    borderRadius: 22, borderWidth: 0.5,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  joinSeparator: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginVertical: 12, paddingHorizontal: 4,
  },
  joinSepLine:  { flex: 1, height: 0.5 },
  joinSepText:  { fontSize: 11, fontWeight: '500' },
});
