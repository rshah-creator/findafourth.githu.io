import '../global.css';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { AppProvider, useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { getProfileStatus } from '@/lib/auth';

// Needed on Android to close the browser after OAuth redirect
WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

function RootInner() {
  const { dark } = useApp();
  const router   = useRouter();
  const segments = useSegments();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Check onboarding status; for returning Supabase users skip straight to tabs
  useEffect(() => {
    (async () => {
      try {
        const mode = await AsyncStorage.getItem('f4f_profile_mode');
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const status = await getProfileStatus(session.user.id);
          if (status === 'complete') {
            await AsyncStorage.setItem('f4f_onboarding_done', '1');
            setOnboardingDone(true);
            return;
          }
          // Session exists but the profile row is gone / never completed (e.g. deleted
          // server-side). Reconcile to a fresh start — but ONLY in real mode, and never
          // on a network error (status 'unknown'), which would falsely log out offline
          // users and wipe their cache.
          if (status === 'incomplete' && mode !== 'mock') {
            await supabase.auth.signOut();
            await AsyncStorage.multiRemove(['f4f_onboarding_done', 'f4f_real_profile']);
            setOnboardingDone(false);
            return;
          }
        }
        const val = await AsyncStorage.getItem('f4f_onboarding_done');
        setOnboardingDone(!!val);
      } catch {
        setOnboardingDone(false);
      }
    })();
  }, []);

  // Handle deep-link OAuth callbacks (edge case: system browser on Android)
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url.startsWith('findafourth://auth/callback')) return;
      const raw = url.includes('#') ? url.split('#')[1] : (url.split('?')[1] ?? '');
      const params = new URLSearchParams(raw);
      const access_token  = params.get('access_token');
      const refresh_token = params.get('refresh_token') ?? '';
      if (access_token) {
        supabase.auth.setSession({ access_token, refresh_token });
      }
    });
    return () => sub.remove();
  }, []);

  // Redirect once we know the onboarding state
  useEffect(() => {
    if (onboardingDone === null) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!onboardingDone && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [onboardingDone]);

  // Navigate to the correct tab when the user taps a push notification
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (onboardingDone !== true) return;
      switch (data?.screen as string | undefined) {
        case 'broadcast': router.push('/(tabs)/broadcast'); break;
        case 'discover':  router.push('/(tabs)/discover');  break;
        case 'messages':  router.push('/(tabs)/messages');  break;
      }
    });
    return () => sub.remove();
  }, [onboardingDone, router]);

  // Foreground listener (banner display is handled by setNotificationHandler in lib/notifications.ts)
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {});
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    PressStart2P_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // White placeholder while fonts download — Slot is not needed here
  // because AppProvider isn't mounted yet either
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <RootInner />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
