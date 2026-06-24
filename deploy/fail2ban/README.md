# Edge brute-force protection with fail2ban (HIGH-34)

The app already rate-limits the auth endpoints in Django (DRF `ScopedRateThrottle`,
see `fininzen/settings.py` → `DEFAULT_THROTTLE_RATES`). This adds an **edge** layer
that bans abusive IPs at the firewall before they reach the app — useful when the
stock Caddy binary is used (no `rate_limit` module compiled in).

Two options:

1. **Caddy `rate_limit` module** — preferred when you can rebuild Caddy:
   ```
   xcaddy build --with github.com/mholt/caddy-ratelimit
   ```
   then uncomment the `rate_limit` block in `Caddyfile`.

2. **fail2ban on the Caddy access log** — works with the stock binary. The ready
   filter and jail ship in this directory.

## fail2ban setup

Caddy logs JSON to `/var/log/caddy_access.log` (see `Caddyfile`). Install the two
configs shipped here:

```bash
sudo cp filter.d/fininzen-auth.conf /etc/fail2ban/filter.d/
sudo cp jail.d/fininzen-auth.conf   /etc/fail2ban/jail.d/
sudo systemctl restart fail2ban
sudo fail2ban-client status fininzen-auth
```

- `filter.d/fininzen-auth.conf` matches auth requests rejected with 401/429 in the
  Caddy JSON access log.
- `jail.d/fininzen-auth.conf` uses `maxretry=20 / findtime=60` to mirror the
  app-level login throttle (20/min); the edge ban (`bantime=900`,
  `banaction=nftables-multiport`) kicks in for an IP that keeps hammering past the
  app's 429s. Adjust `banaction` to your firewall if not using nftables.
