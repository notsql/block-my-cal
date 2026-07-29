import { neon } from "@neondatabase/serverless";
import { env } from "@repo/env/server";
import { drizzle } from "drizzle-orm/neon-http";
import * as auth from "./schema/auth";
import * as relations from "./schema/relations";
import * as user from "./schema/user";

export const db = drizzle(neon(env.DATABASE_URL || ""), {
  schema: {
    ...auth,
    ...user,
    ...relations,
  },
});
