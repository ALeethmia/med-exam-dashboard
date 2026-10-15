import {flattenSubjects,dateKey} from'../../src/study/study-core.js';
export function fixturePackets(name,data){
 const all=flattenSubjects(data),N=all.length,D={initial:0,middle:35,high:80,full:Math.ceil(N*.85),downgrade:Math.ceil(N*.85)-1,'course-task':0,'general-task':0,'legacy-pending':0}[name]??0;
 const T={middle:8,high:20,full:30,downgrade:30}[name]??0,states={videos:{},biochem:{},physiology:{},pharmacology:{}},habits={},dates={};
 for(const [i,l]of all.entries()){states[l.path][l.id]=i<D;if(i<D)dates[l.path+'__'+l.id]={day:'2026-10-01',_version:'fixture-date-'+i};}
 for(let i=0;i<T;i++){const day=new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10);habits[day]={'daily-sport':true};}
 const today=dateKey(),a=all[N-2],b=all[N-1],ref=l=>({path:l.path,id:String(l.id)});
 const tasks={single:{title:'單課程閱讀（Fixture）',date:today,links:[ref(a)],complete:true,createdAt:1,order:1},shared:{title:'同一課程複習（Fixture）',date:today,links:[ref(a)],complete:false,createdAt:2,order:2},multi:{title:'兩堂課整合（Fixture）',date:today,links:[ref(a),ref(b)],complete:false,createdAt:3,order:3},general:{title:'整理書桌（Fixture）',date:today,links:[],complete:false,createdAt:4,order:4},history:{title:'歷史已獲獎任務（Fixture）',date:today,links:[],complete:false,award:{xp:20,day:'2026-10-01'},createdAt:5,order:5},invalid:{title:'舊連結待確認（Fixture）',date:today,links:[{path:'videos',id:'fixture-not-in-catalog'}],complete:true,createdAt:6,order:6}};
 if(name==='course-task')states[a.path][a.id]=true;
 if(name==='general-task')tasks.general.complete=true;
 return {...states,habits,questOS:{v1:{courseFirstCompletion:dates,adaptiveStudy:{settings:{examDate:'2027-02-01'}}}},gamification:{v1:{awards:{fixture_old_course:{xp:20,day:'2026-10-01'}}},v2:{timeTasks:{'2026-10-01':{morning:{complete:true,awarded:true,hours:2}}}},v3:{planner:{tasks}}}};
}
