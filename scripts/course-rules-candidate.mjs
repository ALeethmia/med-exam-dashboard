// Offline generator only. Never contacts Firebase or installs/deploys Rules.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {OWNER_UID} from '../owner-config.js';
import {flattenSubjects} from '../src/study/study-core.js';
const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const names={physio:'physioChaptersData',anatomy:'anatomyLessonsData',biochem:'biochemData',pharm:'pharmacologyData'};
const catalog=Object.fromEntries(Object.entries(names).map(([key,name])=>[key,vm.runInNewContext('('+html.match(new RegExp('const '+name+' = (\\[.*?\\n    \\]);','s'))[1]+')')]));
export const courses=flattenSubjects(catalog).map(({path,id})=>({path,id,key:path+'__'+id}));
const at=(node,path)=>`${node}.child('${path}')`;
const val=(node,path)=>at(node,path)+'.val()';
const same=(a,b,path)=>`${val(a,path)} === ${val(b,path)}`;
const uuid=node=>`${node}.isString() && ${node}.val().matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)`;
const increment=(n,d)=>`((${d}.exists() && ${val(n,'clock')} === ${val(d,'clock')} + 1) || (!${d}.exists() && ${val(n,'clock')} === 1))`;
export function makeCourseRules(owner){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(owner))throw Error('Invalid reviewed owner UID');
 const access=`auth != null && auth.uid === '${owner}'`;
 const n='newData',d='data';
 // Deletions skip .validate at the deleted node. Keep all existing tombstones at
 // the non-deletable document ancestor, regardless of set/update target depth.
 const retained=courses.flatMap(c=>['courses/'+c.path+'/'+c.id,'versions/'+c.key,'firstCompletion/'+c.key]).map(p=>`(!${at(d,p)}.exists() || ${at(n,p)}.exists())`);
 const initial=`(!data.exists() && ${val(n,'generation')} === 'initial-v3' && ${val(n,'era')} === 0 && (${val(n,'clock')} === 0 || ${val(n,'clock')} === 1))`;
 const stable=`(data.exists() && ${same(n,d,'generation')} && ${same(n,d,'era')} && (${same(n,d,'clock')} || ${increment(n,d)}))`;
 const doc={
  '.read':access+' && auth.uid === $uid',
  '.write':access+' && auth.uid === $uid && newData.exists()',
  '.validate':[
   "newData.hasChildren(['schema','generation','era','clock'])",`${val(n,'schema')} === 3`,`${at(n,'generation')}.isString()`,
   ...['era','clock'].map(p=>`${at(n,p)}.isNumber() && ${val(n,p)} >= 0 && ${val(n,p)} <= 9007199254740991 && ${val(n,p)} % 1 === 0`),
   `(${initial} || ${stable})`,...retained,
   ...courses.map(c=>`${at(n,'courses/'+c.path+'/'+c.id)}.exists() === ${at(n,'versions/'+c.key)}.exists()`)
  ].join(' && '),
  schema:{},generation:{},era:{},clock:{},courses:{'.validate':'newData.hasChildren()'},versions:{'.validate':'newData.hasChildren()'},firstCompletion:{'.validate':'newData.hasChildren()'},'$other':{'.validate':false}
 };
 for(const subject of new Set(courses.map(c=>c.path))){
  const ids=courses.filter(c=>c.path===subject).map(c=>c.id).join('|');
  const nr='newData.parent().parent().parent()',dr='data.parent().parent().parent()';
  const version=`versions/${subject}__`;
  doc.courses[subject]={
   '.validate':'newData.hasChildren()',
   '$id':{'.validate':`$id.matches(/^(${ids})$/) && newData.isBoolean() && ${nr}.child('${version}' + $id).isString() && (newData.val() === data.val() || (${nr}.child('${version}' + $id).val() !== ${dr}.child('${version}' + $id).val() && (${increment(nr,dr)})))`}
  };
 }
 doc.courses.$other={'.validate':false};
 const nr='newData.parent().parent()',dr='data.parent().parent()';
 // A chapter request legitimately updates versions of already-complete members.
 // Every changed version must share the UUID of an actual Boolean transition
 // in this same atomic write, not just a bumped counter or edited date.
 const witnessed=courses.map(c=>`(${val(nr,'courses/'+c.path+'/'+c.id)} !== ${val(dr,'courses/'+c.path+'/'+c.id)} && ${val(nr,'versions/'+c.key)} === newData.val())`).join(' || ');
 const keys=courses.map(c=>c.key).join('|');
 doc.versions.$key={'.validate':`$key.matches(/^(${keys})$/) && (${uuid('newData')}) && (newData.val() === data.val() || ((${increment(nr,dr)}) && (${witnessed})))`};
 const dateRootN='newData.parent().parent()',dateRootD='data.parent().parent()';
 doc.firstCompletion.$key={
  '.validate':`$key.matches(/^(${keys})$/) && newData.hasChildren(['_version']) && (${uuid("newData.child('_version')")}) && (!newData.child('day').exists() || (newData.child('day').isString() && newData.child('day').val().matches(/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/))) && ((${same(n,d,'day')} && ${same(n,d,'_version')}) || (${val(n,'_version')} !== ${val(d,'_version')} && (${increment(dateRootN,dateRootD)})))`,
  day:{},_version:{},'$other':{'.validate':false}
 };
 // No ancestor write grants: legacy course, date and v2 roots stay denied.
 const rw={'.read':access,'.write':access};
 return {rules:{'.read':false,'.write':false,users:{$uid:{learningV3:doc}},
  videos:{'.write':false},biochem:{'.write':false},physiology:{'.write':false},pharmacology:{'.write':false},
  gamification:{'.read':access,v1:{days:{'.read':access,'.write':false},awards:{'.read':access,'.write':false}},v2:{timeTasks:{...rw}},v3:{planner:{tasks:{...rw}}}},
  habits:{...rw},custom_events:{...rw},checklist:{...rw},
  questOS:{v1:{courseFirstCompletion:{'.write':false},courseSyncV2:{'.write':false},training:{...rw},adaptiveStudy:{settings:{...rw}}}}
 }};
}
export function makeFrozenCourseRules(owner){
 const candidate=makeCourseRules(owner);
 const freeze=node=>{for(const [key,value] of Object.entries(node)){if(key==='.write')node[key]=false;else if(value&&typeof value==='object')freeze(value);}};
 freeze(candidate.rules);return candidate;
}
const outputs=[['config/firebase/database.rules.candidate.json',makeCourseRules('__REVIEWED_OWNER_UID__')],['config/firebase/database.rules.freeze.candidate.json',makeFrozenCourseRules('__REVIEWED_OWNER_UID__')],['tests/fixtures/course-rules.json',makeCourseRules('fixture-A')]];
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const check=process.argv.includes('--check');
 if(process.argv.includes('--prepare')){
  const directory=new URL('work/course-cutover/',root);mkdirSync(directory,{recursive:true});
  const rules=JSON.stringify(makeCourseRules(OWNER_UID),null,2)+'\n';
  writeFileSync(new URL('database.rules.candidate.json',directory),rules);
  const frozen=JSON.stringify(makeFrozenCourseRules(OWNER_UID),null,2)+'\n';
  writeFileSync(new URL('database.rules.freeze.candidate.json',directory),frozen);
  const sha256=createHash('sha256').update(rules).digest('hex');
  const worktreeDirty=!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
  writeFileSync(new URL('manifest.json',directory),JSON.stringify({executable:false,uid:OWNER_UID,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sha256,worktreeDirty,frozenSha256:createHash('sha256').update(frozen).digest('hex'),blockers:[...(worktreeDirty?['Uncommitted worktree; regenerate packet after commit']:[]),'Live Rules export/ancestor grants not audited','No Production write or deployment authorization','Shared non-course old writers still enabled; full-account reset forbidden']},null,2)+'\n');
  console.log('Prepared owner-bound candidate + checksum in work/course-cutover (executable:false; NO network/deployment).');
  process.exit(0);
 }
 for(const [path,value] of outputs){const text=JSON.stringify(value,null,2)+'\n';if(check){if(readFileSync(new URL(path,root),'utf8')!==text)throw Error('Rules candidate out of date: '+path);}else writeFileSync(new URL(path,root),text);}
 console.log(`${check?'Verified':'Generated'} Rules candidate + synthetic fixture (${courses.length} catalog courses; NO deployment).`);
}
