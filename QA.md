# 验证记录

日期：2026-10-30

已完成：

- `npm test`：5 项通过。覆盖中文和多行 CSV、引号转义、错误数据、防公式注入、JSON/YAML 解析、PDF 页码边界和 ZIP 同名处理。
- `npm run build`：成功，生产资源写入 docs，使用相对路径。
- `npm audit --omit=dev`：0 个已知漏洞。
- 浏览器选择多个真实样本并批量转换：CSV→JSON、SVG→PNG、双页 PDF→PNG ZIP、DOCX→TXT。下载合并 ZIP 后检查 JSON 中文字段、PNG 文件签名、PDF 图片页数和 DOCX 提取文本，全部符合预期。
- PDF 合并：两份双页 PDF 均选择第 1 页，合并结果为 2 页，下载后用 pdf-lib 验证。
- SVG→JPG：最大宽度 100，下载产物检查为 100×50 像素。
- 损坏 JSON：单独显示解析错误，同批图片与 PDF 仍成功完成。
- 任意文件 ZIP 打包：PDF 与 CSV 在 ZIP 模式处理完成。
- 生产构建通过静态服务器的 `/filee-web/docs/` 子路径运行，PDF 转图片成功，确认动态模块与 PDF worker 路径可用。
- 预览中窄屏布局、分类、设置面板、批量队列和下载按钮正常。

限制：当前浏览器预览实际可用宽度约 689px；宽桌面与真实手机尚未独立实测。尚未验证 Safari/Firefox、AVIF/GIF 动画样本、加密 PDF、复杂中文字体 PDF 和极限文件大小。尚未验证线上 GitHub Pages，因为仓库创建与 Pages 设置需要可用的用户权限入口。

## 原版引擎 Web 服务升级

- 直接接入上游固定版本的 271 格式注册表和 33 引擎，未另写替代转换算法。
- .NET 10 服务编译成功；macOS 上的适用引擎运行状态已读取。
- 下载的 PDF→DOCX 产物经解包验证含可编辑正文、原生 Word 表格、嵌入图片；DOCX→PDF、CSV→XLSX、SRT→VTT、JSON→YAML 均通过真实请求。
- 图像型扫描 PDF 经 OCR 后生成可编辑 DOCX，结果包含原扫描件中的句子。
- 网页端连接、真实格式下拉列表、PDF→DOCX、结果 ZIP 下载通过；页面在服务端模式切换为明确的文件上传提示。
- 上述验证是 macOS 本机验证，不代表全部格式穷尽测试。Linux x64 Docker 镜像及同一组转换已在 GitHub Actions 隔离容器中构建、执行通过；完整版云部署仍缺托管环境和账号。
