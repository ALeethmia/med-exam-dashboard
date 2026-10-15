import {checkVersionInfo} from './version-info.mjs';
checkVersionInfo();
import {readFileSync,readdirSync} from 'node:fs';
const relocatedModules=['src/','compat/'].flatMap(directory=>readdirSync(new URL('../'+directory,import.meta.url),{recursive:true}).filter(file=>file.endsWith('.js')).map(file=>directory+file));
import {spawnSync} from 'node:child_process';
for(const file of ['server.js','theme.js','sync.js','src/study/study-core.js','workspace.js','subjects.js','time-tasks.js','auth.js','firebase-config.js','owner-config.js','daily-planner.js','src/planner/planner-ui.js','src/planner/week-plan-ui.js','src/study/life-core.js','life-store.js','src/study/life-ui.js','src/planner/adaptive-core.js','adaptive-store.js','src/planner/adaptive-ui.js','src/kingdom/chapters.js','src/kingdom/territory-ui.js','src/kingdom/territory-core.js','src/kingdom/kingdom-core.js','src/kingdom/kingdom-ui.js','src/kingdom/chronicles-ui.js','src/ui/version-ui.js','scripts/version-info.mjs','course-dates.js','src/study/growth-core.js','src/study/growth-ui.js','src/kingdom/kingdom-preview.js','src/kingdom/kingdom-map-core.js','src/kingdom/kingdom-building-manifest.js','src/kingdom/kingdom-preview-state.js','src/kingdom/kingdom-map-renderer.js','src/kingdom/kingdom-map-input.js','account-storage.js','firebase-entry.js','src/kingdom/i2a-map.js','i3-runtime.js','src/kingdom/kingdom-lite-art.js','legacy-rewards.js','readiness.js','src/kingdom/readonly-mapping.js','src/kingdom/realm-growth.js','src/planner/task-projection.js',...relocatedModules]) {
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status) process.exit(result.status);
}
for(const match of readFileSync('index.html','utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if(!match[1].trim()) continue;
  const result=spawnSync(process.execPath,['--check'],{input:match[1],stdio:['pipe','inherit','inherit']});
  if(result.status) process.exit(result.status);
}
console.log('JavaScript syntax checked, including inline scripts.');
