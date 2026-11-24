import { z } from 'zod';

export const documentIdSchema = z.string().uuid();

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export interface DocumentSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  readonly text: string;
  readonly vector: Readonly<Record<string, number>>;
  readonly opCount: number;
}
