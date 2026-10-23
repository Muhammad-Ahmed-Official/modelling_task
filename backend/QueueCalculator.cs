// Queueing calculator core (M/M/1, M/G/1, G/G/1).
// Same formulas and output strings as the original console program,
// but returns the steps as data instead of writing them to the console.

using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QueueApi;

public record Step(string Symbol, string Formula, string Substitution, string Value, string Unit);

public record Result(
    bool Ok,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Model = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Unit = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] List<Step>? Steps = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Error = null);

/// Thrown for invalid input; message is shown to the user.
public class InputException(string message) : Exception(message);

class Dist
{
    public double Mean; // minutes
    public double Var;  // minutes^2
}

public static class QueueCalculator
{
    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    // 32.000000 -> 32 , 0.125000 -> 0.125
    public static string Fmt(double v)
    {
        string s = v.ToString("F6", Inv);
        s = s.TrimEnd('0');
        if (s.EndsWith(".")) s = s.Substring(0, s.Length - 1);
        if (s == "-0") s = "0";
        return s;
    }

    // Returns time in minutes for a value given in minutes (1) or hours (2)
    static double ToMinutes(double v, int unit) => unit == 1 ? v : v * 60.0;

    // Converts a rate OR a mean time to MEAN TIME in minutes
    // o: 1 = rate per hour, 2 = rate per minute, 3 = mean minutes, 4 = mean hours
    static double MeanTime(int o, double v)
    {
        if (o == 1) return 60.0 / v;
        if (o == 2) return 1.0 / v;
        if (o == 3) return v;
        return v * 60.0;
    }

    static string CustUnit(double v) => Math.Abs(v - 1.0) < 1e-9 ? "customer" : "customers";

    // ------------------------------------------------------------------
    // Pure calculation: no I/O.
    // model: 1 = M/M/1, 2 = M/G/1, 3 = G/G/1 ; u: 1 = hours, 2 = minutes
    // ------------------------------------------------------------------
    static Result Calculate(int model, int u, Dist A, Dist S)
    {
        var out_ = new List<Step>();
        void Show(string symbol, string formula, string subst, double val, string unit) =>
            out_.Add(new Step(symbol, formula, subst, Fmt(val), unit));

        string modelName = model == 1 ? "M/M/1" : model == 2 ? "M/G/1" : "G/G/1";

        double f = (u == 1) ? 60.0 : 1.0; // minutes per output unit
        string tu = (u == 1) ? "hours" : "minutes";

        // convert to output unit
        double ma = A.Mean / f, ms = S.Mean / f;
        double va = A.Var / (f * f), vs = S.Var / (f * f);
        double lam = 1.0 / ma, mu = 1.0 / ms;
        double rho = lam / mu;

        if (rho >= 1.0)
            return new Result(false, Error:
                "System is unstable (ρ ≥ 1): λ = " + Fmt(lam) + " , μ = " + Fmt(mu) +
                " , ρ = " + Fmt(rho) + ". Queue grows forever, no steady-state answer.");

        string sl = Fmt(lam), sm = Fmt(mu), sr = Fmt(rho);
        string per = "customers per " + tu.Substring(0, tu.Length - 1);
        out_.Add(new Step("λ", "1/Mean Inter-arrival Time", "1/" + Fmt(ma), sl, per));
        out_.Add(new Step("μ", "1/Mean Service Time", "1/" + Fmt(ms), sm, per));
        Show("ρ", "λ/μ", sl + "/" + sm, rho, "");

        if (model == 1)
        {
            double Lq = rho * rho / (1 - rho);
            double L = rho / (1 - rho);
            double Wq = Lq / lam, W = L / lam;
            Show("Lq", "ρ²/(1-ρ)", sr + "²/(1-" + sr + ")", Lq, CustUnit(Lq));
            Show("L", "ρ/(1-ρ)", sr + "/(1-" + sr + ")", L, CustUnit(L));
            Show("Wq", "Lq/λ", Fmt(Lq) + "/" + sl, Wq, tu);
            Show("W", "L/λ", Fmt(L) + "/" + sl, W, tu);
        }
        else if (model == 2)
        {
            double Lq = (lam * lam * vs + rho * rho) / (2 * (1 - rho));
            double Wq = Lq / lam;
            double W = Wq + 1.0 / mu;
            double L = lam * W;
            out_.Add(new Step("σs²", "", "", Fmt(vs), tu + "²"));
            Show("Lq", "(λ²·σs² + ρ²)/(2(1-ρ))",
                 "(" + sl + "²·" + Fmt(vs) + " + " + sr + "²)/(2(1-" + sr + "))",
                 Lq, CustUnit(Lq));
            Show("Wq", "Lq/λ", Fmt(Lq) + "/" + sl, Wq, tu);
            Show("W", "Wq + 1/μ", Fmt(Wq) + " + 1/" + sm, W, tu);
            Show("L", "λ·W", sl + "·" + Fmt(W), L, CustUnit(L));
            Show("Server idle", "1-ρ", "1-" + sr, 1 - rho, "");
        }
        else
        {
            double Ca2 = va / (ma * ma);
            double Cs2 = vs / (ms * ms);
            double Lq = rho * rho * (1 + Cs2) * (Ca2 + rho * rho * Cs2) /
                        (2 * (1 - rho) * (1 + rho * rho * Cs2));
            double Wq = Lq / lam;
            double W = Wq + 1.0 / mu;
            double L = lam * W;
            string sca = Fmt(Ca2), scs = Fmt(Cs2);
            out_.Add(new Step("σa²", "", "", Fmt(va), tu + "²"));
            out_.Add(new Step("σs²", "", "", Fmt(vs), tu + "²"));
            Show("Ca²", "σa²/(1/λ)²", Fmt(va) + "/(1/" + sl + ")²", Ca2, "");
            Show("Cs²", "σs²/(1/μ)²", Fmt(vs) + "/(1/" + sm + ")²", Cs2, "");
            Show("Lq",
                 "ρ²(1+Cs²)(Ca²+ρ²·Cs²)/(2(1-ρ)(1+ρ²·Cs²))",
                 sr + "²(1+" + scs + ")(" + sca + "+" + sr + "²·" + scs + ")/(2(1-" +
                     sr + ")(1+" + sr + "²·" + scs + "))",
                 Lq, CustUnit(Lq));
            Show("Wq", "Lq/λ", Fmt(Lq) + "/" + sl, Wq, tu);
            Show("W", "Wq + 1/μ", Fmt(Wq) + " + 1/" + sm, W, tu);
            Show("L", "λ·W", sl + "·" + Fmt(W), L, CustUnit(L));
            Show("Server idle", "1-ρ", "1-" + sr, 1 - rho, "");
        }
        return new Result(true, modelName, tu, out_);
    }

