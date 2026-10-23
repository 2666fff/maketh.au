#!/bin/bash
# Site-specific, rerunnable mail provisioning. No DNS changes, firewall changes,
# package installation or certificate issuance are hidden in this script.
set -euo pipefail
test "$(id -u)" = 0
test -s /etc/letsencrypt/live/mail.maketh.au/fullchain.pem
test -s /etc/letsencrypt/live/mail.maketh.au/privkey.pem
for program in postconf postmap doveconf opendkim-genkey rspamadm; do
  command -v "$program" >/dev/null
done
state=/etc/maketh-mail
install -d -m 700 "$state"
if ! test -e "$state/managed-v1"; then
  if test -e /etc/dovecot/users || test -e /var/vmail/maketh.au; then
    echo 'Existing mail state needs manual review; refusing to overwrite it.' >&2
    exit 1
  fi
  install -d -m 700 "$state/originals"
  cp -a /etc/postfix/main.cf /etc/postfix/master.cf "$state/originals/"
  cp -a /etc/dovecot/dovecot.conf "$state/originals/"
  cp -a /etc/opendkim.conf "$state/originals/"
  touch "$state/managed-v1"
fi
getent group vmail >/dev/null || groupadd --system vmail
id vmail >/dev/null 2>&1 || useradd --system --gid vmail --home-dir /var/vmail --shell /usr/sbin/nologin vmail
install -d -o vmail -g vmail -m 700 /var/vmail /var/vmail/maketh.au /var/vmail/maketh.au/admin

# Preserve the generated credential on every rerun. Never print it to stdout.
if ! test -s "$state/admin-password"; then
  (umask 077; openssl rand -base64 30 > "$state/admin-password")
fi
if ! test -s /etc/dovecot/users; then
  password_hash=$(openssl passwd -6 -stdin < "$state/admin-password")
  (umask 077; printf 'admin@maketh.au:{SHA512-CRYPT}%s\n' "$password_hash" > /etc/dovecot/users)
  unset password_hash
fi
chown root:dovecot /etc/dovecot/users
chmod 640 /etc/dovecot/users
(umask 077; {
  printf 'Mailbox: admin@maketh.au\nIMAP: mail.maketh.au, port 993, SSL/TLS\nSMTP: mail.maketh.au, port 465, SSL/TLS (or 587 STARTTLS)\nUsername: admin@maketh.au\nPassword: '
  cat "$state/admin-password"
} > "$state/owner-access.txt")

cat > /etc/dovecot/dovecot.conf <<'DOVECOT'
# Managed by maketh.au deploy/mail. Virtual mailbox, no shell account login.
protocols = imap lmtp
listen = 0.0.0.0
ssl = required
ssl_min_protocol = TLSv1.2
ssl_cert = </etc/letsencrypt/live/mail.maketh.au/fullchain.pem
ssl_key = </etc/letsencrypt/live/mail.maketh.au/privkey.pem
disable_plaintext_auth = yes
auth_mechanisms = plain login
auth_username_format = %Lu
auth_failure_delay = 3 secs
mail_location = maildir:/var/vmail/%d/%n/Maildir
mail_home = /var/vmail/%d/%n
mail_uid = vmail
mail_gid = vmail
first_valid_uid = 100
passdb {
  driver = passwd-file
  args = /etc/dovecot/users
}
userdb {
  driver = static
  args = uid=vmail gid=vmail home=/var/vmail/%d/%n
}
namespace inbox {
  inbox = yes
  separator = /
  mailbox Sent {
    special_use = \Sent
    auto = subscribe
  }
  mailbox Drafts {
    special_use = \Drafts
    auto = subscribe
  }
  mailbox Trash {
    special_use = \Trash
    auto = subscribe
  }
  mailbox Junk {
    special_use = \Junk
    auto = subscribe
  }
}
service imap-login {
  inet_listener imap {
    port = 0
  }
  inet_listener imaps {
    port = 993
    ssl = yes
  }
}
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}
protocol lmtp {
  postmaster_address = postmaster@maketh.au
}
DOVECOT

