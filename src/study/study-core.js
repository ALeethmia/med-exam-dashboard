export const COURSE_PROGRESS_NOTE='整體按單元數計算；生理、生化依單元數，解剖、藥理依影片時長加權。影片時長不是實際讀書時間。';
export const GAME_KEY = 'med_exam_gamification_v1';
export const GAME_PATH = 'gamification/v1';
export function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function weekKey(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function flattenSubjects(data) {
  return [
    ...data.physio.flatMap(c => c.sections.map(s => ({path: 'physiology', id: s.id, title: s.title, subject: '生理學', week: ['甲','乙','丙','丁'].includes(c.chapterId) ? 'W1' : 'W2'}))),
    ...data.anatomy.flatMap(c => c.lectures.map(s => ({path: 'videos', id: String(s.id), title: s.title, subject: '解剖學', week: c.weekKey}))),
    ...data.biochem.map(s => ({path: 'biochem', id: String(s.id), title: s.title, subject: '生化學', week: s.weekKey})),
    ...data.pharm.flatMap(c => c.lectures.map(s => ({path: 'pharmacology', id: String(s.id), title: s.title, subject: '藥理學', week: c.weekKey})))
  ];
}
export function selectTasks(items, states, weeks, day, count = 3) {
  const current = weeks.find(w => day >= w.start && day <= w.end);
  return items.filter(t => !states[t.path]?.[t.id]).map((t, i) => ({...t, order: i}))
    .sort((a,b) => Number(b.week === `W${current?.w}`) - Number(a.week === `W${current?.w}`) || a.order - b.order)
    .slice(0, count).map(({order, ...t}) => ({...t, xp: 20}));
}
export const awardKey = task => `${task.path}__${task.id}`;
export function totalXP(awards = {}) {
  return Object.values(awards).reduce((sum, a) => sum + (a?.xp === 20 ? 20 : 0), 0);
}
export function gameStats(awards = {}, day = dateKey()) {
  const xp = totalXP(awards);
  const values = Object.values(awards).filter(a => a?.xp === 20 && /^\d{4}-\d{2}-\d{2}$/.test(a.day || ''));
  const weekly = values.filter(a => weekKey(a.day) === weekKey(day)).length;
  const daily = values.filter(a => a.day === day).length;
  return {xp, level: Math.floor(xp / 100) + 1, next: 100 - xp % 100, weekly, daily,
    achievements: [
      {title: '開始前進', detail: '完成第一個讀書任務', unlocked: values.length >= 1},
      {title: '今日專注', detail: '同一天完成 3 個任務', unlocked: Object.values(values.reduce((m,a) => ({...m, [a.day]: (m[a.day] || 0) + 1}), {})).some(n => n >= 3)},
      {title: '持續累積', detail: '累積完成 10 個任務', unlocked: values.length >= 10}
    ]};
}
export function subjectStats(data, states) {
  const summarize = (items, state, weight) => {
    const done = items.filter(i => state?.[i.id]);
    const totalWeight = items.reduce((n,i) => n + weight(i), 0);
    return {done: done.length, total: items.length, percent: totalWeight ? Math.round(done.reduce((n,i) => n + weight(i), 0) / totalWeight * 100) : 0};
  };
  return [
    {path:'physiology', tab:'physiology', title:'生理學', unit:'小節', ...summarize(data.physio.flatMap(c=>c.sections),states.physiology,()=>1)},
    {path:'videos', tab:'anatomy', title:'解剖學', unit:'講 · 依時長', ...summarize(data.anatomy.flatMap(c=>c.lectures),states.videos,i=>i.durationSec)},
    {path:'biochem', tab:'biochem', title:'生化學', unit:'堂', ...summarize(data.biochem,states.biochem,()=>1)},
    {path:'pharmacology', tab:'pharmacology', title:'藥理學', unit:'講 · 依時長', ...summarize(data.pharm.flatMap(c=>c.lectures),states.pharmacology,i=>i.durationSec)}
  ];
}
