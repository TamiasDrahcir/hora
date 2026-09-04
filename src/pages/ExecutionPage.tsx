import React, { useMemo } from 'react';
import { Card, Button, Container, Row, Col, Table, Alert } from 'react-bootstrap';
import type { WeeklySchedule } from '../types';
import { calculateBalance, DAYS_OF_WEEK } from '../utils';
import TimeGridCalendar from '../components/TimeGridCalendar';

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
  const currentTime = useMemo(() => new Date().getTime(), []);
  const stats = useMemo(() => {
    if (!schedule) return null;

    const completedObjectiveHours = schedule.blocks
      .filter(b => b.completed)
      .reduce((sum, b) => sum + b.durationMinutes, 0) / 60;
    const totalScheduledHours = schedule.blocks.reduce((sum, b) => sum + b.durationMinutes, 0) / 60;

    const now = new Date();
    const anchorMinutesPassed = schedule.blocks
      .filter(b => b.blockType === 'anchor')
      .filter(b => {
        const dayIndex = DAYS_OF_WEEK.indexOf(b.dayOfWeek);
        const blockDate = new Date(schedule.weekStartDate);
        blockDate.setDate(blockDate.getDate() + dayIndex);
        const [hours, minutes] = b.endTime.split(':').map(Number);
        blockDate.setHours(hours, minutes, 0, 0);
        return blockDate <= now;
      })
      .reduce((sum, b) => sum + b.durationMinutes, 0);

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
      totalScheduledHours,
    };
  }, [schedule]);

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

  const deadlineAlerts = schedule.blocks
    .filter(block => !block.completed && block.objectiveCode)
    .filter(block => {
      const dayIndex = DAYS_OF_WEEK.indexOf(block.dayOfWeek);
      const due = new Date(schedule.weekStartDate);
      due.setDate(due.getDate() + Math.max(0, dayIndex));
      return due.getTime() - currentTime < 48 * 60 * 60 * 1000;
    });

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
                    width: `${stats.totalScheduledHours ? (stats.completedObjectiveHours / stats.totalScheduledHours) * 100 : 0}%`,
                    backgroundColor: '#6b5344',
                  }}
                ></div>
              </div>
              <p className="mb-0">
                <strong>{stats.completedObjectiveHours.toFixed(1)}h</strong> of <strong>{stats.totalScheduledHours.toFixed(1)}h</strong> scheduled hours completed
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

      <Card className="card-stoic p-3 mb-4">
        <Card.Body>
          <h6>Objectives nearing deadline</h6>
          {deadlineAlerts.length > 0 ? deadlineAlerts.map(block => (
            <Alert key={block.id} variant="warning" className="mb-2">
              <strong>{block.objectiveCode}</strong> is scheduled for {block.dayOfWeek} at {block.startTime}.
            </Alert>
          )) : <p className="text-muted mb-0">No objectives are nearing their deadline.</p>}
        </Card.Body>
      </Card>

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

      <TimeGridCalendar
        blocks={schedule.blocks.filter(block => DAYS_OF_WEEK.slice(0, 5).includes(block.dayOfWeek))}
        onBlockCompletion={onBlockCompletion}
      />

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
