import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  TouchableOpacity, Animated, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { Stars } from '@/components/Stars';
import { StatBox } from '@/components/StatBox';
import { useApp } from '@/context/AppContext';
import { ReportBlockSheet } from '@/components/ReportBlockSheet';
import type { Player, Friend } from '@/types';

type PlayerLike = Player | Friend;

interface Props {
  visible: boolean;
  player: PlayerLike | null;
  onClose: () => void;
  onMessage?: () => void;
  onBroadcastWith?: () => void;
  /** true = show prompt to block after reporting (Friends context); false = report only (Discover context) */
  canBlock?: boolean;
}

export function PlayerSheet({ visible, player, onClose, onMessage, onBroadcastWith, canBlock = false }: Props) {
  const { colors, phase } = useApp();
  const insets = useSafeAreaInsets();
  const [reportVisible, setReportVisible] = useState(false);

  if (!player) return null;

  const home = phase === 'pro'
    ? (('homePro' in player && player.homePro) || player.home)
    : player.home;

  const rating = 'rating' in player ? player.rating : undefined;

  return (
    <>
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.bg1, paddingBottom: insets.bottom + 16 }]}>
        {/* Handle + close + flag */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: colors.br2 }]} />
          <TouchableOpacity style={styles.flagBtn} onPress={() => setReportVisible(true)}>
            <Ionicons name="flag-outline" size={18} color={colors.tx3} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={colors.tx3} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.br3 }]}>
            <Avatar
              who={player.who}
              uri={'avatar_url' in player && player.avatar_url && player.avatar_url.startsWith('http') ? player.avatar_url : undefined}
              initials={player.name?.charAt(0).toUpperCase()}
              size={84}
              ring
            />
            <Text style={[styles.name, { color: colors.tx1 }]}>{player.name}</Text>
            <Text style={[styles.sub, { color: colors.tx2 }]}>Home: {home}</Text>
            {rating != null && (
              <View style={styles.ratingRow}>
                <Stars value={rating} size={14} />
                <Text style={[styles.ratingVal, { color: colors.tx1 }]}>{rating}</Text>
                <Text style={[styles.ratingSub, { color: colors.tx3 }]}>· 18 rounds</Text>
              </View>
            )}
          </View>

          {/* Stats grid */}
          <View style={styles.grid}>
            <View style={styles.gridCell}>
              <StatBox label="Handicap" value={player.hcp.replace('Hcp ', '')} />
            </View>
            <View style={styles.gridCell}>
              <StatBox label="Pace" value={('pace' in player && player.pace) || '—'} small />
            </View>
            <View style={styles.gridCell}>
              <StatBox label="Cart" value={('cart' in player && player.cart) || '—'} small />
            </View>
            <View style={styles.gridCell}>
              <StatBox label="Tees" value={player.tees || 'Blue'} small />
            </View>
            <View style={styles.gridCell}>
              <StatBox label="Music" value={('music' in player && player.music) || '—'} small />
            </View>
          </View>

          {/* Bio */}
          {('bio' in player && player.bio) ? (
            <View style={[styles.bio, { backgroundColor: colors.bg2 }]}>
              <Text style={[styles.bioLabel, { color: colors.p1 }]}>BIO</Text>
              <Text style={[styles.bioText, { color: colors.tx1 }]}>{player.bio}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            {onMessage && (
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, { borderColor: colors.br2 }]}
                onPress={onMessage}
              >
                <Ionicons name="chatbubble-outline" size={16} color={colors.tx1} />
                <Text style={[styles.btnText, { color: colors.tx1 }]}>Message</Text>
              </TouchableOpacity>
            )}
            {onBroadcastWith && (
              <TouchableOpacity
                style={[styles.btn, styles.btnGrad]}
                onPress={onBroadcastWith}
              >
                <Ionicons name="radio-outline" size={16} color="white" />
                <Text style={[styles.btnText, { color: 'white' }]}>Broadcast with</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>

    {/* Report sheet — stacked modal */}
    <ReportBlockSheet
      visible={reportVisible}
      onClose={() => setReportVisible(false)}
      targetId={player.id}
      targetName={player.name}
      targetType="user"
      canBlock={canBlock}
      initialStep="report-reasons"
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 12,
    padding: 4,
  },
  flagBtn: {
    position: 'absolute',
    left: 16,
    top: 12,
    padding: 4,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    marginHorizontal: 20,
    borderBottomWidth: 0.5,
    gap: 4,
  },
  name: {
    fontSize: 19,
    fontWeight: '700',
    marginTop: 8,
  },
  sub: {
    fontSize: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  ratingVal: {
    fontSize: 14,
    fontWeight: '600',
  },
  ratingSub: {
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    margin: 16,
  },
  gridCell: {
    width: '47%',
  },
  bio: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 14,
  },
  bioLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
  },
  btnGhost: {
    borderWidth: 0.5,
  },
  btnGrad: {
    backgroundColor: '#7B4FD4',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
