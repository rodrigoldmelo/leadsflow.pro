import crypto from 'crypto';

import type { Lead } from '@/lib/types';

/** Eventos padrão enviados neste projeto. */
export type MetaCapiStandardEvent = 'Lead' | 'Purchase';

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

/**
 * SHA-256 do e-mail em minúsculas e sem espaços nas pontas (recomendação Meta / GDPR).
 */
export function hashEmailSha256(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Normaliza telefone para dígitos (código do país inclusive) e aplica SHA-256.
 * Se após limpar houver poucos dígitos, tenta prefixar `defaultCountryCode` (ex.: 55).
 */
export function hashPhoneSha256(
  phone: string,
  defaultCountryCode: string = '55'
): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 0) {
    throw new Error('Telefone vazio após normalização');
  }
  // Heurística BR: 10–11 dígitos sem DDI → prefixa 55
  if (
    defaultCountryCode &&
    (digits.length === 10 || digits.length === 11) &&
    !digits.startsWith(defaultCountryCode)
  ) {
    digits = `${defaultCountryCode}${digits}`;
  }
  return crypto.createHash('sha256').update(digits, 'utf8').digest('hex');
}

function hashExternalId(value: string): string {
  return crypto.createHash('sha256').update(value.trim(), 'utf8').digest('hex');
}

export type SendConversionResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status?: number; error: string; body?: unknown };

/**
 * Envia um evento para a Meta Conversions API (Pixel / Dataset).
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api
 */
export async function sendConversionEvent(
  lead: Lead,
  eventName: MetaCapiStandardEvent
): Promise<SendConversionResult> {
  const pixelId = requireEnv('META_PIXEL_ID');
  const accessToken = requireEnv('META_ACCESS_TOKEN');

  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = `${lead.id}-${eventName}-${eventTime}`;

  const user_data: Record<string, string[]> = {
    external_id: [hashExternalId(lead.meta_lead_id || lead.id)],
  };

  try {
    if (lead.email?.trim()) {
      user_data.em = [hashEmailSha256(lead.email)];
    }
    if (lead.telefone?.trim() && lead.telefone !== '—') {
      user_data.ph = [hashPhoneSha256(lead.telefone)];
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[meta-capi] Falha ao hashear PII (evento seguirá só com external_id):', msg);
  }

  const custom_data: Record<string, string> = {};
  if (lead.meta_campaign_id) {
    custom_data.campaign_id = String(lead.meta_campaign_id);
  }
  if (lead.meta_ad_id) {
    custom_data.ad_id = String(lead.meta_ad_id);
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: 'system_generated',
        user_data,
        ...(Object.keys(custom_data).length > 0 ? { custom_data } : {}),
      },
    ],
  };

  const testCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testCode) {
    payload.test_event_code = testCode;
    console.log('[meta-capi] Usando test_event_code (ambiente de testes).');
  }

  const url = new URL(`https://graph.facebook.com/v18.0/${encodeURIComponent(pixelId)}/events`);
  url.searchParams.set('access_token', accessToken);

  console.log('[meta-capi] Enviando evento', {
    eventName,
    leadId: lead.id,
    meta_lead_id: lead.meta_lead_id,
    hasEmail: Boolean(lead.email?.trim()),
    hasPhone: Boolean(lead.telefone?.trim() && lead.telefone !== '—'),
    custom_data_keys: Object.keys(custom_data),
  });

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[meta-capi] Erro de rede:', msg);
    return { ok: false, error: `Erro de rede: ${msg}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }

  if (!res.ok) {
    console.error('[meta-capi] Resposta de erro Graph API:', res.status, body);
    return {
      ok: false,
      status: res.status,
      error:
        typeof body === 'object' && body !== null && 'error' in body
          ? JSON.stringify((body as { error: unknown }).error)
          : `HTTP ${res.status}`,
      body,
    };
  }

  console.log('[meta-capi] Evento aceito:', body);
  return { ok: true, status: res.status, body };
}
