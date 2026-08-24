import React, { useMemo } from 'react';
import { Card, Button, Container, Row, Col, Table, Alert } from 'react-bootstrap';
import type { WeeklySchedule } from '../types';
import { calculateBalance, DAYS_OF_WEEK, timeToMinutes } from '../utils';

interface ExecutionPageProps {
  schedule: WeeklySchedule | null;
  onBlockCompletion: (blockId: string, completed: boolean) => void;
  onNavigate: (view: string) => void;
}

const ExecutionPage: React.FC<ExecutionPageProps> = ({
  schedule,
  onBlockCompletion,
  onNavigate,
}) => {
  const stats = useMemo(() => {
    if (!schedule) return null;

    const completedObjectiveHours = schedule.blocks
      .filter(b => b.completed && b.blockType === 'anchor')
      .reduce((sum, b) => sum + b.durationMinutes, 0) / 60;

    const anchorMinutesPassed = schedule.blocks
      .filter(b => b.blockType === 'anchor')
      .reduce((sum, b) => sum + (b.completed ? b.durationMinutes : 0), 0);

    const balance = calculateBalance(completedObjectiveHours, anchorMinutesPassed);
    const balanceHours = Math.floor(Math.abs(balance) / 60);
    const balanceMinutes = Math.abs(balance) % 60;

    return {
      completedObjectiveHours,
      anchorMinutesPassed,
      balance,
      balanceHours,
      balanceMinutes,
      totalBlocks: schedule.blocks.length,
      completedBlocks: schedule.blocks.filter(b => b.completed).length,
    };
  }, [schedule]);

  const getPriorityColor = (priority: string): string => {
    const colors = {
      earth: '#8b4513',
      water: '#4169e1',
      fire: '#ff6347',
      air: '#daa520',
    };
    return colors[priority as keyof typeof colors] || '#999';
  };

  if (!schedule || !stats) {
    return (
      <Container className="fade-in">
        <Alert variant="warning">No schedule available. Please create a schedule first.</Alert>
        <Button className="btn-stoic" onClick={() => onNavigate('schedule')}>
          Create Schedule
        </Button>
      </Container>
    );
  }

  const blocksByDay = DAYS_OF_WEEK.slice(0, 5).reduce((acc, day) => {
    acc[day] = schedule.blocks
      .filter(b => b.dayOfWeek === day)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    return acc;
  }, {} as Record<string, typeof schedule.blocks>);

  return (
    <Container className="fade-in">
      <h1 className="page-title">Execute Your Week</h1>

      <Row className="mb-4">
        <Col md={6}>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Progress</h6>
              <div className="progress mb-3">
                <div
                  className="progress-bar"
                  style={{
                    width: `${(stats.completedBlocks / stats.totalBlocks) * 100}%`,
                    backgroundColor: '#6b5344',
                  }}
                ></div>
              </div>
              <p className="mb-0">
                <strong>{stats.completedBlocks}</strong> of <strong>{stats.totalBlocks}</strong> objectives completed
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Temporal Balance</h6>
              <div className={`h5 mb-0 ${stats.balance >= 0 ? 'balance-positive' : 'balance-negative'}`}>
                {stats.balance >= 0 ? '+' : '-'}{stats.balanceHours}h {stats.balanceMinutes}m
              </div>
              <small className="text-muted">
                {stats.balance >= 0 ? 'Bounty (Ahead)' : 'Debt (Behind)'}
              </small>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col>
          <Card className="card-stoic p-3">
            <Card.Body>
              <Table striped size="sm">
                <tbody>
                  <tr>
                    <td><strong>Objective Hours Completed:</strong></td>
                    <td>{stats.completedObjectiveHours.toFixed(1)} hours</td>
                  </tr>
                  <tr>
                    <td><strong>Anchor Hours Passed:</strong></td>
                    <td>{(stats.anchorMinutesPassed / 60).toFixed(1)} hours</td>
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
                    className={`schedule-block ${block.completed ? 'completed' : ''}`}
                    style={{
                      borderLeftColor: getPriorityColor(block.priority),
                      backgroundColor: block.completed ? '#f0f0f0' : 'white',
                      opacity: block.completed ? 0.7 : 1,
                      cursor: 'pointer',
                    }}
                    onClick={() => onBlockCompletion(block.id, !block.completed)}
                  >
                    <Card.Body className="p-2">
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center gap-2">
                            <input
                              type="checkbox"
                              checked={block.completed}
                              onChange={(e) => {
                                e.stopPropagation();
                                onBlockCompletion(block.id, e.target.checked);
                              }}
                            />
                            <div>
                              <h6 className="mb-1" style={{ textDecoration: block.completed ? 'line-through' : 'none' }}>
                                {block.taskCode}
                                {block.objectiveCode && <span className="ms-2 text-muted">{block.objectiveCode}</span>}
                              </h6>
                              <small className="text-muted">
                                {block.startTime} - {block.endTime} ({block.durationMinutes / 60}h)
                              </small>
                              {block.isSporadic && <div className="badge bg-warning ms-2">Sporadic</div>}
                            </div>
                          </div>
                          {block.description && (
                            <small className="text-muted d-block mt-2">{block.description}</small>
                          )}
                        </div>
                      </div>
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
          onClick={() => onNavigate('schedule')}
        >
          Back to Schedule
        </Button>
        <Button
          className="btn-stoic"
          onClick={() => onNavigate('report')}
        >
          View Report
        </Button>
      </div>
    </Container>
  );
};

export default ExecutionPage;
