# Wiki — Fininzen

Indice della documentazione mantenuta. Il [README principale](../README.md)
copre installazione e sviluppo locale.

## Deploy supportati

| Modalità | Ruolo attuale | Fonte operativa |
|---|---|---|
| Bare-metal, systemd e SQLite | Deploy pubblico in produzione | [SYSTEMD_DEPLOY.md](SYSTEMD_DEPLOY.md) |
| Docker full-stack, PostgreSQL e Redis | Deploy containerizzato con reverse proxy esterno | [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) |

Le due guide sono indipendenti: non combinare comandi, file `.env`, backup o
scheduler di una modalità con l'altra.

## Integrazioni

- [APPLE_PAY_SHORTCUT.md](APPLE_PAY_SHORTCUT.md) — automazione iOS Wallet per
  registrare una spesa tramite token API.

## Processo di sviluppo

- [VERSIONING.md](VERSIONING.md) — workflow di issue e branch, versione unica,
  note di rilascio e `just release`.
- [CI_GITHUB_MIRROR.md](CI_GITHUB_MIRROR.md) — CI GitHub Actions collegata al
  repository GitLab.

## Archivio storico

I documenti sotto `archive/` sono snapshot non mantenuti. Rimangono consultabili
per ricostruire decisioni passate, ma i loro comandi non devono essere usati per
un nuovo deploy.

- [archive/POSTGRES_MIGRATION.md](archive/POSTGRES_MIGRATION.md)
