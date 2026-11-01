import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScheduleBlock, Task } from '../types';
import { DAYS_OF_WEEK, PRIORITY_LABELS, minutesToTime, timeToMinutes, formatDurationHours, isRigid } from '../utils';
import type { Availability, TimeWindow } from '../availability';

export type BlockAction = 'toggle-complete' | 'toggle-mothball' | 'abandon';

interface TimeGridCalendarProps {
  blocks: ScheduleBlock[];
  candidateBlocks?: ScheduleBlock[];
  tasks?: Task[]; // lets hovering a block show the full task specification
  availability?: Availability;
  editable?: boolean;
  showCandidateLane?: boolean;
  showBlockActions?: boolean; // completion / mothball / abandon buttons on flexible blocks
  hourHeight?: number;
  currentTime?: { day: string; minutes: number }; // draws a "now" line
  onMoveBlock?: (block: ScheduleBlock, dayOfWeek: string, startTime: string) => void;
  onPlaceCandidate?: (candidate: ScheduleBlock, subItemId: string | undefined, dayOfWeek: string, startTime: string) => void;
  onRemoveBlock?: (blockId: string) => void;
  onBlockAction?: (blockId: string, action: BlockAction) => void;
}

const DEFAULT_RANGE: TimeWindow = { start: 8 * 60, end: 22 * 60 };
const SLOT_MINUTES = 15;

