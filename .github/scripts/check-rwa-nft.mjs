import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve('rwa-nft');
const read=p=>fs.readFileSync(path.join(root,p));
const manifest=JSON.parse(read('shared/voice/audio-manifest.json'));
const info=JSON.parse(read('deploy-info.json'));
assert.equal(info.framework,'Astro 7');
assert.equal(info.base,'/rwa-nft/');
assert.match(info.sourceCommit,/^[a-f0-9]{40}$/);
assert.equal(manifest.segments.length,172);
for(const lang of ['ru','en'])assert.equal(manifest.segments.filter(s=>s.lang===lang).length,86);
for(const row of manifest.segments){
 const p=path.resolve(root,row.audio);
 assert.ok(p.startsWith(root+path.sep));
 const data=fs.readFileSync(p);
 assert.ok(data.length>1000);
 assert.equal(createHash('sha256').update(data).digest('hex'),manifest.publication.fileHashes[row.audio].sha256);
 assert.ok(row.approved && row.status==='ready');
 assert.match(row.params?.style || '',/professional presentation speaker/);
 assert.doesNotMatch(row.text || '',/на слайде|автор утверждает|без гарантии будущего|not a verified fact|the slide shows/i);
}
for(const name of ['index.html','slides/slide_01_imagine.html','slides/slide_06_system.html','slides/slide_08_finflow.html','slides/school_deck.html']){
 const text=read(name).toString();
 assert.match(text,/<html\b/i);assert.match(text,/<body\b/i);
 assert.match(text,/voice-boot\.js/);
}
for(const name of ['tools','generation','qa','tests','.env'])assert.equal(fs.existsSync(path.join(root,name)),false,name+' must not be public');
console.log(JSON.stringify({ok:true,mp3:manifest.segments.length,framework:info.framework,sourceCommit:info.sourceCommit}));
