import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '@/context/AppContext';
import { GRAD_COLORS } from '@/constants/Colors';

type PillVariant = 'brand' | 'gray' | 'green' | 'amber';

interface Props {
  label: string;
  variant?: PillVariant;
}

const VARIANT_STYLES: Record<PillVariant, { bg: string; text: string }> = {
  brand: { bg: '#EDE7FA', text: '#5C3AAD' },
  gray:  { bg: '#F0EEF8', text: '#5B4B8A' },
  green: { bg: '#E1F5EE', text: '#0F6E56' },
  amber: { bg: '#FEF3C7', text: '#92400E' },
};

export function Pill({ label, variant = 'gray' }: Props) {
  const { colors } = useApp();
  const s = VARIANT_STYLES[variant];

  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
