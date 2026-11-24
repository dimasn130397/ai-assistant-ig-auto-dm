import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import type { CreateAutomationInput, IgAutomation } from '@/types/automation';

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      automations: [] as IgAutomation[],
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ig_automations')
      .select('*')
      .order('created_at', { ascending: false })
      .returns<IgAutomation[]>();

    if (error) {
      return NextResponse.json(
        { error: error.message, configured: true },
        { status: 500 }
      );
    }

    return NextResponse.json({
      configured: true,
      automations: data ?? [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Gagal memuat daftar automation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          'Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.',
      },
      { status: 503 }
    );
  }

  let body: Partial<CreateAutomationInput>;
  try {
    body = (await request.json()) as Partial<CreateAutomationInput>;
  } catch {
    return NextResponse.json(
      { error: 'Format request JSON tidak valid.' },
      { status: 400 }
    );
  }

  const keyword = body.keyword?.trim() ?? '';
  const target_url = body.target_url?.trim() ?? '';
  const comment_reply = body.comment_reply?.trim() ?? '';
  const gate_message = body.gate_message?.trim() ?? '';
  const success_message = body.success_message?.trim() ?? '';

  if (
    !keyword ||
    !target_url ||
    !comment_reply ||
    !gate_message ||
    !success_message
  ) {
    return NextResponse.json(
      { error: 'Semua field wajib diisi.' },
      { status: 400 }
    );
  }

  if (!isValidHttpUrl(target_url)) {
    return NextResponse.json(
      { error: 'Target URL harus diawali http:// atau https://.' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ig_automations')
      .insert({
        keyword,
        target_url,
        comment_reply,
        gate_message,
        success_message,
      })
      .select('*')
      .single<IgAutomation>();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Keyword "${keyword}" sudah terdaftar.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ automation: data }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Gagal menyimpan automation baru.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
