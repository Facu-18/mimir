import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  type CreateProjectInput,
  type ListProjectsQuery,
  type Project,
  type ProjectList,
  type UpdateProjectInput,
} from '@mimir/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { toProjectDto } from './project.mapper.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema))
    query: ListProjectsQuery,
  ): Promise<ProjectList> {
    const projects = await this.projects.list(query);
    return { items: projects.map(toProjectDto) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createProjectSchema)) input: CreateProjectInput,
  ): Promise<Project> {
    return toProjectDto(await this.projects.create(input));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Project> {
    return toProjectDto(await this.projects.findById(id));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) input: UpdateProjectInput,
  ): Promise<Project> {
    return toProjectDto(await this.projects.update(id, input));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<Project> {
    return toProjectDto(await this.projects.archive(id));
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@Param('id', ParseUUIDPipe) id: string): Promise<Project> {
    return toProjectDto(await this.projects.restore(id));
  }
}
