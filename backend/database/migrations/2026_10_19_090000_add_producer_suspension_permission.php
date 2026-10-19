<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['name' => 'producers.suspend'],
            ['description' => 'producers suspend', 'created_at' => now(), 'updated_at' => now()],
        );

        $permissionId = DB::table('permissions')->where('name', 'producers.suspend')->value('id');
        $roleIds = DB::table('roles')->whereIn('name', ['moderator', 'super_admin'])->pluck('id');
        if ($permissionId) {
            foreach ($roleIds as $roleId) {
                DB::table('role_permissions')->updateOrInsert([
                    'role_id' => $roleId,
                    'permission_id' => $permissionId,
                ]);
            }
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'producers.suspend')->value('id');
        if ($permissionId) {
            DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
    }
};
