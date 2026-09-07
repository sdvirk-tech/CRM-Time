import { ContactsRepository, type ContactInput } from "./repository.js";
import type { DB } from "./db.js";

const SAMPLE: ContactInput[] = [
  {
    name: "Ada Lovelace",
    email: "ada@analytical.io",
    company: "Analytical Engines",
    phone: "+1 415 555 0101",
    status: "active",
    value: 24000,
    notes: "Interested in the enterprise tier. Follow up after demo.",
    lastContactedAt: "2026-09-01 14:30:00",
  },
  {
    name: "Grace Hopper",
    email: "grace@navy.mil",
    company: "COBOL Systems",
    phone: "+1 202 555 0143",
    status: "won",
    value: 58000,
    notes: "Closed annual contract. Renewal in Q3.",
    lastContactedAt: "2026-08-20 09:00:00",
  },
  {
    name: "Alan Turing",
    email: "alan@bletchley.uk",
    company: "Enigma Analytics",
    phone: "+44 20 7946 0958",
    status: "lead",
    value: 12000,
    notes: "Inbound from website. Needs security review.",
  },
  {
    name: "Katherine Johnson",
    email: "katherine@orbital.space",
    company: "Orbital Trajectories",
    phone: "+1 757 555 0177",
    status: "active",
    value: 41000,
    notes: "Evaluating integration with existing tooling.",
    lastContactedAt: "2026-09-04 11:15:00",
  },
];

export function seedIfEmpty(db: DB): number {
  const repo = new ContactsRepository(db);
  if (repo.stats().total > 0) return 0;
  for (const c of SAMPLE) repo.create(c);
  return SAMPLE.length;
}
