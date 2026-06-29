/**
 * Shared WheelPicker component and golf-profile field constants.
 * Used by EditProfileModal (Profile tab) and ProfileSetup flow.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { VENUES } from '@/constants/Data';

export const ITEM_H  = 52;
export const VISIBLE = 5;

export const HCP_OPTIONS: string[] = [
  ...Array.from({ length: 30 }, (_, i) => String(i)),
  '30+',
];

export const FIELD_OPTIONS: Record<string, string[]> = {
  homeCourse: VENUES,
  tees:       ['Black', 'Blue', 'White', 'Yellow', 'Red'],
  pace:       ['Slow', 'Moderate', 'Quick'],
  cart:       ['Walking', 'Cart', 'Either'],
  partners:   ['Male Only', 'Female Only', 'Any'],
  music:      ['Yes', 'No', 'Sometimes'],
};

export const FIELD_LABELS: Record<string, string> = {
  homeCourse: 'Home course',
  handicap:   'Handicap',
  tees:       'Tees',
  pace:       'Pace',
  cart:       'Cart',
  partners:   'Partners',
  music:      'Music',
};

interface WheelPickerProps {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  colors: any;
  visibleRows?: number;  // defaults to VISIBLE (5); pass 3 for compact mode
}

export function WheelPicker({ items, value, onChange, colors, visibleRows = VISIBLE }: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = Math.max(0, items.indexOf(value));
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const containerH = ITEM_H * visibleRows;
  const paddingRows = Math.floor(visibleRows / 2);

  return (
    <View style={[styles.wheelOuter, { height: containerH }]}>
      {/* Highlight bar behind the centre item */}
      <View style={[styles.wheelHighlight, {
        top: ITEM_H * paddingRows,
        backgroundColor: colors.pTint,
        borderTopColor: colors.pBorder,
        borderBottomColor: colors.pBorder,
      }]} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: ITEM_H * paddingRows }}
        onMomentumScrollEnd={e => {
          const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          onChange(items[Math.max(0, Math.min(i, items.length - 1))]);
        }}
      >
        {items.map((item: string) => (
          <View key={item} style={styles.wheelItem}>
            <Text style={[
              styles.wheelItemText,
              { color: item === value ? colors.p1 : colors.tx3 },
              item === value && styles.wheelItemActive,
            ]}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheelOuter: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wheelHighlight: {
    position: 'absolute',
    left: 0, right: 0,
    height: ITEM_H,
    borderTopWidth: 0.5, borderBottomWidth: 0.5,
    zIndex: 0,
  },
  wheelItem: {
    height: ITEM_H, alignItems: 'center', justifyContent: 'center',
  },
  wheelItemText:   { fontSize: 22 },
  wheelItemActive: { fontWeight: '700', fontSize: 26 },
});
