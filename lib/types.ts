export type LeadStatus = 'novo' | 'qualificado' | 'nao_qualificado' | 'convertido' | 'perdido';

export type Faculdade = 'unifael' | 'uninassau';

/** Nove unidades físicas (mapeamento por Ad Account do Meta). */
export type Unidade =
  | 'unifael_curitiba'
  | 'unifael_lapa'
  | 'unifael_florianopolis'
  | 'unifael_porto_alegre'
  | 'uninassau_vilhena'
  | 'uninassau_cacoal'
  | 'uninassau_barreiras'
  | 'uninassau_patos'
  | 'uninassau_campina_grande';

export interface Lead {
  id: string;
  meta_lead_id: string;
  nome: string;
  email?: string;
  telefone: string;
  curso?: string;
  modalidade?: 'EAD' | 'Presencial' | 'Híbrido';
  faculdade: Faculdade;
  /** Pode ser null em leads antigos (pré-unidade). */
  unidade: Unidade | null;
  status: LeadStatus;
  campanha_nome?: string;
  ad_account_id?: string | null;
  /** IDs do anúncio/campanha no Meta (úteis para CAPI / atribuição). */
  meta_ad_id?: string | null;
  meta_campaign_id?: string | null;
  data_submissao: string;
  created_at: string;
  updated_at: string;
  observacao?: string | null;
  atualizado_por_user_id?: string | null;
}

export interface DashboardStats {
  total_leads: number;
  qualificados: number;
  convertidos: number;
  perdidos: number;
  taxa_qualificacao: number;
  taxa_conversao: number;
}

export interface User {
  id: string;
  email: string;
  faculdade: Faculdade;
  /** Contas legacy podem ficar sem unidade até migration. */
  unidade?: Unidade | null;
  nome_completo?: string;
}
