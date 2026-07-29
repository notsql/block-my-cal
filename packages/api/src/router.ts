import type { RouterClient } from "@orpc/server";
import { lazy } from "@orpc/server";

export const appRouter = {
  health: lazy(() => import("./controllers/health.controller")),
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
