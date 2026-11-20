import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { toolInputs } from "@/utils/agent/schemas";
import { validateLifeDates } from "@/utils/family/life-dates";
import { z } from "zod";

// Match the public resource names to their tool equivalents, including the
// irregular people, gallery and export names. Swapping two IDs must fail.
const actions: Record<string, Record<string, keyof typeof toolInputs>> = {
  "family-trees": { get: "list_family_trees" },
  persons: { get: "list_people", post: "create_person" },
  "persons/{id}": { get: "get_person", patch: "update_person", delete: "delete_person" },
  relationships: { get: "list_relationships", post: "create_relationship" },
  "relationships/{id}": { delete: "delete_relationship" },
  events: { get: "list_events", post: "create_event" },
  "events/{id}": { patch: "update_event", delete: "delete_event" },
  gallery: { get: "list_gallery", post: "create_gallery_item" },
  "gallery/{id}": { delete: "delete_gallery_item" },
  stats: { get: "get_family_stats" },
  export: { get: "export_family_data" },
};

const base = process.env.FAMILY_TREE_TEST_APP_URL;
if (!base) throw Error("Set FAMILY_TREE_TEST_APP_URL to the running test app.");

test("anonymous OpenAPI describes every shipped REST method and MCP action", async () => {
  const res = await fetch(new URL("/api/openapi.json", base), { redirect: "manual" });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  const api = await res.json();
  expect(api.openapi).toBe("3.1.0");
  expect(api.security).toEqual([{ bearerAuth: [] }]);
  expect(api.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  const routes = await readdir("app/api/v1", { recursive: true });
  const paths: string[] = [];
  const ids: string[] = [];
  for (const route of routes.filter(name => name.endsWith("/route.ts"))) {
    const path = "/api/v1/" + route.replace("/route.ts", "").replace("[id]", "{id}");
    paths.push(path);
    const methods = Object.keys(await import("../app/api/v1/" + route)).map(key => key.toLowerCase()).sort();
    expect(Object.keys(api.paths[path]).sort()).toEqual(methods);
    for (const method of methods) {
      const operation = api.paths[path][method];
      ids.push(operation.operationId);
      const action = actions[path.slice("/api/v1/".length)][method];
      expect(operation.operationId).toBe(action);
      const scopes = action === "export_family_data" ? ["read", "private"] :
        [method === "get" ? "read" : method === "delete" ? "delete" : "write"];
      expect(operation["x-required-scopes"]).toEqual(scopes);
      const input = toolInputs[action];
      if ("body" in input.shape) {
        const expected = z.toJSONSchema(input.shape.body, { io: "input" });
        delete expected.$schema;
        if (method === "patch") expected.minProperties = 1;
        const ref = operation.requestBody.content["application/json"].schema.$ref;
        expect(api.components.schemas[ref.split("/").pop()]).toEqual(expected);
      }
      const parameters = operation.parameters.map((p: { $ref: string }) => p.$ref.split("/").pop());
      expect(parameters.includes("familyTreeId")).toBe(!path.endsWith("/family-trees"));
      expect(parameters.includes("id")).toBe(path.endsWith("/{id}"));
      expect(parameters.includes("limit")).toBe(operation.operationId.startsWith("list_"));
      expect(!!operation.requestBody).toBe(["post", "patch"].includes(method));
      expect(operation.responses[method === "post" ? "201" : "200"]).toBeDefined();
    }
  }
  expect(Object.keys(api.paths).sort()).toEqual(paths.sort());
  expect(ids.sort()).toEqual(Object.keys(toolInputs).sort());
  for (const match of JSON.stringify(api).matchAll(/"\$ref":"#\/([^"]+)"/g)) {
    expect(match[1].split("/").reduce((value, key) => value?.[key], api)).toBeDefined();
  }
});

test("published Person date bounds agree with the shared life-date validator for create and patch", async () => {
  const response = await fetch(new URL("/api/openapi.json", base));
  const { components } = await response.json();
  const years = { valid: [1, 9999], invalid: [0, 10000] };
  const solarMonths = { valid: [1, 12], invalid: [-1, 0, 13] };
  const solarDays = { valid: [1, 31], invalid: [0, 32] };
  const bounds = {
    birth_year: years, death_year: years, death_lunar_year: years,
    birth_month: solarMonths, death_month: solarMonths,
    birth_day: solarDays, death_day: solarDays,
    death_lunar_month: { valid: [-12, -1, 1, 12], invalid: [-13, 0, 13] },
    death_lunar_day: { valid: [1, 30], invalid: [0, 31] },
  };
  for (const schemaName of ["personCreate", "personUpdate"]) {
    const published = z.fromJSONSchema(components.schemas[schemaName]);
    for (const [field, { valid, invalid }] of Object.entries(bounds)) {
      for (const value of [null, ...valid]) {
        const record = { full_name: "Fixture", [field]: value };
        expect(() => validateLifeDates(record)).not.toThrow();
        expect(published.safeParse(record).success).toBe(true);
      }
      for (const value of invalid) {
        const record = { full_name: "Fixture", [field]: value };
        expect(() => validateLifeDates(record)).toThrow();
        expect(published.safeParse(record).success, schemaName + "." + field + "=" + value).toBe(false);
      }
    }
    expect(published.safeParse({ full_name: "Fixture" }).success).toBe(true);
  }
});

test("published OpenAPI accepts uppercase UUIDs in relationship bodies and resource parameters", async () => {
  const { components } = await (await fetch(new URL("/api/openapi.json", base))).json();
  const a = "ABCDEFAB-CDEF-FABC-FABC-ABCDEFABCDEF";
  const b = "FEDCBAFE-DCBA-4FED-8FED-FEDCBAFEDCBA";
  expect(z.fromJSONSchema(components.schemas.edgeCreate).safeParse({
    type: "adopted_child", person_a: a, person_b: b,
  }).success).toBe(true);
  for (const parameter of ["familyTreeId", "id"]) {
    const parameterSchema = z.fromJSONSchema(components.parameters[parameter].schema);
    expect(parameterSchema.safeParse(a).success).toBe(true);
    expect(parameterSchema.safeParse(a.replace("A", "G")).success).toBe(false);
  }
});

test("anonymous llms.txt links discovery and lists each registered tool once", async () => {
  const res = await fetch(new URL("/llms.txt", base), { redirect: "manual" });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/plain");
  const guide = await res.text();
  expect(guide).toContain("/api/openapi.json");
  expect(guide).toContain("/api/mcp");
  const tools = [...guide.matchAll(/^- `([a-z_]+)`/gm)].map(match => match[1]);
  expect(tools.sort()).toEqual(Object.keys(toolInputs).sort());
});
