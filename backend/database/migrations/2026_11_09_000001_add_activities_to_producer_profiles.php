<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->string('activity', 500)->nullable()->change();
            $table->json('activities')->nullable()->after('activity');
        });

        $categories = DB::table('categories')->get(['id', 'name', 'parent_id'])->keyBy('id');
        foreach (DB::table('producer_profiles')->whereNotNull('activity')->get(['id', 'activity']) as $profile) {
            $category = $categories->firstWhere('name', $profile->activity);
            while ($category && $category->parent_id !== null) {
                $category = $categories->get($category->parent_id);
            }
            if ($category) {
                DB::table('producer_profiles')->where('id', $profile->id)->update([
                    'activity' => $category->name,
                    'activities' => json_encode([$category->name], JSON_UNESCAPED_UNICODE),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->dropColumn('activities');
        });
    }
};
