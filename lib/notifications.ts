import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ── Foreground presentation handler ───────────────────────────────────────────
// Must be configured before any notification can be received.
// iosDisplayInForeground in app.json handles the app-level default, but this
// hook is needed for the per-notification shouldShowAlert/Sound/Badge flags.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

// ── Category constants ────────────────────────────────────────────────────────
export const NOTIF_CATEGORY = {
  GAMES:    'games',     // join requests, declines, cancellations
  ROUNDS:   'rounds',    // rate reminders
  MESSAGES: 'messages',  // future: direct messages
} as const;

export type NotifCategory = typeof NOTIF_CATEGORY[keyof typeof NOTIF_CATEGORY];

// ── Android notification channels ────────────────────────────────────────────
// Android 8+ requires channels. Each category gets its own so the user can
// control them at OS level in system notification settings.
export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(NOTIF_CATEGORY.GAMES, {
    name: 'Games',
    description: 'Join requests, co-broadcaster updates, and cancellations',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#7B4FD4',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync(NOTIF_CATEGORY.ROUNDS, {
    name: 'Rounds',
    description: 'Rating reminders after your round',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync(NOTIF_CATEGORY.MESSAGES, {
    name: 'Messages',
    description: 'New direct messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

// ── Permission + token registration ──────────────────────────────────────────
// Returns:
//   - Expo push token string  → granted, physical device
//   - 'simulator-no-token'    → granted, simulator (local push still works)
//   - null                    → denied
export async function registerForPushNotifications(): Promise<string | null> {
  await setupAndroidChannels();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Local notifications work on simulators; remote tokens do not.
  if (!Device.isDevice) return 'simulator-no-token';

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'find-a-fourth',
    });
    return tokenData.data;
  } catch (err) {
    console.warn('[notifications] getExpoPushTokenAsync failed:', err);
    // Return a non-null value so the app knows permission was granted even if
    // remote token failed (local push will still work).
    return 'token-fetch-failed';
  }
}

// ── Local push dispatcher ─────────────────────────────────────────────────────
// Schedules an immediate or delayed local notification on this device.
// `data.screen` is used by the tap-to-navigate listener in _layout.tsx.
// Returns the notification identifier (use it to cancel a pending reminder).
export async function scheduleLocalPush(
  title: string,
  body: string,
  category: NotifCategory,
  data?: Record<string, unknown>,
  delaySeconds = 0,
): Promise<string | null> {
  try {
    const trigger: Notifications.NotificationTriggerInput =
      delaySeconds > 0
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
            repeats: false,
          }
        : null;   // null = fire immediately

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data:               { ...data, category },
        categoryIdentifier: category,
        sound:              'default',
      },
      trigger,
    });
    return id;
  } catch (err) {
    console.warn('[notifications] scheduleLocalPush failed:', err);
    return null;
  }
}

// ── Cancel a scheduled notification ──────────────────────────────────────────
// Used to cancel a pending rate-reminder when the user submits ratings early.
export async function cancelScheduledNotification(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Notification may have already fired — silently ignore
  }
}

// ── Badge count ───────────────────────────────────────────────────────────────
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Not supported on all platforms/configurations — silently ignore
  }
}
