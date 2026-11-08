import { ArrowLeft, ArrowRight, BookOpen, Zap } from 'lucide-react';
import { solarLessons } from '../data/solarLessons';
import { useExplorer } from '../state/useExplorer';

export function SolarLessonPanel() {
  const step = useExplorer(s => s.lessonStep);
  const start = useExplorer(s => s.startLesson), setStep = useExplorer(s => s.setLessonStep);
  const leave = useExplorer(s => s.leaveLesson);
  if (step === null) return <button className="secondary-button lesson-start" data-testid="lesson-start" onClick={start}>
    <BookOpen size={15} />跟随讲解：能量的旅程
  </button>;
  const lesson = solarLessons[step];
  return <section className="lesson-card" aria-label="太阳能量分步讲解">
    <div className="lesson-progress" aria-label="教学步骤">
      {solarLessons.map((item, index) => <button key={item.stage} data-testid={`lesson-step-${index}`}
        aria-label={`${index + 1}. ${item.title}`} aria-current={index === step ? 'step' : undefined}
        onClick={() => setStep(index)}>{index + 1}</button>)}
    </div>
    <div aria-live="polite"><small>能量的旅程 · {step + 1} / {solarLessons.length}</small>
      <h2>{lesson.title}</h2><p>{lesson.explanation}</p>
      <p className="lesson-animation"><Zap size={13} />{lesson.animation}</p>
    </div>
    <div className="lesson-navigation">
      <button data-testid="lesson-prev" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={13} />上一步</button>
      <button data-testid="lesson-next" disabled={step === solarLessons.length - 1} onClick={() => setStep(step + 1)}>下一步<ArrowRight size={13} /></button>
    </div>
    <button className="lesson-exit" data-testid="lesson-exit" onClick={leave}>返回自由探索</button>
  </section>;
}
