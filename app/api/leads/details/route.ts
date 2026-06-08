import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      leadId?: string;
      responsavel?: string;
      observacao?: string;
    };

    if (!body.leadId?.trim()) {
      return NextResponse.json({ error: 'ID do lead obrigatório.' }, { status: 400 });
    }

    const payload = {
      responsavel_atendimento: body.responsavel?.trim() || null,
      observacao: body.observacao?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('leads_meta')
      .update(payload)
      .eq('id', body.leadId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[api/leads/details] Supabase erro:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, lead: data });
  } catch (error) {
    console.error('[api/leads/details] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
