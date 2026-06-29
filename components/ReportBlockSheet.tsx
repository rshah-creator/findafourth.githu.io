/**
 * ReportBlockSheet — multi-step bottom sheet for reporting and/or blocking another user.
 *
 * Steps:
 *   action-menu    → choose Report or Block (shown when launched from ellipsis ...)
 *   report-reasons → pick a reason + optional "Other" text input
 *   prompt-block   → after submitting report, ask if also want to block
 *   block-confirm  → confirm the block action
 *   prompt-report  → after blocking, ask if also want to report
 *
 * targetType='broadcast' skips all block-related steps (you can report a game post
 * but cannot block it).
 *
 * canBlock=false means after submitting a report the flow just closes (no prompt-block).
 * This is used when Report is available but Block is contextually unavailable (Discover tab).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  TouchableOpacity, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '@/context/AppContext';
import { GRAD_COLORS } from '@/constants/Colors';

type Step =
  | 'action-menu'
  | 'report-reasons'
  | 'prompt-block'
  | 'block-confirm'
  | 'prompt-report';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called only when a report is actually submitted (not on cancel). */
  onSubmitted?: () => void;
  targetId: string;
  targetName: string;
  /** 'broadcast' = no block option at all */
  targetType: 'user' | 'broadcast';
  /** false = suppress prompt-block after reporting (Discover player profiles) */
  canBlock?: boolean;
  initialStep: 'action-menu' | 'report-reasons' | 'block-confirm';
}

const REASONS = [
  'Inappropriate language or profanity',
  'Fake or impersonating profile',
  'Harassment or abusive behaviour',
  'Spam or irrelevant content',
  'Other',
];

