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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const resetFormState = () => {
    setError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetFormState();

    try {
      if (createMode) {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        if (confirmPassword !== password) {
          throw new Error('Passwords do not match.');
        }

        const user = await createAccount(username, password);
        setSuccessMessage('Account created successfully. Please sign in.');
        setCreateMode(false);
        setUsername(user.username);
        setPassword('');
        setConfirmPassword('');
        return;
      }

      const user = await signIn(username, password);
      onAuthenticated(user);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to authenticate.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = () => {
    setCreateMode((current) => !current);
    setError('');
    setSuccessMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <main className="auth-shell">
      <Card className="card-stoic auth-card">
        <Card.Body>
          <p className="auth-kicker">HORA</p>
          <h1>{createMode ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-muted">Your planner stays private to this browser.</p>
          {error && <Alert variant="danger">{error}</Alert>}
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Username</Form.Label>
              <Form.Control value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={createMode ? 'new-password' : 'current-password'} required />
            </Form.Group>
            {createMode && (
              <Form.Group className="mb-4" controlId="confirmPassword">
                <Form.Label>Confirm Password</Form.Label>
                <Form.Control
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Form.Group>
            )}
            <Button className="btn-stoic w-100" type="submit" disabled={busy}>
              {busy ? 'Please wait...' : createMode ? 'Create account' : 'Sign in'}
            </Button>
          </Form>
          <Button variant="link" className="auth-switch" onClick={toggleMode}>
            {createMode ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </Button>
        </Card.Body>
      </Card>
    </main>
  );
};

export default LoginPage;
