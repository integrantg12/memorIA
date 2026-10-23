import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, ScrollViewInstance, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppointmentForm, ContactForm, MedicationForm } from '../components/forms';
import { BigButton, BigInput, Body, Card, Chip, TimePicker, WeekdayPicker } from '../components/ui';
import { AppointmentInput, MedicationInput, setHome } from '../db/repositories';
import { registerBackgroundReplan } from '../services/backgroundTasks';
import { currentPosition, requestLocationPermissions } from '../services/geofence';
import { ensureNotificationPermission } from '../services/notifications';
import { openBatterySettings, openExactAlarmSettings, openOverlaySettings } from '../services/permissions';
import { COMMON_ITEMS, OnboardingData, saveOnboarding } from '../services/setup';
import { say, stopSpeaking } from '../services/speech';
import { colors, font, RADIUS, space } from '../theme';
import { weekdaysLabel } from '../utils/time';

type StepId =
  | 'intro' | 'name' | 'voice' | 'wake' | 'sleep' | 'meals' | 'work' | 'meds' | 'appointments'
  | 'items' | 'contacts' | 'challenge' | 'home' | 'permissions' | 'done';

const ORDER: StepId[] = ['intro', 'name', 'voice', 'wake', 'sleep', 'meals', 'work', 'meds', 'appointments', 'items', 'contacts', 'challenge', 'home', 'permissions', 'done'];

interface Msg {
  from: 'bot' | 'user';
  text: string;
}

const DEFAULT_MEALS = [
  { label: 'Café da manhã', time: '07:30' },
  { label: 'Almoço', time: '12:00' },
  { label: 'Lanche', time: '16:00' },
  { label: 'Jantar', time: '19:30' },
];

const EMPTY: OnboardingData = {
  name: '',
  voice: true,
  wake: '07:00',
  sleep: '23:00',
  meals: [DEFAULT_MEALS[0], DEFAULT_MEALS[1], DEFAULT_MEALS[3]],
  work: null,
  meds: [],
  appointments: [],
  items: ['Chaves', 'Celular', 'Carteira'],
  contacts: [],
  challenge: 'math',
};

/**
 * ENTREVISTA INICIAL em formato de conversa: uma pergunta por vez, respostas por botões
 * grandes sempre que possível (digitar só quando inevitável). A voz lê cada pergunta.
 */
