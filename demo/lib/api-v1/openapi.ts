/**
 * OpenAPI 3.1 description of /api/v1, served at GET /api/v1/openapi.json.
 * Keep in step with app/api/v1 — it's the contract PM Inventive builds on.
 */
import { PRIORITIES, SPRINT_STATUSES, STATUSES } from "./serialize";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const ok = (schema: unknown, description = "OK") => ({ description, content: json(schema) });
const list = (item: string) => ({
  type: "object",
  properties: {
    items: { type: "array", items: ref(item) },
    total: { type: "integer" },
    page: { type: "integer" },
    page_size: { type: "integer" },
  },
});
const errors = {
  "400": { $ref: "#/components/responses/Error" },
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
  "422": { $ref: "#/components/responses/Error" },
  "429": { $ref: "#/components/responses/Error" },
};
const idParam = (name = "id", type: "integer" | "string" = "integer") => ({
  name,
  in: "path",
  required: true,
  schema: { type },
});
const q = (name: string, schema: unknown, description?: string) => ({
  name,
  in: "query",
  schema,
  ...(description ? { description } : {}),
});
const paging = [q("page", { type: "integer", minimum: 1 }), q("page_size", { type: "integer", minimum: 1, maximum: 200 })];
const idem = { name: "Idempotency-Key", in: "header", schema: { type: "string" }, description: "Replays the original result for 24h" };
const attribution = {
  source_note: { type: "string", maxLength: 500 },
  on_behalf_of_user_id: { type: "string", description: "Id of the person the change is for" },
};
const date = { type: ["string", "null"], format: "date" };

