// B2-A prototype only: no imports from product code, Firebase or localStorage.
export const STATES=Object.freeze(['queued','in-flight','awaiting-proof','needs-choice']);
export const DB_PREFIX='becoming-b2a-prototype:';
export function fault(code){const error=new Error(code);error.code=code;return error;}
export function storageFault(error){
 if(typeof error?.code==='string'&&error.code.startsWith('queue/'))return error;
 return fault(({QuotaExceededError:'queue/quota-exceeded',AbortError:'queue/aborted',SecurityError:'queue/unavailable',VersionError:'queue/version-incompatible'})[error?.name]||'queue/storage-failed');
}
export function uidKey(uid){if(typeof uid!=='string'||!uid.trim()||uid.length>128)throw fault('queue/invalid-uid');return uid;}
export function courseKey(path){if(typeof path!=='string'||!/^(videos|biochem|physiology|pharmacology)\/[A-Za-z0-9_-]{1,128}$/.test(path))throw fault('queue/invalid-path');return path;}
export function targetValue(value){if(value===null)return {kind:'delete'};if(typeof value==='boolean')return {kind:'set',value};throw fault('queue/invalid-target');}
export function expectedKey(expected,uid){
 if(!expected||expected.uid!==uid||typeof expected.intentId!=='string'||!expected.intentId||!Number.isSafeInteger(expected.generation)||expected.generation<1||!STATES.includes(expected.state))throw fault('queue/invalid-expected');
 courseKey(expected.path);return [uid,expected.path];
}
export function matches(row,expected){return !!row&&row.uid===expected.uid&&row.path===expected.path&&row.intentId===expected.intentId&&row.generation===expected.generation&&row.state===expected.state;}
export function transitionAllowed(from,to){return ({queued:['in-flight','needs-choice'],'in-flight':['awaiting-proof','needs-choice'],'awaiting-proof':['needs-choice'],'needs-choice':['awaiting-proof']})[from]?.includes(to)===true;}

// A flight is an immutable transmission identity, not the mutable intent workflow state.
export function flightKey(token,uid){
 if(!token||token.kind!=='flight-token'||token.uid!==uid||!['intentId','flightId','ownerSession'].every(k=>typeof token[k]==='string'&&token[k].length>0&&token[k].length<=128)||!Number.isSafeInteger(token.generation)||token.generation<1)throw fault('queue/invalid-flight');
 courseKey(token.path);return [uid,token.path,token.intentId,token.generation];
}
export function matchesFlight(flight,token){
 return token?.kind==='flight-token'&&!!flight&&flight.kind==='flight'&&flight.phase==='unsettled'&&['uid','path','intentId','generation','flightId','ownerSession'].every(key=>flight[key]===token[key]);
}
