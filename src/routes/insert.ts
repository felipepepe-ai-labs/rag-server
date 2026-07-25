import { z } from 'zod';

export const insertSchema = z.object({
  text: z.string().min(1).max(8192),
  vec_json: z.array(z.number()).min(1),
});

export function validateInsertInput(body: unknown): z.infer<typeof insertSchema> {
  return insertSchema.parse(body);
}

export interface InsertVectorStore {
  insert(text: string, vecJson: string): number | Promise<number>;
}

export function createInsertRoute(vstore: InsertVectorStore) {
  return async (body: unknown): Promise<{ id: number }> => {
    const validated = validateInsertInput(body);
    const id = Number(await Promise.resolve(vstore.insert(validated.text, JSON.stringify(validated.vec_json))));
    return { id };
  };
}
