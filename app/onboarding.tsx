import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Platform,
  useWindowDimensions, TouchableOpacity, PanResponder, Animated, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/context/AppContext';
import { GRAD_COLORS } from '@/constants/Colors';
import { GolferSVG } from '@/components/GolferSVG';
import { FlagSVG } from '@/components/FlagSVG';
import { performOAuthSignIn } from '@/lib/supabase';
import { extractProfileFromOAuth } from '@/lib/auth';

const STEPS = 3;
const THRESHOLD = 60;

export default function OnboardingScreen() {
  const { colors, setSocialProfileData, loadMockProfile } = useApp();
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { width: W }  = useWindowDimensions();
  const [step, setStep] = useState(0);
  const translateX    = useRef(new Animated.Value(0)).current;
  const stepRef       = useRef(0);
  const [loading, setLoading] = useState(false);

  const goTo = (s: number, animated = true) => {
    Animated.timing(translateX, {
      toValue: -s * W,
      duration: animated ? 340 : 0,
      useNativeDriver: true,
    }).start();
  };

  const handleStep = (s: number) => {
    stepRef.current = s;
    setStep(s);
    goTo(s);
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 10,
    onPanResponderGrant: () => translateX.stopAnimation(),
    onPanResponderMove: (_, g) => {
      const s = stepRef.current;
      const base = -s * W;
      const resist = (dx: number) =>
        (s === 0 && dx > 0) || (s === STEPS - 1 && dx < 0) ? dx * 0.2 : dx;
      translateX.setValue(base + resist(g.dx));
    },
    onPanResponderRelease: (_, g) => {
      const s = stepRef.current;
      if      (g.dx < -THRESHOLD && s < STEPS - 1) handleStep(s + 1);
      else if (g.dx >  THRESHOLD && s > 0)          handleStep(s - 1);
      else                                           goTo(s);
    },
  })).current;

  const finish = async () => {
    await AsyncStorage.setItem('f4f_onboarding_done', '1');
    router.replace('/(tabs)');
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { user, error } = await performOAuthSignIn('google');
    setLoading(false);
    if (error || !user) {
      Alert.alert('Sign-in failed', error?.message ?? 'Please try again.');
      return;
    }
    const profile = extractProfileFromOAuth(user);
    setSocialProfileData(profile);
    router.push('/social-connect');
  };

  const handleAppleLogin = async () => {
    setLoading(true);
    const { user, error } = await performOAuthSignIn('apple');
    setLoading(false);
    if (error || !user) {
      Alert.alert('Sign-in failed', error?.message ?? 'Please try again.');
      return;
    }
    const profile = extractProfileFromOAuth(user);
    setSocialProfileData(profile);
    router.push('/social-connect');
  };


  return (
    <View style={[styles.container, { backgroundColor: colors.bg1, paddingTop: insets.top }]}>

      {/* Back chevron */}
      <TouchableOpacity
        style={[styles.backBtn, { opacity: step > 0 ? 1 : 0 }]}
        onPress={() => step > 0 && handleStep(step - 1)}
        pointerEvents={step > 0 ? 'auto' : 'none'}
      >
        <Ionicons name="chevron-back" size={24} color={colors.tx3} />
      </TouchableOpacity>

      {/* Slide strip */}
      <View style={styles.sliderClip} {...panResponder.panHandlers}>
        <Animated.View style={[{ flexDirection: 'row', height: '100%' }, { transform: [{ translateX }] }]}>

          {/* ── Slide 1: Golfer animation ── */}
          <View style={[styles.slide, { width: W }]}>
            <View style={styles.illo}>
              <GolferSVG size={266} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.h2, { color: colors.tx1 }]}>Find your perfect golf crew</Text>
              <Text style={[styles.body, { color: colors.tx2 }]}>
                Match with golfers by <Text style={{ fontWeight: '700' }}>handicap</Text>, <Text style={{ fontWeight: '700' }}>tee preferences</Text>{' '}
                and <Text style={{ fontWeight: '700' }}>vibe</Text> — from quiet focused rounds to tunes-on cart rides.
              </Text>
            </View>
          </View>

          {/* ── Slide 2: Discover & Broadcast mocks ── */}
          <View style={[styles.slide, { width: W }]}>
            <View style={styles.illo}>
              <View style={styles.mockPair}>
                <MockCard title="Discover" icon="compass-outline" bg={['#7B4FD4','#4158D0']} colors={colors} />
                <MockCard title="Broadcast" icon="radio-outline" bg={['#C850C0','#7B4FD4']} colors={colors} />
              </View>
            </View>
            <View style={styles.copy}>
              <Text style={[styles.h2, { color: colors.tx1 }]}>Two ways to connect</Text>
              <Text style={[styles.body, { color: colors.tx2 }]}>
                Browse golfers in <Text style={{ fontWeight: '700' }}>Discover</Text>. Post your
                own tee time in <Text style={{ fontWeight: '700' }}>Broadcast</Text> and let others
                find you.
              </Text>
            </View>
          </View>

          {/* ── Slide 3: Flag animation + sign up ── */}
          <View style={[styles.slide, { width: W }]}>
            <View style={styles.illo}>
              <FlagSVG size={266} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.h2, { color: colors.tx1 }]}>Ready to tee off? 🏌️</Text>
              <Text style={[styles.body, { color: colors.tx2 }]}>
                Connect via a social account or build a fresh Find a Fourth profile.
              </Text>
            </View>
          </View>

        </Animated.View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step < 2 ? (
          <LinearGradient colors={GRAD_COLORS} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={styles.nextBtn}>
            <TouchableOpacity style={styles.nextBtnInner} onPress={() => handleStep(step + 1)}>
              <Text style={styles.nextBtnText}>Continue →</Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <View style={styles.socialBtns}>
            {/* Google — fully wired */}
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: colors.bg2, borderWidth: 0.5, borderColor: colors.br2 }]}
              onPress={handleGoogleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.p1} />
              ) : (
                <Ionicons name="logo-google" size={18} color={colors.p1} />
              )}
              <Text style={[styles.socialBtnText, { color: colors.tx1 }]}>Continue with Google</Text>
            </TouchableOpacity>

            {/* Apple */}
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: '#000000' }]}
              onPress={handleAppleLogin}
              disabled={loading}
            >
              <Ionicons name="logo-apple" size={18} color="white" />
              <Text style={styles.socialBtnText}>Continue with Apple</Text>
            </TouchableOpacity>

