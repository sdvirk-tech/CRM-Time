import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDatabase } from "./db.js";
import { createApp } from "./app.js";

function makeApp() {
  const db = createDatabase(":memory:");
  return createApp(db);
}

describe("CRM-Time API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = makeApp();
  });

  it("reports health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("starts with no contacts", async () => {
    const res = await request(app).get("/api/contacts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("creates, reads, updates and deletes a contact", async () => {
    const created = await request(app)
      .post("/api/contacts")
      .send({ name: "Test User", email: "test@example.com", company: "Acme", value: 5000 });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeGreaterThan(0);
    expect(created.body.status).toBe("lead");

    const id = created.body.id;

    const fetched = await request(app).get(`/api/contacts/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.name).toBe("Test User");

    const updated = await request(app)
      .patch(`/api/contacts/${id}`)
      .send({ status: "won", value: 9000 });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("won");
    expect(updated.body.value).toBe(9000);

    const del = await request(app).delete(`/api/contacts/${id}`);
    expect(del.status).toBe(204);

    const missing = await request(app).get(`/api/contacts/${id}`);
    expect(missing.status).toBe(404);
  });

  it("rejects a contact without a name", async () => {
    const res = await request(app).post("/api/contacts").send({ email: "no-name@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/);
  });

  it("rejects an invalid status", async () => {
    const res = await request(app)
      .post("/api/contacts")
      .send({ name: "Bad Status", status: "nope" });
    expect(res.status).toBe(400);
  });

  it("filters by search and status", async () => {
    await request(app).post("/api/contacts").send({ name: "Alice Anderson", company: "Globex", status: "active" });
    await request(app).post("/api/contacts").send({ name: "Bob Brown", company: "Initech", status: "lead" });

    const search = await request(app).get("/api/contacts?search=globex");
    expect(search.body).toHaveLength(1);
    expect(search.body[0].name).toBe("Alice Anderson");

    const byStatus = await request(app).get("/api/contacts?status=lead");
    expect(byStatus.body).toHaveLength(1);
    expect(byStatus.body[0].name).toBe("Bob Brown");
  });

  it("aggregates stats", async () => {
    await request(app).post("/api/contacts").send({ name: "One", status: "won", value: 100 });
    await request(app).post("/api/contacts").send({ name: "Two", status: "lead", value: 50 });

    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.byStatus.won).toBe(1);
    expect(res.body.pipelineValue).toBe(150);
  });
});
