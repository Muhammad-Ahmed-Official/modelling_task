#include <iostream>
#include <string>
#include <cmath>
#include <cstdio>
#ifdef _WIN32
#include <windows.h>
#endif
using namespace std;

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

double readPositive(const string &prompt) {
    double v;
    while (true) {
        cout << prompt;
        if (cin >> v && v > 0) return v;
        cin.clear();
        cin.ignore(10000, '\n');
        cout << "  Please enter a number greater than 0.\n";
    }
}

int readChoice(const string &prompt, int lo, int hi) {
    int c;
    while (true) {
        cout << prompt;
        if (cin >> c && c >= lo && c <= hi) return c;
        cin.clear();
        cin.ignore(10000, '\n');
        cout << "  Invalid choice, try again.\n";
    }
}

// Returns time in minutes for a value given in minutes (1) or hours (2)
double toMinutes(double v, int unit) { return unit == 1 ? v : v * 60.0; }

// Reads a rate OR a mean time and returns MEAN TIME in minutes
double readMeanTime(const string &name) {
    cout << "\n" << name << " is given as:\n"
         << "  1. Rate per hour   (e.g. 10 customers per hour)\n"
         << "  2. Rate per minute (e.g. 0.5 customers per minute)\n"
         << "  3. Mean time in minutes (e.g. 8 min)\n"
         << "  4. Mean time in hours   (e.g. 0.5 hour)\n";
    int o = readChoice("Select (1-4): ", 1, 4);
    double v = readPositive("Enter value: ");
    if (o == 1) return 60.0 / v;
    if (o == 2) return 1.0 / v;
    if (o == 3) return v;
    return v * 60.0;
}

struct Dist {
    double mean;  // minutes
    double var;   // minutes^2
};

// distribution for G (arrival or service)
Dist readDist(const string &who, bool allowPoisson) {
    cout << "\nSelect distribution for " << who << ":\n"
         << "  1. Exponential\n  2. Gamma\n  3. Uniform\n";
    if (allowPoisson) cout << "  4. Poisson (exponential inter-arrival/service times)\n";
    int d = readChoice("Select: ", 1, allowPoisson ? 4 : 3);
    Dist r;
    if (d == 1 || d == 4) {
        r.mean = readMeanTime(who + " (rate or mean time)");
        r.var = r.mean * r.mean;  // exponential: sigma^2 = mean^2
    } else if (d == 2) {
        cout << "\nGamma: mean = k·θ , σ² = k·θ²\n";
        double k = readPositive("Enter shape k: ");
        cout << "Unit of θ:  1. minutes   2. hours\n";
        int u = readChoice("Select: ", 1, 2);
        double th = toMinutes(readPositive("Enter scale θ: "), u);
        r.mean = k * th;
        r.var = k * th * th;
    } else {
        cout << "\nUniform: mean = (max+min)/2 , σ² = (max-min)²/12\n";
        cout << "Unit of min/max:  1. minutes   2. hours\n";
        int u = readChoice("Select: ", 1, 2);
        double mn, mx;
        while (true) {
            mn = toMinutes(readPositive("Enter min: "), u);
            mx = toMinutes(readPositive("Enter max: "), u);
            if (mx > mn) break;
            cout << "  max must be greater than min.\n";
        }
        r.mean = (mx + mn) / 2.0;
        r.var = (mx - mn) * (mx - mn) / 12.0;
    }
    return r;
}

void show(const string &symbol, const string &formula, const string &subst,
          double val, const string &unit) {
    cout << symbol << " = " << formula << " = " << subst << " = " << fmt(val)
         << " " << unit << "\n";
}

string custUnit(double v) { return fabs(v - 1.0) < 1e-9 ? "customer" : "customers"; }

int main() {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#endif
    char again;
    do {
        cout << "\n==============================\n"
             << "   QUEUEING MODEL CALCULATOR\n"
             << "==============================\n"
             << "Select Distribution / Model:\n"
             << "  1. M/M/1\n  2. M/G/1\n  3. G/G/1\n";
        int model = readChoice("Select (1-3): ", 1, 3);

        Dist A, S;  // arrival inter-arrival, service time (minutes)

        if (model == 1) {
            cout << "\nM/M/1: Poisson arrivals and Exponential service (fixed).\n";
            A.mean = readMeanTime("Arrival (λ)");
            S.mean = readMeanTime("Service (μ)");
            A.var = A.mean * A.mean;
            S.var = S.mean * S.mean;
        } else if (model == 2) {
            cout << "\nM/G/1: Poisson arrivals (fixed), General service.\n";
            A.mean = readMeanTime("Arrival (λ)");
            A.var = A.mean * A.mean;
            S = readDist("Service time (G)", false);
        } else {
            cout << "\nG/G/1: General arrivals and General service.\n";
            A = readDist("Inter-arrival time (G)", true);
            S = readDist("Service time (G)", true);
        }

        cout << "\nAnswer wanted in:  1. Hours   2. Minutes\n";
        int u = readChoice("Select: ", 1, 2);
        double f = (u == 1) ? 60.0 : 1.0;           // minutes per output unit
        string tu = (u == 1) ? "hours" : "minutes";

        // convert to output unit
        double ma = A.mean / f, ms = S.mean / f;
        double va = A.var / (f * f), vs = S.var / (f * f);
        double lam = 1.0 / ma, mu = 1.0 / ms;
        double rho = lam / mu;

        cout << "\n------------------------------\n";
        cout << "Distribution select ";
        cout << (model == 1 ? "M/M/1" : model == 2 ? "M/G/1" : "G/G/1") << "\n";
        cout << "Answer want in " << (u == 1 ? "Hour" : "Minute") << "\n";
        cout << "------------------------------\n";

        if (rho >= 1.0) {
            cout << "λ = " << fmt(lam) << " , μ = " << fmt(mu)
                 << " , ρ = " << fmt(rho) << "\n"
                 << "System is UNSTABLE (ρ >= 1). Queue grows forever, "
                    "no steady-state answer.\n";
        } else {
            string sl = fmt(lam), sm = fmt(mu), sr = fmt(rho);
            cout << "λ = 1/Mean Inter-arrival Time = 1/" << fmt(ma) << " = "
                 << sl << " customers per " << tu.substr(0, tu.size() - 1) << "\n";
            cout << "μ = 1/Mean Service Time = 1/" << fmt(ms) << " = " << sm
                 << " customers per " << tu.substr(0, tu.size() - 1) << "\n\n";
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
                cout << "σs² = " << fmt(vs) << " " << tu << "²\n";
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
                cout << "σa² = " << fmt(va) << " " << tu << "² , σs² = "
                     << fmt(vs) << " " << tu << "²\n";
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
        }

        cout << "\nCalculate another query? (y/n): ";
        cin >> again;
    } while (again == 'y' || again == 'Y');

    cout << "Goodbye!\n";
    return 0;
}