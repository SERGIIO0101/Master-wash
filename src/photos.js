const DB = "motos-fotos";
const ST = "fotos";

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putPhoto(id, blob) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, "readwrite");
    t.objectStore(ST).put(blob, id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export async function getPhoto(id) {
  const db = await open();
  return new Promise((res, rej) => {
    const q = db.transaction(ST, "readonly").objectStore(ST).get(id);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  });
}

export async function delPhoto(id) {
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const t = db.transaction(ST, "readwrite");
      t.objectStore(ST).delete(id);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } catch (e) {}
}

export function compress(file, max = 1280, quality = 0.7) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new Error("compress"))), "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("img"));
    };
    img.src = url;
  });
}
