import type { DocumentSummary } from '@quillsync/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/auth';
import { api, ApiError } from '../api/client';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function DocumentsPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canCreate = me?.permissions.includes('document:create') ?? false;

  useEffect(() => {
    api
      .listDocuments()
      .then(setDocuments)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not load documents'),
      );
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const doc = await api.createDocument(title);
      navigate(`/app/docs/${doc.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the document');
    }
  }

  return (
    <section>
      <header className="page-header">
        <h1>Documents</h1>
        {canCreate && (
          <form className="inline-form" onSubmit={(e) => void create(e)}>
            <input
              aria-label="New document title"
              placeholder="Untitled plan"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className="button primary">
              New document
            </button>
          </form>
        )}
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {documents === null && !error && <p className="muted">Loading…</p>}
      {documents?.length === 0 && <p className="muted">No documents yet.</p>}
      <ul className="doc-list">
        {documents?.map((doc) => (
          <li key={doc.id}>
            <Link to={`/app/docs/${doc.id}`} className="doc-link">
              <span className="doc-title">{doc.title}</span>
              <span className="muted">Updated {dateFormat.format(new Date(doc.updatedAt))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
