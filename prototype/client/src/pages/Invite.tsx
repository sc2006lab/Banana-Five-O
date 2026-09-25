// Accept a workspace invitation.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../state/AppState';
import { Icon, Notice, Spinner } from '../components/ui';

interface Preview {
  workspaceName: string;
  invitedBy: string;
  email: string;
  role: string;
  expiresAt: string;
}

export function InvitePage() {
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? '';
  const { me, loadingMe, refreshMe, toast } = useApp();
  const nav = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = `/invite?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    api<Preview>(`/invites/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((e) => setError((e as Error).message));
  }, [token]);

  const accept = async () => {
    try {
      const r = await api<{ message: string }>('/invites/accept', { method: 'POST', body: { token } });
      toast(r.message, 'success');
      await refreshMe();
      nav('/shortlist');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex justify-center px-4 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-burgundy/10 bg-white shadow-float">
        <div className="relative bg-burgundy px-6 py-8 text-center text-white">
          <div className="graticule graticule-dark pointer-events-none absolute inset-0" aria-hidden="true" />
          <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-peach text-burgundy">
            <Icon name="diversity_3" />
          </span>
          <p className="relative mt-4 font-mono text-[11px] tracking-[0.25em] text-peach/80 uppercase">You’re invited</p>
        </div>
        <div className="p-6">
          {error && <Notice tone="error">{error}</Notice>}
          {!preview && !error && <Spinner />}
          {preview && (
            <>
              <h1 className="font-display text-3xl text-burgundy">Join “{preview.workspaceName}”</h1>
              <p className="mt-2 text-muted">
                {preview.invitedBy} invited <strong>{preview.email}</strong> to plan together as a {preview.role.toLowerCase()}. You’ll share a shortlist and notes.
              </p>
              {loadingMe ? (
                <Spinner />
              ) : me ? (
                <button className="btn-primary mt-6 w-full py-3" onClick={accept}>
                  Accept and join
                </button>
              ) : (
                <div className="mt-6 grid gap-2">
                  <Link to={`/signin?next=${encodeURIComponent(next)}`} className="btn-dark w-full py-3">
                    Sign in to accept
                  </Link>
                  <Link to={`/register?next=${encodeURIComponent(next)}`} className="btn-secondary w-full py-3">
                    Create an account with {preview.email}
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
