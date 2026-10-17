import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '@library/kit';
import { CurrentUser, Roles, STAFF, type Principal } from '../common/auth.js';
import {
  idParamsSchema,
  listHoldsQuerySchema,
  placeHoldSchema,
  type ListHoldsQuery,
  type PlaceHold,
} from './holds.contract.js';
import { HoldsService } from './holds.service.js';

const idParams = new ZodValidationPipe(idParamsSchema);

/** Desk work: the queue is kept by staff on behalf of members, who do not sign in. */
@Roles(...STAFF)
@Controller('api/v1/holds')
export class HoldsController {
  constructor(@Inject(HoldsService) private readonly holds: HoldsService) {}

  @Post()
  place(
    @CurrentUser() actor: Principal,
    @Body(new ZodValidationPipe(placeHoldSchema)) body: PlaceHold,
  ) {
    return this.holds.place(actor, body);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listHoldsQuerySchema)) query: ListHoldsQuery) {
    return this.holds.list(query);
  }

  @Post('process')
  @HttpCode(200)
  process(@CurrentUser() actor: Principal) {
    return this.holds.process(actor);
  }

  @Get(':id')
  get(@Param(idParams) p: { id: string }) {
    return this.holds.get(p.id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() actor: Principal, @Param(idParams) p: { id: string }) {
    return this.holds.cancel(actor, p.id);
  }
}
