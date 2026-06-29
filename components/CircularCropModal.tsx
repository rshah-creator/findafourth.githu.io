/**
 * CircularCropModal
 * Full-screen photo crop UI with a circular viewport.
 * Pan to reposition, pinch to zoom. Confirms and crops the square
 * region inside the circle using expo-image-manipulator.
 *
 * Requires (already in project):
 *   react-native-gesture-handler, react-native-reanimated,
 *   react-native-svg, expo-image-manipulator
 */
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, Image, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Rect, Circle, Defs, Mask } from 'react-native-svg';
import * as ImageManipulator from 'expo-image-manipulator';

interface Props {
  /** URI of the full-size picked image. Pass null to hide. */
  uri: string | null;
  onConfirm: (croppedUri: string) => void;
  onCancel: () => void;
}

/** Circle occupies this fraction of screen width */
const CROP_FRACTION = 0.82;

export function CircularCropModal({ uri, onConfirm, onCancel }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const cropR  = (W * CROP_FRACTION) / 2;
  const cropCX = W / 2;
  const cropCY = H / 2;

  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // Shared animated values
  const tx          = useSharedValue(0);
  const ty          = useSharedValue(0);
  const scale       = useSharedValue(1);
  const savedTx     = useSharedValue(0);
  const savedTy     = useSharedValue(0);
  const savedScale  = useSharedValue(1);

  // ── Reset state whenever a new URI is provided ──────────────────────────────
  useEffect(() => {
    if (!uri) return;

    // Get natural image dimensions so we can calculate the initial fill scale
    Image.getSize(
      uri,
      (natW, natH) => {
        setImgNatural({ w: natW, h: natH });

        // Fit image to screen, then ensure it at least fills the crop circle
        const fitScale = Math.min(W / natW, H / natH);
        const fitW = natW * fitScale;
        const fitH = natH * fitScale;
        const cropDiam = cropR * 2;
        const fillScale = Math.max(1, cropDiam / Math.min(fitW, fitH));

        scale.value      = fillScale;
        savedScale.value = fillScale;
        tx.value      = 0;
        ty.value      = 0;
        savedTx.value = 0;
        savedTy.value = 0;
      },
      () => setImgNatural(null),
    );
  }, [uri]);

  // ── Gestures ────────────────────────────────────────────────────────────────
  const pan = Gesture.Pan()
    .onBegin(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate(e => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate(e => {
      scale.value = Math.max(0.3, Math.min(8, savedScale.value * e.scale));
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // ── Confirm: crop the circular region ───────────────────────────────────────
  const handleConfirm = async () => {
    if (!uri || !imgNatural) return;
    setLoading(true);

    try {
      // How the image is displayed (fitted to screen, no pan/scale applied yet)
      const fitScale = Math.min(W / imgNatural.w, H / imgNatural.h);
      const displayW = imgNatural.w * fitScale;
      const displayH = imgNatural.h * fitScale;

      // With the user's scale applied, the displayed image dimensions grow
      const scaledW = displayW * scale.value;
      const scaledH = displayH * scale.value;

      // Top-left corner of the scaled+translated image on screen
      const imgLeft = (W - scaledW) / 2 + tx.value;
      const imgTop  = (H - scaledH) / 2 + ty.value;

      // The crop circle bounds on screen
      const circleLeft = cropCX - cropR;
      const circleTop  = cropCY - cropR;
      const circleDiam = cropR * 2;

      // Convert from screen coordinates to original image pixel coordinates
      const pxPerScreenPx = imgNatural.w / scaledW;   // original px per screen px

      const originX = Math.max(0, (circleLeft - imgLeft) * pxPerScreenPx);
      const originY = Math.max(0, (circleTop  - imgTop)  * pxPerScreenPx);
      const cropW   = Math.min(imgNatural.w - originX, circleDiam * pxPerScreenPx);
      const cropH   = Math.min(imgNatural.h - originY, circleDiam * pxPerScreenPx);

      // Guard against degenerate crops
      if (cropW < 4 || cropH < 4) {
        runOnJS(onConfirm)(uri);
        return;
      }

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          {
            crop: {
              originX: Math.floor(originX),
              originY: Math.floor(originY),
              width:   Math.floor(cropW),
              height:  Math.floor(cropH),
            },
          },
          { resize: { width: 600, height: 600 } },
        ],
        { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
      );

      runOnJS(onConfirm)(result.uri);
    } catch {
      // Fallback: pass original URI without crop
      runOnJS(onConfirm)(uri);
    } finally {
      setLoading(false);
    }
  };

  // ── Compute display size for the Image element ───────────────────────────────
  const displayW = imgNatural
    ? imgNatural.w * Math.min(W / imgNatural.w, H / imgNatural.h)
    : W;
  const displayH = imgNatural
    ? imgNatural.h * Math.min(W / imgNatural.w, H / imgNatural.h)
    : H;

  return (
    <Modal visible={!!uri} animationType="fade" statusBarTranslucent>
      <View style={styles.container}>

        {/* ── Pannable / zoomable image ── */}
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.imgWrap, animStyle]}>
            {uri && (
              <Image
                source={{ uri }}
                style={{ width: displayW, height: displayH }}
                resizeMode="contain"
              />
            )}
          </Animated.View>
        </GestureDetector>

        {/* ── Circular mask overlay (SVG) ── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={W} height={H}>
            <Defs>
              <Mask id="hole">
                <Rect x={0} y={0} width={W} height={H} fill="white" />
                <Circle cx={cropCX} cy={cropCY} r={cropR} fill="black" />
              </Mask>
            </Defs>
            <Rect
              x={0} y={0} width={W} height={H}
              fill="rgba(0,0,0,0.65)"
              mask="url(#hole)"
            />
          </Svg>
          {/* Circular border ring */}
          <View
            pointerEvents="none"
            style={[
              styles.circleBorder,
              {
                width:        cropR * 2,
                height:       cropR * 2,
                borderRadius: cropR,
                left:         cropCX - cropR,
                top:          cropCY - cropR,
              },
            ]}
          />
        </View>

        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 58 : 24 }]}>
          <TouchableOpacity onPress={onCancel} style={styles.headerSide}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Move and Scale</Text>
          <View style={styles.headerSide} />
        </View>

        {/* ── Hint ── */}
        <Text style={[styles.hint, { top: (Platform.OS === 'ios' ? 58 : 24) + 52 }]}>
          Pinch to zoom · Drag to reposition
        </Text>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          {loading ? (
            <ActivityIndicator color="white" size="large" />
          ) : (
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmText}>Use Photo</Text>
            </TouchableOpacity>
          )}
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBorder: {
    position:    'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  header: {
    position:       'absolute',
    top:            0,
    left:           0,
    right:          0,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom:  12,
  },
  headerSide: { width: 72 },
  headerTitle: {
    color: 'white', fontSize: 16, fontWeight: '600',
    textAlign: 'center',
  },
  cancelText: { color: 'white', fontSize: 16 },
  hint: {
    position:   'absolute',
    left:       0,
    right:      0,
    color:      'rgba(255,255,255,0.55)',
    fontSize:   12,
    textAlign:  'center',
  },
  footer: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    paddingBottom:  Platform.OS === 'ios' ? 52 : 32,
    alignItems:     'center',
  },
  confirmBtn: {
    backgroundColor: 'white',
    paddingHorizontal: 44,
    paddingVertical:   14,
    borderRadius:      30,
  },
  confirmText: {
    color: '#000', fontSize: 16, fontWeight: '700',
  },
});
