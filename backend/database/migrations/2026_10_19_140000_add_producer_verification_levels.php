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
            $table->string('verification_level', 32)->default('contact_confirmed')->after('contact_level');
        });

        Schema::create('producer_trust_reviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_level', 32);
            $table->string('to_level', 32);
            $table->text('reason');
            $table->timestamps();
            $table->index(['producer_profile_id', 'created_at']);
        });

        $permissionId = DB::table('permissions')->where('name', 'producers.verify')->value('id');
        if ($permissionId === null) {
            $permissionId = DB::table('permissions')->insertGetId([
                'name' => 'producers.verify',
                'description' => 'producers verify',
            ]);
        }

        $roleIds = DB::table('roles')->whereIn('name', ['admin', 'super_admin'])->pluck('id');
        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'producers.verify')->value('id');
        if ($permissionId !== null) {
            DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }

        Schema::dropIfExists('producer_trust_reviews');
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->dropColumn('verification_level');
        });
    }
};
