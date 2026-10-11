import {mkdirSync, copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
mkdirSync('public', {recursive:true});
const result = spawnSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'styles/tailwind.css', '-o', 'public/tailwind.css', '--minify'], {stdio:'inherit'});
if(result.status !== 0) process.exit(result.status || 1);
copyFileSync('node_modules/lucide/dist/umd/lucide.min.js', 'public/lucide.min.js');
for(const [source,target] of [
  ['react/umd/react.production.min.js','react.min.js'],
  ['react-dom/umd/react-dom.production.min.js','react-dom.min.js'],
  ['prop-types/prop-types.min.js','prop-types.min.js'],
  ['recharts/umd/Recharts.js','recharts.js'],
  ['recharts/umd/Recharts.js.LICENSE.txt','recharts.LICENSE.txt']
]) copyFileSync('node_modules/'+source,'public/'+target);
