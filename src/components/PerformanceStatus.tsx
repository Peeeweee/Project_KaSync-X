import { usePerformanceFeedback } from '../hooks/usePerformanceFeedback';

export function PerformanceStatus() {
  const feedback = usePerformanceFeedback();
  return <span className="kasync-performance-status" data-state={feedback.state}
    role="status" aria-live="off" aria-label={`${feedback.label}. ${feedback.hint}`} title={feedback.hint}>
    <span className="kasync-performance-status-mark" aria-hidden="true" />
    {feedback.label}
  </span>;
}
