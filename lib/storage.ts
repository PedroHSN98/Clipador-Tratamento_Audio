// Persistência do projeto do Clipador via IndexedDB.
//
// Por que IndexedDB (e não localStorage): precisamos guardar o próprio arquivo
// de vídeo (um Blob/File que pode ter centenas de MB) para que, ao recarregar a
// página, o projeto volte inteiro — vídeo + clipes — sem o usuário reenviar
// nada. localStorage só guarda strings pequenas; IndexedDB guarda Blobs.
//
// O que NÃO é persistido: `resultUrl` (blob URLs são revogadas ao descarregar a
// página) e o estado transitório de render (`status`, `progress`). Ao restaurar,
// cada clipe volta como "idle" — o usuário renderiza de novo se quiser.

import type { Clip, SourceVideo } from "./types";

const DB_NAME = "video-clipper-studio";
const DB_VERSION = 1;
const STORE = "project";
const PROJECT_KEY = "current";

/** Metadados do vídeo de origem (sem o objeto File, que vai separado). */
interface SourceMeta {
  fileName: string;
  fileType: string;
  duration: number;
  width: number;
  height: number;
}

/** Apenas os campos duráveis de um clipe (sem estado de render transitório). */
interface StoredClip {
  id: string;
  name: string;
  start: number;
  end: number;
  aspect: Clip["aspect"];
  fill: Clip["fill"];
  cropX: number;
  cropY: number;
  zoom: number;
  framings?: Clip["framings"];
}

interface StoredProject {
  version: 1;
  savedAt: number;
  sourceMeta: SourceMeta;
  file: File;
  clips: StoredClip[];
}

export interface RestoredProject {
  source: SourceVideo;
  clips: Clip[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste navegador."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

function toStoredClip(c: Clip): StoredClip {
  return {
    id: c.id,
    name: c.name,
    start: c.start,
    end: c.end,
    aspect: c.aspect,
    fill: c.fill,
    cropX: c.cropX,
    cropY: c.cropY,
    zoom: c.zoom,
    framings: c.framings,
  };
}

/** Salva o projeto atual (vídeo + clipes). Silencioso em caso de falha. */
export async function saveProject(
  source: SourceVideo,
  clips: Clip[]
): Promise<void> {
  try {
    const project: StoredProject = {
      version: 1,
      savedAt: Date.now(),
      sourceMeta: {
        fileName: source.file.name,
        fileType: source.file.type,
        duration: source.duration,
        width: source.width,
        height: source.height,
      },
      file: source.file,
      clips: clips.map(toStoredClip),
    };
    await tx("readwrite", (s) => s.put(project, PROJECT_KEY));
  } catch {
    /* persistência é best-effort — nunca deve quebrar a UI */
  }
}

/** Carrega o projeto salvo, recriando a URL de objeto do vídeo. */
export async function loadProject(): Promise<RestoredProject | null> {
  try {
    const project = await tx<StoredProject | undefined>("readonly", (s) =>
      s.get(PROJECT_KEY)
    );
    if (!project || !project.file) return null;

    const url = URL.createObjectURL(project.file);
    const source: SourceVideo = {
      file: project.file,
      url,
      duration: project.sourceMeta.duration,
      width: project.sourceMeta.width,
      height: project.sourceMeta.height,
    };
    const clips: Clip[] = project.clips.map((c) => ({
      ...c,
      status: "idle",
      progress: 0,
    }));
    return { source, clips };
  } catch {
    return null;
  }
}

/** True se há um projeto salvo (sem carregar o vídeo inteiro). */
export async function hasSavedProject(): Promise<boolean> {
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (s) =>
      s.getAllKeys()
    );
    return keys.includes(PROJECT_KEY);
  } catch {
    return false;
  }
}

/** Apaga o projeto salvo. */
export async function clearProject(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(PROJECT_KEY));
  } catch {
    /* ignore */
  }
}
