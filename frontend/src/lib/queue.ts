// Queueing calculator core (M/M/1, M/G/1, G/G/1).
// Line-for-line port of the original queue_calculator.cpp:
// same formulas, same evaluation order, same output strings and number formatting.

export type Step = {
  symbol: string;
  formula: string;
  substitution: string;
  value: string;
  unit: string;
};

export type Result =
  | { ok: true; model: string; unit: string; steps: Step[] }
  | { ok: false; error: string };

type Dist = {
  mean: number; // minutes
  var: number; // minutes^2
};

type Input = {
  model: number; // 1 = M/M/1, 2 = M/G/1, 3 = G/G/1
  unit: number; // 1 = hours, 2 = minutes
  A: Dist; // arrival inter-arrival time (minutes)
  S: Dist; // service time (minutes)
};

/** Thrown for invalid input; message is shown to the user (C++: invalid_argument). */
export class InputError extends Error {}

// Same as C printf("%.6f"): rounds the exact binary value, ties to even.
// (Number.prototype.toFixed rounds exact ties up, e.g. 0.0078125 -> 0.007813
// where C gives 0.007812, so it cannot be used directly.)
function printf6(v: number): string {
  if (Number.isNaN(v)) return v < 0 ? "-nan" : "nan";
  const neg = v < 0 || Object.is(v, -0);
  if (!Number.isFinite(v)) return neg ? "-inf" : "inf";
  const a = Math.abs(v);
  let digits: string; // all digits incl. 6 decimals, no point
  if (a >= 1e21) {
    digits = BigInt(a).toString() + "000000"; // integer-valued, exact
  } else {
    // toFixed(100) is the exact decimal expansion for any value that could
    // produce a tie at the 6th decimal
    const [ip, fp] = a.toFixed(100).split(".");
    const keep = fp.slice(0, 6);
    const rest = fp.slice(6);
    const first = rest[0];
    const tail = /[1-9]/.test(rest.slice(1));
    const lastOdd = (Number((ip + keep).slice(-1)) & 1) === 1;
    const up = first > "5" || (first === "5" && (tail || lastOdd));
    let n = BigInt(ip + keep);
    if (up) n += BigInt(1);
    digits = n.toString().padStart(7, "0");
  }
  const s = digits.slice(0, -6) + "." + digits.slice(-6);
  return (neg ? "-" : "") + s;
}

// 32.000000 -> 32 , 0.125000 -> 0.125
export function fmt(v: number): string {
  let s = printf6(v);
  while (s.endsWith("0")) s = s.slice(0, -1);
  if (s.endsWith(".")) s = s.slice(0, -1);
  if (s === "-0") s = "0";
  return s;
}

// Returns time in minutes for a value given in minutes (1) or hours (2)
function toMinutes(v: number, unit: number): number {
  return unit === 1 ? v : v * 60.0;
}

// Converts a rate OR a mean time to MEAN TIME in minutes
// o: 1 = rate per hour, 2 = rate per minute, 3 = mean minutes, 4 = mean hours
function meanTime(o: number, v: number): number {
  if (o === 1) return 60.0 / v;
  if (o === 2) return 1.0 / v;
  if (o === 3) return v;
  return v * 60.0;
}

// ---------------------------------------------------------------------------
// Pure calculation: no I/O.
// ---------------------------------------------------------------------------

function custUnit(v: number): string {
  return Math.abs(v - 1.0) < 1e-9 ? "customer" : "customers";
}

