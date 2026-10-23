#!/bin/bash
# Run as root on the existing Ubuntu/aaPanel host; never stops the website.
set -euo pipefail
test "$(id -u)" = 0
install -d -m 755 /var/lib/letsencrypt/.well-known/acme-challenge
target=/www/server/panel/vhost/nginx/mail.maketh.au.conf
if test -e "$target" && ! grep -q '^# Managed by maketh.au deploy/mail' "$target"; then
  echo 'Refusing to replace an unmanaged mail vhost' >&2
  exit 1
fi
cat > "$target" <<'NGINX'
# Managed by maketh.au deploy/mail
server {
    listen 80;
    server_name mail.maketh.au;
    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 404; }
}
NGINX
/www/server/nginx/sbin/nginx -t
systemctl reload nginx
echo 'ACME HTTP endpoint ready; the main website was not changed.'
