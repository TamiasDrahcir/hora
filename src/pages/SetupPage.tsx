import React, { useMemo, useState } from 'react';
import { Card, Button, Form, Container, Row, Col } from 'react-bootstrap';
import { v4 as uuidv4 } from 'uuid';
import type { Task, ScheduleBlock, WeeklySchedule } from '../types';
import { isRigid, timeToMinutes, minutesToTime } from '../utils';
import { parseTaskScript, tasksToScript, type ScriptError } from '../taskScript';
import { scheduleWeek } from '../scheduler';
import { resolveAvailability, totalAvailabilityHours, DEFAULT_AVAILABILITY } from '../availability';
import { planningWeekStart } from '../revenue';
import TimeGridCalendar from '../components/TimeGridCalendar';
import NotificationSettings from '../components/NotificationSettings';
import type { PushState } from '../push';

interface SetupPageProps {
  tasks: Task[];
  scriptText: string;
  schedule: WeeklySchedule | null;
  availability: string;
  notificationsEnabled: boolean;
  push: PushState;
  onTasksUpdate: (tasks: Task[]) => void;
  onScriptChange: (script: string) => void;
  onAvailabilityChange: (availability: string) => void;
  onNotificationsChange: (enabled: boolean) => void;
  onScheduleUpdate: (schedule: WeeklySchedule | null) => void;
  onNavigate: (view: string) => void;
}

const SCRIPT_PLACEHOLDER = `# One block per task. Example:

Lecture (CSCE222-LEC) ! *
{MWF}1020-1110

Packback (POLS206-PB10) !
REQ 3 BY F2359
Read : 1
Write : 1
`;

const SYNTAX_HELP = `TaskName (SECTION-CODE) [!] [* | YYMMDD]
  !      important        *  recurring
  YYMMDD recurring until date (e.g. 261231)

Flexible task body:
  REQ <hours> BY <day><time>   e.g. REQ 5 BY F2359 (BY optional)
  <Subobjective> : <hours>     optional; defaults to 1h Subobj1..N
                               unassigned hours become Buffer

Rigid task body (fixed timeslots):
  {<days>}<start>-<end>        e.g. {MWF}1020-1110

Any task:
  DESC: <text>                 optional note shown when hovering a block

Days: M T W R F S U (Mon..Sun)   Times: military (e.g. 2230)
Lines starting with # are comments.`;

