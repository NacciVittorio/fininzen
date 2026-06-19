# Edge brute-force protection with fail2ban (HIGH-34)

The app already rate-limits the auth endpoints in Django (DRF `ScopedRateThrottle`,
see `finnet/settings.py` → `DEFAULT_THROTTLE_RATES`). This document adds an
**edge** layer that bans abusive IPs at the firewall before they reach the app —
useful when the stock Caddy binary is used (no `rate_limit` module compiled in).

Two options:

1. **Caddy `rate_limit` module** — preferred when you can rebuild Caddy:
   ```
   xcaddy build --with github.com/mholt/caddy-ratelimit
   ```
   then uncomment the `rate_limit` block in `Caddyfile`.

2. **fail2ban on the Caddy access log** — works with the stock binary.

## fail2ban setup

Caddy logs JSON to `/var/log/caddy_access.log` (see `Caddyfile`). Add a filter
that matches auth requests rejected with 401/429.

`/etc/fail2ban/filter.d/finnet-auth.conf`:

```ini
[Definition]
# Caddy JSON access log: match auth endpoints answered with 401 or 429.
failregex = ^.*"remote_ip":"<HOST>".*"uri":"/api/auth/[^"]*".*"status":(401|429).*$
ignoreregex =
```

`/etc/fail2ban/jail.d/finnet-auth.conf`:

```ini
[finnet-auth]
enabled  = true
backend  = polling
logpath  = /var/log/caddy_access.log
filter   = finnet-auth
maxretry = 20
findtime = 60
bantime  = 900
# Ban at the firewall. Adjust the action to your firewall (nftables shown).
banaction = nftables-multiport
port      = http,https
```

Reload and verify:

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status finnet-auth
```

`maxretry=20 / findtime=60` mirrors the app-level login throttle (20/min); the
edge ban kicks in for an IP that keeps hammering past the app's 429s.
