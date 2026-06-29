import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '@/context/AppContext';

function BadgeIcon({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={badge.wrap}>
      <Text style={badge.text}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#E64545',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'white',
  },
  text: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
});

export default function TabLayout() {
  const { colors, unread } = useApp();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.br3,
          borderTopWidth: 0.5,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
          paddingHorizontal: 12,
        },
        tabBarActiveTintColor: colors.p1,
        tabBarInactiveTintColor: colors.tx3,
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '500',
          marginTop: 1,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) => (
            <Ionicons name="compass-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="broadcast"
        options={{
          title: 'Broadcast',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="bullhorn-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color }) => (
            <Ionicons name="people-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => (
            <View>
              <Ionicons name="chatbubble-outline" size={22} color={color} />
              <BadgeIcon count={unread} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
