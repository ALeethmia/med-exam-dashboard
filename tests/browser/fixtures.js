import {test as base,expect} from '@playwright/test';
// Test data belongs to a verified/synthetic account. Never make the product import legacy keys.
function installFixtureStorage(){
 if(window.fixtureStorage)return;
 window.seedCourseFixture=(records,uid=window.fixtureUID||'test-owner')=>{records.users??={};records.users[uid]??={};records.users[uid].learningV3??={schema:3,generation:'initial-v3',era:0,clock:0,courses:Object.fromEntries(['videos','biochem','physiology','pharmacology'].map(subject=>[subject,structuredClone(records[subject]||{})])),versions:{},firstCompletion:structuredClone(records.questOS?.v1?.courseFirstCompletion||{})};return records.users[uid].learningV3;};
 const raw=window.localStorage;
 const root=()=> 'becoming_uid_v1:'+encodeURIComponent(window.becomingStorage?.read().uid||window.fixtureUID||'local-demo')+':';
 const scoped=key=>/^med_exam_/.test(key)&&key!=='med_exam_theme';
 const full=key=>scoped(String(key))?root()+key:String(key);
 const names=()=>Array.from({length:raw.length},(_,i)=>raw.key(i)).filter(k=>k.startsWith(root())||!k.startsWith('becoming_uid_v1:')&&!scoped(k)).map(k=>k.startsWith(root())?k.slice(root().length):k);
 const methods={getItem:key=>raw.getItem(full(key)),setItem:(key,value)=>raw.setItem(full(key),value),removeItem:key=>raw.removeItem(full(key)),key:i=>names()[i]??null,clear:()=>names().forEach(key=>raw.removeItem(full(key)))};
 window.fixtureStorage=new Proxy(methods,{get(target,key){if(key==='length')return names().length;if(key in target)return target[key];return raw.getItem(full(key));},ownKeys:()=>names(),getOwnPropertyDescriptor:(target,key)=>names().includes(key)?{enumerable:true,configurable:true,value:raw.getItem(full(key))}:undefined});
}
export const test=base.extend({page:async({page},use)=>{
 const add=page.addInitScript.bind(page),prefix='('+installFixtureStorage.toString()+')();';
 await add({content:prefix});
 // Playwright does not guarantee ordering among init scripts. Every seed callback gets its prelude.
 page.addInitScript=(fn,arg)=>typeof fn==='function'?add({content:prefix+'('+fn.toString()+')('+JSON.stringify(arg)+');'}):add(fn,arg);
 await use(page);
}});
export {expect};
