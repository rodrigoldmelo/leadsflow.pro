import type { Faculdade, Unidade } from '@/lib/types';

/** Fallback quando não houver conta mapeada (exige log de alerta no chamador). */
export const FALLBACK_UNIDADE: Unidade = 'unifael_curitiba';

/**
 * IDs de Ad Account Meta (somente dígitos; pode vir com prefixo act_ na API).
 * Múltiplas contas podem apontar para a mesma unidade física.
 */
export const ACCOUNT_TO_UNIDADE: Record<string, Unidade> = {
  // UNIFAEL CURITIBA
  '4218985438337966': 'unifael_curitiba',
  '766843484598389': 'unifael_curitiba',

  // UNIFAEL LAPA
  '2728245197370427': 'unifael_lapa',
  '355726933640549': 'unifael_lapa',

  // UNIFAEL FLORIANÓPOLIS
  '1454012942573103': 'unifael_florianopolis',
  '2598162083676218': 'unifael_florianopolis',

  // UNIFAEL PORTO ALEGRE
  '768423492733912': 'unifael_porto_alegre',
  '1767837766898401': 'unifael_porto_alegre',

  // UNINASSAU
  '721165152389246': 'uninassau_vilhena',
  '3028903027343475': 'uninassau_cacoal',
  '207224937995313': 'uninassau_barreiras',
  '5434306676675337': 'uninassau_patos',
  '266116647806266': 'uninassau_campina_grande',
};

export function normalizeAdAccountId(
  raw: string | null | undefined
): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith('act_')) {
    s = s.slice(4).trim();
  }
  const digitsOnly = /^\d+$/.test(s);
  if (!digitsOnly) {
    // tenta extrair sequência numérica inicial
    const m = s.match(/\d+/);
    return m?.[0] ?? null;
  }
  return s;
}

/** Unidade pela conta de anúncios; faz log e usa fallback configurado se não encontrar. */
export function getUnidadeFromAccount(
  adAccountIdRaw: string | null | undefined,
  logCtx?: Record<string, unknown>
): Unidade {
  const id = normalizeAdAccountId(adAccountIdRaw ?? undefined);

  if (!id) {
    console.error('[unidade-mapping] ad_account_id vazio ou inválido; usando fallback', {
      FALLBACK_UNIDADE,
      raw: adAccountIdRaw,
      ...logCtx,
    });
    return FALLBACK_UNIDADE;
  }

  const unidade = ACCOUNT_TO_UNIDADE[id];

  if (!unidade) {
    console.error(
      '[unidade-mapping] ⚠️ ad_account_id fora do mapeamento; usando fallback:',
      FALLBACK_UNIDADE,
      { normalizedId: id, ...logCtx }
    );
    return FALLBACK_UNIDADE;
  }

  console.log('[unidade-mapping] Unidade detectada:', {
    normalizedAdAccountId: id,
    unidade,
    ...logCtx,
  });

  return unidade;
}

export function faculdadeFromUnidade(unidade: Unidade): Faculdade {
  return unidade.startsWith('unifael') ? 'unifael' : 'uninassau';
}

export function labelUnidade(u: string | undefined | null): string {
  if (!u) return '—';
  return u.replace(/_/g, ' ');
}
