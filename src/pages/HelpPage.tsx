import React from 'react';
import { Button, Container, Table } from 'react-bootstrap';

interface HelpPageProps {
  onNavigate: (view: string) => void;
}

const HelpPage: React.FC<HelpPageProps> = ({ onNavigate }) => (
  <Container className="fade-in help-page">
    <h1 className="page-title">HORA Help</h1>
    <section className="help-section">
      <h2>Getting Started</h2>
      <ol>
        <li>Set up tasks and their objectives for the planning week.</li>
        <li>Define availability intervals and generate a weekly schedule.</li>
        <li>Adjust blocks in the calendar, then mark work complete during execution.</li>
        <li>Review daily or weekly performance reports.</li>
      </ol>
    </section>
    <section className="help-section">
      <h2>Task Types</h2>
      <Table bordered size="sm">
        <thead><tr><th>Priority</th><th>Scheduling behavior</th></tr></thead>
        <tbody>
          <tr><td className="priority-earth">Earth</td><td>Rigid, important, defined by required time slots.</td></tr>
          <tr><td className="priority-water">Water</td><td>Flexible, important, allocated by hours and deadline.</td></tr>
          <tr><td className="priority-fire">Fire</td><td>Rigid, less important, defined by required time slots.</td></tr>
          <tr><td className="priority-air">Air</td><td>Flexible, less important, allocated by hours and deadline.</td></tr>
        </tbody>
      </Table>
    </section>
    <section className="help-section">
      <h2>Task Codes</h2>
      <p>Use the format <code>SECTION-TASK</code>. Sections may contain up to seven characters and task codes up to four.</p>
      <p>Objectives use <code>SECTION-TASK-OBJECTIVE</code>.</p>
    </section>
    <section className="help-section">
      <h2>Balance</h2>
      <p>Positive balance is bounty: completed work is ahead of elapsed anchor time. Negative balance is debt.</p>
    </section>
    <div className="page-actions">
      <Button className="btn-stoic" onClick={() => onNavigate('setup')}>Back to Home</Button>
    </div>
  </Container>
);

export default HelpPage;
