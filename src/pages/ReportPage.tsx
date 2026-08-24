import React, { useMemo } from 'react';
import { Card, Button, Container, Row, Col, Table, ProgressBar } from 'react-bootstrap';
import type { Task, WeeklySchedule } from '../types';
import { calculateBalance } from '../utils';

interface ReportPageProps {
  schedule: WeeklySchedule | null;
  tasks: Task[];
  onNavigate: (view: string) => void;
}

const ReportPage: React.FC<ReportPageProps> = ({ schedule, tasks, onNavigate }) => {
  const report = useMemo(() => {
    if (!schedule) return null;

    const totalScheduledMinutes = schedule.blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    const totalScheduledHours = totalScheduledMinutes / 60;
    const totalAvailableHours = schedule.totalAvailableHours;
    const scheduledPercentage = (totalScheduledHours / totalAvailableHours) * 100;

    const totalTaskHours = tasks.reduce((sum, t) => sum + t.hoursRequired, 0);
    const totalTaskPercentage = (totalTaskHours / totalAvailableHours) * 100;

    const completedObjectiveHours = schedule.blocks
      .filter(b => b.completed && b.blockType === 'anchor')
      .reduce((sum, b) => sum + b.durationMinutes, 0) / 60;

    const anchorMinutesPassed = schedule.blocks
      .filter(b => b.blockType === 'anchor')
      .reduce((sum, b) => sum + (b.completed ? b.durationMinutes : 0), 0);

    const balance = calculateBalance(completedObjectiveHours, anchorMinutesPassed);

    // Load by priority
    const loadByPriority = {
      earth: { hours: 0, count: 0 },
      water: { hours: 0, count: 0 },
      fire: { hours: 0, count: 0 },
      air: { hours: 0, count: 0 },
    };

    schedule.blocks.forEach(block => {
      const priority = block.priority as keyof typeof loadByPriority;
      if (priority in loadByPriority) {
        loadByPriority[priority].hours += block.durationMinutes / 60;
        loadByPriority[priority].count += 1;
      }
    });

    // Calculate per-hour balance (simplified)
    const perHourBalance: Array<{ hour: number; balance: number }> = [];
    let cumulativeBalance = 0;
    schedule.blocks
      .sort((a, b) => {
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        return (
          dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek) ||
          parseInt(a.startTime) - parseInt(b.startTime)
        );
      })
      .forEach((block, index) => {
        if (block.completed) {
          cumulativeBalance += block.durationMinutes;
        } else {
          cumulativeBalance -= block.durationMinutes;
        }
        if (index % 2 === 1) {
          perHourBalance.push({ hour: index, balance: Math.floor(cumulativeBalance / 60) });
        }
      });

    return {
      totalScheduledHours,
      totalAvailableHours,
      scheduledPercentage,
      totalTaskHours,
      totalTaskPercentage,
      completedObjectiveHours,
      anchorMinutesPassed,
      balance,
      balanceHours: Math.floor(Math.abs(balance) / 60),
      balanceMinutes: Math.abs(balance) % 60,
      isPositive: balance >= 0,
      loadByPriority,
      perHourBalance,
      totalBlocks: schedule.blocks.length,
      completedBlocks: schedule.blocks.filter(b => b.completed).length,
    };
  }, [schedule, tasks]);

  if (!report) {
    return (
      <Container className="fade-in">
        <h1 className="page-title">Weekly Report</h1>
        <Card className="card-stoic p-5 text-center">
          <p>No schedule available. Please create and execute a schedule first.</p>
        </Card>
        <div className="mt-4 text-center">
          <Button className="btn-stoic" onClick={() => onNavigate('schedule')}>
            Create Schedule
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container className="fade-in">
      <h1 className="page-title">Weekly Performance Report</h1>

      <Row className="mb-4">
        <Col md={6}>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Overall Balance</h6>
              <div
                className={`display-4 ${report.isPositive ? 'balance-positive' : 'balance-negative'}`}
                style={{ marginBottom: '1rem' }}
              >
                {report.isPositive ? '+' : '−'}{report.balanceHours}h {report.balanceMinutes}m
              </div>
              <p className="mb-0 text-muted">
                {report.isPositive ? 'Bounty - You are ahead!' : 'Debt - You are behind'}
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Completion Status</h6>
              <ProgressBar
                now={(report.completedBlocks / report.totalBlocks) * 100}
                label={`${report.completedBlocks} / ${report.totalBlocks}`}
                className="mb-3"
              />
              <Table striped size="sm">
                <tbody>
                  <tr>
                    <td>Objectives Completed:</td>
                    <td>{report.completedBlocks}</td>
                  </tr>
                  <tr>
                    <td>Total Objectives:</td>
                    <td>{report.totalBlocks}</td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col md={6}>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Load Summary</h6>
              <Table striped size="sm">
                <tbody>
                  <tr>
                    <td>Scheduled Load:</td>
                    <td>{report.totalScheduledHours.toFixed(1)}h / {report.totalAvailableHours}h</td>
                  </tr>
                  <tr>
                    <td>Scheduled %:</td>
                    <td>{report.scheduledPercentage.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>Total Task Hours:</td>
                    <td>{report.totalTaskHours}h</td>
                  </tr>
                  <tr>
                    <td>Task %:</td>
                    <td>{report.totalTaskPercentage.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="card-stoic p-3">
            <Card.Body>
              <h6>Execution Metrics</h6>
              <Table striped size="sm">
                <tbody>
                  <tr>
                    <td>Hours Completed:</td>
                    <td>{report.completedObjectiveHours.toFixed(1)}h</td>
                  </tr>
                  <tr>
                    <td>Anchor Hours Passed:</td>
                    <td>{(report.anchorMinutesPassed / 60).toFixed(1)}h</td>
                  </tr>
                  <tr>
                    <td>Temporal Balance:</td>
                    <td className={report.isPositive ? 'balance-positive' : 'balance-negative'}>
                      {report.isPositive ? '+' : '−'}{report.balanceHours}h {report.balanceMinutes}m
                    </td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="card-stoic p-3 mb-4">
        <Card.Body>
          <h6>Load by Priority</h6>
          <Table striped size="sm">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Hours</th>
                <th>Blocks</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {(['earth', 'water', 'fire', 'air'] as const).map(priority => {
                const data = report.loadByPriority[priority];
                const percentage = (data.hours / report.totalScheduledHours) * 100;
                return (
                  <tr key={priority}>
                    <td>
                      <span className={`priority-${priority}`}>{priority.toUpperCase()}</span>
                    </td>
                    <td>{data.hours.toFixed(1)}h</td>
                    <td>{data.count}</td>
                    <td>{percentage.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card className="card-stoic p-3 mb-4">
        <Card.Body>
          <h6>Key Insights</h6>
          <ul>
            <li>
              You scheduled {report.totalScheduledHours.toFixed(1)} out of {report.totalAvailableHours} available hours
              ({report.scheduledPercentage.toFixed(1)}%)
            </li>
            <li>
              You completed {report.completedBlocks} out of {report.totalBlocks} scheduled objectives
              ({((report.completedBlocks / report.totalBlocks) * 100).toFixed(1)}%)
            </li>
            <li>
              Your temporal balance is{' '}
              <strong className={report.isPositive ? 'balance-positive' : 'balance-negative'}>
                {report.isPositive ? '+' : '−'}{report.balanceHours}h {report.balanceMinutes}m
              </strong>
            </li>
            <li>
              {report.loadByPriority.earth.hours > 0
                ? `Earth priority takes up ${((report.loadByPriority.earth.hours / report.totalScheduledHours) * 100).toFixed(1)}% of your time`
                : 'No earth priority tasks scheduled'}
            </li>
          </ul>
        </Card.Body>
      </Card>

      <div className="mt-4 text-center">
        <Button className="btn-stoic me-2" onClick={() => onNavigate('execution')}>
          Back to Execution
        </Button>
        <Button className="btn-stoic" onClick={() => onNavigate('setup')}>
          Reset & Start Over
        </Button>
      </div>
    </Container>
  );
};

export default ReportPage;