<TouchableOpacity onPress={() => router.push('/profile-setup')} disabled={loading}>
              <Text style={[styles.scratch, { color: colors.tx3 }]}>Sign up with email instead →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dot pagination */}
        <View style={styles.dots}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <TouchableOpacity key={i} onPress={() => handleStep(i)}>
              <Animated.View style={[
                styles.dot,
                { backgroundColor: i === step ? colors.p1 : colors.br2 },
                i === step && styles.dotActive,
              ]} />
            </TouchableOpacity>
          ))}
        </View>

        {__DEV__ && (
          <TouchableOpacity
            onPress={async () => {
              loadMockProfile();
              await AsyncStorage.setItem('f4f_onboarding_done', '1');
              router.replace('/(tabs)');
            }}
            style={styles.devLink}
          >
            <Text style={styles.devLinkText}>[DEV] Load mock profile →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Mock UI card (slide 2) ────────────────────────────────────────────────────
function MockCard({ title, icon, bg, colors }: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: [string, string];
  colors: ReturnType<typeof useApp>['colors'];
}) {
  return (
    <View style={[mockS.card, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
      <LinearGradient colors={bg} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={mockS.head}>
        <Ionicons name={icon} size={13} color="white" />
        <Text style={mockS.headText}>{title}</Text>
      </LinearGradient>
      <View style={mockS.body}>
        {[0.9, 0.65, 0.8].map((w, i) => (
          <View key={i} style={[mockS.line, { width: `${w*100}%` as any, backgroundColor: colors.br2 }]} />
        ))}
        <View style={{ flexDirection:'row', gap:6, marginTop:4 }}>
          <View style={[mockS.badge, { backgroundColor: colors.pTint }]}>
            <Text style={[mockS.badgeText, { color: colors.p1 }]}>Hcp 8</Text>
          </View>
          <View style={[mockS.badge, { backgroundColor: colors.bg3 }]}>
            <Text style={[mockS.badgeText, { color: colors.tx3 }]}>7am</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const mockS = StyleSheet.create({
  card:      { width: 138, borderRadius: 14, borderWidth: 0.5, overflow: 'hidden' },
  head:      { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 9 },
  headText:  { color: 'white', fontSize: 11, fontWeight: '600' },
  body:      { padding: 10, gap: 6 },
  line:      { height: 8, borderRadius: 4 },
  badge:     { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  badgeText: { fontSize: 10, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    position: 'absolute', top: 52, left: 14, zIndex: 10, padding: 6,
  },
  sliderClip: {
    flex: 1,
    overflow: 'hidden', // clips slides outside the viewport
  },
  slide: {
    // width set inline to W — REQUIRED for slides to sit side-by-side
    flex: 0,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  illo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockPair: { flexDirection: 'row', gap: 14 },
  copy: {
    paddingBottom: 28,
    alignItems: 'center',
    gap: 10,
  },
  h2: {
    fontSize: 24, fontWeight: '700',
    textAlign: 'center', letterSpacing: -0.3,
  },
  body: {
    fontSize: 15, lineHeight: 22, textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24, gap: 14, alignItems: 'center',
  },
  nextBtn:      { width: '100%', borderRadius: 16, overflow: 'hidden' },
  nextBtnInner: { alignItems: 'center', paddingVertical: 16 },
  nextBtnText:  { color: 'white', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  socialBtns:   { width: '100%', gap: 10, alignItems: 'center' },
  socialBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 14,
  },
  socialBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  scratch:       { fontSize: 13, marginTop: 4 },
  dots:          { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot:           { height: 8, width: 8, borderRadius: 4 },
  dotActive:     { width: 22 },
  devLink:       { paddingVertical: 4, paddingHorizontal: 8 },
  devLinkText:   {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11, color: '#FF3B30', letterSpacing: 0.3,
  },
});
