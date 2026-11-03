const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const directHttp = axios.create({
  proxy: false,
  timeout: 120_000,
  maxContentLength: 100 * 1024 * 1024,
});
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

// Keep generated Reels fast enough for serverless requests while retaining
// a 720p portrait output suitable for Instagram and Facebook Reels.
const REEL_WIDTH = 720;
const REEL_HEIGHT = 1280;
const REEL_FPS = 30;
const CLIP_SECONDS = 3;
const VIDEO_ENCODING_OPTIONS = [
  "-c:v libx264",
  "-preset veryfast",
  "-crf 23",
  "-threads 2",
  "-pix_fmt yuv420p",
  "-r 30",
  "-an",
  "-movflags +faststart",
];

/*
|--------------------------------------------------------------------------
| Download Image
|--------------------------------------------------------------------------
*/

const downloadImage = async (url, outputPath) => {
  const response = await directHttp.get(url, {
    responseType: "arraybuffer",
  });

  fs.writeFileSync(outputPath, response.data);
};

/*
|--------------------------------------------------------------------------
| Create Text Overlay
|--------------------------------------------------------------------------
*/

const createTextOverlay = async (
  productName,
  price,
  outputPath
) => {
  const safeName = String(productName || "Product")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const safePrice = String(price || "");

  const svg = `
  <svg
    width="${REEL_WIDTH}"
    height="${REEL_HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
  >

    <text
      x="360"
      y="48"
      text-anchor="middle"
      font-family="Arial"
      font-size="24"
      font-weight="bold"
      letter-spacing="3"
      fill="white"
    >
      CART2DOOR
    </text>

    <!-- Top Product Box -->

    <rect
      x="37"
      y="67"
      width="646"
      height="167"
      rx="23"
      fill="black"
      fill-opacity="0.72"
    />

    <text
      x="360"
      y="133"
      text-anchor="middle"
      font-family="Arial"
      font-size="39"
      font-weight="bold"
      fill="white"
    >
      ${safeName}
    </text>

    <text
      x="360"
      y="193"
      text-anchor="middle"
      font-family="Arial"
      font-size="35"
      font-weight="bold"
      fill="white"
    >
      Rs. ${safePrice}
    </text>

    <!-- Bottom CTA -->

    <rect
      x="93"
      y="1093"
      width="534"
      height="93"
      rx="47"
      fill="black"
      fill-opacity="0.78"
    />

    <text
      x="360"
      y="1153"
      text-anchor="middle"
      font-family="Arial"
      font-size="32"
      font-weight="bold"
      fill="white"
    >
      BUY NOW → WHATSAPP
    </text>

  </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
};

/*
|--------------------------------------------------------------------------
| Create Animated Image Clip
|--------------------------------------------------------------------------
*/

const createImageClip = (
  imagePath,
  overlayPath,
  outputPath,
  animationType = "zoom"
) => {
  return new Promise((resolve, reject) => {
    let zoomExpression;

    if (animationType === "zoom-out") {
      zoomExpression =
        "if(lte(on,1),1.35,max(zoom-0.0015,1.0))";
    } else {
      zoomExpression =
        "min(zoom+0.0015,1.35)";
    }

    ffmpeg()
      .input(imagePath)
      .inputOptions([
        "-loop 1",
      ])
      .input(overlayPath)
      .inputOptions([
        "-loop 1",
      ])
      .complexFilter([
        {
          filter: "scale",
          options: {
            w: REEL_WIDTH,
            h: REEL_HEIGHT,
            force_original_aspect_ratio:
              "decrease",
          },
          inputs: "[0:v]",
          outputs: "scaled",
        },

        {
          filter: "pad",
          options: {
            w: REEL_WIDTH,
            h: REEL_HEIGHT,
            x: "(ow-iw)/2",
            y: "(oh-ih)/2",
            color: "black",
          },
          inputs: "[scaled]",
          outputs: "padded",
        },

        {
          filter: "zoompan",
          options: {
            z: zoomExpression,
            x: "(iw-iw/zoom)/2",
            y: "(ih-ih/zoom)/2",
            d: CLIP_SECONDS * REEL_FPS,
            s: `${REEL_WIDTH}x${REEL_HEIGHT}`,
            fps: REEL_FPS,
          },
          inputs: "[padded]",
          outputs: "animated",
        },

        {
          filter: "overlay",
          options: {
            x: 0,
            y: 0,
          },
          inputs: [
            "animated",
            "1:v",
          ],
          outputs: "final",
        },
      ])
      .outputOptions([
        "-map [final]",
        `-t ${CLIP_SECONDS}`,
        ...VIDEO_ENCODING_OPTIONS,
      ])
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
};

const createVideoClip = (videoPath, overlayPath, outputPath) => new Promise((resolve, reject) => {
  ffmpeg()
    .input(videoPath)
    .input(overlayPath)
    .complexFilter([
      { filter: "scale", options: { w: REEL_WIDTH, h: REEL_HEIGHT, force_original_aspect_ratio: "increase" }, inputs: "0:v", outputs: "scaled" },
      { filter: "crop", options: { w: REEL_WIDTH, h: REEL_HEIGHT, x: "(iw-ow)/2", y: "(ih-oh)/2" }, inputs: "scaled", outputs: "portrait" },
      { filter: "overlay", options: { x: 0, y: 0 }, inputs: ["portrait", "1:v"], outputs: "final" },
    ])
    .outputOptions([`-map [final]`, `-t ${CLIP_SECONDS}`, ...VIDEO_ENCODING_OPTIONS])
    .output(outputPath)
    .on("end", resolve)
    .on("error", reject)
    .run();
});

/*
|--------------------------------------------------------------------------
| Combine Video Clips
|--------------------------------------------------------------------------
*/

const combineClips = (
  clipFiles,
  outputPath
) => {
  return new Promise((resolve, reject) => {
    const concatFile = path.join(
      path.dirname(outputPath),
      "concat.txt"
    );

    const concatContent = clipFiles
      .map(
        (file) =>
          `file '${file
            .replace(/\\/g, "/")
            .replace(/'/g, "'\\''")}'`
      )
      .join("\n");

    fs.writeFileSync(
      concatFile,
      concatContent
    );

    ffmpeg()
      .input(concatFile)
      .inputOptions([
        "-f concat",
        "-safe 0",
      ])
      // Every clip is encoded with identical dimensions, frame rate, and
      // codec settings; stream-copying avoids a costly second video encode.
      .outputOptions(["-c copy", "-movflags +faststart"])
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
};

