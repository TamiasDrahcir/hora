import React, { useState, useEffect, useMemo } from 'react';
import { Container, Navbar, Button, Modal } from 'react-bootstrap';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, ScheduleBlock, ScriptTemplate, Task, WeekPlan, WeeklySchedule } from './types';
import { weekKeyOf, getWeekStartDate } from './utils';
import { useBlockNotifications } from './notifications';
import { planFor, restoreState } from './weekPlans';
import { buildUpcomingEvents } from './calendarEvents';
import { setSyncBatch } from './googleSync';
import SetupPage from './pages/SetupPage';
import ExecutionPage from './pages/ExecutionPage';
import ReportPage from './pages/ReportPage';
import './App.css';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'stoic' | 'tech'>('stoic');
  const [appState, setAppState] = useState<AppState>({
    weeks: {},
    selectedWeek: weekKeyOf(),
    templates: [],
    report: null,
    currentView: 'setup',
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
        setAppState(prev => ({ ...prev, ...restoreState(JSON.parse(savedState)) }));
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

  // Setup edits the selected week; Execute and Report always work on the current week
  const currentWeek = weekKeyOf(new Date());
  const selectedPlan = planFor(appState.weeks, appState.selectedWeek);
  const currentPlan = planFor(appState.weeks, currentWeek);

  const updatePlan = (week: string, updates: Partial<WeekPlan>) => {
    setAppState(prev => ({
      ...prev,
      weeks: { ...prev.weeks, [week]: { ...planFor(prev.weeks, week), ...updates } },
    }));
  };

  const updateSelectedPlan = (updates: Partial<WeekPlan>) => updatePlan(appState.selectedWeek, updates);

  const handleTasksUpdate = (tasks: Task[]) => updateSelectedPlan({ tasks });
  const handleScheduleUpdate = (schedule: WeeklySchedule | null) => updateSelectedPlan({ schedule });
  const handleScriptChange = (scriptText: string) => updateSelectedPlan({ scriptText });
  const handleAvailabilityChange = (availability: string) => updateSelectedPlan({ availability });

  const handleSelectWeek = (selectedWeek: string) => updateAppState({ selectedWeek });

  const handleSaveTemplate = (name: string, scriptText: string, availability: string) => {
    setAppState(prev => {
      const existing = prev.templates.find(t => t.name.toLowerCase() === name.toLowerCase());
      const template: ScriptTemplate = { id: existing?.id ?? uuidv4(), name, scriptText, availability };
      return {
        ...prev,
        templates: existing ? prev.templates.map(t => (t.id === existing.id ? template : t)) : [...prev.templates, template],
      };
    });
  };

  const handleDeleteTemplate = (id: string) => {
    setAppState(prev => ({ ...prev, templates: prev.templates.filter(t => t.id !== id) }));
  };

  const handleNotificationsChange = (notificationsEnabled: boolean) => {
    updateAppState({ notificationsEnabled });
  };

  const handleNavigate = (view: string) => {
    updateAppState({ currentView: view as any });
  };

  // Alerts fire whichever page is open; waiting for hydration avoids acting on the empty initial state
  useBlockNotifications(currentPlan.schedule, hydrated && !!appState.notificationsEnabled, () => handleNavigate('execution'));

  // Google Calendar should hold the current week and any later planned weeks. Reporting it here, on every page,
  // lets auto-sync react to a change wherever it was made. Before hydration the weeks are empty, and reporting
  // that would look like "everything was deleted".
  const calendarEvents = useMemo(() => buildUpcomingEvents(appState.weeks, currentWeek), [appState.weeks, currentWeek]);
  useEffect(() => {
    if (hydrated) setSyncBatch(calendarEvents, getWeekStartDate(new Date()));
  }, [hydrated, calendarEvents]);

  // An earlier version registered a service worker and a push subscription; remove them so nothing lingers
  useEffect(() => {
    localStorage.removeItem('horaClientId');
    localStorage.removeItem('horaAlertsSynced');
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then(registrations =>
        Promise.all(
          registrations.map(async registration => {
            await (await registration.pushManager.getSubscription())?.unsubscribe();
            await registration.unregister();
          })
        )
      )
      .catch(() => undefined);
  }, []);

  const handleBlockUpdate = (blockId: string, updates: Partial<ScheduleBlock>) => {
    setAppState(prev => {
      const plan = prev.weeks[currentWeek];
      if (!plan?.schedule) return prev;
      return {
        ...prev,
        weeks: {
          ...prev.weeks,
          [currentWeek]: {
            ...plan,
            schedule: {
              ...plan.schedule,
              blocks: plan.schedule.blocks.map(block => (block.id === blockId ? { ...block, ...updates } : block)),
            },
          },
        },
      };
    });
  };

  const renderCurrentView = () => {
    switch (appState.currentView) {
      case 'setup':
        return (
          <SetupPage
            key={appState.selectedWeek}
            weekKey={appState.selectedWeek}
            weeks={appState.weeks}
            templates={appState.templates}
            tasks={selectedPlan.tasks}
            scriptText={selectedPlan.scriptText || ''}
            schedule={selectedPlan.schedule}
            availability={selectedPlan.availability}
            notificationsEnabled={!!appState.notificationsEnabled}
            onTasksUpdate={handleTasksUpdate}
            onScriptChange={handleScriptChange}
            onAvailabilityChange={handleAvailabilityChange}
            onNotificationsChange={handleNotificationsChange}
            onScheduleUpdate={handleScheduleUpdate}
            onSelectWeek={handleSelectWeek}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onNavigate={handleNavigate}
          />
        );
      case 'execution':
        return (
          <ExecutionPage
            schedule={currentPlan.schedule}
            tasks={currentPlan.tasks}
            availability={currentPlan.availability}
            notificationsEnabled={!!appState.notificationsEnabled}
            onNotificationsChange={handleNotificationsChange}
            onBlockUpdate={handleBlockUpdate}
            onNavigate={handleNavigate}
          />
        );
      case 'report':
        return (
          <ReportPage
            schedule={currentPlan.schedule}
            tasks={currentPlan.tasks}
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
          disabled={!currentPlan.schedule}
        >
          Execute
        </Button>
        <Button
          variant={appState.currentView === 'report' ? 'dark' : 'outline-secondary'}
          size="sm"
          className="btn-stoic"
          onClick={() => handleNavigate('report')}
          disabled={!currentPlan.schedule}
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
            <li><strong>Setup:</strong> Pick the week to plan (any week, past or future), write its tasks in the task script, hit Compile, then Generate Schedule to see proposed times for each subobjective on the calendar. Each week has its own script and available hours; copy a script from another week or save one as a template to reuse it</li>
            <li><strong>Execute:</strong> Complete, mothball or abandon each task block as the current week unfolds</li>
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
            and when a task block ends without being completed. Alerts appear while HORA is open in a browser tab. To
            get reminders any time, use Export calendar or Sync to Google Calendar on the Execute page, which put your
            blocks in Google Calendar with a 5-minute reminder.
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