function calculate(input: Input): Result {
  const { model, unit: u, A, S } = input;
  const out: Step[] = [];
  const show = (symbol: string, formula: string, subst: string, val: number, unit: string) => {
    out.push({ symbol, formula, substitution: subst, value: fmt(val), unit });
  };

  const modelName = model === 1 ? "M/M/1" : model === 2 ? "M/G/1" : "G/G/1";

  const f = u === 1 ? 60.0 : 1.0; // minutes per output unit
  const tu = u === 1 ? "hours" : "minutes";

  // convert to output unit
  const ma = A.mean / f, ms = S.mean / f;
  const va = A.var / (f * f), vs = S.var / (f * f);
  const lam = 1.0 / ma, mu = 1.0 / ms;
  const rho = lam / mu;

  if (rho >= 1.0) {
    return {
      ok: false,
      error:
        "System is unstable (ρ ≥ 1): λ = " + fmt(lam) + " , μ = " + fmt(mu) +
        " , ρ = " + fmt(rho) + ". Queue grows forever, no steady-state answer.",
    };
  }

  const sl = fmt(lam), sm = fmt(mu), sr = fmt(rho);
  const per = "customers per " + tu.slice(0, tu.length - 1);
  out.push({ symbol: "λ", formula: "1/Mean Inter-arrival Time", substitution: "1/" + fmt(ma), value: sl, unit: per });
  out.push({ symbol: "μ", formula: "1/Mean Service Time", substitution: "1/" + fmt(ms), value: sm, unit: per });
  show("ρ", "λ/μ", sl + "/" + sm, rho, "");

  if (model === 1) {
    const Lq = (rho * rho) / (1 - rho);
    const L = rho / (1 - rho);
    const Wq = Lq / lam, W = L / lam;
    show("Lq", "ρ²/(1-ρ)", sr + "²/(1-" + sr + ")", Lq, custUnit(Lq));
    show("L", "ρ/(1-ρ)", sr + "/(1-" + sr + ")", L, custUnit(L));
    show("Wq", "Lq/λ", fmt(Lq) + "/" + sl, Wq, tu);
    show("W", "L/λ", fmt(L) + "/" + sl, W, tu);
  } else if (model === 2) {
    const Lq = (lam * lam * vs + rho * rho) / (2 * (1 - rho));
    const Wq = Lq / lam;
    const W = Wq + 1.0 / mu;
    const L = lam * W;
    out.push({ symbol: "σs²", formula: "", substitution: "", value: fmt(vs), unit: tu + "²" });
    show(
      "Lq",
      "(λ²·σs² + ρ²)/(2(1-ρ))",
      "(" + sl + "²·" + fmt(vs) + " + " + sr + "²)/(2(1-" + sr + "))",
      Lq,
      custUnit(Lq),
    );
    show("Wq", "Lq/λ", fmt(Lq) + "/" + sl, Wq, tu);
    show("W", "Wq + 1/μ", fmt(Wq) + " + 1/" + sm, W, tu);
    show("L", "λ·W", sl + "·" + fmt(W), L, custUnit(L));
    show("Server idle", "1-ρ", "1-" + sr, 1 - rho, "");
  } else {
    const Ca2 = va / (ma * ma);
    const Cs2 = vs / (ms * ms);
    const Lq =
      (rho * rho * (1 + Cs2) * (Ca2 + rho * rho * Cs2)) /
      (2 * (1 - rho) * (1 + rho * rho * Cs2));
    const Wq = Lq / lam;
    const W = Wq + 1.0 / mu;
    const L = lam * W;
    const sca = fmt(Ca2), scs = fmt(Cs2);
    out.push({ symbol: "σa²", formula: "", substitution: "", value: fmt(va), unit: tu + "²" });
    out.push({ symbol: "σs²", formula: "", substitution: "", value: fmt(vs), unit: tu + "²" });
    show("Ca²", "σa²/(1/λ)²", fmt(va) + "/(1/" + sl + ")²", Ca2, "");
    show("Cs²", "σs²/(1/μ)²", fmt(vs) + "/(1/" + sm + ")²", Cs2, "");
    show(
      "Lq",
      "ρ²(1+Cs²)(Ca²+ρ²·Cs²)/(2(1-ρ)(1+ρ²·Cs²))",
      sr + "²(1+" + scs + ")(" + sca + "+" + sr + "²·" + scs + ")/(2(1-" +
        sr + ")(1+" + sr + "²·" + scs + "))",
      Lq,
      custUnit(Lq),
    );
    show("Wq", "Lq/λ", fmt(Lq) + "/" + sl, Wq, tu);
    show("W", "Wq + 1/μ", fmt(Wq) + " + 1/" + sm, W, tu);
    show("L", "λ·W", sl + "·" + fmt(W), L, custUnit(L));
    show("Server idle", "1-ρ", "1-" + sr, 1 - rho, "");
  }
  return { ok: true, model: modelName, unit: tu, steps: out };
}

