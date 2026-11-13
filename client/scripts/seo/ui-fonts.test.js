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
  assert.match(css,/--tw-font-ui: 'DM Sans', 'TapWrap Arabic', Arial, sans-serif/);
  assert.match(css,/--tw-font-display: 'Cormorant Garamond', 'TapWrap Arabic', Georgia, serif/);
  assert.match(css,/font-family:'TapWrap Arabic';[^}]*unicode-range:U\+0600-06FF/);
  assert.doesNotMatch(css,/font-family:Kalam;/);
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/kalam-latin/);
  assert.match(html,/rel="stylesheet" href="https:\/\/fonts.googleapis.com\/css2\?family=Cormorant\+Garamond[^"\n]*family=DM\+Sans[^"\n]*display=optional/);
  const header=await readFile(new URL('../../public/_headers',import.meta.url),'utf8');assert.match(header,/\/fonts\/ui-v1\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
});
