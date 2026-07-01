# Deploy dell'app iOS su un iPhone reale

L'app iOS di Fininzen è il frontend Next.js buildato in *static export* e impacchettato
con [Capacitor](https://capacitorjs.com/) in un WKWebView nativo. Questa guida copre come
portarla su un **iPhone fisico**. Per il solo Simulatore e la configurazione dell'IP LAN
vedi la sezione [App iOS del README](../README.md#-app-ios-capacitor).

Progetto Xcode: `web/ios/App/App.xcodeproj` (Capacitor 8 usa Swift Package Manager, quindi
**non** c'è un `.xcworkspace`). Bundle id: `eu.nacci.fininzen`.

---

## 0. Quale via scegliere

| | **Via A** — cavo + Apple ID gratuito | **Via B** — Apple Developer + TestFlight |
| --- | --- | --- |
| Costo | Gratis | 99 $/anno (Apple Developer Program) |
| Quando | **Subito**, uso personale sul tuo iPhone | Distribuzione a più device / App Store |
| Rete backend | iPhone sulla **stessa Wi-Fi** del Docker (HTTP LAN) | Backend pubblico su **HTTPS** |
| Durata installazione | **7 giorni**, poi va ri-firmata da Xcode | Stabile (build distribuita) |
| Prerequisiti extra | nessuno | HTTPS + rimozione ATS dev-only, icona 1024px |

Per iniziare a usarla ora sul tuo telefono → **Via A**. Per una installazione stabile o
per farla provare ad altri → **Via B**.

---

## 1. Prerequisiti comuni

- Mac con **Xcode** installato e toolchain attiva
  (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, poi
  `xcodebuild -runFirstLaunch`).
- iPhone + cavo USB, e un **Apple ID** (basta quello gratuito per la Via A).
- Il **backend Docker acceso** e l'**IP LAN allineato**: vedi
  [README §Config IP LAN](../README.md#2-configura-lip-lan). L'app punta a
  `http://<IP-LAN>/fininzen/api`; quell'IP deve stare in `NEXT_PUBLIC_API_BASE` (a build
  time) e in `DJANGO_ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` nel `.env` dello stack.

---

## 2. Via A — deploy gratuito via cavo

Quello che serve per mettere l'app sul tuo iPhone senza pagare nulla.

1. **Builda e sincronizza** il progetto iOS con l'ultimo web:

   ```bash
   cd web
   npm run ios:sync        # build:mobile + cap sync ios
   ```

   Se il tuo IP LAN non è quello di default, esporta prima
   `NEXT_PUBLIC_API_BASE=http://<TUO-IP>/fininzen/api` (vedi prerequisiti).

2. **Apri il progetto in Xcode:**

   ```bash
   open web/ios/App/App.xcodeproj
   ```

3. **Aggiungi il tuo Apple ID:** Xcode → Settings → Accounts → `+` → Apple ID. Questo crea
   un **Personal Team** (firma gratuita).

4. **Firma l'app:** seleziona il target **App** → tab **Signing & Capabilities** → spunta
   *Automatically manage signing* e come **Team** scegli il tuo Personal Team.
   - Se il bundle `eu.nacci.fininzen` risulta già in uso su un altro account, cambialo
     (es. `eu.nacci.fininzen.dev`). Gli account gratuiti hanno un limite di ~10 App ID e le
     firme durano 7 giorni.

5. **Collega l'iPhone**, sbloccalo e conferma *"Trust This Computer"*. Selezionalo come
   destinazione di run in alto in Xcode, poi premi **Run** (▶).

6. **Fidati dello sviluppatore sul telefono:** al primo avvio iOS blocca l'app.
   Sull'iPhone: Impostazioni → Generale → **VPN e gestione dispositivo** → tocca il tuo
   Apple ID → *Fidati*. Riapri l'app.

7. **Prova il login** con l'account demo `demo@demo.com` e verifica che i dati arrivino
   dal Docker.

### Caveat & troubleshooting (Via A)

- **Scade dopo 7 giorni.** Con la firma gratuita l'app smette di aprirsi: ricollega
  l'iPhone e rifai **Run** da Xcode per ri-firmarla.
- **"Untrusted Developer"** → passo 6 (fidati del profilo nelle impostazioni).
- **L'app non raggiunge l'API / login gira a vuoto** → iPhone e Docker devono essere sulla
  **stessa Wi-Fi**; l'IP in `NEXT_PUBLIC_API_BASE` (bakeato nel build) e in
  `DJANGO_ALLOWED_HOSTS` deve essere quello attuale del Mac (`ipconfig getifaddr en0`);
  Caddy deve pubblicare la **:80**.
- Se cambi solo l'IP o il codice web devi rifare `npm run ios:sync` e Run; altrimenti non
  serve ribuildare.

---

## 3. Via B — Apple Developer + TestFlight / App Store

Per un'installazione stabile (niente scadenza a 7 giorni) o per distribuire l'app.

### Prerequisiti

- Iscrizione all'**[Apple Developer Program](https://developer.apple.com/programs/)** (99 $/anno).
- Backend raggiungibile su **HTTPS** con un dominio stabile (vedi la sezione HTTPS di
  [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md)). App Store **non** accetta HTTP in chiaro.
- **Rimuovi l'eccezione ATS dev-only** da `web/ios/App/App/Info.plist` (il blocco
  `NSAppTransportSecurity` / `NSAllowsLocalNetworking`): serviva solo per l'HTTP di LAN.
- **Icona app 1024×1024** in `web/ios/App/App/Assets.xcassets/AppIcon.appiconset`
  (generabile da `web/public/` con `@capacitor/assets`).

### Build

1. Punta l'API al dominio HTTPS e sincronizza:

   ```bash
   cd web
   NEXT_PUBLIC_API_BASE=https://<tuo-dominio>/fininzen/api npm run ios:sync
   ```

2. In Xcode (target **App** → **General**) imposta **Version** (`MARKETING_VERSION`) e
   **Build** (`CURRENT_PROJECT_VERSION`) — es. `1.0` / `1`. In *Signing & Capabilities*
   usa il Team del tuo Apple Developer account (firma di distribuzione, gestita
   automaticamente).

### Archive & upload

3. Come destinazione scegli **"Any iOS Device (arm64)"** (non un Simulatore).
4. Menu **Product → Archive**. A fine build si apre l'**Organizer**.
5. **Distribute App → App Store Connect → Upload**, seguendo il wizard (Xcode gestisce
   certificato di distribuzione e provisioning profile).

### App Store Connect → TestFlight

6. Su [App Store Connect](https://appstoreconnect.apple.com) crea il record dell'app
   (bundle `eu.nacci.fininzen`), compila le **privacy nutrition labels** (è un'app
   finanziaria che parla solo con il tuo server: dichiara quali dati raccogli e che non
   sono condivisi con terze parti).
7. In **TestFlight** aggiungi la build caricata e invita i tester (interni o esterni): la
   installano dall'app **TestFlight** sul loro iPhone. Nessun cavo, nessuna scadenza a 7
   giorni.
8. *(Opzionale)* Per una release pubblica, sottometti l'app alla **review** di App Store.

### Troubleshooting (Via B)

- **"App Transport Security blocked a cleartext …"** → il backend non è su HTTPS, oppure
  l'eccezione ATS dev-only è ancora nell'`Info.plist`.
- **Upload rifiutato** → icona 1024px mancante o entitlement/firma non validi: controlla
  *Signing & Capabilities* e l'AppIcon set.

---

## 4. Checklist pre-release

Prima di distribuire (Via B o App Store):

- [ ] Rimossa l'eccezione ATS `NSAllowsLocalNetworking` dall'`Info.plist`.
- [ ] Backend su **HTTPS** con dominio valido; `NEXT_PUBLIC_API_BASE` punta all'HTTPS.
- [ ] Nel `.env` di produzione: `DJANGO_SECURE_SSL_REDIRECT=1` e `DJANGO_SECURE_COOKIES=1`.
- [ ] Refresh token nel **Keychain**, access token solo in memoria, DB non esposto.
- [ ] Icona 1024px e splash brandizzate.
- [ ] `Version` / `Build` incrementati.
