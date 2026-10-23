import React, { useState } from 'react';
import { View } from 'react-native';

import { AppointmentInput, MedicationInput } from '../db/repositories';
import { colors, space } from '../theme';
import { BarcodeScanner } from './BarcodeScanner';
import { BigButton, BigInput, Body, Card, Chip, NumberPicker, TimePicker, WeekdayPicker } from './ui';

const INSTRUCTIONS = ['Em jejum', 'Com comida', 'Com bastante água', 'Antes de dormir', 'Não tomar com leite'];

/** Cadastro de remédio — usado no onboarding e em Ajustes. */
export function MedicationForm({ onSave, onCancel }: { onSave: (m: MedicationInput) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [stock, setStock] = useState(30);
  const [trackStock, setTrackStock] = useState(false);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [critical, setCritical] = useState(true);

  return (
    <Card color={colors.primary}>
      <BigInput label="Nome do remédio" value={name} onChangeText={setName} placeholder="Ex.: Losartana" />
      <BigInput label="Dose (opcional)" value={dose} onChangeText={setDose} placeholder="Ex.: 1 comprimido 50 mg" />

      <Body>Horários</Body>
      {times.map((t, i) => (
        <View key={i} style={{ gap: space.xs }}>
          <TimePicker value={t} onChange={(v) => setTimes(times.map((x, j) => (j === i ? v : x)))} />
          {times.length > 1 ? (
            <BigButton small variant="ghost" label="Remover este horário" onPress={() => setTimes(times.filter((_, j) => j !== i))} />
          ) : null}
        </View>
      ))}
      <BigButton small variant="ghost" icon="➕" label="Adicionar horário" onPress={() => setTimes([...times, '20:00'])} />

      <Body>Cuidados</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {INSTRUCTIONS.map((ins) => (
          <Chip
            key={ins}
            label={ins}
            selected={instructions.includes(ins)}
            onPress={() => setInstructions(instructions.includes(ins) ? instructions.filter((x) => x !== ins) : [...instructions, ins])}
          />
        ))}
      </View>

      <Chip label="Controlar estoque (avisar quando acabar)" selected={trackStock} onPress={() => setTrackStock(!trackStock)} />
      {trackStock ? (
        <>
          <Body dim>Quantas doses você tem agora?</Body>
          <NumberPicker value={stock} onChange={setStock} step={1} min={0} max={500} />
        </>
      ) : null}

      <Chip label="Alerta crítico (exige desafio para silenciar)" selected={critical} onPress={() => setCritical(!critical)} />

      <Body>Código de barras da caixa (opcional): para silenciar o alerta, você terá que escanear a caixa — prova de que pegou o remédio certo.</Body>
      {scanning ? (
        <BarcodeScanner
          onScanned={(code) => {
            setBarcode(code);
            setScanning(false);
          }}
          onCancel={() => setScanning(false)}
        />
      ) : (
        <BigButton small variant="info" icon="📷" label={barcode ? `Código: ${barcode} (trocar)` : 'Escanear a caixa'} onPress={() => setScanning(true)} />
      )}

      <BigButton
        label="Salvar remédio"
        icon="💊"
        disabled={!name.trim() || times.length === 0}
        onPress={() =>
          onSave({
            name: name.trim(),
            dose: dose.trim() || null,
            instructions: instructions.length ? instructions.join(', ') : null,
            times: [...new Set(times)].sort(),
            barcode,
            stock: trackStock ? stock : null,
            critical: critical ? 1 : 0,
          })
        }
      />
      {onCancel ? <BigButton small variant="ghost" label="Cancelar" onPress={onCancel} /> : null}
    </Card>
  );
}

/** Cadastro de compromisso (fixo semanal ou data única). */
export function AppointmentForm({ onSave, onCancel, defaultRecurring = true }: {
  onSave: (a: AppointmentInput) => void;
  onCancel?: () => void;
  defaultRecurring?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [recurring, setRecurring] = useState(defaultRecurring);
  const [weekdays, setWeekdays] = useState('1');
  const [time, setTime] = useState('09:00');
  const [daysAhead, setDaysAhead] = useState(1);
  const [leadMin, setLeadMin] = useState(45);
  const [bring, setBring] = useState('');
  const [critical, setCritical] = useState(false);

  const date = new Date();
  date.setDate(date.getDate() + daysAhead);

  return (
    <Card color={colors.info}>
      <BigInput label="O que é?" value={title} onChangeText={setTitle} placeholder="Ex.: Fisioterapia" />
      <BigInput label="Onde? (opcional)" value={location} onChangeText={setLocation} placeholder="Ex.: Clínica Centro" />
      <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
        <Chip label="Toda semana" selected={recurring} onPress={() => setRecurring(true)} />
        <Chip label="Uma vez só" selected={!recurring} onPress={() => setRecurring(false)} />
      </View>
      {recurring ? (
        <>
          <Body>Em quais dias?</Body>
          <WeekdayPicker value={weekdays} onChange={setWeekdays} />
        </>
      ) : (
        <>
          <Body>{`Daqui a quantos dias? (${date.toLocaleDateString('pt-BR')})`}</Body>
          <NumberPicker value={daysAhead} onChange={setDaysAhead} step={1} min={0} max={365} suffix=" d" />
        </>
      )}
      <Body>Horário</Body>
      <TimePicker value={time} onChange={setTime} />
      <Body>Avisar quantos minutos antes (tempo para se arrumar e ir)?</Body>
      <NumberPicker value={leadMin} onChange={setLeadMin} step={15} min={0} max={240} suffix=" min" />
      <BigInput label="O que levar? (separe por vírgula)" value={bring} onChangeText={setBring} placeholder="Ex.: Exames, cartão do plano" />
      <Chip label="Alerta crítico (exige desafio)" selected={critical} onPress={() => setCritical(!critical)} />
      <BigButton
        label="Salvar compromisso"
        icon="📅"
        disabled={!title.trim() || (recurring && !weekdays)}
        onPress={() => {
          let startsAt: string | null = null;
          if (!recurring) {
            const [h, m] = time.split(':').map(Number);
            const d = new Date(date);
            d.setHours(h, m, 0, 0);
            startsAt = d.toISOString();
          }
          onSave({
            title: title.trim(),
            location: location.trim() || null,
            notes: null,
            startsAt,
            time: recurring ? time : null,
            weekdays: recurring ? weekdays : null,
            leadMin,
            bringItems: bring.split(',').map((s) => s.trim()).filter(Boolean),
            critical: critical ? 1 : 0,
          });
        }}
      />
      {onCancel ? <BigButton small variant="ghost" label="Cancelar" onPress={onCancel} /> : null}
    </Card>
  );
}

export function ContactForm({ onSave, onCancel }: { onSave: (c: { name: string; phone: string; relation: string | null }) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  return (
    <Card color={colors.danger}>
      <BigInput label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Ana (filha)" />
      <BigInput label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
      <BigInput label="Relação (opcional)" value={relation} onChangeText={setRelation} placeholder="Ex.: Filha" />
      <BigButton
        label="Salvar contato"
        icon="📞"
        disabled={!name.trim() || phone.replace(/\D/g, '').length < 3}
        onPress={() => onSave({ name: name.trim(), phone: phone.trim(), relation: relation.trim() || null })}
      />
      {onCancel ? <BigButton small variant="ghost" label="Cancelar" onPress={onCancel} /> : null}
    </Card>
  );
}
