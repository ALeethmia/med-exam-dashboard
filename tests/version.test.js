import test from 'node:test';
import assert from 'node:assert/strict';
import {packageInfo,versionInfo,checkVersionInfo,versionPattern} from '../scripts/version-info.mjs';
test('package, lockfile and generated display metadata share the product version',()=>{assert.equal(versionPattern.test(packageInfo().version),true);assert.doesNotThrow(checkVersionInfo);});
test('build metadata accepts real Vercel SHA and omits missing or fake SHA',()=>{const pkg=packageInfo(),sha='a'.repeat(40);assert.deepEqual(versionInfo(pkg,{VERCEL_GIT_COMMIT_SHA:sha}),{version:pkg.version,commit:sha});for(const value of [undefined,'unknown','fake-sha','1234567',''])assert.equal(versionInfo(pkg,{VERCEL_GIT_COMMIT_SHA:value}).commit,null);});
test('supported SemVer releases and beta iterations validate without automatic promotion',()=>{for(const version of ['0.2.0','0.2.1','0.3.0','0.2.0-beta.2'])assert.equal(versionInfo({version}).version,version);for(const version of ['v0.2.0','0.02.0','0.2','0.2.0-beta.01'])assert.throws(()=>versionInfo({version}));});
