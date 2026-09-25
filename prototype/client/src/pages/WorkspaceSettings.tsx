// Workspace & team: switch/create workspaces, manage members and invitations.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { inviteSchema, planOf, workspaceNameSchema, type InviteDto, type MemberDto, type WorkspaceSummary } from '@famplan/shared';
import { api, ApiError, fmtDate } from '../lib/api';
import { useApp } from '../state/AppState';
import { SettingsNav, UsageMeter } from '../components/SettingsNav';
import { FieldError, Icon, Notice, Spinner } from '../components/ui';

interface MembersResponse {
  role: MemberDto['role'];
  memberLimit: number;
  members: MemberDto[];
  invites: InviteDto[];
}

export function WorkspaceSettingsPage() {
  const { me, refreshMe, refreshWorkspaces, switchWorkspace, toast } = useApp();
  const [list, setList] = useState<{ activeWorkspaceId: string | null; workspaces: WorkspaceSummary[]; ownedCount: number; ownedLimit: number } | null>(null);
  const [team, setTeam] = useState<MembersResponse | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [inviteErr, setInviteErr] = useState<ApiError | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newErr, setNewErr] = useState<string>();
  const [rename, setRename] = useState('');
  const ws = me?.workspace ?? null;

  const load = useCallback(async () => {
    const l = await api<NonNullable<typeof list>>('/workspaces');
    setList(l);
    if (ws) {
      setTeam(await api<MembersResponse>(`/workspaces/${ws.id}/members`));
      setRename(ws.name);
    }
  }, [ws?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = 'Workspace & team | FamPlan';
    void load().catch((e) => toast((e as Error).message, 'error'));
  }, [load, toast]);

  const after = async (msg: string) => {
    toast(msg, 'success');
    await Promise.all([refreshMe(), refreshWorkspaces(), load()]);
  };

  const invite = async () => {
    setInviteErr(null);
    const v = inviteSchema.safeParse({ email: inviteEmail, role: inviteRole });
    if (!v.success) return setInviteErr(new ApiError(400, v.error.issues[0].message, { email: v.error.issues[0].message }));
    try {
      const r = await api<InviteDto>(`/workspaces/${ws!.id}/invites`, { method: 'POST', body: v.data });
      setLastLink(r.link ?? null);
      setInviteEmail('');
      await after(`Invite sent to ${r.email}.`);
    } catch (e) {
      setInviteErr(e as ApiError);
    }
  };

  const create = async () => {
    const v = workspaceNameSchema.safeParse({ name: newName });
    if (!v.success) return setNewErr(v.error.issues[0].message);
    try {
      await api('/workspaces', { method: 'POST', body: v.data });
      setNewName('');
      setNewErr(undefined);
      await after(`Created “${v.data.name}” and switched to it.`);
    } catch (e) {
      setNewErr((e as Error).message);
    }
  };

  if (!ws || !list || !team) return <div className="mx-auto max-w-4xl px-4 py-8 md:px-8"><SettingsNav /><Spinner /></div>;
  const canManage = team.role !== 'MEMBER';
  const plan = planOf(ws.plan);
  const pending = team.invites.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <h1 className="font-display text-5xl text-burgundy">Settings</h1>
      <p className="mt-1 mb-6 text-muted">Manage who plans with you and which workspace you’re in.</p>
      <SettingsNav />

      <section className="card p-6" aria-labelledby="cur-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Current workspace</p>
            <h2 id="cur-h" className="mt-1 font-display text-3xl text-burgundy">{ws.name}</h2>
            <p className="text-sm text-muted">
              Owned by {ws.ownerName} · <span className="font-semibold text-cinnabar">{plan.name} plan</span> · you are {ws.role.toLowerCase()}
            </p>
          </div>
          {ws.role === 'OWNER' && ws.plan === 'household' && (
            <Link to="/settings/billing" className="btn-primary">
              <Icon name="upgrade" className="!text-[18px]" /> Upgrade to plan together
            </Link>
          )}
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <UsageMeter label="People" used={ws.memberCount + pending} limit={ws.memberLimit} />
          <UsageMeter label="Shortlisted neighbourhoods" used={ws.shortlistCount} limit={ws.shortlistLimit} />
        </div>
        {canManage && (
          <div className="mt-6 flex flex-wrap items-end gap-2 border-t border-line-soft pt-5">
            <div className="min-w-60 flex-1">
              <label htmlFor="rename" className="label">Workspace name</label>
              <input id="rename" className="input" value={rename} maxLength={60} onChange={(e) => setRename(e.target.value)} />
            </div>
            <button
              className="btn-secondary"
              disabled={!rename.trim() || rename.trim() === ws.name}
              onClick={async () => {
                try {
                  await api(`/workspaces/${ws.id}`, { method: 'PATCH', body: { name: rename } });
                  await after('Workspace renamed.');
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Rename
            </button>
          </div>
        )}
      </section>

      <section className="card mt-6 p-6" aria-labelledby="team-h">
        <h2 id="team-h" className="text-xl font-semibold text-burgundy">People</h2>
        <ul className="mt-4 divide-y divide-line-soft">
          {team.members.map((m) => (
            <li key={m.accountId} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-peach font-semibold text-burgundy">{m.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">
                  {m.displayName} {m.accountId === me!.id && <span className="text-xs font-normal text-muted">(you)</span>}
                </span>
                <span className="block truncate text-xs text-muted">{m.email} · joined {fmtDate(m.joinedAt)}</span>
              </span>
              {ws.role === 'OWNER' && m.role !== 'OWNER' ? (
                <select
                  aria-label={`Role for ${m.displayName}`}
                  className="input !w-28 !py-1"
                  value={m.role}
                  onChange={async (e) => {
                    try {
                      await api(`/workspaces/${ws.id}/members/${m.accountId}`, { method: 'PATCH', body: { role: e.target.value } });
                      await after('Role updated.');
                    } catch (x) {
                      toast((x as Error).message, 'error');
                    }
                  }}
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              ) : (
                <span className="chip">{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</span>
              )}
              {m.role !== 'OWNER' && (canManage || m.accountId === me!.id) && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={async () => {
                    const self = m.accountId === me!.id;
                    try {
                      const r = await api<{ message: string }>(`/workspaces/${ws.id}/members/${m.accountId}`, { method: 'DELETE', body: {} });
                      await after(r.message);
                      if (self) await refreshMe();
                    } catch (x) {
                      toast((x as Error).message, 'error');
                    }
                  }}
                >
                  {m.accountId === me!.id ? 'Leave' : 'Remove'}
                </button>
              )}
            </li>
          ))}
          {team.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-line text-muted">
                <Icon name="mail" className="!text-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{i.email}</span>
                <span className="block text-xs text-muted">Invited · expires {fmtDate(i.expiresAt)}</span>
              </span>
              <span className="chip">Pending</span>
              <button
                className="btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await api(`/workspaces/${ws.id}/invites/${i.id}`, { method: 'DELETE', body: {} });
                    await after('Invite revoked.');
                  } catch (x) {
                    toast((x as Error).message, 'error');
                  }
                }}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>

        {canManage && (
          <div className="mt-5 rounded-lg bg-blush/60 p-4">
            <h3 className="font-semibold text-burgundy">Invite someone</h3>
            {ws.plan === 'household' ? (
              <p className="mt-1 text-sm text-muted">
                The Household plan is for one person. <Link to="/settings/billing" className="font-semibold text-cinnabar hover:underline">Upgrade to Family</Link> to invite a partner or grandparents.
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label htmlFor="inv-email" className="sr-only">Email address</label>
                  <input
                    id="inv-email"
                    type="email"
                    className="input min-w-60 flex-1"
                    placeholder="name@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    aria-invalid={Boolean(inviteErr?.fields.email)}
                  />
                  <label htmlFor="inv-role" className="sr-only">Role</label>
                  <select id="inv-role" className="input !w-32" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')}>
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button className="btn-primary" onClick={invite}>
                    <Icon name="send" className="!text-[18px]" /> Send invite
                  </button>
                </div>
                <FieldError msg={inviteErr?.fields.email ?? inviteErr?.message} />
                {lastLink && (
                  <div className="mt-3 flex items-center gap-2 rounded border border-line bg-white px-3 py-2 text-xs">
                    <Icon name="link" className="!text-[16px] text-cinnabar" />
                    <code className="min-w-0 flex-1 truncate">{lastLink}</code>
                    <button
                      className="font-semibold text-cinnabar hover:underline"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(lastLink).catch(() => undefined);
                        toast('Invite link copied.', 'success');
                      }}
                    >
                      Copy link
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {ws.role === 'OWNER' && !ws.personal && (
          <button
            className="btn mt-5 border border-poor text-poor hover:bg-poor-bg"
            onClick={async () => {
              if (!window.confirm(`Delete “${ws.name}” and its shared shortlist for everyone? This cannot be undone.`)) return;
              try {
                const r = await api<{ message: string }>(`/workspaces/${ws.id}`, { method: 'DELETE', body: {} });
                await after(r.message);
              } catch (x) {
                toast((x as Error).message, 'error');
              }
            }}
          >
            Delete this workspace
          </button>
        )}
      </section>

      <section className="card mt-6 p-6" aria-labelledby="all-h">
        <div className="flex items-baseline justify-between">
          <h2 id="all-h" className="text-xl font-semibold text-burgundy">All your workspaces</h2>
          <span className="font-mono text-xs text-muted">
            You own {list.ownedCount} of {list.ownedLimit}
          </span>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {list.workspaces.map((w) => (
            <li key={w.id} className={`rounded-lg border p-4 transition-colors ${w.id === ws.id ? 'border-cinnabar bg-blush/50' : 'border-burgundy/10 bg-white'}`}>
              <p className="font-semibold text-burgundy">{w.name}</p>
              <p className="text-xs text-muted">
                {w.role.toLowerCase()} · {w.memberCount} {w.memberCount === 1 ? 'person' : 'people'} · {w.shortlistCount}/{w.shortlistLimit} shortlisted
              </p>
              {w.id !== ws.id && (
                <button className="mt-2 text-sm font-semibold text-cinnabar hover:underline" onClick={() => switchWorkspace(w.id).then(load)}>
                  Switch to this workspace
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-5 border-t border-line-soft pt-5">
          <h3 className="font-semibold text-burgundy">New client workspace</h3>
          {list.ownedCount < list.ownedLimit ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                <label htmlFor="new-ws" className="sr-only">Workspace name</label>
                <input id="new-ws" className="input min-w-60 flex-1" placeholder="e.g. Tan family relocation" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
                <button className="btn-secondary" onClick={create}>
                  <Icon name="add" className="!text-[18px]" /> Create
                </button>
              </div>
              <FieldError msg={newErr} />
            </>
          ) : (
            <Notice className="mt-2">
              {me?.plan === 'advisor' ? 'You’ve reached the Advisor limit of 25 workspaces.' : 'Separate client workspaces are part of the Advisor plan.'}{' '}
              {me?.plan !== 'advisor' && <Link to="/settings/billing" className="font-semibold underline">See plans</Link>}
            </Notice>
          )}
        </div>
      </section>
    </div>
  );
}
