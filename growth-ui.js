import {growthSnapshot} from './growth-core.js';
import {dateKey,COURSE_PROGRESS_NOTE} from './study-core.js';
const node=(tag,cls='',text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function createGrowthUI({data,states,planner,life,awards,courseAwards=()=>({}),today=()=>dateKey()}) {
 const page=document.getElementById('tab-content-stats');
 const summary=node('section','workspace-panel');summary.id='growth-week';summary.innerHTML='<h3>本週學習成果</h3><p id="growth-week-courses" class="growth-main-number"></p><p id="growth-week-dates" class="workspace-note"></p><p id="growth-course-history-state" class="workspace-note"></p><p id="growth-course-coverage" class="workspace-note"></p><p id="growth-course-total"></p><div class="growth-planner-summary"><p id="growth-week-tasks"></p><p class="workspace-note">Planner 為輔助指標，依任務安排日期統計目前完成狀態，排除移除及待安排任務。尚無每次完成時間戳，不代表實際完成日或讀書時數；取消完成後即不列入。不需建立任務才能記錄課程進度。</p></div>';
 const courses=node('section','workspace-panel');courses.innerHTML='<h3>四科課程進度</h3><div id="growth-subjects"></div><p class="workspace-note" data-course-progress-basis>'+COURSE_PROGRESS_NOTE+'</p>';
 page.prepend(summary,courses);

 const exercise=node('section','workspace-panel');exercise.innerHTML='<h3>運動與恢復</h3><p id="growth-exercise"></p><p id="growth-exercise-records" class="workspace-note"></p><p id="growth-training-paused" class="workspace-note"></p>';
 const history=node('details','workspace-panel growth-history');history.innerHTML='<summary>歷史首次完成獎勵</summary><p id="weekly-detail"></p><p id="growth-award-total"></p><p class="workspace-note">獎勵事件包含課程、Planner 與舊時間目標；取消、改期、移除或復原不新增獎勵。它不是目前任務完成數、學習量或讀書時數，也不是王國資源。</p>';page.append(exercise,history);
 function render(){const s=growthSnapshot({data,states:states(),tasks:planner.all(),awards:awards(),courseAwards:courseAwards(),day:today(),getHabits:life.habits,training:life.training()});
  summary.querySelector('#growth-week-courses').textContent=s.firstCourses.datedTotal?`本週有日期的首次完成紀錄 ${s.firstCourses.weekly} 課程單元`:'首次完成紀錄尚缺課程日期';
  summary.querySelector('#growth-week-dates').textContent=s.start+'–'+s.end+' · 台灣日期，週一至週日';
  summary.querySelector('#growth-course-history-state').textContent=`其中 ${s.firstCourses.weeklyCurrent} 單元目前仍完成${s.firstCourses.weeklyUnchecked?'；'+s.firstCourses.weeklyUnchecked+' 單元目前未勾選完成，首次完成歷史仍保留':''}。取消後重勾不增加首次次數。`;
  summary.querySelector('#growth-course-coverage').textContent=`只計能對應四科課程的既有首次日期；累積有日期 ${s.firstCourses.datedTotal} 單元${s.firstCourses.undatedCurrent?'，目前完成中 '+s.firstCourses.undatedCurrent+' 單元缺日期（只計入累積進度）':''}。首次日期未必涵蓋所有科目勾選，不代表本週全部讀完的課程；不補填日期。`;
  summary.querySelector('#growth-course-total').textContent=`累積目前完成 ${s.courses.done} / ${s.courses.total} 單元 · ${s.courses.percent}%（整體按單元數）`;
  summary.querySelector('#growth-week-tasks').textContent=s.tasks.total?`本週 Planner 已完成 ${s.tasks.done} / ${s.tasks.total} 項任務（依安排日期）`:'本週尚未安排 Planner 任務';
  const list=courses.querySelector('#growth-subjects');list.replaceChildren();for(const subject of s.subjects){const row=node('div','kingdom-subject');row.dataset.subject=subject.path;row.append(node('span','',subject.title),node('span','',`${subject.done} / ${subject.total} · ${subject.percent}% · ${['videos','pharmacology'].includes(subject.path)?'依影片時長':'依單元數'}`));list.append(row);}
  const e=s.exercise;exercise.querySelector('#growth-exercise').textContent=`運動完成 ${e.complete} 天 · 低強度替代 ${e.alternative} 天 · 主動休息 ${e.rest} 天 · 症狀休息 ${e.symptomRest} 天 · 明確未安排 ${e.unplanned} 天 · 已安排尚未完成 ${e.pending} 天`;
  exercise.querySelector('#growth-exercise-records').textContent=e.recorded?`本週截至今日有 ${e.recorded} 天紀錄${e.legacy?'（含舊打卡 '+e.legacy+' 天）':''}；另 ${e.unrecorded} 天未記錄，不回推歷史狀態。`:'本週截至今日尚無運動日紀錄，不依目前課表回填休息或未安排。';
  exercise.querySelector('#growth-training-paused').textContent=(s.paused?'目前訓練已暫停。':'目前訓練未暫停。')+'暫停是目前設定，沒有歷史暫停時間，不能據此統計過去天數。休息不是失敗。';
  history.querySelector('#weekly-detail').textContent=`本週歷史首次完成獎勵 ${s.historical.weekly} 筆`;
  history.querySelector('#growth-award-total').textContent=`累積 ${s.historical.total} 筆獎勵 · ${s.historical.xp} XP（歷史紀錄）`;
 }
 return {render};
}
