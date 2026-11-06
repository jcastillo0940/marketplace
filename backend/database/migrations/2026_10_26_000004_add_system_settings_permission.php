<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['name' => 'system.settings'],
            ['description' => 'Manage system settings (SMTP, etc.)', 'created_at' => now(), 'updated_at' => now()],
        );

        $permissionId = DB::table('permissions')->where('name', 'system.settings')->value('id');
        $adminRoleId  = DB::table('roles')->where('name', 'admin')->value('id');

        if ($permissionId && $adminRoleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $adminRoleId, 'permission_id' => $permissionId],
                ['role_id' => $adminRoleId, 'permission_id' => $permissionId],
            );
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'system.settings')->value('id');
        if ($permissionId) {
            DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
    }
};
