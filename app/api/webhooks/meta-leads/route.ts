import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import type { LeadStatus } from '@/lib/types';
import {
  faculdadeFromUnidade,
  getUnidadeFromAccount,
  normalizeAdAccountId,
} from '@/lib/unidade-mapping';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type FieldDatum = { name?: string; values?: string[] };

type LeadgenGraphResponse = {
  id?: string;
  created_time?: string;
  /** ID da conta de anúncios ligada ao lead (normalmente apenas dígitos). */
  account_id?: string;
  field_data?: FieldDatum[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  form_name?: string;
  error?: { message?: string; type?: string; code?: number };
};

type WebhookChange = {
  field?: string;
  value?: {
    leadgen_id?: string;
    page_id?: string;
    form_id?: string;
    adgroup_id?: string;
    ad_id?: string;
    created_time?: number;
    ad_account_id?: string;
  };
};

type WebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: WebhookChange[];
  }>;
};

function logPrefix() {
  return `[webhook-meta-leads ${new Date().toISOString()}]`;
}

function verifyMetaSignature256(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) {
    console.warn(logPrefix(), 'Assinatura ausente ou formato inválido');
    return false;
  }
  const receivedHex = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  try {
    const a = Buffer.from(receivedHex, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function pickField(fieldData: FieldDatum[] | undefined, keys: string[]): string | undefined {
  if (!fieldData?.length) return undefined;
  const lowerKeys = keys.map((k) => k.toLowerCase());
  for (const row of fieldData) {
    const n = (row.name ?? '').toLowerCase();
    if (!lowerKeys.includes(n)) continue;
    const v = row.values?.[0];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

async function fetchLeadFromGraph(leadgenId: string): Promise<LeadgenGraphResponse> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado');

  const fields = [
    'created_time',
    'id',
    'account_id',
    'field_data',
    'ad_id',
    'ad_name',
    'adset_id',
    'adset_name',
    'campaign_id',
    'campaign_name',
    'form_id',
    'form_name',
  ].join(',');

  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', token);

  console.log(logPrefix(), 'Graph API: buscando leadgen', {
    leadgenId,
    fieldsIncludeAccountId: fields.includes('account_id'),
  });

  const res = await fetch(url.toString(), { method: 'GET' });
  const json = (await res.json()) as LeadgenGraphResponse;

  if (!res.ok || json.error) {
    console.error(logPrefix(), 'Graph API erro', res.status, json.error ?? json);
    throw new Error(json.error?.message ?? `Graph API HTTP ${res.status}`);
  }

  return json;
}

function mapLeadRow(
  leadgenId: string,
  g: LeadgenGraphResponse,
  webhookValue?: WebhookChange['value']
): Record<string, unknown> {
  const fd = g.field_data;

  const nome =
    pickField(fd, ['full_name', 'full name', 'nome', 'name', 'your_name']) ?? '—';
  const telefone =
    pickField(fd, [
      'phone_number',
      'phone number',
      'telefone',
      'mobile',
      'phone',
      'cell_phone',
    ]) ?? '—';
  const email = pickField(fd, ['email', 'e-mail', 'email_address', 'work_email']);

  const campaignName = g.campaign_name ?? undefined;
  const adName = g.ad_name ?? undefined;

  /** Prioriza account_id da Graph API; webhook raramente traz conta explícita. */
  const rawAccountFromWebhook =
    webhookValue?.ad_account_id ?? webhookValue?.adgroup_id ?? null;
  const rawAccountPrimary = g.account_id ?? rawAccountFromWebhook;
  const adAccountNormalized = normalizeAdAccountId(rawAccountPrimary ?? undefined);

  console.log(logPrefix(), 'Ad Account / conta de anúncios', {
    leadgenId,
    graph_account_id_raw: g.account_id ?? null,
    webhook_ad_id: webhookValue?.ad_id ?? null,
    webhook_ad_account_hint: rawAccountFromWebhook ?? null,
    normalized_ad_account_id: adAccountNormalized,
  });

  const unidade = getUnidadeFromAccount(adAccountNormalized, {
    leadgenId,
    campaign_name: campaignName,
    ad_name: adName,
  });

  console.log(logPrefix(), 'Unidade aplicada ao lead:', {
    unidade,
    faculdadeDerivada: faculdadeFromUnidade(unidade),
  });

  const faculdade = faculdadeFromUnidade(unidade);

  const curso = pickField(fd, ['curso', 'course', 'program', 'which_program', 'area']);

  const dataSub =
    g.created_time && !Number.isNaN(Date.parse(g.created_time))
      ? new Date(g.created_time).toISOString()
      : new Date().toISOString();

  const now = new Date().toISOString();
  const status: LeadStatus = 'novo';

  return {
    meta_lead_id: String(leadgenId),
    nome,
    telefone,
    email: email ?? null,
    curso: curso ?? null,
    faculdade,
    unidade,
    status,
    campanha_nome: campaignName ?? adName ?? null,
    meta_ad_id: g.ad_id != null ? String(g.ad_id) : null,
    meta_campaign_id: g.campaign_id != null ? String(g.campaign_id) : null,
    ad_account_id: adAccountNormalized,
    data_submissao: dataSub,
    updated_at: now,
  };
}

/**
 * GET — verificação do webhook (Meta envia hub.mode, hub.verify_token, hub.challenge).
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();

  console.log(logPrefix(), 'GET verificação', {
    mode,
    tokenMatch: Boolean(expected && token === expected),
    hasChallenge: Boolean(challenge),
  });

  if (mode === 'subscribe' && challenge && expected && token === expected) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST — recebe notificações leadgen, valida assinatura, busca lead no Graph e persiste.
 */
export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret) {
    console.error(logPrefix(), 'META_APP_SECRET ausente');
    return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (e) {
    console.error(logPrefix(), 'Falha ao ler body', e);
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const sig = req.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature256(rawBody, sig, appSecret)) {
    console.warn(logPrefix(), 'Assinatura inválida');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch (e) {
    console.error(logPrefix(), 'JSON inválido', e);
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const results: Array<{ leadgen_id: string; ok: boolean; detail?: string }> = [];

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') {
          console.log(logPrefix(), 'Ignorando field', change.field);
          continue;
        }

        console.log(logPrefix(), 'Payload leadgen (value)', change.value ?? null);

        const leadgenId = change.value?.leadgen_id;
        if (!leadgenId) {
          console.warn(logPrefix(), 'leadgen_id ausente em change.value', change.value);
          results.push({ leadgen_id: 'unknown', ok: false, detail: 'missing leadgen_id' });
          continue;
        }

        try {
          const graphLead = await fetchLeadFromGraph(leadgenId);
          const row = mapLeadRow(leadgenId, graphLead, change.value);

          console.log(logPrefix(), 'Upsert leads_meta', {
            meta_lead_id: row.meta_lead_id,
            nome: row.nome,
            faculdade: row.faculdade,
            unidade: row.unidade,
            ad_account_id: row.ad_account_id,
          });

          const { error } = await supabaseAdmin.from('leads_meta').upsert(row, {
            onConflict: 'meta_lead_id',
            ignoreDuplicates: false,
          });

          if (error) {
            console.error(logPrefix(), 'Supabase upsert erro', error);
            results.push({ leadgen_id: leadgenId, ok: false, detail: error.message });
          } else {
            results.push({ leadgen_id: leadgenId, ok: true });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(logPrefix(), 'Erro processando leadgen', leadgenId, msg);
          results.push({ leadgen_id: leadgenId, ok: false, detail: msg });
        }
      }
    }

    const allOk = results.length > 0 && results.every((r) => r.ok);

    console.log(logPrefix(), 'Processamento concluído', { results });

    return NextResponse.json(
      { ok: allOk || results.length === 0, processed: results },
      { status: 200 }
    );
  } catch (e) {
    console.error(logPrefix(), 'Erro não tratado', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
