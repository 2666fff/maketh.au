<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('MAKETH_QUOTE_INTERNAL', true);
require __DIR__ . '/../api/quote-notifications.php';
$options = getopt('', ['config:', 'enabled:', 'sendmail:']);
if (!isset($options['config'], $options['enabled']) || !in_array($options['enabled'], ['0', '1'], true)) throw new RuntimeException('Use --config=PATH --enabled=0|1');
$path = realpath($options['config']);
if (!$path || is_link($options['config'])) throw new RuntimeException('Existing regular config required');
$config = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
$config['notifications'] = ['enabled' => $options['enabled'] === '1', 'from' => 'admin@maketh.au', 'to' => 'admin@maketh.au', 'sendmail' => $options['sendmail'] ?? '/usr/sbin/sendmail'];
quoteNotificationSettings($config);
$db = new PDO('sqlite:' . $config['database'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('PRAGMA busy_timeout = 5000');
quoteNotificationSchema($db);
$stat = stat($path);
umask(0077);
$temporary = $path . '.notification-update-' . bin2hex(random_bytes(6));
if (file_put_contents($temporary, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) === false) throw new RuntimeException('Cannot write config');
chmod($temporary, $stat['mode'] & 0777);
if (PHP_OS_FAMILY !== 'Windows') { chown($temporary, $stat['uid']); chgrp($temporary, $stat['gid']); }
if (!rename($temporary, $path)) throw new RuntimeException('Cannot replace config atomically');
echo "Notification schema and explicit configuration updated; existing enquiries and credentials retained.\n";
