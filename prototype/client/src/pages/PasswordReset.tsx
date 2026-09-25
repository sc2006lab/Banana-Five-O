// UC-1.3 Reset Password (FR-ACC-04): generic confirmation that never reveals whether an email is registered.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { forgotPasswordSchema, passwordSchema } from '@famplan/shared';
import { api, ApiError } from '../lib/api';
import { FieldError, Notice } from '../components/ui';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-burgundy/10 border-t-4 border-t-cinnabar bg-white p-6 shadow-float">
        <h1 className="text-2xl font-bold text-burgundy">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = forgotPasswordSchema.safeParse({ email });
    if (!v.success) return setErr(v.error.issues[0].message);
    setErr(undefined);
    try {
      const r = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: v.data });
      setDone(r.message);
    } catch (x) {
      setErr((x as ApiError).message);
    }
  };
  return (
    <Shell title="Reset your password">
      {done ? (
        <>
          <Notice className="mt-4">{done}</Notice>
          <Link to="/signin" className="btn-secondary mt-4 w-full">Back to sign in</Link>
        </>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
          <p className="text-sm text-muted">Enter your account email and we'll send a single-use link that expires in 30 minutes.</p>
          <div>
            <label htmlFor="email" className="label">Email address</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(err)} autoComplete="email" />
            <FieldError msg={err} />
          </div>
          <button className="btn-primary w-full">Send reset link</button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPasswordPage() {
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f: Record<string, string> = {};
    const v = passwordSchema.safeParse(pw);
    if (!v.success) f.password = v.error.issues[0].message;
    if (pw !== pw2) f.confirm = 'Passwords do not match.';
    setFields(f);
    if (Object.keys(f).length) return;
    try {
      const r = await api<{ message: string }>('/auth/reset-password', { method: 'POST', body: { token, password: pw } });
      setDone(r.message);
    } catch (x) {
      setError((x as ApiError).message);
      setFields((x as ApiError).fields);
    }
  };
  return (
    <Shell title="Choose a new password">
      {done ? (
        <>
          <Notice className="mt-4">{done}</Notice>
          <Link to="/signin" className="btn-primary mt-4 w-full">Sign in</Link>
        </>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
          {error && <Notice tone="error">{error} <Link to="/forgot-password" className="font-semibold underline">Request a new link</Link></Notice>}
          <div>
            <label htmlFor="pw" className="label">New password</label>
            <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-invalid={Boolean(fields.password)} />
            <FieldError msg={fields.password} />
          </div>
          <div>
            <label htmlFor="pw2" className="label">Confirm new password</label>
            <input id="pw2" type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" aria-invalid={Boolean(fields.confirm)} />
            <FieldError msg={fields.confirm} />
          </div>
          <button className="btn-primary w-full">Reset password</button>
        </form>
      )}
    </Shell>
  );
}
