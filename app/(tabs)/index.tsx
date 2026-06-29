/**
 * Profile tab — the user's own profile.
 * Logged-in user is "Yousef" (Hcp 14, DHA Raya GC).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Modal, Alert, ActivityIndicator,
  TouchableOpacity, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useApp } from '@/context/AppContext';
import { CircularCropModal } from '@/components/CircularCropModal';
import { Avatar } from '@/components/Avatar';
import { StatBox } from '@/components/StatBox';
import { SectionLabel } from '@/components/SectionLabel';
import { Stars } from '@/components/Stars';
import { Toggle } from '@/components/Toggle';
import { BrandMark } from '@/components/BrandMark';
import { WheelPicker, HCP_OPTIONS, FIELD_OPTIONS, FIELD_LABELS } from '@/components/WheelPicker';
import { GRAD_COLORS } from '@/constants/Colors';
import { VENUES, FRIENDS, getVenuesForCity } from '@/constants/Data';
import { moderateImage } from '@/lib/moderateImage';
import { uploadAvatar, saveProfileToSupabase } from '@/lib/auth';
import { IS_DEV_BUILD } from '@/lib/appVariant';
import type { Phase } from '@/types';

export default function ProfileScreen() {
  const {
    colors, dark, setDark, phase, setPhase,
    homeCourse, setHomeCourse, homeCourses,
    profileName, setProfileName,
    profileCity,
    profileImageUri, setProfileImageUri,
    profileStats, setProfileStats,
    availSchedule, setAvailSchedule,
    loadMockProfile, loadRealProfile, profileMode,
    loadMockBroadcastAs,
    simulatePendingJoin, simulateRejection,
    supabaseUser,
    roundsPlayed, receivedRatings,
    simulateRoundInProgress, simulateRoundCompleted,
    notifyRateReminder, hasSubmittedRatings,
    myActiveGame,
    notificationPrefs, setNotificationPrefs, pushToken, requestPushPermission,
    availableNow, availableUntil, setAvailable,
  } = useApp();

  // Derive rating from receivedRatings
  const meId = profileMode === 'mock' ? 'yousef' : (supabaseUser?.id ?? null);
  const myRatingData  = meId ? (receivedRatings[meId] ?? null) : null;
  const myRatingAvg   = myRatingData && myRatingData.count > 0
    ? (myRatingData.total / myRatingData.count).toFixed(1)
    : null;
  const myRatingCount = myRatingData?.count ?? 0;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Countdown display — re-renders every minute while available
  const [, forceCountdownUpdate] = useState(0);
  useEffect(() => {
    if (!availableNow) return;
    const id = setInterval(() => forceCountdownUpdate(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, [availableNow]);

  const countdownLabel = (() => {
    if (!availableUntil) return '';
    const ms = availableUntil - Date.now();
    if (ms <= 0) return '';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `On — Turns off in ${h}h ${m}m` : `On — Turns off in ${m}m`;
  })();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editAvailOpen, setEditAvailOpen] = useState(false);
  const [pendingCropUri, setPendingCropUri] = useState<string | null>(null);
  const [moderating,     setModerating]     = useState(false);

  const resetOnboarding = async () => {
    await AsyncStorage.removeItem('f4f_onboarding_done');
    router.replace('/onboarding');
  };

  const pickProfileImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,   // We handle cropping ourselves with a circular UI
      quality: 1,
    });
    if (!result.canceled) {
      setPendingCropUri(result.assets[0].uri);
    }
  };


  return (
    <View style={[styles.screen, { backgroundColor: colors.bg1 }]}>
      {/* Top nav */}
      <View style={[styles.topnav, { paddingTop: insets.top + 4, borderBottomColor: colors.br3 }]}>
        <Text style={[styles.navTitle, { color: colors.tx1 }]}>Profile</Text>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.bg2 }]}
          onPress={() => setSettingsOpen(true)}
        >
          <Ionicons name="settings-outline" size={20} color={colors.tx2} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={[styles.hero, { backgroundColor: colors.bg2 }]}>
          {/* BrandMark — top-left absolute */}
          <View style={styles.heroLogo}><BrandMark /></View>

          {/* Avatar with tappable edit badge */}
          <TouchableOpacity style={styles.avatarWrap} onPress={pickProfileImage} activeOpacity={0.8}>
            {profileImageUri ? (
              <View style={[styles.avatarCircle, { borderColor: colors.br2 }]}>
                <Image
                  source={{ uri: profileImageUri }}
                  style={styles.avatarImg}
                  resizeMode="cover"
                />
              </View>
            ) : profileMode === 'mock' ? (
              <Avatar who="yousef" size={160} ring ringColor={colors.br2} />
            ) : (
              <View style={[styles.avatarCircle, styles.avatarPlaceholder, { borderColor: colors.br2, backgroundColor: colors.bg3 }]}>
                <Ionicons name="person" size={72} color={colors.br2} />
              </View>
            )}
            <View style={[styles.editBadge, { backgroundColor: colors.p1, borderColor: colors.bg2 }]}>
              <Ionicons name="camera" size={12} color="white" />
            </View>
          </TouchableOpacity>

          {/* Name + location */}
          <Text style={[styles.heroName, { color: colors.tx1 }]}>{profileName}</Text>
          {(profileCity || profileMode === 'mock') ? (
            <Text style={[styles.heroSub, { color: colors.tx2 }]}>{profileCity}</Text>
          ) : null}

          {/* PRO badge — pro phase only */}
          {phase === 'pro' && (
            <LinearGradient
              colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.proBadge}
            >
              <Ionicons name="sparkles" size={11} color="white" />
              <Text style={styles.proBadgeText}>PRO</Text>
            </LinearGradient>
          )}

          {/* Stats row */}
          <View style={[styles.statsRow, { borderTopColor: colors.br3 }]}>
            {/* Rating */}
            <View style={styles.statCell}>
              {myRatingAvg ? (
                <>
                  <Text style={[styles.statValue, { color: colors.p1 }]}>{myRatingAvg}</Text>
                  <Stars value={parseFloat(myRatingAvg)} size={11} color={colors.p1} />
                  <Text style={[styles.statLabel, { color: colors.tx3 }]}>
                    {myRatingCount} rating{myRatingCount !== 1 ? 's' : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.statValue, { color: colors.tx3 }]}>—</Text>
                  <Text style={[styles.statLabel, { color: colors.tx3, marginTop: 6 }]}>ratings</Text>
                </>
              )}
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.br2 }]} />
            {/* Rounds */}
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: roundsPlayed > 0 ? colors.tx1 : colors.tx3 }]}>
                {roundsPlayed > 0 ? String(roundsPlayed) : '—'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.tx3, marginTop: 6 }]}>rounds</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.br2 }]} />
            {/* Friends */}
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.tx1 }]}>
                {profileMode === 'mock' ? String(FRIENDS.length) : '0'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.tx3, marginTop: 6 }]}>friends</Text>
            </View>
          </View>
        </View>

        {/* ── Availability toggle ── */}
        <View style={[styles.availRow, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
          <View style={styles.availLeft}>
            <View style={[styles.availDot, { backgroundColor: availableNow ? colors.green : colors.br2 }]} />
            <View>
              <Text style={[styles.availText, { color: colors.tx1 }]}>
                Available now for games
              </Text>
              <Text style={[styles.availSub, { color: availableNow ? colors.p1 : colors.tx3 }]}>
                {availableNow ? countdownLabel : "Off — Won't appear in Discover"}
              </Text>
            </View>
          </View>
          <Toggle on={availableNow} onChange={setAvailable} color={colors.green} />
        </View>

        {/* ── Golf profile stats ── */}
        <SectionLabel>Golf profile</SectionLabel>
        <View style={styles.grid}>
          <View style={styles.gridCell}><StatBox label="Handicap" value={profileStats.handicap} small /></View>
          <View style={styles.gridCell}><StatBox label="Tees"     value={profileStats.tees}     small /></View>
          <View style={styles.gridCell}><StatBox label="Pace"     value={profileStats.pace}     small /></View>
          <View style={styles.gridCell}><StatBox label="Cart"     value={profileStats.cart}     small /></View>
          <View style={styles.gridCell}><StatBox label="Partners" value={profileStats.partners} small /></View>
          <View style={styles.gridCell}><StatBox label="Music"    value={profileStats.music}    small /></View>
        </View>

        {/* ── Home course(s) — phase-gated ── */}
        <SectionLabel>{phase === 'pro' ? 'Home courses' : 'Home course'}</SectionLabel>
        {phase === 'pro' ? (
          <>
            {homeCourses.map((c, i) => (
              <CourseRow key={c} name={c} sub={i === 0 ? 'Primary' : 'Secondary'} colors={colors} />
            ))}
            <TouchableOpacity style={[styles.addRow, { borderBottomColor: colors.br3 }]}>
              <Ionicons name="add-circle-outline" size={18} color={colors.p1} />
              <Text style={[styles.addRowText, { color: colors.p1 }]}>Add another course</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <CourseRow name={homeCourse} sub="Member" colors={colors} />
            <View style={styles.courseHintRow}>
              <Ionicons name="information-circle-outline" size={13} color={colors.tx3} />
              <Text style={[styles.courseHint, { color: colors.tx3 }]}>Broadcast here · join games anywhere</Text>
            </View>
          </>
        )}

        {/* ── Phase-gated sections ── */}
        {phase === 'pro'     && <ProDashboard colors={colors} />}
        {phase === 'freePro' && <ProUpsellBanner colors={colors} />}

        {/* ── Availability schedule ── */}
        <SectionLabel>Availability</SectionLabel>
        <View style={[styles.scheduleCard, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
          {availSchedule.map((entry, i) => (
            <React.Fragment key={entry.day}>
              {i > 0 && <View style={[styles.schedDivider, { backgroundColor: colors.br3 }]} />}
              <ScheduleRow day={entry.day} times={entry.times} colors={colors} />
            </React.Fragment>
          ))}
        </View>
        <View style={styles.editBtnRow}>
          <TouchableOpacity style={[styles.editAvailBtn, { borderColor: colors.br2, flex: 1 }]} onPress={() => setEditAvailOpen(true)}>
            <Ionicons name="calendar-outline" size={14} color={colors.tx3} />
            <Text style={[styles.editAvailText, { color: colors.tx3 }]}>Edit availability</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.editAvailBtn, { borderColor: colors.br2, flex: 1 }]}
            onPress={() => setEditProfileOpen(true)}
          >
            <Ionicons name="pencil-outline" size={14} color={colors.tx3} />
            <Text style={[styles.editAvailText, { color: colors.tx3 }]}>Edit profile</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Edit profile modal ── */}
      <EditProfileModal
        visible={editProfileOpen}
        data={{ ...profileStats, homeCourse }}
        phase={phase}
        profileCity={profileCity}
        onSave={updated => {
          const { homeCourse: newCourse, ...rest } = updated;
          setProfileStats(rest as typeof profileStats);
          if (newCourse) setHomeCourse(newCourse);
          setEditProfileOpen(false);
        }}
        onClose={() => setEditProfileOpen(false)}
        colors={colors}
        insets={insets}
      />

      {/* ── Edit availability modal ── */}
      <EditAvailabilityModal
        visible={editAvailOpen}
        availSchedule={availSchedule}
        onSave={newSchedule => {
          setAvailSchedule(newSchedule);
          setEditAvailOpen(false);
        }}
        onClose={() => setEditAvailOpen(false)}
        colors={colors}
        insets={insets}
      />

      {/* ── Circular crop modal ── */}
      <CircularCropModal
        uri={pendingCropUri}
        onConfirm={async croppedUri => {
          setPendingCropUri(null);    // close crop modal immediately
          setModerating(true);
          const { safe, reason } = await moderateImage(croppedUri);
          setModerating(false);
          if (!safe) {
            Alert.alert(
              'Image not allowed',
              `This image contains ${reason ?? 'inappropriate content'} and can't be used as a profile picture. Please choose a different photo.`,
            );
            return;
          }
          // Upload to Storage so the new avatar is visible on other devices,
          // and persist the public URL to Supabase. Falls back to the local
          // URI if upload fails (still shows on this device).
          if (profileMode === 'real' && supabaseUser) {
            const publicUrl = (await uploadAvatar(supabaseUser.id, croppedUri)) ?? croppedUri;
            setProfileImageUri(publicUrl);
            saveProfileToSupabase(supabaseUser.id, { avatar_url: publicUrl }).catch(console.warn);
          } else {
            setProfileImageUri(croppedUri);
          }
        }}
        onCancel={() => setPendingCropUri(null)}
      />

      {/* ── Content moderation loading overlay ── */}
      {moderating && (
        <View style={[StyleSheet.absoluteFill, styles.moderatingOverlay]}>
          <ActivityIndicator size="large" color="#7B4FD4" />
          <Text style={styles.moderatingText}>Checking image…</Text>
        </View>
      )}

      {/* ── Settings modal ── */}
      <Modal
        visible={settingsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <SettingsSheet
          colors={colors}
          dark={dark}
          setDark={setDark}
          phase={phase}
          setPhase={setPhase}
          onReset={resetOnboarding}
          onMockProfile={() => { loadMockProfile(); setSettingsOpen(false); }}
          onRealProfile={() => { loadRealProfile(); setSettingsOpen(false); }}
          profileMode={profileMode}
          onBroadcastPerspective={(role: 'initiator' | 'pending' | 'confirmed') => {
            loadMockBroadcastAs(role); setSettingsOpen(false);
          }}
          onSimulatePendingJoin={() => { simulatePendingJoin(); setSettingsOpen(false); }}
          onSimulateRejection={() => { simulateRejection(); setSettingsOpen(false); }}
          onSimulateRoundInProgress={() => { simulateRoundInProgress(); setSettingsOpen(false); }}
          onSimulateRoundCompleted={() => { simulateRoundCompleted(); setSettingsOpen(false); }}
          onSimulateRateReminder={() => {
            if (myActiveGame) notifyRateReminder(myActiveGame.id, myActiveGame.title, myActiveGame.venue);
            setSettingsOpen(false);
          }}
          onSimulateInstantPush={async () => {
            const { scheduleLocalPush: push, NOTIF_CATEGORY: CAT } = await import('@/lib/notifications');
            push('Test notification', 'Push notifications are working correctly.', CAT.GAMES, { screen: 'broadcast' }, 0);
            setSettingsOpen(false);
          }}
          onNotifications={() => { setSettingsOpen(false); setNotifSettingsOpen(true); }}
          onClose={() => setSettingsOpen(false)}
          insets={insets}
        />
      </Modal>

      {/* ── Notification settings modal ── */}
      <NotificationsSettingsSheet
        visible={notifSettingsOpen}
        colors={colors}
        insets={insets}
        notifPrefs={notificationPrefs}
        setNotifPrefs={setNotificationPrefs}
        pushToken={pushToken}
        onRequestPermission={requestPushPermission}
        onClose={() => setNotifSettingsOpen(false)}
      />
    </View>
  );
}

