import React, { useState } from 'react';
import { Card, Button, Form, Modal, Container, Row, Col, Table, Alert } from 'react-bootstrap';
import { v4 as uuidv4 } from 'uuid';
import type { Task, Objective, Priority } from '../types';
import { generateTaskCode } from '../utils';

interface SetupPageProps {
  tasks: Task[];
  onTasksUpdate: (tasks: Task[]) => void;
  onNavigate: (view: string) => void;
  currentWeekStartDate: Date;
}

const SetupPage: React.FC<SetupPageProps> = ({ tasks, onTasksUpdate, onNavigate, currentWeekStartDate }) => {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    section: '',
    taskCode: '',
    taskName: '',
    hoursRequired: 1,
    deadline: 'Friday',
    priority: 'water' as Priority,
    description: '',
    recurring: false,
    timeSlots: [] as Array<{ dayOfWeek: string; startTime: string; endTime: string }>,
  });
  const [objectiveForm, setObjectiveForm] = useState({
    code: '',
    name: '',
    hours: 1,
    description: '',
  });
  const [showObjectiveModal, setShowObjectiveModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const handleOpenTaskModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      const parts = task.code.split('-');
      setFormData({
        section: parts[0],
        taskCode: parts[1],
        taskName: task.name,
        hoursRequired: task.hoursRequired,
        deadline: task.deadline,
        priority: task.priority,
        description: task.description || '',
        recurring: task.recurring || false,
        timeSlots: task.timeSlots || [],
      });
    } else {
      setEditingTask(null);
      setFormData({
        section: '',
        taskCode: '',
        taskName: '',
        hoursRequired: 1,
        deadline: 'Friday',
        priority: 'water',
        description: '',
        recurring: false,
        timeSlots: [],
      });
    }
    setShowTaskModal(true);
  };

  const handleSaveTask = () => {
    const code = generateTaskCode(formData.section, formData.taskCode);
    
    const newTask: Task = {
      id: editingTask?.id || uuidv4(),
      code,
      name: formData.taskName,
      hoursRequired: formData.hoursRequired,
      deadline: formData.deadline,
      priority: formData.priority,
      mode: formData.priority === 'earth' || formData.priority === 'fire' ? 'rigid' : 'flexible',
      description: formData.description,
      objectives: editingTask?.objectives || [],
      completed: editingTask?.completed || false,
      recurring: formData.recurring,
      timeSlots: formData.timeSlots,
    };

    if (editingTask) {
      onTasksUpdate(tasks.map(t => t.id === editingTask.id ? newTask : t));
    } else {
      onTasksUpdate([...tasks, newTask]);
    }
    setShowTaskModal(false);
  };

  const handleDeleteTask = (taskId: string) => {
    onTasksUpdate(tasks.filter(t => t.id !== taskId));
  };

  const handleAddObjective = () => {
    if (!selectedTaskId) return;
    
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    const objective: Objective = {
      id: uuidv4(),
      code: `${task.code}-${objectiveForm.code}`,
      name: objectiveForm.name,
      hoursRequired: objectiveForm.hours,
      description: objectiveForm.description,
      completed: false,
    };

    onTasksUpdate(
      tasks.map(t =>
        t.id === selectedTaskId
          ? { ...t, objectives: [...t.objectives, objective] }
          : t
      )
    );

    setObjectiveForm({ code: '', name: '', hours: 1, description: '' });
    setShowObjectiveModal(false);
  };

  const handleDeleteObjective = (taskId: string, objectiveId: string) => {
    onTasksUpdate(
      tasks.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            objectives: t.objectives.filter(o => o.id !== objectiveId),
          };
        }
        return t;
      })
    );
  };

  const totalHours = tasks.reduce((sum, t) => sum + t.hoursRequired, 0);
  const objectiveHours = selectedTaskId
    ? (tasks.find(task => task.id === selectedTaskId)?.objectives.reduce((sum, objective) => sum + objective.hoursRequired, 0) || 0)
    : 0;
  const objectiveOverflow = objectiveHours + objectiveForm.hours > (tasks.find(task => task.id === selectedTaskId)?.hoursRequired || 0);
  const weekLabel = currentWeekStartDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Container className="fade-in">
      <h1 className="page-title">Setup Your Tasks</h1>
      <p className="week-label">Planning week starting {weekLabel}</p>
      
      <Row className="mb-4">
        <Col>
          <Card className="card-stoic p-3">
            <Card.Body>
              <p>Define all your tasks and objectives for the week.</p>
              <div className="alert alert-info">
                <strong>Total Hours:</strong> {totalHours} hours
              </div>
              <Button
                className="btn-stoic"
                onClick={() => handleOpenTaskModal()}
              >
                Add New Task
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {tasks.length > 0 ? (
        <Row>
          {tasks.map(task => (
            <Col key={task.id} md={6} className="mb-4">
              <Card className="card-stoic">
                <Card.Header style={{ borderBottom: '1px solid var(--stoic-border)' }}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h5 className="mb-0">{task.code}</h5>
                      <small>{task.name}</small>
                    </div>
                    <span className={`priority-${task.priority}`}>{task.priority.toUpperCase()}</span>
                  </div>
                </Card.Header>
                <Card.Body>
                  <Table striped size="sm" className="mb-3">
                    <tbody>
                      <tr>
                        <td><strong>Hours:</strong></td>
                        <td>{task.hoursRequired} hr{task.hoursRequired !== 1 ? 's' : ''}</td>
                      </tr>
                      <tr>
                        <td><strong>Deadline:</strong></td>
                        <td>{task.deadline}</td>
                      </tr>
                      <tr>
                        <td><strong>Objectives:</strong></td>
                        <td>{task.objectives.length}</td>
                      </tr>
                    </tbody>
                  </Table>
                  {task.description && (
                    <div className="mb-3">
                      <small><strong>Description:</strong> {task.description}</small>
                    </div>
                  )}
                  {task.objectives.length > 0 && (
                    <div className="mb-3">
                      <h6>Objectives:</h6>
                      <Table striped size="sm" className="small">
                        <tbody>
                          {task.objectives.map(obj => (
                            <tr key={obj.id}>
                              <td>{obj.code}</td>
                              <td>{obj.hoursRequired}h</td>
                              <td>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="text-danger p-0"
                                  onClick={() => handleDeleteObjective(task.id, obj.id)}
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                  <div className="d-flex gap-2">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="btn-stoic"
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setShowObjectiveModal(true);
                      }}
                      disabled={task.hoursRequired <= 1}
                    >
                      Add Objective
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="btn-stoic"
                      onClick={() => handleOpenTaskModal(task)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Row>
          <Col>
            <Card className="card-stoic p-5 text-center">
              <p>No tasks yet. Add your first task to get started!</p>
            </Card>
          </Col>
        </Row>
      )}

      <div className="mt-4 text-center">
        <Button
          className="btn-stoic me-2"
          onClick={() => onNavigate('schedule')}
          disabled={tasks.length === 0}
        >
          Next: Schedule Tasks
        </Button>
      </div>

      {/* Task Modal */}
      <Modal show={showTaskModal} onHide={() => setShowTaskModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editingTask ? 'Edit Task' : 'Add New Task'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Section Code</Form.Label>
              <Form.Control
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                placeholder="e.g., POLS206 (max 7 chars)"
                maxLength={7}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Task Code</Form.Label>
              <Form.Control
                value={formData.taskCode}
                onChange={(e) => setFormData({ ...formData, taskCode: e.target.value })}
                placeholder="e.g., PB10 (max 4 chars)"
                maxLength={4}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Task Name</Form.Label>
              <Form.Control
                value={formData.taskName}
                onChange={(e) => setFormData({ ...formData, taskName: e.target.value })}
                placeholder="e.g., Packback #10"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Priority</Form.Label>
              <Form.Select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
              >
                <option value="earth">Earth (Rigid & Important)</option>
                <option value="water">Water (Flexible & Important)</option>
                <option value="fire">Fire (Rigid & Less Important)</option>
                <option value="air">Air (Flexible & Less Important)</option>
              </Form.Select>
            </Form.Group>
            {(formData.priority === 'earth' || formData.priority === 'fire') ? (
              <Form.Group className="mb-3">
                <Form.Label>Required weekly time slots</Form.Label>
                {formData.timeSlots.map((slot, index) => (
                  <div className="time-slot-row" key={`${slot.dayOfWeek}-${index}`}>
                    <Form.Select value={slot.dayOfWeek} onChange={(e) => setFormData({ ...formData, timeSlots: formData.timeSlots.map((item, itemIndex) => itemIndex === index ? { ...item, dayOfWeek: e.target.value } : item) })}>
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => <option key={day}>{day}</option>)}
                    </Form.Select>
                    <Form.Control type="time" value={slot.startTime} onChange={(e) => setFormData({ ...formData, timeSlots: formData.timeSlots.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: e.target.value } : item) })} />
                    <Form.Control type="time" value={slot.endTime} onChange={(e) => setFormData({ ...formData, timeSlots: formData.timeSlots.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: e.target.value } : item) })} />
                    <Button variant="outline-danger" onClick={() => setFormData({ ...formData, timeSlots: formData.timeSlots.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button>
                  </div>
                ))}
                <Button variant="outline-secondary" size="sm" onClick={() => setFormData({ ...formData, timeSlots: [...formData.timeSlots, { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:00' }] })}>Add time slot</Button>
              </Form.Group>
            ) : (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Hours Required</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={formData.hoursRequired}
                    onChange={(e) => setFormData({ ...formData, hoursRequired: parseInt(e.target.value) || 1 })}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Deadline</Form.Label>
                  <Form.Select
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Weekend">Weekend</option>
                  </Form.Select>
                </Form.Group>
              </>
            )}
            <Form.Check
              className="mb-3"
              type="switch"
              label="Repeat this task in future weeks"
              checked={formData.recurring}
              onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
            />
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowTaskModal(false)}>Cancel</Button>
          <Button className="btn-stoic" onClick={handleSaveTask}>Save Task</Button>
        </Modal.Footer>
      </Modal>

      {/* Objective Modal */}
      <Modal show={showObjectiveModal} onHide={() => setShowObjectiveModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Objective</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            {objectiveOverflow && <Alert variant="warning">Objective hours exceed this task's allocated {tasks.find(task => task.id === selectedTaskId)?.hoursRequired || 0} hours.</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Objective Code</Form.Label>
              <Form.Control
                value={objectiveForm.code}
                onChange={(e) => setObjectiveForm({ ...objectiveForm, code: e.target.value })}
                placeholder="e.g., QX (max 4 chars)"
                maxLength={4}
              />
              <small>Will be combined with task code</small>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Objective Name</Form.Label>
              <Form.Control
                value={objectiveForm.name}
                onChange={(e) => setObjectiveForm({ ...objectiveForm, name: e.target.value })}
                placeholder="e.g., Question"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Hours Required</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={objectiveForm.hours}
                onChange={(e) => setObjectiveForm({ ...objectiveForm, hours: parseInt(e.target.value) || 1 })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                value={objectiveForm.description}
                onChange={(e) => setObjectiveForm({ ...objectiveForm, description: e.target.value })}
                rows={2}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowObjectiveModal(false)}>Cancel</Button>
          <Button className="btn-stoic" onClick={handleAddObjective} disabled={objectiveOverflow}>Add Objective</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default SetupPage;
