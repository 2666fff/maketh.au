# Maketh self-hosted mail and quote notifications

This deployment is specific to the existing Ubuntu 22.04 / panel-managed Nginx
host. It is not a generic mail installer. Review hostnames, paths and existing
mail configuration before running it on another machine. No secrets are stored
in this repository.

## Live architecture

- `mail.maketh.au`: DNS-only A record. SMTP must not use the Cloudflare HTTP proxy.
- Apex MX: priority 10, `mail.maketh.au`.
- Postfix: incoming SMTP 25, authenticated SMTP 465 (TLS) / 587 (STARTTLS).
- Dovecot: IMAP 993 (TLS), local LMTP delivery; plaintext IMAP is disabled.
- Mailbox: `admin@maketh.au`. Postmaster, abuse and the prior catch-all deliver here.
- OpenDKIM: selector `mail202610`, 2048-bit private key stays on the server.
- Rspamd, Redis and recursive Unbound are loopback-only. Unbound uses port 5353
  for mail filtering, without replacing the host's system resolver.
- The outbound EHLO uses the host's existing forward-confirmed PTR name. Client
  TLS uses `mail.maketh.au`, with Let's Encrypt and automated renewal/reload.
- Credentials: `/etc/maketh-mail/owner-access.txt`, root-only. Use IMAP/SMTP in a
  mail client; no webmail application is installed.

## Initial provisioning order (already performed on production)

1. Verify adequate resources, public TCP 25 availability, forward/reverse DNS,
   and the existing website and mail configuration. Do not overwrite another
   mail system or recreate the quote database.
2. Install Ubuntu packages: postfix, dovecot-imapd, dovecot-lmtpd,
   dovecot-sieve, opendkim, opendkim-tools, redis-server, certbot, curl, gnupg
   and dnsutils. Use the distribution's service setup, not downloaded binaries.
3. Publish the DNS-only mail A record. Run `prepare-web.sh` to add the separate
   HTTP ACME vhost without stopping the website. Issue the certificate using
   Certbot webroot `/var/lib/letsencrypt` for `mail.maketh.au`.
4. Run `install-filter.sh`. It uses the official signed Rspamd stable repository
   for Ubuntu jammy and installs Unbound. Ubuntu's older Rspamd 2.7 could not
   parse current Gmail ARC headers; disabling verification is not a fix.
5. Run `configure.sh`. It preserves generated mailbox credentials on reruns and
   keeps initial configuration backups in `/etc/maketh-mail/originals`.
   Keep these rollback backups. Do not publish them or the generated secrets.
6. Publish SPF authorising the sending IPv4, the generated DKIM public key and
   DMARC monitoring policy. Start with `p=none`; tighten only after all legitimate
   sending sources have been verified. Keep one SPF record, not two competing ones.
7. Permit TCP 25, 465, 587 and 993 in the existing server firewall. Do not expose
   Redis, Rspamd, Unbound or LMTP externally.
8. Run `python3 deploy/mail/verify.py` as root: actual authenticated SMTP and IMAP
   readback, bad credentials, sender ownership and open-relay rejection. The
   optional `--external` sends an identified setup message to the owner's Gmail.
9. Verify inbound delivery from an external account before migrating MX. Then
   replace the old provider's MX records and verify actual apex-address delivery.
   Preserve previous route configuration temporarily for cached old MX clients.
10. Run `certbot renew --dry-run` and confirm the renewal timer is enabled.

The Cloudflare website A records remain proxied. The DNS-only mail A necessarily
reveals the origin IP. Old Cloudflare routing rules, its DKIM key and SPF include
were retained during cutover; the only advertised MX is now the self-hosted one.

## Quote notification rollout

The website's own enquiry notifications are separate from the advertised $299
customer package. Only `source=main` creates notifications; the business demo
and $299 dashboard-only scope do not send email.

For an existing deployment, **migrate configuration before updating the API**:

Take a private rollback snapshot first, using the online SQLite backup helper:

```sh
/www/server/php/84/bin/php deploy/mail/snapshot-quotes.php \
  --destination=/etc/maketh-quotes/backups/pre-notifications-YYYYMMDD
```

Use a new directory name. Keep this backup private and retain it after rollout.

1. Copy `scripts/configure-quote-notifications.php` and
   `api/quote-notifications.php` into a private deployment directory, retaining
   that relative directory structure.
