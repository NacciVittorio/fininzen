# CI con mirror GitHub e gate GitLab

GitLab resta il posto in cui si lavora: branch, merge request e deploy. GitHub
serve come motore di esecuzione per i job pesanti; GitLab ospita il gate
leggero che aspetta l'esito di GitHub Actions prima di autorizzare il merge.

## Flusso breve

1. Si lavora e si apre la merge request su GitLab.
2. GitLab fa push mirror verso il repository GitHub.
3. GitHub Actions esegue i job di CI sui push e sui tag.
4. GitLab esegue un gate leggero che interroga l'Actions run sullo stesso SHA.
5. Renovate apre le merge request di dipendenze su GitLab, non su GitHub.
6. I tag `vX.Y.Z` restano la fonte di verità per le release.

## Release

- Su GitLab la release viene creata dal job `release` in
  [`.gitlab-ci.yml`](../.gitlab-ci.yml).
- Su GitHub la release viene creata dal workflow `release.yml` presente nel
  ramo della mirror CI.
- Se le release non coincidono, di solito il problema è che il workflow GitHub
  non è presente sul branch che sta facendo il push.

## Dipendenze

[`renovate.json`](../renovate.json) sostituisce Dependabot e mantiene gli stessi
gruppi principali di aggiornamento. Il workflow GitHub gira con
`RENOVATE_PLATFORM=gitlab`, quindi le MR finiscono nel progetto GitLab.

## Token necessari

- Un token GitHub serve per permettere al mirror di scrivere su GitHub.
- Un token GitLab serve a GitHub Actions per pubblicare lo stato della CI e per
  permettere a Renovate di aprire le MR.

## Gate di merge

Il file [`.gitlab-ci.yml`](../.gitlab-ci.yml) ora crea una pipeline leggera su
GitLab che:

- lascia i job pesanti a GitHub Actions;
- aspetta il risultato di `CI` sullo stesso SHA;
- fallisce se GitHub è rosso o non risponde entro il timeout.

Se vuoi che GitLab blocchi davvero il merge, abilita anche la policy del
progetto che richiede pipeline verdi prima del merge.
