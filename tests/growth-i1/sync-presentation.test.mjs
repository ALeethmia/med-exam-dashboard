import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('A changes only the status renderer; all sync decisions match PR21 main byte for byte',()=>{
 const s=readFileSync(new URL('../../sync.js',import.meta.url),'utf8');
 const start=s.indexOf('  function status(){'),end=s.indexOf('  window.mergeLearningSnapshot=',start);
 assert.equal(createHash('sha256').update(s.slice(0,start)+'  /* presentation */\n'+s.slice(end)).digest('hex'),'56e3c413b19b7af2f11d975c81df262d2ae29e9a94ac4946beaa5014429242f1');
});
