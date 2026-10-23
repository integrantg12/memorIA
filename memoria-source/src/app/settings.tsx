import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { ReactNode, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { AppointmentForm, ContactForm, MedicationForm } from '../components/forms';
import { BackBar, BigButton, BigInput, Body, Card, Chip, Screen, TimePicker, useLoader, WeekdayPicker } from '../components/ui';
import { wipeDatabase } from '../db/database';
import {
  addAppointment,
  addChecklistItem,
  addContact,
  addMedication,
  AppSettings,
  deleteAppointment,
  deleteContact,
  deleteMedication,
  deletePlace,
  deleteRoutine,
  getSettings,
  listAppointments,
  listChecklist,
  listContacts,
  listMedications,
  listPlaces,
  listRoutine,
  removeChecklistItem,
  setSetting,
  upsertRoutine,
} from '../db/repositories';
import { planAlerts, scheduleTestAlert } from '../services/alertEngine';
import { setHomeHere, syncGeofences } from '../services/geofence';
import { ensureNotificationPermission } from '../services/notifications';
import {
  openAppSettings,
  openBatterySettings,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openOverlaySettings,
  requestCorePermissions,
} from '../services/permissions';
import { say } from '../services/speech';
import { colors, font, RADIUS, space } from '../theme';
import { weekdaysLabel } from '../utils/time';

type Section = 'voice' | 'meds' | 'appts' | 'routine' | 'checklist' | 'contacts' | 'home' | 'reliability' | 'privacy';

export default function Settings() {
  const { data, reload } = useLoader(async () => ({
    settings: await getSettings(),
    meds: await listMedications(),
    appts: await listAppointments(),
    routine: await listRoutine(),
    checklist: await listChecklist(),
    contacts: await listContacts(),
    places: await listPlaces(),
  }));
  const [open, setOpen] = useState<Section | null>(null);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [routineLabel, setRoutineLabel] = useState('');
  const [routineTime, setRoutineTime] = useState('10:00');
  const [routineDays, setRoutineDays] = useState('1234567');
  const [wipeText, setWipeText] = useState('');

  if (!data) return <Screen><BackBar title="⚙️ Ajustes" /></Screen>;
  const s = data.settings;

  const update = async <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    await setSetting(k, v);
    reload();
  };
  const changed = async () => {
    setAdding(false);
    reload();
    await planAlerts();
  };
  const toggle = (sec: Section) => {
    setAdding(false);
    setOpen(open === sec ? null : sec);
  };

  return (
    <Screen>
      <BackBar title="⚙️ Ajustes" />

      <Group title="🔊 Voz e desafios" open={open === 'voice'} onPress={() => toggle('voice')}>
        <Chip label="Falar os avisos em voz alta" selected={s.ttsEnabled} onPress={() => update('ttsEnabled', !s.ttsEnabled)} />
        <Body>Velocidade da voz</Body>
        <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
          {[{ l: 'Devagar', v: 0.7 }, { l: 'Normal', v: 0.9 }, { l: 'Rápida', v: 1.15 }].map((o) => (
            <Chip key={o.l} label={o.l} selected={s.ttsRate === o.v} onPress={() => update('ttsRate', o.v)} />
          ))}
        </View>
        <BigButton small variant="info" icon="🔊" label="Testar voz" onPress={() => say('Olá! Esta é a voz do memorIA.', { force: true })} />
        <Body>Desafio para silenciar alertas</Body>
        <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
          <Chip label="Continha" selected={s.challenge === 'math'} onPress={() => update('challenge', 'math')} />
          <Chip label="Palavra" selected={s.challenge === 'word'} onPress={() => update('challenge', 'word')} />
        </View>
        <Chip label="Lembretes de beber água" selected={s.hydration} onPress={async () => { await update('hydration', !s.hydration); await planAlerts(); }} />
      </Group>

      <Group title={`💊 Remédios (${data.meds.length})`} open={open === 'meds'} onPress={() => toggle('meds')}>
        {data.meds.map((m) => (
          <Row key={m.id} text={`${m.name}${m.dose ? ` (${m.dose})` : ''} — ${m.times.join(', ')}${m.stock != null ? ` · estoque ${m.stock}` : ''}${m.barcode ? ' · 📷' : ''}`} onDelete={async () => { await deleteMedication(m.id); await changed(); }} />
        ))}
        {adding ? (
          <MedicationForm onCancel={() => setAdding(false)} onSave={async (m) => { await addMedication(m); await changed(); }} />
        ) : (
          <BigButton small icon="➕" label="Adicionar remédio" onPress={() => setAdding(true)} />
        )}
      </Group>

      <Group title={`📅 Compromissos (${data.appts.length})`} open={open === 'appts'} onPress={() => toggle('appts')}>
        {data.appts.map((a) => (
          <Row
            key={a.id}
            text={`${a.title} — ${a.startsAt ? new Date(a.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : `${weekdaysLabel(a.weekdays ?? '')} ${a.time}`}${a.bringItems.length ? ` · levar: ${a.bringItems.join(', ')}` : ''}`}
            onDelete={async () => { await deleteAppointment(a.id); await changed(); }}
          />
        ))}
        {adding ? (
          <AppointmentForm defaultRecurring={false} onCancel={() => setAdding(false)} onSave={async (a) => { await addAppointment(a); await changed(); }} />
        ) : (
          <BigButton small icon="➕" label="Adicionar compromisso" onPress={() => setAdding(true)} />
        )}
      </Group>

      <Group title="⏰ Rotina e lembretes" open={open === 'routine'} onPress={() => toggle('routine')}>
        {data.routine.map((r) => (
          <Row key={r.id} text={`${r.time} — ${r.label} (${weekdaysLabel(r.weekdays)})`} onDelete={async () => { await deleteRoutine(r.id); await changed(); }} />
        ))}
        {adding ? (
          <Card color={colors.primary}>
            <BigInput label="Lembrete" value={routineLabel} onChangeText={setRoutineLabel} placeholder="Ex.: Regar as plantas" />
            <TimePicker value={routineTime} onChange={setRoutineTime} />
            <WeekdayPicker value={routineDays} onChange={setRoutineDays} />
            <BigButton
              small
              label="Salvar lembrete"
              disabled={!routineLabel.trim() || !routineDays}
              onPress={async () => { await upsertRoutine('custom', routineLabel.trim(), routineTime, routineDays); setRoutineLabel(''); await changed(); }}
            />
          </Card>
        ) : (
          <BigButton small icon="➕" label="Novo lembrete" onPress={() => setAdding(true)} />
        )}
      </Group>

      <Group title="🚪 Checklist de saída" open={open === 'checklist'} onPress={() => toggle('checklist')}>
        {data.checklist.map((c) => (
          <Row key={c.id} text={c.question} onDelete={async () => { await removeChecklistItem(c.id); reload(); }} />
        ))}
        <BigInput value={newItem} onChangeText={setNewItem} placeholder="Novo item (ex.: Crachá)" />
        <BigButton
          small
          icon="➕"
          label="Adicionar item"
          disabled={!newItem.trim()}
          onPress={async () => { await addChecklistItem('exit', newItem.trim(), `Pegou: ${newItem.trim()}?`, true, 99); setNewItem(''); reload(); }}
        />
      </Group>

      <Group title={`📞 Contatos de emergência (${data.contacts.length})`} open={open === 'contacts'} onPress={() => toggle('contacts')}>
        {data.contacts.map((c) => (
          <Row key={c.id} text={`${c.name} — ${c.phone}`} onDelete={async () => { await deleteContact(c.id); reload(); }} />
        ))}
        {adding ? (
          <ContactForm onCancel={() => setAdding(false)} onSave={async (c) => { await addContact(c.name, c.phone, c.relation); setAdding(false); reload(); }} />
        ) : (
          <BigButton small icon="➕" label="Adicionar contato" onPress={() => setAdding(true)} />
        )}
      </Group>

      <Group title="🏠 Casa e localização" open={open === 'home'} onPress={() => toggle('home')}>
        <Body dim>A localização é usada só no aparelho, para disparar o checklist quando você sai. Nada é registrado ou enviado.</Body>
        <Chip label="Checklist automático ao sair" selected={s.geofenceEnabled} onPress={async () => { await update('geofenceEnabled', !s.geofenceEnabled); await syncGeofences(); }} />
        {data.places.map((p) => (
          <Row key={p.id} text={`${p.isHome ? '🏠' : '📍'} ${p.label} · raio ${p.radius} m${p.expiresAt ? ' · temporário' : ''}`} onDelete={async () => { await deletePlace(p.id); await syncGeofences(); reload(); }} />
        ))}
        <BigButton
          small
          icon="📍"
          label="Estou em casa: marcar aqui"
          onPress={async () => {
            const perms = await requestCorePermissions();
            if (!perms.foreground) return Alert.alert('Localização', 'Permissão negada.');
            await setHomeHere();
            if (!perms.background) Alert.alert('Quase lá', 'Escolha "Permitir o tempo todo" na localização para o aviso funcionar com o app fechado.');
            reload();
          }}
        />
      </Group>

      <Group title="🛡️ Confiabilidade dos alertas" open={open === 'reliability'} onPress={() => toggle('reliability')}>
        <Body dim>Muitos celulares (Xiaomi, Samsung, Motorola) “matam” apps em segundo plano. Ajuste tudo abaixo:</Body>
        <BigButton small icon="🔔" label="Permitir notificações" onPress={() => ensureNotificationPermission()} />
        <BigButton small variant="ghost" icon="⏰" label="Alarmes e lembretes exatos" onPress={openExactAlarmSettings} />
        <BigButton small variant="ghost" icon="🪟" label="Exibir sobre outros apps" onPress={openOverlaySettings} />
        <BigButton small variant="ghost" icon="📱" label="Notificações em tela cheia" onPress={openFullScreenIntentSettings} />
        <BigButton small variant="ghost" icon="🔋" label="Sem otimização de bateria" onPress={openBatterySettings} />
        <BigButton small variant="ghost" icon="⚙️" label="Configurações do app" onPress={openAppSettings} />
        <BigButton
          small
          variant="danger"
          icon="🧪"
          label="Testar alerta intrometido (10 s)"
          onPress={async () => {
            await scheduleTestAlert(10);
            await say('Bloqueie a tela. Em 10 segundos o alerta vai tocar.', { force: true });
          }}
        />
        <BigButton
          small
          variant="ghost"
          label="Ver quantos alarmes estão agendados"
          onPress={async () => {
            const n = await Notifications.getAllScheduledNotificationsAsync();
            Alert.alert('Agendados', `${n.length} avisos programados para as próximas 48 horas.`);
          }}
        />
      </Group>

      <Group title="🔒 Privacidade e dados" open={open === 'privacy'} onPress={() => toggle('privacy')}>
        <Body>• Banco de dados criptografado (SQLCipher, AES-256), chave no cofre do Android.</Body>
        <Body>• Sem contas, sem anúncios, sem analytics, sem backup em nuvem.</Body>
        <Body>{`• Acesso à internet: ${Constants.expoConfig?.extra?.privacyStrict ? 'BLOQUEADO no sistema (este APK nem pede a permissão).' : 'liberado apenas nesta versão de desenvolvimento.'}`}</Body>
        <Body>• Voz reconhecida e falada pelo próprio aparelho.</Body>
        <Body dim>Para apagar TUDO, digite APAGAR abaixo.</Body>
        <BigInput value={wipeText} onChangeText={setWipeText} autoCapitalize="characters" placeholder="APAGAR" />
        <BigButton
          small
          variant="danger"
          label="Apagar todos os meus dados"
          disabled={wipeText.trim().toUpperCase() !== 'APAGAR'}
          onPress={async () => {
            await Notifications.cancelAllScheduledNotificationsAsync();
            await wipeDatabase();
            router.replace('/onboarding');
          }}
        />
      </Group>
    </Screen>
  );
}

function Group({ title, open, onPress, children }: { title: string; open: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <View style={{ borderWidth: 2, borderColor: open ? colors.primary : '#444', borderRadius: RADIUS, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        style={{ minHeight: 76, padding: space.md, justifyContent: 'center', backgroundColor: open ? colors.surfaceAlt : colors.surface }}
      >
        <Text style={{ color: colors.text, fontSize: font.large, fontWeight: '900' }}>{`${title}  ${open ? '▲' : '▼'}`}</Text>
      </Pressable>
      {open ? <View style={{ padding: space.md, gap: space.sm }}>{children}</View> : null}
    </View>
  );
}

function Row({ text, onDelete }: { text: string; onDelete: () => void }) {
  return (
    <Card>
      <Body>{text}</Body>
      <BigButton small variant="ghost" label="Remover" onPress={() => Alert.alert('Remover?', text, [{ text: 'Cancelar' }, { text: 'Remover', style: 'destructive', onPress: onDelete }])} />
    </Card>
  );
}
