import {checkVersionInfo} from './version-info.mjs';
checkVersionInfo();
import {readFileSync,readdirSync} from 'node:fs';
const relocatedModules=readdirSync(new URL('../src/',import.meta.url),{recursive:true}).filter(file=>file.endsWith('.js')).map(file=>'src/'+file);
import {spawnSync} from 'node:child_process';
for(const file of ['server.js','theme.js','sync.js','study-core.js','workspace.js','subjects.js','time-tasks.js','auth.js','firebase-config.js','owner-config.js','daily-planner.js','planner-ui.js','week-plan-ui.js','life-core.js','life-store.js','life-ui.js','adaptive-core.js','adaptive-store.js','adaptive-ui.js','chapters.js','territory-ui.js','territory-core.js','kingdom-core.js','kingdom-ui.js','chronicles-ui.js','version-ui.js','scripts/version-info.mjs','course-dates.js','growth-core.js','growth-ui.js','kingdom-preview.js','kingdom-map-core.js','kingdom-building-manifest.js','kingdom-preview-state.js','kingdom-map-renderer.js','kingdom-map-input.js','account-storage.js','firebase-entry.js','i2a-map.js','i3-runtime.js','kingdom-lite-art.js','legacy-rewards.js','readiness.js','readonly-mapping.js','realm-growth.js','task-projection.js',...relocatedModules]) {
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status) process.exit(result.status);
}
for(const match of readFileSync('index.html','utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if(!match[1].trim()) continue;
  const result=spawnSync(process.execPath,['--check'],{input:match[1],stdio:['pipe','inherit','inherit']});
  if(result.status) process.exit(result.status);
}
console.log('JavaScript syntax checked, including inline scripts.');
