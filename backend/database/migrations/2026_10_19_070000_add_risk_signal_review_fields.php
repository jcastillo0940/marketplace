<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('risk_signals')) {
            return;
        }

        Schema::table('risk_signals', function (Blueprint $table): void {
            if (! Schema::hasColumn('risk_signals', 'assignee_id')) {
                $table->foreignId('assignee_id')->nullable()->after('status')->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('risk_signals', 'reviewed_by')) {
                $table->foreignId('reviewed_by')->nullable()->after('assignee_id')->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('risk_signals', 'resolution_note')) {
                $table->text('resolution_note')->nullable()->after('reviewed_by');
            }
            if (! Schema::hasColumn('risk_signals', 'reviewed_at')) {
                $table->timestamp('reviewed_at')->nullable()->after('resolution_note');
            }
            if (! Schema::hasColumn('risk_signals', 'closed_at')) {
                $table->timestamp('closed_at')->nullable()->after('reviewed_at');
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('risk_signals')) {
            Schema::table('risk_signals', function (Blueprint $table): void {
                if (Schema::hasColumn('risk_signals', 'assignee_id')) {
                    $table->dropForeign(['assignee_id']);
                }
                if (Schema::hasColumn('risk_signals', 'reviewed_by')) {
                    $table->dropForeign(['reviewed_by']);
                }
                $columns = array_values(array_filter(
                    ['assignee_id', 'reviewed_by', 'resolution_note', 'reviewed_at', 'closed_at'],
                    fn (string $column): bool => Schema::hasColumn('risk_signals', $column),
                ));
                if ($columns !== []) {
                    $table->dropColumn($columns);
                }
            });
        }
    }
};
