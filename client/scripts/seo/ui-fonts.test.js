import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../public/fonts/ui-v1/',import.meta.url);
test('licensed, versioned UI WOFF2 bytes match the provenance manifest',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.version,'ui-v1');assert.equal(manifest.entries.length,5);
  for(const entry of manifest.entries){const bytes=await readFile(new URL(entry.file,root));assert.equal(bytes.subarray(0,4).toString(),'wOF2');assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
  for(const file of ['Kalam-OFL.txt','Amiri-OFL.txt'])assert.match(await readFile(new URL(file,root),'utf8'),/SIL OPEN FONT LICENSE Version 1.1/);
  const css=await readFile(new URL('../../src/design-system.css',import.meta.url),'utf8');
  assert.match(css,/font-family:Kalam;[^}]*unicode-range:U\+0000-00FF/);
  assert.match(css,/font-family:'TapWrap Arabic';[^}]*unicode-range:U\+0600-06FF/);
  assert.equal((css.match(/font-family:Kalam;/g)||[]).length,3);
  const header=await readFile(new URL('../../public/_headers',import.meta.url),'utf8');assert.match(header,/\/fonts\/ui-v1\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
});
