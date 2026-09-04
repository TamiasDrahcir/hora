import React, { useMemo, useState } from 'react';
import { Card, Button, Container, Row, Col, Table, ProgressBar } from 'react-bootstrap';
import type { Task, WeeklySchedule } from '../types';
import { calculateBalance, DAYS_OF_WEEK } from '../utils';

interface ReportPageProps {
  schedule: WeeklySchedule | null;
  tasks: Task[];
  onNavigate: (view: string) => void;
}

const ReportPage: React.FC<ReportPageProps> = ({ schedule, tasks, onNavigate }) => {
  const [selectedReport, setSelectedReport] = useState('Weekly');
  const activeSchedule = schedule as WeeklySchedule;
  const report = useMemo(() => {
    if (!schedule) return null;

    const totalScheduledMinutes = schedule.blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    const totalScheduledHours = totalScheduledMinutes / 60;
    const totalAvailableHours = schedule.totalAvailableHours;
    const scheduledPercentage = (totalScheduledHours / totalAvailableHours) * 100;

    const totalTaskHours = tasks.reduce((sum, t) => sum + t.hoursRequired, 0);
    const totalTaskPercentage = (totalTaskHours / totalAvailableHours) * 100;

    const completedObjectiveHours = schedule.blocks
      .filter(b => b.completed)
      .reduce((sum, b) => sum + b.durationMinutes, 0) / 60;

    const anchorMinutesPassed = schedule.blocks
      .filter(b => b.blockType === 'anchor')
      .reduce((sum, b) => sum + b.durationMinutes, 0);

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
    [...schedule.blocks]
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
      completedScheduledHours: completedObjectiveHours,
    };
  }, [schedule, tasks]);

  const isReportLocked = (reportName: string): boolean => {
    const dayIndex = reportName === 'Weekly' ? 6 : DAYS_OF_WEEK.indexOf(reportName);
    const lockDate = new Date(activeSchedule.weekStartDate);
    lockDate.setDate(lockDate.getDate() + dayIndex);
    lockDate.setHours(23, 59, 59, 999);
    return new Date() > lockDate;
  };

  const selectedBlocks = selectedReport === 'Weekly'
    ? activeSchedule.blocks
    : activeSchedule.blocks.filter(block => block.dayOfWeek === selectedReport);
  const selectedLocked = isReportLocked(selectedReport);

  if (!report || !schedule) {
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
                now={report.totalScheduledHours ? (report.completedScheduledHours / report.totalScheduledHours) * 100 : 0}
                label={`${report.completedScheduledHours.toFixed(1)}h / ${report.totalScheduledHours.toFixed(1)}h`}
                className="mb-3"
              />
              <Table striped size="sm">
                <tbody>
                  <tr>
                    <td>Scheduled hours completed:</td>
                    <td>{report.completedScheduledHours.toFixed(1)}h</td>
                  </tr>
                  <tr>
                    <td>Total scheduled hours:</td>
                    <td>{report.totalScheduledHours.toFixed(1)}h</td>
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
          <div className="priority-report">
            <div className="priority-pie" style={{ background: `conic-gradient(#7F5F00 0 ${report.totalScheduledHours ? report.loadByPriority.earth.hours / report.totalScheduledHours * 360 : 0}deg, #0E87CC 0 ${report.totalScheduledHours ? (report.loadByPriority.earth.hours + report.loadByPriority.water.hours) / report.totalScheduledHours * 360 : 0}deg, #CF352E 0 ${report.totalScheduledHours ? (report.loadByPriority.earth.hours + report.loadByPriority.water.hours + report.loadByPriority.fire.hours) / report.totalScheduledHours * 360 : 0}deg, #B38ED2 0 360deg)` }} />
            <Table striped size="sm">
              <tbody>
              {(['earth', 'water', 'fire', 'air'] as const).map(priority => {
                const data = report.loadByPriority[priority];
                const percentage = report.totalScheduledHours ? (data.hours / report.totalScheduledHours) * 100 : 0;
                return (
                  <tr key={priority}>
                    <td>
                      <span className={`priority-${priority}`}>{priority.toUpperCase()}</span>
                    </td>
                    <td>{data.hours.toFixed(1)}h</td>
                    <td>{percentage.toFixed(1)}%</td>
                  </tr>
                );
              })}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>

      {/* Key insights are intentionally omitted until the report model is finalized. */}
      <Card className="card-stoic p-3 mb-4">
        <Card.Body>
          <h6>Daily reports</h6>
          <div className="report-tabs">
            {DAYS_OF_WEEK.map(day => <Button key={day} variant={selectedReport === day ? 'dark' : 'outline-secondary'} onClick={() => setSelectedReport(day)}>{day} Report{isReportLocked(day) ? ' (Locked)' : ''}</Button>)}
            <Button variant={selectedReport === 'Weekly' ? 'dark' : 'outline-secondary'} onClick={() => setSelectedReport('Weekly')}>Weekly Report{isReportLocked('Weekly') ? ' (Locked)' : ''}</Button>
          </div>
          {selectedLocked && <p className="small text-muted mt-3">This report is locked after 11:59 PM in your local time. These are the final recorded values.</p>}
          {
            <Table striped size="sm" className="mt-3">
              <tbody>
                <tr><td>Scheduled hours</td><td>{(selectedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0) / 60).toFixed(1)}h</td></tr>
                <tr><td>Completed hours</td><td>{(selectedBlocks.filter(block => block.completed).reduce((sum, block) => sum + block.durationMinutes, 0) / 60).toFixed(1)}h</td></tr>
                <tr><td>Blocks</td><td>{selectedBlocks.length}</td></tr>
              </tbody>
            </Table>
          }
          {/*
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
          */}
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