// ── CourseRow ─────────────────────────────────────────────────────────────────
function CourseRow({ name, sub, colors }: { name: string; sub: string; colors: any }) {
  return (
    <View style={[styles.courseRow, { borderBottomColor: colors.br3 }]}>
      <Ionicons name="golf-outline" size={16} color={colors.p1} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.courseText, { color: colors.tx1 }]}>{name}</Text>
        <Text style={[styles.courseSub, { color: colors.tx3 }]}>{sub}</Text>
      </View>
    </View>
  );
}

// ── ScheduleRow ───────────────────────────────────────────────────────────────
function ScheduleRow({ day, times, colors }: { day: string; times: string[]; colors: any }) {
  return (
    <View style={styles.schedRow}>
      <Text style={[styles.schedDay, { color: colors.tx2 }]}>{day}</Text>
      <Text style={[styles.schedTime, { color: colors.tx1 }]}>{times.join(' · ')}</Text>
    </View>
  );
}

// ── ProDashboard ──────────────────────────────────────────────────────────────
function ProDashboard({ colors }: { colors: any }) {
  return (
    <>
      <SectionLabel>Pro</SectionLabel>
      <View style={[styles.proCard, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}>
        <View style={styles.proGrid}>
          <View style={[styles.proCell, { backgroundColor: colors.bg1, borderColor: colors.pBorder }]}>
            <Text style={[styles.proCellLabel, { color: colors.p1 }]}>BOOSTS LEFT</Text>
            <Text style={[styles.proCellValue, { color: colors.pDark }]}>3</Text>
          </View>
          <View style={[styles.proCell, { backgroundColor: colors.bg1, borderColor: colors.pBorder }]}>
            <Text style={[styles.proCellLabel, { color: colors.p1 }]}>RANGE</Text>
            <Text style={[styles.proCellValueSm, { color: colors.pDark }]}>All Pakistan</Text>
          </View>
        </View>
        <View style={styles.proFeatures}>
          <ProFeatureRow text="Multiple home courses active" colors={colors} />
          <ProFeatureRow text="Broadcast at multiple clubs at once" colors={colors} />
        </View>
      </View>
    </>
  );
}

function ProFeatureRow({ text, colors }: { text: string; colors: any }) {
  return (
    <View style={styles.proFeatureRow}>
      <Ionicons name="checkmark" size={14} color={colors.p1} />
      <Text style={[styles.proFeatureText, { color: colors.pDark }]}>{text}</Text>
    </View>
  );
}

// ── ProUpsellBanner ───────────────────────────────────────────────────────────
const UPSELL_FEATURES = [
  ['Multiple home courses',   'Broadcast from any of your clubs'],
  ['3 boosts per week',       'Pin your game to top of Discover'],
  ['Broadcast across cities', 'Reach players in Karachi & more'],
  ['Multi-club broadcasts',   'Maximise your foursome chances'],
] as const;

function ProUpsellBanner({ colors }: { colors: any }) {
  return (
    <View style={[styles.upsellWrap, { borderColor: colors.pBorder }]}>
      <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.upsellHead}>
        <View style={styles.upsellPill}>
          <Text style={styles.upsellPillText}>PRO</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.upsellHeadTitle}>Unlock Find a Fourth Pro</Text>
          <Text style={styles.upsellHeadSub}>More reach. More games.</Text>
        </View>
      </LinearGradient>

      <View style={[styles.upsellBody, { backgroundColor: colors.pTint }]}>
        {UPSELL_FEATURES.map(([title, sub], i) => (
          <View
            key={i}
            style={[
              styles.upsellFeature,
              i < UPSELL_FEATURES.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.pBorder },
            ]}
          >
            <Ionicons name="lock-closed" size={14} color={colors.p1} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.upsellFeatureTitle, { color: colors.pDark }]}>{title}</Text>
              <Text style={[styles.upsellFeatureSub, { color: colors.p1 }]}>{sub}</Text>
            </View>
          </View>
        ))}
        <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.upsellBtn}>
          <TouchableOpacity style={styles.upsellBtnInner}>
            <Text style={styles.upsellBtnText}>Upgrade to Pro</Text>
            <Ionicons name="arrow-up-circle-outline" size={16} color="white" />
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );
}

