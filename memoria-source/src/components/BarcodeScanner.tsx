import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, RADIUS } from '../theme';
import { BigButton, Body } from './ui';

/** Leitor de código de barras (processado no aparelho pelo ML Kit embutido). */
export function BarcodeScanner({ onScanned, onCancel }: { onScanned: (code: string) => void; onCancel?: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={{ gap: 12 }}>
        <Body>Preciso da câmera para ler o código de barras da caixa.</Body>
        <BigButton label="Permitir câmera" icon="📷" onPress={requestPermission} />
        {onCancel ? <BigButton label="Cancelar" variant="ghost" onPress={onCancel} /> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'datamatrix', 'qr', 'itf14'] }}
          onBarcodeScanned={(r) => {
            if (done.current || !r.data) return;
            done.current = true;
            onScanned(r.data);
            setTimeout(() => (done.current = false), 1500);
          }}
        />
        <View style={styles.aim} pointerEvents="none" />
      </View>
      {onCancel ? <BigButton label="Cancelar" variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 300, borderRadius: RADIUS, overflow: 'hidden', borderWidth: 3, borderColor: colors.primary },
  aim: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '42%',
    height: 4,
    backgroundColor: colors.danger,
  },
});
