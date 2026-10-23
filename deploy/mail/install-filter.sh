#!/bin/bash
# Current vendor-supported Rspamd for Ubuntu jammy and a private DNS resolver.
# Ubuntu's Rspamd 2.7 rejects current Google ARC parameters; do not disable ARC.
set -euo pipefail
test "$(id -u)" = 0
. /etc/os-release
test "$VERSION_CODENAME" = jammy
install -d -m 755 /etc/apt/keyrings
install -d -m 700 /root/maketh-mail-20261024
curl --fail --silent --show-error --location https://rspamd.com/apt-stable/gpg.key -o /root/maketh-mail-20261024/rspamd-signing-key.asc
gpg --dearmor --yes -o /etc/apt/keyrings/rspamd.gpg /root/maketh-mail-20261024/rspamd-signing-key.asc
chmod 644 /etc/apt/keyrings/rspamd.gpg
printf 'deb [signed-by=/etc/apt/keyrings/rspamd.gpg] https://rspamd.com/apt-stable/ jammy main\n' > /etc/apt/sources.list.d/rspamd.list
apt-get update -qq
DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y --no-install-recommends rspamd unbound redis-server
cat > /etc/unbound/unbound.conf.d/maketh-mail.conf <<'UNBOUND'
server:
    interface: 127.0.0.1
    port: 5353
    access-control: 127.0.0.0/8 allow
    do-ip6: no
    hide-identity: yes
    hide-version: yes
    prefetch: yes
UNBOUND
cat > /etc/rspamd/local.d/options.inc <<'RSPAMD'
task_timeout = 30s;
dns {
    nameserver = ["127.0.0.1:5353"];
}
RSPAMD
unbound-checkconf
systemctl enable unbound redis-server
systemctl restart unbound
dig @127.0.0.1 -p 5353 gmail.com MX
rspamadm configtest
systemctl restart rspamd
rspamd --version
systemctl is-active unbound redis-server rspamd
