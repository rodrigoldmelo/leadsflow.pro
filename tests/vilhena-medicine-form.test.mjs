import test from 'node:test';
import assert from 'node:assert/strict';
import { getVilhenaMedicineFields, VILHENA_MEDICINE_FORM_ID as formId } from '../lib/vilhena-medicine-form.mjs';

for (const answer of ['Portador de Diploma', 'Nota do Enem', 'Vestibular Agendado']) {
  test(`Medicina: ${answer}`, () => {
    const fields = [{ name: 'Qual forma de ingresso você prefere?', values: [answer] }];
    assert.deepEqual(getVilhenaMedicineFields(formId, fields), { curso: 'MEDICINA', modalidade: answer });
  });
}
test('Aceita o nome da pergunta normalizado pela Meta', () => {
  assert.equal(getVilhenaMedicineFields(formId, [{name: 'qual_forma_de_ingresso_você_prefere?', values: ['NOTA DO ENEM']}]).modalidade, 'Nota do Enem');
});
test('Não modifica outros formulários, inclusive o geral de Vilhena', () => {
  for (const id of ['2019440949014833', 'outro-formulario', undefined]) {
    assert.equal(getVilhenaMedicineFields(id, []), null);
  }
});
test('Não inventa forma de ingresso quando resposta está ausente ou desconhecida', () => {
  for (const fields of [undefined, [], [{name: 'Qual forma de ingresso você prefere?', values: ['Outra']}]] ) {
    assert.deepEqual(getVilhenaMedicineFields(formId, fields), {curso: 'MEDICINA', modalidade: null});
  }
});
test('Resposta Não à ciência do curso não descarta o lead nem muda o ingresso', () => {
  assert.deepEqual(getVilhenaMedicineFields(formId, [
    {name: 'Está ciente que se trata do curso de Medicina?', values: ['Não']},
    {name: 'Qual forma de ingresso você prefere?', values: ['Vestibular Agendado']},
  ]), {curso: 'MEDICINA', modalidade: 'Vestibular Agendado'});
});
