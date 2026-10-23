import React from 'react';
import { Text, View } from 'react-native';

import { BackBar, Body, Card, H2, Screen, useLoader } from '../components/ui';
import { computeMetrics } from '../services/focusTimer';
import { colors, font, space } from '../theme';

/** Mapa do tempo: previsto × real, tempo perdido e horários de mais distração. */
export default function MetricsScreen() {
  const { data: m } = useLoader(computeMetrics);

  return (
    <Screen>
      <BackBar title="📊 Meu tempo" />
      {!m ? null : m.sessions === 0 ? (
        <Card>
          <Body>Ainda não há tarefas registradas. Use o Monitor de Foco e volte aqui para ver seu mapa do tempo.</Body>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="Previsto" value={`${m.totalEstimatedMin} min`} color={colors.info} />
            <Stat label="Real" value={`${m.totalActualMin} min`} color={colors.focus} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="Tempo além do previsto" value={`${m.lostMin} min`} color={colors.danger} />
            <Stat label="No prazo" value={`${Math.round(m.onTimeRate * 100)}%`} color={colors.success} />
          </View>
          <Card color={colors.primary}>
            <Body>
              {m.medianRatio > 1.05
                ? `Você costuma levar ${m.medianRatio.toFixed(1).replace('.', ',')}× o tempo que estima. O app já sugere estimativas corrigidas.`
                : 'Suas estimativas estão boas! Continue assim.'}
            </Body>
          </Card>

          <H2>Horários de distração</H2>
          {m.distractionWindows.length === 0 ? (
            <Body dim>Responda alguns check-ins de foco para descobrir seus horários difíceis.</Body>
          ) : (
            m.distractionWindows.slice(0, 6).map((w) => (
              <View key={w.hour} style={{ gap: 4 }}>
                <Body>{`${w.hour}h–${w.hour + 1}h · ${Math.round(w.rate * 100)}% distraído`}</Body>
                <View style={{ height: 22, backgroundColor: colors.surfaceAlt, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.max(4, w.rate * 100)}%`, height: '100%', backgroundColor: w.rate > 0.5 ? colors.danger : colors.primary }} />
                </View>
              </View>
            ))
          )}

          <H2>Últimas tarefas</H2>
          {m.recent.map((r, i) => {
            const ratio = r.actualMin / Math.max(1, r.estimatedMin);
            return (
              <Card key={i} color={r.status === 'abandoned' ? '#555' : ratio > 1.1 ? colors.danger : colors.success}>
                <Text style={{ color: colors.text, fontSize: font.body, fontWeight: '800' }}>{r.title}</Text>
                <Body dim>
                  {`Previsto ${r.estimatedMin} min · Real ${r.actualMin} min${r.status === 'abandoned' ? ' · desistiu' : ''}`}
                </Body>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, borderWidth: 3, borderColor: color, borderRadius: 18, padding: space.md, backgroundColor: colors.surface }}>
      <Text style={{ color, fontSize: font.title, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: colors.text, fontSize: font.small }}>{label}</Text>
    </View>
  );
}
