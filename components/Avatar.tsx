import React from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { AVATAR_IDS } from '@/constants/Data';

interface Props {
  who?: string;
  size?: number;
  ring?: boolean;
  ringColor?: string;
  uri?: string;       // overrides the pravatar URL when set
  initials?: string;  // shown when uri is absent and who is not a known mock id
}

export function Avatar({ who, size = 44, ring = false, ringColor = '#7B4FD4', uri: uriOverride, initials }: Props) {
  // If a uri override is explicitly provided, use it
  if (uriOverride) {
    return (
      <View style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        ring && { borderWidth: 2, borderColor: ringColor, padding: 2 },
      ]}>
        <Image
          source={{ uri: uriOverride }}
          style={{ width: ring ? size - 4 : size, height: ring ? size - 4 : size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  // If who maps to a known mock avatar, use pravatar
  const imgId = who ? (AVATAR_IDS[who] ?? null) : null;
  if (imgId !== null) {
    const uri = `https://i.pravatar.cc/200?img=${imgId}`;
    return (
      <View style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        ring && { borderWidth: 2, borderColor: ringColor, padding: 2 },
      ]}>
        <Image
          source={{ uri }}
          style={{ width: ring ? size - 4 : size, height: ring ? size - 4 : size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  // No uri and no known mock id — show initials placeholder
  const innerSize = ring ? size - 4 : size;
  const label = initials ?? (who ? who.charAt(0).toUpperCase() : '?');
  return (
    <View style={[
      styles.wrap,
      styles.placeholder,
      { width: size, height: size, borderRadius: size / 2 },
      ring && { borderWidth: 2, borderColor: ringColor, padding: 2 },
    ]}>
      <View style={[styles.placeholderInner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        <Text style={[styles.placeholderText, { fontSize: size * 0.36 }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#e6e3dc',
  },
  placeholder: {
    backgroundColor: 'transparent',
  },
  placeholderInner: {
    backgroundColor: '#D4C5F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeholderText: {
    color: '#7B4FD4',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
