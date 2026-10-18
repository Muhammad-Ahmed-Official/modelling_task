// Queueing calculator core (M/M/1, M/G/1, G/G/1).
// Reads ONE JSON object from stdin, writes ONE JSON object to stdout.
// Formulas and number formatting are identical to ../../queue_calculator.cpp.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>

#include "json.hpp"

using namespace std;
using json = nlohmann::json;

// 32.000000 -> 32 , 0.125000 -> 0.125
string fmt(double v) {
    char b[64];
    snprintf(b, sizeof(b), "%.6f", v);
    string s = b;
    while (s.back() == '0') s.pop_back();
    if (s.back() == '.') s.pop_back();
    if (s == "-0") s = "0";
    return s;
}

// Returns time in minutes for a value given in minutes (1) or hours (2)
double toMinutes(double v, int unit) { return unit == 1 ? v : v * 60.0; }

// Converts a rate OR a mean time to MEAN TIME in minutes
// o: 1 = rate per hour, 2 = rate per minute, 3 = mean minutes, 4 = mean hours
double meanTime(int o, double v) {
    if (o == 1) return 60.0 / v;
    if (o == 2) return 1.0 / v;
    if (o == 3) return v;
    return v * 60.0;
}

struct Dist {
    double mean;  // minutes
    double var;   // minutes^2
};

struct Input {
    int model;  // 1 = M/M/1, 2 = M/G/1, 3 = G/G/1
    int unit;   // 1 = hours, 2 = minutes
    Dist A, S;  // arrival inter-arrival, service time (minutes)
};

struct Step {
    string symbol, formula, substitution, value, unit;
};

struct Result {
    bool ok;
    string error;
    string model;
    string unit;
    vector<Step> steps;
};

// ---------------------------------------------------------------------------
// Pure calculation: no I/O.
// ---------------------------------------------------------------------------

string custUnit(double v) { return fabs(v - 1.0) < 1e-9 ? "customer" : "customers"; }

