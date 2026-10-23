"""Read-only verification of a real browser-submitted quote and owner notification.

Run as root with --reference=REFERENCE --source=main|business-demo. Prints no
credentials or customer content. The quote and test email are retained.
"""
import argparse
import email
from email import policy
import imaplib
import json
from pathlib import Path
import re
import sqlite3
import ssl
import time

parser = argparse.ArgumentParser()
parser.add_argument('--reference', required=True)
parser.add_argument('--source', choices=['main', 'business-demo'], required=True)
args = parser.parse_args()
assert re.fullmatch(r'[A-Z0-9-]+', args.reference), 'Invalid reference'
config = json.loads(Path('/etc/maketh-quotes/config.json').read_text())
connection = sqlite3.connect('file:' + config['database'] + '?mode=ro', uri=True)
connection.row_factory = sqlite3.Row
quote = connection.execute('SELECT * FROM quotes WHERE id=?', (args.reference,)).fetchone()
assert quote and quote['source'] == args.source, 'Saved quote/source mismatch'
assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('PASS persisted quote and database integrity: ' + args.reference)
notification = connection.execute('SELECT * FROM quote_notifications WHERE quote_id=?', (args.reference,)).fetchone()
if args.source == 'business-demo':
    assert notification is None, 'Demo unexpectedly queued email'
    print('PASS business demo remains dashboard-only, no notification queued')
    raise SystemExit(0)
assert notification and notification['state'] == 'queued', 'MTA acceptance not recorded'
assert notification['attempts'] >= 1 and notification['queued_at']
print('PASS outbox accepted by MTA; attempts=' + str(notification['attempts']))
message_id = '<quote-' + args.reference.lower() + '@maketh.au>'
password = Path('/etc/maketh-mail/admin-password').read_text().strip()
with imaplib.IMAP4_SSL('mail.maketh.au', 993, ssl_context=ssl.create_default_context(), timeout=20) as mailbox:
    mailbox.login('admin@maketh.au', password)
    mailbox.select('INBOX', readonly=True)
    for attempt in range(20):
        status, results = mailbox.uid('search', None, 'HEADER', 'Message-ID', message_id)
        assert status == 'OK'
        if results[0]:
            break
        time.sleep(1)
        mailbox.noop()
    assert results[0], 'Notification missing from actual IMAP inbox'
    uid = results[0].split()[-1]
    status, data = mailbox.uid('fetch', uid, '(BODY.PEEK[])')
    assert status == 'OK'
    message = email.message_from_bytes(data[0][1], policy=policy.default)
    assert str(message['Reply-To']) == quote['email'], 'Customer reply address mismatch'
    assert str(message['To']) == 'admin@maketh.au'
    body = message.get_content()
    for field in ['id', 'created_at', 'name', 'email', 'phone', 'business', 'package', 'message']:
        assert quote[field].replace('\r\n', '\n') in body.replace('\r\n', '\n'), 'Notification data mismatch: ' + field
    assert 'https://maketh.au/admin/' in body
    assert any('d=maketh.au' in signature for signature in message.get_all('DKIM-Signature', [])), 'Missing DKIM signature'
    print('PASS real TLS IMAP inbox delivery, complete content, Reply-To and DKIM; UID=' + uid.decode())
