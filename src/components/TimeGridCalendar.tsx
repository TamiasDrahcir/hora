import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScheduleBlock, Task } from '../types';
import { DAYS_OF_WEEK, minutesToTime, timeToMinutes, formatDurationHours, isRigid } from '../utils';
import type { Availability, TimeWindow } from '../availability';

interface TimeGridCalendarProps {
  blocks: ScheduleBlock[];
  candidateBlocks?: ScheduleBlock[];
  tasks?: Task[]; // lets hovering a block show the full task specification
  availability?: Availability;
  editable?: boolean;
  showCandidateLane?: boolean;
  onMoveBlock?: (block: ScheduleBlock, dayOfWeek: string, startTime: string) => void;
  onPlaceCandidate?: (candidate: ScheduleBlock, subItemId: string | undefined, dayOfWeek: string, startTime: string) => void;
  onRemoveBlock?: (blockId: string) => void;
  onBlockCompletion?: (blockId: string, completed: boolean) => void;
}

const DEFAULT_RANGE: TimeWindow = { start: 8 * 60, end: 22 * 60 };
const SLOT_MINUTES = 15;
const HOUR_HEIGHT = 64;

function formatHour(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${suffix}`;
}

const PRIORITY_LABELS: Record<string, string> = {
  earth: 'Earth (rigid, important)',
  water: 'Water (flexible, important)',
  fire: 'Fire (rigid, less important)',
  air: 'Air (flexible, less important)',
};

function formatRecurrence(task: Task): string | null {
  if (task.recurrenceEnd) return `Weekly until ${task.recurrenceEnd}`;
  if (task.recurring) return 'Weekly';
  return null;
}

// Parts of [range] not covered by any availability window
function unavailableSpans(windows: TimeWindow[], range: TimeWindow): TimeWindow[] {
  const spans: TimeWindow[] = [];
  let cursor = range.start;
  for (const window of [...windows].sort((a, b) => a.start - b.start)) {
    if (window.start > cursor) spans.push({ start: cursor, end: Math.min(window.start, range.end) });
    cursor = Math.max(cursor, window.end);
  }
  if (cursor < range.end) spans.push({ start: cursor, end: range.end });
  return spans.filter(span => span.end > span.start);
}

const TimeGridCalendar: React.FC<TimeGridCalendarProps> = ({
  blocks,
  candidateBlocks = [],
  tasks = [],
  availability,
  editable = false,
  showCandidateLane = false,
  onMoveBlock,
  onPlaceCandidate,
  onRemoveBlock,
  onBlockCompletion,
}) => {
  const [hover, setHover] = useState<{ block: ScheduleBlock; x: number; y: number } | null>(null);

  // The visible hours follow availability, widened to keep every placed block in view
  const range = useMemo<TimeWindow>(() => {
    const starts: number[] = [];
    const ends: number[] = [];
    Object.values(availability || {}).flat().forEach(window => {
      starts.push(window.start);
      ends.push(window.end);
    });
    blocks.forEach(block => {
      starts.push(timeToMinutes(block.startTime));
      ends.push(timeToMinutes(block.endTime));
    });

    if (starts.length === 0) return DEFAULT_RANGE;
    const start = Math.floor(Math.min(...starts) / 60) * 60;
    const end = Math.min(Math.ceil(Math.max(...ends) / 60) * 60, 24 * 60);
    return { start, end: Math.max(end, start + 60) };
  }, [availability, blocks]);

  const timeLabels = useMemo(() => {
    const labels: number[] = [];
    for (let minutes = range.start; minutes <= range.end; minutes += 60) labels.push(minutes);
    return labels;
  }, [range]);

  const canEditBlock = (block: ScheduleBlock) => editable && block.blockType === 'anchor';

  // Use the latest copy of the hovered block so the tooltip vanishes if it is moved away or removed
  const hovered = hover ? blocks.find(item => item.id === hover.block.id) : undefined;

  const renderTooltip = (block: ScheduleBlock, x: number, y: number) => {
    const task = tasks.find(item => item.id === block.taskId);
    const rigid = isRigid(block.priority);
    const description = task?.description || block.description;
    const recurrence = task ? formatRecurrence(task) : null;

    const rows: Array<[string, string]> = [
      ['When', `${block.dayOfWeek} ${block.startTime} - ${block.endTime}`],
      ['Length', `${block.durationMinutes} min (${formatDurationHours(block.durationMinutes)})`],
      ['Type', PRIORITY_LABELS[block.priority] || block.priority],
    ];
    if (block.objectiveName) {
      const objective = task?.objectives.find(item => item.id === block.objectiveId);
      rows.push(['Subobjective', `${block.objectiveName}${objective ? ` (${objective.hoursRequired}h)` : ''}`]);
    }
    if (!rigid && task) {
      rows.push(['Task total', `${task.hoursRequired}h`]);
      if (task.deadline) rows.push(['Deadline', task.deadline]);
    }
    if (recurrence) rows.push(['Repeats', recurrence]);
    if (block.completed) rows.push(['Status', 'Completed']);

    // Keep the tooltip on screen: flip left/up when near the right/bottom edges
    const flipX = x > window.innerWidth - 300;
    const flipY = y > window.innerHeight * 0.6;

    return (
      <div
        className="time-grid-tooltip"
        role="tooltip"
        style={{
          left: flipX ? x - 14 : x + 14,
          top: flipY ? y - 14 : y + 14,
          transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`,
        }}
      >
        <div className="time-grid-tooltip-title">
          <strong>{block.objectiveCode || block.taskCode}</strong>
          <span>{block.taskName}</span>
        </div>
        <dl>
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
        {description && <p className="time-grid-tooltip-description">{description}</p>}
      </div>
    );
  };

  const clampStart = (start: number, duration: number): number =>
    Math.max(range.start, Math.min(start, range.end - duration));

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, dayOfWeek: string) => {
    if (!editable) return;
    event.preventDefault();

    const blockId = event.dataTransfer.getData('blockId');
    const candidateId = event.dataTransfer.getData('candidateId');
    const subItemId = event.dataTransfer.getData('subItemId') || undefined;
    const grabOffset = parseFloat(event.dataTransfer.getData('grabOffset')) || 0;

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerMinutes = ((event.clientY - bounds.top) / HOUR_HEIGHT) * 60 + range.start;
    const snappedStart = Math.round((pointerMinutes - grabOffset) / SLOT_MINUTES) * SLOT_MINUTES;

    if (blockId) {
      const block = blocks.find(item => item.id === blockId);
      if (!block || !canEditBlock(block) || !onMoveBlock) return;
      onMoveBlock(block, dayOfWeek, minutesToTime(clampStart(snappedStart, block.durationMinutes)));
      return;
    }

    const candidate = candidateBlocks.find(item => item.id === candidateId);
    if (!candidate || !onPlaceCandidate) return;
    const subItem = candidate.subItems?.find(item => item.id === subItemId);
    const duration = subItem ? subItem.hours * 60 : candidate.durationMinutes;
    onPlaceCandidate(candidate, subItemId, dayOfWeek, minutesToTime(clampStart(snappedStart, duration)));
  };

  return (
    <>
      <div className="time-grid-calendar">
        <div className="time-grid-axis" aria-hidden="true">
          <div className="time-grid-axis-spacer" />
          {timeLabels.slice(0, -1).map(minutes => (
            <div key={minutes} className="time-grid-time-label" style={{ top: `${((minutes - range.start) / 60) * HOUR_HEIGHT}px` }}>
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
              <div key={day} className="time-grid-day">
                <h5 className="time-grid-day-header">{day}</h5>
                <div
                  className="time-grid-lane"
                  style={{ height: `${((range.end - range.start) / 60) * HOUR_HEIGHT}px` }}
                  onDragOver={editable ? event => event.preventDefault() : undefined}
                  onDrop={editable ? event => handleDrop(event, day) : undefined}
                >
                  {availability && unavailableSpans(availability[day] || [], range).map(span => (
                    <div
                      key={span.start}
                      className="time-grid-unavailable"
                      style={{
                        top: `${((span.start - range.start) / 60) * HOUR_HEIGHT}px`,
                        height: `${((span.end - span.start) / 60) * HOUR_HEIGHT}px`,
                      }}
                    />
                  ))}
                  {timeLabels.slice(0, -1).map(minutes => (
                    <div key={minutes} className="time-grid-hour-line" style={{ top: `${((minutes - range.start) / 60) * HOUR_HEIGHT}px` }} />
                  ))}
                  {dayBlocks.map(block => {
                    const start = timeToMinutes(block.startTime);
                    const top = ((start - range.start) / 60) * HOUR_HEIGHT;
                    const height = Math.max((block.durationMinutes / 60) * HOUR_HEIGHT, 28);
                    const movable = canEditBlock(block);
                    return (
                      <div
                        key={block.id}
                        draggable={movable}
                        onDragStart={movable ? event => {
                          setHover(null);
                          const rect = event.currentTarget.getBoundingClientRect();
                          event.dataTransfer.setData('blockId', block.id);
                          event.dataTransfer.setData('grabOffset', String(((event.clientY - rect.top) / HOUR_HEIGHT) * 60));
                        } : undefined}
                        onMouseEnter={event => setHover({ block, x: event.clientX, y: event.clientY })}
                        onMouseMove={event => setHover({ block, x: event.clientX, y: event.clientY })}
                        onMouseLeave={() => setHover(null)}
                        className={`time-grid-block ${block.completed ? 'completed' : ''} ${movable ? 'movable' : ''}`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        data-priority={block.priority}
                        onClick={onBlockCompletion ? () => onBlockCompletion(block.id, !block.completed) : undefined}
                      >
                        <div className="time-grid-block-heading">
                          <strong>{block.taskCode}</strong>
                          {movable && onRemoveBlock && (
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
        <section
          className="candidate-lane"
          onDragOver={editable ? event => event.preventDefault() : undefined}
          onDrop={event => {
            const blockId = event.dataTransfer.getData('blockId');
            if (blockId && onRemoveBlock) onRemoveBlock(blockId);
          }}
        >
          <h5>Candidate lane</h5>
          <div className="candidate-blocks">
            {candidateBlocks.map(block => {
              const hasSubItems = !!block.subItems && block.subItems.length > 0;
              return (
                <div
                  key={block.id}
                  // Tasks with subobjectives are scheduled through their sub-blocks; only whole tasks drag as one
                  draggable={editable && !hasSubItems}
                  className={`candidate-block ${editable && !hasSubItems ? 'movable' : ''}`}
                  data-priority={block.priority}
                  onDragStart={editable && !hasSubItems ? event => event.dataTransfer.setData('candidateId', block.id) : undefined}
                >
                  <div className="candidate-block-header">
                    <strong>{block.taskCode}</strong>
                    <small>{formatDurationHours(block.durationMinutes)}</small>
                  </div>
                  {hasSubItems && (
                    <div className="candidate-sub-blocks">
                      {block.subItems!.map(sub => {
                        const draggable = editable && !sub.isBuffer;
                        return (
                          <div
                            key={sub.id}
                            draggable={draggable}
                            className={`candidate-sub-block ${sub.isBuffer ? 'buffer' : ''} ${draggable ? 'movable' : ''}`}
                            style={{ minHeight: `${Math.max(sub.hours * 28, 24)}px` }}
                            onDragStart={draggable ? event => {
                              event.dataTransfer.setData('candidateId', block.id);
                              event.dataTransfer.setData('subItemId', sub.id);
                            } : undefined}
                          >
                            <span>{sub.label}</span>
                            <span>{parseFloat(sub.hours.toFixed(2))}h</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {candidateBlocks.length === 0 && <small className="text-muted">Flexible tasks appear here until scheduled.</small>}
          </div>
        </section>
      )}
      {hovered && hover && createPortal(renderTooltip(hovered, hover.x, hover.y), document.body)}
    </>
  );
};

export default TimeGridCalendar;
