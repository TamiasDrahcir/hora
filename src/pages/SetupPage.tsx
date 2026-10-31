import React, { useMemo, useState } from 'react';
import { Card, Button, Form, Container, Row, Col } from 'react-bootstrap';
import type { Task, ScheduleBlock, WeeklySchedule } from '../types';
import { isRigid, timeToMinutes } from '../utils';
import { parseTaskScript, tasksToScript, type ScriptError } from '../taskScript';
import { scheduleWeek } from '../scheduler';
import TimeGridCalendar from '../components/TimeGridCalendar';

interface SetupPageProps {
  tasks: Task[];
  scriptText: string;
  schedule: WeeklySchedule | null;
  availableHoursPerDay: number;
  onTasksUpdate: (tasks: Task[]) => void;
  onScriptChange: (script: string) => void;
  onScheduleUpdate: (schedule: WeeklySchedule | null) => void;
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

Days: M T W R F S U (Mon..Sun)   Times: military (e.g. 2230)
Lines starting with # are comments.`;

const SetupPage: React.FC<SetupPageProps> = ({
  tasks,
  scriptText,
  schedule,
  availableHoursPerDay,
  onTasksUpdate,
  onScriptChange,
  onScheduleUpdate,
}) => {
  const [errors, setErrors] = useState<ScriptError[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [showSyntax, setShowSyntax] = useState(false);

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
    onScheduleUpdate(scheduleWeek(tasks, availableHoursPerDay * 5));
  };

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
              <h6 className="mb-2">Weekly Calendar</h6>
              <div className="calendar-with-lane">
                <TimeGridCalendar
                  blocks={schedule ? schedule.blocks : rigidBlocks}
                  candidateBlocks={candidateBlocks}
                  showCandidateLane
                />
              </div>
              <div className="d-flex justify-content-end mt-3">
                <Button
                  className="btn-stoic"
                  onClick={handleGenerateSchedule}
                  disabled={tasks.length === 0}
                >
                  Generate Schedule
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default SetupPage;
