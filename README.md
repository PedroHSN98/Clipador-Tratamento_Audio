# 🎬 Video Clipper Studio

Clipador profissional de vídeos que roda **100% no navegador**. Envie um vídeo
longo, defina múltiplos cortes simultâneos, converta o formato (aspect ratio) de
cada clipe e baixe individualmente ou em lote (ZIP) — sem enviar nada para
servidor algum. O processamento é feito com **FFmpeg compilado para WebAssembly**.

O app tem **dois módulos**, acessíveis pela navegação no topo:

- **🎬 Clipador de Vídeo** (`/`) — corta e converte vídeos em múltiplos formatos.
- **🎧 Tratador de Áudio** (`/audio`) — remove ruído de fundo, corrige áudio estourado e nivela o volume.

## ✨ Funcionalidades

### Clipador de Vídeo

- **Upload com Drag & Drop** (MP4, WebM, MOV, MKV...).
- **Player customizado** com timeline interativa e marcadores dos clipes.
- **Multi-corte independente e simultâneo** — cada clipe tem nome, início/fim e formato próprios.
- **Botões "definir início/fim no ponto atual"** sincronizados com o player.
- **Slider de intervalo duplo** para ajuste fino arrastável.
- **Formatos de saída**: 9:16 (1080×1920), 1:1 (1080×1080), 16:9 (1920×1080), 4:5 (1080×1350).
- **Modos de enquadramento**: Crop (preencher), Fundo desfocado (blur), Barras pretas (fit).
- **Preview com máscara** do aspecto escolhido sobre o vídeo original.
- **Barra de progresso** de renderização por clipe + estados de loading/erro.
- **Download individual (.mp4)** e **em lote (.zip)**.
- Cortes de **vários minutos** (5+): o vídeo de origem é lido via **WORKERFS**
  (sem copiar tudo para a memória) e trechos longos usam preset `ultrafast`.

### Tratador de Áudio

- **Reduzir ruído de fundo** (`afftdn`/`anlmdn`), com intensidade leve/médio/forte.
- **Corrigir áudio estourado** — repara clipping/distorção (`adeclip` + compressor + limitador).
- **Nivelar volume** por loudness EBU R128 (`loudnorm`), com alvos Alto/Padrão/Suave — sobe áudio baixo e controla o alto.
- Aceita **áudio ou vídeo** na entrada; exporta **MP3, WAV ou M4A**.
- Player para comparar **original × tratado** antes de baixar.

## 🧱 Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** + **Lucide Icons**
- **@ffmpeg/ffmpeg** (FFmpeg.wasm) + **@ffmpeg/util**
- **JSZip** para o download em lote

## 🚀 Como rodar

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>.

> **Importante:** o FFmpeg.wasm precisa de `SharedArrayBuffer`, que exige os
> cabeçalhos `Cross-Origin-Opener-Policy: same-origin` e
> `Cross-Origin-Embedder-Policy: require-corp`. Eles já estão configurados em
> [`next.config.mjs`](./next.config.mjs) e valem para dev e produção
> (`npm run build && npm start`).

## 🎛️ Pipeline FFmpeg

Os filtros aplicados (equivalentes de linha de comando) estão em
[`lib/ffmpeg-command.ts`](./lib/ffmpeg-command.ts):

| Modo | Filtro |
|------|--------|
| **Crop** | `scale=W:H:force_original_aspect_ratio=increase,crop=W:H` |
| **Fit** (barras) | `scale=W:H:decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2` |
| **Blur** | `[0:v]scale=W:H:increase,crop=W:H,boxblur=20:5[bg];[0:v]scale=W:H:decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2` |

O corte usa `-ss <início> -to <fim>` e re-encoda em H.264/AAC com `+faststart`.

## 📁 Estrutura

```
app/            layout, página principal e estilos globais
components/      Uploader, PreviewPanel, ClipCard, DualRangeSlider
lib/            tipos, presets, utilitários de tempo, motor e comandos FFmpeg
```
