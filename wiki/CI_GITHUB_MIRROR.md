# CI con mirror GitHub

GitLab resta il posto in cui si lavora: branch, merge request e deploy. GitHub
serve come motore di esecuzione, perché la quota di compute GitLab del progetto
è esaurita: qualunque pipeline GitLab provi a creare fallisce all'istante con
`ci_quota_exceeded`, senza che i job partano nemmeno.

## Flusso breve

1. Si lavora e si apre la merge request su GitLab.
2. GitLab fa push mirror verso il repository GitHub.
3. GitHub Actions esegue i job di CI sui push e sui tag.
4. GitHub riporta l'esito su GitLab come **commit status**, visibile nel widget
   della merge request.
5. Renovate apre le merge request di dipendenze su GitLab, non su GitHub.
6. I tag `vX.Y.Z` restano la fonte di verità per le release.

## Stato dei job GitLab

Tutti i job in [`.gitlab-ci.yml`](../.gitlab-ci.yml) sono **dormienti**: restano
definiti ma con `when: never`, e il blocco `workflow:` impedisce del tutto la
creazione della pipeline. È voluto che sia un `workflow:` no-op invece di
spegnere CI/CD dalle impostazioni del progetto: spegnerlo nasconderebbe anche il
widget pipeline nella MR, cioè esattamente dove deve comparire il commit status
di GitHub.

I corpi dei job pesanti vivono in `ci-tools/*.sh`, condivisi con i workflow
GitHub, così le due sponde non divergono e il ritorno a GitLab è una modifica di
una riga per job.

## Gate di merge

`github-ci-gate` ([`ci-tools/check-github-ci.py`](../ci-tools/check-github-ci.py))
è il pezzo che renderebbe l'esito di GitHub un vero requisito di merge: aspetta
la run `CI` sullo stesso SHA e fallisce se GitHub è rosso o non risponde entro il
timeout.

**È dormiente**, e non per scelta di comodo: interrogare GitHub costa compute
GitLab, cioè proprio la risorsa che manca. Finché la quota non torna, l'esito di
GitHub arriva nella MR come commit status — visibile ma non vincolante. Su GitLab
Free non è comunque possibile renderlo obbligatorio: servirebbero gli *External
Status Checks*, disponibili solo in Ultimate.

## Release

- La release **GitHub** e la release **GitLab** vengono create entrambe dal
  workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml),
  dalle stesse note estratte da `ci-tools/release-notes.sh`.
- Il job `release` in [`.gitlab-ci.yml`](../.gitlab-ci.yml) è il gemello
  dormiente: riattivarlo richiede di rimuovere lo step "Create GitLab Release"
  dal workflow GitHub, altrimenti i due si contendono la stessa release.
- Se manca la release per un tag già pushato, il recupero è
  `gh workflow run release.yml --ref vX.Y.Z`.

## Dipendenze

[`renovate.json`](../.github/renovate.json) sostituisce Dependabot e mantiene gli stessi
gruppi principali di aggiornamento. Il workflow GitHub gira con
`RENOVATE_PLATFORM=gitlab`, quindi le MR finiscono nel progetto GitLab.

Attenzione ai bump che cambiano il comportamento di un linter: `ruff` porta con
sé il proprio set di regole di default, e [`ruff.toml`](../ruff.toml) lo fissa in
modo esplicito proprio perché un aggiornamento non possa riscrivere il contratto
di lint da solo — è successo con 0.16.0, che ha portato le regole attive di
default da 59 a 413.

## Token necessari

- Un token GitHub serve per permettere al mirror di scrivere su GitHub.
- Il secret `GITLAB_API_TOKEN` su GitHub (personal access token con scope `api`)
  serve a GitHub Actions per pubblicare il commit status e per creare la release
  su GitLab. Gli step che lo usano fanno no-op se il secret non è impostato.
- Un token GitLab serve a Renovate per aprire le MR.

## Tornare alla CI su GitLab

Quando la quota di compute torna disponibile:

1. ripristinare le regole `workflow:` lasciate commentate in `.gitlab-ci.yml`;
2. togliere i job da `.ci-rules`, e rimettere la regola sul tag nel job
   `release` eliminando lo step "Create GitLab Release" da `release.yml`;
3. disattivare il push mirror.
