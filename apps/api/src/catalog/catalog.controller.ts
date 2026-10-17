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
import { paginationQuerySchema, ZodValidationPipe, type Pagination } from '@library/kit';
import { CurrentUser, Public, Roles, STAFF, type Principal } from '../common/auth.js';
import {
  addCopiesSchema,
  createBookSchema,
  createGenreSchema,
  idParamsSchema,
  listBooksQuerySchema,
  setCopyStatusSchema,
  updateBookSchema,
  updateGenreSchema,
  type AddCopies,
  type CreateBook,
  type CreateGenre,
  type ListBooksQuery,
  type SetCopyStatus,
  type UpdateBook,
  type UpdateGenre,
} from './catalog.contract.js';
import { CatalogService } from './catalog.service.js';

const idParams = new ZodValidationPipe(idParamsSchema);

@Controller('api/v1')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  // ---- genres ----

  @Public()
  @Get('genres')
  listGenres(@Query(new ZodValidationPipe(paginationQuerySchema)) page: Pagination) {
    return this.catalog.listGenres(page);
  }

  @Roles(...STAFF)
  @Post('genres')
  createGenre(
    @CurrentUser() actor: Principal,
    @Body(new ZodValidationPipe(createGenreSchema)) body: CreateGenre,
  ) {
    return this.catalog.createGenre(actor, body);
  }

  @Roles(...STAFF)
  @Patch('genres/:id')
  updateGenre(
    @CurrentUser() actor: Principal,
    @Param(idParams) p: { id: string },
    @Body(new ZodValidationPipe(updateGenreSchema)) body: UpdateGenre,
  ) {
    return this.catalog.updateGenre(actor, p.id, body);
  }

  @Roles(...STAFF)
  @Delete('genres/:id')
  @HttpCode(204)
  async deleteGenre(@CurrentUser() actor: Principal, @Param(idParams) p: { id: string }) {
    await this.catalog.deleteGenre(actor, p.id);
  }

  // ---- books (the public catalogue) ----

  @Public()
  @Get('books')
  listBooks(@Query(new ZodValidationPipe(listBooksQuerySchema)) query: ListBooksQuery) {
    return this.catalog.listBooks(query);
  }

  @Public()
  @Get('books/:id')
  getBook(@Param(idParams) p: { id: string }) {
    return this.catalog.getBook(p.id);
  }

  @Roles(...STAFF)
  @Post('books')
  createBook(
    @CurrentUser() actor: Principal,
    @Body(new ZodValidationPipe(createBookSchema)) body: CreateBook,
  ) {
    return this.catalog.createBook(actor, body);
  }

  @Roles(...STAFF)
  @Patch('books/:id')
  updateBook(
    @CurrentUser() actor: Principal,
    @Param(idParams) p: { id: string },
    @Body(new ZodValidationPipe(updateBookSchema)) body: UpdateBook,
  ) {
    return this.catalog.updateBook(actor, p.id, body);
  }

  @Roles(...STAFF)
  @Delete('books/:id')
  @HttpCode(204)
  async deleteBook(@CurrentUser() actor: Principal, @Param(idParams) p: { id: string }) {
    await this.catalog.deleteBook(actor, p.id);
  }

  // ---- copies ----

  @Roles(...STAFF)
  @Get('books/:id/copies')
  listCopies(@Param(idParams) p: { id: string }) {
    return this.catalog.listCopies(p.id);
  }

  @Roles(...STAFF)
  @Post('books/:id/copies')
  addCopies(
    @CurrentUser() actor: Principal,
    @Param(idParams) p: { id: string },
    @Body(new ZodValidationPipe(addCopiesSchema)) body: AddCopies,
  ) {
    return this.catalog.addCopies(actor, p.id, body);
  }

  @Roles(...STAFF)
  @Patch('copies/:id')
  setCopyStatus(
    @CurrentUser() actor: Principal,
    @Param(idParams) p: { id: string },
    @Body(new ZodValidationPipe(setCopyStatusSchema)) body: SetCopyStatus,
  ) {
    return this.catalog.setCopyStatus(actor, p.id, body);
  }
}
