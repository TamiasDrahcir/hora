import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Container, Row, Col, Alert } from 'react-bootstrap';
import type { ScheduleBlock, Task, WeeklySchedule } from '../types';
import { DAYS_OF_WEEK } from '../utils';
import { resolveAvailability } from '../availability';
import { computeRevenue, formatMinutes, planningWeekStart } from '../revenue';
import TimeGridCalendar, { type BlockAction } from '../components/TimeGridCalendar';
import NotificationSettings from '../components/NotificationSettings';

interface ExecutionPageProps {
  schedule: WeeklySchedule | null;
  tasks: Task[];
  availability: string;
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
  onBlockUpdate: (blockId: string, updates: Partial<ScheduleBlock>) => void;
  onNavigate: (view: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const ExecutionPage: React.FC<ExecutionPageProps> = ({
  schedule,
  tasks,
  availability,
  notificationsEnabled,
  onNotificationsChange,
  onBlockUpdate,
  onNavigate,
}) => {
  const [now, setNow] = useState(() => new Date());

  // Nominal revenue depends on the clock, so keep it current
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const resolvedAvailability = useMemo(() => resolveAvailability(availability).availability, [availability]);

  const weekStart = useMemo(
    () => (schedule ? planningWeekStart(new Date(schedule.weekStartDate)) : null),
    [schedule]
  );

  const stats = useMemo(
    () => (schedule && weekStart ? computeRevenue(schedule.blocks, weekStart, now) : null),
    [schedule, weekStart, now]
  );

  if (!schedule || !stats || !weekStart) {
    return (
      <Container className="fade-in">
        <Alert variant="warning">No schedule available. Generate a schedule from Setup first.</Alert>
        <Button className="btn-stoic" onClick={() => onNavigate('setup')}>
          Go to Setup
        </Button>
      </Container>
    );
  }

  const handleBlockAction = (blockId: string, action: BlockAction) => {
    const block = schedule.blocks.find(b => b.id === blockId);
    if (!block) return;

    if (action === 'toggle-complete') {
      onBlockUpdate(blockId, block.completed
        ? { completed: false, completedAt: undefined }
        : { completed: true, completedAt: new Date() });
    } else if (action === 'toggle-mothball') {
      onBlockUpdate(blockId, { status: block.status === 'mothballed' ? 'active' : 'mothballed' });
    } else {
      onBlockUpdate(blockId, { status: 'abandoned' });
    }
  };

  // Only draw the "now" line when today falls inside the planned week
  const inWeek = now >= weekStart && now.getTime() < weekStart.getTime() + 7 * DAY_MS;
  const currentTime = inWeek
    ? { day: DAYS_OF_WEEK[(now.getDay() + 6) % 7], minutes: now.getHours() * 60 + now.getMinutes() }
    : undefined;

  const balanceClass = stats.balance >= 0 ? 'balance-positive' : 'balance-negative';

  const cards: Array<{ title: string; value: string; note: string; className?: string }> = [
    {
      title: 'Nominal revenue',
      value: formatMinutes(stats.nominal),
      note: 'Time worth of tasks you should have finished by now',
    },
    {
      title: 'Actual revenue',
      value: formatMinutes(stats.actual),
      note: 'Time worth of tasks you actually finished',
    },
    {
      title: 'Balance',
      value: `${stats.balance >= 0 ? '+' : '-'}${formatMinutes(stats.balance)}`,
      note: stats.balance >= 0 ? 'Bounty: you are ahead' : 'Debt: you are behind',
      className: balanceClass,
    },
    {
      title: 'Closet debt',
      value: formatMinutes(stats.closetDebt),
      note: 'Time worth of tasks currently mothballed',
    },
    {
      title: 'Lost revenue',
      value: formatMinutes(stats.lost),
      note: 'Time worth of tasks you abandoned',
    },
  ];

  return (
    <Container fluid className="fade-in">
      <h1 className="page-title">Execute Your Week</h1>

      <Row className="mb-3 g-3">
        {cards.map(card => (
          <Col key={card.title} xs={6} lg>
            <Card className="card-stoic revenue-card h-100">
              <Card.Body className="p-3">
                <h6 className="mb-1">{card.title}</h6>
                <div className={`revenue-value ${card.className || ''}`}>{card.value}</div>
                <div className="revenue-note mt-1">{card.note}</div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="card-stoic mb-3 execute-calendar">
        <Card.Body>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <h6 className="mb-0">Weekly Calendar</h6>
            <NotificationSettings enabled={notificationsEnabled} onChange={onNotificationsChange} />
            <div className="status-legend">
              <span><span className="swatch" style={{ backgroundColor: '#2fd05f' }} />Completed</span>
              <span><span className="swatch" style={{ backgroundColor: '#fbaed2' }} />Mothballed</span>
              <span><span className="swatch" style={{ backgroundColor: '#9ca3af' }} />Abandoned</span>
            </div>
          </div>
          <div className="calendar-with-lane">
            <TimeGridCalendar
              blocks={schedule.blocks}
              tasks={tasks}
              availability={resolvedAvailability}
              hourHeight={80}
              currentTime={currentTime}
              showBlockActions
              onBlockAction={handleBlockAction}
            />
          </div>
        </Card.Body>
      </Card>

      <div className="mt-4 mb-4 text-center">
        <Button
          className="btn-stoic me-2"
          onClick={() => onNavigate('setup')}
        >
          Back to Setup
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
