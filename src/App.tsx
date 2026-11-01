import React, { useState, useEffect } from 'react';
import { Container, Navbar, Button, Modal } from 'react-bootstrap';
import type { AppState, ScheduleBlock, Task } from './types';
import { getWeekStartDate } from './utils';
import { DEFAULT_AVAILABILITY } from './availability';
import { useBlockNotifications } from './notifications';
import SetupPage from './pages/SetupPage';
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
    availability: DEFAULT_AVAILABILITY,
    currentWeekStartDate: getWeekStartDate(),
  });
  const [showHelp, setShowHelp] = useState(false);
  // Guards against persisting the initial empty state before localStorage has been read
  const [hydrated, setHydrated] = useState(false);

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
          // The Schedule view no longer exists; older saved state may still point at it
          currentView: parsed.currentView === 'schedule' ? 'setup' : parsed.currentView,
          currentWeekStartDate: new Date(parsed.currentWeekStartDate),
        }));
      } catch (e) {
        console.error('Failed to load saved state', e);
      }
    }
    setHydrated(true);
    
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.classList.toggle('tech-theme', savedTheme === 'tech');
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('horaAppState', JSON.stringify(appState));
  }, [appState, hydrated]);

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

  const handleScriptChange = (scriptText: string) => {
    updateAppState({ scriptText });
  };

  const handleAvailabilityChange = (availability: string) => {
    updateAppState({ availability });
  };

  const handleNotificationsChange = (notificationsEnabled: boolean) => {
    updateAppState({ notificationsEnabled });
  };

  const handleNavigate = (view: string) => {
    updateAppState({ currentView: view as any });
  };

  // Alerts fire whichever page is open; waiting for hydration avoids acting on the empty initial state
  useBlockNotifications(
    appState.schedule,
    hydrated && !!appState.notificationsEnabled,
    () => handleNavigate('execution')
  );

  const handleBlockUpdate = (blockId: string, updates: Partial<ScheduleBlock>) => {
    setAppState(prev => {
      if (!prev.schedule) return prev;
      return {
        ...prev,
        schedule: {
          ...prev.schedule,
          blocks: prev.schedule.blocks.map(block => (block.id === blockId ? { ...block, ...updates } : block)),
        },
      };
    });
  };

  const renderCurrentView = () => {
    switch (appState.currentView) {
      case 'setup':
        return (
          <SetupPage
            tasks={appState.tasks}
            scriptText={appState.scriptText || ''}
            schedule={appState.schedule}
            availability={appState.availability}
            notificationsEnabled={!!appState.notificationsEnabled}
            onTasksUpdate={handleTasksUpdate}
            onScriptChange={handleScriptChange}
            onAvailabilityChange={handleAvailabilityChange}
            onNotificationsChange={handleNotificationsChange}
            onScheduleUpdate={handleScheduleUpdate}
            onNavigate={handleNavigate}
          />
        );
      case 'execution':
        return (
          <ExecutionPage
            schedule={appState.schedule}
            tasks={appState.tasks}
            availability={appState.availability}
            notificationsEnabled={!!appState.notificationsEnabled}
            onNotificationsChange={handleNotificationsChange}
            onBlockUpdate={handleBlockUpdate}
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
            <li><strong>Setup:</strong> Write your tasks in the task script, hit Compile, then Generate Schedule to see proposed times for each subobjective on the calendar</li>
            <li><strong>Execute:</strong> Complete, mothball or abandon each task block as the week unfolds</li>
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

          <h6 className="mt-3">Notifications</h6>
          <p>
            Turn on the Notifications switch (Setup or Execute) to get an alert 5 minutes before a block or event starts,
            and when a task block ends without being completed. Alerts only appear while HORA is open in a browser tab.
          </p>

          <h6 className="mt-3">Revenue and Balance</h6>
          <ul>
            <li><strong>Nominal revenue:</strong> time worth of tasks you should have finished by now, per the schedule</li>
            <li><strong>Actual revenue:</strong> time worth of tasks you actually finished</li>
            <li><strong>Closet debt:</strong> time worth of tasks you currently have mothballed</li>
            <li><strong>Lost revenue:</strong> time worth of tasks you abandoned</li>
          </ul>
          <p>Balance = actual revenue - nominal revenue. Mothballing or abandoning a task removes it from nominal revenue.</p>
          <p><span className="balance-positive">Positive = Bounty (ahead of schedule)</span></p>
          <p><span className="balance-negative">Negative = Debt (behind schedule)</span></p>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default App;