// ── EditProfileModal ──────────────────────────────────────────────────────────
// Home course shown for free/freePro only; pro manages courses via profile screen
const FIELDS_FREE     = ['homeCourse', 'handicap', 'tees', 'pace', 'cart', 'partners', 'music'];
const FIELDS_PRO      = ['handicap', 'tees', 'pace', 'cart', 'partners', 'music'];

function EditProfileModal({ visible, data, phase, profileCity, onSave, onClose, colors, insets }: any) {
  const [activeField, setActiveField] = useState<string | null>(null);
  const [tempValue,   setTempValue]   = useState('');
  const FIELDS = phase === 'pro' ? FIELDS_PRO : FIELDS_FREE;

  const openField = (field: string) => {
    setTempValue(data[field]);
    setActiveField(field);
  };

  const saveField = () => {
    onSave({ ...data, [activeField!]: tempValue });
    setActiveField(null);
  };

  // Reset activeField when modal closes
  const handleClose = () => { setActiveField(null); onClose(); };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[epStyles.container, { backgroundColor: colors.bg1 }]}>
        {/* Header */}
        <View style={[epStyles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.br3 }]}>
          <TouchableOpacity onPress={activeField ? () => setActiveField(null) : handleClose} style={epStyles.headerSide}>
            {activeField
              ? <Ionicons name="chevron-back" size={22} color={colors.p1} />
              : <Text style={[epStyles.headerAction, { color: colors.p1 }]}>Cancel</Text>
            }
          </TouchableOpacity>
          <Text style={[epStyles.headerTitle, { color: colors.tx1 }]}>
            {activeField ? FIELD_LABELS[activeField] : 'Edit Profile'}
          </Text>
          <TouchableOpacity
            onPress={activeField ? saveField : undefined}
            style={epStyles.headerSide}
          >
            {activeField
              ? <Text style={[epStyles.headerAction, { color: colors.p1, fontWeight: '700' }]}>Save</Text>
              : null
            }
          </TouchableOpacity>
        </View>

        {/* Field list */}
        {!activeField && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {FIELDS.map(field => (
              <TouchableOpacity
                key={field}
                style={[epStyles.fieldRow, { borderBottomColor: colors.br3 }]}
                onPress={() => openField(field)}
              >
                <Text style={[epStyles.fieldLabel, { color: colors.tx2 }]}>{FIELD_LABELS[field]}</Text>
                <View style={epStyles.fieldRight}>
                  <Text style={[epStyles.fieldValue, { color: colors.tx1 }]}>{data[field]}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.tx3} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Handicap scroll wheel */}
        {activeField === 'handicap' && (
          <WheelPicker
            items={HCP_OPTIONS}
            value={tempValue}
            onChange={setTempValue}
            colors={colors}
          />
        )}

        {/* Option list for homeCourse and all non-handicap fields */}
        {activeField && activeField !== 'handicap' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {(activeField === 'homeCourse' ? getVenuesForCity(profileCity ?? '') : FIELD_OPTIONS[activeField]).map(option => {
              const selected = tempValue === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    epStyles.optionRow,
                    { borderBottomColor: colors.br3 },
                    selected && { backgroundColor: colors.pTint },
                  ]}
                  onPress={() => setTempValue(option)}
                >
                  <Text style={[
                    epStyles.optionText,
                    { color: selected ? colors.p1 : colors.tx1 },
                    selected && { fontWeight: '600' },
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const epStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 0.5,
  },
  headerSide:   { width: 72 },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  headerAction: { fontSize: 16 },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  fieldLabel: { fontSize: 16 },
  fieldRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValue: { fontSize: 16, fontWeight: '500' },

  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 0.5,
  },
  optionText: { fontSize: 17 },
});

// ── EditAvailabilityModal ─────────────────────────────────────────────────────
const AVAIL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AVAIL_FULL_DAYS: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};
const AVAIL_SHORT_DAYS: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};
const AVAIL_TIME_WINDOWS = ['5–9am', '9am–12pm', '12–4pm', '4–6pm'];
const AVAIL_TIME_MAP: Record<string, string> = {
  '5–9am': '5am – 9am', '9am–12pm': '9am – 12pm',
  '12–4pm': '12pm – 4pm', '4–6pm': '4pm – 6pm',
};
const AVAIL_TIME_MAP_REV: Record<string, string> = {
  '5am – 9am': '5–9am', '9am – 12pm': '9am–12pm',
  '12pm – 4pm': '12–4pm', '4pm – 6pm': '4–6pm',
};

