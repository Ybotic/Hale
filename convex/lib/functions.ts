// Typed builders work before the first deployment. `convex dev` generates the normal API too.
import {
  queryGeneric, mutationGeneric, internalMutationGeneric, internalQueryGeneric, internalActionGeneric, httpActionGeneric,
  type QueryBuilder, type MutationBuilder, type ActionBuilder, type DataModelFromSchemaDefinition,
  type GenericQueryCtx, type GenericMutationCtx,
} from "convex/server";
import schema from "../schema";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> = internalMutationGeneric;
export const internalQuery: QueryBuilder<DataModel, "internal"> = internalQueryGeneric;
export const internalAction: ActionBuilder<DataModel, "internal"> = internalActionGeneric;
export const httpAction = httpActionGeneric;
