// import { OpenAPIHandler } from "@orpc/openapi/fetch";
// import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
// import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@repo/api/lib/orpc";
import { appRouter } from "@repo/api/router";
import { auth } from "@repo/auth";
import { env } from "@repo/env/server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Hono } from "hono/quick";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    origin: env.CORS_ORIGIN,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// export const apiHandler = new OpenAPIHandler(appRouter, {
//   plugins: [
//     new OpenAPIReferencePlugin({
//       schemaConverters: [new ZodToJsonSchemaConverter()],
//     }),
//   ],
//   interceptors: [
//     onError((error) => {
//       console.error(error);
//     }),
//   ],
// });

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    context,
    prefix: "/rpc",
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  // const apiResult = await apiHandler.handle(c.req.raw, {
  //   prefix: "/api-reference",
  //   context: context,
  // });

  // if (apiResult.matched) {
  //   return c.newResponse(apiResult.response.body, apiResult.response);
  // }

  await next();
});

export default app;
