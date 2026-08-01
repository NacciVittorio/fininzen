# Automazione "Apple Pay → spesa Fininzen" (Comandi/Shortcuts, iOS)

Registra automaticamente una spesa in Fininzen a ogni pagamento Apple Pay di persona
(NFC), usando il trigger nativo Wallet dell'app Comandi e l'endpoint
`POST /api/expenses/quick-add/` (token API, non JWT/sessione — vedi motivazione in
[../fininzen/models.py](../fininzen/models.py), modello `ApiToken`).

Solo iOS: non esiste un webhook nativo equivalente lato Google Pay/Android, quindi
questa automazione non ha una controparte Tasker.

Richiede la build con l'endpoint deployata in produzione (`fininzen.nacci.eu`).
Tempo stimato: 3-5 minuti.

## 1. Crea il token API

1. Fininzen → Impostazioni → sezione **Token API**.
2. Crea un token, es. label `iPhone — Apple Pay`.
3. Copia subito il valore mostrato (inizia con `fnz_...`) — non sarà più visibile dopo.
   Incollalo in Note o Password temporaneamente, lo useremo al passo 4.

## 2. Crea l'automazione

1. App **Comandi** → tab **Automazione** → **+** in alto a destra → **Crea automazione personale**.
2. Scorri fino a **Wallet** (su alcune versioni iOS appare come **App** → o direttamente
   **Transazione Apple Pay**/**Apple Pay Transaction** — il nome esatto varia per versione iOS,
   cercalo scorrendo l'elenco dei trigger).
3. Seleziona **Qualsiasi carta** (o la carta specifica che usi per i pagamenti NFC di persona).
4. **Fatto** in alto a destra.

## 3. Aggiungi le azioni

Nell'editor dell'automazione:

1. Tocca **Aggiungi azione**, cerca **Contenuto URL** (*Get Contents of URL*).
2. **URL**: `https://fininzen.nacci.eu/api/expenses/quick-add/`
   (path senza prefisso `/fininzen` — vedi `deploy/caddy/fininzen.Caddyfile`, che espone
   `/api/*` senza strip per i chiamanti diretti esterni al browser).
3. Tocca **Mostra altro** (*Show More*) per espandere le opzioni:
   - **Metodo**: `POST`
   - **Intestazioni** (Headers) — aggiungi due righe:
     - `Authorization` → `Bearer fnz_IL_TUO_TOKEN` (incolla il token del passo 1, con lo spazio dopo `Bearer`)
     - `Content-Type` → `application/json`
   - **Corpo della richiesta** (Request Body): scegli **JSON**, poi aggiungi questi campi
     (icona **+** sotto il corpo — corrispondono a `QuickAddExpenseSerializer`,
     `expenses/api_token_serializers.py`):
     - `amount` → tocca il campo valore, scegli la **variabile magica** offerta dal trigger
       Wallet: cerca qualcosa come **Importo transazione** / **Transaction Amount**.
     - `merchant` → variabile magica **Nome commerciante** / **Transaction Merchant**.
     - `category` → (opzionale) testo fisso, es. `Spese quotidiane`, se vuoi che finisca
       sempre in una categoria specifica invece che nel fallback "Da categorizzare".
       Deve corrispondere esattamente (case-insensitive) al nome di una categoria che hai
       già in Fininzen, altrimenti l'automazione la registra comunque, ma nella categoria
       di fallback.
     - `date` → lascia vuoto: l'endpoint usa la data odierna di default.

   Le variabili magiche esatte offerte dal trigger Wallet dipendono dalla versione di iOS:
   dopo il passo 2 tocca il campo `amount`/`merchant` e scegli dalla lista delle variabili
   disponibili sopra la tastiera — cerca quelle che iniziano con "Transazione"/"Transaction".

## 4. Test manuale prima di affidarti al trigger silenzioso

Un'automazione Wallet silenziosa non mostra errori se qualcosa va storto. Prima di fidartene:

1. Aggiungi temporaneamente in coda un'azione **Mostra risultato** (*Show Result*) collegata
   all'output di "Contenuto URL" — ti mostrerà la risposta JSON (spesa creata, con `id`) o
   l'errore (es. `401` se il token è sbagliato/revocato, `400` se `amount` è mancante/zero).
2. Tocca **Esegui automazione ora** in fondo alla schermata per testarla senza dover fare
   davvero un pagamento NFC.
3. Verifica in Fininzen (Spese) che la voce sia comparsa con l'importo/descrizione corretti.
4. Una volta confermato che funziona, rimuovi l'azione "Mostra risultato" (opzionale: sostituiscila
   con una **Notifica** breve tipo "Spesa registrata: [amount]€").

## 5. Rendila silenziosa

In fondo alla schermata dell'automazione: disattiva **Chiedi prima di eseguire**
(*Ask Before Running*). Senza questo, iOS ti chiederebbe conferma a ogni transazione NFC
prima di eseguire l'automazione — vanificando l'obiettivo di registrazione automatica.

Nota: a seconda della versione iOS, Apple può comunque mostrare una notifica non interattiva
("Automazione [nome] eseguita") per trasparenza — è normale e non richiede tap.

## Sicurezza

- Il token vive in chiaro nell'header dell'automazione, sincronizzato via iCloud sul tuo
  account Apple — stesso livello di esposizione di qualunque altro segreto salvato in un
  Comando. Se perdi il telefono o sospetti una compromissione, revoca il token da
  Impostazioni → Token API in Fininzen: l'automazione smetterà di funzionare (risposta 401)
  finché non ne generi uno nuovo e aggiorni l'header.
- Il token ha scope `expenses:write` — anche se compromesso, non può leggere/modificare altro
  che creare nuove spese (rifiutato su `/api/expenses/` pieno, `/api/portfolio/*`, ecc. — vedi
  `fininzen/permissions.py`, `requires_api_token_scope`).

## Fuori scope

- Automazione equivalente per Android/Google Pay (nessun trigger/webhook nativo disponibile,
  richiederebbe un'app terza).
- Endpoint per popolare un picker di categorie nello Shortcut: non necessario col design a
  fallback automatico descritto sopra.
