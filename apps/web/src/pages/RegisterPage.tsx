import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/auth';
import { api, ApiError } from '../api/client';

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    organizationName: '',
    displayName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [name]: e.target.value }),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.register(form);
      // The server answers the same way for new and existing emails; signing in tells us the outcome.
      await signIn(form.email, form.password);
      navigate('/app/docs');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form
        className="card auth-card"
        onSubmit={(e) => void submit(e)}
        aria-labelledby="register-title"
      >
        <h1 id="register-title">Create a workspace</h1>
        <label>
          Workspace name
          <input required minLength={2} {...field('organizationName')} />
        </label>
        <label>
          Your name
          <input required autoComplete="name" {...field('displayName')} />
        </label>
        <label>
          Email
          <input type="email" required autoComplete="email" {...field('email')} />
        </label>
        <label>
          Password (10+ characters)
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            {...field('password')}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create workspace'}
        </button>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
