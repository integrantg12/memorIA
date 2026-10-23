# memorIA

Assistente de memória e atenção para pessoas com TDAH, déficit de atenção severo e lapsos de memória.
**100% local**: sem conta, sem servidor, sem analytics. No APK de produção o app **não tem permissão de internet**.

- Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router
- SQLite criptografado (SQLCipher / AES-256), com a chave guardada no Android Keystore
- Notificações locais exatas, geofencing do sistema, TTS nativo e reconhecimento de voz no próprio aparelho

---

## Como instalar o APK

### Opção A: GitHub Actions (recomendada, grátis, sem instalar nada)
1. Crie um repositório no GitHub e envie esta pasta (`git push`).
2. Vá em **Actions → Build APK → Run workflow**.
3. Quando a execução terminar (~15 min), baixe `memoria-apk` em **Artifacts**.
4. No celular, abra o `.apk` e permita "instalar apps desta fonte".

### Opção B: EAS Build (nuvem da Expo, precisa de conta gratuita)
```bash
npm install
npm run build:apk        # perfil "apk" do eas.json → gera um link para baixar o APK
```

### Opção C: build local (Android Studio + JDK 17 instalados)
```bash
npm install
npm run build:apk:local  # APK em android/app/build/outputs/apk/release/app-release.apk
```

> O release usa a chave de debug do template Expo, o que basta para instalar direto no aparelho (sideload).
> Para publicar na Play Store, configure uma keystore própria (`eas credentials`).

### Desenvolvimento
```bash
npm install
npx expo run:android      # development build (o app usa módulos nativos, então não roda no Expo Go)
npm run typecheck && npm run lint && npm test
```

---

## Estrutura

```
memoria/
├── app.config.ts              # permissões Android/iOS, plugins nativos, modo PRIVACY_STRICT
├── eas.json                   # perfis de build (apk / development / production)
├── index.ts                   # entrada: registra as tarefas de background antes do Router
├── plugins/withLockScreenAlert.js   # MainActivity: showWhenLocked + turnScreenOn
├── .github/workflows/build-apk.yml  # CI que gera o APK
└── src/
    ├── app/                   # telas (Expo Router)
    │   ├── _layout.tsx        # boot: banco, canais, listeners de notificação, replanejamento
    │   ├── onboarding.tsx     # entrevista inicial em formato de chat
    │   ├── index.tsx          # painel "Próximo Passo" + blocos grandes
    │   ├── alert.tsx          # tela de alerta intrometido (descarte cognitivo)
    │   ├── focus.tsx          # monitor de foco / check-ins de atenção
    │   ├── metrics.tsx        # previsto × real, tempo perdido, horários de distração
    │   ├── exit-checklist.tsx # checklist de saída (geofence/compromisso/manual)
    │   ├── lost-found.tsx     # achados e perdidos por voz
    │   ├── orient.tsx         # "Me orienta": onde eu estava, o que fazia
    │   ├── notes.tsx          # caixa de pensamentos (captura rápida)
    │   ├── emergency.tsx      # contatos + 192/193/190 + ficha médica
    │   ├── settings.tsx       # cadastros, confiabilidade, privacidade
    │   └── training/          # flashcards, face-match, recall diário, cadastro de pessoas
    ├── db/
    │   ├── schema.ts          # migrações (PRAGMA user_version)
    │   ├── database.ts        # abertura + SQLCipher + chave no SecureStore
    │   └── repositories.ts    # acesso tipado a todas as tabelas
    ├── services/
    │   ├── alertEngine.ts     # matriz de alertas, cadeias de escalonamento, snooze, ack
    │   ├── notifications.ts   # canais Android, categorias, agendamento
    │   ├── backgroundTasks.ts # TaskManager: geofence + replanejamento periódico
    │   ├── geofence.ts        # casa / local temporário
    │   ├── focusTimer.ts      # cronômetro, check-ins, métricas, estimativa corrigida
    │   ├── challenges.ts      # palavra / cálculo / código de barras
    │   ├── nextStep.ts        # decide o "Próximo Passo"
    │   ├── training.ts        # Leitner, geração de flashcards, recall
    │   ├── lostFound.ts       # parser PT-BR de "guardei X em Y" / "onde está X?"
    │   ├── speech.ts / voice.ts  # TTS e reconhecimento de voz on-device
    │   ├── permissions.ts     # atalhos para as telas de permissão do Android
    │   └── setup.ts           # converte o onboarding em rotina, alertas e checklists
    ├── components/            # UI de alto contraste, formulários, scanner, desafio
    └── utils/time.ts
```

