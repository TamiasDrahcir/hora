import React, { useState, useMemo } from 'react';
import { Card, Button, Container, Row, Col, Table, Form } from 'react-bootstrap';
import type { Task, ScheduleBlock, WeeklySchedule } from '../types';
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
  availableHoursPerDay,
  onScheduleUpdate,
  onNavigate,
}) => {
  const [hoursPerDay, setHoursPerDay] = useState(availableHoursPerDay);

  const generatedSchedule = useMemo(() => {
    if (!schedule) {
      return scheduleWeek(tasks, hoursPerDay * 5);
    }
    return schedule;
  }, [tasks, schedule, hoursPerDay]);

  const blocksByDay = useMemo(() => {
    const blocks: Record<string, ScheduleBlock[]> = {};
    DAYS_OF_WEEK.slice(0, 5).forEach(day => {
      blocks[day] = generatedSchedule.blocks
        .filter(b => b.dayOfWeek === day)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    });
    return blocks;
  }, [generatedSchedule]);

  const getPriorityColor = (priority: string): string => {
    const colors = {
      earth: '#8b4513',
      water: '#4169e1',
      fire: '#ff6347',
      air: '#daa520',
    };
    return colors[priority as keyof typeof colors] || '#999';
  };

  const handleGenerateSchedule = () => {
    const newSchedule = scheduleWeek(tasks, hoursPerDay * 5);
    onScheduleUpdate(newSchedule);
  };

  const handleRemoveBlock = (blockId: string) => {
    const updatedBlocks = generatedSchedule.blocks.filter(b => b.id !== blockId);
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
                <Form.Label>Available Hours per Day</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={12}
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </Form.Group>
              <div className="small mb-3">
                <p><strong>Total Weekly:</strong> {hoursPerDay * 5} hours</p>
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

      <div className="schedule-view">
        {DAYS_OF_WEEK.slice(0, 5).map(day => (
          <div key={day} className="mb-5">
            <h5 style={{ borderBottom: '2px solid var(--stoic-border)', paddingBottom: '0.5rem' }}>
              {day}
            </h5>
            {blocksByDay[day].length > 0 ? (
              <div className="day-blocks">
                {blocksByDay[day].map(block => (
                  <Card
                    key={block.id}
                    className="schedule-block"
                    style={{
                      borderLeftColor: getPriorityColor(block.priority),
                      backgroundColor: block.completed ? '#f0f0f0' : 'white',
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
