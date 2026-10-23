import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Text, Vibration, View } from 'react-native';

import { BackBar, BigButton, BigInput, Body, Card, Chip, NumberPicker, Screen, useLoader } from '../components/ui';
import { getActiveTimer, TaskTimer } from '../db/repositories';
import {
  computeMetrics,
  elapsedMs,
  finishFocus,
  pauseFocus,
  recordCheckin,
  resumeFocus,
  saveBreadcrumb,
  startFocus,
  suggestEstimate,
} from '../services/focusTimer';
import { say } from '../services/speech';
import { colors, font, RADIUS, space } from '../theme';
import { formatDuration } from '../utils/time';

function KeepAwake() {
  useKeepAwake();
  return null;
}

/** MONITOR DE FOCO — barra visual de tempo + check-ins de atenção. */
export default function FocusScreen() {
  const params = useLocalSearchParams<{ checkin?: string; answer?: string }>();
  const { data, reload } = useLoader(async () => ({ timer: await getActiveTimer(), metrics: await computeMetrics() }));
  const [, setTick] = useState(0);
  const [keepAwake, setKeepAwake] = useState(false);
  const timer = data?.timer ?? null;
  // O modal de check-in aparece enquanto o parâmetro ?checkin=1 (vindo da notificação) existir.
  const askCheckin = !!timer && params.checkin === '1' && !params.answer;

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const answer = async (r: 'focused' | 'distracted') => {
    if (!timer) return;
    router.setParams({ answer: undefined, checkin: undefined });
    await recordCheckin(timer.id, r);
    if (r === 'distracted') await say(`Tudo bem. Respire fundo e volte para: ${timer.title}.`);
    else await say('Ótimo, continue!');
  };

  // Resposta dada direto pelos botões da notificação.
  useEffect(() => {
    if (timer && (params.answer === 'focused' || params.answer === 'distracted')) answer(params.answer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.id, params.answer]);

  useEffect(() => {
    if (!askCheckin || !timer) return;
    Vibration.vibrate([0, 300, 150, 300]);
    say(`Você ainda está focado em: ${timer.title}?`);
  }, [askCheckin, timer]);

  if (!data) return <Screen><BackBar title="Foco" /></Screen>;

  if (!timer) {
    return <StartForm medianRatio={data.metrics.medianRatio} onStarted={reload} />;
  }

  const elapsed = elapsedMs(timer);
  const estMs = timer.estimatedMin * 60_000;
  const over = elapsed > estMs;
  const progress = Math.min(1, elapsed / estMs);
  const paused = timer.status === 'paused';

  return (
    <Screen>
      {keepAwake ? <KeepAwake /> : null}
      <BackBar />
      <Text style={{ color: colors.focus, fontSize: font.body, fontWeight: '900' }}>FAZENDO AGORA</Text>
      <Text style={{ color: colors.text, fontSize: font.title, fontWeight: '900' }}>{timer.title}</Text>

      <Card color={over ? colors.danger : colors.focus}>
        <Text
          style={{ color: over ? colors.danger : colors.text, fontSize: 76, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] }}
          accessibilityLabel={over ? `Passou ${Math.round((elapsed - estMs) / 60000)} minutos do previsto` : `Faltam ${Math.round((estMs - elapsed) / 60000)} minutos`}
        >
          {over ? `+${formatDuration(elapsed - estMs)}` : formatDuration(estMs - elapsed)}
        </Text>
        <Body center dim>
          {over ? 'além do previsto' : 'restantes'} · previsto {timer.estimatedMin} min · decorrido {formatDuration(elapsed)}
        </Body>
        {/* Barra "Time Timer": o tempo literalmente encolhendo na tela. */}
        <View style={{ height: 36, borderRadius: RADIUS, backgroundColor: colors.surfaceAlt, overflow: 'hidden', borderWidth: 2, borderColor: colors.border }}>
          <View style={{ width: `${(1 - progress) * 100}%`, height: '100%', backgroundColor: over ? colors.danger : colors.focus }} />
        </View>
        {paused ? <Body center size={font.large}>⏸️ Pausado</Body> : null}
      </Card>

      <BigButton label="Terminei!" icon="✅" variant="success" onPress={async () => {
        await finishFocus(timer.id, 'done');
        const mins = Math.round(elapsed / 60000);
        await say(`Parabéns! Você levou ${mins} minutos. O previsto era ${timer.estimatedMin}.`);
        reload();
      }} />
      <BigButton
        label={paused ? 'Retomar' : 'Pausar'}
        icon={paused ? '▶️' : '⏸️'}
        variant="ghost"
        onPress={async () => {
          if (paused) await resumeFocus(timer.id);
          else await pauseFocus(timer.id);
          reload();
        }}
      />
      <BigButton label={keepAwake ? 'Tela sempre acesa: ligada' : 'Manter tela acesa'} icon="💡" small variant="ghost" onPress={() => setKeepAwake((k) => !k)} />

      <Breadcrumb timer={timer} />

      <BigButton label="Desistir desta tarefa" small variant="ghost" onPress={async () => {
        await finishFocus(timer.id, 'abandoned');
        reload();
      }} />

      <Modal visible={askCheckin} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={{ flex: 1, backgroundColor: '#000000EE', justifyContent: 'center', padding: space.md, gap: space.md }}>
          <Text style={{ color: colors.text, fontSize: font.huge, fontWeight: '900', textAlign: 'center' }}>Você ainda está focado nesta tarefa?</Text>
          <Text style={{ color: colors.focus, fontSize: font.title, fontWeight: '800', textAlign: 'center' }}>{timer.title}</Text>
          <BigButton label="Sim, focado" icon="✅" variant="success" onPress={() => answer('focused')} />
          <BigButton label="Me distraí" icon="😵" variant="danger" onPress={() => answer('distracted')} />
        </View>
      </Modal>
    </Screen>
  );
}

