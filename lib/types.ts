export type LeadStatus = 'novo' | 'qualificado' | 'nao_qualificado' | 'convertido' | 'perdido';

export interface Lead {
  id: string;
  meta_lead_id: string;
  nome: string;
  email?: string;
  telefone: string;
  curso?: string;
  modalidade?: 'EAD' | 'Presencial' | 'Híbrido';
  faculdade: 'unifael' | 'uninassau';
  status: LeadStatus;
  campanha_nome?: string;
  data_submissao: string;
  created_at: string;
  updated_at: string;
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
  faculdade: 'unifael' | 'uninassau';
  nome_completo?: string;
}
