import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '@library/kit';
import { CurrentUser, Roles, STAFF, type Principal } from '../common/auth.js';
import {
  createMemberSchema,
  idParamsSchema,
  listMembersQuerySchema,
  updateMemberSchema,
  type CreateMember,
  type ListMembersQuery,
  type UpdateMember,
} from './members.contract.js';
import { MembersService } from './members.service.js';

const idParams = new ZodValidationPipe(idParamsSchema);

/** Members are the library's patrons: records that staff manage. They do not sign in. */
@Roles(...STAFF)
@Controller('api/v1/members')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Post()
  create(
    @CurrentUser() actor: Principal,
    @Body(new ZodValidationPipe(createMemberSchema)) body: CreateMember,
  ) {
    return this.members.create(actor, body);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listMembersQuerySchema)) query: ListMembersQuery) {
    return this.members.list(query);
  }

  @Get(':id')
  get(@Param(idParams) p: { id: string }) {
    return this.members.get(p.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: Principal,
    @Param(idParams) p: { id: string },
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMember,
  ) {
    return this.members.update(actor, p.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: Principal, @Param(idParams) p: { id: string }) {
    await this.members.remove(actor, p.id);
  }
}
