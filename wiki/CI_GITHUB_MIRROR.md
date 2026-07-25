# CI su GitHub Actions con mirror da GitLab

GitLab resta il posto in cui si lavora: branch, merge request e deploy.
GitHub serve solo come motore di esecuzione quando la CI o Renovate devono
girare lì e poi riportare il risultato su GitLab.

## Flusso breve

1. Si lavora e si fa merge su GitLab.
2. GitLab fa push mirror verso il repository GitHub.
3. GitHub Actions esegue i job di CI sui push e sui tag.
4. Renovate apre le merge request di dipendenze su GitLab, non su GitHub.
5. I tag `vX.Y.Z` restano la fonte di verità per le release.

## Release

- Su GitLab la release viene creata dal job `release` in
  [`.gitlab-ci.yml`](../.gitlab-ci.yml).
- Su GitHub la release viene creata dal workflow `release.yml` presente nel ramo
  della mirror CI.
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