// ---------------------------------------------------------------------------
// JSON -> Input (throws InputError with a user-facing message)
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function field(obj: unknown, key: string, path: string): unknown {
  if (!isObj(obj) || !Object.hasOwn(obj, key)) throw new InputError("Missing field: " + path + key);
  return obj[key];
}

function getString(obj: unknown, key: string, path: string): string {
  const v = field(obj, key, path);
  if (typeof v !== "string") throw new InputError(path + key + " must be a string");
  return v;
}

function getPositive(obj: unknown, key: string, path: string): number {
  const v = field(obj, key, path);
  if (typeof v !== "number") throw new InputError(path + key + " must be a number");
  if (!Number.isFinite(v) || v <= 0)
    throw new InputError(path + key + " must be a number greater than 0");
  return v;
}

function getTimeUnit(obj: unknown, key: string, path: string): number {
  const s = getString(obj, key, path);
  if (s === "minute") return 1;
  if (s === "hour") return 2;
  throw new InputError(path + key + ' must be "minute" or "hour"');
}

// dist: exponential/poisson -> rate or mean; gamma -> k, theta; uniform -> min, max
function parseDist(j: unknown, who: string, allowed: string[]): Dist {
  const path = who + ".";
  const d = getString(j, "dist", path);
  if (!allowed.includes(d))
    throw new InputError(
      path + 'dist "' + d + '" is not allowed here (allowed: ' + allowed.join(", ") + ")",
    );
  const p = field(j, "params", path);
  if (!isObj(p)) throw new InputError(path + "params must be an object");
  const pp = path + "params.";

  if (d === "exponential" || d === "poisson") {
    const m = getString(p, "mode", pp);
    const o =
      m === "ratePerHour" ? 1 : m === "ratePerMinute" ? 2
      : m === "meanMinutes" ? 3 : m === "meanHours" ? 4 : 0;
    if (!o)
      throw new InputError(
        pp + "mode must be one of ratePerHour, ratePerMinute, meanMinutes, meanHours",
      );
    const mean = meanTime(o, getPositive(p, "value", pp));
    return { mean, var: mean * mean }; // exponential: sigma^2 = mean^2
  }
  if (d === "gamma") {
    const k = getPositive(p, "k", pp);
    let th = getPositive(p, "theta", pp);
    th = toMinutes(th, getTimeUnit(p, "thetaUnit", pp));
    return { mean: k * th, var: k * th * th };
  }
  // uniform
  let mn = getPositive(p, "min", pp);
  let mx = getPositive(p, "max", pp);
  const u = getTimeUnit(p, "unit", pp);
  mn = toMinutes(mn, u);
  mx = toMinutes(mx, u);
  if (!(mx > mn)) throw new InputError(pp + "max must be greater than min");
  return { mean: (mx + mn) / 2.0, var: ((mx - mn) * (mx - mn)) / 12.0 };
}

function parseInput(j: unknown): Input {
  if (!isObj(j)) throw new InputError("Input must be a JSON object");
  const m = getString(j, "model", "");
  const model = m === "MM1" ? 1 : m === "MG1" ? 2 : m === "GG1" ? 3 : 0;
  if (!model) throw new InputError('model must be "MM1", "MG1" or "GG1"');

  const us = getString(j, "outputUnit", "");
  let unit: number;
  if (us === "hour") unit = 1;
  else if (us === "minute") unit = 2;
  else throw new InputError('outputUnit must be "hour" or "minute"');

  const markov = ["exponential", "poisson"];
  const mg1Service = ["exponential", "gamma", "uniform"];
  const general = ["poisson", "exponential", "gamma", "uniform"];

  const a = field(j, "arrival", "");
  const s = field(j, "service", "");
  if (model === 1)
    return { model, unit, A: parseDist(a, "arrival", markov), S: parseDist(s, "service", markov) };
  if (model === 2)
    return { model, unit, A: parseDist(a, "arrival", markov), S: parseDist(s, "service", mg1Service) };
  return { model, unit, A: parseDist(a, "arrival", general), S: parseDist(s, "service", general) };
}

/** Parse + calculate. Throws InputError for invalid input. */
export function run(body: unknown): Result {
  return calculate(parseInput(body));
}
