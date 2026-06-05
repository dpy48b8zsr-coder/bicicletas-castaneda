import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Faltan variables de entorno');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parsePermissions(perm: any): Record<string, boolean> {
  if (typeof perm === 'object' && perm !== null && !Array.isArray(perm)) return perm;
  if (typeof perm === 'string') {
    try { return JSON.parse(perm); } catch {}
  }
  return {};
}

export async function GET() {
  try {
    const supabaseAdmin = getAdminClient();
    const { data: rolesData, error } = await supabaseAdmin
      .from('user_roles')
      .select('id, rol, permissions');

    if (error) throw error;

    const usuarios = await Promise.all(
      rolesData.map(async (r: any) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(r.id);
        return {
          id: r.id,
          email: userData?.user?.email || 'Sin email',
          rol: r.rol,
          permissions: parsePermissions(r.permissions),
        };
      })
    );

    return NextResponse.json(usuarios);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getAdminClient();
    const { email, password, rol, permissions } = await req.json();

    if (!email || !password || !rol) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) throw authError;

    await supabaseAdmin.from('user_roles').insert({
      id: authData.user.id,
      rol,
      permissions: parsePermissions(permissions),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const supabaseAdmin = getAdminClient();
    const { id, rol, password, permissions } = await req.json();

    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    // Solo actualizar rol y permisos si vienen en la petición
    const updateData: any = {};
    if (rol !== undefined) updateData.rol = rol;
    if (permissions !== undefined) updateData.permissions = parsePermissions(permissions);

    if (Object.keys(updateData).length > 0) {
      await supabaseAdmin.from('user_roles').upsert(updateData, { onConflict: 'id' });
    }

    if (password && password.trim().length > 0) {
      await supabaseAdmin.auth.admin.updateUserById(id, { password: password.trim() });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabaseAdmin = getAdminClient();
    const { id } = await req.json();

    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    await supabaseAdmin.auth.admin.deleteUser(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}