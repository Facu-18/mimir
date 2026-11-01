import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  createTicketSchema,
  listTicketsQuerySchema,
  type CreateTicketInput,
  type ListTicketsQuery,
  type Ticket,
  type TicketList,
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
}
