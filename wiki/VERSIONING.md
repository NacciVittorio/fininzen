# Workflow di sviluppo e release

Fininzen usa una versione SemVer unica per backend Django e frontend Next.js.
La fonte di verità è il file `VERSION`; non copiare numeri di versione nella
documentazione.

## Issue e branch

Il titolo di una issue segue il formato `<Prefisso>: <descrizione breve>`. I
prefissi delle issue classificano il lavoro e sono distinti dai tipi minuscoli
dei Conventional Commits (`fix:`, `feat:`, ecc.).

| Tipo | Prefisso | Esempio |
|---|---|---|
| Bug | `Fix:` | `Fix: Login redirect loop` |
| Nuova funzionalità | `Feature:` | `Feature: Dark mode` |
| Miglioramento | `Enhance:` | `Enhance: Portfolio chart` |
| Manutenzione o refactor | `Maintenance:` | `Maintenance: Auth middleware` |
| Domanda o discussione | `Question:` | `Question: FX rate source` |
| Riepilogo o stato | `Summary:` | `Summary: Sprint 3` |

Usa questo corpo, omettendo le sezioni non pertinenti:

```markdown
## Descrizione
<Cosa succede, cosa manca o cosa si vuole ottenere>

## Comportamento atteso
<Come dovrebbe funzionare>

## Comportamento attuale
<Solo per i bug>

## Passi per riprodurre
<Solo per i bug, come lista numerata>

## Note
<Contesto, screenshot o link; opzionale>
```

Assegna almeno una persona tra `NacciVittorio` e `itsNiccoloSabatini`, una label
`Type::*` e una `Priority::*`; aggiungi stato, risoluzione e milestone quando
pertinenti. Le label previste sono:

- tipo: `Type::Bug`, `Type::NewFeature`, `Type::Enhancement`,
  `Type::Maintenance`, `Type::Question`, `Type::Summary`;
- priorità: `Priority::Higher`, `Priority::Medium`, `Priority::Lower`;
- stato: `Blocked`, `FutureReference`;
- risoluzione: `Resolution::Fixed/Done`, `Resolution::Won'tFix`,
  `Resolution::Duplicate`, `Resolution::ByDesign`,
  `Resolution::NotReproducible`, `Resolution::NotApplicable`,
  `Resolution::External`, `Resolution::Answered`, `Resolution::ReviewNeeded`.

Crea il branch dalla issue GitLab tramite **Create merge request → Create
branch**. GitLab genera `<numero>-<titolo-slug>` e mantiene il collegamento con
la issue. Per lavorarci in locale:

```bash
git fetch origin
git checkout <numero>-<titolo-slug>
```

## Regole SemVer

| Modifica | Incremento |
|---|---|
| Correzione compatibile (`fix:`) | Patch |
| Funzionalità compatibile (`feat:`) | Minor |
| Modifica incompatibile (`!:` o `BREAKING CHANGE`) | Major |

Finché `major_version_zero = true` in `.cz.toml`, una modifica incompatibile
mantiene il progetto nella serie `0.x` e incrementa la minor. Per pubblicare la
prima versione stabile occorre disabilitare esplicitamente questa opzione o
forzare un incremento major.

Le migrazioni Django, `DEMO_SEED_VERSION` e le versioni dei dati non condividono
il SemVer dell'applicazione.

## Propagazione della versione

```text
VERSION
├── fininzen/settings.py → API health e schema OpenAPI
├── web/next.config.ts → versione e data mostrate nell'interfaccia
└── commitizen → package.json, package-lock.json, changelog e tag
```

`web/next.config.ts` ricava la data della release dall'intestazione
corrispondente in `CHANGELOG.md`. Il numero è visibile nella pagina About,
nella schermata di accesso, in `GET /api/health/` e in `openapi.json`.

## Note rivolte agli utenti

`CHANGELOG.md` è generato dai Conventional Commits ed è rivolto allo sviluppo.
Le note mostrate agli utenti vivono in
`web/src/content/releaseNotes.ts` e devono contenere italiano e inglese.

Prima di una release che introduce novità visibili, aggiungi in cima a
`RELEASE_NOTES` una voce con `UNRELEASED`:

```ts
{
    version: UNRELEASED,
    date: "",
    highlights: {
        it: ["Ora puoi …"],
        en: ["You can now …"],
    },
},
```

Il pre-bump hook `scripts/stamp_release_notes.py` inserisce versione e data. Una
release puramente tecnica può non avere note utente.

## Creare una release

1. Lavora su `main`, aggiornata rispetto al remote, e verifica che il working
   tree sia completamente pulito.
2. Esegui uno dei comandi:

   ```bash
   just release
   just release patch   # oppure minor / major
   ```

3. `commitizen` calcola la versione, aggiorna i file versionati e il changelog,
   rigenera OpenAPI, timbra le eventuali note utente, crea commit e tag annotato.
4. La recipe esegue `git push --follow-tags`.

> `just release` crea un commit dal working tree: non eseguirlo con modifiche
> estranee o non ancora revisionate, perché potrebbero finire nella release.

Il tag raggiunge GitLab e viene replicato su GitHub. Il workflow
`.github/workflows/release.yml` pubblica sia la GitHub Release sia la GitLab
Release usando la sezione corrispondente di `CHANGELOG.md`. Per recuperare una
release mancante su un tag esistente:

```bash
gh workflow run release.yml --ref vX.Y.Z
```

Il job GitLab equivalente resta dormiente finché la CI è eseguita tramite il
mirror GitHub; vedi [CI_GITHUB_MIRROR.md](CI_GITHUB_MIRROR.md).

## File coinvolti

| File | Ruolo |
|---|---|
| `VERSION` | Numero canonico. |
| `.cz.toml` | Regole commitizen e file aggiornati. |
| `CHANGELOG.md` | Storico tecnico generato. |
| `openapi.json` | Versione del contratto API. |
| `web/src/content/releaseNotes.ts` | Note utente bilingui. |
| `.github/workflows/release.yml` | Pubblicazione delle release. |

Non modificare manualmente i numeri in `VERSION`, package manifest,
`CHANGELOG.md` o `openapi.json`, e non creare tag di release a mano.
