<?php
declare(strict_types=1);
ini_set('display_errors', '0');
define('MAKETH_QUOTE_INTERNAL', true);
require __DIR__ . '/quote-notifications.php';

// Runtime secrets and customer data live outside the public document root.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function field(array $data, string $name, int $max, bool $required = true): string {
    if (isset($data[$name]) && !is_string($data[$name])) respond(422, ['error' => 'Please check the form fields.']);
    $value = trim($data[$name] ?? '');
    if (($required && $value === '') || mb_strlen($value) > $max || str_contains($value, "\0")) {
        respond(422, ['error' => 'Please check the ' . $name . ' field.']);
    }
    return $value;
}
function limitRequests(PDO $db, string $bucket, int $limit, int $seconds): void {
    $now = time();
    $db->exec('BEGIN IMMEDIATE');
    try {
        $db->prepare('DELETE FROM request_limits WHERE expires < ?')->execute([$now]);
        $query = $db->prepare('SELECT hits FROM request_limits WHERE bucket = ?');
        $query->execute([$bucket]);
        $hits = (int) $query->fetchColumn();
        if ($hits >= $limit) {
            $db->exec('COMMIT');
            header('Retry-After: ' . $seconds);
            respond(429, ['error' => 'Too many attempts. Please try again later.']);
        }
        $db->prepare('INSERT INTO request_limits(bucket, hits, expires) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1')->execute([$bucket, $now + $seconds]);
        $db->exec('COMMIT');
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
}

try {
    $configPath = getenv('MAKETH_QUOTES_CONFIG') ?: '/etc/maketh-quotes/config.json';
    $config = json_decode(file_get_contents($configPath), true, 16, JSON_THROW_ON_ERROR);
    foreach (['database', 'session_dir', 'owner_username', 'owner_password_hash', 'origin', 'rate_secret'] as $key) {
        if (empty($config[$key]) || !is_string($config[$key])) throw new RuntimeException('Incomplete quote configuration');
    }
    if (empty($config['allowed_origins']) || !is_array($config['allowed_origins'])) throw new RuntimeException('Missing allowed origins');
    $db = new PDO('sqlite:' . $config['database'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout = 5000');
    $notificationSettings = quoteNotificationSettings($config);
    quoteNotificationSchema($db);
    session_save_path($config['session_dir']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '28800');
    session_name('maketh_quotes');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => str_starts_with($config['origin'], 'https://'), 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    if (isset($_SESSION['owner_until']) && $_SESSION['owner_until'] < time()) unset($_SESSION['owner_until']);
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $owner = isset($_SESSION['owner_until']);
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET' && $action === 'session') {
        respond(200, ['csrf' => $_SESSION['csrf'], 'authenticated' => $owner]);
    }
    if ($method !== 'GET') {
        if (!in_array($_SERVER['HTTP_ORIGIN'] ?? '', $config['allowed_origins'], true)) respond(403, ['error' => 'This request must come from the website.']);
        if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) respond(403, ['error' => 'Your session changed. Reload the page and try again.']);
        if (strtolower(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]) !== 'application/json') respond(415, ['error' => 'JSON content required.']);
        $raw = file_get_contents('php://input', false, null, 0, 16385);
        if (strlen($raw) > 16384) respond(413, ['error' => 'The submission is too large.']);
        try { $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
        catch (JsonException) { respond(400, ['error' => 'Invalid request content.']); }
        if (!is_array($data)) respond(400, ['error' => 'Invalid request content.']);
    }
    $ipKey = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '', $config['rate_secret']);

    if ($method === 'POST' && $action === 'login') {
        limitRequests($db, 'login:' . $ipKey, 10, 900);
        $username = field($data, 'username', 80);
        $password = field($data, 'password', 256);
        $correctPassword = password_verify($password, $config['owner_password_hash']);
        if (!hash_equals($config['owner_username'], $username) || !$correctPassword) respond(401, ['error' => 'The username or password is incorrect.']);
        session_regenerate_id(true);
        $_SESSION['owner_until'] = time() + 28800;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(200, ['authenticated' => true, 'csrf' => $_SESSION['csrf']]);
    }
    if ($method === 'POST' && $action === 'logout') {
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(200, ['authenticated' => false, 'csrf' => $_SESSION['csrf']]);
    }
    if ($method === 'POST' && $action === 'create') {
        if (field($data, 'website', 200, false) !== '') respond(422, ['error' => 'Unable to accept this submission.']);
        $name = field($data, 'name', 100);
        $email = field($data, 'email', 254);
        $phone = field($data, 'phone', 60, false);
        $business = field($data, 'business', 160, false);
        $message = field($data, 'message', 5000);
        $package = field($data, 'package', 20);
        $source = field($data, 'source', 30);
        $requestKey = field($data, 'requestKey', 64);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(422, ['error' => 'Please enter a valid email address.']);
        if (!in_array($package, ['199', '299', '888', 'app', 'ai', 'other'], true) || !in_array($source, ['main', 'business-demo'], true)) respond(422, ['error' => 'Please select a valid package.']);
        if (($data['consent'] ?? false) !== true) respond(422, ['error' => 'Please agree to the enquiry privacy notice.']);
        if (!preg_match('/^[a-zA-Z0-9-]{16,64}$/', $requestKey)) respond(422, ['error' => 'Reload the form and try again.']);
        $dedupe = hash_hmac('sha256', session_id() . ':' . $requestKey, $config['rate_secret']);
        $existing = $db->prepare('SELECT id FROM quotes WHERE request_key = ?');
        $existing->execute([$dedupe]);
        if ($id = $existing->fetchColumn()) respond(200, ['reference' => $id, 'saved' => true]);
        limitRequests($db, 'quote:' . $ipKey, 20, 3600);
        $id = strtoupper(bin2hex(random_bytes(6)));
        $db->beginTransaction();
        try {
            $db->prepare('INSERT INTO quotes(id, created_at, updated_at, name, email, phone, business, package, source, message, request_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$id, gmdate('Y-m-d\TH:i:s\Z'), gmdate('Y-m-d\TH:i:s\Z'), $name, $email, $phone, $business, $package, $source, $message, $dedupe]);
            if ($source === 'main' && $notificationSettings['enabled']) {
                $db->prepare('INSERT INTO quote_notifications(quote_id, next_attempt_at) VALUES (?, ?)')->execute([$id, time()]);
            }
            $db->commit();
        } catch (Throwable $error) {
            $db->rollBack();
            throw $error;
        }
        respond(201, ['reference' => $id, 'saved' => true]);
    }
    if (!$owner) respond(401, ['error' => 'Please sign in to view enquiries.']);

    if ($method === 'GET' && $action === 'list') {
        $status = $_GET['status'] ?? 'all';
        $search = trim($_GET['q'] ?? '');
        $page = max(1, min(100000, (int) ($_GET['page'] ?? 1)));
        if (!in_array($status, ['all', 'new', 'contacted', 'closed'], true) || mb_strlen($search) > 100) respond(422, ['error' => 'Invalid search.']);
        $where = 'WHERE (? = \'all\' OR status = ?) AND (? = \'\' OR instr(lower(name || \' \' || email || \' \' || business || \' \' || message || \' \' || id), lower(?)) > 0)';
        $params = [$status, $status, $search, $search];
        $count = $db->prepare('SELECT count(*) FROM quotes ' . $where);
        $count->execute($params);
        $rows = $db->prepare('SELECT id, created_at, updated_at, name, email, phone, business, package, source, message, status, notes, (SELECT state FROM quote_notifications WHERE quote_id = quotes.id) AS notification_status, (SELECT attempts FROM quote_notifications WHERE quote_id = quotes.id) AS notification_attempts FROM quotes ' . $where . ' ORDER BY created_at DESC, rowid DESC LIMIT 25 OFFSET ' . (($page - 1) * 25));
        $rows->execute($params);
        $counts = ['new' => 0, 'contacted' => 0, 'closed' => 0];
        foreach ($db->query('SELECT status, count(*) AS count FROM quotes GROUP BY status') as $row) $counts[$row['status']] = (int) $row['count'];
        respond(200, ['quotes' => $rows->fetchAll(), 'total' => (int) $count->fetchColumn(), 'counts' => $counts, 'page' => $page]);
    }
    if ($method === 'PATCH' && $action === 'update') {
        $id = field($data, 'id', 12);
        $status = field($data, 'status', 20);
        $notes = field($data, 'notes', 2000, false);
        if (!in_array($status, ['new', 'contacted', 'closed'], true)) respond(422, ['error' => 'Invalid enquiry status.']);
        $update = $db->prepare('UPDATE quotes SET status = ?, notes = ?, updated_at = ? WHERE id = ?');
        $update->execute([$status, $notes, gmdate('Y-m-d\TH:i:s\Z'), $id]);
        if (!$update->rowCount()) respond(404, ['error' => 'Enquiry not found.']);
        respond(200, ['saved' => true]);
    }
    respond(404, ['error' => 'Unknown request.']);
} catch (Throwable $error) {
    error_log('Maketh quote API: ' . get_class($error) . ' (' . $error->getCode() . ')');
    respond(503, ['error' => 'The enquiry system is temporarily unavailable. Please try again or email admin@maketh.au.']);
}
