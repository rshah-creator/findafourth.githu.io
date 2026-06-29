/**
 * Profile creation flow — 4-slide setup triggered by "Create a profile from scratch"
 * on onboarding slide 3. Saves data to AppContext so Profile tab reflects choices.
 *
 * Slide 1 — Personal info (avatar, first name, last name, city)
 * Slide 2 — Golf profile (handicap wheel + chip selectors)
 * Slide 3 — Home course
 * Slide 4 — Availability (days + time windows)
 * Slide 5 — Account verification (real Supabase email OTP + Twilio phone OTP)
 */
import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, Modal, FlatList,
  useWindowDimensions, TouchableOpacity, PanResponder, Animated,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/context/AppContext';
import { CircularCropModal } from '@/components/CircularCropModal';
import { Avatar } from '@/components/Avatar';
import { WheelPicker, HCP_OPTIONS, FIELD_OPTIONS } from '@/components/WheelPicker';
import { GRAD_COLORS } from '@/constants/Colors';
import { getVenuesForCity } from '@/constants/Data';
import { moderateImage } from '@/lib/moderateImage';
import { containsProfanity } from '@/utils/profanity';
import { COUNTRY_CODES, getFlag, type CountryCode } from '@/constants/CountryCodes';
import type { ProfileStats } from '@/context/AppContext';
import {
  saveProfileToSupabase, uploadAvatar,
  sendEmailOtp, verifyEmailOtp,
  sendPhoneOtp, verifyPhoneOtp,
} from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const STEPS = 5;
const THRESHOLD = 60;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAYS: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};
const TIME_WINDOWS = ['5–9am', '9am–12pm', '12–4pm', '4–6pm'];
const TIME_MAP: Record<string, string> = {
  '5–9am':    '5am – 9am',
  '9am–12pm': '9am – 12pm',
  '12–4pm':   '12pm – 4pm',
  '4–6pm':    '4pm – 6pm',
};

const CITIES = [
  'Lahore',
  'Islamabad / Rawalpindi',
  'Karachi',
  'Multan',
];

const GOLF_FIELD_DESCS: Record<string, string> = {
  tees:     'The color tees you typically play from. Take every advantage you can get.',
  pace:     'How fast do you like to move? Some prefer a power walk; others enjoy the stroll.',
  cart:     'Zip around in a golf cart, or rack up the steps on foot?',
  partners: "Who you're happy to tee it up with.",
  music:    'Do you like to play some tunes on a speaker, or do you prefer the sounds of the fairway?',
};

// ── Validation helpers ────────────────────────────────────────────────────────