function EditAvailabilityModal({ visible, availSchedule, onSave, onClose, colors, insets }: any) {
  // Convert context format (full names) → local short-name format on open
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [availEntries, setAvailEntries] = useState<{ day: string; windows: string[] }[]>([]);

  // Re-initialise whenever the modal opens
  React.useEffect(() => {
    if (!visible) return;
    const entries = (availSchedule ?? []).map((e: any) => ({
      day: AVAIL_SHORT_DAYS[e.day] ?? e.day,
      windows: (e.times ?? []).map((t: string) => AVAIL_TIME_MAP_REV[t] ?? t),
    }));
    setAvailEntries(entries);
    setSelectedDays(entries.map((e: any) => e.day));
  }, [visible]);

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(prev => prev.filter(d => d !== day));
      setAvailEntries(prev => prev.filter(e => e.day !== day));
    } else {
      setSelectedDays(prev => [...prev, day]);
      setAvailEntries(prev => [...prev, { day, windows: ['9am–12pm'] }]);
    }
  };

  const toggleWindow = (day: string, window: string) => {
    setAvailEntries(prev => prev.map(e => {
      if (e.day !== day) return e;
      const has = e.windows.includes(window);
      const next = has ? e.windows.filter(w => w !== window) : [...e.windows, window];
      return { ...e, windows: next.length > 0 ? next : e.windows };
    }));
  };

  const getWindows = (day: string) =>
    availEntries.find(e => e.day === day)?.windows ?? ['9am–12pm'];

  const handleSave = () => {
    onSave(
      availEntries.map(e => ({
        day: AVAIL_FULL_DAYS[e.day] ?? e.day,
        times: e.windows.map(w => AVAIL_TIME_MAP[w] ?? w),
      }))
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[epStyles.container, { backgroundColor: colors.bg1 }]}>
        {/* Header */}
        <View style={[epStyles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.br3 }]}>
          <TouchableOpacity onPress={onClose} style={epStyles.headerSide}>
            <Text style={[epStyles.headerAction, { color: colors.p1 }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[epStyles.headerTitle, { color: colors.tx1 }]}>Availability</Text>
          <TouchableOpacity onPress={handleSave} style={epStyles.headerSide}>
            <Text style={[epStyles.headerAction, { color: colors.p1, fontWeight: '700', textAlign: 'right' }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
          <Text style={[eavStyles.sub, { color: colors.tx2 }]}>
            Select the days and time windows you're usually free for a round.
          </Text>

          {/* Day chips */}
          <View style={eavStyles.dayRow}>
            {AVAIL_DAYS.map(day => {
              const sel = selectedDays.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  style={[eavStyles.dayChip, { borderColor: colors.br2, backgroundColor: colors.bg2 },
                    sel && { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[eavStyles.dayChipText, { color: sel ? colors.p1 : colors.tx2 },
                    sel && { fontWeight: '700' }]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Time window rows */}
          {AVAIL_DAYS.filter(d => selectedDays.includes(d)).map(day => (
            <View key={day} style={[eavStyles.timeRow, { borderTopColor: colors.br3 }]}>
              <Text style={[eavStyles.timeRowLabel, { color: colors.tx2 }]}>{AVAIL_FULL_DAYS[day]}</Text>
              <View style={eavStyles.timeChipRow}>
                {AVAIL_TIME_WINDOWS.map(w => {
                  const sel = getWindows(day).includes(w);
                  return (
                    <TouchableOpacity
                      key={w}
                      style={[eavStyles.timeChip, { borderColor: colors.br2, backgroundColor: colors.bg2 },
                        sel && { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}
                      onPress={() => toggleWindow(day, w)}
                    >
                      <Text style={[eavStyles.timeChipText, { color: sel ? colors.p1 : colors.tx2 },
                        sel && { fontWeight: '700' }]}>
                        {w}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {selectedDays.length === 0 && (
            <Text style={[eavStyles.emptyHint, { color: colors.tx3 }]}>
              Tap a day above to add it to your schedule.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const eavStyles = StyleSheet.create({
  sub:          { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  dayRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  dayChip:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5 },
  dayChipText:  { fontSize: 13 },
  timeRow:      { paddingTop: 12, marginTop: 8, borderTopWidth: 0.5 },
  timeRowLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  timeChipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 0.5 },
  timeChipText: { fontSize: 12 },
  emptyHint:    { fontSize: 13, marginTop: 20, textAlign: 'center' },
});

// ── SettingsSheet ─────────────────────────────────────────────────────────────
function SettingsSheet({ colors, dark, setDark, phase, setPhase, onReset, onMockProfile, onRealProfile, profileMode, onBroadcastPerspective, onSimulatePendingJoin, onSimulateRejection, onSimulateRoundInProgress, onSimulateRoundCompleted, onSimulateRateReminder, onSimulateInstantPush, onNotifications, onClose, insets }: any) {
  return (
    <View style={[settingsStyles.sheet, { backgroundColor: colors.bg1 }]}>
      <View style={[settingsStyles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.br3 }]}>
        <Text style={[settingsStyles.title, { color: colors.tx1 }]}>Settings</Text>
        <TouchableOpacity
          style={[settingsStyles.closeBtn, { backgroundColor: colors.bg2 }]}
          onPress={onClose}
        >
          <Ionicons name="close" size={18} color={colors.tx2} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <SettingsSectionLabel colors={colors}>Appearance</SettingsSectionLabel>
        <View style={[settingsStyles.card, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
          <View style={settingsStyles.settingRow}>
            <View style={settingsStyles.settingLeft}>
              <Ionicons name="moon-outline" size={18} color={colors.tx2} />
              <Text style={[settingsStyles.settingLabel, { color: colors.tx1 }]}>Dark mode</Text>
            </View>
            <Toggle on={dark} onChange={setDark} />
          </View>
        </View>

        <SettingsSectionLabel colors={colors}>Account</SettingsSectionLabel>
        <View style={[settingsStyles.card, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
          <SettingsNavRow icon="notifications-outline" label="Notifications" onPress={onNotifications} colors={colors} />
          <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
          <SettingsNavRow icon="shield-outline" label="Privacy" colors={colors} />
          <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
          <SettingsNavRow icon="help-circle-outline" label="Help & Feedback" colors={colors} />
        </View>

        {IS_DEV_BUILD && (
          <>
            <SettingsSectionLabel colors={colors}>Dev settings</SettingsSectionLabel>
            <View style={[settingsStyles.card, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
              <Text style={[settingsStyles.devLabel, { color: colors.tx2 }]}>Phase</Text>
              <View style={settingsStyles.phaseRow}>
                {(['free', 'freePro', 'pro'] as Phase[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      settingsStyles.phaseBtn,
                      { borderColor: colors.br2 },
                      phase === p && { backgroundColor: colors.pTint, borderColor: colors.pBorder },
                    ]}
                    onPress={() => setPhase(p)}
                  >
                    <Text style={[settingsStyles.phaseBtnText, { color: phase === p ? colors.p1 : colors.tx3 }]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
              <TouchableOpacity style={settingsStyles.resetRow} onPress={onReset}>
                <Ionicons name="refresh-outline" size={14} color={colors.tx3} />
                <Text style={[settingsStyles.resetText, { color: colors.tx3 }]}>Reset onboarding</Text>
              </TouchableOpacity>
              <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
              <TouchableOpacity style={settingsStyles.resetRow} onPress={onMockProfile}>
                <Text style={settingsStyles.devConsoleTxt}>[DEV] Switch to mock profile →</Text>
              </TouchableOpacity>
              <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
              <TouchableOpacity style={settingsStyles.resetRow} onPress={onRealProfile}>
                <Text style={settingsStyles.devConsoleTxt}>[DEV] Switch to real profile →</Text>
              </TouchableOpacity>

              {profileMode === 'mock' && (
                <>
                  <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
                  <Text style={[settingsStyles.devLabel, { color: colors.tx2 }]}>[DEV] Broadcast view as</Text>
                  <View style={settingsStyles.phaseRow}>
                    {([['initiator', 'Initiator'], ['pending', 'Pending'], ['confirmed', 'Joined']] as const).map(([role, label]) => (
                      <TouchableOpacity
                        key={role}
                        style={[settingsStyles.phaseBtn, { borderColor: colors.br2 }]}
                        onPress={() => onBroadcastPerspective(role)}
                      >
                        <Text style={[settingsStyles.phaseBtnText, { color: colors.tx2 }]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
                  <TouchableOpacity style={settingsStyles.resetRow} onPress={onSimulatePendingJoin}>
                    <Text style={settingsStyles.devConsoleTxt}>[DEV] Simulate player joining your broadcast →</Text>
                  </TouchableOpacity>
                  <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
                  <TouchableOpacity style={settingsStyles.resetRow} onPress={onSimulateRejection}>
                    <Text style={settingsStyles.devConsoleTxt}>[DEV] Simulate being rejected from a game →</Text>
                  </TouchableOpacity>
                  <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
                  <TouchableOpacity style={settingsStyles.resetRow} onPress={onSimulateRoundInProgress}>
                    <Text style={settingsStyles.devConsoleTxt}>[DEV] Simulate round in progress →</Text>
                  </TouchableOpacity>
                  <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
                  <TouchableOpacity style={settingsStyles.resetRow} onPress={onSimulateRoundCompleted}>
                    <Text style={settingsStyles.devConsoleTxt}>[DEV] Simulate round completed →</Text>
                  </TouchableOpacity>
                  <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
                  <TouchableOpacity style={settingsStyles.resetRow} onPress={onSimulateRateReminder}>
                    <Text style={settingsStyles.devConsoleTxt}>[DEV] Simulate rating reminder →</Text>
                  </TouchableOpacity>
                  <View style={[settingsStyles.divider, { backgroundColor: colors.br3 }]} />
                  <TouchableOpacity style={settingsStyles.resetRow} onPress={onSimulateInstantPush}>
                    <Text style={settingsStyles.devConsoleTxt}>[DEV] Fire test push notification →</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}

        <Text style={[settingsStyles.versionText, { color: colors.tx3 }]}>
          v1.0.0 · {Updates.updateId ? `update ${Updates.updateId.slice(0, 8)}` : 'embedded bundle'}
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function SettingsSectionLabel({ colors, children }: { colors: any; children: React.ReactNode }) {
  return (
    <Text style={[settingsStyles.sectionLabel, { color: colors.tx3 }]}>
      {String(children).toUpperCase()}
    </Text>
  );
}

function SettingsNavRow({ icon, label, onPress, colors }: { icon: any; label: string; onPress?: () => void; colors: any }) {
  return (
    <TouchableOpacity style={settingsStyles.settingRow} onPress={onPress}>
      <View style={settingsStyles.settingLeft}>
        <Ionicons name={icon} size={18} color={colors.tx2} />
        <Text style={[settingsStyles.settingLabel, { color: colors.tx1 }]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.tx3} />
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  topnav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  navTitle: { fontSize: 25, fontWeight: '700' },
  iconBtn:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Hero
  hero: {
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 0,
    alignItems: 'center', gap: 4,
  },
  heroLogo: { position: 'absolute', top: 14, left: 16 },
  avatarWrap: { position: 'relative', width: 160, height: 160, marginBottom: 4 },
  avatarCircle: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 2, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 152, height: 152, borderRadius: 76 },
  avatarPlaceholder: { overflow: 'hidden' },
  editBadge: {
    position: 'absolute', bottom: 10, right: 10,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5,
  },
  heroName: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  heroSub:  { fontSize: 15, marginTop: 2 },

  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 4, borderRadius: 99, marginTop: 8,
  },
  proBadgeText: { color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 16, paddingTop: 14, paddingBottom: 14,
    width: '100%', justifyContent: 'center', borderTopWidth: 0.5,
  },
  statCell:    { alignItems: 'center', minWidth: 64 },
  statValue:   { fontSize: 22, fontWeight: '700', lineHeight: 26 },
  statLabel:   { fontSize: 11, marginTop: 2 },
  statDivider: { width: 0.5, height: 36, marginHorizontal: 20 },

  // Availability
  availRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, borderWidth: 0.5, padding: 14,
  },
  availLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  availDot:  { width: 8, height: 8, borderRadius: 4 },
  availText: { fontSize: 17, fontWeight: '600' },
  availSub:  { fontSize: 12, marginTop: 2 },

  // Golf profile
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  gridCell: { width: '47%' },

  // Courses
  courseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5,
  },
  courseText: { fontSize: 17, fontWeight: '500' },
  courseSub:  { fontSize: 12, marginTop: 1 },
  courseHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
  },
  courseHint: { fontSize: 12 },
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5,
  },
  addRowText: { fontSize: 15, fontWeight: '500' },

  // Schedule
  scheduleCard: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 0.5, overflow: 'hidden', marginBottom: 8,
  },
  schedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14,
  },
  schedDivider: { height: 0.5 },
  schedDay:     { fontSize: 14, fontWeight: '500' },
  schedTime:    { fontSize: 14, fontWeight: '600' },
  editBtnRow: {
    flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 4,
  },
  editAvailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11,
    borderRadius: 12, borderWidth: 0.5,
  },
  editAvailText: { fontSize: 13, fontWeight: '500' },

  // ProDashboard
  proCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 14, borderWidth: 0.5, padding: 12 },
  proGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  proCell: { flex: 1, borderRadius: 9, padding: 10, borderWidth: 0.5 },
  proCellLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  proCellValue:   { fontSize: 24, fontWeight: '700', lineHeight: 28 },
  proCellValueSm: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  proFeatures:    { gap: 6 },
  proFeatureRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proFeatureText: { fontSize: 13, fontWeight: '500' },

  // ProUpsellBanner
  upsellWrap: {
    marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 0.5, overflow: 'hidden',
  },
  upsellHead:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  upsellPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
  upsellPillText:  { color: 'white', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  upsellHeadTitle: { color: 'white', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  upsellHeadSub:   { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  upsellBody:      { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 6 },
  upsellFeature: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10,
  },
  upsellFeatureTitle: { fontSize: 14, fontWeight: '600' },
  upsellFeatureSub:   { fontSize: 12, marginTop: 2 },
  upsellBtn:          { borderRadius: 12, overflow: 'hidden', marginTop: 12 },
  upsellBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13,
  },
  upsellBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },

  moderatingOverlay: {
    alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.88)', zIndex: 99,
  },
  moderatingText: { fontSize: 14, fontWeight: '500', color: '#555' },
});

const settingsStyles = StyleSheet.create({
  sheet:  { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 0.5,
  },
  title:    { fontSize: 22, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  card: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 0.5,
    overflow: 'hidden', paddingHorizontal: 14,
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13,
  },
  settingLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { fontSize: 16, fontWeight: '500' },
  divider:      { height: 0.5 },
  devLabel:     { fontSize: 13, fontWeight: '600', paddingTop: 14, paddingBottom: 10 },
  phaseRow:     { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  phaseBtn:     { flex: 1, paddingVertical: 8, borderRadius: 9, borderWidth: 0.5, alignItems: 'center' },
  phaseBtnText: { fontSize: 11, fontWeight: '600' },
  resetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12,
  },
  resetText:      { fontSize: 13, fontWeight: '500' },
  devConsoleTxt: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12, color: '#FF3B30', letterSpacing: 0.3,
  },
  versionText: { fontSize: 11, textAlign: 'center', marginTop: 24 },
});

// ── NotificationsSettingsSheet ────────────────────────────────────────────────
function NotificationsSettingsSheet({
  visible, colors, insets, notifPrefs, setNotifPrefs, pushToken, onRequestPermission, onClose,
}: {
  visible: boolean;
  colors: any;
  insets: any;
  notifPrefs: { games: boolean; rounds: boolean; messages: boolean };
  setNotifPrefs: (p: { games: boolean; rounds: boolean; messages: boolean }) => void;
  pushToken: string | null;
  onRequestPermission: () => Promise<boolean>;
  onClose: () => void;
}) {
  const permissionGranted = pushToken !== null;
  const allOff = !notifPrefs.games && !notifPrefs.rounds && !notifPrefs.messages;
  const masterOn = permissionGranted && !allOff;

  const handleMasterToggle = async (on: boolean) => {
    if (on && !permissionGranted) {
      const granted = await onRequestPermission();
      if (!granted) {
        Alert.alert(
          'Notifications blocked',
          'To enable notifications, go to your device Settings and turn on notifications for Find a Fourth.',
          [{ text: 'OK' }],
        );
        return;
      }
    }
    setNotifPrefs({ games: on, rounds: on, messages: on });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[notifStyles.sheet, { backgroundColor: colors.bg1 }]}>
        {/* Header */}
        <View style={[notifStyles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.br3 }]}>
          <TouchableOpacity onPress={onClose} style={notifStyles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.p1} />
          </TouchableOpacity>
          <Text style={[notifStyles.title, { color: colors.tx1 }]}>Notifications</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Master allow toggle */}
          <View style={[notifStyles.card, { backgroundColor: colors.bg2, borderColor: colors.br3, marginTop: 20 }]}>
            <View style={notifStyles.row}>
              <View style={notifStyles.rowLeft}>
                <Ionicons name="notifications-outline" size={18} color={colors.tx2} />
                <Text style={[notifStyles.label, { color: colors.tx1 }]}>Allow notifications</Text>
              </View>
              <Toggle on={masterOn} onChange={handleMasterToggle} />
            </View>
          </View>

          {/* Per-category section */}
          {masterOn && (
            <>
              <Text style={[notifStyles.sectionLabel, { color: colors.tx3 }]}>NOTIFY ME ABOUT</Text>
              <View style={[notifStyles.card, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>

                {/* Games */}
                <View style={notifStyles.row}>
                  <View style={notifStyles.rowLeft}>
                    <Ionicons name="golf-outline" size={18} color={colors.tx2} />
                    <View style={{ flex: 1 }}>
                      <Text style={[notifStyles.label, { color: colors.tx1 }]}>Games</Text>
                      <Text style={[notifStyles.sub, { color: colors.tx3 }]}>Join requests, cancellations, co-broadcaster updates</Text>
                    </View>
                  </View>
                  <Toggle on={notifPrefs.games} onChange={v => setNotifPrefs({ ...notifPrefs, games: v })} />
                </View>

                <View style={[notifStyles.divider, { backgroundColor: colors.br3 }]} />

                {/* Rounds */}
                <View style={notifStyles.row}>
                  <View style={notifStyles.rowLeft}>
                    <Ionicons name="star-outline" size={18} color={colors.tx2} />
                    <View style={{ flex: 1 }}>
                      <Text style={[notifStyles.label, { color: colors.tx1 }]}>Rounds</Text>
                      <Text style={[notifStyles.sub, { color: colors.tx3 }]}>Reminders to rate your playing partners</Text>
                    </View>
                  </View>
                  <Toggle on={notifPrefs.rounds} onChange={v => setNotifPrefs({ ...notifPrefs, rounds: v })} />
                </View>

                <View style={[notifStyles.divider, { backgroundColor: colors.br3 }]} />

                {/* Messages (future) */}
                <View style={notifStyles.row}>
                  <View style={notifStyles.rowLeft}>
                    <Ionicons name="chatbubble-outline" size={18} color={colors.tx2} />
                    <View style={{ flex: 1 }}>
                      <Text style={[notifStyles.label, { color: colors.tx1 }]}>Messages</Text>
                      <Text style={[notifStyles.sub, { color: colors.tx3 }]}>New direct messages (coming soon)</Text>
                    </View>
                  </View>
                  <Toggle on={notifPrefs.messages} onChange={v => setNotifPrefs({ ...notifPrefs, messages: v })} />
                </View>

              </View>
            </>
          )}

          {/* Hint when permissions denied */}
          {!permissionGranted && (
            <Text style={[notifStyles.hint, { color: colors.tx3 }]}>
              Notifications are disabled. Tap "Allow notifications" above, or go to device Settings to turn them on for Find a Fourth.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const notifStyles = StyleSheet.create({
  sheet:        { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 0.5,
  },
  backBtn:      { width: 40, alignItems: 'flex-start' },
  title:        { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  card: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 0.5,
    overflow: 'hidden', paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 13,
  },
  rowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  label:    { fontSize: 16, fontWeight: '500' },
  sub:      { fontSize: 12, marginTop: 2 },
  divider:  { height: 0.5 },
  hint:     { fontSize: 13, paddingHorizontal: 20, paddingTop: 14, lineHeight: 20 },
});