# Use the existing forward-confirmed PTR hostname as the outbound EHLO identity.
# The client-facing TLS hostname is independently mail.maketh.au.
postconf -e 'myhostname = vps-1fa720bd.vps.ovh.ca'
postconf -e 'smtp_helo_name = $myhostname'
postconf -e 'mydomain = maketh.au'
postconf -e 'myorigin = $mydomain'
postconf -e 'mydestination = $myhostname, localhost.localdomain, localhost'
postconf -e 'inet_interfaces = all'
postconf -e 'inet_protocols = ipv4'
postconf -e 'mynetworks = 127.0.0.0/8'
postconf -e 'relayhost ='
postconf -e 'relay_domains ='
postconf -e 'smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination'
postconf -e 'smtpd_recipient_restrictions = reject_non_fqdn_recipient, reject_unknown_recipient_domain, permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination'
postconf -e 'smtpd_sender_restrictions = reject_non_fqdn_sender'
postconf -e 'smtpd_helo_required = yes'
postconf -e 'disable_vrfy_command = yes'
postconf -e 'smtpd_sasl_type = dovecot'
postconf -e 'smtpd_sasl_path = private/auth'
postconf -e 'smtpd_sasl_auth_enable = no'
postconf -e 'smtpd_sasl_security_options = noanonymous'
postconf -e 'smtpd_tls_auth_only = yes'
postconf -e 'smtpd_tls_cert_file = /etc/letsencrypt/live/mail.maketh.au/fullchain.pem'
postconf -e 'smtpd_tls_key_file = /etc/letsencrypt/live/mail.maketh.au/privkey.pem'
postconf -e 'smtpd_tls_security_level = may'
postconf -e 'smtpd_tls_protocols = >=TLSv1.2'
postconf -e 'smtpd_tls_mandatory_protocols = >=TLSv1.2'
postconf -e 'smtp_tls_security_level = may'
postconf -e 'smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt'
postconf -e 'smtp_tls_loglevel = 1'
postconf -e 'smtpd_tls_loglevel = 1'
postconf -e 'virtual_mailbox_domains = maketh.au'
postconf -e 'virtual_alias_domains = mail.maketh.au'
postconf -e 'virtual_mailbox_maps = hash:/etc/postfix/vmailbox'
postconf -e 'virtual_alias_maps = hash:/etc/postfix/virtual'
postconf -e 'virtual_transport = lmtp:unix:private/dovecot-lmtp'
postconf -e 'smtpd_sender_login_maps = hash:/etc/postfix/sender_login'
postconf -e 'message_size_limit = 26214400'
postconf -e 'mailbox_size_limit = 0'
postconf -e 'smtpd_client_connection_count_limit = 20'
postconf -e 'smtpd_client_message_rate_limit = 60'
postconf -e 'smtpd_client_recipient_rate_limit = 100'
postconf -e 'authorized_submit_users = root, www'
postconf -e 'milter_default_action = tempfail'
postconf -e 'milter_protocol = 6'
postconf -e 'smtpd_milters = inet:127.0.0.1:11332, inet:127.0.0.1:8891'
postconf -e 'non_smtpd_milters = inet:127.0.0.1:11332, inet:127.0.0.1:8891'
postconf -e 'milter_mail_macros = i {mail_addr} {client_addr} {client_name} {auth_type} {auth_authen}'
printf 'admin@maketh.au maketh.au/admin/\n' > /etc/postfix/vmailbox
# Keep all previously accepted addresses: the old Cloudflare route was catch-all.
# After cutover these messages remain in the new owner mailbox, not discarded.
printf 'postmaster@maketh.au admin@maketh.au\nabuse@maketh.au admin@maketh.au\n@maketh.au admin@maketh.au\nadmin@mail.maketh.au admin@maketh.au\npostmaster@mail.maketh.au admin@maketh.au\n' > /etc/postfix/virtual
printf 'admin@maketh.au admin@maketh.au\n' > /etc/postfix/sender_login
postmap /etc/postfix/vmailbox
postmap /etc/postfix/virtual
postmap /etc/postfix/sender_login
if ! grep -q '^root:.*admin@maketh.au' /etc/aliases; then
  if grep -q '^root:' /etc/aliases; then
    echo 'Existing root alias requires review' >&2
    exit 1
  fi
  printf '\nroot: admin@maketh.au\n' >> /etc/aliases
