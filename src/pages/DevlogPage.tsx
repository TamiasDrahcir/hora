import React from 'react';
import { Button, Card, Container, Table } from 'react-bootstrap';
import type { DevlogEntry } from '../types';

interface DevlogPageProps {
  entries: DevlogEntry[];
  onNavigate: (view: string) => void;
}

const DevlogPage: React.FC<DevlogPageProps> = ({ entries, onNavigate }) => (
  <Container className="fade-in devlog-page">
    <h1 className="page-title">Devlog</h1>
    <p className="week-label">A running record of major website changes made by the developer or coding agent.</p>
    <Card className="card-stoic devlog-card">
      <Card.Body>
        <Table responsive hover className="devlog-table mb-0">
          <thead><tr><th>When</th><th>Change</th></tr></thead>
          <tbody>
            {entries.length > 0 ? entries.map(entry => (
              <tr key={entry.id}>
                <td>{new Date(entry.timestamp).toLocaleString()}</td>
                <td>{entry.message}</td>
              </tr>
            )) : <tr><td colSpan={2} className="text-muted text-center">No updates recorded yet.</td></tr>}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
    <div className="page-actions">
      <Button className="btn-stoic" onClick={() => onNavigate('setup')}>Back to Home</Button>
    </div>
  </Container>
);

export default DevlogPage;
