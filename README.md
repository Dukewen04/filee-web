# Filee Web

一个中文、纯浏览器本地处理的文件转换工作台，灵感来自 [KnifeLemon/Filee](https://github.com/KnifeLemon/Filee)。这不是官方 Filee 产品。`codex/full-engine` 分支已接入原版 Filee 引擎的 Web 服务层，部署与格式覆盖边界见 [DEPLOYMENT.md](DEPLOYMENT.md)。原版源码以固定版本 Git submodule 保留在 `vendor/filee`。

浏览器内置模式不上传文件；原版引擎模式将文件上传至连接的转换后端，转换结束清理临时文件。没有分析统计，也不加载第三方字体或运行时 CDN 脚本。批量队列、单独选择格式、图片质量/宽度、PDF 页码、合并和结果 ZIP 下载均可使用。

## 浏览器内置模式支持的转换

| 输入 | 输出 | 说明 |
| --- | --- | --- |
| JPG / PNG / WebP / AVIF / GIF / BMP / SVG | PNG / JPG / WebP / PDF | GIF 只取首帧；AVIF 解码取决于浏览器；栅格输出不保留元数据或矢量结构 |
| PDF | PNG / JPG / TXT / PDF | 多页图片自动 ZIP；选择页码；多个 PDF 按添加顺序合并；TXT 仅提取已有文字，不提供 OCR |
| DOCX / HTML / TXT / Markdown | TXT | 提取文字，不保留排版、图片；Markdown 输出保留文本语法 |
| CSV / TSV / JSON / YAML | JSON / YAML / CSV / TSV | 表格第一行是列名；转 CSV/TSV 需要对象数组；表格单元格防公式注入 |
| 任意文件 | ZIP | 同名自动编号，无解压功能 |

限制：单文件 50 MB，每批最多 30 个、共 150 MB。图片处理不超过 4000 万像素。加密/损坏文件会显示错误。复杂 PDF、超大图片、内存不足或浏览器不支持的图片编码可能无法转换。PDF 页码支持 `1, 3-5`，合并时应用于每份 PDF。视频、音频、XLSX、PPTX 和完整 Office 排版转换尚未实现。

转换结果下载到当前页面内存中，刷新/关闭前请保存；原文件不会修改。原版引擎模式的输入输出还会经过转换服务器，页面会明确提示当前处理位置。

## 开发

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
npm test
npm run build
```

生产输出在 `docs/`，相对资源路径兼容 GitHub Pages 的仓库子路径。转换库按需加载，所有资源随构建产物一起托管。

## GitHub Pages

仓库已包含生产构建文件，无需配置任何密钥：

1. 打开仓库 Settings → Pages。
2. Source 选择 **Deploy from a branch**。
3. Branch 选择 **main**，目录 **/docs**，点击 Save。
4. 等待 GitHub Pages 构建完成，通过页面上显示的网址访问。

更新源代码后运行 `npm run build`，一并提交 `src/` 与 `docs/` 即可更新线上版本。

## 验证

`npm test` 覆盖 CSV 转义/多行/中文、防公式注入、JSON/YAML 格式验证、PDF 页码范围以及 ZIP 同名文件处理。浏览器实测记录见 `QA.md`。

## 致谢与许可证

界面与引擎复用 MIT 开源项目 [Filee](https://github.com/KnifeLemon/Filee)，桌面版支持更广泛的格式和系统集成。本项目源码采用 MIT。运行依赖各自遵循其许可证，详见 `THIRD_PARTY_NOTICES.md`。
