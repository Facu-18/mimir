import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createTicketSchema,
  listTicketsQuerySchema,
  setTicketLabelsSchema,
  updateTicketSchema,
  type CreateTicketInput,
  type ListTicketsQuery,
  type SetTicketLabelsInput,
  type Ticket,
  type TicketList,
  type UpdateTicketInput,
} from '@mimir/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { toTicketDto } from './ticket.mapper.js';
import { TicketsService } from './tickets.service.js';

@Controller('projects/:projectId/tickets')
export class ProjectTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(listTicketsQuerySchema))
    query: ListTicketsQuery,
  ): Promise<TicketList> {
    const tickets = await this.tickets.list(projectId, query);
    return { items: tickets.map(toTicketDto) };
  }

  @Post()
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createTicketSchema)) input: CreateTicketInput,
  ): Promise<Ticket> {
    return toTicketDto(await this.tickets.create(projectId, input));
  }
}

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get(':ref')
  async findOne(@Param('ref') ref: string): Promise<Ticket> {
    return toTicketDto(await this.tickets.findByRef(ref));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTicketSchema)) input: UpdateTicketInput,
  ): Promise<Ticket> {
    return toTicketDto(await this.tickets.update(id, input));
  }

  @Put(':id/labels')
  async setLabels(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setTicketLabelsSchema))
    input: SetTicketLabelsInput,
  ): Promise<Ticket> {
    return toTicketDto(await this.tickets.setLabels(id, input.labelIds));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<Ticket> {
    return toTicketDto(await this.tickets.archive(id));
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@Param('id', ParseUUIDPipe) id: string): Promise<Ticket> {
    return toTicketDto(await this.tickets.restore(id));
  }

  @Post(':id/duplicate')
  async duplicate(@Param('id', ParseUUIDPipe) id: string): Promise<Ticket> {
    return toTicketDto(await this.tickets.duplicate(id));
  }
}
