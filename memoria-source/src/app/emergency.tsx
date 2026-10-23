import { router } from 'expo-router';
import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { BackBar, BigButton, Body, Card, H2, Screen, useLoader } from '../components/ui';
import { getSettings, listContacts, listMedications } from '../db/repositories';
import { colors, font, RADIUS, space } from '../theme';

/** Abre o discador nativo já com o número — o usuário só confirma a chamada. */
function dial(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
}

const PUBLIC_NUMBERS = [
  { name: 'SAMU', phone: '192', icon: '🚑' },
  { name: 'Bombeiros', phone: '193', icon: '🚒' },
  { name: 'Polícia', phone: '190', icon: '🚓' },
];

export default function Emergency() {
  const { data } = useLoader(async () => ({
    contacts: await listContacts(),
    meds: await listMedications(),
    settings: await getSettings(),
  }));

  return (
    <Screen>
      <BackBar title="🆘 Emergência" />
      {data?.contacts.length === 0 ? (
        <Card>
          <Body>Nenhum contato cadastrado ainda.</Body>
          <BigButton small label="Cadastrar em Ajustes" onPress={() => router.push('/settings')} />
        </Card>
      ) : null}
      {data?.contacts.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Ligar para ${c.name}`}
          onPress={() => dial(c.phone)}
          style={({ pressed }) => ({
            backgroundColor: colors.danger,
            borderRadius: RADIUS,
            padding: space.lg,
            minHeight: 110,
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: colors.onDanger, fontSize: font.title, fontWeight: '900' }}>📞 {c.name}</Text>
          <Text style={{ color: colors.onDanger, fontSize: font.body, fontWeight: '700' }}>
            {c.relation ? `${c.relation} · ` : ''}
            {c.phone}
          </Text>
        </Pressable>
      ))}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {PUBLIC_NUMBERS.map((n) => (
          <Pressable
            key={n.phone}
            accessibilityRole="button"
            accessibilityLabel={`Ligar para ${n.name}, ${n.phone}`}
            onPress={() => dial(n.phone)}
            style={{ flex: 1, borderWidth: 3, borderColor: colors.danger, borderRadius: RADIUS, padding: space.sm, alignItems: 'center', minHeight: 110, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 34 }}>{n.icon}</Text>
            <Text style={{ color: colors.text, fontSize: font.body, fontWeight: '900' }}>{n.phone}</Text>
            <Text style={{ color: colors.textDim, fontSize: font.small }}>{n.name}</Text>
          </Pressable>
        ))}
      </View>

      {/* Ficha rápida para mostrar a socorristas */}
      <H2>Minha ficha (mostre a quem for ajudar)</H2>
      <Card color={colors.info}>
        <Body size={font.large}>{data?.settings.userName || 'Nome não informado'}</Body>
        <Body>Tenho dificuldades de memória/atenção (TDAH). Por favor, fale devagar e anote as instruções.</Body>
        {data?.meds.length ? (
          <>
            <Body>Remédios contínuos:</Body>
            {data.meds.map((m) => (
              <Body key={m.id}>{`• ${m.name}${m.dose ? ` (${m.dose})` : ''} — ${m.times.join(', ')}`}</Body>
            ))}
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
