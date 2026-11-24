import { createDocumentSchema, documentIdSchema, type DocumentDetail } from '@quillsync/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { requirePermission } from '../../http/auth-guard.js';
import { ok } from '../../http/envelope.js';
import { notFound } from '../../http/errors.js';
import { recordAudit } from '../audit/audit.repository.js';
import { findDocument, insertDocument, listDocuments } from './documents.repository.js';

const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const idParamsSchema = z.object({ id: documentIdSchema });

export function registerDocumentRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/documents', async (request) => {
    const auth = requirePermission(request, 'document:read');
    const { limit } = listQuerySchema.parse(request.query);
    const documents = await listDocuments(ctx.db, auth.organizationId, limit);
    return ok(documents, { count: documents.length, limit });
  });

  app.post('/api/v1/documents', async (request, reply) => {
    const auth = requirePermission(request, 'document:create');
    const input = createDocumentSchema.parse(request.body);
    const document = await insertDocument(ctx.db, {
      organizationId: auth.organizationId,
      title: input.title,
      createdBy: auth.userId,
    });
    await recordAudit(ctx.db, {
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'document.create',
      targetType: 'document',
      targetId: document.id,
      requestId: request.id,
    });
    return reply.status(201).send(ok(document));
  });

  app.get('/api/v1/documents/:id', async (request) => {
    const auth = requirePermission(request, 'document:read');
    const { id } = idParamsSchema.parse(request.params);
    const document = await findDocument(ctx.db, auth.organizationId, id);
    if (!document) throw notFound('Document');
    const snapshot = await ctx.rooms.snapshot(id, auth.organizationId);
    const detail: DocumentDetail = { ...document, ...snapshot };
    return ok(detail);
  });

  app.get('/api/v1/documents/:id/presence', async (request) => {
    const auth = requirePermission(request, 'document:read');
    const { id } = idParamsSchema.parse(request.params);
    if (!(await findDocument(ctx.db, auth.organizationId, id))) throw notFound('Document');
    return ok(await ctx.rooms.peers(id));
  });
}
