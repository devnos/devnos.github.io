import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve('rwa-nft');
const read=p=>fs.readFileSync(path.join(root,p));
const manifest=JSON.parse(read('shared/voice/audio-manifest.json'));
const extra=JSON.parse(read('shared/voice/onboarding-audio.json'));
const info=JSON.parse(read('deploy-info.json'));
assert.equal(info.framework,'Astro 7');
assert.equal(info.base,'/rwa-nft/');
assert.match(info.sourceCommit,/^[a-f0-9]{40}$/);
assert.equal(manifest.segments.length,172);
assert.equal(extra.schemaVersion,1);
assert.deepEqual(extra.records.map(r=>r.id).sort(),['onboarding.voice-intro','s01.imagine.dynamic','s14.choose.activate']);
const claimed=new Set(manifest.segments.map(r=>r.audio));
for(const record of extra.records){
 assert.deepEqual(Object.keys(record.assets).sort(),['en','ru']);
 for(const lang of ['ru','en']){
  const a=record.assets[lang];
  assert.match(a.path,new RegExp('^audio/onboarding/'+lang+'/[a-z-]+\\.mp3$'));
  assert.ok(!claimed.has(a.path));claimed.add(a.path);
  const p=path.resolve(root,a.path);assert.ok(p.startsWith(root+path.sep));
  const bytes=fs.readFileSync(p);assert.ok(bytes.length>1000);
  assert.match(a.sha256,/^[a-f0-9]{64}$/);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);
  assert.ok(a.approved&&a.status==='ready'&&Number.isInteger(a.durationMs)&&a.durationMs>0);
  assert.equal(a.voice,'Charon');assert.match(a.params?.style||'',/professional presentation speaker/);
  assert.ok(record.display[lang]&&record.tts[lang]);
 }
}
function allMp3(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?allMp3(p):(e.name.endsWith('.mp3')?[path.relative(root,p).split(path.sep).join('/')]:[]);});}
assert.deepEqual(allMp3(path.join(root,'audio')).sort(),[...claimed].sort());
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
assert.match(read('slides/slide_14_choose_nft.html').toString(),/>Активировать свой первый NFT<\/button>/);
console.log(JSON.stringify({ok:true,mp3:claimed.size,legacy:manifest.segments.length,additional:extra.records.length*2,framework:info.framework,sourceCommit:info.sourceCommit}));
