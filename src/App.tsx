import React, { useState, useEffect } from 'react';
import { Container, Navbar, Button, Modal } from 'react-bootstrap';
import type { AppState, Task } from './types';
import { getWeekStartDate } from './utils';
import SetupPage from './pages/SetupPage';
import SchedulePage from './pages/SchedulePage';
import ExecutionPage from './pages/ExecutionPage';
import ReportPage from './pages/ReportPage';
import './App.css';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'stoic' | 'tech'>('stoic');
  const [appState, setAppState] = useState<AppState>({
    tasks: [],
    schedule: null,
    report: null,
    currentView: 'setup',
    availableHoursPerDay: 4,
    currentWeekStartDate: getWeekStartDate(),
  });
  const [showHelp, setShowHelp] = useState(false);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('horaAppState');
    const savedTheme = localStorage.getItem('horaTheme') as 'stoic' | 'tech' | null;
    
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setAppState(prev => ({
          ...prev,
          ...parsed,
          currentWeekStartDate: new Date(parsed.currentWeekStartDate),
        }));
      } catch (e) {
        console.error('Failed to load saved state', e);
      }
    }
    
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.classList.toggle('tech-theme', savedTheme === 'tech');
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('horaAppState', JSON.stringify(appState));
  }, [appState]);

  useEffect(() => {
    localStorage.setItem('horaTheme', theme);
    document.body.classList.toggle('tech-theme', theme === 'tech');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'stoic' ? 'tech' : 'stoic');
  };

  const updateAppState = (updates: Partial<AppState>) => {
    setAppState(prev => ({ ...prev, ...updates }));
  };

  const handleTasksUpdate = (tasks: Task[]) => {
    updateAppState({ tasks });
  };

  const handleScheduleUpdate = (schedule: any) => {
    updateAppState({ schedule });
  };

  const handleNavigate = (view: string) => {
    updateAppState({ currentView: view as any });
  };

  const handleBlockCompletion = (blockId: string, completed: boolean) => {
    if (!appState.schedule) return;
    
    const updatedBlocks = appState.schedule.blocks.map(block =>
      block.id === blockId
        ? { ...block, completed, completedAt: completed ? new Date() : undefined }
        : block
    );
    
    updateAppState({
      schedule: {
        ...appState.schedule,
        blocks: updatedBlocks,
      },
    });
  };

  const renderCurrentView = () => {
    switch (appState.currentView) {
      case 'setup':
        return (
          <SetupPage
            tasks={appState.tasks}
            onTasksUpdate={handleTasksUpdate}
            onNavigate={handleNavigate}
          />
        );
      case 'schedule':
        return (
          <SchedulePage
            tasks={appState.tasks}
            schedule={appState.schedule}
            availableHoursPerDay={appState.availableHoursPerDay}
            onScheduleUpdate={handleScheduleUpdate}
            onNavigate={handleNavigate}
            onTasksUpdate={handleTasksUpdate}
          />
        );
      case 'execution':
        return (
          <ExecutionPage
            schedule={appState.schedule}
            onBlockCompletion={handleBlockCompletion}
            onNavigate={handleNavigate}
          />
        );
      case 'report':
        return (
          <ReportPage
            schedule={appState.schedule}
            tasks={appState.tasks}
            onNavigate={handleNavigate}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={`container-app ${theme === 'tech' ? 'slide-in' : 'fade-in'}`}>
      <Navbar className="mb-4" style={{
        backgroundColor: theme === 'stoic' ? 'var(--stoic-light)' : '#1a1f3a',
        borderBottom: `1px solid ${theme === 'stoic' ? 'var(--stoic-border)' : 'var(--tech-text)'}`,
      }}>
        <Container fluid>
          <Navbar.Brand style={{ fontSize: '1.5rem', fontWeight: 'normal', letterSpacing: '2px' }}>
            HORA
          </Navbar.Brand>
          <div className="ms-auto d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowHelp(true)}
              className="btn-stoic"
            >
              Help
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={toggleTheme}
              className="btn-stoic"
            >
              {theme === 'stoic' ? 'Tech' : 'Stoic'} Theme
            </Button>
          </div>
        </Container>
      </Navbar>

      <div className="navigation mb-4" style={{ textAlign: 'center' }}>
        <Button
          variant={appState.currentView === 'setup' ? 'dark' : 'outline-secondary'}
          size="sm"
          className="me-2 btn-stoic"
          onClick={() => handleNavigate('setup')}
        >
          Setup
        </Button>
        <Button
          variant={appState.currentView === 'schedule' ? 'dark' : 'outline-secondary'}
          size="sm"
          className="me-2 btn-stoic"
          onClick={() => handleNavigate('schedule')}
          disabled={appState.tasks.length === 0}
        >
          Schedule
        </Button>
        <Button
          variant={appState.currentView === 'execution' ? 'dark' : 'outline-secondary'}
          size="sm"
          className="me-2 btn-stoic"
          onClick={() => handleNavigate('execution')}
          disabled={!appState.schedule}
        >
          Execute
        </Button>
        <Button
          variant={appState.currentView === 'report' ? 'dark' : 'outline-secondary'}
          size="sm"
          className="btn-stoic"
          onClick={() => handleNavigate('report')}
          disabled={!appState.schedule}
        >
          Report
        </Button>
      </div>

      {renderCurrentView()}

      <Modal show={showHelp} onHide={() => setShowHelp(false)}>
        <Modal.Header closeButton>
          <Modal.Title>HORA - Homework Optimizer & Resource Allocator</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <h6>Getting Started</h6>
          <ol>
            <li><strong>Setup:</strong> Create your tasks with time estimates and break them into objectives</li>
            <li><strong>Schedule:</strong> Let HORA allocate your tasks across the week, then adjust as needed</li>
            <li><strong>Execute:</strong> Check off objectives as you complete them</li>
            <li><strong>Report:</strong> View your weekly performance metrics and balance</li>
          </ol>
          
          <h6 className="mt-3">Task Codes</h6>
          <p>Format: <code>SECTION-TASK</code> (e.g., POLS206-PB10)</p>
          <ul>
            <li>Section: max 7 characters (course or project)</li>
            <li>Task: max 4 characters (assignment or milestone)</li>
            <li>Objectives: max 4 characters each (sub-tasks)</li>
          </ul>

          <h6 className="mt-3">Priorities</h6>
          <ul>
            <li><span className="priority-earth">Earth</span> - Rigid, important (lectures, mandatory events)</li>
            <li><span className="priority-water">Water</span> - Flexible, important (homework, assignments)</li>
            <li><span className="priority-fire">Fire</span> - Rigid, less important (passion projects)</li>
            <li><span className="priority-air">Air</span> - Flexible, less important (entertainment)</li>
          </ul>

          <h6 className="mt-3">Balance</h6>
          <p>Your temporal balance = objective hours completed - anchor hours passed</p>
          <p><span className="balance-positive">Positive = Bounty (ahead of schedule)</span></p>
          <p><span className="balance-negative">Negative = Debt (behind schedule)</span></p>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default App;