    // ------------------------------------------------------------------
    // JSON -> input (throws InputException with a user-facing message)
    // ------------------------------------------------------------------

    static JsonElement Field(JsonElement obj, string key, string path)
    {
        if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(key, out var v))
            throw new InputException("Missing field: " + path + key);
        return v;
    }

    static string GetString(JsonElement obj, string key, string path)
    {
        var v = Field(obj, key, path);
        if (v.ValueKind != JsonValueKind.String) throw new InputException(path + key + " must be a string");
        return v.GetString()!;
    }

    static double GetPositive(JsonElement obj, string key, string path)
    {
        var v = Field(obj, key, path);
        if (v.ValueKind != JsonValueKind.Number) throw new InputException(path + key + " must be a number");
        double d = v.GetDouble();
        if (!double.IsFinite(d) || d <= 0)
            throw new InputException(path + key + " must be a number greater than 0");
        return d;
    }

    static int GetTimeUnit(JsonElement obj, string key, string path)
    {
        string s = GetString(obj, key, path);
        if (s == "minute") return 1;
        if (s == "hour") return 2;
        throw new InputException(path + key + " must be \"minute\" or \"hour\"");
    }

    // dist: exponential/poisson -> rate or mean; gamma -> k, theta; uniform -> min, max
    static Dist ParseDist(JsonElement j, string who, string[] allowed)
    {
        string path = who + ".";
        string d = GetString(j, "dist", path);
        if (!allowed.Contains(d))
            throw new InputException(path + "dist \"" + d + "\" is not allowed here (allowed: " +
                                     string.Join(", ", allowed) + ")");
        var p = Field(j, "params", path);
        if (p.ValueKind != JsonValueKind.Object) throw new InputException(path + "params must be an object");
        string pp = path + "params.";

        if (d == "exponential" || d == "poisson")
        {
            string m = GetString(p, "mode", pp);
            int o = m switch
            {
                "ratePerHour" => 1,
                "ratePerMinute" => 2,
                "meanMinutes" => 3,
                "meanHours" => 4,
                _ => throw new InputException(
                    pp + "mode must be one of ratePerHour, ratePerMinute, meanMinutes, meanHours"),
            };
            double mean = MeanTime(o, GetPositive(p, "value", pp));
            return new Dist { Mean = mean, Var = mean * mean }; // exponential: sigma^2 = mean^2
        }
        if (d == "gamma")
        {
            double k = GetPositive(p, "k", pp);
            double th = GetPositive(p, "theta", pp);
            th = ToMinutes(th, GetTimeUnit(p, "thetaUnit", pp));
            return new Dist { Mean = k * th, Var = k * th * th };
        }
        // uniform
        double mn = GetPositive(p, "min", pp);
        double mx = GetPositive(p, "max", pp);
        int u = GetTimeUnit(p, "unit", pp);
        mn = ToMinutes(mn, u);
        mx = ToMinutes(mx, u);
        if (!(mx > mn)) throw new InputException(pp + "max must be greater than min");
        return new Dist { Mean = (mx + mn) / 2.0, Var = (mx - mn) * (mx - mn) / 12.0 };
    }

    /// Parse + calculate. Throws InputException for invalid input.
    public static Result Run(JsonElement j)
    {
        if (j.ValueKind != JsonValueKind.Object) throw new InputException("Input must be a JSON object");
        int model = GetString(j, "model", "") switch
        {
            "MM1" => 1,
            "MG1" => 2,
            "GG1" => 3,
            _ => throw new InputException("model must be \"MM1\", \"MG1\" or \"GG1\""),
        };
        int unit = GetString(j, "outputUnit", "") switch
        {
            "hour" => 1,
            "minute" => 2,
            _ => throw new InputException("outputUnit must be \"hour\" or \"minute\""),
        };

        string[] markov = ["exponential", "poisson"];
        string[] mg1Service = ["exponential", "gamma", "uniform"];
        string[] general = ["poisson", "exponential", "gamma", "uniform"];

        var a = Field(j, "arrival", "");
        var s = Field(j, "service", "");
        if (model == 1)
            return Calculate(model, unit, ParseDist(a, "arrival", markov), ParseDist(s, "service", markov));
        if (model == 2)
            return Calculate(model, unit, ParseDist(a, "arrival", markov), ParseDist(s, "service", mg1Service));
        return Calculate(model, unit, ParseDist(a, "arrival", general), ParseDist(s, "service", general));
    }
}
