// UC-6.3 Manage Shortlist and Notes (FR-DEC-05 – FR-DEC-07). Ownership enforced by scoping every query to req.user.
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { SHORTLIST_MAX, noteSchema, scoringParamsSchema, shortlistAddSchema, type ShortlistEntryDto } from '@famplan/shared';
import { prisma } from '../db.js';
import { HttpError, parse } from '../lib/http.js';
import { requireUser } from '../account/sessions.js';
import { index } from '../neighbourhoods/store.js';
import { scoringContext, summarise } from '../neighbourhoods/service.js';

export const shortlistRouter = Router();
shortlistRouter.use('/shortlist', requireUser);

const idParam = (v: unknown) => {
  const id = String(v);
  if (!/^[A-Z0-9]{2,12}$/.test(id)) throw new HttpError(400, 'Unknown neighbourhood.');
  return id;
};

shortlistRouter.get('/shortlist', async (req, res) => {
  const ctx = scoringContext(parse(scoringParamsSchema, req.query));
  const rows = await prisma.shortlistEntry.findMany({ where: { accountId: req.user!.id }, orderBy: { addedAt: 'asc' } });
  const out: ShortlistEntryDto[] = rows.map((r) => {
    const n = index.byId.get(r.neighbourhoodId);
    return {
      neighbourhoodId: r.neighbourhoodId,
      addedAt: r.addedAt.toISOString(),
      note: r.note,
      noteUpdatedAt: r.noteUpdatedAt?.toISOString() ?? null,
      neighbourhood: n ? summarise(n, ctx) : null,
    };
  });
  res.json({ max: SHORTLIST_MAX, entries: out });
});

shortlistRouter.post('/shortlist', async (req, res) => {
  const { neighbourhoodId } = parse(shortlistAddSchema, req.body);
  if (!index.byId.has(neighbourhoodId)) throw new HttpError(404, 'We could not find that neighbourhood.');
  const accountId = req.user!.id;
  const existing = await prisma.shortlistEntry.findUnique({ where: { accountId_neighbourhoodId: { accountId, neighbourhoodId } } });
  if (existing) {
    res.status(200).json({ status: 'ALREADY_SAVED', message: 'This neighbourhood is already in your shortlist.' });
    return;
  }
  try {
    await prisma.shortlistEntry.create({ data: { accountId, neighbourhoodId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(200).json({ status: 'ALREADY_SAVED', message: 'This neighbourhood is already in your shortlist.' });
      return;
    }
    if (String((e as Error).message).includes('SHORTLIST_FULL'))
      throw new HttpError(409, `Your shortlist is full (maximum ${SHORTLIST_MAX}). Remove a neighbourhood before adding another.`);
    throw e;
  }
  res.status(201).json({ status: 'ADDED', message: 'Added to your shortlist.' });
});

shortlistRouter.delete('/shortlist/:neighbourhoodId', async (req, res) => {
  const neighbourhoodId = idParam(req.params.neighbourhoodId);
  const r = await prisma.shortlistEntry.deleteMany({ where: { accountId: req.user!.id, neighbourhoodId } });
  if (r.count === 0) throw new HttpError(404, 'That neighbourhood is not in your shortlist.');
  res.json({ message: 'Removed from your shortlist.' });
});

shortlistRouter.put('/shortlist/:neighbourhoodId/note', async (req, res) => {
  const neighbourhoodId = idParam(req.params.neighbourhoodId);
  const { text } = parse(noteSchema, req.body);
  const r = await prisma.shortlistEntry.updateMany({
    where: { accountId: req.user!.id, neighbourhoodId },
    data: { note: text, noteUpdatedAt: new Date() },
  });
  if (r.count === 0) throw new HttpError(404, 'Add this neighbourhood to your shortlist before writing a note.');
  res.json({ note: text, message: text ? 'Note saved.' : 'Note cleared.' });
});
