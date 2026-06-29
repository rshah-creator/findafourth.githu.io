import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useApp } from '@/context/AppContext';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useApp();
  return (
    <Text style={[styles.label, { color: colors.tx3 }]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
});
