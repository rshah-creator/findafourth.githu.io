import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

interface Props {
  on: boolean;
  onChange: (v: boolean) => void;
  color?: string; // active track color — defaults to green
}

export function Toggle({ on, onChange, color = '#34C759' }: Props) {
  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: on ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [on]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#D1C8EA', color],
  });

  const thumbTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });

  return (
    <Pressable onPress={() => onChange(!on)} accessibilityRole="switch" accessibilityState={{ checked: on }}>
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbTranslate }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 46,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