const NAME_REGEX = /^[a-zA-Z\s'\-]+$/;

function toTitleCase(str: string): string {
  return str.replace(/(?:^|\s|[-'])\w/g, c => c.toUpperCase());
}

function validateNameField(value: string): string {
  const v = value.trim();
  if (!v) return 'Required';
  if (v.length < 2) return 'At least 2 characters';
  if (v.length > 30) return '30 characters max';
  if (!NAME_REGEX.test(v)) return 'Letters, hyphens and apostrophes only';
  if (containsProfanity(v)) return 'Please use an appropriate name';
  return '';
}

function validateEmail(v: string): string {
  if (!v.trim()) return 'Required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address';
  return '';
}

function validatePhone(v: string): string {
  if (!v.trim()) return 'Required';
  const digits = v.replace(/\D/g, '');
  if (digits.length < 4) return 'Enter a valid phone number';
  if (digits.length > 15) return 'Phone number is too long';
  return '';
}

// ── Age validation ────────────────────────────────────────────────────────────

function validateAge(day: string, month: string, year: string): 'ok' | 'underage' | 'invalid' {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > currentYear) {
    return 'invalid';
  }
  const dob = new Date(y, m - 1, d);
  if (isNaN(dob.getTime()) || dob.getMonth() !== m - 1) return 'invalid'; // catches e.g. Feb 30
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasBirthdayPassed) age--;
  return age < 13 ? 'underage' : 'ok';
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileSetupScreen() {
  const {
    colors, phase,
    profileStats,
    setProfileName, setProfileCity, setProfileImageUri,
    setProfileStats, setHomeCourse, setAvailSchedule,
    setProfileFirstName, setProfileLastName, setProfileGender,
    setProfilePhone, setProfileEmail,
    supabaseUser, socialProfileData,
    setProfileMode,
  } = useApp();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const { width: W } = useWindowDimensions();

  // ── Age gate state ───────────────────────────────────────────────────────
  const [ageGatePassed, setAgeGatePassed] = useState(false);
  const [ageBlocked,    setAgeBlocked]    = useState(false);
  const [dobDay,        setDobDay]        = useState('');
  const [dobMonth,      setDobMonth]      = useState('');
  const [dobYear,       setDobYear]       = useState('');
  const [dobErr,        setDobErr]        = useState('');

  const handleAgeCheck = () => {
    const result = validateAge(dobDay, dobMonth, dobYear);
    if (result === 'invalid') {
      setDobErr('Please enter a valid date of birth.');
      return;
    }
    if (result === 'underage') {
      setAgeBlocked(true);
      return;
    }
    setAgeGatePassed(true);
  };

  // ── Slide navigation ──────────────────────────────────────────────────────
  const [step, setStep]       = useState(0);
  const [sliderH, setSliderH] = useState(0);
  const translateX            = useRef(new Animated.Value(0)).current;
  const stepRef               = useRef(0);

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

  // ── Finish ────────────────────────────────────────────────────────────────
  const finish = async () => {
    await AsyncStorage.setItem('f4f_onboarding_done', '1');
    router.replace('/(tabs)');
  };

  const handleFinish = async () => {
    // Build display name from split fields
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (fn) {
      const displayName = ln ? `${fn} ${ln.charAt(0).toUpperCase()}.` : fn;
      setProfileName(displayName);
      setProfileFirstName(fn);
    }
    if (ln) setProfileLastName(ln);
    if (gender)            setProfileGender(gender);
    if (city.trim())       setProfileCity(city.trim());
    // Resolve avatar to a cross-device URL: picked images are uploaded to
    // Storage (local file:// paths don't resolve on other devices); OAuth
    // avatars are already remote https URLs and pass through unchanged.
    let resolvedAvatar: string | undefined;
    if (localImageUri) {
      resolvedAvatar = supabaseUser
        ? (await uploadAvatar(supabaseUser.id, localImageUri)) ?? localImageUri
        : localImageUri;
    } else if (socialProfileData?.avatarUrl) {
      resolvedAvatar = socialProfileData.avatarUrl;
    }
    if (resolvedAvatar)    setProfileImageUri(resolvedAvatar);
    setProfileStats({ handicap, tees, pace, cart, partners, music });
    setHomeCourse(course);
    setAvailSchedule(
      availEntries.map(e => ({
        day:   FULL_DAYS[e.day] ?? e.day,
        times: e.windows.map(w => TIME_MAP[w] ?? w),
      }))
    );
    if (email.trim())        setProfileEmail(email.trim());
    if (fullPhoneNumber.length > 3) setProfilePhone(fullPhoneNumber);

    // Lock in real mode — clears any stale mock flag from dev sessions
    setProfileMode('real');
    await AsyncStorage.setItem('f4f_profile_mode', 'real');

    // Persist to Supabase. Resolve the user id from context, or fall back to a
    // fresh session lookup — for from-scratch users the account is created by
    // the email OTP step, and supabaseUser in context may not have propagated
    // yet by the time Finish is tapped.
    let authedId = supabaseUser?.id ?? null;
    if (!authedId) {
      const { data } = await supabase.auth.getUser();
      authedId = data.user?.id ?? null;
    }
    if (authedId) {
      const fn = firstName.trim();
      const ln = lastName.trim();
      await saveProfileToSupabase(authedId, {
        first_name:     fn,
        last_name:      ln,
        gender:         gender || undefined,
        city:           city.trim(),
        avatar_url:     resolvedAvatar,
        phone:          fullPhoneNumber,
        handicap,
        tees,
        pace,
        cart,
        partners,
        music,
        home_course:    course,
        avail_schedule: availEntries.map(e => ({
          day:   FULL_DAYS[e.day] ?? e.day,
          times: e.windows.map(w => TIME_MAP[w] ?? w),
        })),
        provider:       socialProfileData?.provider ?? 'manual',
        setup_complete: true,
      });
    }

    await finish();
  };

  // ── Slide 1 state — pre-populated from social OAuth if available ──────────
  const [localImageUri,    setLocalImageUri]    = useState<string | null>(null);
  const [pendingCropUri,   setPendingCropUri]   = useState<string | null>(null);
  const [moderating,       setModerating]       = useState(false);
  const [firstName,     setFirstName]     = useState(socialProfileData?.firstName ?? '');
  const [lastName,      setLastName]      = useState(socialProfileData?.lastName  ?? '');
  const [firstNameErr,  setFirstNameErr]  = useState('');
  const [lastNameErr,   setLastNameErr]   = useState('');
  const [gender,        setGender]        = useState<'Male' | 'Female' | ''>('');
  const [city,          setCity]          = useState('');

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,   // circular crop handled in-app
      quality: 1,
    });
    if (!result.canceled) setPendingCropUri(result.assets[0].uri);
  };

  const handleFirstNameBlur = () => {
    const formatted = toTitleCase(firstName);
    setFirstName(formatted);
    setFirstNameErr(validateNameField(formatted));
  };

  const handleLastNameBlur = () => {
    const formatted = toTitleCase(lastName);
    setLastName(formatted);
    setLastNameErr(validateNameField(formatted));
  };

  // ── Slide 2 state ─────────────────────────────────────────────────────────
  const [handicap, setHandicap] = useState(profileStats.handicap);
  const [tees,     setTees]     = useState(profileStats.tees);
  const [pace,     setPace]     = useState(profileStats.pace);
  const [cart,     setCart]     = useState(profileStats.cart);
  const [partners, setPartners] = useState(profileStats.partners);
  const [music,    setMusic]    = useState(profileStats.music);

  // ── Slide 3 state ─────────────────────────────────────────────────────────
  const [course, setCourse]             = useState('');

  // Clear home course whenever city changes (courses are city-specific)
  const prevCityRef = React.useRef(city);
  React.useEffect(() => {
    if (prevCityRef.current !== city) {
      prevCityRef.current = city;
      setCourse('');
    }
  }, [city]);

  const [selectedDays, setSelectedDays] = useState<string[]>(['Sat', 'Sun']);
  const [availEntries, setAvailEntries] = useState<{ day: string; windows: string[] }[]>([
    { day: 'Sat', windows: ['9am–12pm'] },
    { day: 'Sun', windows: ['9am–12pm'] },
  ]);

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(prev => prev.filter(d => d !== day));
      setAvailEntries(prev => prev.filter(e => e.day !== day));
    } else {
      setSelectedDays(prev => [...prev, day]);
      setAvailEntries(prev => [...prev, { day, windows: ['9am–12pm'] }]);
    }
  };

  const toggleWindowForDay = (day: string, window: string) => {
    setAvailEntries(prev => prev.map(e => {
      if (e.day !== day) return e;
      const has = e.windows.includes(window);
      const newWindows = has ? e.windows.filter(w => w !== window) : [...e.windows, window];
      return { ...e, windows: newWindows.length > 0 ? newWindows : e.windows };
    }));
  };

  const getWindowsForDay = (day: string) =>
    availEntries.find(e => e.day === day)?.windows ?? ['9am–12pm'];

  // ── Slide 5 state ────────────────────────────────────────────────────────
  // Use socialProfileData (not supabaseUser) to detect OAuth — a persisted Supabase
  // session from a previous login can make supabaseUser non-null even for from-scratch
  // users, which would incorrectly hide the email verification section.
  const isOAuthUser = !!socialProfileData;

  // Email channel (from-scratch users only)
  const [email,           setEmail]           = useState(socialProfileData?.email ?? '');
  const [emailErr,        setEmailErr]        = useState('');
  const [emailOtpSent,    setEmailOtpSent]    = useState(false);
  const [emailOtpCode,    setEmailOtpCode]    = useState('');
  const [emailVerified,   setEmailVerified]   = useState(false);
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);

  // Phone channel (all users)
  const PK = COUNTRY_CODES.find(c => c.code === 'PK')!;
  const [selectedCountry,      setSelectedCountry]      = useState<CountryCode>(PK);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch,        setCountrySearch]        = useState('');
  const filteredCountries = useMemo(
    () => COUNTRY_CODES.filter(c =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.dialCode.includes(countrySearch)
    ),
    [countrySearch],
  );
  const [phone,             setPhone]             = useState('');
  const [phoneErr,          setPhoneErr]          = useState('');
  const [phoneOtpSent,      setPhoneOtpSent]      = useState(false);
  const [phoneOtpCode,      setPhoneOtpCode]      = useState('');
  const [phoneVerified,     setPhoneVerified]     = useState(false);
  const [phoneOtpLoading,   setPhoneOtpLoading]   = useState(false);
  const [resendCooldown,    setResendCooldown]    = useState(0);

  // From-scratch users must verify email (this is what creates their Supabase
  // account — phone OTP is Infobip-only and creates no account). OAuth users
  // already have a session, so phone verification alone is enough.
  const canFinish = isOAuthUser ? phoneVerified : (emailVerified && phoneVerified);

  /** Tick the resend cooldown down every second. */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSendEmailOtp = async () => {
    const ee = validateEmail(email);
    setEmailErr(ee);
    if (ee) return;
    setEmailOtpLoading(true);
    const { error } = await sendEmailOtp(email);
    setEmailOtpLoading(false);
    if (error) { setEmailErr(error.message); return; }
    setEmailOtpSent(true);
  };

  /** E.164 full number: strip leading zeros from local part, prepend dial code. */
  const fullPhoneNumber = selectedCountry.dialCode + phone.replace(/\D/g, '').replace(/^0+/, '');

  /** Sends (or resends) the phone OTP and starts the 30-second cooldown. */
  const doSendPhoneOtp = async () => {
    setPhoneOtpLoading(true);
    const { error } = await sendPhoneOtp(fullPhoneNumber);
    setPhoneOtpLoading(false);
    if (error) { setPhoneErr(error.message); return false; }
    setResendCooldown(30);
    return true;
  };

  const handleSendPhoneOtp = async () => {
    const pe = validatePhone(phone);
    setPhoneErr(pe);
    if (pe) return;
    const ok = await doSendPhoneOtp();
    if (ok) setPhoneOtpSent(true);
  };

  const handleResendPhoneOtp = async () => {
    setPhoneOtpCode('');
    setPhoneErr('');
    await doSendPhoneOtp();
    // keep phoneOtpSent=true — stay on the code-entry view
  };

  // Auto-verify when OTP digits entered
  useEffect(() => {
    if (emailOtpCode.length === 6 && !emailVerified && !emailOtpLoading) {
      (async () => {
        setEmailOtpLoading(true);
        const { error } = await verifyEmailOtp(email, emailOtpCode);
        setEmailOtpLoading(false);
        if (error) setEmailErr('Invalid code — please try again');
        else setEmailVerified(true);
      })();
    }
  }, [emailOtpCode]);

  useEffect(() => {
    if (phoneOtpCode.length === 4 && !phoneVerified && !phoneOtpLoading) {
      (async () => {
        setPhoneOtpLoading(true);
        const { error } = await verifyPhoneOtp(fullPhoneNumber, phoneOtpCode);
        setPhoneOtpLoading(false);
        if (error) setPhoneErr('Invalid code — please try again');
        else setPhoneVerified(true);
      })();
    }
  }, [phoneOtpCode]);

  // ── Per-slide completion gates ────────────────────────────────────────────
  const canContinue: boolean = (() => {
    switch (step) {
      case 0:
        return (
          !validateNameField(firstName) &&
          !validateNameField(lastName) &&
          gender !== '' &&
          city !== ''
        );
      case 1:
        return (
          handicap !== '' && tees !== '' && pace !== '' &&
          cart !== '' && partners !== '' && music !== ''
        );
      case 2:
        return course !== '' && selectedDays.length > 0;
      default:
        return true;
    }
  })();

  // ── Continue guard (validates Slide 0 name fields on tap) ────────────────
  const handleContinue = () => {
    if (step === 0) {
      const fe = validateNameField(firstName);
      const le = validateNameField(lastName);
      setFirstNameErr(fe);
      setLastNameErr(le);
      if (fe || le) return;
    }
    if (!canContinue) return;
    handleStep(step + 1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Age gate — shown before any personal data is collected (COPPA requirement)
  if (ageBlocked) {
    return (
      <AgeBlockedScreen
        colors={colors}
        insets={insets}
        onBack={() => router.replace('/onboarding')}
      />
    );
  }
  if (!ageGatePassed) {
    return (
      <AgeGateScreen
        colors={colors}
        insets={insets}
        dobDay={dobDay}   setDobDay={setDobDay}
        dobMonth={dobMonth} setDobMonth={setDobMonth}
        dobYear={dobYear}  setDobYear={setDobYear}
        dobErr={dobErr}
        onContinue={handleAgeCheck}
        onBack={() => router.replace('/onboarding')}
      />
    );
  }

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
      <View
        style={styles.sliderClip}
        onLayout={e => setSliderH(e.nativeEvent.layout.height)}
        {...panResponder.panHandlers}
      >
        <Animated.View style={[{ flexDirection: 'row' }, { transform: [{ translateX }] }]}>

          {/* ── Slide 1: Personal info ── */}
          <KeyboardAvoidingView
            style={{ width: W, height: sliderH }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              style={styles.slideScroll}
              contentContainerStyle={styles.slideContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.slideTitle, { color: colors.tx1 }]}>Let's set up your profile</Text>
              <Text style={[styles.slideSub, { color: colors.tx2 }]}>
                A few details to get you started — you can change everything later.
              </Text>

              {/* Avatar picker */}
              <TouchableOpacity style={styles.avatarSection} onPress={pickImage} activeOpacity={0.8}>
                {localImageUri ? (
                  <Avatar uri={localImageUri} size={96} ring ringColor={colors.br2} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.bg3, borderColor: colors.br2 }]}>
                    <Ionicons name="camera-outline" size={30} color={colors.tx3} />
                  </View>
                )}
                <View style={[styles.cameraBadge, { backgroundColor: colors.p1, borderColor: colors.bg1 }]}>
                  <Ionicons name="camera" size={13} color="white" />
                </View>
              </TouchableOpacity>
              <Text style={[styles.avatarHint, { color: colors.tx3 }]}>
                Tap to add a photo
              </Text>

              {/* First name */}
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.tx2 }]}>First name</Text>
                <TextInput
                  style={[styles.textInput, {
                    backgroundColor: colors.bg2, color: colors.tx1,
                    borderColor: firstNameErr ? colors.red : colors.br2,
                  }]}
                  placeholder="e.g. Ali"
                  placeholderTextColor={colors.tx3}
                  value={firstName}
                  onChangeText={v => { setFirstName(v); if (firstNameErr) setFirstNameErr(''); }}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onEndEditing={handleFirstNameBlur}
                />
                {!!firstNameErr && (
                  <Text style={[styles.fieldError, { color: colors.red }]}>{firstNameErr}</Text>
                )}
              </View>

              {/* Last name */}
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.tx2 }]}>Last name</Text>
                <TextInput
                  style={[styles.textInput, {
                    backgroundColor: colors.bg2, color: colors.tx1,
                    borderColor: lastNameErr ? colors.red : colors.br2,
                  }]}
                  placeholder="e.g. Khan"
                  placeholderTextColor={colors.tx3}
                  value={lastName}
                  onChangeText={v => { setLastName(v); if (lastNameErr) setLastNameErr(''); }}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onEndEditing={handleLastNameBlur}
                />
                {!!lastNameErr && (
                  <Text style={[styles.fieldError, { color: colors.red }]}>{lastNameErr}</Text>
                )}
              </View>

              {/* Gender */}
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.tx2 }]}>Gender</Text>
                <View style={styles.genderRow}>
                  {(['Male', 'Female'] as const).map(g => {
                    const selected = gender === g;
                    return (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.genderBtn,
                          { borderColor: selected ? colors.pBorder : colors.br2,
                            backgroundColor: selected ? colors.pTint : colors.bg2 },
                        ]}
                        onPress={() => setGender(g)}
                      >
                        <Text style={[styles.genderBtnText, { color: selected ? colors.p1 : colors.tx2 },
                          selected && { fontWeight: '600' }]}>
                          {g}
                        </Text>
                        {selected && <Ionicons name="checkmark-circle" size={16} color={colors.p1} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.genderNote, { color: colors.tx3 }]}>
                  Choose the option that most closely aligns with your gender identity.
                </Text>
              </View>

              {/* City — radio list */}
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.tx2 }]}>City</Text>
                <View style={[styles.optionList, { borderColor: colors.br3 }]}>
                  {CITIES.map((c, i) => {
                    const selected = city === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.optionRow,
                          { borderBottomColor: colors.br3 },
                          i === CITIES.length - 1 && { borderBottomWidth: 0 },
                          selected && { backgroundColor: colors.pTint },
                        ]}
                        onPress={() => setCity(c)}
                      >
                        <Text style={[styles.optionText, { color: selected ? colors.p1 : colors.tx1 },
                          selected && { fontWeight: '600' }]}>
                          {c}
                        </Text>
                        {selected && <Ionicons name="checkmark" size={16} color={colors.p1} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.courseHintRow}>
                  <Ionicons name="time-outline" size={13} color={colors.tx3} />
                  <Text style={[styles.courseHint, { color: colors.tx3 }]}>More cities coming soon</Text>
                </View>
              </View>

              {/* Phase 2 ad — multi-city Pro feature */}
              {phase !== 'free' && (
                <View style={[styles.adBanner, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
                  <LinearGradient
                    colors={GRAD_COLORS}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.adBadge}
                  >
                    <Text style={styles.adBadgeText}>✦ PRO</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.adTitle, { color: colors.tx1 }]}>Play in multiple cities</Text>
                    <Text style={[styles.adSub, { color: colors.tx3 }]}>Broadcast from Lahore, Karachi and more</Text>
                  </View>
                  <TouchableOpacity>
                    <Text style={[styles.adLink, { color: colors.p1 }]}>Sign up →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          {/* ── Slide 2: Golf profile ── */}
          <View style={{ width: W, height: sliderH }}>
            <ScrollView
              style={styles.slideScroll}
              contentContainerStyle={styles.slideContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.slideTitle, { color: colors.tx1 }]}>Your golf profile</Text>
              <Text style={[styles.slideSub, { color: colors.tx2 }]}>
                This helps us match you with compatible players.
              </Text>

              {/* Handicap — wheel picker */}
              <View style={[styles.golfFieldSection, { borderColor: colors.br3 }]}>
                <Text style={[styles.golfFieldLabel, { color: colors.tx1 }]}>Handicap</Text>
                <Text style={[styles.golfFieldDesc, { color: colors.tx3 }]}>
                  Your WHS index. Whether it's a 2 or a 28 — the right crew is out there.
                </Text>
                <WheelPicker
                  items={HCP_OPTIONS}
                  value={handicap}
                  onChange={setHandicap}
                  colors={colors}
                  visibleRows={3}
                />
              </View>

              {/* Tees, Pace, Cart, Partners, Music — chip selectors */}
              {(['tees', 'pace', 'cart', 'partners', 'music'] as (keyof ProfileStats)[]).map(field => {
                const setters: Record<string, (v: string) => void> = {
                  tees: setTees, pace: setPace, cart: setCart,
                  partners: setPartners, music: setMusic,
                };
                const values: Record<string, string> = { tees, pace, cart, partners, music };
                return (
                  <View key={field} style={[styles.golfFieldSection, { borderColor: colors.br3 }]}>
                    <Text style={[styles.golfFieldLabel, { color: colors.tx1 }]}>
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                    </Text>
                    <Text style={[styles.golfFieldDesc, { color: colors.tx3 }]}>
                      {GOLF_FIELD_DESCS[field]}
                    </Text>
                    <View style={styles.chipRow}>
                      {FIELD_OPTIONS[field].map(opt => {
                        const selected = values[field] === opt;
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[
                              styles.chip,
                              { borderColor: colors.br2, backgroundColor: colors.bg2 },
                              selected && { backgroundColor: colors.pTint, borderColor: colors.pBorder },
                            ]}
                            onPress={() => setters[field](opt)}
                          >
                            <Text style={[
                              styles.chipText,
                              { color: selected ? colors.p1 : colors.tx2 },
                              selected && { fontWeight: '700' },
                            ]}>
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {field === 'music' && (
                      <View style={styles.musicNoteRow}>
                        <Ionicons name="information-circle-outline" size={13} color={colors.tx3} />
                        <Text style={[styles.musicNote, { color: colors.tx3 }]}>
                          Just make sure to check the course rules and keep it respectful out there — fellow golfers will thank you!
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Slide 3: Home course ── */}
          <View style={{ width: W, height: sliderH }}>
            <ScrollView
              style={styles.slideScroll}
              contentContainerStyle={styles.slideContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.slideTitle, { color: colors.tx1 }]}>Where do you play?</Text>
              <Text style={[styles.slideSub, { color: colors.tx2 }]}>
                Pick your home course — where you'll broadcast tee times from. You can join games at any course, anywhere.
              </Text>

              {(() => {
                const cityVenues = getVenuesForCity(city);
                return (
                  <View style={[styles.optionList, { borderColor: colors.br3 }]}>
                    {cityVenues.map((v, i) => {
                      const selected = course === v;
                      return (
                        <TouchableOpacity
                          key={v}
                          style={[
                            styles.optionRow,
                            { borderBottomColor: colors.br3 },
                            i === cityVenues.length - 1 && { borderBottomWidth: 0 },
                            selected && { backgroundColor: colors.pTint },
                          ]}
                          onPress={() => setCourse(v)}
                        >
                          <Text style={[styles.optionText, { color: selected ? colors.p1 : colors.tx1 }, selected && { fontWeight: '600' }]}>
                            {v}
                          </Text>
                          {selected && <Ionicons name="checkmark" size={16} color={colors.p1} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Always-visible hint */}
              <View style={styles.courseHintRow}>
                <Ionicons name="information-circle-outline" size={13} color={colors.tx3} />
                <Text style={[styles.courseHint, { color: colors.tx3 }]}>
                  One home course · Broadcast here, join games anywhere
                </Text>
              </View>

              {/* Phase 2 ad — multi-course Pro feature */}
              {phase !== 'free' && (
                <View style={[styles.adBanner, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
                  <LinearGradient
                    colors={GRAD_COLORS}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.adBadge}
                  >
                    <Text style={styles.adBadgeText}>✦ PRO</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.adTitle, { color: colors.tx1 }]}>Multiple home courses</Text>
                    <Text style={[styles.adSub, { color: colors.tx3 }]}>Broadcast from all your clubs at once</Text>
                  </View>
                  <TouchableOpacity>
                    <Text style={[styles.adLink, { color: colors.p1 }]}>Sign up →</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>

          {/* ── Slide 4: Availability ── */}
          <View style={{ width: W, height: sliderH }}>
            <ScrollView
              style={styles.slideScroll}
              contentContainerStyle={styles.slideContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.slideTitle, { color: colors.tx1 }]}>When do you play?</Text>
              <Text style={[styles.slideSub, { color: colors.tx2 }]}>
                Pick the days and times you're usually free for a round. You can update this anytime in your Profile.
              </Text>

              <View style={styles.dayChipRow}>
                {DAYS.map(day => {
                  const sel = selectedDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayChip,
                        { borderColor: colors.br2, backgroundColor: colors.bg2 },
                        sel && { backgroundColor: colors.pTint, borderColor: colors.pBorder },
                      ]}
                      onPress={() => toggleDay(day)}
                    >
                      <Text style={[styles.dayChipText, { color: sel ? colors.p1 : colors.tx2 }, sel && { fontWeight: '700' }]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {DAYS.filter(d => selectedDays.includes(d)).map(day => (
                <View key={day} style={[styles.timeRow, { borderTopColor: colors.br3 }]}>
                  <Text style={[styles.timeRowLabel, { color: colors.tx2 }]}>{FULL_DAYS[day]}</Text>
                  <View style={styles.timeChipRow}>
                    {TIME_WINDOWS.map(w => {
                      const sel = getWindowsForDay(day).includes(w);
                      return (
                        <TouchableOpacity
                          key={w}
                          style={[
                            styles.timeChip,
                            { borderColor: colors.br2, backgroundColor: colors.bg2 },
                            sel && { backgroundColor: colors.pTint, borderColor: colors.pBorder },
                          ]}
                          onPress={() => toggleWindowForDay(day, w)}
                        >
                          <Text style={[styles.timeChipText, { color: sel ? colors.p1 : colors.tx2 }, sel && { fontWeight: '700' }]}>
                            {w}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>

          {/* ── Slide 5: Verification ── */}
          <KeyboardAvoidingView
            style={{ width: W, height: sliderH }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              style={styles.slideScroll}
              contentContainerStyle={styles.slideContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Email section — from-scratch users only */}
              {!isOAuthUser && (
                <>
                  <Text style={[styles.slideTitle, { color: colors.tx1 }]}>Real golfers only ⛳</Text>
                  <Text style={[styles.slideSub, { color: colors.tx2 }]}>
                    A quick email check to confirm you're genuine — no bots with suspiciously low handicaps.
                  </Text>

                  <View style={styles.fieldBlock}>
                    <Text style={[styles.fieldLabel, { color: colors.tx2 }]}>Email address</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.bg2, color: colors.tx1,
                        borderColor: emailErr ? colors.red : colors.br2,
                      }]}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.tx3}
                      value={email}
                      onChangeText={v => { setEmail(v); setEmailErr(''); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!emailOtpSent}
                    />
                    {!!emailErr && (
                      <Text style={[styles.fieldError, { color: colors.red }]}>{emailErr}</Text>
                    )}
                    {!emailOtpSent && !emailVerified && (
                      <TouchableOpacity
                        style={[styles.otpSendBtn, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}
                        onPress={handleSendEmailOtp}
                        disabled={emailOtpLoading}
                      >
                        {emailOtpLoading
                          ? <ActivityIndicator size="small" color={colors.p1} />
                          : <Text style={[styles.otpSendText, { color: colors.p1 }]}>Send email code →</Text>}
                      </TouchableOpacity>
                    )}
                    {emailOtpSent && !emailVerified && (
                      <View style={styles.otpSection}>
                        <Text style={[styles.otpHint, { color: colors.tx2 }]}>
                          We sent a 6-digit code to {email}.
                        </Text>
                        <TextInput
                          style={[styles.otpInput, {
                            backgroundColor: colors.bg2, color: colors.tx1,
                            borderColor: emailErr ? colors.red : colors.br2,
                          }]}
                          keyboardType="number-pad"
                          maxLength={6}
                          value={emailOtpCode}
                          onChangeText={setEmailOtpCode}
                          placeholder="— — — — — —"
                          placeholderTextColor={colors.tx3}
                          textAlign="center"
                        />
                        {emailOtpLoading && (
                          <ActivityIndicator size="small" color={colors.p1} style={{ marginTop: 4 }} />
                        )}
                        <TouchableOpacity onPress={() => { setEmailOtpSent(false); setEmailOtpCode(''); setEmailErr(''); }}>
                          <Text style={[styles.resendLink, { color: colors.p1 }]}>Resend code</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {emailVerified && (
                      <View style={[styles.verifiedBadge, { backgroundColor: colors.bg2, borderColor: colors.green }]}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                        <Text style={[styles.verifiedText, { color: colors.green }]}>Email verified</Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Phone section — all users */}
              <Text style={[styles.slideTitle, { color: colors.tx1 }]}>One last check 🏌️</Text>
              <Text style={[styles.slideSub, { color: colors.tx2 }]}>
                Your phone helps us double-confirm you're a real golfer. Keeps the community safe and the games legit.
              </Text>

              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.tx2 }]}>Phone number</Text>
                {/* Country code + local number row */}
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={[styles.countryCodeBtn, {
                      backgroundColor: colors.bg2,
                      borderColor: phoneErr ? colors.red : colors.br2,
                    }]}
                    onPress={() => !phoneOtpSent && setCountryPickerVisible(true)}
                    disabled={phoneOtpSent}
                  >
                    <Text style={styles.countryFlag}>{getFlag(selectedCountry.code)}</Text>
                    <Text style={[styles.countryDial, { color: colors.tx1 }]}>
                      {selectedCountry.dialCode}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={colors.tx3} />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.phoneInput, {
                      backgroundColor: colors.bg2, color: colors.tx1,
                      borderColor: phoneErr ? colors.red : colors.br2,
                    }]}
                    placeholder="300 1234567"
                    placeholderTextColor={colors.tx3}
                    value={phone}
                    onChangeText={v => { setPhone(v); setPhoneErr(''); }}
                    keyboardType="phone-pad"
                    editable={!phoneOtpSent}
                  />
                </View>
                {!!phoneErr && (
                  <Text style={[styles.fieldError, { color: colors.red }]}>{phoneErr}</Text>
                )}
                {!phoneOtpSent && !phoneVerified && (
                  <TouchableOpacity
                    style={[styles.otpSendBtn, { backgroundColor: colors.pTint, borderColor: colors.pBorder }]}
                    onPress={handleSendPhoneOtp}
                    disabled={phoneOtpLoading}
                  >
                    {phoneOtpLoading
                      ? <ActivityIndicator size="small" color={colors.p1} />
                      : <Text style={[styles.otpSendText, { color: colors.p1 }]}>Send OTP code →</Text>}
                  </TouchableOpacity>
                )}
                {phoneOtpSent && !phoneVerified && (
                  <View style={styles.otpSection}>
                    <Text style={[styles.otpHint, { color: colors.tx2 }]}>
                      We sent a 4-digit code to {fullPhoneNumber}.
                    </Text>
                    <TextInput
                      style={[styles.otpInput, {
                        backgroundColor: colors.bg2, color: colors.tx1,
                        borderColor: phoneErr ? colors.red : colors.br2,
                      }]}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={phoneOtpCode}
                      onChangeText={setPhoneOtpCode}
                      placeholder="— — — —"
                      placeholderTextColor={colors.tx3}
                      textAlign="center"
                    />
                    {phoneOtpLoading && (
                      <ActivityIndicator size="small" color={colors.p1} style={{ marginTop: 4 }} />
                    )}
                    {resendCooldown > 0 ? (
                      <Text style={[styles.resendLink, { color: colors.tx3 }]}>
                        Resend in {resendCooldown}s
                      </Text>
                    ) : (
                      <TouchableOpacity onPress={handleResendPhoneOtp} disabled={phoneOtpLoading}>
                        <Text style={[styles.resendLink, { color: colors.p1 }]}>Resend code</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {phoneVerified && (
                  <View style={[styles.verifiedBadge, { backgroundColor: colors.bg2, borderColor: colors.green }]}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                    <Text style={[styles.verifiedText, { color: colors.green }]}>Phone verified</Text>
                  </View>
                )}
              </View>

            </ScrollView>
          </KeyboardAvoidingView>

          {/* ── Country code picker modal ── */}
          <Modal
            visible={countryPickerVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setCountryPickerVisible(false)}
          >
            <View style={[styles.pickerModal, { backgroundColor: colors.bg1 }]}>
              {/* Header */}
              <View style={[styles.pickerHeader, { borderBottomColor: colors.br3 }]}>
                <Text style={[styles.pickerTitle, { color: colors.tx1 }]}>Select country</Text>
                <TouchableOpacity onPress={() => { setCountryPickerVisible(false); setCountrySearch(''); }}>
                  <Ionicons name="close" size={22} color={colors.tx2} />
                </TouchableOpacity>
              </View>
              {/* Search */}
              <View style={[styles.pickerSearchWrap, { backgroundColor: colors.bg2, borderColor: colors.br2 }]}>
                <Ionicons name="search-outline" size={16} color={colors.tx3} />
                <TextInput
                  style={[styles.pickerSearch, { color: colors.tx1 }]}
                  placeholder="Search country or code"
                  placeholderTextColor={colors.tx3}
                  value={countrySearch}
                  onChangeText={setCountrySearch}
                  autoFocus
                  clearButtonMode="while-editing"
                />
              </View>
              {/* List */}
              <FlatList
                data={filteredCountries}
                keyExtractor={item => item.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.pickerRow,
                      { borderBottomColor: colors.br3 },
                      item.code === selectedCountry.code && { backgroundColor: colors.pTint },
                    ]}
                    onPress={() => {
                      setSelectedCountry(item);
                      setCountryPickerVisible(false);
                      setCountrySearch('');
                    }}
                  >
                    <Text style={styles.pickerFlag}>{getFlag(item.code)}</Text>
                    <Text style={[styles.pickerName, { color: colors.tx1 }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.pickerDial, { color: item.code === selectedCountry.code ? colors.p1 : colors.tx3 }]}>
                      {item.dialCode}
                    </Text>
                    {item.code === selectedCountry.code && (
                      <Ionicons name="checkmark" size={16} color={colors.p1} />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </Modal>

        </Animated.View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step < STEPS - 1 ? (
          canContinue ? (
            <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtn}>
              <TouchableOpacity style={styles.mainBtnInner} onPress={handleContinue}>
                <Text style={styles.mainBtnText}>Continue →</Text>
              </TouchableOpacity>
            </LinearGradient>
          ) : (
            <View style={[styles.mainBtn, styles.mainBtnLocked, { backgroundColor: colors.bg3, borderColor: colors.br2 }]}>
              <Text style={[styles.mainBtnText, { color: colors.tx3 }]}>
                {step === 2 ? 'Select your course' : 'Fill in all fields to continue'}
              </Text>
            </View>
          )
        ) : (
          canFinish ? (
            <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtn}>
              <TouchableOpacity style={styles.mainBtnInner} onPress={handleFinish}>
                <Text style={styles.mainBtnText}>Finish →</Text>
              </TouchableOpacity>
            </LinearGradient>
          ) : (
            <View style={[styles.mainBtn, styles.mainBtnLocked, { backgroundColor: colors.bg3, borderColor: colors.br2 }]}>
              <Ionicons name="lock-closed" size={14} color={colors.tx3} />
              <Text style={[styles.mainBtnText, { color: colors.tx3 }]}>
                {/* From-scratch users must verify email (creates their account) AND phone */}
                {!isOAuthUser && !emailVerified
                  ? 'Verify your email to continue'
                  : 'Verify your phone to continue'}
              </Text>
            </View>
          )
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


        {__DEV__ && step === STEPS - 1 && !phoneVerified && (
          <TouchableOpacity
            style={styles.devLink}
            onPress={() => {
              setPhoneVerified(true);
              setEmailVerified(true);
            }}
          >
            <Text style={styles.devLinkText}>[DEV] Skip OTP verification →</Text>
          </TouchableOpacity>
        )}
      </View>

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
          setLocalImageUri(croppedUri);
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    position: 'absolute', top: 52, left: 14, zIndex: 10, padding: 6,
  },
  sliderClip: { flex: 1, overflow: 'hidden' },

  slideScroll: { flex: 1 },
  slideContent: {
    paddingHorizontal: 22, paddingTop: 52, paddingBottom: 24,
  },
  slideTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 },
  slideSub:   { fontSize: 15, lineHeight: 22, marginBottom: 28, color: '#666' },

  // Slide 1
  avatarSection: {
    alignSelf: 'center', marginBottom: 6, position: 'relative',
  },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarHint: { textAlign: 'center', fontSize: 12, marginBottom: 28 },
  fieldBlock: { marginBottom: 16 },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5,
  },
  genderBtnText: { fontSize: 15 },
  genderNote: { fontSize: 11, marginTop: 8, lineHeight: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, letterSpacing: 0.2 },
  textInput: {
    borderRadius: 12, borderWidth: 0.5,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 16,
  },
  fieldError: { fontSize: 11, marginTop: 4 },

  // Slide 2
  golfFieldSection: {
    marginBottom: 20, paddingBottom: 20, borderBottomWidth: 0.5,
  },
  golfFieldLabel: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  golfFieldDesc:  { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  musicNoteRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 10 },
  musicNote:      { flex: 1, fontSize: 11, lineHeight: 16 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5,
  },
  chipText: { fontSize: 13 },

  // Slide 3
  sectionHeading: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 4,
  },
  sectionDesc: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  optionList: {
    borderRadius: 14, borderWidth: 0.5, overflow: 'hidden', marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  optionText: { fontSize: 14 },
  courseHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 4, marginBottom: 12,
  },
  courseHint: { fontSize: 12 },
  // Phase 2 ad banners (Slide 1 + Slide 3)
  adBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 0.5, padding: 12, marginBottom: 12,
  },
  adBadge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  adBadgeText: { color: 'white', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  adTitle:     { fontSize: 13, fontWeight: '600' },
  adSub:       { fontSize: 11, marginTop: 1 },
  adLink:      { fontSize: 12, fontWeight: '700' },
  dayChipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  dayChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5,
  },
  dayChipText: { fontSize: 13 },
  timeRow: {
    paddingTop: 12, marginTop: 8, borderTopWidth: 0.5,
  },
  timeRowLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  timeChipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 0.5,
  },
  timeChipText: { fontSize: 12 },

  // Slide 5 — phone row
  phoneRow: {
    flexDirection: 'row', gap: 8, alignItems: 'stretch',
  },
  countryCodeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, borderWidth: 0.5,
    paddingHorizontal: 12, paddingVertical: 13,
  },
  countryFlag: { fontSize: 18 },
  countryDial: { fontSize: 15, fontWeight: '600', minWidth: 36 },
  phoneInput: {
    flex: 1, borderRadius: 12, borderWidth: 0.5,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
  },

  // Country picker modal
  pickerModal:      { flex: 1 },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  pickerTitle:      { fontSize: 17, fontWeight: '700' },
  pickerSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 10,
  },
  pickerSearch:     { flex: 1, fontSize: 15 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  pickerFlag:       { fontSize: 22 },
  pickerName:       { flex: 1, fontSize: 15 },
  pickerDial:       { fontSize: 14, fontWeight: '600' },

  // Slide 4
  otpSendBtn: {
    borderRadius: 12, borderWidth: 0.5, padding: 14, alignItems: 'center', marginTop: 8,
  },
  otpSendText:   { fontSize: 15, fontWeight: '600' },
  otpSection:    { marginTop: 16, gap: 12 },
  otpHint:       { fontSize: 13, lineHeight: 19 },
  otpInput: {
    borderRadius: 12, borderWidth: 0.5, padding: 18,
    fontSize: 28, fontWeight: '700', letterSpacing: 8,
  },
  resendLink:    { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 0.5, padding: 14, marginTop: 16,
  },
  verifiedText:  { fontSize: 15, fontWeight: '600' },

  // Footer
  footer: { paddingHorizontal: 24, gap: 14, alignItems: 'center' },
  mainBtn:       { width: '100%', borderRadius: 16, overflow: 'hidden' },
  mainBtnLocked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderWidth: 0.5 },
  mainBtnInner:  { alignItems: 'center', paddingVertical: 16 },
  mainBtnText:   { color: 'white', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  dots:         { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot:          { height: 8, width: 8, borderRadius: 4 },
  dotActive:    { width: 22 },
  devLink:      { paddingVertical: 4, paddingHorizontal: 8 },
  devLinkText:  {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11, color: '#FF3B30', letterSpacing: 0.3,
  },

  moderatingOverlay: {
    alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.88)', zIndex: 99,
  },
  moderatingText: { fontSize: 14, fontWeight: '500', color: '#555' },
});

// ── AgeGateScreen ─────────────────────────────────────────────────────────────

interface AgeGateProps {
  colors: ReturnType<typeof useApp>['colors'];
  insets: { top: number; bottom: number };
  dobDay: string;   setDobDay:   (v: string) => void;
  dobMonth: string; setDobMonth: (v: string) => void;
  dobYear: string;  setDobYear:  (v: string) => void;
  dobErr: string;
  onContinue: () => void;
  onBack: () => void;
}

function AgeGateScreen({
  colors, insets,
  dobDay, setDobDay, dobMonth, setDobMonth, dobYear, setDobYear,
  dobErr, onContinue, onBack,
}: AgeGateProps) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 24 }}>

        {/* Back */}
        <TouchableOpacity style={ageSt.backBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={colors.p1} />
        </TouchableOpacity>

        <Text style={[ageSt.title, { color: colors.tx1 }]}>Before we start</Text>
        <Text style={[ageSt.sub, { color: colors.tx2 }]}>
          You must be 13 or older to use Find a Fourth.{'\n'}Enter your date of birth to continue.
        </Text>

        {/* DD / MM / YYYY row */}
        <View style={ageSt.dobRow}>
          <View style={ageSt.dobBox}>
            <Text style={[ageSt.dobLabel, { color: colors.tx3 }]}>Day</Text>
            <TextInput
              style={[ageSt.dobInput, {
                backgroundColor: colors.bg2, color: colors.tx1,
                borderColor: dobErr ? '#FF3B30' : colors.br2,
              }]}
              value={dobDay}
              onChangeText={v => { setDobDay(v.replace(/\D/g, '')); }}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="DD"
              placeholderTextColor={colors.tx3}
              textAlign="center"
            />
          </View>
          <View style={ageSt.dobBox}>
            <Text style={[ageSt.dobLabel, { color: colors.tx3 }]}>Month</Text>
            <TextInput
              style={[ageSt.dobInput, {
                backgroundColor: colors.bg2, color: colors.tx1,
                borderColor: dobErr ? '#FF3B30' : colors.br2,
              }]}
              value={dobMonth}
              onChangeText={v => { setDobMonth(v.replace(/\D/g, '')); }}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="MM"
              placeholderTextColor={colors.tx3}
              textAlign="center"
            />
          </View>
          <View style={[ageSt.dobBox, ageSt.dobBoxYear]}>
            <Text style={[ageSt.dobLabel, { color: colors.tx3 }]}>Year</Text>
            <TextInput
              style={[ageSt.dobInput, {
                backgroundColor: colors.bg2, color: colors.tx1,
                borderColor: dobErr ? '#FF3B30' : colors.br2,
              }]}
              value={dobYear}
              onChangeText={v => { setDobYear(v.replace(/\D/g, '')); }}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="YYYY"
              placeholderTextColor={colors.tx3}
              textAlign="center"
            />
          </View>
        </View>

        {!!dobErr && (
          <Text style={ageSt.err}>{dobErr}</Text>
        )}

        {/* Privacy note */}
        <Text style={[ageSt.privacy, { color: colors.tx3 }]}>
          We use your date of birth only to verify your age. It is not displayed to other users.
        </Text>

        {/* Continue button */}
        <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ageSt.btn}>
          <TouchableOpacity style={ageSt.btnInner} onPress={onContinue} activeOpacity={0.85}>
            <Text style={ageSt.btnText}>Continue →</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── AgeBlockedScreen ──────────────────────────────────────────────────────────

function AgeBlockedScreen({
  colors, insets, onBack,
}: { colors: ReturnType<typeof useApp>['colors']; insets: { top: number; bottom: number }; onBack: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1, paddingTop: insets.top }}>
      <View style={ageSt.blockedContent}>
        <Ionicons name="golf-outline" size={52} color={colors.tx3} style={{ marginBottom: 24 }} />
        <Text style={[ageSt.blockedTitle, { color: colors.tx1 }]}>
          Find a Fourth is for golfers aged 13 and over.
        </Text>
        <Text style={[ageSt.blockedSub, { color: colors.tx2 }]}>
          Thanks for your interest — come back when you're older!
        </Text>
      </View>
      <TouchableOpacity
        style={[ageSt.blockedBack, { paddingBottom: insets.bottom + 20 }]}
        onPress={onBack}
      >
        <Text style={[ageSt.blockedBackText, { color: colors.p1 }]}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const ageSt = StyleSheet.create({
  backBtn:      { padding: 4, marginBottom: 8 },
  title:        { fontSize: 26, fontWeight: '800', marginTop: 24, marginBottom: 10 },
  sub:          { fontSize: 15, lineHeight: 22, marginBottom: 32 },
  dobRow:       { flexDirection: 'row', gap: 10, marginBottom: 8 },
  dobBox:       { flex: 1 },
  dobBoxYear:   { flex: 2 },
  dobLabel:     { fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.4 },
  dobInput: {
    borderRadius: 12, borderWidth: 0.5,
    paddingVertical: 16, fontSize: 20, fontWeight: '600',
  },
  err:          { fontSize: 13, color: '#FF3B30', marginBottom: 8 },
  privacy:      { fontSize: 12, lineHeight: 17, marginTop: 16, marginBottom: 32 },
  btn:          { borderRadius: 14 },
  btnInner:     { alignItems: 'center', paddingVertical: 16 },
  btnText:      { color: 'white', fontSize: 16, fontWeight: '700' },
  // Blocked screen
  blockedContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  blockedTitle:   { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  blockedSub:     { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  blockedBack:    { alignItems: 'center', paddingVertical: 20 },
  blockedBackText:{ fontSize: 15, fontWeight: '600' },
});
