// UC-1.4 Manage Account Details, UC-1.5 Delete Account.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayNameSchema, type Me } from '@famplan/shared';
import { api, ApiError } from '../lib/api';
import { useApp } from '../state/AppState';
import { FieldError, Icon, Notice } from '../components/ui';

export function AccountPage() {
  const { me, setMe, toast } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState(me!.displayName);
  const [nameErr, setNameErr] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [delErr, setDelErr] = useState<string>();

  const saveName = async () => {
    const v = displayNameSchema.safeParse(name);
    if (!v.success) return setNameErr(v.error.issues[0].message);
    try {
      const updated = await api<Me>('/account', { method: 'PATCH', body: { displayName: v.data } });
      setMe(updated);
      setNameErr(undefined);
      toast('Display name updated.', 'success');
    } catch (e) {
      setNameErr((e as ApiError).fields.displayName ?? (e as ApiError).message);
    }
  };

  const del = async () => {
    try {
      const r = await api<{ message: string }>('/account', { method: 'DELETE', body: { confirmation: confirmText } });
      setMe(null);
      toast(r.message, 'success');
      nav('/', { replace: true });
    } catch (e) {
      setDelErr((e as ApiError).fields.confirmation ?? (e as ApiError).message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <h1 className="text-4xl font-bold tracking-tight text-burgundy">Account</h1>

      <section className="card mt-6 p-6" aria-labelledby="details-h">
        <h2 id="details-h" className="text-lg font-semibold text-burgundy">Account details</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="dn" className="label">Display name</label>
            <div className="flex gap-2">
              <input id="dn" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(nameErr)} />
              <button className="btn-primary shrink-0" onClick={saveName} disabled={name.trim() === me!.displayName}>
                Save
              </button>
            </div>
            <FieldError msg={nameErr} />
          </div>
          <div>
            <p className="label">Email</p>
            <p className="text-sm text-muted">{me!.email} — email and password cannot be changed here. Use “Forgot password” to reset your password.</p>
          </div>
        </div>
      </section>

      <section className="card mt-6 border-poor/20 p-6" aria-labelledby="del-h">
        <h2 id="del-h" className="flex items-center gap-2 text-lg font-semibold text-poor">
          <Icon name="warning" /> Delete account
        </h2>
        <p className="mt-2 text-sm text-muted">
          Permanently deletes your account, saved family preferences, priority destinations, shortlist and private notes. This cannot be undone.
        </p>
        {!confirming ? (
          <button className="btn mt-4 border border-poor text-poor hover:bg-poor-bg" onClick={() => setConfirming(true)}>
            Delete my account…
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-lg bg-poor-bg/60 p-4">
            <Notice tone="error">Type DELETE to confirm. You will be signed out immediately.</Notice>
            <label htmlFor="confirm-del" className="label">Confirmation</label>
            <input id="confirm-del" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-invalid={Boolean(delErr)} autoComplete="off" />
            <FieldError msg={delErr} />
            <div className="flex gap-2">
              <button className="btn bg-poor text-white hover:bg-poor/90" disabled={confirmText !== 'DELETE'} onClick={del}>
                Permanently delete
              </button>
              <button className="btn-secondary" onClick={() => { setConfirming(false); setConfirmText(''); setDelErr(undefined); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