Result calculate(const Input &in) {
    Result r;
    r.ok = true;
    const int model = in.model, u = in.unit;
    const Dist &A = in.A, &S = in.S;
    vector<Step> &out = r.steps;
    auto show = [&](const string &symbol, const string &formula, const string &subst,
                    double val, const string &unit) {
        out.push_back({symbol, formula, subst, fmt(val), unit});
    };

    r.model = model == 1 ? "M/M/1" : model == 2 ? "M/G/1" : "G/G/1";

    double f = (u == 1) ? 60.0 : 1.0;  // minutes per output unit
    string tu = (u == 1) ? "hours" : "minutes";
    r.unit = tu;

    // convert to output unit
    double ma = A.mean / f, ms = S.mean / f;
    double va = A.var / (f * f), vs = S.var / (f * f);
    double lam = 1.0 / ma, mu = 1.0 / ms;
    double rho = lam / mu;

    if (rho >= 1.0) {
        r.ok = false;
        r.error = "System is unstable (ρ ≥ 1): λ = " + fmt(lam) + " , μ = " + fmt(mu) +
                  " , ρ = " + fmt(rho) +
                  ". Queue grows forever, no steady-state answer.";
        r.steps.clear();
        return r;
    }

    string sl = fmt(lam), sm = fmt(mu), sr = fmt(rho);
    string per = "customers per " + tu.substr(0, tu.size() - 1);
    out.push_back({"λ", "1/Mean Inter-arrival Time", "1/" + fmt(ma), sl, per});
    out.push_back({"μ", "1/Mean Service Time", "1/" + fmt(ms), sm, per});
    show("ρ", "λ/μ", sl + "/" + sm, rho, "");

    if (model == 1) {
        double Lq = rho * rho / (1 - rho);
        double L = rho / (1 - rho);
        double Wq = Lq / lam, W = L / lam;
        show("Lq", "ρ²/(1-ρ)", sr + "²/(1-" + sr + ")", Lq, custUnit(Lq));
        show("L", "ρ/(1-ρ)", sr + "/(1-" + sr + ")", L, custUnit(L));
        show("Wq", "Lq/λ", fmt(Lq) + "/" + sl, Wq, tu);
        show("W", "L/λ", fmt(L) + "/" + sl, W, tu);
    } else if (model == 2) {
        double Lq = (lam * lam * vs + rho * rho) / (2 * (1 - rho));
        double Wq = Lq / lam;
        double W = Wq + 1.0 / mu;
        double L = lam * W;
        out.push_back({"σs²", "", "", fmt(vs), tu + "²"});
        show("Lq", "(λ²·σs² + ρ²)/(2(1-ρ))",
             "(" + sl + "²·" + fmt(vs) + " + " + sr + "²)/(2(1-" + sr + "))",
             Lq, custUnit(Lq));
        show("Wq", "Lq/λ", fmt(Lq) + "/" + sl, Wq, tu);
        show("W", "Wq + 1/μ", fmt(Wq) + " + 1/" + sm, W, tu);
        show("L", "λ·W", sl + "·" + fmt(W), L, custUnit(L));
        show("Server idle", "1-ρ", "1-" + sr, 1 - rho, "");
    } else {
        double Ca2 = va / (ma * ma);
        double Cs2 = vs / (ms * ms);
        double Lq = rho * rho * (1 + Cs2) * (Ca2 + rho * rho * Cs2) /
                    (2 * (1 - rho) * (1 + rho * rho * Cs2));
        double Wq = Lq / lam;
        double W = Wq + 1.0 / mu;
        double L = lam * W;
        string sca = fmt(Ca2), scs = fmt(Cs2);
        out.push_back({"σa²", "", "", fmt(va), tu + "²"});
        out.push_back({"σs²", "", "", fmt(vs), tu + "²"});
        show("Ca²", "σa²/(1/λ)²", fmt(va) + "/(1/" + sl + ")²", Ca2, "");
        show("Cs²", "σs²/(1/μ)²", fmt(vs) + "/(1/" + sm + ")²", Cs2, "");
        show("Lq",
             "ρ²(1+Cs²)(Ca²+ρ²·Cs²)/(2(1-ρ)(1+ρ²·Cs²))",
             sr + "²(1+" + scs + ")(" + sca + "+" + sr + "²·" + scs + ")/(2(1-" +
                 sr + ")(1+" + sr + "²·" + scs + "))",
             Lq, custUnit(Lq));
        show("Wq", "Lq/λ", fmt(Lq) + "/" + sl, Wq, tu);
        show("W", "Wq + 1/μ", fmt(Wq) + " + 1/" + sm, W, tu);
        show("L", "λ·W", sl + "·" + fmt(W), L, custUnit(L));
        show("Server idle", "1-ρ", "1-" + sr, 1 - rho, "");
    }
    return r;
}

// ---------------------------------------------------------------------------
// JSON -> Input (throws invalid_argument with a user-facing message)
// ---------------------------------------------------------------------------

const json &field(const json &obj, const string &key, const string &path) {
    if (!obj.is_object() || !obj.contains(key))
        throw invalid_argument("Missing field: " + path + key);
    return obj.at(key);
}

string getString(const json &obj, const string &key, const string &path) {
    const json &v = field(obj, key, path);
    if (!v.is_string()) throw invalid_argument(path + key + " must be a string");
    return v.get<string>();
}

double getPositive(const json &obj, const string &key, const string &path) {
    const json &v = field(obj, key, path);
    if (!v.is_number()) throw invalid_argument(path + key + " must be a number");
    double d = v.get<double>();
    if (!std::isfinite(d) || d <= 0)
        throw invalid_argument(path + key + " must be a number greater than 0");
    return d;
}

int getTimeUnit(const json &obj, const string &key, const string &path) {
    string s = getString(obj, key, path);
    if (s == "minute") return 1;
    if (s == "hour") return 2;
    throw invalid_argument(path + key + " must be \"minute\" or \"hour\"");
}