/*
|--------------------------------------------------------------------------
| MAIN REEL GENERATOR
|--------------------------------------------------------------------------
*/

const createReel = async ({
  images,
  videoUrl,
  productName,
  price,
}) => {
  if ((!images || images.length === 0) && !videoUrl) {
    throw new Error(
      "Product has no images."
    );
  }

  const tempDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "ecommerce-reel-"
    )
  );

  const clipFiles = [];

  try {
    /*
    |--------------------------------------------------------------------------
    | Overlay
    |--------------------------------------------------------------------------
    */

    const overlayPath = path.join(
      tempDir,
      "overlay.png"
    );

    await createTextOverlay(
      productName,
      price,
      overlayPath
    );

    if (videoUrl) {
      const sourceVideoPath = path.join(tempDir, "product-video.mp4");
      const videoClipPath = path.join(tempDir, "product-video-clip.mp4");
      const response = await directHttp.get(videoUrl, { responseType: "arraybuffer" });
      fs.writeFileSync(sourceVideoPath, response.data);
      await createVideoClip(sourceVideoPath, overlayPath, videoClipPath);
      clipFiles.push(videoClipPath);
    }

    /*
    |--------------------------------------------------------------------------
    | Download + Animate Images
    |--------------------------------------------------------------------------
    */

    for (
      let i = 0;
      i < (images || []).length;
      i++
    ) {
      const imageUrl =
        typeof images[i] === "string"
          ? images[i]
          : images[i]?.url ||
            images[i]?.secure_url;

      if (!imageUrl) {
        continue;
      }

      const imagePath = path.join(
        tempDir,
        `image-${i}.jpg`
      );

      const clipPath = path.join(
        tempDir,
        `clip-${i}.mp4`
      );

      await downloadImage(
        imageUrl,
        imagePath
      );

      const animation =
        i % 2 === 0
          ? "zoom"
          : "zoom-out";

      await createImageClip(
        imagePath,
        overlayPath,
        clipPath,
        animation
      );

      clipFiles.push(clipPath);
    }

    if (clipFiles.length === 0) {
      throw new Error(
        "Unable to create image clips."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Combine Clips
    |--------------------------------------------------------------------------
    */

    const finalReelPath = path.join(tempDir, "final-reel.mp4");

    await combineClips(
      clipFiles,
      finalReelPath
    );

    /*
    |--------------------------------------------------------------------------
    | Calculate Duration
    |--------------------------------------------------------------------------
    */

    const duration = clipFiles.length * CLIP_SECONDS;

    console.log(
      "===================================="
    );

    console.log(
      "FINAL REEL CREATED SUCCESSFULLY"
    );

    console.log(
      "Product:",
      productName
    );

    console.log(
      "Duration:",
      duration,
      "seconds"
    );

    console.log("Audio: none; add licensed music in the social app if desired.");

    console.log(
      "===================================="
    );

    return {
      outputPath: finalReelPath,
      tempDir,
      duration,
    };

  } catch (error) {

    try {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true,
      });
    } catch {}

    throw error;
  }
};

module.exports = {
  createReel,
};
