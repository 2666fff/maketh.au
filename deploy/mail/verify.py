"""Real SMTP/IMAP checks on the provisioned host; never prints credentials.

Run as root. Optional --external sends one clearly labelled test to the owner's
existing Gmail destination. No mail is sent to invented or third-party addresses.
"""
import argparse
import email
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
import imaplib
from pathlib import Path
import smtplib
import ssl
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--external', action='store_true')
args = parser.parse_args()
password = Path('/etc/maketh-mail/admin-password').read_text().strip()
user = 'admin@maketh.au'
host = 'mail.maketh.au'
context = ssl.create_default_context()
token = 'maketh-mail-check-' + uuid.uuid4().hex[:12]

with smtplib.SMTP_SSL(host, 465, timeout=25, context=context) as smtp:
    try:
        smtp.login(user, 'intentionally-invalid-test-password')
        raise AssertionError('Wrong password accepted')
    except smtplib.SMTPAuthenticationError as exc:
        assert exc.smtp_code == 535, exc.smtp_code
print('PASS invalid SMTP password rejected')

with smtplib.SMTP(host, 587, timeout=25) as smtp:
    smtp.ehlo()
    assert 'auth' not in smtp.esmtp_features, 'AUTH exposed before TLS'
    smtp.starttls(context=context)
    smtp.ehlo()
    smtp.login(user, password)
    smtp.mail('unapproved-sender@maketh.au')
    code, _ = smtp.rcpt(user)
    assert code >= 500, 'Authenticated sender impersonation accepted'
print('PASS STARTTLS authentication and sender ownership')

with smtplib.SMTP(host, 587, timeout=25) as smtp:
    smtp.ehlo()
    smtp.starttls(context=context)
    smtp.ehlo()
    smtp.mail(user)
    code, _ = smtp.rcpt('2666fff@gmail.com')
    assert code >= 500, 'Submission allowed without authentication'
print('PASS unauthenticated submission rejected')

# Use the real public source address, not the trusted loopback network.
with smtplib.SMTP(host, 25, timeout=25, source_address=('139.99.155.60', 0)) as smtp:
    smtp.ehlo('mail.maketh.au')
    smtp.mail(user)
    code, _ = smtp.rcpt('2666fff@gmail.com')
    assert code >= 500, 'Open relay detected'
print('PASS SMTP25 rejects unauthenticated external relay')

message = EmailMessage()
message['From'] = 'Maketh mail verification <admin@maketh.au>'
message['To'] = user
message['Date'] = formatdate(localtime=False)
message['Message-ID'] = make_msgid(domain='maketh.au')
message['Subject'] = token
message.set_content('This is an authorised setup test of the Maketh self-hosted mailbox.\nSMTP authentication, TLS, DKIM signing and IMAP delivery are being verified.\nNo customer data is included.\n')
with smtplib.SMTP_SSL(host, 465, timeout=25, context=context) as smtp:
    smtp.login(user, password)
    assert not smtp.send_message(message)
print('PASS authenticated SMTPS submitted local test: ' + token)

with imaplib.IMAP4_SSL(host, 993, ssl_context=context, timeout=25) as mailbox:
    mailbox.login(user, password)
    mailbox.select('INBOX')
    for attempt in range(20):
        _, result = mailbox.uid('search', None, 'HEADER', 'Message-ID', message['Message-ID'])
        if result[0]:
            break
        time.sleep(1)
        mailbox.noop()
    assert result[0], 'Message not delivered to IMAP inbox'
    _, data = mailbox.uid('fetch', result[0].split()[-1], '(BODY.PEEK[HEADER])')
    headers = email.message_from_bytes(data[0][1])
    signatures = headers.get_all('DKIM-Signature', [])
    assert any('d=maketh.au' in value and 's=mail202610' in value for value in signatures), 'Required DKIM signature missing'
    print('PASS IMAPS read-back and DKIM signature; test retained in inbox')
    mailbox.logout()

if args.external:
    message.replace_header('To', '2666fff@gmail.com')
    message.replace_header('Subject', token + ' external delivery')
    message.replace_header('Message-ID', make_msgid(domain='maketh.au'))
    with smtplib.SMTP_SSL(host, 465, timeout=25, context=context) as smtp:
        smtp.login(user, password)
        assert not smtp.send_message(message)
    print('SUBMITTED external test to owner Gmail; verify remote acceptance and inbox independently: ' + token)
