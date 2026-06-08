import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const unidade = req.nextUrl.searchParams.get('unidade');
    if (!unidade) {
      return NextResponse.json({ error: 'Unidade obrigatória.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('lead_atendentes')
      .select('id,nome')
      .eq('unidade', unidade)
      .order('nome', { ascending: true });

    if (error) {
      console.error('[api/atendentes] Supabase erro:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ atendentes: data || [] });
  } catch (error) {
    console.error('[api/atendentes] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { unidade?: string; nome?: string };
    const unidade = body.unidade?.trim();
    const nome = body.nome?.trim();

    if (!unidade || !nome) {
      return NextResponse.json(
        { error: 'Unidade e nome são obrigatórios.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('lead_atendentes')
      .upsert({ unidade, nome }, { onConflict: 'unidade,nome' })
      .select('id,nome')
      .maybeSingle();

    if (error) {
      console.error('[api/atendentes] Supabase erro:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, atendente: data });
  } catch (error) {
    console.error('[api/atendentes] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
