import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('sync UI retains cache caveat, precise failure messages and explicit group choices',()=>{
 const source=readFileSync(new URL('../../sync.js',import.meta.url),'utf8');
 for(const message of ['目前快照可能來自本機快取','本機保存失敗','此選擇會套用整批課程','採用雲端','重新套用本機'])assert(source.includes(message),message);
 assert(source.includes('courseSync.resolve(path,keepLocal)'));
});
