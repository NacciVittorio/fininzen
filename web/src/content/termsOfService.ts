// Termini di Servizio — italiano, stesso ragionamento di privacyPolicy.ts.
// Volutamente breve: questo non è un prodotto commerciale, serve solo a
// mettere per iscritto le poche regole che contano davvero (in particolare
// la funzione di condivisione dati tra utenti).

import type { PolicySection } from "./privacyPolicy";

export const TERMS_OF_SERVICE_UPDATED_AT = "2026-08-02";

export const TERMS_OF_SERVICE_SECTIONS: PolicySection[] = [
    {
        id: "descrizione",
        heading: "1. Il servizio",
        body: [
            "Fininzen è un'app personale di tracciamento spese e portafoglio investimenti, sviluppata e gestita da Vittorio Nacci. Non è un prodotto commerciale: l'accesso è su invito/approvazione ed è pensato per un piccolo gruppo di persone conosciute da chi la gestisce.",
        ],
    },
    {
        id: "account",
        heading: "2. Account e accesso",
        body: [
            "Le nuove registrazioni restano in stato 'in attesa' finché non vengono approvate manualmente da un amministratore.",
            "Ogni account è personale: non condividere le tue credenziali di accesso con altri. Se vuoi che qualcun altro possa vedere i tuoi dati, usa la funzione di condivisione descritta sotto, non la condivisione della password.",
        ],
    },
    {
        id: "condivisione-dati",
        heading: "3. Condivisione dei dati tra utenti",
        body: [
            "L'app permette di concedere ad un altro utente registrato l'accesso ai propri dati (sola lettura, scrittura o completo). Chi concede l'accesso resta responsabile di scegliere con cura a chi lo concede e di revocarlo quando non serve più.",
            "Chi riceve un accesso condiviso deve trattare i dati a cui accede con la stessa cura che riserverebbe ai propri.",
        ],
    },
    {
        id: "uso-lecito",
        heading: "4. Uso corretto del servizio",
        body: [
            "Usa l'app solo per scopi leciti e personali. Non tentare di accedere a dati di altri utenti al di fuori della funzione di condivisione descritta sopra, né di compromettere la sicurezza del servizio.",
        ],
    },
    {
        id: "responsabilita",
        heading: "5. Nessuna garanzia",
        body: [
            "Fininzen è un progetto personale, mantenuto nel tempo libero, senza garanzie di disponibilità continuativa, accuratezza dei dati di mercato o assenza di errori. Non usarlo come unica fonte per decisioni finanziarie importanti. Fai sempre un backup dei tuoi dati tramite l'export se ti servono per altri scopi.",
        ],
    },
    {
        id: "recesso",
        heading: "6. Recesso",
        body: [
            "Puoi smettere di usare il servizio e cancellare il tuo account in qualsiasi momento da Impostazioni → Elimina account. La cancellazione è immediata e definitiva.",
        ],
    },
    {
        id: "legge",
        heading: "7. Legge applicabile",
        body: ["Questi termini sono regolati dalla legge italiana."],
    },
    {
        id: "contatti",
        heading: "8. Contatti",
        body: ["vittorionacci@icloud.com"],
    },
];
