import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Share, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/context/AppContext';
import { GRAD_COLORS } from '@/constants/Colors';
import { fetchNearbyProfiles } from '@/lib/auth';

type NearbyProfile = {
  id: string;
  first_name: string | null;
  last_name:  string | null;
  avatar_url: string | null;
  home_course: string | null;
};

export default function SocialConnectScreen() {
  const { colors, supabaseUser, socialProfileData } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [nearbyUsers, setNearbyUsers]   = useState<NearbyProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const firstName = socialProfileData?.firstName ?? supabaseUser?.user_metadata?.full_name?.split(' ')[0] ?? 'there';
  const city      = socialProfileData ? '' : ''; // city not yet known — populated after profile setup

  useEffect(() => {
    if (!supabaseUser) { setLoadingUsers(false); return; }
    fetchNearbyProfiles(city, supabaseUser.id)
      .then(data => setNearbyUsers(data as NearbyProfile[]))
      .finally(() => setLoadingUsers(false));
  }, [supabaseUser]);

  const handleInvite = async () => {
    await Share.share({
      message: `Hey! Join me on Find a Fourth — the best way to find golf partners. Download the app: https://findafourth.app`,
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg1, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome header */}
        <View style={styles.welcomeSection}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.pTint }]}>
            <Ionicons name="person" size={36} color={colors.p1} />
          </View>
          <Text style={[styles.welcomeTitle, { color: colors.tx1 }]}>
            Welcome, {firstName}! 👋
          </Text>
          <Text style={[styles.welcomeSub, { color: colors.tx2 }]}>
            Let's see who's already on the course.
          </Text>
        </View>

        {/* Friends on the app */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people-outline" size={16} color={colors.p1} />
            <Text style={[styles.sectionTitle, { color: colors.tx1 }]}>
              Golfers already on Find a Fourth
            </Text>
          </View>

          {loadingUsers ? (
            <ActivityIndicator color={colors.p1} style={{ paddingVertical: 20 }} />
          ) : nearbyUsers.length > 0 ? (
            nearbyUsers.map(u => (
              <View key={u.id} style={[styles.userRow, { borderTopColor: colors.br3 }]}>
                {u.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} style={styles.userAvatar} />
                ) : (
                  <View style={[styles.userAvatarPlaceholder, { backgroundColor: colors.bg3 }]}>
                    <Ionicons name="person" size={18} color={colors.tx3} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.userName, { color: colors.tx1 }]}>
                    {[u.first_name, u.last_name].filter(Boolean).join(' ')}
                  </Text>
                  {u.home_course && (
                    <Text style={[styles.userSub, { color: colors.tx3 }]}>{u.home_course}</Text>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="golf-outline" size={32} color={colors.br2} />
              <Text style={[styles.emptyTitle, { color: colors.tx2 }]}>
                Be the first from your city!
              </Text>
              <Text style={[styles.emptySub, { color: colors.tx3 }]}>
                Invite your golf buddies below to start building your crew.
              </Text>
            </View>
          )}
        </View>

        {/* Invite section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.br3 }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="share-social-outline" size={16} color={colors.p1} />
            <Text style={[styles.sectionTitle, { color: colors.tx1 }]}>
              Invite your golf buddies
            </Text>
          </View>
          <Text style={[styles.inviteDesc, { color: colors.tx2 }]}>
            Share Find a Fourth with friends and connections so you can match up for rounds.
          </Text>
          <TouchableOpacity
            style={[styles.inviteBtn, { borderColor: colors.pBorder, backgroundColor: colors.pTint }]}
            onPress={handleInvite}
          >
            <Ionicons name="share-outline" size={16} color={colors.p1} />
            <Text style={[styles.inviteBtnText, { color: colors.p1 }]}>Share invite link</Text>
          </TouchableOpacity>
        </View>

        {/* CTA */}
        <LinearGradient
          colors={GRAD_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaBtn}
        >
          <TouchableOpacity
            style={styles.ctaBtnInner}
            onPress={() => router.push('/profile-setup')}
          >
            <Text style={styles.ctaBtnText}>Set up your golf profile →</Text>
          </TouchableOpacity>
        </LinearGradient>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:   { flex: 1 },
  content:  { paddingHorizontal: 20, paddingTop: 24, gap: 16 },

  welcomeSection: { alignItems: 'center', gap: 10, paddingBottom: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  welcomeSub:   { fontSize: 14, textAlign: 'center' },

  section: { borderRadius: 16, borderWidth: 0.5, overflow: 'hidden', padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle:  { fontSize: 14, fontWeight: '700' },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 0.5 },
  userAvatar: { width: 40, height: 40, borderRadius: 20 },
  userAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  userName: { fontSize: 13, fontWeight: '600' },
  userSub:  { fontSize: 11, marginTop: 2 },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  emptyTitle: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  emptySub:   { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  inviteDesc:    { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, borderWidth: 0.5, paddingVertical: 12,
  },
  inviteBtnText: { fontSize: 14, fontWeight: '600' },

  ctaBtn:      { borderRadius: 16, overflow: 'hidden' },
  ctaBtnInner: { alignItems: 'center', paddingVertical: 16 },
  ctaBtnText:  { color: 'white', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

});
