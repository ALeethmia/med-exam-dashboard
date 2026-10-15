from pathlib import Path
import shutil,re
root=Path(__file__).resolve().parents[1];app=root;dist=root/'.growth-review/growth-i1'
exclude={'auth.js','firebase-entry.js','firebase-config.js','owner-config.js','host-index.html','kingdom-preview.html','kingdom-preview.js','kingdom-map.css','kingdom-preview-state.js','metadata.json','tests','scripts','playwright.config.js','server.js','package-lock.json','firebase.json','database.rules.json'}
if dist.exists():shutil.rmtree(dist)
dist.mkdir(parents=True)
for p in list(app.iterdir())+list((root/'tests/fixtures').iterdir()):
 if p.name in exclude or p.name.startswith('.'):continue
 if p.is_file() and p.suffix in {'.js','.css','.html','.json'}:
  value=p.read_text().replace('localStorage','reviewStorage')
  if p.parent.name=='fixtures':value=value.replace('../../','./')
  if p.name=='index.html':
   value=re.sub(r'\s*<script[^>]+src="https://www.gstatic.com/firebasejs/[^\"]+"[^>]*></script>','',value)
   value=value.replace('<script src="./firebase-config.js"></script>','').replace('<script type="module" src="./firebase-entry.js"></script>','<script type="module" src="./review-start.js"></script>')
   value=value.replace('<head>', '<head>\n<script src="./review-memory.js"></script>\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\'; img-src \'self\' data:; object-src \'none\'; base-uri \'self\'">')
   a=value.index('    const firebaseConfig =');b=value.index('    window.attachLearningDB(db);',a)
   value=value[:a]+"    let db=window.i3MockDatabase||null;\n"+value[b:]
  (dist/p.name).write_text(value)
 elif p.name in {'src','styles'}:shutil.copytree(p,dist/p.name,dirs_exist_ok=True)
 elif p.name=='public':shutil.copytree(p,dist/'public',dirs_exist_ok=True)
print('Built .growth-review/growth-i1 (Fixtures only; never deploy automatically)')
