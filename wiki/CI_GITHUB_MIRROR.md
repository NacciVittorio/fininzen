# CI su GitHub Actions con mirror da GitLab

La quota di compute GitLab di questo progetto è esaurita: ogni pipeline fallisce
subito con `ci_quota_exceeded`, colorando di rosso le MR senza aver eseguito
nulla. La CI è quindi stata spostata su **GitHub Actions**, che su un repository
pubblico ha minuti illimitati sui runner standard.

GitLab resta il repository in cui si lavora: branch, merge request, review,
issue, release. GitHub è una **vetrina in sola lettura** che fa da motore di
calcolo.

## Come funziona

```
si lavora su GitLab  (branch, MR, review, merge)
      │
      ├─ push mirror ──────────────→ github.com/NacciVittorio/fininzen
      │  (feature del repository,          │
      │   non consuma minuti CI)           │
      │                                    ├─ on: push → .github/workflows/ci.yml
      │                                    │             (lint, test, build)
      │                                    │
      └─────────── commit status ←─────────┘
         appare nel widget della MR su GitLab
```

Il deploy **non è toccato**: il server continua a prendere il codice da GitLab
con `deploy.sh`, e GitLab resta sempre la copia aggiornata per prima.

## Le tre regole da non violare

1. **GitHub è in sola lettura.** Qualsiasi commit creato lì (una modifica dal
   web, un merge di PR, un bot) viene cancellato alla sincronizzazione
   successiva. È per questo che `.github/dependabot.yml` è stato rimosso: le sue
   PR sarebbero nate già condannate. Al suo posto c'è
   [`.github/workflows/renovate.yml`](../.github/workflows/renovate.yml), che
   apre le MR su GitLab.
2. **Nessuna branch protection su `main` lato GitHub.** Il mirror aggiorna i ref
   in modo forzato; una regola di protezione farebbe fallire la sincronizzazione.
   Le protezioni vanno tenute su GitLab, dove si lavora davvero.
3. **I workflow devono esistere sul branch che si pusha.** GitHub legge
   `.github/workflows/` dal commit ricevuto, non da `main`: un branch nato prima
   di questo lavoro non ha CI finché non viene rebasato.

## Configurazione manuale

Quattro passaggi, due token. I token vanno generati a mano: nessuno dei due può
essere creato dagli script.

### 1. Token GitHub — serve a GitLab per pushare

GitHub → *Settings* → *Developer settings* → *Personal access tokens* →
*Fine-grained tokens* → **Generate new token**

| Campo | Valore |
| --- | --- |
| Repository access | *Only select repositories* → `NacciVittorio/fininzen` |
| Contents | **Read and write** |
| Workflows | **Read and write** |
| Expiration | 90 giorni o più (alla scadenza il mirror si ferma silenziosamente) |

> Il permesso **Workflows** non è opzionale. Senza, GitHub rifiuta qualsiasi push
> che tocchi `.github/workflows/` con
> `refusing to allow a Personal Access Token to create or update workflow`, e
> siccome la prima sincronizzazione aggiunge proprio quei file, il mirror
> fallirebbe subito. Con un token *classic* l'equivalente è `repo` + `workflow`.

Copia il token: non è più visualizzabile dopo.

### 2. Mirror su GitLab

GitLab → progetto → *Settings* → *Repository* → **Mirroring repositories**

| Campo | Valore |
| --- | --- |
| Git repository URL | `https://github.com/NacciVittorio/fininzen.git` |
| Mirror direction | **Push** |
| Authentication method | *Username and password* |
| Username | `NacciVittorio` |
| Password | il token del passo 1 |
| Only mirror protected branches | **lasciare disattivo** |
| Keep divergent refs | lasciare disattivo |

L'ultima opzione è quella che conta: se attivata, solo `main` arriverebbe su
GitHub e i feature branch non verrebbero testati — cioè esattamente quando serve.