// dist: exponential/poisson -> rate or mean; gamma -> k, theta; uniform -> min, max
Dist parseDist(const json &j, const string &who, const vector<string> &allowed) {
    string path = who + ".";
    string d = getString(j, "dist", path);
    bool ok = false;
    for (const string &a : allowed) ok = ok || a == d;
    if (!ok) {
        string list;
        for (size_t i = 0; i < allowed.size(); i++) list += (i ? ", " : "") + allowed[i];
        throw invalid_argument(path + "dist \"" + d + "\" is not allowed here (allowed: " +
                               list + ")");
    }
    const json &p = field(j, "params", path);
    if (!p.is_object()) throw invalid_argument(path + "params must be an object");
    string pp = path + "params.";

    Dist r;
    if (d == "exponential" || d == "poisson") {
        string m = getString(p, "mode", pp);
        int o = m == "ratePerHour" ? 1 : m == "ratePerMinute" ? 2
              : m == "meanMinutes" ? 3 : m == "meanHours" ? 4 : 0;
        if (!o)
            throw invalid_argument(pp + "mode must be one of ratePerHour, ratePerMinute, "
                                        "meanMinutes, meanHours");
        r.mean = meanTime(o, getPositive(p, "value", pp));
        r.var = r.mean * r.mean;  // exponential: sigma^2 = mean^2
    } else if (d == "gamma") {
        double k = getPositive(p, "k", pp);
        double th = getPositive(p, "theta", pp);
        th = toMinutes(th, getTimeUnit(p, "thetaUnit", pp));
        r.mean = k * th;
        r.var = k * th * th;
    } else {  // uniform
        double mn = getPositive(p, "min", pp);
        double mx = getPositive(p, "max", pp);
        int u = getTimeUnit(p, "unit", pp);
        mn = toMinutes(mn, u);
        mx = toMinutes(mx, u);
        if (!(mx > mn)) throw invalid_argument(pp + "max must be greater than min");
        r.mean = (mx + mn) / 2.0;
        r.var = (mx - mn) * (mx - mn) / 12.0;
    }
    return r;
}

Input parseInput(const json &j) {
    if (!j.is_object()) throw invalid_argument("Input must be a JSON object");
    Input in;
    string m = getString(j, "model", "");
    in.model = m == "MM1" ? 1 : m == "MG1" ? 2 : m == "GG1" ? 3 : 0;
    if (!in.model) throw invalid_argument("model must be \"MM1\", \"MG1\" or \"GG1\"");

    string u = getString(j, "outputUnit", "");
    if (u == "hour") in.unit = 1;
    else if (u == "minute") in.unit = 2;
    else throw invalid_argument("outputUnit must be \"hour\" or \"minute\"");

    const vector<string> markov = {"exponential", "poisson"};
    const vector<string> mg1Service = {"exponential", "gamma", "uniform"};
    const vector<string> general = {"poisson", "exponential", "gamma", "uniform"};

    const json &a = field(j, "arrival", "");
    const json &s = field(j, "service", "");
    if (in.model == 1) {
        in.A = parseDist(a, "arrival", markov);
        in.S = parseDist(s, "service", markov);
    } else if (in.model == 2) {
        in.A = parseDist(a, "arrival", markov);
        in.S = parseDist(s, "service", mg1Service);
    } else {
        in.A = parseDist(a, "arrival", general);
        in.S = parseDist(s, "service", general);
    }
    return in;
}

// ---------------------------------------------------------------------------

json toJson(const Result &r) {
    if (!r.ok) return {{"ok", false}, {"error", r.error}};
    json steps = json::array();
    for (const Step &s : r.steps)
        steps.push_back({{"symbol", s.symbol},
                         {"formula", s.formula},
                         {"substitution", s.substitution},
                         {"value", s.value},
                         {"unit", s.unit}});
    return {{"ok", true}, {"model", r.model}, {"unit", r.unit}, {"steps", steps}};
}

int main() {
    string text((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    json out;
    int code = 0;
    try {
        json j = json::parse(text);
        out = toJson(calculate(parseInput(j)));
    } catch (const json::parse_error &) {
        out = {{"ok", false}, {"error", "Input is not valid JSON"}};
        code = 2;
    } catch (const invalid_argument &e) {
        out = {{"ok", false}, {"error", e.what()}};
        code = 2;
    } catch (const exception &e) {
        out = {{"ok", false}, {"error", string("Internal error: ") + e.what()}};
        code = 1;
    }
    cout << out.dump() << "\n";
    return code;
}
