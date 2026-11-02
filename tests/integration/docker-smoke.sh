#!/usr/bin/env bash
set -euo pipefail
mkdir -p reports
sql_password="Gw1!$(openssl rand -hex 20)"
jwt_secret="$(openssl rand -hex 32)"
echo "::add-mask::$sql_password"
echo "::add-mask::$jwt_secret"
cleanup() {
  local redaction_status=0
  docker logs gw-ci-api > reports/docker-api.log 2>&1 || true
  docker logs gw-ci-sql > reports/docker-sql.log 2>&1 || true
  GW_CI_SQL_SECRET="$sql_password" GW_CI_JWT_SECRET="$jwt_secret" \
    node tests/integration/redact-logs.mjs reports/docker-api.log reports/docker-sql.log || redaction_status=$?
  docker rm -f gw-ci-api gw-ci-sql >/dev/null 2>&1 || true
  docker network rm gw-ci-network >/dev/null 2>&1 || true
  if [[ "$redaction_status" -ne 0 ]]; then
    rm -f reports/docker-api.log reports/docker-sql.log
    exit "$redaction_status"
  fi
}
trap cleanup EXIT
docker network create gw-ci-network >/dev/null
docker run -d --name gw-ci-sql --network gw-ci-network \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD="$sql_password" \
  mcr.microsoft.com/mssql/server:2022-latest >/dev/null
ready=false
for attempt in $(seq 1 60); do
  if docker exec -e SQLCMDPASSWORD="$sql_password" gw-ci-sql \
    /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -Q 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo 'SQL Server efímero no estuvo listo en 120 segundos'
  exit 1
fi
docker cp tests/integration/sql/smoke.sql gw-ci-sql:/tmp/greenworld-smoke.sql
docker exec -e SQLCMDPASSWORD="$sql_password" gw-ci-sql \
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -i /tmp/greenworld-smoke.sql
docker run -d --name gw-ci-api --network gw-ci-network \
  -p 127.0.0.1:4000:4000 -e PORT=4000 -e SERVER=gw-ci-sql \
  -e DATABASE=GreenWorldCI -e USER=sa -e PASSWORD="$sql_password" \
  -e JWT_SECRET="$jwt_secret" greenworld-backend:ci >/dev/null
api_ready=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:4000/api/courses \
    -o reports/docker-api-courses.json 2>/dev/null; then
    api_ready=true
    break
  fi
  sleep 2
done
if [[ "$api_ready" != true ]]; then
  echo 'La API del contenedor no respondió correctamente'
  exit 1
fi
node --input-type=module <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const body=JSON.parse(fs.readFileSync('reports/docker-api-courses.json','utf8'));
assert.equal(body.success,true);
assert.equal(body.data.length,1);
assert.equal(body.data[0].titulo,'Curso de prueba CI');
fs.writeFileSync('reports/docker-smoke-result.json',JSON.stringify({
  resultado:'Pasa',http:200,endpoint:'/api/courses',
  sql:'SQL Server 2022 efímero; lectura real de dbo.cursos mediante usp_ListarCursos',
  alcance:'Prueba de conexión y lectura; no representa regresión integral del producto'
},null,2));
console.log('Docker: API HTTP 200 y lectura SQL real verificadas');
NODE
test "$(docker exec gw-ci-api id -u)" != '0'
echo 'Docker: contenedor ejecutado como usuario no root'
