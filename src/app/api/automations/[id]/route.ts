import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import type { IgAutomation } from '@/types/automation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase belum dikonfigurasi.' },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 });
  }

  let body: { is_active?: unknown };
  try {
    body = (await request.json()) as { is_active?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'Format request JSON tidak valid.' },
      { status: 400 }
    );
  }

  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json(
      { error: 'Field is_active harus berupa boolean.' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ig_automations')
      .update({ is_active: body.is_active })
      .eq('id', id)
      .select('*')
      .single<IgAutomation>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ automation: data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Gagal memperbarui status.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase belum dikonfigurasi.' },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('ig_automations')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Gagal menghapus automation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
