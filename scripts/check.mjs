import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const file of ['server.js','theme.js','sync.js','study-core.js','workspace.js','subjects.js','time-tasks.js','auth.js','firebase-config.js','owner-config.js','daily-planner.js','planner-ui.js','week-plan-ui.js','life-core.js','life-store.js','life-ui.js','adaptive-core.js','adaptive-store.js','adaptive-ui.js','chapters.js','kingdom-core.js','kingdom-ui.js','course-dates.js','growth-core.js','growth-ui.js']) {
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status) process.exit(result.status);
}
for(const match of readFileSync('index.html','utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if(!match[1].trim()) continue;
  const result=spawnSync(process.execPath,['--check'],{input:match[1],stdio:['pipe','inherit','inherit']});
  if(result.status) process.exit(result.status);
}
console.log('JavaScript syntax checked, including inline scripts.');
