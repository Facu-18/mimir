import type { Project as ProjectDto } from '@mimir/contracts';
import type { Project } from '../generated/prisma/client.js';

export function toProjectDto(project: Project): ProjectDto {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    icon: project.icon,
    color: project.color,
    status: project.status,
    isFavorite: project.isFavorite,
    sortOrder: project.sortOrder,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
  };
}
