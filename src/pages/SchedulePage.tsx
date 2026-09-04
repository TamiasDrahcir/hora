import React, { useState, useMemo } from 'react';
import { Card, Button, Container, Table, Form } from 'react-bootstrap';
import type { Task, ScheduleBlock, WeeklySchedule, AvailabilityInterval } from '../types';
import { scheduleWeek } from '../scheduler';
import { DAYS_OF_WEEK, minutesToTime, timeToMinutes } from '../utils';
import TimeGridCalendar from '../components/TimeGridCalendar';

interface SchedulePageProps {
  tasks: Task[];
  schedule: WeeklySchedule | null;
  availableHoursPerDay: number;
  onScheduleUpdate: (schedule: WeeklySchedule) => void;
  onNavigate: (view: string) => void;
  onTasksUpdate: (tasks: Task[]) => void;
}

const SchedulePage: React.FC<SchedulePageProps> = ({
  tasks,
  schedule,
  onScheduleUpdate,
  onNavigate,
}) => {
  const [availability, setAvailability] = useState<AvailabilityInterval[]>(
    schedule?.availability || DAYS_OF_WEEK.slice(0, 5).map(day => ({ dayOfWeek: day, startTime: '09:00', endTime: '13:00' }))
  );
  const [candidateBlocks, setCandidateBlocks] = useState<ScheduleBlock[]>([]);
  const totalAvailableHours = availability.reduce((sum, interval) => sum + (timeToMinutes(interval.endTime) - timeToMinutes(interval.startTime)) / 60, 0);

  const generatedSchedule = useMemo(() => {
    if (!schedule) {
      return scheduleWeek(tasks, totalAvailableHours, availability);
    }
    return schedule;
  }, [tasks, schedule, totalAvailableHours, availability]);

  const handleGenerateSchedule = () => {
    const newSchedule = scheduleWeek(tasks, totalAvailableHours, availability);
    onScheduleUpdate(newSchedule);
  };

  const handleRemoveBlock = (blockId: string) => {
    const removed = generatedSchedule.blocks.find(block => block.id === blockId);
    const updatedBlocks = generatedSchedule.blocks.filter(b => b.id !== blockId);
    if (removed) setCandidateBlocks(current => [...current, removed]);
    onScheduleUpdate({
      ...generatedSchedule,
      blocks: updatedBlocks,
    });
  };

  const handleMoveBlock = (block: ScheduleBlock, dayOfWeek: string, startTime: string) => {
    const endTime = minutesToTime(timeToMinutes(startTime) + block.durationMinutes);
    const overlaps = generatedSchedule.blocks.some(other =>
      other.id !== block.id &&
      other.dayOfWeek === dayOfWeek &&
      timeToMinutes(startTime) < timeToMinutes(other.endTime) &&
      timeToMinutes(endTime) > timeToMinutes(other.startTime)
    );
    if (overlaps) return;

    const inCandidates = candidateBlocks.some(candidate => candidate.id === block.id);
    const movedBlock = { ...block, dayOfWeek, startTime, endTime };
    onScheduleUpdate({
      ...generatedSchedule,
      blocks: inCandidates
        ? [...generatedSchedule.blocks, movedBlock]
        : generatedSchedule.blocks.map(item => item.id === block.id ? movedBlock : item),
    });
    if (inCandidates) setCandidateBlocks(current => current.filter(candidate => candidate.id !== block.id));
  };


  return (
    <Container className="fade-in">
      <h1 className="page-title">Weekly Schedule</h1>

      <div className="schedule-settings mb-4">
        <div>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Schedule Settings</h6>
              <Form.Group className="mb-3">
                <Form.Label>Effective availability intervals</Form.Label>
                {availability.map((interval, index) => (
                  <div className="availability-row" key={`${interval.dayOfWeek}-${index}`}>
                    <Form.Select value={interval.dayOfWeek} onChange={e => setAvailability(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, dayOfWeek: e.target.value } : item))}>
                      {DAYS_OF_WEEK.map(day => <option key={day}>{day}</option>)}
                    </Form.Select>
                    <Form.Control type="time" value={interval.startTime} onChange={e => setAvailability(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: e.target.value } : item))} />
                    <Form.Control type="time" value={interval.endTime} onChange={e => setAvailability(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: e.target.value } : item))} />
                    <Button variant="outline-danger" size="sm" onClick={() => setAvailability(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                  </div>
                ))}
                <Button variant="outline-secondary" size="sm" onClick={() => setAvailability(current => [...current, { dayOfWeek: 'Monday', startTime: '09:00', endTime: '13:00' }])}>Add interval</Button>
                <Form.Check className="mt-3" type="switch" label="Repeat availability in future weeks" />
              </Form.Group>
              <div className="small mb-3">
                <p><strong>Total Weekly:</strong> {totalAvailableHours.toFixed(1)} hours</p>
                <p><strong>Total Tasks:</strong> {tasks.reduce((s, t) => s + t.hoursRequired, 0)} hours</p>
              </div>
              <Button className="btn-stoic w-100" onClick={handleGenerateSchedule}>
                Generate Schedule
              </Button>
            </Card.Body>
          </Card>
        </div>
        <div>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Schedule Summary</h6>
              <Table striped size="sm">
                <tbody>
                  <tr>
                    <td><strong>Total Blocks:</strong></td>
                    <td>{generatedSchedule.blocks.length}</td>
                  </tr>
                  <tr>
                    <td><strong>Total Hours Scheduled:</strong></td>
                    <td>{(generatedSchedule.blocks.reduce((s, b) => s + b.durationMinutes, 0) / 60).toFixed(1)} hours</td>
                  </tr>
                  <tr>
                    <td><strong>Sporadic Hours:</strong></td>
                    <td>{generatedSchedule.blocks.filter(b => b.isSporadic).length}</td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </div>
      </div>

      <TimeGridCalendar
        blocks={generatedSchedule.blocks}
        candidateBlocks={candidateBlocks}
        editable
        showCandidateLane
        onMoveBlock={handleMoveBlock}
        onRemoveBlock={handleRemoveBlock}
      />

      <div className="mt-4 text-center">
        <Button
          className="btn-stoic me-2"
          onClick={() => onNavigate('setup')}
        >
          Back to Setup
        </Button>
        <Button
          className="btn-stoic"
          onClick={() => {
            onScheduleUpdate(generatedSchedule);
            onNavigate('execution');
          }}
          disabled={generatedSchedule.blocks.length === 0}
        >
          Next: Execute Schedule
        </Button>
      </div>
    </Container>
  );
};

export default SchedulePage;
