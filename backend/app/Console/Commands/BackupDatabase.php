<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;
use Throwable;

/**
 * Plain-PHP SQL dump, because mysqldump is not installed on the application server.
 * Old backups are only removed after a new one has been written and verified.
 */
class BackupDatabase extends Command
{
    protected $signature = 'marketplace:backup-db {--path= : Destination folder} {--days=30 : Days to keep each backup}';

    protected $description = 'Write a compressed SQL backup locally and delete backups older than the retention period';

    private const PREFIX = 'mercapro-db-';

    private const END_MARKER = '-- Backup complete';

    private const ROWS_PER_INSERT = 200;

    public function handle(): int
    {
        $directory = rtrim((string) ($this->option('path') ?: storage_path('backups')), '/');
        $days = max(1, (int) $this->option('days'));
        $target = $directory.'/'.self::PREFIX.now()->format('Ymd-His').'.sql.gz';
        $partial = $target.'.part';

        umask(0077);
        if (! is_dir($directory) && ! mkdir($directory, 0700, true) && ! is_dir($directory)) {
            $this->error("No se pudo crear la carpeta {$directory}.");

            return self::FAILURE;
        }

        try {
            $this->dump($partial);
            $this->verify($partial);
            if (! rename($partial, $target)) {
                throw new RuntimeException('No se pudo guardar el respaldo final.');
            }
        } catch (Throwable $exception) {
            @unlink($partial);
            report($exception);
            $this->error('Respaldo fallido: '.$exception->getMessage());

            return self::FAILURE;
        }

        $removed = $this->removeOldBackups($directory, $days);
        $this->info(sprintf('Respaldo listo: %s (%d KB). Eliminados: %d.', $target, (int) ceil(filesize($target) / 1024), $removed));

        return self::SUCCESS;
    }

    private function dump(string $path): void
    {
        $pdo = DB::connection()->getPdo();
        $file = gzopen($path, 'wb6');
        if ($file === false) {
            throw new RuntimeException('No se pudo abrir el archivo de respaldo.');
        }

        try {
            $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');
            $this->write($file, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");

            $tables = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM);
            foreach ($tables as [$table]) {
                $this->dumpTable($pdo, $file, $table);
            }

            $this->write($file, "SET FOREIGN_KEY_CHECKS=1;\n".self::END_MARKER."\n");
            $pdo->exec('COMMIT');
        } finally {
            gzclose($file);
        }
    }

    /** @param resource $file */
    private function dumpTable(PDO $pdo, $file, string $table): void
    {
        $name = '`'.str_replace('`', '``', $table).'`';
        $create = $pdo->query("SHOW CREATE TABLE {$name}")->fetch(PDO::FETCH_NUM)[1];
        $this->write($file, "DROP TABLE IF EXISTS {$name};\n{$create};\n");

        $binary = [];
        $keys = [];
        foreach ($pdo->query("SHOW COLUMNS FROM {$name}")->fetchAll(PDO::FETCH_ASSOC) as $column) {
            if (preg_match('/blob|binary/i', $column['Type'])) {
                $binary[$column['Field']] = true;
            }
            if ($column['Key'] === 'PRI') {
                $keys[] = '`'.$column['Field'].'`';
            }
        }

        $order = $keys === [] ? '' : ' ORDER BY '.implode(', ', $keys);
        for ($offset = 0; ; $offset += self::ROWS_PER_INSERT) {
            $rows = $pdo->query("SELECT * FROM {$name}{$order} LIMIT ".self::ROWS_PER_INSERT." OFFSET {$offset}")->fetchAll(PDO::FETCH_ASSOC);
            if ($rows === []) {
                break;
            }

            $values = array_map(fn (array $row): string => '('.implode(',', array_map(
                fn (string $column, mixed $value): string => match (true) {
                    $value === null => 'NULL',
                    isset($binary[$column]) => $value === '' ? "''" : '0x'.bin2hex($value),
                    default => $pdo->quote((string) $value),
                },
                array_keys($row),
                $row,
            )).')', $rows);
            $this->write($file, "INSERT INTO {$name} VALUES\n".implode(",\n", $values).";\n");
        }

        $this->write($file, "\n");
    }

    /** @param resource $file */
    private function write($file, string $contents): void
    {
        if (gzwrite($file, $contents) === false) {
            throw new RuntimeException('No se pudo escribir el respaldo.');
        }
    }

    private function verify(string $path): void
    {
        $file = gzopen($path, 'rb');
        if ($file === false) {
            throw new RuntimeException('No se pudo reabrir el respaldo.');
        }

        $last = '';
        while (! gzeof($file)) {
            $line = gzgets($file);
            if ($line === false) {
                gzclose($file);
                throw new RuntimeException('El respaldo está dañado.');
            }
            $last = $line;
        }
        gzclose($file);

        if (trim($last) !== self::END_MARKER) {
            throw new RuntimeException('El respaldo quedó incompleto.');
        }
    }

    private function removeOldBackups(string $directory, int $days): int
    {
        $limit = now()->subDays($days)->getTimestamp();
        $removed = 0;
        foreach (glob($directory.'/'.self::PREFIX.'*.sql.gz') ?: [] as $backup) {
            if (filemtime($backup) < $limit && unlink($backup)) {
                $removed++;
            }
        }

        return $removed;
    }
}
