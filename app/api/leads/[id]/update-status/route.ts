import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { LeadStatus } from '@/lib/types';

const ALLOWED_STATUSES: LeadStatus[] = [
  'novo',
  'qualificado',
  'nao_qualificado',
  'convertido',
  'perdido',
];

function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === 'string' && ALLOWED_STATUSES.includes(value as LeadStatus);
}

/**
 * Espera-colunas opcionais no Supabase (adicione se ainda não existirem):
 * - observacao text null
 * - atualizado_por_user_id uuid null (ou texto, conforme seu users_faculdades.id)
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await ctx.params;
    if (!leadId?.trim()) {
      return NextResponse.json({ error: 'ID do lead obrigatório' }, { status: 400 });
    }

    const body = await req.json();
    const { status: nextStatus, observacao: obsRaw, userId } = body as {
      status?: unknown;
      observacao?: unknown;
      userId?: unknown;
    };

    if (!isLeadStatus(nextStatus)) {
      return NextResponse.json(
        { error: 'Status inválido', allowed: ALLOWED_STATUSES },
        { status: 400 }
      );
    }

    const observacao =
      typeof obsRaw === 'string' && obsRaw.trim() !== '' ? obsRaw.trim() : undefined;
    const atualizadoPor =
      typeof userId === 'string' && userId.trim() !== '' ? userId.trim() : undefined;

    const updatePayload: Record<string, string> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (observacao !== undefined) {
      updatePayload.observacao = observacao;
    }
    if (atualizadoPor !== undefined) {
      updatePayload.atualizado_por_user_id = atualizadoPor;
    }

    const { data, error } = await supabaseAdmin
      .from('leads_meta')
      .update(updatePayload)
      .eq('id', leadId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[update-status] Supabase erro:', error);
      return NextResponse.json(
        {
          error: error.message,
          hint:
            'Se aparecer erro de coluna ausente (observacao / atualizado_por_user_id), crie-as na tabela leads_meta.',
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, lead: data });
  } catch (e) {
    console.error('[update-status]', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
