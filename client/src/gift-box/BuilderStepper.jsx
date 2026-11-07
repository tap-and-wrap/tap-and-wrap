import { useId } from 'react';
import { Check } from 'lucide-react';
import { BUILDER_STEPS } from '../../../shared/gift-box/definitions.mjs';

export default function BuilderStepper({ step, reached, review, boxSelected, onNavigate }) {
  const markerId = useId();
  return <nav className="gb-progress" aria-label="Gift builder steps"><ol>
    {BUILDER_STEPS.map((item, index) => {
      const current = !review && step === index;
      const complete = !current && (review || index < reached);
      return <li key={item.id} className={`${current ? 'is-current' : ''} ${complete ? 'is-complete' : ''}`}>
        <button type="button" aria-label={item.title} aria-current={current ? 'step' : undefined} aria-describedby={complete ? `${markerId}-${index}` : undefined} disabled={index > 0 && !boxSelected} onClick={() => onNavigate(index)}>
          <span className="gb-step-marker">{complete ? <Check key="check" size={17} aria-hidden="true"/> : index + 1}</span>
          {current && <span className="gb-step-name">{item.title}</span>}
          {complete && <span className="sr-only" id={`${markerId}-${index}`}>Completed</span>}
        </button>
      </li>;
    })}
  </ol></nav>;
}