fi
newaliases
postconf -M 'submission/inet=submission inet n - y - - smtpd'
postconf -M 'smtps/inet=smtps inet n - y - - smtpd'
for service in submission smtps; do
  postconf -P "$service/inet/smtpd_sasl_auth_enable=yes"
  postconf -P "$service/inet/smtpd_tls_security_level=encrypt"
  postconf -P "$service/inet/smtpd_relay_restrictions=permit_sasl_authenticated,reject"
  postconf -P "$service/inet/smtpd_recipient_restrictions=permit_sasl_authenticated,reject"
  postconf -P "$service/inet/smtpd_sender_restrictions=reject_authenticated_sender_login_mismatch"
done
postconf -P 'smtps/inet/smtpd_tls_wrappermode=yes'

install -d -o opendkim -g opendkim -m 700 /etc/opendkim/keys/maketh.au
if ! test -s /etc/opendkim/keys/maketh.au/mail202610.private; then
  opendkim-genkey -b 2048 -d maketh.au -s mail202610 -D /etc/opendkim/keys/maketh.au
fi
chown -R opendkim:opendkim /etc/opendkim/keys
chmod 600 /etc/opendkim/keys/maketh.au/mail202610.private
cat > /etc/opendkim.conf <<'DKIM'
Syslog yes
SyslogSuccess yes
LogWhy yes
UMask 007
Mode sv
Canonicalization relaxed/simple
SubDomains no
OversignHeaders From
UserID opendkim
Socket inet:8891@127.0.0.1
PidFile /run/opendkim/opendkim.pid
TrustAnchorFile /usr/share/dns/root.key
KeyTable /etc/opendkim/key.table
SigningTable refile:/etc/opendkim/signing.table
InternalHosts /etc/opendkim/trusted.hosts
ExternalIgnoreList /etc/opendkim/trusted.hosts
DKIM
printf 'mail202610._domainkey.maketh.au maketh.au:mail202610:/etc/opendkim/keys/maketh.au/mail202610.private\n' > /etc/opendkim/key.table
printf '*@maketh.au mail202610._domainkey.maketh.au\n' > /etc/opendkim/signing.table
printf '127.0.0.1\nlocalhost\n' > /etc/opendkim/trusted.hosts
cat > /etc/rspamd/local.d/worker-proxy.inc <<'RSPAMD'
bind_socket = "127.0.0.1:11332";
milter = yes;
timeout = 120s;
upstream "local" { default = yes; self_scan = yes; }
RSPAMD
cat > /etc/rspamd/local.d/worker-controller.inc <<'RSPAMD'
bind_socket = "127.0.0.1:11334";
RSPAMD
cat > /etc/rspamd/local.d/milter_headers.conf <<'RSPAMD'
extended_spam_headers = true;
RSPAMD
cat > /etc/rspamd/local.d/redis.conf <<'RSPAMD'
servers = "127.0.0.1:6379";
RSPAMD
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/maketh-mail <<'HOOK'
#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/mail.maketh.au ]; then
  postfix check
  doveconf -n >/dev/null
  systemctl reload postfix dovecot
fi
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/maketh-mail
postfix check
doveconf -n >/dev/null
opendkim -n
rspamadm configtest
systemctl enable postfix dovecot opendkim rspamd certbot.timer
systemctl restart opendkim rspamd dovecot postfix
systemctl is-active postfix dovecot opendkim rspamd
echo 'Configured. Credentials are private in /etc/maketh-mail/owner-access.txt.'
echo 'Next: publish DKIM/SPF, test TLS/auth/relay/delivery, then migrate MX.'
