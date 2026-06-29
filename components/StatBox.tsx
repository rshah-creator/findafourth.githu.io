import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '@/context/AppContext';

interface Props {
  label: string;
  value: string;
  small?: boolean;
}

export function StatBox({ label, value, small }: Props) {
  const { colors } = useApp();

  return (
    <View style={[styles.box, { backgroundColor: colors.bg2, borderColor: colors.br3 }]}>
      <Text style={[styles.label, { color: colors.tx3 }]}>{label}</Text>
      <Text style={[small ? styles.valueSmall : styles.value, { color: colors.tx1 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
  },
  valueSmall: {
    fontSize: 15,
    fontWeight: '600',
  },
});
