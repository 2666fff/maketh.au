<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('MAKETH_QUOTE_INTERNAL', true);
require __DIR__ . '/../api/quote-notifications.php';
umask(0077);
try {
    $config = json_decode(file_get_contents(getenv('MAKETH_QUOTES_CONFIG') ?: '/etc/maketh-quotes/config.json'), true, 16, JSON_THROW_ON_ERROR);
    $settings = quoteNotificationSettings($config);
    if (!$settings['enabled']) { echo "Notifications explicitly disabled.\n"; exit; }
    $lock = fopen($config['database'] . '.notifications.lock', 'c');
    if (!$lock) throw new RuntimeException('Cannot open worker lock');
    if (!flock($lock, LOCK_EX | LOCK_NB)) { echo "Another notification worker is running.\n"; exit; }
    $db = new PDO('sqlite:' . $config['database'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout = 5000');
    quoteNotificationSchema($db);
    $query = $db->prepare("SELECT q.*, n.attempts FROM quote_notifications n JOIN quotes q ON q.id = n.quote_id WHERE n.state != 'queued' AND n.next_attempt_at <= ? ORDER BY n.next_attempt_at LIMIT 10");
    $query->execute([time()]);
    $failed = false;
    foreach ($query->fetchAll() as $quote) {
        try {
            if ($quote['source'] !== 'main') throw new RuntimeException('Unexpected notification source');
            submitQuoteNotification(quoteNotificationMessage($quote, $settings, $config['origin']), $settings);
            $db->prepare("UPDATE quote_notifications SET state = 'queued', attempts = attempts + 1, queued_at = ?, last_error = '' WHERE quote_id = ?")->execute([time(), $quote['id']]);
            echo 'Mail server accepted quote ' . $quote['id'] . ".\n";
        } catch (Throwable $error) {
            $failed = true;
            $delay = min(3600, 30 * (2 ** min(7, (int) $quote['attempts'])));
            $db->prepare("UPDATE quote_notifications SET state = 'retrying', attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE quote_id = ?")
                ->execute([time() + $delay, 'Mail submission failed; automatic retry scheduled.', $quote['id']]);
            fwrite(STDERR, 'Notification retry scheduled for quote ' . $quote['id'] . "\n");
        }
    }
    exit($failed ? 1 : 0);
} catch (Throwable $error) {
    fwrite(STDERR, 'Notification worker failed: ' . get_class($error) . "\n");
    exit(1);
}
