import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Text, Vibration, View } from 'react-native';

import { ChallengeView } from '../components/ChallengeView';
import { BigButton, Body, Card, Loading, Screen } from '../components/ui';
import { AlertLog, getAlert, getMedication, getSettings, Medication } from '../db/repositories';
import { acknowledgeAlert, MAX_SNOOZES, snoozeAlert } from '../services/alertEngine';
import { Challenge, makeChallenge } from '../services/challenges';
import { say, sayRepeating } from '../services/speech';
import { colors, font, space } from '../theme';
import { hhmmOf, relative } from '../utils/time';

/**
 * TELA DE ALERTA INTROMETIDO
 * - Botão "voltar" do Android e gesto de voltar ficam bloqueados.
 * - A tela fica acesa e o aviso é repetido em voz alta a cada 30 s.
 * - Só sai daqui resolvendo o desafio (palavra, cálculo ou código de barras do remédio).
 */
export default function AlertScreen() {
  useKeepAwake();
  const { key } = useLocalSearchParams<{ key: string }>();
  const [alert, setAlert] = useState<AlertLog | null>(null);
  const [med, setMed] = useState<Medication | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [solved, setSolved] = useState<string | null>(null);
  const voice = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!key) return;
    (async () => {
      const a = await getAlert(key);
      const s = await getSettings();
      setAlert(a);
      if (!a) return;
      if (a.acknowledgedAt) {
        setSolved(a.method ?? 'tap');
        return;
      }
      let m: Medication | null = null;
      if (a.kind === 'med' && a.refId) {
        m = await getMedication(a.refId);
        setMed(m);
      }
      setChallenge(m?.barcode ? makeChallenge('barcode', { expectedBarcode: m.barcode }) : makeChallenge(s.challenge));
      voice.current = sayRepeating(`${a.body} Para silenciar, resolva o desafio na tela.`, 30_000);
      Vibration.vibrate([0, 600, 300, 600]);
    })();
    return () => voice.current?.stop();
  }, [key]);

  if (!key) return <Redirect href="/" />;
  if (!alert) return <Loading />;

  const onSolved = async (method: string) => {
    voice.current?.stop();
    Vibration.cancel();
    setSolved(method);
    await say('Muito bem. Agora confirme o que você fez.');
  };

  const finish = async (method: string) => {
    await acknowledgeAlert(alert.alertKey, method);
    if (alert.kind === 'appointment' && alert.refId) {
      router.replace({ pathname: '/exit-checklist', params: { appointmentId: String(alert.refId), trigger: 'appointment' } });
    } else {
      router.replace('/');
    }
  };

  const snooze = async () => {
    await snoozeAlert(alert.alertKey, 10);
    await say('Certo. Volto a avisar em 10 minutos.');
    router.replace('/');
  };

  const scheduled = new Date(alert.scheduledFor);
  const doneLabel = alert.kind === 'med' ? 'Tomei agora' : alert.kind === 'appointment' ? 'Estou me preparando' : 'Feito';

  return (
    <Screen>
      <View style={{ backgroundColor: colors.danger, borderRadius: 24, padding: space.lg, gap: space.sm }}>
        <Text style={{ color: colors.onDanger, fontSize: font.body, fontWeight: '900' }}>
          ALERTA · {hhmmOf(scheduled)} ({relative(scheduled)})
        </Text>
        <Text style={{ color: colors.onDanger, fontSize: font.huge, fontWeight: '900', lineHeight: font.huge * 1.15 }}>{alert.title}</Text>
        <Text style={{ color: colors.onDanger, fontSize: font.large, fontWeight: '700' }}>{alert.body}</Text>
      </View>

      {med?.stock != null ? (
        <Card>
          <Body>{`📦 Estoque: ${med.stock} doses${med.stock <= med.refillThreshold ? ' — compre mais!' : ''}`}</Body>
        </Card>
      ) : null}

      {!solved && challenge ? (
        <>
          <Body center dim>Para silenciar este alerta, faça o desafio abaixo:</Body>
          <ChallengeView initial={challenge} onSolved={onSolved} />
        </>
      ) : null}

      {solved && !alert.acknowledgedAt ? (
        <View style={{ gap: space.sm }}>
          <Body center size={font.large}>✅ Desafio concluído</Body>
          <BigButton label={doneLabel} icon="✅" variant="success" onPress={() => finish(solved)} />
          {alert.snoozeCount < MAX_SNOOZES ? (
            <BigButton label="Adiar 10 minutos" icon="⏰" variant="ghost" onPress={snooze} />
          ) : (
            <Body dim center>Este alerta já foi adiado {MAX_SNOOZES} vezes.</Body>
          )}
          {alert.kind === 'med' ? (
            <BigButton label="Não vou tomar (pular dose)" small variant="ghost" onPress={() => finish('skipped')} />
          ) : null}
        </View>
      ) : null}

      {alert.acknowledgedAt ? (
        <View style={{ gap: space.sm }}>
          <Body center size={font.large}>{`Já confirmado às ${hhmmOf(new Date(alert.acknowledgedAt))}.`}</Body>
          <BigButton label="Voltar ao início" onPress={() => router.replace('/')} />
        </View>
      ) : null}
    </Screen>
  );
}