const SetupPage: React.FC<SetupPageProps> = ({
  tasks,
  scriptText,
  schedule,
  availability: availabilityText,
  notificationsEnabled,
  push,
  onTasksUpdate,
  onScriptChange,
  onAvailabilityChange,
  onNotificationsChange,
  onScheduleUpdate,
  onNavigate,
}) => {
  const [errors, setErrors] = useState<ScriptError[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [showSyntax, setShowSyntax] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);

  // An invalid availability entry falls back to the default so the calendar and scheduler stay usable
  const resolvedAvailability = useMemo(() => resolveAvailability(availabilityText), [availabilityText]);
  const availability = resolvedAvailability.availability;
  const availableHours = totalAvailabilityHours(availability);

  // Prefill the editor from existing tasks when there is no saved script yet
  const effectiveScript = scriptText || (tasks.length > 0 ? tasksToScript(tasks) : '');

  const handleCompile = () => {
    const result = parseTaskScript(effectiveScript, tasks);
    setErrors(result.errors);

    if (result.errors.length > 0) {
      setSummary(null);
      return;
    }

    onTasksUpdate(result.tasks);
    // The previous schedule no longer matches the compiled tasks
    onScheduleUpdate(null);
    const rigidCount = result.tasks.filter(t => isRigid(t.priority)).length;
    const flexible = result.tasks.filter(t => !isRigid(t.priority));
    const flexibleHours = flexible.reduce((sum, t) => sum + t.hoursRequired, 0);
    setSummary(
      `Compiled ${result.tasks.length} task${result.tasks.length !== 1 ? 's' : ''}: ` +
      `${rigidCount} rigid, ${flexible.length} flexible (${flexibleHours}h).`
    );
  };

  const handleGenerateSchedule = () => {
    setCalendarNotice(null);
    onScheduleUpdate(scheduleWeek(tasks, availability));
  };

  // Discards manual edits and returns to the scheduler's proposal
  const handleResetToProposed = handleGenerateSchedule;

  // Before generating, only rigid timeslots are on the calendar; afterwards it shows the proposed schedule
  const rigidBlocks: ScheduleBlock[] = useMemo(() => {
    const blocks: ScheduleBlock[] = [];
    tasks.filter(t => isRigid(t.priority) && !t.completed).forEach(task => {
      (task.timeslots || []).forEach(slot => {
        blocks.push({
          id: `preview-${task.id}-${slot.id}`,
          taskId: task.id,
          taskCode: task.code,
          taskName: task.name,
          priority: task.priority,
          blockType: 'floater',
          dayOfWeek: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          durationMinutes: timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime),
          completed: false,
          isSporadic: false,
          description: task.description,
        });
      });
    });
    return blocks;
  }, [tasks]);

  // Flexible work waits in the candidate lane; once a schedule exists, only what couldn't be placed remains
  const candidateBlocks: ScheduleBlock[] = useMemo(() => {
    const placedObjectiveIds = new Set(
      (schedule?.blocks || []).filter(b => b.blockType === 'anchor' && b.objectiveId).map(b => b.objectiveId)
    );
    const placedTaskIds = new Set(
      (schedule?.blocks || []).filter(b => b.blockType === 'anchor' && !b.objectiveId).map(b => b.taskId)
    );

    const result: ScheduleBlock[] = [];
    tasks.filter(t => !isRigid(t.priority) && !t.completed).forEach(task => {
      let subItems = task.objectives.map(obj => ({
        id: obj.id,
        label: obj.name,
        hours: obj.hoursRequired,
        isBuffer: obj.name === 'Buffer',
      }));

      if (schedule) {
        // Buffer is never scheduled, so it doesn't count as unplaced
        subItems = subItems.filter(item => !item.isBuffer && !placedObjectiveIds.has(item.id));
        if (task.objectives.length === 0 ? placedTaskIds.has(task.id) : subItems.length === 0) return;
      }

      const hours = task.objectives.length === 0
        ? task.hoursRequired
        : subItems.reduce((sum, item) => sum + item.hours, 0);

      result.push({
        id: `candidate-${task.id}`,
        taskId: task.id,
        taskCode: task.code,
        taskName: task.name,
        priority: task.priority,
        blockType: 'anchor',
        dayOfWeek: '',
        startTime: '00:00',
        endTime: '00:00',
        durationMinutes: hours * 60,
        completed: false,
        isSporadic: false,
        description: task.description,
        subItems,
      });
    });
    return result;
  }, [tasks, schedule]);

  const currentBlocks = schedule ? schedule.blocks : rigidBlocks;

  // Anything left in the lane after scheduling would be left out of execution
  const unplacedCount = candidateBlocks.reduce(
    (sum, block) => sum + (block.subItems && block.subItems.length > 0 ? block.subItems.filter(s => !s.isBuffer).length : 1),
    0
  );

  // Manual edits turn the current calendar into the schedule, so drags work before generating too
  const commitBlocks = (blocks: ScheduleBlock[]) => {
    const anchorHours = blocks.filter(b => b.blockType === 'anchor').reduce((sum, b) => sum + b.durationMinutes, 0) / 60;
    onScheduleUpdate({
      weekStartDate: schedule?.weekStartDate ?? planningWeekStart(new Date()),
      blocks,
      totalAvailableHours: availableHours,
      totalAnchorHours: anchorHours,
      totalObjectiveHours: anchorHours,
    });
  };

  // Abandoned blocks are disabled, so new work may take their slot
  const overlapsExisting = (day: string, startTime: string, durationMinutes: number, ignoreId?: string): boolean => {
    const start = timeToMinutes(startTime);
    const end = start + durationMinutes;
    return currentBlocks.some(
      b => b.id !== ignoreId && b.status !== 'abandoned' && b.dayOfWeek === day && start < timeToMinutes(b.endTime) && end > timeToMinutes(b.startTime)
    );
  };

  const handleMoveBlock = (block: ScheduleBlock, day: string, startTime: string) => {
    if (overlapsExisting(day, startTime, block.durationMinutes, block.id)) {
      setCalendarNotice('That spot overlaps another block.');
      return;
    }
    setCalendarNotice(null);
    const endTime = minutesToTime(timeToMinutes(startTime) + block.durationMinutes);
    commitBlocks(currentBlocks.map(b => (b.id === block.id ? { ...b, dayOfWeek: day, startTime, endTime } : b)));
  };

  const handlePlaceCandidate = (candidate: ScheduleBlock, subItemId: string | undefined, day: string, startTime: string) => {
    const task = tasks.find(t => t.id === candidate.taskId);
    if (!task) return;
    const objective = subItemId ? task.objectives.find(o => o.id === subItemId) : undefined;
    const durationMinutes = (objective ? objective.hoursRequired : task.hoursRequired) * 60;

    if (overlapsExisting(day, startTime, durationMinutes)) {
      setCalendarNotice('That spot overlaps another block.');
      return;
    }
    setCalendarNotice(null);

    commitBlocks([
      ...currentBlocks,
      {
        id: `block-${uuidv4()}`,
        taskId: task.id,
        taskCode: task.code,
        taskName: task.name,
        objectiveId: objective?.id,
        objectiveCode: objective?.code,
        objectiveName: objective?.name,
        priority: task.priority,
        blockType: 'anchor',
        dayOfWeek: day,
        startTime,
        endTime: minutesToTime(timeToMinutes(startTime) + durationMinutes),
        durationMinutes,
        completed: false,
        isSporadic: false,
        description: objective?.description || task.description,
      },
    ]);
  };

  // Unscheduling returns a block to the candidate lane; rigid blocks are fixed
  const handleRemoveBlock = (blockId: string) => {
    const block = currentBlocks.find(b => b.id === blockId);
    if (!block || block.blockType !== 'anchor') return;
    setCalendarNotice(null);
    commitBlocks(currentBlocks.filter(b => b.id !== blockId));
  };

  return (
    <Container fluid className="fade-in">
      <h1 className="page-title">Setup Your Tasks</h1>

      <Row>
        <Col lg={5} className="mb-4">
          <Card className="card-stoic script-editor-card">
            <Card.Body className="d-flex flex-column">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Task Script</h6>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="btn-stoic"
                  onClick={() => setShowSyntax(s => !s)}
                >
                  {showSyntax ? 'Hide Syntax' : 'Syntax'}
                </Button>
              </div>
              {showSyntax && <pre className="script-syntax-help">{SYNTAX_HELP}</pre>}
              <Form.Control
                as="textarea"
                className="script-editor"
                spellCheck={false}
                value={effectiveScript}
                placeholder={SCRIPT_PLACEHOLDER}
                onChange={(e) => {
                  onScriptChange(e.target.value);
                  setSummary(null);
                }}
              />
              {errors.length > 0 && (
                <div className="script-errors mt-2">
                  {errors.map((err, i) => (
                    <div key={i}>
                      {err.line > 0 ? `Line ${err.line}: ` : ''}{err.message}
                    </div>
                  ))}
                </div>
              )}
              {summary && <div className="script-summary mt-2">{summary}</div>}
              <div className="d-flex justify-content-end mt-3">
                <Button className="btn-stoic" onClick={handleCompile}>
                  Compile
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7} className="mb-4">
          <Card className="card-stoic">
            <Card.Body className="d-flex flex-column">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <h6 className="mb-0">Weekly Calendar</h6>
                <NotificationSettings enabled={notificationsEnabled} push={push} onChange={onNotificationsChange} />
              </div>
              <div className="availability-config mb-2">
                <div className="d-flex align-items-center gap-2">
                  <Form.Label className="mb-0 small text-nowrap">Available hours</Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    spellCheck={false}
                    value={availabilityText}
                    placeholder="{MTWRF}0900-1800, {SU}1000-1400"
                    isInvalid={resolvedAvailability.errors.length > 0}
                    onChange={(e) => onAvailabilityChange(e.target.value)}
                  />
                  <small className="text-muted text-nowrap">{availableHours}h / week</small>
                </div>
                {resolvedAvailability.errors.length > 0 && (
                  <div className="script-errors mt-1">
                    {resolvedAvailability.errors.map((message, i) => <div key={i}>{message}</div>)}
                    <div>Using the default {DEFAULT_AVAILABILITY} until fixed.</div>
                  </div>
                )}
              </div>
              <div className="calendar-with-lane">
                <TimeGridCalendar
                  blocks={currentBlocks}
                  candidateBlocks={candidateBlocks}
                  tasks={tasks}
                  availability={availability}
                  editable
                  showCandidateLane
                  onMoveBlock={handleMoveBlock}
                  onPlaceCandidate={handlePlaceCandidate}
                  onRemoveBlock={handleRemoveBlock}
                />
              </div>
              {calendarNotice && <div className="script-errors mt-2">{calendarNotice}</div>}
              <div className="d-flex justify-content-end align-items-center gap-2 mt-3">
                {schedule ? (
                  <>
                    {unplacedCount > 0 && (
                      <small className="text-muted me-auto">
                        {unplacedCount} item{unplacedCount !== 1 ? 's' : ''} still in the candidate lane won't be executed.
                      </small>
                    )}
                    <Button
                      variant="outline-secondary"
                      className="btn-stoic"
                      onClick={handleResetToProposed}
                    >
                      Reset to Proposed
                    </Button>
                    <Button
                      className="btn-stoic"
                      onClick={() => onNavigate('execution')}
                      disabled={schedule.blocks.length === 0}
                    >
                      Confirmed
                    </Button>
                  </>
                ) : (
                  <Button
                    className="btn-stoic"
                    onClick={handleGenerateSchedule}
                    disabled={tasks.length === 0}
                  >
                    Generate Schedule
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default SetupPage;
