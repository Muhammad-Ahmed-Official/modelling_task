"use client";

import { useState } from "react";

type Model = "MM1" | "MG1" | "GG1";
type OutputUnit = "hour" | "minute";
type DistName = "exponential" | "poisson" | "gamma" | "uniform";
type RateMode = "ratePerHour" | "ratePerMinute" | "meanMinutes" | "meanHours";
type TimeUnit = "minute" | "hour";

type DistState = {
  dist: DistName;
  mode: RateMode;
  value: string;
  k: string;
  theta: string;
  thetaUnit: TimeUnit;
  min: string;
  max: string;
  unit: TimeUnit;
};

// C# backend (see /backend); override with NEXT_PUBLIC_API_URL in .env.local
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type Step = { symbol: string; formula: string; substitution: string; value: string; unit: string };
type ApiResult =
  | { ok: true; model: string; unit: string; steps: Step[] }
  | { ok: false; error: string };

const MODELS: { value: Model; label: string }[] = [
  { value: "MM1", label: "M/M/1" },
  { value: "MG1", label: "M/G/1" },
  { value: "GG1", label: "G/G/1" },
];

const DIST_LABELS: Record<DistName, string> = {
  poisson: "Poisson",
  exponential: "Exponential",
  gamma: "Gamma",
  uniform: "Uniform",
};

// null = fixed (exponential / Poisson), no dropdown shown
const DIST_OPTIONS: Record<Model, { arrival: DistName[] | null; service: DistName[] | null }> = {
  MM1: { arrival: null, service: null },
  MG1: { arrival: null, service: ["exponential", "gamma", "uniform"] },
  GG1: {
    arrival: ["poisson", "exponential", "gamma", "uniform"],
    service: ["poisson", "exponential", "gamma", "uniform"],
  },
};

const RATE_MODES: { value: RateMode; label: string }[] = [
  { value: "ratePerHour", label: "per hour" },
  { value: "ratePerMinute", label: "per minute" },
  { value: "meanMinutes", label: "mean time (min)" },
  { value: "meanHours", label: "mean time (hours)" },
];

const emptyDist = (dist: DistName): DistState => ({
  dist,
  mode: "ratePerHour",
  value: "",
  k: "",
  theta: "",
  thetaUnit: "minute",
  min: "",
  max: "",
  unit: "minute",
});

const fieldBase =
  "h-9 rounded-md border bg-neutral-900/70 px-3 text-neutral-100 outline-none " +
  "hover:border-neutral-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30";
const inputCls = fieldBase + " border-neutral-700";
const invalidCls =
  fieldBase + " border-red-500 hover:border-red-400 focus:border-red-400 focus:ring-red-400/30";
const selectCls = inputCls + " cursor-pointer bg-neutral-900";

