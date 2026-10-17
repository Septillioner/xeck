import { Hono, type Context } from 'hono';
import {
  createProject,
  deleteProject,
  getProject,
  isProjectId,
  listProjects,
  ProjectNameError,
  renameProject,
  type ProjectNameErrorCode,
} from '../../stores/projects.ts';
import { unassignProjectSessions } from '../../stores/sessions.ts';
import { readBody } from '../request.ts';

export const projectRoutes = new Hono();

projectRoutes.get('/api/projects', async (c) => c.json(await listProjects()));

projectRoutes.post('/api/projects', async (c) => {
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  const name = typeof body.name === 'string' ? body.name : '';
  try {
    return c.json(await createProject(name), 201);
  } catch (cause) {
    return projectNameErrorResponse(c, cause);
  }
});

projectRoutes.patch('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  if (!isProjectId(id)) return c.json({ error: 'Project not found' }, 404);
  const body = await readBody(c);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  const name = typeof body.name === 'string' ? body.name : '';
  try {
    const project = await renameProject(id, name);
    if (!project) return c.json({ error: 'Project not found' }, 404);
    return c.json(project);
  } catch (cause) {
    return projectNameErrorResponse(c, cause);
  }
});

projectRoutes.delete('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  if (!isProjectId(id)) return c.json({ error: 'Project not found' }, 404);
  const existing = await getProject(id);
  if (!existing) return c.json({ error: 'Project not found' }, 404);

  await unassignProjectSessions(id);
  const project = await deleteProject(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json({ ok: true });
});

function projectNameErrorResponse(c: Context, cause: unknown) {
  if (!(cause instanceof ProjectNameError)) throw cause;
  const status = cause.code === 'duplicate' ? 409 : 400;
  return c.json({ error: projectNameErrorMessage(cause.code) }, status);
}

function projectNameErrorMessage(code: ProjectNameErrorCode): string {
  if (code === 'empty') return 'Project name is required';
  if (code === 'too_long') return 'Project name is too long';
  return 'A project with this name already exists';
}
