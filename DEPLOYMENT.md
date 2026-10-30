# 原版 Filee 引擎服务

此分支把 `KnifeLemon/Filee` 作为 Git submodule 引入，固定到 `7fc129f889477b598666b5f95a321a278bb00cc4`。Web 适配层直接调用原版 `FormatRegistry`、`EngineRegistry`、`RoutePlanner` 和 `JobQueue`，没有另写 PDF 排版转换算法。

## 公开网站的组成

- GitHub：保存源代码、前端和部署文件。
- 转换后端：运行 .NET 10 与原版引擎，接收文件并返回结果 ZIP。
- 部署完整 Docker 服务时，前端由同一个服务提供，访客无需填写接口地址、安装 Filee 或持有 API 密钥。
- GitHub Pages 可以保留为独立前端。部署后，以 `VITE_FILEE_API=https://实际转换服务域名 npm run build` 重新构建它，让页面自动连接后端。

GitHub Pages 本身不运行该后端。当前还没有连接用户的容器托管平台账号，因此完整版尚未公开部署。

## 构建和运行

```sh
git clone --recurse-submodules https://github.com/Dukewen04/filee-web.git
cd filee-web
git checkout codex/full-engine
git submodule update --init --recursive
docker compose up --build
```

本机容器页面：`http://127.0.0.1:7860/`。Compose 默认只绑定本机；公开部署应放到有 HTTPS 的容器平台或受控反向代理后面，将 `FILEE_ORIGINS` 设置为实际前端 origin。

构建需要联网获取 npm/NuGet、系统软件和上游锁定的便携引擎，首次镜像较大。Docker 配置使用 Linux x64，与上游原生库匹配。不要把本机文件目录、宿主机 Docker socket、凭证目录或其他业务数据挂载进公开转换容器。

镜像安装 LibreOffice、Java、FFmpeg、Ghostscript、Pandoc、Calibre、Tesseract、中日韩 OCR 语言包和字体，并下载上游固定版本、校验 SHA-256 的 rhwp / 7-Zip / Pandoc / FFmpeg / Calibre。OCR 还会使用原版 Filee 校验过的语言模型缓存。

## 实际能力，而不是虚标格式数

上游此版本注册 271 个格式、33 个引擎。页面读取服务的实时引擎状态，并只为文件提供已安装引擎可执行的路线。源格式、目标格式或所需引擎不适用时，服务拒绝请求。

原版能力有操作系统差异：Windows Imaging Component 的 JPEG XR 与 Windows 版 Whisper 不会因为放进 Linux 容器就可用；Apple Vision 仅适用于 macOS，Linux 使用 Tesseract OCR。要覆盖 Windows 专属转换，需要在 Windows 环境部署同一 .NET 服务并配置对应引擎。271 是注册格式数，不代表任何平台上的每个格式都可写，也不代表任意两个格式可以互转。

PDF→DOCX 的质量遵循原版 Filee：支持文字、图片、带线表格和部分布局；无框表格、矢量绘图、表单、复杂字体等仍存在原版记录的限制。没有承诺任意 PDF 都能无损还原。输入和输出字体、复杂排版应用真实文件验收。

配套文件（Shapefile 的 DBF/SHX/PRJ、OBJ 的 MTL/纹理等）与主文件一起选择，配套项在输出下拉框中选「配套文件」，服务会将它们放在主文件旁供原版引擎读取。

## 服务配置

| 环境变量 | 用途 |
| --- | --- |
| `ASPNETCORE_URLS` | 本机默认 `http://127.0.0.1:8080`，容器 `http://0.0.0.0:7860` |
| `FILEE_PUBLIC=1` | 匿名公开转换；仅在隔离容器、资源限额与 HTTPS 配置就绪后使用 |
| `FILEE_API_TOKEN` | 私有服务访问令牌。未设置时启动时生成；不要放入公开前端或 URL |
| `FILEE_ORIGINS` | 逗号分隔的精确前端 origin 白名单，默认包括本项目 GitHub Pages 和本机地址 |
| `FILEE_DATA_DIR` | 原版引擎模型等缓存目录，容器放在临时盘 |

服务限制：每次最多 30 个文件，每文件 50 MB，总计 150 MB；单个转换进程最多十分钟；每 IP 每分钟 30 个转换请求，全服务同时执行一个请求；结果最多 2000 个文件、200 MB。原版转换在独立子进程执行，断开连接/超时会终止进程树。请求结束后清理临时输入输出。容器以非 root 运行，Compose 限制 CPU、内存、进程数和临时盘。

这些是小规模部署的基本限制，不是无限并发服务。公开流量应由托管平台提供入口限流、资源配额和监控；按真实负载调整资源。不要把本机裸进程直接暴露到公网。

## 本机开发与测试

```sh
npm ci
npm run build
dotnet build server/Filee.Web.csproj
dotnet server/bin/Debug/net10.0/Filee.Web.dll --install-engines rhwp 7zip
FILEE_API_TOKEN=your-local-token dotnet run --project server/Filee.Web.csproj --no-build
# 另一个终端：
FILEE_TEST_TOKEN=your-local-token npm run test:engine
```

纯前端测试：`npm test`。引擎集成测试调用真实服务，检查 PDF→Word 的可编辑正文、表格、嵌入图片、Word→PDF、扫描件 OCR、CSV→XLSX、字幕和数据转换，以及鉴权、路径校验和 CORS。测试要求当前平台安装适用引擎。

本机没有 Docker，因此 Docker 镜像尚未实构和验证；.NET 服务、网页连接与上述实际转换在 macOS 上验证。公开发布必须在目标容器/Windows 主机完成部署验证。