2. Run the migration with the production PHP CLI, as root:

   ```sh
   /www/server/php/84/bin/php /private/deployment/scripts/configure-quote-notifications.php \
     --config=/etc/maketh-quotes/config.json --enabled=1 --to=OWNER_EMAIL
   ```

   It preserves the owner credentials and existing enquiries, adds the outbox
   table and atomically updates only the notification settings. Initial setup
   requires an explicit recipient; subsequent runs preserve the recipient and
   sendmail path unless supplied again. The sender remains `admin@maketh.au`.
   Check config
   remains `root:www` 640 and SQLite/runtime files remain owned by `www`.
3. Fast-forward the production `main` checkout. Never reprovision the database.
4. Install the included systemd service/timer:

   ```sh
   install -m 644 deploy/mail/maketh-quote-notifications.service /etc/systemd/system/
   install -m 644 deploy/mail/maketh-quote-notifications.timer /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now maketh-quote-notifications.timer
   ```

5. Submit an identified test enquiry through `/quote/`. Verify the same reference
   in the private dashboard, outbox, Postfix delivery logs and recipient mailbox. Confirm
   the demo has no outbox row. Do not substitute a database insert for this test.
   `python3 deploy/mail/verify-quote.py --reference=REFERENCE --source=main`
   checks the saved record and actual TLS IMAP message, including its content,
   Reply-To and DKIM signature, without printing customer data. Use
   `--source=business-demo` for the dashboard-only demo check. For an external
   recipient, use `--outbox-only` and independently inspect that recipient's
   mailbox for the matching Message-ID, sender, recipient, complete enquiry and
   Reply-To. The outbox-only check explicitly does not establish delivery.

The API saves enquiry and outbox in one transaction. The worker uses a file lock,
submits up to 10 due messages per run, and retries failed submissions with a
30-second-to-one-hour exponential delay. Enquiry data stays saved on mail failure.
Duplicate HTTP submissions reuse the enquiry reference and do not create another
outbox item. Delivery is at-least-once: a process crash after MTA acceptance and
before SQLite acknowledgement can resubmit a message with the same Message-ID.
`queued` means **accepted by the mail server**, not independently confirmed receipt.
Postfix handles subsequent delivery attempts and bounces; inspect its queue too.

Notifications contain the enquiry details and a customer Reply-To address, sent
only to the configured owner address. They do not send an automatic email to the
customer. Production main-site notifications use `admin@maketh.au` as sender and
the owner's explicitly configured Gmail address as recipient. The worker runs
every 30 seconds; backend records are saved immediately, even if delivery retries.
Changing the recipient does not resend previously queued notifications. Any pending
or retrying item uses the recipient configured when it is processed, so inspect
the queue before switching. External delivery may be delayed or classified as spam.

To change the existing recipient, take a private snapshot as above, then run:

```sh
/www/server/php/84/bin/php scripts/configure-quote-notifications.php \
  --config=/etc/maketh-quotes/config.json --enabled=1 --to=OWNER_EMAIL
```

Keep the actual personal recipient in the private runtime configuration, not in Git.
Verify config ownership/mode and unrelated fields are unchanged; keep the rollback
snapshot. Never reset the enquiry database or replay historical enquiries to test.

## Operations and recovery

- Check `systemctl status maketh-quote-notifications.timer` and
  `journalctl -u maketh-quote-notifications.service`. Worker logs contain references,
  not customer messages. Dashboard `pending`/`retrying` entries need attention if
  they persist. `postqueue -p` and `/var/log/mail.log` show MTA delivery problems.
- Check mail service health, storage use, TLS renewal and security updates.
  SMTP authentication is required on submission ports; port 25 is not an open relay.
- Back up `/var/vmail`, `/etc/maketh-mail`, mail configuration, DKIM keys,
  certificate state and quote config. Use SQLite's online backup facility for the
  live quote database. Keep backups encrypted/private and test restoration.
  This change does not create a paid/offsite backup subscription or claim one exists.
- Take a private backup before manual password, DNS, mail or database changes.
  Do not rerun the quote provisioner or delete data to recover a notification error.
- If rolling website code back, disable the notification timer first. The added
  config/table can remain without deleting historical enquiries or notifications.
- Public blocklist checks are point-in-time evidence, not a guarantee of inbox
  delivery. Test DNSBL positive controls and distinguish query errors from listings.
  Gmail accepted the initial external test with SPF/DKIM/DMARC passing but classified
  it as spam. Do not claim paid TLS or authentication alone guarantees inbox placement.

## Sources

- [Ubuntu mail services](https://ubuntu.com/server/docs/install-and-configure-postfix/)
- [Rspamd official installation](https://docs.rspamd.com/downloads/)
- [Google sender requirements](https://support.google.com/mail/answer/81126)
- [Spamhaus DNSBL response interpretation](https://www.spamhaus.org/faqs/dnsbl-usage/)
