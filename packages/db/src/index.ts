import { Client } from "pg";
import { env } from "@repo/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import * as auth from "./schema/auth";
import * as relations from "./schema/relations";
import * as user from "./schema/user";

const client = new Client({
  connectionString: env.HYPERDRIVE?.connectionString,
});

export const db = drizzle({
  client,
  schema: {
    ...auth,
    ...user,
    ...relations,
  },
});
