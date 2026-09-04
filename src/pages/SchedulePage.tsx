import React, { useState, useMemo } from 'react';
import { Card, Button, Container, Row, Col, Table, Form } from 'react-bootstrap';
import type { Task, ScheduleBlock, WeeklySchedule, AvailabilityInterval } from '../types';
import { scheduleWeek } from '../scheduler';
import { DAYS_OF_WEEK, timeToMinutes } from '../utils';

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

  const blocksByDay = useMemo(() => {
    const blocks: Record<string, ScheduleBlock[]> = {};
    DAYS_OF_WEEK.forEach(day => {
      blocks[day] = generatedSchedule.blocks
        .filter(b => b.dayOfWeek === day)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    });
    return blocks;
  }, [generatedSchedule]);

  const getPriorityColor = (priority: string): string => {
    const colors = {
      earth: '#7F5F00',
      water: '#0E87CC',
      fire: '#CF352E',
      air: '#B38ED2',
    };
    return colors[priority as keyof typeof colors] || '#999';
  };

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


  return (
    <Container className="fade-in">
      <h1 className="page-title">Weekly Schedule</h1>

      <Row className="mb-4">
        <Col md={4}>
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
        </Col>
        <Col md={8}>
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
        </Col>
      </Row>

      <div className="schedule-view week-calendar">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="calendar-day" onDragOver={event => event.preventDefault()} onDrop={event => {
            const candidateId = event.dataTransfer.getData('candidateId');
            const candidate = candidateBlocks.find(block => block.id === candidateId);
            if (candidate) {
              onScheduleUpdate({ ...generatedSchedule, blocks: [...generatedSchedule.blocks, { ...candidate, dayOfWeek: day }] });
              setCandidateBlocks(current => current.filter(block => block.id !== candidateId));
              return;
            }
            const blockId = event.dataTransfer.getData('blockId');
            if (blockId) {
              onScheduleUpdate({
                ...generatedSchedule,
                blocks: generatedSchedule.blocks.map(block => block.id === blockId ? { ...block, dayOfWeek: day } : block),
              });
            }
          }}>
            <h5 style={{ borderBottom: '2px solid var(--stoic-border)', paddingBottom: '0.5rem' }}>
              {day}
            </h5>
            {blocksByDay[day].length > 0 ? (
              <div className="day-blocks">
                {blocksByDay[day].map(block => (
                  <Card
                    key={block.id}
                    draggable
                    onDragStart={event => event.dataTransfer.setData('blockId', block.id)}
                    className="schedule-block"
                    style={{
                      backgroundColor: block.completed ? '#f0f0f0' : getPriorityColor(block.priority),
                      opacity: block.completed ? 0.6 : 1,
                    }}
                  >
                    <Card.Body className="p-2">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <h6 className="mb-1">
                            {block.taskCode}
                            {block.objectiveCode && <span className="ms-2 text-muted">{block.objectiveCode}</span>}
                          </h6>
                          <small className="text-muted">
                            {block.startTime} - {block.endTime} ({block.durationMinutes / 60}h)
                          </small>
                          {block.isSporadic && <div className="badge bg-warning mt-1">Sporadic</div>}
                          {block.completed && <div className="badge bg-success mt-1">Completed</div>}
                        </div>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-danger p-0"
                          onClick={() => handleRemoveBlock(block.id)}
                        >
                          ✕
                        </Button>
                      </div>
                      {block.description && <small className="text-muted d-block mt-2">{block.description}</small>}
                    </Card.Body>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-muted p-3 border" style={{ borderColor: 'var(--stoic-border)' }}>
                <small>No scheduled blocks for {day}</small>
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="candidate-lane" onDragOver={event => event.preventDefault()} onDrop={event => {
        const blockId = event.dataTransfer.getData('blockId');
        if (blockId) handleRemoveBlock(blockId);
      }}>
        <h5>Candidate lane</h5>
        <div className="candidate-blocks">
          {candidateBlocks.map(block => (
            <Card key={block.id} draggable onDragStart={event => event.dataTransfer.setData('candidateId', block.id)} className="schedule-block" style={{ backgroundColor: getPriorityColor(block.priority) }}>
              <Card.Body className="p-2">{block.taskCode}<br /><small>{block.durationMinutes} min</small></Card.Body>
            </Card>
          ))}
          {candidateBlocks.length === 0 && <small className="text-muted">Removed blocks stay here until you place them again.</small>}
        </div>
      </section>

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