function positive(s: string): number | null {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

// Returns params for the API, or an error message
function buildParams(d: DistState, label: string): Record<string, unknown> | string {
  const bad = (field: string) => `${label}: ${field} must be a number greater than 0`;
  if (d.dist === "exponential" || d.dist === "poisson") {
    const value = positive(d.value);
    if (value === null) return bad("value");
    return { mode: d.mode, value };
  }
  if (d.dist === "gamma") {
    const k = positive(d.k);
    const theta = positive(d.theta);
    if (k === null) return bad("k");
    if (theta === null) return bad("θ");
    return { k, theta, thetaUnit: d.thetaUnit };
  }
  const min = positive(d.min);
  const max = positive(d.max);
  if (min === null) return bad("min");
  if (max === null) return bad("max");
  if (max <= min) return `${label}: max must be greater than min`;
  return { min, max, unit: d.unit };
}

function NumberField(props: {
  label: string;
  value: string;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 text-sm text-neutral-300">{props.label}</span>
      <input
        type="number"
        min="0"
        step="any"
        required
        aria-invalid={props.invalid || undefined}
        className={(props.invalid ? invalidCls : inputCls) + " w-36"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function UnitSelect(props: { value: TimeUnit; onChange: (v: TimeUnit) => void }) {
  return (
    <select
      className={selectCls}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as TimeUnit)}
    >
      <option value="minute">minutes</option>
      <option value="hour">hours</option>
    </select>
  );
}

function DistFields(props: {
  title: string;
  options: DistName[] | null;
  state: DistState;
  showErrors: boolean;
  onChange: (s: DistState) => void;
}) {
  const { state: d, onChange } = props;
  const set = (patch: Partial<DistState>) => onChange({ ...d, ...patch });
  const bad = (v: string) => props.showErrors && positive(v) === null;
  const minN = positive(d.min);
  const maxN = positive(d.max);
  const maxBad = bad(d.max) || (props.showErrors && minN !== null && maxN !== null && maxN <= minN);

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-700 bg-neutral-800/30 p-4">
      <legend className="px-1 font-medium">{props.title}</legend>

      {props.options && (
        <label className="flex items-center gap-2">
          <span className="w-24 text-sm text-neutral-300">Distribution</span>
          <select
            className={selectCls}
            value={d.dist}
            onChange={(e) => set({ dist: e.target.value as DistName })}
          >
            {props.options.map((o) => (
              <option key={o} value={o}>
                {DIST_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
      )}

      {(d.dist === "exponential" || d.dist === "poisson") && (
        <div className="flex flex-wrap items-center gap-2">
          <NumberField label="Value" value={d.value} invalid={bad(d.value)} onChange={(value) => set({ value })} />
          <select
            className={selectCls}
            value={d.mode}
            onChange={(e) => set({ mode: e.target.value as RateMode })}
          >
            {RATE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {d.dist === "gamma" && (
        <>
          <p className="text-sm text-neutral-400">mean = k·θ , σ² = k·θ²</p>
          <NumberField label="Shape k" value={d.k} invalid={bad(d.k)} onChange={(k) => set({ k })} />
          <div className="flex flex-wrap items-center gap-2">
            <NumberField label="Scale θ" value={d.theta} invalid={bad(d.theta)} onChange={(theta) => set({ theta })} />
            <UnitSelect value={d.thetaUnit} onChange={(thetaUnit) => set({ thetaUnit })} />
          </div>
        </>
      )}

      {d.dist === "uniform" && (
        <>
          <p className="text-sm text-neutral-400">mean = (max+min)/2 , σ² = (max-min)²/12</p>
          <NumberField label="Min" value={d.min} invalid={bad(d.min)} onChange={(min) => set({ min })} />
          <NumberField label="Max" value={d.max} invalid={maxBad} onChange={(max) => set({ max })} />
          <label className="flex items-center gap-2">
            <span className="w-24 text-sm text-neutral-300">Unit</span>
            <UnitSelect value={d.unit} onChange={(unit) => set({ unit })} />
          </label>
        </>
      )}
    </fieldset>
  );
}

function stepLine(s: Step): string {
  let line = s.symbol;
  if (s.formula) line += ` = ${s.formula}`;
  if (s.substitution) line += ` = ${s.substitution}`;
  line += ` = ${s.value}`;
  if (s.unit) line += ` ${s.unit}`;
  return line;
}

export default function Home() {
  const [model, setModel] = useState<Model>("MM1");
  const [outputUnit, setOutputUnit] = useState<OutputUnit>("hour");
  const [arrival, setArrival] = useState<DistState>(emptyDist("poisson"));
  const [service, setService] = useState<DistState>(emptyDist("exponential"));
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<ApiResult, { ok: true }> | null>(null);

  const opts = DIST_OPTIONS[model];

  function changeModel(m: Model) {
    setModel(m);
    // Fixed (null) parts are Poisson arrivals / exponential service;
    // otherwise keep the current choice if it is still allowed.
    const fix = (d: DistState, allowed: DistName[] | null, fixed: DistName): DistState => {
      if (!allowed) return { ...d, dist: fixed };
      return allowed.includes(d.dist) ? d : { ...d, dist: allowed[0] };
    };
    setArrival((d) => fix(d, DIST_OPTIONS[m].arrival, "poisson"));
    setService((d) => fix(d, DIST_OPTIONS[m].service, "exponential"));
    setResult(null);
    setError(null);
    setSubmitted(false);
  }

  function reset() {
    setModel("MM1");
    setOutputUnit("hour");
    setArrival(emptyDist("poisson"));
    setService(emptyDist("exponential"));
    setResult(null);
    setError(null);
    setSubmitted(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    setResult(null);

    const a = buildParams(arrival, opts.arrival ? "Arrival" : "Arrival (λ)");
    if (typeof a === "string") return setError(a);
    const s = buildParams(service, opts.service ? "Service" : "Service (μ)");
    if (typeof s === "string") return setError(s);

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          outputUnit,
          arrival: { dist: arrival.dist, params: a },
          service: { dist: service.dist, params: s },
        }),
      });
      const data = (await res.json()) as ApiResult;
      if (data.ok) setResult(data);
      else setError(data.error);
    } catch {
      setError(`Could not reach the server at ${API_URL}. Is the C# backend running?`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Queueing Model Calculator</h1>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <span className="text-sm text-neutral-300">Model</span>
            <select
              className={selectCls}
              value={model}
              onChange={(e) => changeModel(e.target.value as Model)}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-neutral-300">Answer in</span>
            <select
              className={selectCls}
              value={outputUnit}
              onChange={(e) => setOutputUnit(e.target.value as OutputUnit)}
            >
              <option value="hour">Hour</option>
              <option value="minute">Minute</option>
            </select>
          </label>
        </div>

        <DistFields
          title={opts.arrival ? "Inter-arrival time (G)" : "Arrival (λ)"}
          options={opts.arrival}
          state={arrival}
          showErrors={submitted}
          onChange={setArrival}
        />
        <DistFields
          title={opts.service ? "Service time (G)" : "Service (μ)"}
          options={opts.service}
          state={service}
          showErrors={submitted}
          onChange={setService}
        />

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="h-10 cursor-pointer rounded-md bg-sky-500 px-5 font-medium text-neutral-950 hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Calculating…" : "Calculate"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={loading}
            className="h-10 cursor-pointer rounded-md border border-neutral-600 px-5 font-medium text-neutral-200 hover:border-neutral-400 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-6 rounded-md border border-red-500/60 bg-red-950/60 p-3 text-red-200">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">
            Result ({result.model}, answer in {result.unit})
          </h2>
          <div className="flex flex-col gap-1 rounded-lg border border-neutral-700 bg-neutral-900/60 p-4 font-mono text-sm">
            {result.steps.map((s, i) => (
              <div key={i} className="break-words">{stepLine(s)}</div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
