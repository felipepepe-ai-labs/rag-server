import { z } from 'zod';
export const insertSchema = z.object({
    text: z.string().min(1).max(8192),
    vec_json: z.array(z.number()).min(1),
});
export function validateInsertInput(body) {
    return insertSchema.parse(body);
}
export function createInsertRoute(vstore) {
    return async (body) => {
        const validated = validateInsertInput(body);
        const id = Number(await Promise.resolve(vstore.insert(validated.text, JSON.stringify(validated.vec_json))));
        return { id };
    };
}
//# sourceMappingURL=insert.js.map