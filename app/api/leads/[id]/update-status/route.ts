import { NextRequest, NextResponse } from 'next/server';

import { sendConversionEvent } from '@/lib/meta-conversions';
import type { MetaCapiEvent } from '@/lib/meta-conversions';
import { supabaseAdmin } from '@/lib/supabase';
import type { Lead, LeadStatus } from '@/lib/types';

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

export type MetaConversionResponse =
  | { sent: true; event: MetaCapiEvent; detail: unknown }
  | { sent: false; event: MetaCapiEvent; error: string; detail?: unknown }
  | { skipped: true; reason: string };

function metaEventForStatus(status: LeadStatus): MetaCapiEvent | null {
  const events: Partial<Record<LeadStatus, MetaCapiEvent>> = {
    qualificado: 'Lead',
    convertido: 'Purchase',
    nao_qualificado: 'LeadDisqualified',
    perdido: 'LeadLost',
  };

  return events[status] ?? null;
}

/**
 * Espera-colunas opcionais no Supabase (adicione se ainda não existirem):
 * - observacao text null
 * - atualizado_por_user_id uuid null (ou texto)
 * - meta_ad_id, meta_campaign_id (para CAPI)
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

    console.log('[update-status]', {
      leadId,
      nextStatus,
      hasObservacao: observacao !== undefined,
      hasUsuario: atualizadoPor !== undefined,
    });

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
            'Se aparecer erro de coluna ausente (observacao / atualizado_por_user_id / meta_*), ajuste o schema.',
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
    }

    const leadRow = data as Lead;

    let metaConversion: MetaConversionResponse = {
      skipped: true,
      reason: 'Nenhum envio CAPI para este status.',
    };

    const metaEvent = metaEventForStatus(nextStatus);

    try {
      if (metaEvent) {
        console.log('[update-status] Disparando Meta CAPI', {
          event: metaEvent,
          id: leadRow.id,
          meta_lead_id: leadRow.meta_lead_id,
        });
        const res = await sendConversionEvent(leadRow, metaEvent);
        if (res.ok) {
          metaConversion = { sent: true, event: metaEvent, detail: res.body };
          console.log('[update-status] CAPI OK', res.body);
        } else {
          metaConversion = {
            sent: false,
            event: metaEvent,
            error: res.error,
            detail: res.body,
          };
          console.error('[update-status] CAPI falhou', res.error, res.body);
        }
      }
    } catch (capiErr) {
      const msg = capiErr instanceof Error ? capiErr.message : String(capiErr);
      console.error('[update-status] Exceção ao chamar CAPI:', capiErr);
      metaConversion = metaEvent
        ? { sent: false, event: metaEvent, error: msg }
        : { skipped: true, reason: msg };
    }

    return NextResponse.json({
      success: true,
      lead: data,
      metaConversion,
    });
  } catch (e) {
    console.error('[update-status] Erro não tratado', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
