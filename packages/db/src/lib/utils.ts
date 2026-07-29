import { type AnyPgColumn, text, timestamp } from "drizzle-orm/pg-core";
import { type CuidPrefix, createId } from "./cuid";

export const primaryKeyColumn = (prefix: CuidPrefix, cuidLength = 16) =>
  text("id")
    .primaryKey()
    .$defaultFn(() => createId(prefix, cuidLength));

export const foreignKeyColumn = (
  columnName: string,
  column: AnyPgColumn,
  onDelete: "cascade" | "set null" = "cascade"
) =>
  text(columnName).references((): AnyPgColumn => column, {
    onDelete,
  });

export const enumColumn = (
  columnName: string,
  enumArray: readonly [string, ...string[]] | [string, ...string[]]
) => text(columnName, { enum: enumArray }).notNull();

export const dateColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};
