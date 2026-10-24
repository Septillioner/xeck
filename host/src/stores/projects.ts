import { randomUUID } from 'node:crypto';
import { projectFilePath } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { MAX_PROJECT_NAME_CHARS } from '../../../shared/limits.ts';
import type { Project } from '../../../shared/types.ts';

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


interface ProjectIndexFile {
  projects: Project[];
}

export type ProjectNameErrorCode = 'empty' | 'too_long' | 'duplicate';

export class ProjectNameError extends Error {
  constructor(readonly code: ProjectNameErrorCode) {
    super(code);
  }
}

const exclusive = createMutex();

export function isProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

export async function listProjects(): Promise<Project[]> {
  return exclusive(async () => {
    const index = await readIndex();
    return index.projects.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  });
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isProjectId(id)) return null;
  return exclusive(async () => {
    const index = await readIndex();
    return index.projects.find((project) => project.id === id) ?? null;
  });
}

export async function createProject(rawName: string): Promise<Project> {
  return exclusive(async () => {
    const index = await readIndex();
    const name = validateProjectName(rawName, index.projects);
    const now = new Date().toISOString();
    const project: Project = { id: randomUUID(), name, createdAt: now, updatedAt: now };
    index.projects.push(project);
    await writeIndex(index);
    return project;
  });
}

export async function renameProject(id: string, rawName: string, pinned?: boolean): Promise<Project | null> {
  if (!isProjectId(id)) return null;
  return exclusive(async () => {
    const index = await readIndex();
    const project = index.projects.find((entry) => entry.id === id);
    if (!project) return null;
    project.name = validateProjectName(rawName, index.projects, id);
    if (pinned !== undefined) project.pinned = pinned;
    project.updatedAt = new Date().toISOString();
    await writeIndex(index);
    return project;
  });
}

export async function deleteProject(id: string): Promise<Project | null> {
  if (!isProjectId(id)) return null;
  return exclusive(async () => {
    const index = await readIndex();
    const project = index.projects.find((entry) => entry.id === id);
    if (!project) return null;
    index.projects = index.projects.filter((entry) => entry.id !== id);
    await writeIndex(index);
    return project;
  });
}

function validateProjectName(rawName: string, projects: Project[], exceptId?: string): string {
  const name = rawName.trim();
  if (!name) throw new ProjectNameError('empty');
  if (name.length > MAX_PROJECT_NAME_CHARS) throw new ProjectNameError('too_long');

  const normalizedName = name.toLowerCase();
  const duplicate = projects.some(
    (project) => project.id !== exceptId && project.name.trim().toLowerCase() === normalizedName,
  );
  if (duplicate) throw new ProjectNameError('duplicate');
  return name;
}

async function readIndex(): Promise<ProjectIndexFile> {
  const file = await readJson<ProjectIndexFile>(projectFilePath(), { projects: [] });
  if (!Array.isArray(file.projects)) return { projects: [] };
  return { projects: file.projects.filter(isProject) };
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<Project>;
  return isProjectId(project.id ?? '')
    && typeof project.name === 'string'
    && project.name.trim().length > 0
    && project.name.length <= MAX_PROJECT_NAME_CHARS
    && typeof project.createdAt === 'string'
    && typeof project.updatedAt === 'string';
}

async function writeIndex(index: ProjectIndexFile): Promise<void> {
  await writeJson(projectFilePath(), { projects: index.projects });
}
