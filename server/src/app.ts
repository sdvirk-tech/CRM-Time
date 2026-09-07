import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import type { DB } from "./db.js";
import { ContactsRepository, ValidationError } from "./repository.js";

export function createApp(db: DB) {
  const app = express();
  const repo = new ContactsRepository(db);

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "crm-time", time: new Date().toISOString() });
  });

  app.get("/api/stats", (_req: Request, res: Response) => {
    res.json(repo.stats());
  });

  app.get("/api/contacts", (req: Request, res: Response) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(repo.list(search, status));
  });

  app.get("/api/contacts/:id", (req: Request, res: Response) => {
    const contact = repo.get(Number(req.params.id));
    if (!contact) {
      res.status(404).json({ error: "contact not found" });
      return;
    }
    res.json(contact);
  });

  app.post("/api/contacts", (req: Request, res: Response) => {
    const contact = repo.create(req.body);
    res.status(201).json(contact);
  });

  app.patch("/api/contacts/:id", (req: Request, res: Response) => {
    const contact = repo.update(Number(req.params.id), req.body);
    if (!contact) {
      res.status(404).json({ error: "contact not found" });
      return;
    }
    res.json(contact);
  });

  app.delete("/api/contacts/:id", (req: Request, res: Response) => {
    const removed = repo.remove(Number(req.params.id));
    if (!removed) {
      res.status(404).json({ error: "contact not found" });
      return;
    }
    res.status(204).end();
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
