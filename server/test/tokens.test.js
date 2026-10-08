import test from 'node:test';import assert from 'node:assert/strict';
import {makeCsrfToken,validCsrfToken,hashSession,newSessionToken} from '../src/utils/tokens.js';
const SECRET='minimum-32-characters-long-demo-secret';
test('signed CSRF token validates only with correct key and bytes',()=>{const token=makeCsrfToken(SECRET);assert.equal(validCsrfToken(token,SECRET),true);assert.equal(validCsrfToken(token,'wrong'),false);assert.equal(validCsrfToken((token[0] === 'a' ? 'b' : 'a') + token.slice(1),SECRET),false);});
test('session tokens are random; only hashes should be stored',()=>{const a=newSessionToken(),b=newSessionToken();assert.notEqual(a,b);assert.notEqual(a,hashSession(a));assert.equal(hashSession(a).length,64);});
