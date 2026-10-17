import { Hono } from 'hono';
import { PlanRejected } from '../../plans/plan-store.ts';
import { changedFiles, readPlanView, setTodoFromUser } from '../../plans/plan-service.ts';
import { isSessionId } from '../../stores/sessions.ts';
import { readBody } from '../request.ts';

/** The plan of a session: read it or tick a step. */
export const planRoutes = new Hono();

planRoutes.get('/api/sessions/:id/plan', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  return c.json({ plan: await readPlanView(id) });
});


// The files this chat changed, one row per file with summed line counts.
planRoutes.get('/api/sessions/:id/changes', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  return c.json({ files: await changedFiles(id) });
});

planRoutes.put('/api/sessions/:id/plan/todos/:todoId', async (c) => {
  const id = c.req.param('id');
  if (!isSessionId(id)) return c.json({ error: 'Session not found' }, 404);
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  try {
    const plan = await setTodoFromUser(id, c.req.param('todoId'), {
      status: typeof body.status === 'string' ? body.status : '',
      note: typeof body.note === 'string' ? body.note : undefined,
      revision: typeof body.revision === 'number' ? body.revision : undefined,
    });
    return c.json({ plan });
  } catch (error) {
    // A stale revision means the model or another window moved the plan on.
    if (error instanceof PlanRejected) return c.json({ error: error.message }, 409);
    throw error;
  }
});