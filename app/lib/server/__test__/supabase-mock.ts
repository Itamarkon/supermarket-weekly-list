/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only helper: a chainable, recording stand-in for the Supabase admin
// client. Use from .test.ts files; this file is NOT picked up by Vitest itself
// (no `.test` in its name) and is excluded from production code paths.

export type ChainOp = { method: string; args: unknown[] };
export type ChainCall = { table: string; ops: ChainOp[] };
export type Response = { data?: any; error?: any; count?: number };

const CHAIN_METHODS = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "in",
    "gte",
    "lt",
    "limit",
    "order",
] as const;

export function makeSupabaseMock(responseProvider: (call: ChainCall) => Response) {
    const calls: ChainCall[] = [];

    const admin = {
        from(table: string) {
            const call: ChainCall = { table, ops: [] };
            calls.push(call);

            const builder: any = {};

            for (const method of CHAIN_METHODS) {
                builder[method] = (...args: unknown[]) => {
                    call.ops.push({ method, args });
                    return builder;
                };
            }

            builder.maybeSingle = () => {
                call.ops.push({ method: "maybeSingle", args: [] });
                return Promise.resolve(responseProvider(call));
            };

            // Make the builder thenable so `await supabaseAdmin.from(...).select(...)` works.
            builder.then = (
                onFulfilled: (value: Response) => unknown,
                onRejected?: (reason: unknown) => unknown
            ) => Promise.resolve(responseProvider(call)).then(onFulfilled, onRejected);

            return builder;
        },
    };

    return { admin, calls };
}

/** Convenience: assert a chain call exists for `table` containing an `op.method` matching `predicate`. */
export function findCall(
    calls: ChainCall[],
    table: string,
    predicate: (ops: ChainOp[]) => boolean
): ChainCall | undefined {
    return calls.find((c) => c.table === table && predicate(c.ops));
}
