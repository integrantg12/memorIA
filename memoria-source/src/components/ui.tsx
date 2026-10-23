import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { ReactNode, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, RADIUS, space, TOUCH_MIN } from '../theme';
import { pad, parseHHMM, toHHMM, WEEKDAY_SHORT } from '../utils/time';

// ───────────── Estrutura de tela ─────────────

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[padded && styles.padded, { gap: space.md }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <Text accessibilityRole="header" style={[styles.title, center && { textAlign: 'center' }]}>
      {children}
    </Text>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.h2}>
      {children}
    </Text>
  );
}

export function Body({ children, dim, center, size }: { children: ReactNode; dim?: boolean; center?: boolean; size?: number }) {
  return (
    <Text style={[styles.body, dim && { color: colors.textDim }, center && { textAlign: 'center' }, size ? { fontSize: size, lineHeight: size * 1.3 } : null]}>
      {children}
    </Text>
  );
}

export function Card({ children, color, style }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, color ? { borderColor: color } : null, style]}>{children}</View>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

/** Botão "Voltar" grande no topo — substitui a seta pequena do cabeçalho nativo. */
export function BackBar({ title }: { title?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.backText}>⬅  Voltar</Text>
      </Pressable>
      {title ? <Title>{title}</Title> : null}
    </View>
  );
}

// ───────────── Botões ─────────────

type Variant = 'primary' | 'success' | 'danger' | 'info' | 'focus' | 'ghost';
const VARIANT: Record<Variant, { bg: string; fg: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary },
  success: { bg: colors.success, fg: colors.onSuccess },
  danger: { bg: colors.danger, fg: colors.onDanger },
  info: { bg: colors.info, fg: colors.onInfo },
  focus: { bg: colors.focus, fg: colors.onFocus },
  ghost: { bg: colors.surface, fg: colors.text },
};

