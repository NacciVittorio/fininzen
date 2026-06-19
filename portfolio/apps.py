"""
portfolio/apps.py — Configurazione dell'app Django.

Qui aggiungiamo il refresh automatico dei prezzi all'avvio del server.
Usiamo il segnale post_migrate (dopo le migration) e ready() per assicurarci
che il database sia pronto prima di fare query.

NOTA: il refresh automatico parte solo quando il server è completamente avviato.
In development con --reload, viene eseguito due volte (una per processo).
Questo è accettabile per un'app personale.
"""

from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class PortfolioConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "portfolio"

    def _database_schema_ready_for_startup_refresh(self):
        try:
            from django.db import DEFAULT_DB_ALIAS, connections
            from django.db.migrations.executor import MigrationExecutor

            connection = connections[DEFAULT_DB_ALIAS]
            executor = MigrationExecutor(connection)
            pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        except Exception as e:
            logger.warning(
                "Refresh prezzi all'avvio saltato: impossibile verificare lo schema DB (%s)",
                e,
            )
            return False

        if pending:
            pending_names = [
                f"{migration.app_label}.{migration.name}"
                for migration, backwards in pending
                if not backwards
            ]
            preview = ", ".join(pending_names[:5])
            if len(pending_names) > 5:
                preview += f", ... (+{len(pending_names) - 5})"
            logger.warning(
                "Refresh prezzi all'avvio saltato: migrazioni pendenti%s",
                f" ({preview})" if preview else "",
            )
            return False
        return True

    def ready(self):
        """
        Viene chiamato quando Django ha caricato tutti i modelli e l'app è pronta.
        Avviamo l'aggiornamento prezzi in un thread separato per non bloccare
        l'avvio del server — l'utente può usare l'app mentre i prezzi si aggiornano.
        """
        from . import signals  # noqa: F401
        import os
        import sys
        import threading

        # Skippa in management commands (migrate, collectstatic, test, ecc.)
        is_runserver = "runserver" in sys.argv
        is_gunicorn = sys.argv and "gunicorn" in (sys.argv[0] or "")
        if not (is_runserver or is_gunicorn):
            return

        # Con Django dev server + autoreload, ready() parte 2 volte:
        # solo il processo figlio ha RUN_MAIN=true → skippiamo il parent.
        if is_runserver and os.environ.get("RUN_MAIN") != "true":
            return

        # Con gunicorn multi-worker, ogni worker farebbe partire il thread
        # separatamente: opt-in esplicito per evitare N refresh paralleli.
        if is_gunicorn and os.environ.get("ENABLE_PRICE_REFRESH_ON_STARTUP") != "1":
            return

        if not self._database_schema_ready_for_startup_refresh():
            return

        # Con gunicorn multi-worker, tutti i worker hanno la stessa env var e
        # chiamano ready() indipendentemente. Usiamo un fcntl exclusive lock per
        # garantire che solo il primo worker lanci il refresh. I lock fcntl si
        # rilasciano automaticamente alla morte del processo (nessun lock stale).
        import fcntl

        lock_path = "/tmp/finnet_startup_refresh.lock"
        lock_fd = None
        try:
            lock_fd = open(lock_path, "w")
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            if lock_fd is not None:
                lock_fd.close()
            return

        def _refresh(fd=lock_fd):
            try:
                from .prices import aggiorna_tutti_i_prezzi

                logger.info(
                    "🚀 Avvio aggiornamento automatico prezzi all'avvio del server..."
                )
                result = aggiorna_tutti_i_prezzi()
                logger.info(
                    f"✓ Prezzi aggiornati: {result['updated']}/{result['total']}"
                )
            except Exception as e:
                logger.exception("Errore nell'aggiornamento automatico prezzi: %s", e)
            finally:
                fd.close()

        # Thread daemon: si ferma automaticamente quando il server si ferma
        t = threading.Thread(target=_refresh, daemon=True)
        t.start()
