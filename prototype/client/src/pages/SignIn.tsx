// UC-1.1 Register Account, UC-1.2 Login.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loginSchema, registerSchema, type Me } from '@famplan/shared';
import { api, ApiError } from '../lib/api';
import { useApp } from '../state/AppState';
import { FieldError, Icon, Notice } from '../components/ui';

function zodFields(issues: { path: PropertyKey[]; message: string }[]) {
  const f: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? '_');
    f[k] ??= i.message;
  }
  return f;
}

export function SignInPage({ initialTab = 'signin' }: { initialTab?: 'signin' | 'register' }) {
  const [tab, setTab] = useState<'signin' | 'register'>(initialTab);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', consent: false });
  const [show, setShow] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setMe, toast } = useApp();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const requestedNext = sp.get('next');
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\\\') ? requestedNext : '/explore';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const schema = tab === 'signin' ? loginSchema : registerSchema;
    const input = tab === 'signin' ? { email: form.email, password: form.password } : form;
    const v = schema.safeParse(input);
    if (!v.success) {
      setFields(zodFields(v.error.issues));
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const me = await api<Me>(tab === 'signin' ? '/auth/login' : '/auth/register', { method: 'POST', body: v.data });
      setMe(me);
      toast(tab === 'signin' ? `Welcome back, ${me.displayName}.` : `Account created. Welcome, ${me.displayName}!`, 'success');
      nav(tab === 'register' ? '/preferences' : next, { replace: true });
    } catch (x) {
      const err = x as ApiError;
      setFields(err.fields);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = (k: 'displayName' | 'email' | 'password', label: string, type = 'text', extra: Record<string, string> = {}) => (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={k} className="label">
          {label}
        </label>
        {k === 'password' && tab === 'signin' && (
          <Link to="/forgot-password" className="text-xs font-semibold text-cinnabar hover:underline">
            Forgot password?
          </Link>
        )}
      </div>
      <div className="relative">
        <input
          id={k}
          type={k === 'password' && show ? 'text' : type}
          className="input"
          value={form[k]}
          aria-invalid={Boolean(fields[k])}
          aria-describedby={fields[k] ? `${k}-err` : undefined}
          onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
          {...extra}
        />
        {k === 'password' && (
          <button type="button" className="absolute top-2 right-2 text-muted hover:text-burgundy" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
            <Icon name={show ? 'visibility_off' : 'visibility'} className="!text-[20px]" />
          </button>
        )}
      </div>
      <FieldError id={`${k}-err`} msg={fields[k]} />
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-64px)] items-start justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-burgundy/10 border-t-4 border-t-cinnabar bg-white shadow-float">
        <div className="bg-surface px-6 pt-6 pb-4 text-center">
          <p className="text-2xl font-bold text-cinnabar">FamPlan</p>
          <p className="mt-1 text-sm text-muted">{tab === 'signin' ? 'Sign in to access your saved preferences and shortlist' : 'Create an account to save preferences and a shortlist'}</p>
        </div>
        <div className="grid grid-cols-2 border-b border-line-soft" role="tablist">
          {(
            [
              ['signin', 'Sign In'],
              ['register', 'Create Account'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={`-mb-px border-b-2 py-3 text-sm font-semibold ${tab === k ? 'border-cinnabar text-burgundy' : 'border-transparent text-muted hover:text-burgundy'}`}
              onClick={() => {
                setTab(k);
                setFields({});
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <form className="space-y-4 px-6 py-6" onSubmit={submit} noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          {tab === 'register' && input('displayName', 'Display name', 'text', { autoComplete: 'nickname', maxLength: '60' })}
          {input('email', 'Email address', 'email', { autoComplete: 'email', placeholder: 'name@example.com' })}
          {input('password', 'Password', 'password', { autoComplete: tab === 'signin' ? 'current-password' : 'new-password' })}
          {tab === 'register' && (
            <>
              <p className="-mt-2 text-xs text-muted">At least 10 characters, including a letter and a number.</p>
              <div>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-cinnabar"
                    checked={form.consent}
                    onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                    aria-invalid={Boolean(fields.consent)}
                    aria-describedby="consent-err"
                  />
                  <span>
                    I agree that FamPlan stores my display name, email, family planning stages, preferred areas, destinations, weights, shortlist and private notes
                    solely to provide these features. I can delete my account and all of this data at any time.
                  </span>
                </label>
                <FieldError id="consent-err" msg={fields.consent} />
              </div>
            </>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
            <Icon name="arrow_forward" className="!text-[18px]" />
          </button>
          <p className="flex items-center justify-center gap-1 border-t border-line-soft pt-4 text-xs text-muted">
            <Icon name="lock" className="!text-[14px]" />
            Passwords are hashed with Argon2id. We never ask for children's names or birth dates.
          </p>
        </form>
      </div>
    </div>
  );
}
