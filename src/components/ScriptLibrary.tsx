import React, { useState } from 'react';
import { Button, Dropdown, Form, Modal } from 'react-bootstrap';
import type { ScriptTemplate } from '../types';

export interface WeekSource {
  key: string;
  label: string; // e.g. the week's date range
  detail: string; // e.g. "3 tasks"
  script: string;
  availability: string;
}

interface ScriptLibraryProps {
  templates: ScriptTemplate[];
  sources: WeekSource[]; // other weeks that already have a script
  canSave: boolean;
  onLoad: (script: string, availability: string, description: string) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

// Reuse scripts: load a saved template, copy another week's script, or save the open script as a template
const ScriptLibrary: React.FC<ScriptLibraryProps> = ({ templates, sources, canSave, onLoad, onSave, onDelete }) => {
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const replaces = templates.some(t => t.name.toLowerCase() === trimmed.toLowerCase());

  const submit = () => {
    if (!trimmed) return;
    onSave(trimmed);
    setShowSave(false);
    setName('');
  };

  return (
    <div className="script-library d-flex flex-wrap gap-2 mb-2">
      <Dropdown>
        <Dropdown.Toggle variant="outline-secondary" size="sm" className="btn-stoic">
          Templates
        </Dropdown.Toggle>
        <Dropdown.Menu className="script-library-menu">
          {templates.length === 0 && <Dropdown.ItemText className="text-muted small">No templates saved yet.</Dropdown.ItemText>}
          {templates.map(template => (
            <div key={template.id} className="script-library-row">
              <Dropdown.Item onClick={() => onLoad(template.scriptText, template.availability, `template "${template.name}"`)}>
                {template.name}
              </Dropdown.Item>
              <button
                type="button"
                className="script-library-delete"
                aria-label={`Delete template ${template.name}`}
                title="Delete template"
                onClick={() => {
                  if (window.confirm(`Delete the template "${template.name}"?`)) onDelete(template.id);
                }}
              >
                &times;
              </button>
            </div>
          ))}
          <Dropdown.Divider />
          <Dropdown.Item disabled={!canSave} onClick={() => setShowSave(true)}>
            Save open script as template&hellip;
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <Dropdown>
        <Dropdown.Toggle variant="outline-secondary" size="sm" className="btn-stoic">
          Copy from week
        </Dropdown.Toggle>
        <Dropdown.Menu className="script-library-menu">
          {sources.length === 0 && <Dropdown.ItemText className="text-muted small">No other week has a script yet.</Dropdown.ItemText>}
          {sources.map(source => (
            <Dropdown.Item key={source.key} onClick={() => onLoad(source.script, source.availability, `the script from ${source.label}`)}>
              {source.label} <small className="text-muted">({source.detail})</small>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>

      <Modal show={showSave} onHide={() => setShowSave(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Save as template</Modal.Title>
        </Modal.Header>
        <Form
          onSubmit={event => {
            event.preventDefault();
            submit();
          }}
        >
          <Modal.Body>
            <Form.Label htmlFor="template-name">Template name</Form.Label>
            <Form.Control
              id="template-name"
              autoFocus
              value={name}
              maxLength={60}
              placeholder="e.g. Regular semester week"
              onChange={event => setName(event.target.value)}
            />
            <Form.Text muted>
              Saves the script that is open now along with this week's available hours.
              {replaces && ' A template with this name already exists and will be replaced.'}
            </Form.Text>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowSave(false)}>
              Cancel
            </Button>
            <Button type="submit" className="btn-stoic" disabled={!trimmed}>
              {replaces ? 'Replace' : 'Save'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default ScriptLibrary;
