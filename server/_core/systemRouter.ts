import { z } from "zod";
import { getDb } from "../db";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(async () => {
      const db = await getDb();
      return {
        ok: true,
        dbAvailable: Boolean(db),
      };
  }),
});