export function ReportBlockSheet({
  visible, onClose, onSubmitted, targetId, targetName, targetType,
  canBlock = false, initialStep,
}: Props) {
  const { colors, blockUser } = useApp();
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<Step>(initialStep);
  const [selectedReason, setReason]   = useState('');
  const [otherText, setOtherText]     = useState('');

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setStep(initialStep);
      setReason('');
      setOtherText('');
    }
  }, [visible]);

  const handleSubmitReport = () => {
    onSubmitted?.();           // notify caller that a report was submitted
    if (targetType === 'broadcast' || !canBlock) {
      onClose();
    } else {
      setStep('prompt-block');
    }
  };

  const handleBlock = () => {
    blockUser(targetId);
    setStep('prompt-report');
  };

  const handleBlockAndClose = () => {
    blockUser(targetId);
    onClose();
  };

  const canSubmit = !!selectedReason && (selectedReason !== 'Other' || otherText.trim().length > 0);

  const renderContent = () => {
    switch (step) {

      // ── Action menu ──────────────────────────────────────────────────────────
      case 'action-menu':
        return (
          <>
            <Text style={[styles.sheetTitle, { color: colors.tx1 }]}>Options</Text>
            <View style={[styles.menuList, { borderColor: colors.br3 }]}>
              <TouchableOpacity
                style={[styles.menuRow, { borderBottomColor: colors.br3 }]}
                onPress={() => setStep('report-reasons')}
              >
                <Ionicons name="flag-outline" size={18} color={colors.tx2} />
                <Text style={[styles.menuRowText, { color: colors.tx1 }]}>Report {targetName}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.tx3} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuRow, { borderBottomWidth: 0 }]}
                onPress={() => setStep('block-confirm')}
              >
                <Ionicons name="ban-outline" size={18} color={colors.red} />
                <Text style={[styles.menuRowText, { color: colors.red }]}>Block {targetName}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.tx3} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.tx3 }]}>Cancel</Text>
            </TouchableOpacity>
          </>
        );

      // ── Report reasons ───────────────────────────────────────────────────────
      case 'report-reasons':
        return (
          <>
            <Text style={[styles.sheetTitle, { color: colors.tx1 }]}>
              {targetType === 'broadcast' ? 'Report this broadcast' : `Report ${targetName}`}
            </Text>
            <Text style={[styles.sheetSub, { color: colors.tx2 }]}>
              What's the issue? This will be reviewed by our team.
            </Text>

            <View style={[styles.reasonList, { borderColor: colors.br3 }]}>
              {REASONS.map((reason, i) => {
                const selected = selectedReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[
                      styles.reasonRow,
                      { borderBottomColor: colors.br3 },
                      i === REASONS.length - 1 && { borderBottomWidth: 0 },
                      selected && { backgroundColor: colors.pTint },
                    ]}
                    onPress={() => setReason(reason)}
                  >
                    <View style={[
                      styles.radio,
                      { borderColor: selected ? colors.p1 : colors.br2 },
                      selected && { backgroundColor: colors.p1 },
                    ]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.reasonText, { color: selected ? colors.p1 : colors.tx1 }]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedReason === 'Other' && (
              <TextInput
                style={[styles.otherInput, { backgroundColor: colors.bg2, color: colors.tx1, borderColor: colors.br2 }]}
                placeholder="Tell us more…"
                placeholderTextColor={colors.tx3}
                value={otherText}
                onChangeText={setOtherText}
                multiline
                numberOfLines={3}
              />
            )}

            <LinearGradient
              colors={canSubmit ? GRAD_COLORS : [colors.bg3, colors.bg3] as any}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
            >
              <TouchableOpacity
                style={styles.submitBtnInner}
                onPress={handleSubmitReport}
                disabled={!canSubmit}
              >
                <Text style={[styles.submitBtnText, !canSubmit && { color: colors.tx3 }]}>
                  Submit Report
                </Text>
              </TouchableOpacity>
            </LinearGradient>

            <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.tx3 }]}>Cancel</Text>
            </TouchableOpacity>
          </>
        );

      // ── Prompt block (after report) ──────────────────────────────────────────
      case 'prompt-block':
        return (
          <>
            <View style={styles.centeredIcon}>
              <Ionicons name="shield-checkmark-outline" size={48} color={colors.p1} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.tx1 }]}>Report submitted</Text>
            <Text style={[styles.sheetSub, { color: colors.tx2 }]}>
              Do you also want to block {targetName}? They won't be able to contact you or see your profile.
            </Text>
            <LinearGradient
              colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.submitBtn}
            >
              <TouchableOpacity style={styles.submitBtnInner} onPress={handleBlockAndClose}>
                <Text style={styles.submitBtnText}>Block {targetName}</Text>
              </TouchableOpacity>
            </LinearGradient>
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: colors.br2 }]}
              onPress={onClose}
            >
              <Text style={[styles.ghostBtnText, { color: colors.tx1 }]}>Report only</Text>
            </TouchableOpacity>
          </>
        );

      // ── Block confirm ────────────────────────────────────────────────────────
      case 'block-confirm':
        return (
          <>
            <View style={styles.centeredIcon}>
              <Ionicons name="ban-outline" size={48} color={colors.red} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.tx1 }]}>Block {targetName}?</Text>
            <Text style={[styles.sheetSub, { color: colors.tx2 }]}>
              They won't see your profile, can't message you, and you won't see their posts. You can unblock them later in Settings.
            </Text>
            <TouchableOpacity
              style={[styles.dangerBtn, { backgroundColor: colors.red }]}
              onPress={handleBlock}
            >
              <Text style={styles.dangerBtnText}>Block {targetName}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: colors.br2 }]}
              onPress={onClose}
            >
              <Text style={[styles.ghostBtnText, { color: colors.tx1 }]}>Cancel</Text>
            </TouchableOpacity>
          </>
        );

      // ── Prompt report (after block) ──────────────────────────────────────────
      case 'prompt-report':
        return (
          <>
            <View style={styles.centeredIcon}>
              <View style={[styles.blockedBadge, { backgroundColor: colors.bg3 }]}>
                <Ionicons name="ban-outline" size={28} color={colors.tx3} />
              </View>
            </View>
            <Text style={[styles.sheetTitle, { color: colors.tx1 }]}>{targetName} has been blocked</Text>
            <Text style={[styles.sheetSub, { color: colors.tx2 }]}>
              Would you also like to report them to our team?
            </Text>
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: colors.br2 }]}
              onPress={() => { setReason(''); setStep('report-reasons'); }}
            >
              <Text style={[styles.ghostBtnText, { color: colors.tx1 }]}>Report {targetName}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.tx3 }]}>No thanks</Text>
            </TouchableOpacity>
          </>
        );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.bg1, paddingBottom: insets.bottom + 24 }]}>
        {/* Handle bar + close */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: colors.br2 }]} />
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={colors.tx3} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderContent()}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  handleRow: {
    alignItems: 'center', paddingTop: 12, paddingHorizontal: 20, marginBottom: 4,
  },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  closeBtn: { position: 'absolute', right: 16, top: 12, padding: 4 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 12 },

  sheetTitle: { fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  sheetSub: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 4 },

  // Action menu
  menuList: { borderRadius: 14, borderWidth: 0.5, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 0.5,
  },
  menuRowText: { fontSize: 15 },

  // Report reasons
  reasonList: { borderRadius: 14, borderWidth: 0.5, overflow: 'hidden' },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'white' },
  reasonText: { fontSize: 14, flex: 1 },
  otherInput: {
    borderRadius: 12, borderWidth: 0.5,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, minHeight: 80, textAlignVertical: 'top',
  },

  // Buttons
  submitBtn: { borderRadius: 14, overflow: 'hidden' },
  submitBtnInner: { alignItems: 'center', paddingVertical: 15 },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  ghostBtn: {
    borderRadius: 14, borderWidth: 0.5,
    alignItems: 'center', paddingVertical: 14,
  },
  ghostBtnText: { fontSize: 15, fontWeight: '600' },
  dangerBtn: { borderRadius: 14, alignItems: 'center', paddingVertical: 15 },
  dangerBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  cancelLink: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 14 },

  // Icons
  centeredIcon: { alignItems: 'center', paddingVertical: 8 },
  blockedBadge: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
});
