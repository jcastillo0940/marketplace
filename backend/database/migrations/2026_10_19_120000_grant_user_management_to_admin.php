<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['name' => 'users.manage'],
            ['description' => 'users manage', 'created_at' => now(), 'updated_at' => now()],
        );

        $permissionId = DB::table('permissions')->where('name', 'users.manage')->value('id');
        $adminRoleId = DB::table('roles')->where('name', 'admin')->value('id');
        if ($permissionId && $adminRoleId) {
            DB::table('role_permissions')->updateOrInsert([
                'role_id' => $adminRoleId,
                'permission_id' => $permissionId,
            ]);
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'users.manage')->value('id');
        $adminRoleId = DB::table('roles')->where('name', 'admin')->value('id');
        if ($permissionId && $adminRoleId) {
            DB::table('role_permissions')
                ->where('role_id', $adminRoleId)
                ->where('permission_id', $permissionId)
                ->delete();
        }
    }
};
