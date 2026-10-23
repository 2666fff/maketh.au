<?php
declare(strict_types=1);
if (!defined('MAKETH_QUOTE_INTERNAL')) { http_response_code(404); exit; }

function quoteNotificationSettings(array $config): array {
    $settings = $config['notifications'] ?? null;
    if (!is_array($settings) || !is_bool($settings['enabled'] ?? null)) throw new RuntimeException('Notification configuration missing');
    if (!$settings['enabled']) return $settings;
    foreach (['from', 'to'] as $key) {
        if (!is_string($settings[$key] ?? null) || !filter_var($settings[$key], FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Invalid notification address');
    }
    if (!is_string($settings['sendmail'] ?? null) || !str_starts_with($settings['sendmail'], '/')) throw new RuntimeException('Absolute sendmail path required');
    return $settings;
}

function quoteNotificationSchema(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS quote_notifications (
        quote_id TEXT PRIMARY KEY REFERENCES quotes(id) ON DELETE CASCADE,
        state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'retrying', 'queued')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        queued_at INTEGER,
        last_error TEXT NOT NULL DEFAULT ''
    )");
}

function quoteNotificationMessage(array $quote, array $settings, string $origin): string {
    $body = "A new enquiry was submitted on maketh.au.\n\n"
        . "Reference: {$quote['id']}\nReceived (UTC): {$quote['created_at']}\n"
        . "Name: {$quote['name']}\nEmail: {$quote['email']}\nPhone: {$quote['phone']}\n"
        . "Business: {$quote['business']}\nPackage: {$quote['package']}\n\n"
        . "Requirements:\n{$quote['message']}\n\n"
        . "Review and update the enquiry: {$origin}/admin/\n"
        . "Reply to this email to contact the customer. This notification is for the website owner only.\n";
    return implode("\r\n", [
        'From: Maketh Website <' . $settings['from'] . '>',
        'To: ' . $settings['to'],
        'Reply-To: ' . $quote['email'],
        'Date: ' . gmdate('D, d M Y H:i:s +0000'),
        'Message-ID: <quote-' . strtolower($quote['id']) . '@maketh.au>',
        'Subject: New Maketh quote ' . $quote['id'] . ' - ' . $quote['package'],
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        chunk_split(base64_encode($body), 76, "\r\n"),
    ]);
}

function submitQuoteNotification(string $message, array $settings): void {
    if (!is_executable($settings['sendmail'])) throw new RuntimeException('Mail transport unavailable');
    $process = proc_open([$settings['sendmail'], '-i', '-f', $settings['from'], '--', $settings['to']], [
        0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
    ], $pipes);
    if (!is_resource($process)) throw new RuntimeException('Mail transport could not start');
    stream_set_blocking($pipes[0], false);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $written = 0;
    $inputOpen = true;
    $deadline = microtime(true) + 10;
    do {
        // Drain pipes, but never log their content: an MTA may echo customer data.
        stream_get_contents($pipes[1]);
        stream_get_contents($pipes[2]);
        if ($inputOpen) {
            $count = fwrite($pipes[0], substr($message, $written, 8192));
            if ($count !== false) $written += $count;
            if ($count === false || $written === strlen($message)) {
                fclose($pipes[0]);
                $inputOpen = false;
            }
        }
        $status = proc_get_status($process);
        if (!$status['running']) break;
        usleep(20000);
    } while (microtime(true) < $deadline);
    if ($inputOpen) fclose($pipes[0]);
    if ($status['running']) proc_terminate($process, 9);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $closed = proc_close($process);
    $code = $status['exitcode'] >= 0 ? $status['exitcode'] : $closed;
    if ($status['running'] || $code !== 0 || $written !== strlen($message)) throw new RuntimeException('Mail transport did not accept message');
}