function formatHour(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${suffix}`;
}

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

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const CheckIcon = () => (
  <svg {...ICON_PROPS}><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
);

const MothballIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="2" y="3" width="12" height="3" rx="0.6" />
    <path d="M3.2 6v6.6c0 .3.2.4.4.4h8.8c.2 0 .4-.1.4-.4V6M6.5 9h3" />
  </svg>
);

const ReviveIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M2.6 2.8v3.4h3.4" />
    <path d="M3 6.2A5.4 5.4 0 1 1 2.8 9" />
  </svg>
);

const AbandonIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8.4c0 .3.3.6.6.6h5.6c.3 0 .6-.3.6-.6l.6-8.4M6.8 7v4M9.2 7v4" />
  </svg>
);

const TimeGridCalendar: React.FC<TimeGridCalendarProps> = ({
  blocks,
  candidateBlocks = [],
  tasks = [],
  availability,
  editable = false,
  showCandidateLane = false,
  showBlockActions = false,
  hourHeight = 64,
  currentTime,
  onMoveBlock,
  onPlaceCandidate,
  onRemoveBlock,
  onBlockAction,
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

  // Abandoned blocks are disabled: they can't be moved or removed
  const canEditBlock = (block: ScheduleBlock) =>
    editable && block.blockType === 'anchor' && block.status !== 'abandoned';

  const clampStart = (start: number, duration: number): number =>
    Math.max(range.start, Math.min(start, range.end - duration));

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
    if (block.status === 'abandoned') rows.push(['Status', 'Abandoned']);
    else if (block.status === 'mothballed') rows.push(['Status', 'Mothballed']);
    else if (block.completed) rows.push(['Status', 'Completed']);

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

  const renderActions = (block: ScheduleBlock) => {
    const mothballed = block.status === 'mothballed';
    const abandoned = block.status === 'abandoned';
    const completed = block.completed;

    const actions: Array<{
      action: BlockAction;
      label: string;
      icon: React.ReactNode;
      disabled: boolean;
      pressed?: boolean;
    }> = [
      {
        action: 'toggle-complete',
        label: completed ? 'Undo completion' : 'Mark complete',
        icon: <CheckIcon />,
        disabled: mothballed || abandoned,
        pressed: completed,
      },
      {
        action: 'toggle-mothball',
        label: mothballed ? 'Revive' : 'Mothball',
        icon: mothballed ? <ReviveIcon /> : <MothballIcon />,
        disabled: completed || abandoned,
      },
      {
        action: 'abandon',
        label: 'Abandon',
        icon: <AbandonIcon />,
        disabled: completed || abandoned,
      },
    ];

    return (
      <div
        className="time-grid-actions"
        // Keep the block tooltip from covering the button's own label
        onMouseEnter={() => setHover(null)}
        onMouseMove={event => { event.stopPropagation(); setHover(null); }}
      >
        {actions.map(item => (
          <button
            key={item.action}
            type="button"
            className={`time-grid-action ${item.pressed ? 'pressed' : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={item.pressed}
            disabled={item.disabled}
            onClick={event => { event.stopPropagation(); onBlockAction?.(block.id, item.action); }}
          >
            {item.icon}
          </button>
        ))}
      </div>
    );
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, dayOfWeek: string) => {
    if (!editable) return;
    event.preventDefault();

    const blockId = event.dataTransfer.getData('blockId');
    const candidateId = event.dataTransfer.getData('candidateId');
    const subItemId = event.dataTransfer.getData('subItemId') || undefined;
    const grabOffset = parseFloat(event.dataTransfer.getData('grabOffset')) || 0;

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerMinutes = ((event.clientY - bounds.top) / hourHeight) * 60 + range.start;
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
            <div key={minutes} className="time-grid-time-label" style={{ top: `${((minutes - range.start) / 60) * hourHeight}px` }}>
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
                  style={{ height: `${((range.end - range.start) / 60) * hourHeight}px` }}
                  onDragOver={editable ? event => event.preventDefault() : undefined}
                  onDrop={editable ? event => handleDrop(event, day) : undefined}
                >
                  {availability && unavailableSpans(availability[day] || [], range).map(span => (
                    <div
                      key={span.start}
                      className="time-grid-unavailable"
                      style={{
                        top: `${((span.start - range.start) / 60) * hourHeight}px`,
                        height: `${((span.end - span.start) / 60) * hourHeight}px`,
                      }}
                    />
                  ))}
                  {timeLabels.slice(0, -1).map(minutes => (
                    <div key={minutes} className="time-grid-hour-line" style={{ top: `${((minutes - range.start) / 60) * hourHeight}px` }} />
                  ))}
                  {dayBlocks.map(block => {
                    const start = timeToMinutes(block.startTime);
                    const top = ((start - range.start) / 60) * hourHeight;
                    const height = Math.max((block.durationMinutes / 60) * hourHeight, 28);
                    const movable = canEditBlock(block);
                    const hasActions = showBlockActions && block.blockType === 'anchor';
                    const statusClass = block.status === 'abandoned'
                      ? 'status-abandoned'
                      : block.status === 'mothballed'
                        ? 'status-mothballed'
                        : block.completed
                          ? 'status-completed'
                          : '';
                    return (
                      <div
                        key={block.id}
                        draggable={movable}
                        onDragStart={movable ? event => {
                          setHover(null);
                          const rect = event.currentTarget.getBoundingClientRect();
                          event.dataTransfer.setData('blockId', block.id);
                          event.dataTransfer.setData('grabOffset', String(((event.clientY - rect.top) / hourHeight) * 60));
                        } : undefined}
                        onMouseEnter={event => setHover({ block, x: event.clientX, y: event.clientY })}
                        onMouseMove={event => setHover({ block, x: event.clientX, y: event.clientY })}
                        onMouseLeave={() => setHover(null)}
                        className={`time-grid-block ${statusClass} ${movable ? 'movable' : ''} ${hasActions ? 'has-actions' : ''}`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        data-priority={block.priority}
                      >
                        <div className="time-grid-block-body">
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
                        </div>
                        {hasActions && renderActions(block)}
                      </div>
                    );
                  })}
                  {currentTime && currentTime.day === day && currentTime.minutes >= range.start && currentTime.minutes <= range.end && (
                    <div
                      className="time-grid-now"
                      style={{ top: `${((currentTime.minutes - range.start) / 60) * hourHeight}px` }}
                    />
                  )}
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
