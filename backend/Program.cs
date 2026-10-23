using System.Text.Json;
using QueueApi;

var builder = WebApplication.CreateBuilder(args);

// Allowed frontend origins (comma separated), e.g. "http://localhost:3000"
string[] origins = (builder.Configuration["FrontendOrigins"] ?? "http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(origins).AllowAnyHeader().WithMethods("POST")));

var app = builder.Build();
app.UseCors();

app.MapPost("/api/calculate", async (HttpRequest req, ILogger<Program> log) =>
{
    JsonElement body;
    try
    {
        using var doc = await JsonDocument.ParseAsync(req.Body);
        body = doc.RootElement.Clone();
    }
    catch (JsonException)
    {
        return Results.Json(new { ok = false, error = "Input is not valid JSON" }, statusCode: 400);
    }

    try
    {
        var result = QueueCalculator.Run(body);
        // ok:false here means the system is unstable (ρ >= 1)
        return Results.Json(result, statusCode: result.Ok ? 200 : 400);
    }
    catch (InputException e)
    {
        return Results.Json(new { ok = false, error = e.Message }, statusCode: 400);
    }
    catch (Exception e)
    {
        log.LogError(e, "calculate failed");
        return Results.Json(new { ok = false, error = "Internal error: " + e.Message }, statusCode: 500);
    }
});

app.Run();
