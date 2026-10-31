// Safe, finite diagnostics for R2 publishing. Never echo exception messages,
// stack traces, HTTP bodies, request headers, credentials or object contents.
const AWS_NAMES = new Set([
  'AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch',
  'InvalidArgument', 'InvalidRequest', 'NotImplemented', 'PreconditionFailed',
  'ConditionalRequestConflict', 'NoSuchBucket', 'NoSuchKey',
  'RequestTimeout', 'Throttling', 'SlowDown', 'Error', 'TypeError',
  'TimeoutError', 'AbortError', 'CredentialsProviderError',
  'NetworkingError', 'InternalError', 'ServiceUnavailable',
]);
const NODE_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
  'EPIPE', 'EPROTO', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED',
  'ERR_STREAM_PREMATURE_CLOSE', 'ERR_HTTP_INVALID_HEADER_VALUE',
  'ERR_INVALID_ARG_TYPE', 'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
]);
const INTERNAL_ERRORS = new Set([
  'R2_CONFIGURATION_INCOMPLETE', 'R2_UPLOAD_NOT_VERIFIABLE',
  'R2_EXISTING_OBJECT_CONFLICT', 'R2_WRITE_RECOVERY_FAILED',
]);
const STAGES = new Set([
  'INIT', 'LOCAL_VERIFY', 'R2_CONFIG', 'SDK_IMPORT', 'SDK_CLIENT',
  'SCAN_HEAD', 'PUT_OBJECT', 'PUT_RECOVERY_HEAD', 'POST_PUT_HEAD',
]);
const str = v => typeof v === 'string' ? v : '';

export function safeR2Diagnostic(error, {stage = 'INIT', index = 0, total = 137} = {}) {
  const numeric = error?.$metadata?.httpStatusCode;
  const http = Number.isInteger(numeric) && numeric >= 100 && numeric <= 599
    ? `HTTP_${numeric}` : 'NO_HTTP_STATUS';
  const name = str(error?.name);
  const code = str(error?.code);
  const causeCode = str(error?.cause?.code);
  const message = str(error?.message); // used ONLY to match fixed categories; never output
  let category = 'UNCLASSIFIED_STORAGE_FAILURE';
  if (INTERNAL_ERRORS.has(message.split(':')[0])) category = message.split(':')[0];
  else if (http === 'HTTP_403' || name === 'AccessDenied') category = 'WRITE_PERMISSION_OR_POLICY';
  else if (http === 'HTTP_401' || name === 'SignatureDoesNotMatch' || name === 'InvalidAccessKeyId') category = 'AUTHENTICATION';
  else if (http === 'HTTP_412' || name === 'PreconditionFailed') category = 'CONDITIONAL_KEY_CONFLICT';
  else if (http !== 'NO_HTTP_STATUS') category = 'REMOTE_S3_RESPONSE';
  else if (NODE_CODES.has(code) || NODE_CODES.has(causeCode)) category = 'NETWORK_OR_LOCAL_IO';
  else if (/(?:checksum|crc32|trailer)/i.test(message)) category = 'SDK_CHECKSUM_COMPATIBILITY';
  else if (/(?:stream|chunk|body length|content.length)/i.test(message)) category = 'SDK_REQUEST_BODY';
  else if (/(?:certificat|tls|ssl)/i.test(message)) category = 'TLS_FAILURE';
  else if (name === 'AbortError' || name === 'TimeoutError') category = 'REQUEST_TIMEOUT_OR_ABORT';
  const safeName = AWS_NAMES.has(name) ? name : 'OTHER';
  const safeCode = NODE_CODES.has(code) ? code : (NODE_CODES.has(causeCode) ? causeCode : 'NONE');
  const step = STAGES.has(stage) ? stage : 'INIT';
  const n = Number.isInteger(index) && index >= 0 && index <= 137 ? index : 0;
  const t = total === 137 ? 137 : 137;
  return `stage=${step} file=${n}/${t} category=${category} status=${http} sdk=${safeName} node=${safeCode}`;
}
