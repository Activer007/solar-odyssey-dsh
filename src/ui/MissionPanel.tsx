import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { answerMission, observations, useMission } from '../state/mission';
import { useExplorer } from '../state/useExplorer';

const stops = [
  { title: '追踪太阳能量', description: '进入太阳剖面，观察「能量的旅程」的全部四步。', go: () => useExplorer.getState().enterInterior() },
  { title: '观察地球夜面', description: '飞近地球，选择「观察夜间灯光」。', go: () => useExplorer.getState().selectBody('earth') },
  { title: '造访土星', description: '飞近土星，转动视角观察环与行星的位置关系。', go: () => useExplorer.getState().selectBody('saturn') },
];
const answers = [
  { id: 'fusion', label: '核心的氢核聚变' },
  { id: 'radiation', label: '辐射区创造了能量' },
  { id: 'photosphere', label: '光球层燃烧产生能量' },
];

export function MissionPanel({ close }: { close: () => void }) {
  const progress = useMission();
  const completed = observations(progress);
  const count = completed.filter(Boolean).length;
  const [incorrect, setIncorrect] = useState(false);
  return <div className="mission-panel">
    <p className="dialog-intro">完成三项观察，再回答一道问题。你也可以随时返回自由探索。</p>
    <p className="mission-progress" role="status">观察进度 {count} / {stops.length}</p>
    <ol className="mission-stops">{stops.map((stop, index) => <li key={stop.title}>
      <div><strong>{stop.title}</strong><p>{stop.description}</p></div>
      {completed[index] ? <span className="mission-done"><Check size={15} />已完成</span>
        : <button type="button" className="secondary-button" onClick={() => { close(); stop.go(); useExplorer.getState().set({ infoOpen: true }); }}>
          前往<ChevronRight size={14} /><span className="sr-only">{stop.title}</span>
        </button>}
    </li>)}</ol>
    {count === stops.length && <section className="mission-quiz" aria-label="科普问答">
      <h3>太阳向外辐射的能量，最初从哪里来？</h3>
      {progress.passed ? <p className="mission-done" role="status"><Check size={16} />任务完成。核心聚变释放能量，辐射和对流将它向外传递。</p>
        : <>{answers.map(answer => <button type="button" key={answer.id} className="secondary-button"
          onClick={() => setIncorrect(!answerMission(answer.id))}>{answer.label}</button>)}
          {incorrect && <p role="status">再试一次。回想「能量的旅程」中哪个区域产生能量，哪些区域负责传递。</p>}
        </>}
    </section>}
  </div>;
}
