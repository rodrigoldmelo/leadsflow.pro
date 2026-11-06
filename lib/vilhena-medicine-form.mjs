// Regra exclusiva do formulário FORMS - MEDICINA da UNINASSAU Vilhena.
export const VILHENA_MEDICINE_FORM_ID = '1854154859270138';

/** @param {string | undefined} value */
function normalize(value) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Não usa a resposta Sim/Não de ciência do curso para excluir interessados.
 * @param {string | null | undefined} formId
 * @param {Array<{name?: string, values?: string[]}> | undefined} fieldData
 * @returns {{curso: 'MEDICINA', modalidade: 'Portador de Diploma' | 'Nota do Enem' | 'Vestibular Agendado' | null} | null}
 */
export function getVilhenaMedicineFields(formId, fieldData) {
  if (formId !== VILHENA_MEDICINE_FORM_ID) return null;

  const question = (fieldData ?? []).find((field) =>
    normalize(field.name) === 'qual_forma_de_ingresso_voce_prefere'
  );
  const answer = normalize(question?.values?.[0]);
  let modalidade = null;
  switch (answer) {
    case 'portador_de_diploma': modalidade = 'Portador de Diploma'; break;
    case 'nota_do_enem': modalidade = 'Nota do Enem'; break;
    case 'vestibular_agendado': modalidade = 'Vestibular Agendado'; break;
  }
  return { curso: 'MEDICINA', modalidade };
}
