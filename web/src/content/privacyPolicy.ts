// Informativa Privacy — scritta in italiano, l'utenza reale dell'app è
// italiana. Se in futuro servisse una versione inglese, va aggiunta come
// struttura parallela (stesso shape), non come traduzione automatica: è un
// documento a valenza legale, meglio tenerlo singolo e curato piuttosto che
// doppio e disallineato.
//
// Nota per chi lavora su questo file: audit trail per l'uso di
// DataAccessGrant (view-as) e un workflow strutturato per le richieste
// privacy sono stati identificati come miglioramenti futuri — volutamente
// fuori scope qui. (L'export CSV era limitato a pochi modelli: esteso a
// tutti i dati dell'utente in questa revisione — vedi fininzen/export_views.py.)

export type PolicySection = {
    id: string;
    heading: string;
    body: string[];
};

export const PRIVACY_POLICY_UPDATED_AT = "2026-08-02";

export const PRIVACY_POLICY_SECTIONS: PolicySection[] = [
    {
        id: "titolare",
        heading: "1. Titolare del trattamento",
        body: [
            "Il titolare del trattamento è Vittorio Nacci, che sviluppa e gestisce Fininzen come progetto personale.",
            "Per qualsiasi richiesta relativa ai tuoi dati puoi scrivere a vittorionacci@icloud.com.",
            "Non è nominato un Responsabile della Protezione dei Dati (DPO): non è un obbligo per un servizio di queste dimensioni, che non tratta dati su larga scala.",
        ],
    },
    {
        id: "dati-raccolti",
        heading: "2. Dati raccolti",
        body: [
            "Dati identificativi e account: email (che coincide con lo username), password (salvata come hash, mai in chiaro), nome, data di iscrizione, ultimo accesso.",
            "Dati finanziari: spese, categorie, budget, spese ricorrenti, asset di investimento, transazioni, saldi conto, obiettivi FIRE. La maggior parte di questi dati è salvata in chiaro nel database — è una scelta tecnica deliberata, necessaria per poter filtrare, sommare e ordinare gli importi; solo alcuni campi specifici (le note su un asset, la descrizione di una spesa ricorrente, i suggerimenti di descrizione spesa) sono cifrati con AES-256-GCM.",
            "Dati di sicurezza: se attivi l'autenticazione a due fattori (TOTP) o Face ID/Touch ID (WebAuthn), il relativo segreto o chiave pubblica viene salvato cifrato o comunque non riutilizzabile per accedere al tuo account senza il tuo dispositivo.",
        ],
    },
    {
        id: "finalita",
        heading: "3. Finalità e base giuridica",
        body: [
            "I tuoi dati vengono trattati per fornirti il servizio che hai richiesto registrandoti (tracciamento spese e portafoglio investimenti) — base giuridica: esecuzione di un accordo con te, art. 6.1.b GDPR.",
            "Alcuni dati tecnici (log applicativi, indirizzo IP su richieste rifiutate) vengono trattati per sicurezza e prevenzione di accessi non autorizzati — base giuridica: legittimo interesse, art. 6.1.f GDPR.",
            "Non facciamo profilazione, non inviamo comunicazioni di marketing, non vendiamo né condividiamo i tuoi dati con terzi per scopi commerciali.",
        ],
    },
    {
        id: "cookie",
        heading: "4. Cookie",
        body: [
            "L'app utilizza solo due cookie, entrambi tecnici e strettamente necessari al funzionamento dell'autenticazione: fn_refresh (contiene il token di refresh della sessione, non leggibile da JavaScript, durata 30 giorni) e fn_csrf (protezione contro richieste falsificate, durata 30 giorni).",
            "Non vengono usati cookie di profilazione, marketing o analytics, né di terze parti. Per questo motivo, in base all'art. 122 del Codice Privacy (che recepisce la direttiva ePrivacy), questi cookie sono esentati dall'obbligo di richiedere un consenso esplicito: è sufficiente informarti della loro presenza, come stiamo facendo qui.",
        ],
    },
    {
        id: "terzi",
        heading: "5. Condivisione dei dati",
        body: [
            "Per recuperare prezzi e quotazioni, l'app interroga servizi esterni (Yahoo Finance, Borsa Italiana, la Banca Centrale Europea per i tassi di cambio) inviando solo simboli di borsa, valute e date — mai dati che ti identifichino.",
            "È attivo, solo se configurato dall'amministratore, un servizio di monitoraggio errori (Sentry) che riceve informazioni tecniche sugli errori dell'applicazione, con l'invio di dati personali esplicitamente disattivato nella configurazione.",
            "Condivisione tra utenti: l'app permette di condividere volontariamente il proprio account con un altro utente registrato (funzione di 'visualizzazione come'), scegliendo se dargli accesso in sola lettura, scrittura o completo. Se attivi questa funzione, la persona a cui la concedi può vedere (ed eventualmente modificare) i tuoi dati finanziari secondo il livello di permesso scelto. Puoi revocare l'accesso in qualsiasi momento dalle impostazioni.",
        ],
    },
    {
        id: "conservazione",
        heading: "6. Conservazione dei dati",
        body: [
            "I dati del tuo account vengono conservati finché l'account esiste. Puoi cancellarlo in autonomia in qualsiasi momento dalle Impostazioni — la cancellazione è immediata e definitiva, senza periodo di recupero.",
            "I log applicativi (usati per sicurezza e diagnosi di problemi tecnici) vengono conservati per 7 giorni, dopo i quali vengono eliminati automaticamente.",
        ],
    },
    {
        id: "sicurezza",
        heading: "7. Sicurezza",
        body: [
            "Le password sono salvate con hashing, mai in chiaro. Alcuni campi sensibili sono cifrati con AES-256-GCM. È disponibile l'autenticazione a due fattori (TOTP) e l'accesso biometrico (Face ID/Touch ID via WebAuthn). I cookie di autenticazione sono protetti (httpOnly) e la connessione è protetta da HTTPS con policy di sicurezza restrittive lato browser (CSP).",
        ],
    },
    {
        id: "diritti",
        heading: "8. I tuoi diritti",
        body: [
            "Accesso e portabilità: puoi esportare i tuoi dati in formato CSV in qualsiasi momento da Impostazioni → Esporta dati.",
            "Cancellazione: puoi eliminare il tuo account e tutti i dati associati da Impostazioni → Elimina account.",
            "Rettifica: puoi correggere i tuoi dati anagrafici e le tue preferenze direttamente dal tuo profilo.",
            "Per qualsiasi altra richiesta relativa ai tuoi dati che non è coperta da queste funzioni self-service, scrivi a vittorionacci@icloud.com.",
        ],
    },
    {
        id: "contatti",
        heading: "9. Contatti",
        body: ["vittorionacci@icloud.com"],
    },
];