export function BigButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  small,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: string;
  disabled?: boolean;
  small?: boolean;
  accessibilityHint?: string;
}) {
  const v = VARIANT[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, minHeight: small ? 60 : TOUCH_MIN + 8 },
        variant === 'ghost' && { borderWidth: 2, borderColor: colors.border },
        disabled && { opacity: 0.35 },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 },
      ]}
    >
      <Text style={[styles.buttonText, { color: v.fg, fontSize: small ? font.body : font.large }]}>
        {icon ? `${icon}  ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

/** Bloco grande do painel (navegação sem menus). */
export function Tile({ label, icon, onPress, color = colors.surfaceAlt, fg = colors.text, badge, wide }: {
  label: string;
  icon: string;
  onPress: () => void;
  color?: string;
  fg?: string;
  badge?: string | number;
  wide?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: color, flexBasis: wide ? '100%' : '47%' },
        pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
      ]}
    >
      <Text style={{ fontSize: 46 }}>{icon}</Text>
      <Text style={[styles.tileText, { color: fg }]}>{label}</Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.onPrimary }]}>
        {selected ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

/** Linha de checklist enorme, fácil de marcar. */
export function CheckRow({ label, checked, onToggle, sub }: { label: string; checked: boolean; onToggle: () => void; sub?: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onToggle();
      }}
      style={[styles.checkRow, checked && { borderColor: colors.success, backgroundColor: '#002914' }]}
    >
      <View style={[styles.checkBox, checked && { backgroundColor: colors.success, borderColor: colors.success }]}>
        {checked ? <Text style={{ fontSize: 30, color: colors.onSuccess, fontWeight: '900' }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.body, { fontWeight: '700' }]}>{label}</Text>
        {sub ? <Text style={[styles.body, { color: colors.info, fontSize: font.small }]}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

// ───────────── Entradas ─────────────

export function BigInput(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={[styles.body, { fontWeight: '700' }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor="#8A8A8A"
        selectionColor={colors.primary}
        accessibilityLabel={label ?? props.placeholder}
        {...rest}
        style={[styles.input, style]}
      />
    </View>
  );
}

function Stepper({ value, onMinus, onPlus, label }: { value: string; onMinus: () => void; onPlus: () => void; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: space.xs }}>
      <Pressable accessibilityLabel={`Aumentar ${label}`} onPress={onPlus} style={styles.stepBtn}>
        <Text style={styles.stepTxt}>▲</Text>
      </Pressable>
      <Text style={styles.timeValue} accessibilityLabel={`${label} ${value}`}>
        {value}
      </Text>
      <Pressable accessibilityLabel={`Diminuir ${label}`} onPress={onMinus} style={styles.stepBtn}>
        <Text style={styles.stepTxt}>▼</Text>
      </Pressable>
    </View>
  );
}

/** Seletor de horário com botões gigantes (sem relógio analógico confuso). */
export function TimePicker({ value, onChange, minuteStep = 5 }: { value: string; onChange: (v: string) => void; minuteStep?: number }) {
  const { h, m } = parseHHMM(value);
  return (
    <View style={styles.timeRow}>
      <Stepper label="hora" value={pad(h)} onPlus={() => onChange(toHHMM((h + 1) % 24, m))} onMinus={() => onChange(toHHMM((h + 23) % 24, m))} />
      <Text style={styles.timeValue}>:</Text>
      <Stepper
        label="minutos"
        value={pad(m)}
        onPlus={() => onChange(toHHMM(h, (m + minuteStep) % 60))}
        onMinus={() => onChange(toHHMM(h, (m - minuteStep + 60) % 60))}
      />
    </View>
  );
}

/** Número com +/- (minutos, doses…). */
export function NumberPicker({ value, onChange, step = 5, min = 0, max = 999, suffix = '' }: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <View style={[styles.timeRow, { gap: space.lg }]}>
      <Pressable accessibilityLabel="Diminuir" onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn}>
        <Text style={styles.stepTxt}>−</Text>
      </Pressable>
      <Text style={[styles.timeValue, { fontSize: 40 }]}>
        {value}
        {suffix}
      </Text>
      <Pressable accessibilityLabel="Aumentar" onPress={() => onChange(Math.min(max, value + step))} style={styles.stepBtn}>
        <Text style={styles.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

export function WeekdayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = value.includes(String(d));
        return (
          <Chip
            key={d}
            label={WEEKDAY_SHORT[d]}
            selected={on}
            onPress={() => {
              const set = new Set(value.split('').filter(Boolean));
              if (on) set.delete(String(d));
              else set.add(String(d));
              onChange([...set].sort().join(''));
            }}
          />
        );
      })}
    </View>
  );
}

// ───────────── Dados ─────────────

/** Carrega dados sempre que a tela ganha foco (dados frescos ao voltar de outra tela). */
export function useLoader<T>(fn: () => Promise<T>): { data: T | null; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fn()
        .then((d) => alive && setData(d))
        .catch((e) => console.warn('[memorIA] erro ao carregar', e))
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]),
  );
  return { data, loading, reload: () => setTick((t) => t + 1) };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: {
    alignSelf: 'flex-start',
    minHeight: 60,
    paddingHorizontal: space.md,
    borderRadius: RADIUS,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  backText: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  padded: { padding: space.md },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900', lineHeight: font.title * 1.2 },
  h2: { color: colors.primary, fontSize: font.large, fontWeight: '800', marginTop: space.sm },
  body: { color: colors.text, fontSize: font.body, lineHeight: font.body * 1.35 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    borderWidth: 2,
    borderColor: '#3A3A3A',
    padding: space.md,
    gap: space.sm,
  },
  button: {
    borderRadius: RADIUS,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontWeight: '900', textAlign: 'center' },
  tile: {
    flexGrow: 1,
    minHeight: 140,
    borderRadius: RADIUS,
    padding: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: 2,
    borderColor: '#FFFFFF33',
  },
  tileText: { fontSize: font.body, fontWeight: '900', textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.danger,
    borderRadius: 20,
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeText: { color: colors.onDanger, fontWeight: '900', fontSize: font.small },
  chip: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 40,
    paddingHorizontal: space.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  chipText: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_MIN + 10,
    borderWidth: 3,
    borderColor: '#555',
    borderRadius: RADIUS,
    padding: space.md,
    backgroundColor: colors.surface,
  },
  checkBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: font.large,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: RADIUS,
    paddingHorizontal: space.md,
    minHeight: TOUCH_MIN,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  timeValue: { color: colors.text, fontSize: 56, fontWeight: '900', fontVariant: ['tabular-nums'] },
  stepBtn: {
    width: 84,
    height: 64,
    borderRadius: RADIUS,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { color: colors.primary, fontSize: 30, fontWeight: '900' },
});