Premi *Mirror repository*, poi **Update now** (l'icona delle frecce) per forzare
la prima sincronizzazione senza aspettare.

`github/main` è un antenato diretto di `origin/main`, quindi la prima
sincronizzazione è un fast-forward pulito: nessun force push, nessuna storia
riscritta.

### 3. Token GitLab — serve alle Action per rispondere

GitLab → progetto → *Settings* → *Access Tokens* → **Add new token**

| Campo | Valore |
| --- | --- |
| Nome | `github-actions` |
| Role | **Developer** |
| Scopes | `api`, `write_repository` |

Un *Project Access Token* è preferibile a un Personal: vale solo per questo
progetto, quindi se viene compromesso il danno è circoscritto. Se il piano non
lo permette, un Personal Access Token con scope `api` funziona uguale.

Serve per due cose: pubblicare il commit status sulla MR (`api`) e permettere a
Renovate di aprire le MR (`write_repository`).

### 4. Secret su GitHub

GitHub → repository → *Settings* → *Secrets and variables* → *Actions* →
**New repository secret**

| Campo | Valore |
| --- | --- |
| Name | `GITLAB_API_TOKEN` |
| Secret | il token del passo 3 |

Il repository è pubblico, ma i secret non sono leggibili dai fork né stampati nei
log, quindi restano al sicuro. Finché questo secret non esiste, il job
`gitlab-status` e Renovate si limitano a non fare nulla: non falliscono.

## Verifica

1. **Mirror** — la pagina *Mirroring repositories* mostra *Last successful
   update* con un timestamp recente, non un errore rosso.
2. **CI** — la tab *Actions* su GitHub mostra un run partito da `push`. La
   pipeline completa gira in circa 6 minuti.
3. **Status sulla MR** — apri una MR su GitLab e controlla il widget: compare
   `GitHub Actions / CI` con il link al run.
4. **Renovate** — *Actions* → *Renovate* → *Run workflow* per un test immediato,
   senza aspettare il lunedì. Devono comparire delle MR su GitLab.

## Renovate al posto di Dependabot

[`renovate.json`](../renovate.json) riproduce già i gruppi che usava Dependabot
(`backend-minor-patch`, `web-minor-patch`, con le stesse label), quindi il
comportamento è quello di prima: una MR settimanale per ecosistema invece di una
raffica per pacchetto.

La differenza è dove arriva: le MR si aprono su GitLab, perché il workflow gira
con `RENOVATE_PLATFORM: gitlab`. GitHub fornisce solo la CPU.

Lo schedule (`cron: "0 6 * * 1"`) **parte solo dal branch di default**: finché
`renovate.yml` non è su `main`, il lunedì non succede niente. Il
`workflow_dispatch` funziona da subito su qualsiasi branch.

## Tornare a GitLab CI

Quando la quota si ricarica:

1. In [`.gitlab-ci.yml`](../.gitlab-ci.yml) ripristina le `workflow: rules`
   originali, conservate commentate subito sotto il `when: never`.
2. Disattiva il mirror su GitLab, o lascialo se GitHub ti serve come vetrina.
3. Rimuovi `.github/workflows/renovate.yml` e riattiva la pipeline schedulata
   (*Settings* → *CI/CD* → *Pipeline schedules*) per il job `renovate`.

I job GitLab sono rimasti intatti e allineati: puntano agli stessi
`ci-tools/*.sh` dei workflow GitHub.

## Problemi frequenti

| Sintomo | Causa |
| --- | --- |
| Mirror fallisce con `refusing to allow a Personal Access Token…` | Al token GitHub manca il permesso **Workflows** (passo 1) |
| Mirror fallisce con `protected branch hook declined` | C'è una branch protection su `main` lato GitHub: rimuovila |
| Nessun run su GitHub dopo il push | Il branch non contiene `.github/workflows/`: rebasa su `main` |
| `gitlab-status` avvisa `HTTP 404` | Path del progetto sbagliato in `GITLAB_PROJECT`, o token senza scope `api` |
| `gitlab-status` avvisa `HTTP 403` | Il token non ha almeno il ruolo Developer |
| Lo status appare ma non blocca il merge | Comportamento previsto: il gating obbligatorio è *External Status Checks*, disponibile solo su Ultimate |
| Renovate non apre nulla | Secret `GITLAB_API_TOKEN` assente (il job viene saltato) o senza `write_repository` |
| Tutto si ferma dopo qualche mese | Uno dei due token è scaduto |
