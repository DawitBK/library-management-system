import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ZodValidationPipe } from '@library/kit';
import type { Response } from 'express';
import { CurrentUser, Roles, STAFF, type Principal } from '../common/auth.js';
import {
  createLoanSchema,
  idempotencyHeaderSchema,
  idParamsSchema,
  listFinesQuerySchema,
  listLoansQuerySchema,
  popularGenresQuerySchema,
  waiveFineSchema,
  type CreateLoan,
  type ListFinesQuery,
  type ListLoansQuery,
  type PopularGenresQuery,
  type WaiveFine,
} from './circulation.contract.js';
import { CirculationService } from './circulation.service.js';

const idParams = new ZodValidationPipe(idParamsSchema);

/** Everything here is desk work: signed-in staff only. */
@Roles(...STAFF)
@Controller('api/v1')
export class CirculationController {
  constructor(@Inject(CirculationService) private readonly circulation: CirculationService) {}

  @Post('loans')
  async borrow(
    @CurrentUser() actor: Principal,
    @Req() req: { headers: unknown },
    @Body(new ZodValidationPipe(createLoanSchema)) body: CreateLoan,
    @Res({ passthrough: true }) res: Response,
  ) {
    const headers = idempotencyHeaderSchema.parse(req.headers);
    const result = await this.circulation.borrow(actor, body, headers['idempotency-key']);
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replay', 'true');
    return result.body;
  }

  @Get('loans')
  listLoans(@Query(new ZodValidationPipe(listLoansQuerySchema)) query: ListLoansQuery) {
    return this.circulation.listLoans(query);
  }

  @Get('loans/:id')
  getLoan(@Param(idParams) p: { id: string }) {
    return this.circulation.getLoan(p.id);
  }

  @Post('loans/:id/return')
  @HttpCode(200)
  returnLoan(@CurrentUser() actor: Principal, @Param(idParams) p: { id: string }) {
    return this.circulation.return(actor, p.id);
  }

  @Post('loans/:id/renew')
  @HttpCode(200)
  renewLoan(@CurrentUser() actor: Principal, @Param(idParams) p: { id: string }) {
    return this.circulation.renew(actor, p.id);
  }

  @Get('fines')
  listFines(@Query(new ZodValidationPipe(listFinesQuerySchema)) query: ListFinesQuery) {
    return this.circulation.listFines(query);
  }

  @Post('fines/:id/pay')
  @HttpCode(200)
  payFine(@CurrentUser() actor: Principal, @Param(idParams) p: { id: string }) {
    return this.circulation.payFine(actor, p.id);
  }

  /** Waiving money owed is an administrator's call, and it records why. */
  @Roles('admin')
  @Post('fines/:id/waive')
  @HttpCode(200)
  waiveFine(
    @CurrentUser() actor: Principal,
    @Param(idParams) p: { id: string },
    @Body(new ZodValidationPipe(waiveFineSchema)) body: WaiveFine,
  ) {
    return this.circulation.waiveFine(actor, p.id, body);
  }

  @Get('reports/overdue')
  overdue() {
    return this.circulation.overdueReport();
  }

  @Get('reports/popular-genres')
  popularGenres(@Query(new ZodValidationPipe(popularGenresQuerySchema)) query: PopularGenresQuery) {
    return this.circulation.popularGenres(query);
  }

  @Get('reports/summary')
  summary() {
    return this.circulation.summary();
  }
}
