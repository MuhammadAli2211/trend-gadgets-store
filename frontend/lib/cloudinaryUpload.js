import api from "./api";

const CHUNK_SIZE = 20 * 1024 * 1024;

const uploadChunk = ({ file, start, end, signature, uploadId, onProgress }) => new Promise((resolve, reject) => {
  const body = new FormData();
  body.append("file", file.slice(start, end), file.name);
  body.append("api_key", signature.apiKey);
  body.append("timestamp", String(signature.timestamp));
  body.append("signature", signature.signature);
  body.append("folder", signature.folder);
  body.append("public_id", signature.publicId);
  body.append("overwrite", "false");

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/video/upload`);
  if (uploadId) {
    xhr.setRequestHeader("X-Unique-Upload-Id", uploadId);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${file.size}`);
  }
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress?.(Math.min(100, Math.round(((start + event.loaded) / file.size) * 100)));
  };
  xhr.onerror = () => reject(new Error("Video upload connection failed. Check your internet and try again."));
  xhr.onload = () => {
    let response;
    try {
      response = JSON.parse(xhr.responseText);
    } catch {
      reject(new Error("Cloudinary returned an invalid upload response."));
      return;
    }
    if (xhr.status < 200 || xhr.status >= 300) {
      reject(new Error(response.error?.message || "Cloudinary could not upload this video."));
      return;
    }
    resolve(response);
  };
  xhr.send(body);
});

export const uploadProductVideo = async (file, onProgress) => {
  const { data: signature } = await api.post("/products/upload-signature", { resourceType: "video" });
  if (!signature.success || !signature.cloudName || !signature.apiKey || !signature.signature) {
    throw new Error(signature.message || "Could not prepare the secure video upload.");
  }

  const useChunks = file.size > CHUNK_SIZE;
  const uploadId = useChunks ? crypto.randomUUID() : null;
  let result = null;

  if (!useChunks) {
    result = await uploadChunk({ file, start: 0, end: file.size, signature, onProgress });
  } else {
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, file.size);
      result = await uploadChunk({ file, start, end, signature, uploadId, onProgress });
    }
  }

  const publicId = String(result?.public_id || "");
  const expectedPublicId = String(signature.publicId || "");
  const expectedUploadId = expectedPublicId.split("/").pop();
  const allowedPublicIds = new Set([
    expectedPublicId,
    expectedUploadId,
  ]);
  const validVideoUrl = (() => {
    try {
      const url = new URL(result?.secure_url);
      return url.protocol === "https:" &&
        url.hostname === "res.cloudinary.com" &&
        url.pathname.startsWith(`/${signature.cloudName}/video/upload/`) &&
        decodeURIComponent(url.pathname).includes(`/${publicId}.`);
    } catch {
      return false;
    }
  })();

  if (!validVideoUrl || !allowedPublicIds.has(publicId)) {
    throw new Error("Cloudinary finished uploading but did not return a valid video URL.");
  }
  return { url: result.secure_url, publicId };
};
