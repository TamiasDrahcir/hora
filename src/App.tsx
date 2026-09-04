import React, { useState, useEffect } from 'react';
import { Container, Navbar, Button } from 'react-bootstrap';
import type { AppState, Task, WeeklySchedule, LocalUser } from './types';
import { getWeekStartDate } from './utils';
import { getSessionUser, signOut } from './auth';
import SetupPage from './pages/SetupPage';
import SchedulePage from './pages/SchedulePage';
import ExecutionPage from './pages/ExecutionPage';
import ReportPage from './pages/ReportPage';
import HelpPage from './pages/HelpPage';
import LoginPage from './pages/LoginPage';
import DevlogPage from './pages/DevlogPage';
import './App.css';

const App: React.FC = () => {
  const [user, setUser] = useState<LocalUser | null>(() => getSessionUser());
  const stateStorageKey = user ? `horaAppState:${user.id}` : '';
  const [theme, setTheme] = useState<'stoic' | 'tech'>('stoic');
  const [appState, setAppState] = useState<AppState>({
    tasks: [],
    schedule: null,
    report: null,
    currentView: 'setup',
    availableHoursPerDay: 4,
    currentWeekStartDate: getWeekStartDate(),
    devlog: [
      { id: 'devlog-auth', timestamp: '2026-09-03T00:00:00.000Z', message: 'Added local account creation, sign-in, password hashing, and session persistence.' },
      { id: 'devlog-planner', timestamp: '2026-09-03T00:00:00.000Z', message: 'Updated weekly planning, calendar interactions, execution alerts, reports, and Help navigation.' },
      { id: 'devlog-scope', timestamp: '2026-09-03T00:00:00.000Z', message: 'Clarified Devlog scope: it records major website changes made by the developer or coding agent, not user activity.' },
    ],
  });

  // Load data from localStorage on mount
  useEffect(() => {
    if (!user) return;
    const savedState = localStorage.getItem(stateStorageKey);
    const savedTheme = localStorage.getItem('horaTheme') as 'stoic' | 'tech' | null;
    
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setAppState(prev => ({
          ...prev,
          ...parsed,
          devlog: parsed.devlog || prev.devlog,
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
  }, [stateStorageKey, user]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (user) localStorage.setItem(stateStorageKey, JSON.stringify(appState));
  }, [appState, stateStorageKey, user]);

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

  const handleScheduleUpdate = (schedule: WeeklySchedule) => {
    updateAppState({ schedule });
  };

  const handleNavigate = (view: string) => {
    updateAppState({ currentView: view as any });
  };

  const handleAuthenticated = (authenticatedUser: LocalUser) => {
    setAppState(prev => ({
      ...prev,
      tasks: [],
      schedule: null,
      report: null,
      currentView: 'setup',
      devlog: prev.devlog,
    }));
    setUser(authenticatedUser);
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
            currentWeekStartDate={appState.currentWeekStartDate}
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
      case 'help':
        return <HelpPage onNavigate={handleNavigate} />;
      case 'devlog':
        return <DevlogPage entries={appState.devlog} onNavigate={handleNavigate} />;
      default:
        return null;
    }
  };

  if (!user) return <LoginPage onAuthenticated={handleAuthenticated} />;

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
              onClick={() => handleNavigate('help')}
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
            <Button variant="outline-secondary" size="sm" className="btn-stoic" onClick={() => handleNavigate('devlog')}>Devlog</Button>
            <Button variant="outline-secondary" size="sm" className="btn-stoic" onClick={() => { signOut(); setUser(null); }}>Sign out</Button>
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
        <Button
          variant={appState.currentView === 'devlog' ? 'dark' : 'outline-secondary'}
          size="sm"
          className="btn-stoic"
          onClick={() => handleNavigate('devlog')}
        >
          Devlog
        </Button>
      </div>

      {renderCurrentView()}

    </div>
  );
};

export default App;
