<?php

$host = getenv('DB_HOST') ?: 'mysql';
$port = getenv('DB_PORT') ?: '3306';
$database = getenv('DB_DATABASE') ?: 'marketplace';
$username = getenv('DB_USERNAME') ?: 'marketplace';
$password = getenv('DB_PASSWORD') ?: '';
$attempts = 60;

for ($attempt = 1; $attempt <= $attempts; $attempt++) {
    try {
        new PDO(
            "mysql:host={$host};port={$port};dbname={$database}",
            $username,
            $password,
            [PDO::ATTR_TIMEOUT => 3],
        );

        exit(0);
    } catch (Throwable) {
        if ($attempt === $attempts) {
            fwrite(STDERR, "MySQL no aceptó conexiones después de {$attempts} intentos.\n");
            exit(1);
        }

        sleep(2);
    }
}
