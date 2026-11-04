import { writeFile } from 'node:fs/promises'

const script = (listen, code) => ({ listen, script: { type: 'text/javascript', exec: code.trim().split('\n') } })
const schema = `pm.test('JSON con estructura esperada', () => {
  pm.response.to.have.jsonSchema({ type: 'object', required: ['success'], properties: { success: { type: 'boolean' } } });
});`
const expectStatus = (status) => `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));\n${schema}`
const item = (name, method, route, body, tests, authorized = false, prerequest = '') => ({
  name,
  event: [...(prerequest ? [script('prerequest', prerequest)] : []), script('test', tests)],
  request: {
    method,
    header: [...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
      ...(authorized ? [{ key: 'Authorization', value: 'Bearer {{session_token}}' }] : [])],
    url: `{{baseUrl}}${route}`,
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body), options: { raw: { language: 'json' } } } } : {}),
  },
})
const loginBody = { correo: '{{fixture_email}}', contrasena: '{{fixture_password}}' }
const fixture = `
const id = pm.variables.replaceIn('{{$guid}}');
pm.collectionVariables.set('fixture_email', 'gw-lab-' + id + '@example.test');
pm.collectionVariables.set('fixture_password', pm.variables.replaceIn('{{$guid}}'));
pm.collectionVariables.unset('session_token');`
const ddt = `
const scenario = pm.iterationData.get('scenario');
if (!scenario) throw new Error('Selecciona auth-ddt.json como dataset del Runner');
let email = pm.collectionVariables.get('fixture_email');
let password = pm.collectionVariables.get('fixture_password');
if (scenario === 'wrong_password') password += '-incorrecta';
if (scenario === 'unknown_email') email = 'unknown-' + pm.variables.replaceIn('{{$guid}}') + '@example.test';
if (['missing_email', 'missing_both'].includes(scenario)) email = '';
if (['missing_password', 'missing_both'].includes(scenario)) password = '';
pm.variables.set('case_email', email);
pm.variables.set('case_password', password);`
const loginTests = `${expectStatus(200)}
const body = pm.response.json();
pm.test('Sesion y usuario sin hash', () => {
  pm.expect(typeof body.token === 'string' && body.token.length > 0).to.equal(true);
  pm.expect(body.usuario).to.have.property('id_usuario');
  pm.expect(body.usuario).not.to.have.property('contrasena');
});
if (body.success && body.token) pm.collectionVariables.set('session_token', body.token);`
const collection = {
  info: { name: 'Green World - API real y DDT', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Ejecutar con auth-ddt.json. Crea una cuenta sintética por iteración, valida API real y desactiva su propia cuenta con DELETE /usuarios/me. No borra información SQL ni utiliza cuentas existentes.' },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:4000/api' }],
  item: [
    item('01 Crear cuenta controlada', 'POST', '/auth/register', { nombre: 'Prueba', apellido: 'Laboratorio', ...loginBody }, expectStatus(201), false, fixture),
    item('02 Login DDT', 'POST', '/auth/login', { correo: '{{case_email}}', contrasena: '{{case_password}}' }, `
pm.test('HTTP esperado del dataset', () => pm.response.to.have.status(Number(pm.iterationData.get('expectedStatus'))));
${schema}
const positive = Number(pm.iterationData.get('expectedStatus')) === 200;
pm.test('Resultado de autenticacion esperado', () => {
  const body = pm.response.json();
  pm.expect(body.success).to.equal(positive);
  if (positive) pm.expect(typeof body.token === 'string').to.equal(true);
  else pm.expect(body).not.to.have.property('token');
});`, false, ddt),
    item('03 Abrir sesion para operaciones propias', 'POST', '/auth/login', loginBody, loginTests),
    item('04 Consultar cursos reales', 'GET', '/courses', null, `${expectStatus(200)}\npm.test('Lista de cursos', () => pm.expect(pm.response.json().data).to.be.an('array'));`),
    item('05 Consultar inscripciones propias', 'GET', '/usuarios/me/cursos', null, `${expectStatus(200)}\npm.test('Cuenta nueva sin inscripciones', () => pm.expect(pm.response.json().data).to.deep.equal([]));`, true),
    item('06 Actualizar perfil propio', 'PUT', '/usuarios/me', { nombre: 'Prueba DDT', apellido: 'Laboratorio' }, `${expectStatus(200)}\npm.test('Perfil actualizado', () => pm.expect(pm.response.json().data.nombre).to.equal('Prueba DDT'));`, true),
    item('07 Desactivar cuenta propia', 'DELETE', '/usuarios/me', null, `${expectStatus(200)}\npm.test('Cuenta inactiva', () => pm.expect(pm.response.json().data.estado.toLowerCase()).to.equal('inactivo'));`, true),
    item('08 Confirmar bloqueo de cuenta desactivada', 'POST', '/auth/login', loginBody, `${expectStatus(403)}\npm.test('Sin nueva sesion', () => pm.expect(pm.response.json()).not.to.have.property('token'));`),
  ],
}
await writeFile(new URL('./GreenWorld.postman_collection.json', import.meta.url), `${JSON.stringify(collection, null, 2)}\n`)
console.log('Colección Postman generada: 8 solicitudes, 6 escenarios externos.')
