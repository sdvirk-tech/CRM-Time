import { prisma } from "./prisma";

export type CbrRates = {
  asOf: string;
  asOfLabel: string;
  usd: string;
  cny: string;
  eur: string;
  source: string;
  error?: string;
};

const g = globalThis as unknown as {
  __cbrMem?: { day: string; rates: CbrRates };
  __cbrFailDay?: string;
};

function moscowDay(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

function labelFromIso(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!d) return iso;
  return `${d}.${m}.${y}`;
}

export function parseCbrXml(xml: string): CbrRates | null {
  const dateAttr = xml.match(/Date="(\d{2})\.(\d{2})\.(\d{4})"/);
  const asOf = dateAttr ? `${dateAttr[3]}-${dateAttr[2]}-${dateAttr[1]}` : moscowDay();
  const pick = (code: string) => {
    const block = xml.match(new RegExp(`<CharCode>${code}</CharCode>[\\s\\S]*?<Value>([0-9,]+)</Value>`, "i"));
    const nom = xml.match(new RegExp(`<CharCode>${code}</CharCode>[\\s\\S]*?<Nominal>([0-9]+)</Nominal>`, "i"));
    if (!block) return "";
    const value = Number(block[1].replace(",", "."));
    const nominal = nom ? Number(nom[1]) : 1;
    if (!value || !nominal) return "";
    const per = value / nominal;
    return per.toFixed(4).replace(".", ",");
  };
  const usd = pick("USD");
  const cny = pick("CNY");
  const eur = pick("EUR");
  if (!usd && !cny && !eur) return null;
  return { asOf, asOfLabel: labelFromIso(asOf), usd, cny, eur, source: "cbr" };
}

function fromRow(row: { asOf: Date; usd: string; cny: string; eur: string; source: string }): CbrRates {
  const asOf = row.asOf.toISOString().slice(0, 10);
  return {
    asOf,
    asOfLabel: labelFromIso(asOf),
    usd: row.usd,
    cny: row.cny,
    eur: row.eur,
    source: row.source,
  };
}

async function persist(rates: CbrRates) {
  g.__cbrMem = { day: moscowDay(), rates };
  await prisma.fxSnapshot.upsert({
    where: { id: "cbr" },
    create: {
      id: "cbr",
      asOf: new Date(`${rates.asOf}T00:00:00.000Z`),
      usd: rates.usd,
      cny: rates.cny,
      eur: rates.eur,
      source: rates.source,
    },
    update: {
      asOf: new Date(`${rates.asOf}T00:00:00.000Z`),
      usd: rates.usd,
      cny: rates.cny,
      eur: rates.eur,
      source: rates.source,
      fetchedAt: new Date(),
    },
  });
}

export async function getCbrRates(opts?: { force?: boolean }): Promise<CbrRates> {
  const day = moscowDay();
  if (!opts?.force && g.__cbrMem?.day === day) return g.__cbrMem.rates;
  const cached = await prisma.fxSnapshot.findUnique({ where: { id: "cbr" } });
  if (!opts?.force && cached && cached.asOf.toISOString().slice(0, 10) === day) {
    const rates = fromRow(cached);
    g.__cbrMem = { day, rates };
    return rates;
  }
  if (!opts?.force && g.__cbrFailDay === day && cached) {
    const rates = fromRow(cached);
    rates.error = "ЦБ кэш";
    return rates;
  }
  if (!opts?.force && g.__cbrFailDay === day && !cached) {
    return {
      asOf: day,
      asOfLabel: labelFromIso(day),
      usd: "",
      cny: "",
      eur: "",
      source: "cbr",
      error: "ЦБ недоступен",
    };
  }
  const url = process.env.CBR_XML_URL || "https://www.cbr.ru/scripts/XML_daily.asp";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CRM-Time/1.0" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`ЦБ HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = parseCbrXml(xml);
    if (!parsed) throw new Error("ЦБ XML без валют");
    await persist(parsed);
    return parsed;
  } catch (e) {
    g.__cbrFailDay = day;
    if (cached) {
      const rates = fromRow(cached);
      rates.error = e instanceof Error ? e.message : "ЦБ недоступен";
      return rates;
    }
    return {
      asOf: day,
      asOfLabel: labelFromIso(day),
      usd: "",
      cny: "",
      eur: "",
      source: "cbr",
      error: e instanceof Error ? e.message : "ЦБ недоступен",
    };
  }
}

export function formatCbrLine(rates: CbrRates) {
  if (!rates.usd && !rates.cny && !rates.eur) return "";
  return `Курс ЦБ РФ на ${rates.asOfLabel}: USD ${rates.usd || "—"} · CNY ${rates.cny || "—"} · EUR ${rates.eur || "—"}`;
}
