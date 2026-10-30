using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Filee.Core.Conversion;
using Filee.Core.Formats;
using Filee.Core.Presets;
using Filee.Engines;
using Filee.Engines.Infrastructure;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

if (args.Contains("--install-engines"))
{
    EngineEnvironment.DownloadRoot = Environment.GetEnvironmentVariable("FILEE_ENGINE_DEST") ?? Path.Combine(AppContext.BaseDirectory,"engines");
    using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromMinutes(20) };
    var installer = new EngineInstaller(http);
    foreach (var name in args.Skip(1))
    {
        var package = name is "rhwp" or "7zip" ? new EnginePackage(name,[name],0,[name]) : EngineDownloads.Packages.Single(p => p.Id == name);
        await installer.InstallAsync(package,null,CancellationToken.None);
        Console.WriteLine("Installed verified Filee engine: " + name);
    }
    return;
}

if (args.Contains("--worker"))
{
    var request = JsonSerializer.Deserialize<WorkerRequest>((await Console.In.ReadToEndAsync()))!;
    var workerCatalog = Runtime.Catalog();
    await using var queue = Runtime.Queue(workerCatalog);
    var preset = new Preset { TargetFormat = request.Target, Output = new OutputRule { Location = OutputLocation.CustomFolder, CustomFolder = request.Output } };
    preset.Image.Quality = request.Options.Quality;
    if (request.Options.Width > 0) { preset.Image.Resize = ResizeMode.Width; preset.Image.Width = request.Options.Width; }
    preset.Pdf.PageRange = request.Options.Pages;
    preset.Pdf.Ocr = request.Options.Ocr;
    preset.Pdf.OcrLanguage = request.Options.Language;
    var job = new ConversionJob(request.Sources, preset, "Web conversion");
    await queue.RunAsync(job);
    Console.WriteLine(JsonSerializer.Serialize(job.Files.Select(f => new { name = Path.GetFileName(f.SourcePath), state = f.State.ToString(), error = f.ErrorKey })));
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://127.0.0.1:8080");
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 155L * 1024 * 1024);
builder.Services.Configure<FormOptions>(o => { o.MultipartBodyLengthLimit = 150L * 1024 * 1024; o.ValueLengthLimit = 8192; o.ValueCountLimit = 64; });
var origins = (Environment.GetEnvironmentVariable("FILEE_ORIGINS") ?? "https://dukewen04.github.io,http://127.0.0.1:8080,http://localhost:8080").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origins).WithHeaders("Authorization", "Content-Type").WithMethods("GET", "POST").WithExposedHeaders("Content-Disposition", "X-Filee-Results")));
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.AddPolicy("conversion", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var token = Environment.GetEnvironmentVariable("FILEE_API_TOKEN") ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
var publicMode = Environment.GetEnvironmentVariable("FILEE_PUBLIC") == "1";
var capacity = new SemaphoreSlim(1);
var root = Path.Combine(Path.GetTempPath(), "filee-web-jobs");
Directory.CreateDirectory(root);
var catalog = Runtime.Catalog();
var app = builder.Build();
app.UseCors();
app.UseRateLimiter();
app.Use(async (context, next) => {
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers.XContentTypeOptions = "nosniff";
    if (context.Request.Path.StartsWithSegments("/api") && !publicMode)
    {
        var supplied = context.Request.Headers.Authorization.ToString();
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes("Bearer " + token)))
        { context.Response.StatusCode = 401; await context.Response.WriteAsJsonAsync(new {error = "需要服务访问令牌"}); return; }
    }
    await next();
});
app.MapGet("/health", () => Results.Ok(new { status = "ready", upstream = Runtime.Upstream }));
app.MapGet("/api/capabilities", () => Results.Ok(new {
    upstream = Runtime.Upstream,
    formats = FormatRegistry.Known.Select(f => new { f.Id, name = f.DisplayName, category = f.Category.ToString(), f.Extensions, f.Writable }),
    engines = catalog.All.Select(e => new { e.Id, name = e.DisplayName, available = catalog.StatusOf(e).IsAvailable, reason = catalog.StatusOf(e).ReasonKey, version = catalog.StatusOf(e).Version }),
    limits = new { maxFiles = 30, maxFileBytes = 50L * 1024 * 1024, maxTotalBytes = 150L * 1024 * 1024 }
}));
app.MapGet("/api/routes", (string name, bool? ocr) => {
    var source = FormatRegistry.Detect(name);
    if (source is null) return Results.Ok(new { source = (string?)null, targets = Array.Empty<object>() });
    var planner = catalog.CreatePlanner();
    var all = new RoutePlanner(catalog.All);
    return Results.Ok(new { source = source.Id, targets = FormatRegistry.Known.Where(f => f.Writable).Select(f => new {format = f, route = planner.Plan(source.Id, f.Id, ocr: ocr == true), possible = all.Plan(source.Id, f.Id, ocr: ocr == true)}).Where(x => x.possible is not null).Select(x => new {
        id = x.format.Id, name = x.format.DisplayName, available = x.route is not null,
        missing = (x.possible?.Steps ?? []).Where(s => !catalog.StatusOf(s.Converter).IsAvailable).Select(s => s.Converter.DisplayName).Distinct()
    }) });
});
app.MapPost("/api/convert", async (HttpContext context) => {
    if (!await capacity.WaitAsync(0, context.RequestAborted)) return Results.Json(new {error = "转换服务繁忙，请稍后重试"}, statusCode: 503);
    var dir = Path.Combine(root, Guid.NewGuid().ToString("N"));
    try
    {
        Directory.CreateDirectory(dir);
        if (!context.Request.HasFormContentType) return Results.BadRequest(new {error = "需要 multipart/form-data 文件"});
        var form = await context.Request.ReadFormAsync(context.RequestAborted);
        var target = form["target"].ToString().ToLowerInvariant();
        if (FormatRegistry.FindById(target) is not { Writable: true }) return Results.BadRequest(new {error = "未知输出格式"});
        if (form.Files.Count is < 1 or > 30 || form.Files.Any(f => f.Length > 50L * 1024 * 1024) || form.Files.Sum(f => f.Length) > 150L * 1024 * 1024) return Results.BadRequest(new {error = "文件数量或大小超限"});
        var quality = int.TryParse(form["quality"], out var q) ? q : 90;
        var width = int.TryParse(form["width"], out var w) ? w : 0;
        var pages = form["pages"].ToString();
        var ocr = form["ocr"] == "true";
        var language = form["language"].ToString(); if (language == "") language = "eng";
        if (quality is < 1 or > 100 || width is < 0 or > 12000 || pages.Length > 1000 || !Regex.IsMatch(language, "^[a-z0-9_+]{1,100}$")) return Results.BadRequest(new {error = "转换参数无效"});
        var input = Directory.CreateDirectory(Path.Combine(dir,"input")).FullName;
        var output = Directory.CreateDirectory(Path.Combine(dir,"output")).FullName;
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var files = new List<string>();
        foreach (var file in form.Files)
        {
            var name = file.FileName.Replace('\\','/');
            if (name != Path.GetFileName(name) || name is "." or ".." || string.IsNullOrWhiteSpace(name) || name.Any(char.IsControl) || name.Contains(':') || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || !names.Add(name)) return Results.BadRequest(new {error = "文件名无效、包含路径或重复；配套文件需保持原名"});
            var path = Path.Combine(input,name);
            await using (var stream = File.Create(path)) await file.CopyToAsync(stream,context.RequestAborted);
            files.Add(path);
        }
        var source = form["source"].ToString();
        var selected = source.Length > 0 ? files.Where(f => Path.GetFileName(f) == source).ToArray() : files.Where(f => FormatRegistry.Detect(f) is not null).ToArray();
        if (selected.Length == 0) return Results.BadRequest(new {error = "找不到要转换的文件"});
        var planner = catalog.CreatePlanner();
        foreach (var path in selected)
        {
            var from = FormatRegistry.Detect(path);
            if (from is null || planner.Plan(from.Id,target,ocr:ocr) is null) return Results.BadRequest(new {error = "当前已安装引擎无法执行此转换，请查看引擎状态"});
        }
        var info = new ProcessStartInfo(Environment.ProcessPath!) { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, WorkingDirectory = dir };
        if (Path.GetFileNameWithoutExtension(Environment.ProcessPath!).Equals("dotnet",StringComparison.OrdinalIgnoreCase)) info.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
        info.ArgumentList.Add("--worker");
        using var process = Process.Start(info)!;
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new WorkerRequest(selected,target,output,new(quality,width,pages,ocr,language))));
        process.StandardInput.Close();
        // Drain bounded logs so a converter cannot block on a full pipe or retain unbounded output.
        var stdout = Runtime.ReadBounded(process.StandardOutput);
        var stderr = Runtime.ReadBounded(process.StandardError);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        timeout.CancelAfter(TimeSpan.FromMinutes(10));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { if (!process.HasExited) process.Kill(entireProcessTree:true); await process.WaitForExitAsync(); return Results.Json(new {error = "转换已取消或超过十分钟"},statusCode:408); }
        var log = await stdout; await stderr;
        if (process.ExitCode != 0) return Results.UnprocessableEntity(new {error = "转换引擎退出，请检查文件是否损坏、加密或超出引擎限制"});
        var result = JsonSerializer.Deserialize<JsonElement[]>(log.Trim().Split('\n').Last())!;
        var outputs = Directory.EnumerateFiles(output,"*",new EnumerationOptions { RecurseSubdirectories = true, AttributesToSkip = FileAttributes.ReparsePoint }).ToArray();
        if (outputs.Any(f => (File.GetAttributes(f) & FileAttributes.ReparsePoint) != 0) || outputs.Sum(f => new FileInfo(f).Length) > 200L*1024*1024 || outputs.Length > 2000) return Results.UnprocessableEntity(new {error = "输出超过服务限制"});
        if (outputs.Length == 0) return Results.UnprocessableEntity(new {error = "转换未产生文件", details = result.Select(r => new { name = r.GetProperty("name").GetString(), error = r.GetProperty("error").GetString() })});
        using var archive = new MemoryStream();
        using(var zip = new ZipArchive(archive,ZipArchiveMode.Create,true)) foreach(var path in outputs) zip.CreateEntryFromFile(path,Path.GetRelativePath(output,path).Replace('\\','/'));
        var failed = result.Count(r => r.GetProperty("state").GetString() != "Done");
        context.Response.Headers["X-Filee-Results"] = failed == 0 ? "complete" : "partial";
        return Results.File(archive.ToArray(),"application/zip","filee-converted.zip");
    }
    catch (BadHttpRequestException) { return Results.BadRequest(new {error = "上传请求无效或超过大小限制"}); }
    catch (InvalidDataException) { return Results.BadRequest(new {error = "文件请求格式错误"}); }
    finally { try { Directory.Delete(dir,true); } catch (Exception error) when (error is IOException or UnauthorizedAccessException) { } finally { capacity.Release(); } }
}).DisableAntiforgery().RequireRateLimiting("conversion");
var webRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"wwwroot"));
if (Directory.Exists(webRoot)) { app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(webRoot) }); app.UseStaticFiles(new StaticFileOptions { FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(webRoot) }); }
if (!publicMode) Console.Error.WriteLine("Filee API token: " + token);
await app.RunAsync();

record ConvertOptions(int Quality,int Width,string Pages,bool Ocr,string Language);
record WorkerRequest(string[] Sources,string Target,string Output,ConvertOptions Options);
static class Runtime
{
    public const string Upstream = "7fc129f889477b598666b5f95a321a278bb00cc4";
    public static ConverterCatalog Catalog() => new(EngineRegistry.CreateAll(new EngineEnvironment(Path.Combine(Path.GetTempPath(),"filee-web-engine-data"))));
    public static JobQueue Queue(ConverterCatalog c) => new(c,EngineRegistry.FindPdfMerger(c.All),combiner:EngineRegistry.FindFileCombiner(c.All),tiffMerger:EngineRegistry.FindTiffMerger(c.All),mediaJoiner:EngineRegistry.FindMediaJoiner(c.All));
    public static async Task<string> ReadBounded(StreamReader reader)
    {
        var buffer = new char[4096]; var text = new StringBuilder(); int count;
        while ((count = await reader.ReadAsync(buffer)) > 0) if (text.Length < 512000) text.Append(buffer,0,Math.Min(count,512000-text.Length));
        return text.ToString();
    }
}
