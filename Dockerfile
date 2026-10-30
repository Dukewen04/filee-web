FROM node:22-bookworm-slim AS frontend
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY index.html ./
COPY public ./public
COPY src ./src
ENV VITE_FILEE_SERVER=1
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src
COPY vendor/filee ./vendor/filee
COPY server ./server
COPY --from=frontend /src/docs ./docs
RUN dotnet publish server/Filee.Web.csproj -c Release -o /out --nologo
RUN FILEE_ENGINE_DEST=/out/engines dotnet /out/Filee.Web.dll --install-engines rhwp 7zip pandoc ffmpeg calibre

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core fonts-noto-cjk fonts-liberation libreoffice default-jre-headless ffmpeg ghostscript pandoc calibre tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim tesseract-ocr-chi-tra tesseract-ocr-jpn tesseract-ocr-kor && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out ./
COPY LICENSE THIRD_PARTY_NOTICES.md ./licenses/
COPY vendor/filee/LICENSE ./licenses/Filee-LICENSE
COPY vendor/filee/THIRD-PARTY-NOTICES.md ./licenses/Filee-THIRD-PARTY-NOTICES.md
ENV ASPNETCORE_URLS=http://0.0.0.0:7860 QT_QPA_PLATFORM=offscreen HOME=/tmp/filee-home FILEE_DATA_DIR=/tmp/filee-data
USER 10001
EXPOSE 7860
CMD ["dotnet","Filee.Web.dll"]