### Banco de dados (tabelas)
| Tabela | Uso |
|---|---|
| `UserRoutine` | acordar, dormir, refeições, trabalho, recall noturno, lembretes |
| `Medications` | nome, dose, horários, cuidados, **código de barras**, estoque |
| `Appointments` | compromissos fixos (semanais) ou únicos, antecedência, **o que levar** |
| `DynamicChecklists` | itens fisiológicos, de segurança e de porte diário |
| `TaskTimers` / `FocusCheckins` | sessões de foco e respostas aos check-ins |
| `MemoryExercises` | cards de repetição espaçada (flashcards e rostos) |
| `AlertLog` | cada ocorrência de alerta: confirmação, método, adiamentos |
| `ItemLocations`, `People`, `EmergencyContacts`, `Places`, `DailyRecall`, `QuickNotes`, `ChecklistRuns`, `Settings` | módulos de apoio |

---

## Como os módulos funcionam

**Alertas intrometidos.** O `alertEngine` expande remédios, compromissos e rotina em ocorrências das próximas 48 h.
Cada ocorrência crítica vira uma **cadeia de notificações já agendadas** (0, 3, 6, 10, 15, 25 e 40 min), em canal
de prioridade máxima com som de alarme, que ignora o "Não perturbe" e fica fixa (não dá para arrastar e apagar).
A cadeia só é cancelada quando o usuário resolve o desafio na Tela de Alerta. Por isso apagar a notificação ou
fechar o app não silencia nada. A tela bloqueia o botão voltar, mantém a tela acesa e repete o aviso por voz a cada
30 s. Remédios com caixa cadastrada exigem o **código de barras** (com saída por um cálculo mais difícil, para
quando a caixa não está à mão). O replanejamento roda ao abrir o app, após edições e a cada ~1 h em background.

**Foco.** Ao iniciar uma tarefa, todos os check-ins ("Você ainda está focado nesta tarefa?") são agendados como
alarmes exatos, inclusive os de estouro de tempo a cada 5 min. As respostas formam o mapa de distração por hora.
Pelo histórico, o app calcula seu fator pessoal de "cegueira temporal" (ex.: 1,6×) e sugere estimativas corrigidas.

**Saída.** Geofencing nativo do Android em volta da casa. Ao sair do raio, aparece uma notificação de tela de
bloqueio. O checklist junta itens fisiológicos, de segurança, os itens de porte diário (mostrando **onde foram
guardados pela última vez**) e o que o próximo compromisso exige. Só fecha com tudo marcado. Ao chegar em casa,
o app pede para registrar onde deixou as chaves. Também dá para criar uma cerca temporária ("me avise quando eu sair daqui").

**Treino.** Flashcards gerados dos seus remédios, compromissos e objetos guardados (sistema Leitner); Face-Match
com fotos guardadas na pasta privada do app; Recall noturno que compara o que você lembra com o que o app registrou.

**Extras.** "Me orienta" (data, hora, tarefa em andamento, onde parou, próximo passo, tudo falado), caixa de
pensamentos para capturar ideias sem perder o foco, ficha de emergência, controle de estoque de remédios,
lembretes de hidratação e lembrete na véspera de compromissos únicos.

---

## Privacidade (o que é garantido e como)
- `PRIVACY_STRICT=1` (perfis `apk`/`production` e CI) remove `INTERNET` e `ACCESS_NETWORK_STATE` do manifesto.
- `android:allowBackup="false"`: nada vai para o backup do Google.
- Banco criptografado com SQLCipher; a chave de 256 bits é gerada no aparelho e fica no Keystore.
- Reconhecimento de voz com `requiresOnDeviceRecognition: true`. Se o pacote offline pt-BR não existir, o app
  **não** recorre à nuvem e sugere o microfone do teclado.
- Permissões de anúncio (`AD_ID`), telefone e contatos bloqueadas explicitamente.

## Limitações conhecidas (leia antes de usar)
- **Fabricantes agressivos com bateria** (Xiaomi, Samsung, Motorola…) podem atrasar alarmes. Use
  *Ajustes → Confiabilidade dos alertas* e o botão **Testar alerta intrometido**.
- A tela de alerta abre por cima da tela de bloqueio **ao tocar** na notificação. O app não abre sozinho em tela
  cheia (o `expo-notifications` ainda não expõe *full-screen intent*). A permissão está declarada para quando houver suporte.
- Geofence do Android tem precisão de ~100 m e pode levar alguns minutos para disparar.
- iOS: o código é multiplataforma, mas o foco e os testes de configuração foram no Android (APK).