const taskWritable = {
  title: { type: "string" },
  description: { type: ["string", "null"] },
  project_id: { type: "integer" },
  sprint_id: { type: ["integer", "null"], description: "null = backlog" },
  parent_id: { type: ["integer", "null"] },
  assignee_id: { type: ["string", "null"], description: "Replaces all assignees with this one person" },
  status: { type: "string", enum: [...STATUSES] },
  priority: { type: "string", enum: [...PRIORITIES] },
  estimate_hours: { type: ["number", "null"] },
  progress_percent: { type: "integer", minimum: 0, maximum: 100 },
  start_date: date,
  due_date: date,
  blocked: { type: "boolean", description: "true sets status Blocked; false moves a Blocked task to In Progress" },
  blocked_reason: { type: ["string", "null"] },
  tags: { type: "array", items: { type: "string" } },
};

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Tracker API v1",
    version: "1.0.0",
    description:
      "Service-account API for PM Inventive. Bearer-token auth. Every write accepts source_note and " +
      "on_behalf_of_user_id and is recorded in task history and the UI audit log. Fields outside the " +
      "documented writable set return 403; DELETE always returns 403; performance and evaluation data " +
      "is not exposed.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearer: [] }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    responses: {
      Error: {
        description: "Error",
        content: json({
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" }, field: { type: ["string", "null"] } },
            },
          },
        }),
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          role: { type: "string" },
          active: { type: "boolean" },
          weekly_capacity_hours: { type: "integer" },
          timezone: { type: "string" },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "integer" },
          key: { type: "string" },
          name: { type: "string" },
          status: { type: "string" },
          client: { type: ["string", "null"] },
          member_ids: { type: "array", items: { type: "string" } },
          start_date: date,
          target_end_date: date,
        },
      },
      Sprint: {
        type: "object",
        properties: {
          id: { type: "integer" },
          project_id: { type: "integer" },
          name: { type: "string" },
          goal: { type: "string" },
          start_date: { type: "string", format: "date" },
          end_date: { type: "string", format: "date" },
          status: { type: "string", enum: [...SPRINT_STATUSES] },
          task_ids: { type: "array", items: { type: "integer" } },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "integer" },
          key: { type: "string", description: "<PROJECT KEY>-<id>, e.g. CRM-142" },
          ...taskWritable,
          assignee_ids: { type: "array", items: { type: "string" } },
          reporter_id: { type: ["string", "null"] },
          logged_hours: { type: "number" },
          completed_at: { type: ["string", "null"], format: "date-time" },
          blocked_by: { type: "array", items: { type: "integer" } },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      TaskWrite: { type: "object", additionalProperties: false, properties: { ...taskWritable, ...attribution } },
      Comment: {
        type: "object",
        properties: {
          id: { type: "integer" },
          text: { type: "string" },
          author_id: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          on_behalf_of_user_id: { type: ["string", "null"] },
          source_note: { type: ["string", "null"] },
        },
      },
      HistoryEntry: {
        type: "object",
        properties: {
          id: { type: "integer" },
          at: { type: "string", format: "date-time" },
          field: { type: "string" },
          old: {},
          new: {},
          changed_by: { type: ["string", "null"] },
          on_behalf_of_user_id: { type: ["string", "null"] },
          source_note: { type: ["string", "null"] },
        },
      },
      Dependencies: {
        type: "object",
        properties: {
          blocked_by: { type: "array", items: { type: "integer" } },
          blocks: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
  paths: {
    "/auth/me": { get: { summary: "The authenticated service account", responses: { "200": ok(ref("User")), ...errors } } },
    "/users": {
      get: {
        summary: "List team members",
        parameters: [q("active", { type: "boolean" }), q("updated_since", { type: "string", format: "date-time" }), ...paging],
        responses: { "200": ok(list("User")), ...errors },
      },
    },
    "/users/{id}": { get: { parameters: [idParam("id", "string")], responses: { "200": ok(ref("User")), ...errors } } },
    "/projects": {
      get: {
        parameters: [q("status", { type: "string" }), q("member_id", { type: "string" }), q("updated_since", { type: "string", format: "date-time" }), ...paging],
        responses: { "200": ok(list("Project")), ...errors },
      },
    },
    "/projects/{id}": { get: { parameters: [idParam()], responses: { "200": ok(ref("Project")), ...errors } } },
    "/sprints": {
      get: {
        parameters: [
          q("project_id", { type: "integer" }),
          q("status", { type: "string", enum: [...SPRINT_STATUSES] }),
          q("starts_after", { type: "string", format: "date" }, "start_date on or after"),
          q("updated_since", { type: "string", format: "date-time" }),
          ...paging,
        ],
        responses: { "200": ok(list("Sprint")), ...errors },
      },
      post: {
        parameters: [idem],
        requestBody: {
          content: json({
            type: "object",
            required: ["project_id", "name", "start_date", "end_date"],
            properties: {
              project_id: { type: "integer" },
              name: { type: "string" },
              goal: { type: "string" },
              start_date: { type: "string", format: "date" },
              end_date: { type: "string", format: "date" },
              status: { type: "string", enum: [...SPRINT_STATUSES] },
              ...attribution,
            },
          }),
        },
        responses: { "201": ok(ref("Sprint"), "Created"), ...errors },
      },
    },
    "/sprints/{id}": {
      get: { parameters: [idParam()], responses: { "200": ok(ref("Sprint")), ...errors } },
      patch: {
        parameters: [idParam()],
        requestBody: {
          content: json({
            type: "object",
            properties: {
              name: { type: "string" },
              goal: { type: ["string", "null"] },
              status: { type: "string", enum: [...SPRINT_STATUSES] },
              start_date: { type: "string", format: "date" },
              end_date: { type: "string", format: "date" },
              ...attribution,
            },
          }),
        },
        responses: { "200": ok(ref("Sprint")), ...errors },
      },
    },
    "/sprints/{id}/summary": {
      get: {
        parameters: [idParam()],
        responses: {
          "200": ok({
            type: "object",
            properties: {
              sprint_id: { type: "integer" },
              status: { type: "string" },
              planned_tasks: { type: "integer" },
              done_tasks: { type: "integer" },
              planned_hours: { type: "number" },
              done_hours: { type: "number" },
              by_status: { type: "object", additionalProperties: { type: "integer" } },
            },
          }),
          ...errors,
        },
      },
    },
    "/tasks": {
      get: {
        summary: "Search tasks (filters combine with AND)",
        parameters: [
          q("project_id", { type: "integer" }),
          q("sprint_id", { type: "integer" }),
          q("parent_id", { type: "integer" }),
          q("assignee_id", { type: "string" }, "Any of the task's assignees"),
          q("status", { type: "string" }, "Comma-separated, e.g. To Do,In Progress"),
          q("backlog", { type: "boolean" }, "true = no sprint"),
          q("unassigned", { type: "boolean" }),
          q("due_before", { type: "string", format: "date" }, "Due strictly before"),
          q("updated_since", { type: "string", format: "date-time" }),
          q("q", { type: "string" }, "Title text, or a task key like CRM-142"),
          ...paging,
        ],
        responses: { "200": ok(list("Task")), ...errors },
      },
      post: {
        parameters: [idem],
        requestBody: { content: json({ allOf: [ref("TaskWrite"), { required: ["title", "project_id"] }] }) },
        responses: { "201": ok(ref("Task"), "Created"), ...errors },
      },
    },
    "/tasks/{id}": {
      get: { parameters: [idParam()], responses: { "200": ok(ref("Task")), ...errors } },
      patch: {
        summary: "Partial update — only the fields sent change",
        parameters: [idParam()],
        requestBody: { content: json(ref("TaskWrite")) },
        responses: { "200": ok(ref("Task")), ...errors },
      },
    },
    "/tasks/bulk-update": {
      post: {
        parameters: [idem],
        requestBody: {
          content: json({
            type: "object",
            required: ["updates"],
            properties: {
              updates: {
                type: "array",
                maxItems: 200,
                items: { allOf: [ref("TaskWrite"), { type: "object", required: ["id"], properties: { id: { type: "integer" } } }] },
              },
              ...attribution,
            },
          }),
        },
        responses: {
          "200": ok({
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    ok: { type: "boolean" },
                    code: { type: "string" },
                    error: { type: "string" },
                    field: { type: ["string", "null"] },
                  },
                },
              },
            },
          }),
          ...errors,
        },
      },
    },
    "/tasks/{id}/comments": {
      get: { parameters: [idParam(), ...paging], responses: { "200": ok(list("Comment")), ...errors } },
      post: {
        parameters: [idParam(), idem],
        requestBody: { content: json({ type: "object", required: ["text"], properties: { text: { type: "string" }, ...attribution } }) },
        responses: { "201": ok(ref("Comment"), "Created"), ...errors },
      },
    },
    "/tasks/{id}/history": {
      get: { parameters: [idParam(), ...paging], responses: { "200": ok(list("HistoryEntry")), ...errors } },
    },
    "/tasks/{id}/dependencies": {
      get: { parameters: [idParam()], responses: { "200": ok(ref("Dependencies")), ...errors } },
      post: {
        parameters: [idParam(), idem],
        requestBody: {
          content: json({ type: "object", required: ["blocked_by_id"], properties: { blocked_by_id: { type: "integer" }, ...attribution } }),
        },
        responses: { "201": ok(ref("Dependencies"), "Created"), "409": { $ref: "#/components/responses/Error" }, ...errors },
      },
    },
    "/meta/statuses": { get: { responses: { "200": ok({ type: "array", items: { type: "string" } }) } } },
    "/meta/priorities": { get: { responses: { "200": ok({ type: "array", items: { type: "string" } }) } } },
  },
};