export default function Onboarding() {
  const [step, setStep] = useState<StepId>('intro');
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ from: 'bot', text: QUESTIONS.intro(EMPTY) }]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const [d, setD] = useState<OnboardingData>(EMPTY);
  const [homeSet, setHomeSet] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // A cada novo passo: lê a pergunta em voz alta e rola até o fim da conversa.
  useEffect(() => {
    const last = msgs[msgs.length - 1];
    if (voiceOn && last?.from === 'bot') say(last.text, { force: true });
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const answer = (text: string, patch?: Partial<OnboardingData>, enableVoice?: boolean) => {
    stopSpeaking();
    const nd = { ...d, ...patch };
    const next = ORDER[ORDER.indexOf(step) + 1];
    setD(nd);
    if (enableVoice !== undefined) setVoiceOn(enableVoice);
    setMsgs((m) => [...m, { from: 'user', text }, { from: 'bot', text: QUESTIONS[next](nd) }]);
    setStep(next);
  };

  const finish = async () => {
    setSaving(true);
    try {
      await saveOnboarding(d);
      await registerBackgroundReplan().catch(() => undefined);
      await say(`Tudo pronto, ${d.name}. Eu cuido dos lembretes. Sua tela inicial mostra sempre o próximo passo.`);
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ padding: space.md, paddingBottom: 0 }}>
          <Text style={{ color: colors.primary, fontSize: font.body, fontWeight: '900' }}>
            memorIA · passo {ORDER.indexOf(step) + 1} de {ORDER.length}
          </Text>
          <View style={{ height: 10, backgroundColor: colors.surfaceAlt, borderRadius: 5, marginTop: 6 }}>
            <View style={{ height: 10, width: `${((ORDER.indexOf(step) + 1) / ORDER.length) * 100}%`, backgroundColor: colors.primary, borderRadius: 5 }} />
          </View>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: space.md, gap: space.sm }} keyboardShouldPersistTaps="handled">
          {msgs.map((m, i) => (
            <Bubble key={i} msg={m} />
          ))}
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            <StepInput
              key={step}
              step={step}
              data={d}
              setData={setD}
              answer={answer}
              homeSet={homeSet}
              setHomeSet={setHomeSet}
              finish={finish}
              saving={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const QUESTIONS: Record<StepId, (d: OnboardingData) => string> = {
  intro: () => 'Oi! Eu sou o memorIA 🧠. Vou te ajudar a lembrar das coisas. Tudo fica guardado só neste celular — nada vai para a internet. Vamos começar? São perguntas rápidas.',
  name: () => 'Como você gosta de ser chamado?',
  voice: (d) => `Prazer, ${d.name}! Quer que eu fale os avisos em voz alta?`,
  wake: () => 'Que horas você costuma acordar?',
  sleep: () => 'E que horas costuma dormir?',
  meals: () => 'Quais refeições você quer que eu lembre? Ajuste os horários se precisar.',
  work: () => 'Você trabalha ou estuda em horário fixo?',
  meds: (d) => (d.meds.length ? `Anotei ${d.meds.length} remédio(s). Tem mais algum?` : 'Você toma algum remédio de uso contínuo?'),
  appointments: (d) =>
    d.appointments.length ? `Anotei ${d.appointments.length} compromisso(s). Mais algum?` : 'Tem compromissos fixos toda semana? (terapia, academia, aula…)',
  items: () => 'O que você precisa levar SEMPRE que sai de casa? Toque para marcar.',
  contacts: (d) => (d.contacts.length ? 'Quer adicionar outro contato de emergência?' : 'Quem eu devo mostrar no botão de EMERGÊNCIA?'),
  challenge: () => 'Para desligar um alerta importante você vai precisar fazer um pequeno desafio. Qual prefere?',
  home: () => 'Você está em casa agora? Se sim, eu marco este lugar para lembrar o checklist quando você sair.',
  permissions: () => 'Último passo: preciso de algumas permissões para os alertas funcionarem mesmo com o celular bloqueado.',
  done: (d) => `Pronto, ${d.name}! Montei sua rotina, ${d.meds.length} remédio(s), ${d.appointments.length} compromisso(s) e seu checklist de saída.`,
};

function Bubble({ msg }: { msg: Msg }) {
  const bot = msg.from === 'bot';
  return (
    <View
      style={{
        alignSelf: bot ? 'flex-start' : 'flex-end',
        maxWidth: '88%',
        backgroundColor: bot ? colors.surfaceAlt : colors.primary,
        borderRadius: RADIUS,
        borderBottomLeftRadius: bot ? 4 : RADIUS,
        borderBottomRightRadius: bot ? RADIUS : 4,
        padding: space.md,
      }}
    >
      <Text style={{ color: bot ? colors.text : colors.onPrimary, fontSize: font.body, lineHeight: font.body * 1.35, fontWeight: bot ? '500' : '800' }}>
        {msg.text}
      </Text>
    </View>
  );
}

interface StepProps {
  step: StepId;
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  answer: (text: string, patch?: Partial<OnboardingData>, enableVoice?: boolean) => void;
  homeSet: boolean;
  setHomeSet: (v: boolean) => void;
  finish: () => void;
  saving: boolean;
}

function StepInput(p: StepProps) {
  const { step, data, setData, answer } = p;
  const [text, setText] = useState('');
  const [time, setTime] = useState(step === 'wake' ? data.wake : step === 'sleep' ? data.sleep : '09:00');
  const [adding, setAdding] = useState(false);
  const [workOn, setWorkOn] = useState(false);
  const [workDays, setWorkDays] = useState('12345');
  const [custom, setCustom] = useState('');
  const [perm, setPerm] = useState(false);

  switch (step) {
    case 'intro':
      return <BigButton label="Vamos lá!" icon="👋" onPress={() => answer('Vamos lá!')} />;

    case 'name':
      return (
        <>
          <BigInput value={text} onChangeText={setText} placeholder="Seu nome" autoFocus onSubmitEditing={() => text.trim() && answer(text.trim(), { name: text.trim() })} />
          <BigButton label="Continuar" disabled={!text.trim()} onPress={() => answer(text.trim(), { name: text.trim() })} />
        </>
      );

    case 'voice':
      return (
        <>
          <BigButton label="Sim, fale comigo" icon="🔊" onPress={() => answer('Sim, fale comigo', { voice: true }, true)} />
          <BigButton label="Não, só texto" icon="🔇" variant="ghost" onPress={() => answer('Só texto', { voice: false }, false)} />
        </>
      );

    case 'wake':
    case 'sleep':
      return (
        <>
          <TimePicker value={time} onChange={setTime} />
          <BigButton label={`Confirmar ${time}`} onPress={() => answer(time, step === 'wake' ? { wake: time } : { sleep: time })} />
        </>
      );

    case 'meals':
      return (
        <>
          {DEFAULT_MEALS.map((m) => {
            const sel = data.meals.find((x) => x.label === m.label);
            return (
              <Card key={m.label} color={sel ? colors.primary : undefined}>
                <Chip
                  label={m.label}
                  selected={!!sel}
                  onPress={() =>
                    setData((cur) => ({
                      ...cur,
                      meals: sel ? cur.meals.filter((x) => x.label !== m.label) : [...cur.meals, m],
                    }))
                  }
                />
                {sel ? (
                  <TimePicker
                    value={sel.time}
                    onChange={(v) => setData((cur) => ({ ...cur, meals: cur.meals.map((x) => (x.label === m.label ? { ...x, time: v } : x)) }))}
                  />
                ) : null}
              </Card>
            );
          })}
          <BigButton label="Continuar" onPress={() => answer(data.meals.length ? data.meals.map((m) => `${m.label} ${m.time}`).join(', ') : 'Nenhuma')} />
        </>
      );

    case 'work':
      return workOn ? (
        <>
          <Body>Que horas começa?</Body>
          <TimePicker value={time} onChange={setTime} />
          <Body>Em quais dias?</Body>
          <WeekdayPicker value={workDays} onChange={setWorkDays} />
          <BigButton label="Confirmar" disabled={!workDays} onPress={() => answer(`${weekdaysLabel(workDays)} às ${time}`, { work: { time, weekdays: workDays } })} />
        </>
      ) : (
        <>
          <BigButton label="Sim" onPress={() => setWorkOn(true)} />
          <BigButton label="Não" variant="ghost" onPress={() => answer('Não', { work: null })} />
        </>
      );

    case 'meds':
      return adding ? (
        <MedicationForm
          onCancel={() => setAdding(false)}
          onSave={(m: MedicationInput) => {
            setData((cur) => ({ ...cur, meds: [...cur.meds, m] }));
            setAdding(false);
            say(`Anotei ${m.name} às ${m.times.join(' e ')}.`);
          }}
        />
      ) : (
        <>
          {data.meds.map((m, i) => (
            <Card key={i}>
              <Body>{`💊 ${m.name} — ${m.times.join(', ')}${m.barcode ? ' · 📷 caixa cadastrada' : ''}`}</Body>
            </Card>
          ))}
          <BigButton label={data.meds.length ? 'Adicionar outro remédio' : 'Sim, cadastrar remédio'} icon="➕" onPress={() => setAdding(true)} />
          <BigButton
            label={data.meds.length ? 'Pronto, são só esses' : 'Não tomo remédios'}
            variant="ghost"
            onPress={() => answer(data.meds.length ? `${data.meds.length} remédio(s)` : 'Não tomo')}
          />
        </>
      );

    case 'appointments':
      return adding ? (
        <AppointmentForm
          onCancel={() => setAdding(false)}
          onSave={(a: AppointmentInput) => {
            setData((cur) => ({ ...cur, appointments: [...cur.appointments, a] }));
            setAdding(false);
          }}
        />
      ) : (
        <>
          {data.appointments.map((a, i) => (
            <Card key={i}>
              <Body>{`📅 ${a.title} — ${a.weekdays ? weekdaysLabel(a.weekdays) : 'data única'} ${a.time ?? ''}`}</Body>
            </Card>
          ))}
          <BigButton label={data.appointments.length ? 'Adicionar outro' : 'Sim, cadastrar'} icon="➕" onPress={() => setAdding(true)} />
          <BigButton
            label={data.appointments.length ? 'Pronto' : 'Não tenho / depois'}
            variant="ghost"
            onPress={() => answer(data.appointments.length ? `${data.appointments.length} compromisso(s)` : 'Não agora')}
          />
        </>
      );

    case 'items':
      return (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {[...new Set([...COMMON_ITEMS, ...data.items])].map((it) => (
              <Chip
                key={it}
                label={it}
                selected={data.items.includes(it)}
                onPress={() =>
                  setData((cur) => ({
                    ...cur,
                    items: cur.items.includes(it) ? cur.items.filter((x) => x !== it) : [...cur.items, it],
                  }))
                }
              />
            ))}
          </View>
          <BigInput value={custom} onChangeText={setCustom} placeholder="Outro item (ex.: Aparelho auditivo)" />
          <BigButton
            small
            variant="ghost"
            icon="➕"
            label="Adicionar item"
            disabled={!custom.trim()}
            onPress={() => {
              setData((cur) => ({ ...cur, items: [...cur.items, custom.trim()] }));
              setCustom('');
            }}
          />
          <BigButton label="Continuar" disabled={!data.items.length} onPress={() => answer(data.items.join(', '))} />
        </>
      );

    case 'contacts':
      return adding ? (
        <ContactForm
          onCancel={() => setAdding(false)}
          onSave={(c) => {
            setData((cur) => ({ ...cur, contacts: [...cur.contacts, c] }));
            setAdding(false);
          }}
        />
      ) : (
        <>
          {data.contacts.map((c, i) => (
            <Card key={i}>
              <Body>{`📞 ${c.name} — ${c.phone}`}</Body>
            </Card>
          ))}
          <BigButton label="Adicionar contato" icon="➕" onPress={() => setAdding(true)} />
          <BigButton label={data.contacts.length ? 'Pronto' : 'Depois'} variant="ghost" onPress={() => answer(data.contacts.length ? `${data.contacts.length} contato(s)` : 'Depois')} />
        </>
      );

    case 'challenge':
      return (
        <>
          <BigButton label="Continha (ex.: 7 + 8)" icon="🔢" onPress={() => answer('Continha', { challenge: 'math' })} />
          <BigButton label="Reescrever uma palavra" icon="🔤" variant="info" onPress={() => answer('Palavra', { challenge: 'word' })} />
          <Body dim>Remédios com caixa cadastrada sempre pedem o código de barras.</Body>
        </>
      );

    case 'home':
      return (
        <>
          <BigButton
            label={p.homeSet ? 'Casa marcada ✓' : 'Sim, estou em casa'}
            icon="🏠"
            disabled={p.homeSet}
            onPress={async () => {
              const r = await requestLocationPermissions();
              if (!r.foreground) return say('Sem permissão de localização. Você pode marcar depois em Ajustes.', { force: true });
              const pos = await currentPosition();
              await setHome(pos.coords.latitude, pos.coords.longitude);
              p.setHomeSet(true);
              if (!r.background) say('Para avisar quando você sair, escolha "Permitir o tempo todo" na localização.', { force: true });
            }}
          />
          <BigButton label={p.homeSet ? 'Continuar' : 'Não, depois'} variant="ghost" onPress={() => answer(p.homeSet ? 'Casa marcada' : 'Depois')} />
        </>
      );

    case 'permissions':
      return (
        <>
          <BigButton
            label={perm ? 'Notificações ✓' : 'Permitir notificações'}
            icon="🔔"
            variant={perm ? 'success' : 'primary'}
            onPress={async () => setPerm(await ensureNotificationPermission())}
          />
          <BigButton label="Permitir alarmes exatos" icon="⏰" variant="ghost" onPress={openExactAlarmSettings} />
          <BigButton label="Exibir sobre outros apps" icon="🪟" variant="ghost" onPress={openOverlaySettings} />
          <BigButton label="Não economizar bateria" icon="🔋" variant="ghost" onPress={openBatterySettings} />
          <Body dim>Esses ajustes impedem que o Android “mate” os alarmes. Você pode revê-los em Ajustes.</Body>
          <BigButton label="Continuar" onPress={() => answer('Permissões revisadas')} />
        </>
      );

    case 'done':
      return <BigButton label={p.saving ? 'Salvando…' : 'Começar a usar'} icon="🚀" variant="success" disabled={p.saving} onPress={p.finish} />;
  }
}
