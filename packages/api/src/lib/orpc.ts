import { auth } from "@repo/auth";
import type { Context as HonoContext } from "hono";

export interface CreateContextOptions {
  context: HonoContext;
}

export const createContext = async ({ context }: CreateContextOptions) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    session,
    headers: context.req.raw.headers,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
