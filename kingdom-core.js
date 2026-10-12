import {subjectStats} from './study-core.js';
import {TYPES,STATUS} from './life-core.js';
import {chapterSnapshot} from './chapters.js';
export const BUILDINGS=Object.freeze([
  Object.freeze({id:'keep',title:'王國要塞',role:'邊境領地的中心',detail:'守護學者的第一片領地。未來將隨王國發展開放升級。'}),
  Object.freeze({id:'academy',title:'奧術學院',role:'知識與符文的燈火',detail:'現實中的知識累積，是學院復興的基礎。研究與魔法科技將於未來開放。'}),
  Object.freeze({id:'barracks',title:'皇家兵營',role:'尚待集結的守護者',detail:'步兵、遊俠弓兵與奧術法師的未來駐地。現階段未開放招募。'})
]);
export function exerciseLabel(exercise,training) {
  if(exercise.status==='symptom_rest')return '症狀休息 · 以恢復為先';
  if(exercise.status==='complete'||exercise.status==='alternative')return exercise.legacy?'已完成（舊紀錄）':STATUS[exercise.status];
  if(training.paused)return '暫停訓練 · 休息與恢復';
  if(exercise.type==='rest')return '休息與恢復';
  return exercise.status==='not_scheduled'?'未安排':`${TYPES[exercise.type]||'運動'} · 尚未完成`;
}
export function kingdomSnapshot({data,states,settings,day,goals,training}) {
  const subjects=subjectStats(data,states),done=subjects.reduce((n,s)=>n+s.done,0),total=subjects.reduce((n,s)=>n+s.total,0);
  return {chapter:chapterSnapshot(settings,day),subjects:subjects.map(s=>({...s,remaining:s.total-s.done})),courses:{done,total,remaining:total-done},study:{...goals.study,label:goals.study.total?`${goals.study.done} / ${goals.study.total} 任務已完成`:'今日未安排學習任務'},exercise:{...goals.exercise,label:exerciseLabel(goals.exercise,training)},leisure:{...goals.leisure,label:goals.leisure.status==='complete'?'已完成':goals.leisure.status==='pending'?'尚未完成':'未安排'},milestones:[{id:'border-domain',title:'邊境領地',detail:'三座初始建築 · 旅程從此開始',reached:true},{id:'first-knowledge',title:'第一道知識之光',detail:'完成第一個課程單元',reached:done>0}]};
}
