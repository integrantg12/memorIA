import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BigButton, Body, Card, Screen, Tile, useLoader } from '../components/ui';
import { countDue, getSettings, listNotes } from '../db/repositories';
import { computeNextStep, NextStep } from '../services/nextStep';
import { say } from '../services/speech';
import { colors, font, space } from '../theme';
import { hhmmOf, longDate } from '../utils/time';

const KIND_COLOR: Record<NextStep['kind'], string> = {
  overdue: colors.danger,
  focus: colors.focus,
  med: colors.primary,
  appointment: colors.info,
  routine: colors.success,
  free: colors.success,
};

const KIND_ICON: Record<NextStep['kind'], string> = {
  overdue: '⚠️',
  focus: '🎯',
  med: '💊',
  appointment: '📅',
  routine: '🔔',
  free: '🌿',
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * PAINEL — mostra SÓ o próximo passo, gigante. Todo o resto é acessado por blocos grandes,
 * sem menus, abas ou ícones de hambúrguer.
 */
export default function Dashboard() {
  const now = useClock();
  const { data } = useLoader(async () => {
    const [step, settings, due, faces, notes] = await Promise.all([
      computeNextStep(),
      getSettings(),
      countDue('flashcard'),
      countDue('face'),
      listNotes(),
    ]);
    return { step, settings, due: due + faces, notes: notes.length, at: Date.now() };
  });

  // Recalcula o próximo passo a cada atualização do relógio.
  const [fresh, setFresh] = useState<{ step: NextStep; at: number } | null>(null);
  useEffect(() => {
    computeNextStep()
      .then((st) => setFresh({ step: st, at: Date.now() }))
      .catch(() => undefined);
  }, [now]);
  // Usa o cálculo mais recente: o do relógio ou o recarregado ao voltar para esta tela.
  const step = fresh && (!data || fresh.at > data.at) ? fresh.step : (data?.step ?? null);

  const color = step ? KIND_COLOR[step.kind] : colors.primary;
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Body dim>
            {greeting}
            {data?.settings.userName ? `, ${data.settings.userName}` : ''}
          </Body>
          <Body>{longDate(now)}</Body>
        </View>
        <Text style={{ color: colors.text, fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{hhmmOf(now)}</Text>
      </View>

      {/* PRÓXIMO PASSO */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={step ? `Próximo passo: ${step.title}. ${step.when}. Toque para ouvir.` : 'Carregando'}
        onPress={() => step && say(step.speech, { force: true })}
        style={{ borderRadius: 24, borderWidth: 4, borderColor: color, backgroundColor: colors.surface, padding: space.lg, gap: space.sm }}
      >
        <Text style={{ color, fontSize: font.body, fontWeight: '900', letterSpacing: 1 }}>PRÓXIMO PASSO  🔊</Text>
        <Text style={{ color: colors.text, fontSize: font.huge, fontWeight: '900', lineHeight: font.huge * 1.15 }}>
          {step ? `${KIND_ICON[step.kind]} ${step.title}` : '…'}
        </Text>
        {step ? (
          <>
            <Text style={{ color, fontSize: font.large, fontWeight: '800' }}>{step.when}</Text>
            <Body>{step.detail}</Body>
          </>
        ) : null}
      </Pressable>
      {step?.action ? (
        <BigButton
          label={step.action.label}
          variant={step.kind === 'overdue' ? 'danger' : 'primary'}
          onPress={() => router.push({ pathname: step.action!.route as never, params: step.action!.params ?? {} })}
        />
      ) : null}

      {/* BLOCOS */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Tile icon="🎯" label="Foco" color={colors.focus} fg={colors.onFocus} onPress={() => router.push('/focus')} />
        <Tile icon="🚪" label="Vou sair" color={colors.primary} fg={colors.onPrimary} onPress={() => router.push({ pathname: '/exit-checklist', params: { trigger: 'manual' } })} />
        <Tile icon="🔑" label="Onde guardei?" color={colors.info} fg={colors.onInfo} onPress={() => router.push('/lost-found')} />
        <Tile icon="🧭" label="Me orienta" color={colors.success} fg={colors.onSuccess} onPress={() => router.push('/orient')} />
        <Tile icon="🧠" label="Treino" onPress={() => router.push('/training')} badge={data?.due || undefined} />
        <Tile icon="💭" label="Anotar ideia" onPress={() => router.push('/notes')} badge={data?.notes || undefined} />
        <Tile icon="🆘" label="EMERGÊNCIA" color={colors.danger} fg={colors.onDanger} wide onPress={() => router.push('/emergency')} />
        <Tile icon="⚙️" label="Ajustes" onPress={() => router.push('/settings')} />
        <Tile icon="📊" label="Meu tempo" onPress={() => router.push('/metrics')} />
      </View>

      {data && !data.settings.ttsEnabled ? (
        <Card>
          <Body dim>Voz desligada. Ative em Ajustes para ouvir os alertas.</Body>
        </Card>
      ) : null}
    </Screen>
  );
}
