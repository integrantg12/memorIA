import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, View } from 'react-native';

import { BackBar, BigButton, BigInput, Body, Card, Screen, useLoader } from '../../components/ui';
import { addPerson, deletePerson, listPeople } from '../../db/repositories';
import { colors, font, RADIUS, space } from '../../theme';

/** Copia a foto para a pasta privada do app (não fica na galeria nem em nuvem). */
function persistPhoto(uri: string): string {
  const dir = new Directory(Paths.document, 'faces');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${Date.now()}.jpg`);
  new File(uri).copySync(dest);
  return dest.uri;
}

export default function People() {
  const { data: people, reload } = useLoader(listPeople);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');

  const pick = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  return (
    <Screen>
      <BackBar title="📸 Pessoas" />
      <Body dim>As fotos ficam só na memória interna do app, protegidas.</Body>

      <Card color={colors.info}>
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 1, borderRadius: RADIUS }} />
        ) : (
          <View style={{ gap: space.sm }}>
            <BigButton label="Tirar foto" icon="📷" variant="info" onPress={() => pick(true)} />
            <BigButton label="Escolher da galeria" icon="🖼️" variant="ghost" onPress={() => pick(false)} />
          </View>
        )}
        <BigInput label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Dra. Paula" />
        <BigInput label="Quem é? (opcional)" value={relation} onChangeText={setRelation} placeholder="Ex.: cardiologista" />
        <BigButton
          label="Salvar pessoa"
          icon="💾"
          disabled={!photo || !name.trim()}
          onPress={async () => {
            await addPerson(name.trim(), relation.trim() || null, persistPhoto(photo!));
            setPhoto(null);
            setName('');
            setRelation('');
            reload();
          }}
        />
      </Card>

      {people?.map((p) => (
        <Card key={p.id}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Image source={{ uri: p.photoUri }} style={{ width: 90, height: 90, borderRadius: 12 }} />
            <View style={{ flex: 1 }}>
              <Body size={font.large}>{p.name}</Body>
              {p.relation ? <Body dim>{p.relation}</Body> : null}
            </View>
          </View>
          <BigButton
            small
            variant="ghost"
            label="Remover"
            onPress={async () => {
              await deletePerson(p.id);
              try {
                new File(p.photoUri).delete();
              } catch {
                // arquivo já removido
              }
              reload();
            }}
          />
        </Card>
      ))}
    </Screen>
  );
}
