import React, { useState } from 'react';
import { Alert, Button, Card, Form } from 'react-bootstrap';
import { createAccount, signIn } from '../auth';
import type { LocalUser } from '../types';

interface LoginPageProps {
  onAuthenticated: (user: LocalUser) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
  const [createMode, setCreateMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = createMode ? await createAccount(username, password) : await signIn(username, password);
      onAuthenticated(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to authenticate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <Card className="card-stoic auth-card">
        <Card.Body>
          <p className="auth-kicker">HORA</p>
          <h1>{createMode ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-muted">Your planner stays private to this browser.</p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Username</Form.Label>
              <Form.Control value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
            </Form.Group>
            <Form.Group className="mb-4" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={createMode ? 'new-password' : 'current-password'} required />
            </Form.Group>
            <Button className="btn-stoic w-100" type="submit" disabled={busy}>
              {busy ? 'Please wait...' : createMode ? 'Create account' : 'Sign in'}
            </Button>
          </Form>
          <Button variant="link" className="auth-switch" onClick={() => { setCreateMode(!createMode); setError(''); }}>
            {createMode ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </Button>
        </Card.Body>
      </Card>
    </main>
  );
};

export default LoginPage;
