import React, { useMemo } from 'react';
import type { ScheduleBlock } from '../types';
import { DAYS_OF_WEEK, minutesToTime, timeToMinutes } from '../utils';

interface TimeGridCalendarProps {
  blocks: ScheduleBlock[];
  candidateBlocks?: ScheduleBlock[];
  editable?: boolean;
  showCandidateLane?: boolean;
  onMoveBlock?: (block: ScheduleBlock, dayOfWeek: string, startTime: string) => void;
  onRemoveBlock?: (blockId: string) => void;
  onBlockCompletion?: (blockId: string, completed: boolean) => void;
}

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const SLOT_MINUTES = 15;
const HOUR_HEIGHT = 64;

function clampStart(start: number, duration: number): number {
  return Math.max(DAY_START, Math.min(start, DAY_END - duration));
}

function formatHour(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${suffix}`;
}

const TimeGridCalendar: React.FC<TimeGridCalendarProps> = ({
  blocks,
  candidateBlocks = [],
  editable = false,
  showCandidateLane = false,
  onMoveBlock,
  onRemoveBlock,
  onBlockCompletion,
}) => {
  const timeLabels = useMemo(() => {
    const labels: number[] = [];
    for (let minutes = DAY_START; minutes <= DAY_END; minutes += 60) labels.push(minutes);
    return labels;
  }, []);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, dayOfWeek: string) => {
    if (!editable || !onMoveBlock) return;
    event.preventDefault();
    const blockId = event.dataTransfer.getData('blockId');
    const candidateId = event.dataTransfer.getData('candidateId');
    const block = blocks.find(item => item.id === blockId) || candidateBlocks.find(item => item.id === candidateId);
    if (!block) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const minutesFromTop = ((event.clientY - bounds.top) / HOUR_HEIGHT) * 60 + DAY_START;
    const snappedStart = Math.round(minutesFromTop / SLOT_MINUTES) * SLOT_MINUTES;
    onMoveBlock(block, dayOfWeek, minutesToTime(clampStart(snappedStart, block.durationMinutes)));
  };

  return (
    <>
      <div className="time-grid-calendar">
        <div className="time-grid-axis" aria-hidden="true">
          <div className="time-grid-axis-spacer" />
          {timeLabels.slice(0, -1).map(minutes => (
            <div key={minutes} className="time-grid-time-label" style={{ top: `${((minutes - DAY_START) / 60) * HOUR_HEIGHT}px` }}>
              {formatHour(minutes)}
            </div>
          ))}
        </div>
        <div className="time-grid-days">
          {DAYS_OF_WEEK.map(day => {
            const dayBlocks = blocks
              .filter(block => block.dayOfWeek === day)
              .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
            return (
              <div
                key={day}
                className="time-grid-day"
                onDragOver={editable ? event => event.preventDefault() : undefined}
                onDrop={editable ? event => handleDrop(event, day) : undefined}
              >
                <h5 className="time-grid-day-header">{day}</h5>
                <div className="time-grid-lane" style={{ height: `${((DAY_END - DAY_START) / 60) * HOUR_HEIGHT}px` }}>
                  {timeLabels.slice(0, -1).map(minutes => (
                    <div key={minutes} className="time-grid-hour-line" style={{ top: `${((minutes - DAY_START) / 60) * HOUR_HEIGHT}px` }} />
                  ))}
                  {dayBlocks.map(block => {
                    const start = timeToMinutes(block.startTime);
                    const top = ((start - DAY_START) / 60) * HOUR_HEIGHT;
                    const height = Math.max((block.durationMinutes / 60) * HOUR_HEIGHT, 28);
                    return (
                      <div
                        key={block.id}
                        draggable={editable}
                        onDragStart={editable ? event => event.dataTransfer.setData('blockId', block.id) : undefined}
                        className={`time-grid-block ${block.completed ? 'completed' : ''}`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        data-priority={block.priority}
                        onClick={onBlockCompletion ? () => onBlockCompletion(block.id, !block.completed) : undefined}
                      >
                        <div className="time-grid-block-heading">
                          <strong>{block.taskCode}</strong>
                          {editable && onRemoveBlock && (
                            <button type="button" className="time-grid-remove" aria-label={`Remove ${block.taskCode}`} onClick={event => { event.stopPropagation(); onRemoveBlock(block.id); }}>
                              x
                            </button>
                          )}
                        </div>
                        {block.objectiveCode && <span className="time-grid-meta">{block.objectiveCode}</span>}
                        <span className="time-grid-meta">{block.startTime} - {block.endTime}</span>
                        {block.isSporadic && <span className="time-grid-badge">Sporadic</span>}
                        {onBlockCompletion && (
                          <label className="time-grid-check" onClick={event => event.stopPropagation()}>
                            <input type="checkbox" checked={block.completed} onChange={event => onBlockCompletion(block.id, event.target.checked)} />
                            Done
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {showCandidateLane && (
        <section className="candidate-lane" onDragOver={event => event.preventDefault()} onDrop={event => {
          const blockId = event.dataTransfer.getData('blockId');
          if (blockId && onRemoveBlock) onRemoveBlock(blockId);
        }}>
          <h5>Candidate lane</h5>
          <div className="candidate-blocks">
            {candidateBlocks.map(block => (
              <div key={block.id} draggable className="candidate-block" data-priority={block.priority} onDragStart={event => event.dataTransfer.setData('candidateId', block.id)}>
                <strong>{block.taskCode}</strong>
                <small>{block.durationMinutes} min</small>
              </div>
            ))}
            {candidateBlocks.length === 0 && <small className="text-muted">Removed blocks stay here until you place them again.</small>}
          </div>
        </section>
      )}
    </>
  );
};

export default TimeGridCalendar;
