import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
export const versionPattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;
export const packageInfo=()=>JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
export function versionInfo(pkg,env={}) {
 if(!versionPattern.test(pkg.version))throw new Error('Version must be MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-beta.N');
 const sha=env.VERCEL_GIT_COMMIT_SHA;
 return {version:pkg.version,commit:typeof sha==='string'&&/^[a-f0-9]{40}$/i.test(sha)?sha:null};
}
export function writeVersionInfo(env=process.env){mkdirSync(new URL('../public/',import.meta.url),{recursive:true});writeFileSync(new URL('../public/app-version.json',import.meta.url),JSON.stringify(versionInfo(packageInfo(),env),null,2)+'\n');}
export function checkVersionInfo(){
 const pkg=packageInfo(),lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8')),generated=JSON.parse(readFileSync(new URL('../public/app-version.json',import.meta.url),'utf8'));
 versionInfo(pkg);
 if(lock.version!==pkg.version||lock.packages[''].version!==pkg.version||generated.version!==pkg.version)throw new Error('Version metadata is stale: run npm run build and synchronize the lockfile root version.');
 if(generated.commit!==null&&!/^[a-f0-9]{40}$/i.test(generated.commit||''))throw new Error('Invalid build commit metadata');
}
