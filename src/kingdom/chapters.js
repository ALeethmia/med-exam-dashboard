// Display definitions only. The exam date belongs to Adaptive Study Planner settings.
export const BRAND=Object.freeze({name:'Becoming',concept:'Chronicles of Becoming',slogan:'Your life. Your story. Your world.',meaning:'每一步成長，都是人生的新篇章。'});
export const CHAPTER_I=Object.freeze({id:'scholars-trial',number:1,label:'Chapter 1',title:'初始之地',goal:'醫師第一階段國考',goalType:'exam',category:'learning',world:'Aetheria',worldName:'艾瑟利亞',initialState:'in_progress',examDateSource:'adaptiveStudy.settings.examDate',story:'在艾瑟利亞的邊境，沉寂已久的奧術學院重新點亮燈火。知識將喚醒古老符文，而一位學者領主的旅程，正從這裡開始。'});
export const CHAPTERS=Object.freeze([CHAPTER_I]);
export function chapterSnapshot(settings,day) {
  const days=Math.round((new Date(settings.examDate+'T00:00:00Z')-new Date(day+'T00:00:00Z'))/86400000);
  return {...CHAPTER_I,examDate:settings.examDate,daysRemaining:Math.max(0,days),examTiming:days>0?'upcoming':days===0?'today':'elapsed',examResult:'unreported',chapterState:CHAPTER_I.initialState};
}