/** "Onde parei?" — âncora de contexto para quando a interrupção acontecer. */
function Breadcrumb({ timer }: { timer: TaskTimer }) {
  const [note, setNote] = useState(timer.note ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <Card>
      <Body>📌 Onde eu parei? (para retomar depois de uma interrupção)</Body>
      <BigInput value={note} onChangeText={(t) => { setNote(t); setSaved(false); }} placeholder="Ex.: terminei o parágrafo 2" multiline />
      <BigButton small variant="info" label={saved ? 'Anotado ✓' : 'Salvar anotação'} onPress={async () => { await saveBreadcrumb(timer.id, note); setSaved(true); }} />
    </Card>
  );
}

const PRESETS = ['Lavar a louça', 'Responder e-mails', 'Estudar', 'Arrumar o quarto', 'Pagar contas', 'Tomar banho'];

function StartForm({ medianRatio, onStarted }: { medianRatio: number; onStarted: () => void }) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [every, setEvery] = useState(10);
  const suggested = suggestEstimate(minutes, medianRatio);

  return (
    <Screen>
      <BackBar title="🎯 Começar uma tarefa" />
      <BigInput label="O que você vai fazer?" value={title} onChangeText={setTitle} placeholder="Uma tarefa só" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {PRESETS.map((p) => <Chip key={p} label={p} selected={title === p} onPress={() => setTitle(p)} />)}
      </View>

      <Body>Quanto tempo você acha que leva?</Body>
      <NumberPicker value={minutes} onChange={setMinutes} step={5} min={5} max={240} suffix=" min" />
      {suggested !== minutes ? (
        <Card color={colors.info}>
          <Body>{`⏱️ Pelo seu histórico, tarefas levam ${medianRatio.toFixed(1).replace('.', ',')}× o previsto. Que tal ${suggested} min?`}</Body>
          <BigButton small variant="info" label={`Usar ${suggested} min`} onPress={() => setMinutes(suggested)} />
        </Card>
      ) : null}

      <Body>Perguntar se ainda estou focado a cada:</Body>
      <NumberPicker value={every} onChange={setEvery} step={5} min={5} max={60} suffix=" min" />

      <BigButton
        label="Começar agora"
        icon="▶️"
        variant="focus"
        disabled={!title.trim()}
        onPress={async () => {
          await startFocus(title, minutes, every);
          onStarted();
          await say(`Começando: ${title}. Previsto ${minutes} minutos. Eu pergunto a cada ${every} minutos se você está focado.`);
        }}
      />
    </Screen>
  );
}
