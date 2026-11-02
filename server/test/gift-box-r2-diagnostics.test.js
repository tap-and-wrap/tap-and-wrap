import test from 'node:test';
import assert from 'node:assert/strict';
import { safeR2Diagnostic } from '../scripts/lib/gift-box-r2-diagnostics.mjs';

const SECRET = 'DONOTPRINT_SAMPLE_SECRET_FROM_SDK';
test('safe formatter never emits secrets, key strings, raw messages or headers', () => {
  const error = Object.assign(new Error(`Unexpected ${SECRET} signed-url and password`), {
    name: `Dangerous-${SECRET}`, code: `BAD-${SECRET}`,
    $metadata: { requestId: SECRET, httpStatusCode: 400 },
    cause: { code: `BAD-${SECRET}`, message: SECRET },
  });
  const output = safeR2Diagnostic(error, {stage:'PUT_OBJECT',index:1});
  assert.equal(output.includes(SECRET), false);
  assert.match(output,/stage=PUT_OBJECT file=1\/137/);
  assert.match(output,/status=HTTP_400 sdk=OTHER node=NONE/);
});
test('read works and write forbidden diagnoses token or policy', () => {
  assert.match(safeR2Diagnostic({name:'AccessDenied',$metadata:{httpStatusCode:403}},
    {stage:'PUT_OBJECT',index:1}),/WRITE_PERMISSION_OR_POLICY status=HTTP_403/);
});
test('conditional conflict is not mistaken for missing upload permission', () => {
  assert.match(safeR2Diagnostic({name:'PreconditionFailed',$metadata:{httpStatusCode:412}},
    {stage:'PUT_OBJECT',index:2}),/CONDITIONAL_KEY_CONFLICT/);
});
test('absence of HTTP status preserves safe, actionable SDK and network categories', () => {
  assert.match(safeR2Diagnostic(Object.assign(new TypeError('stream lost '+SECRET),{code:'ECONNRESET'}),
    {stage:'PUT_OBJECT',index:1}),/NETWORK_OR_LOCAL_IO status=NO_HTTP_STATUS sdk=TypeError node=ECONNRESET/);
  assert.match(safeR2Diagnostic(new Error('CRC32 checksum missing '+SECRET),
    {stage:'PUT_OBJECT',index:1}),/SDK_CHECKSUM_COMPATIBILITY/);
  assert.match(safeR2Diagnostic(new Error(SECRET),
    {stage:'PUT_OBJECT',index:1}),/UNCLASSIFIED_STORAGE_FAILURE/);
});
test('malformed stages and indices cannot inject secrets', () => {
  const out=safeR2Diagnostic({name:SECRET}, {stage:SECRET,index:9999});
  assert.equal(out.includes(SECRET),false);
  assert.match(out,/stage=INIT file=0\/137/);
});
