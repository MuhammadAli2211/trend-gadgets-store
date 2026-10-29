const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

/*
|--------------------------------------------------------------------------
| Download Image
|--------------------------------------------------------------------------
*/

const downloadImage = async (url, outputPath) => {
  const response = await axios.get(url, {
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
    width="1080"
    height="1920"
    xmlns="http://www.w3.org/2000/svg"
  >

    <!-- Top Product Box -->

    <rect
      x="55"
      y="100"
      width="970"
      height="250"
      rx="35"
      fill="black"
      fill-opacity="0.72"
    />

    <text
      x="540"
      y="200"
      text-anchor="middle"
      font-family="Arial"
      font-size="58"
      font-weight="bold"
      fill="white"
    >
      ${safeName}
    </text>

    <text
      x="540"
      y="290"
      text-anchor="middle"
      font-family="Arial"
      font-size="52"
      font-weight="bold"
      fill="white"
    >
      Rs. ${safePrice}
    </text>

    <!-- Bottom CTA -->

    <rect
      x="140"
      y="1640"
      width="800"
      height="140"
      rx="70"
      fill="black"
      fill-opacity="0.78"
    />

    <text
      x="540"
      y="1730"
      text-anchor="middle"
      font-family="Arial"
      font-size="48"
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
            w: 1080,
            h: 1920,
            force_original_aspect_ratio:
              "decrease",
          },
          inputs: "[0:v]",
          outputs: "scaled",
        },

        {
          filter: "pad",
          options: {
            w: 1080,
            h: 1920,
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
            d: 90,
            s: "1080x1920",
            fps: 30,
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
        "-t 3",
        "-r 30",
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-an",
        "-movflags +faststart",
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
      { filter: "scale", options: { w: 1080, h: 1920, force_original_aspect_ratio: "increase" }, inputs: "0:v", outputs: "scaled" },
      { filter: "crop", options: { w: 1080, h: 1920, x: "(iw-ow)/2", y: "(ih-oh)/2" }, inputs: "scaled", outputs: "portrait" },
      { filter: "overlay", options: { x: 0, y: 0 }, inputs: ["portrait", "1:v"], outputs: "final" },
    ])
    .outputOptions(["-map [final]", "-t 3", "-r 30", "-c:v libx264", "-pix_fmt yuv420p", "-an", "-movflags +faststart"])
    .output(outputPath)
    .on("end", resolve)
    .on("error", reject)
    .run();
});

/*
|--------------------------------------------------------------------------
| Create Automatic Background Music
|--------------------------------------------------------------------------
|
| FREE LOCAL MUSIC
|
| No GPU
| No API
| No paid service
| No copyrighted music file
|
| Creates a simple multi-layer promotional beat:
|
| Bass + Melody + High Tone
|
|--------------------------------------------------------------------------
*/

const createBackgroundAudio = (
  outputPath,
  duration
) => {
  // Build a small PCM WAV locally so this works with ffmpeg-static builds
  // that do not include the optional lavfi input device.
  const sampleRate = 44100;
  const channels = 2;
  const sampleCount = Math.ceil(sampleRate * duration);
  const dataSize = sampleCount * channels * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  for (let frame = 0; frame < sampleCount; frame += 1) {
    const time = frame / sampleRate;
    const fadeIn = Math.min(1, time);
    const fadeOut = Math.min(1, Math.max(0, duration - time));
    const envelope = Math.min(fadeIn, fadeOut, 1) * 0.22;
    const sample = Math.round(
      envelope * (
        Math.sin(2 * Math.PI * 110 * time) * 0.55 +
        Math.sin(2 * Math.PI * 440 * time) * 0.3 +
        Math.sin(2 * Math.PI * 660 * time) * 0.15
      ) * 32767
    );
    const offset = 44 + frame * channels * 2;
    wav.writeInt16LE(sample, offset);
    wav.writeInt16LE(sample, offset + 2);
  }
  fs.writeFileSync(outputPath, wav);
  return Promise.resolve();
};

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
      .outputOptions([
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
};

/*
|--------------------------------------------------------------------------
| Add Background Music To Video
|--------------------------------------------------------------------------
*/

const addAudioToVideo = (
  videoPath,
  audioPath,
  outputPath
) => {
  return new Promise((resolve, reject) => {
    console.log(
      "Adding music to final Reel..."
    );

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-map 0:v:0",
        "-map 1:a:0",

        // Keep video quality
        "-c:v copy",

        // Encode audio
        "-c:a aac",
        "-b:a 128k",
        "-ar 44100",
        "-ac 2",

        // End when video ends
        "-shortest",

        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        console.log(
          "Music successfully added to Reel."
        );

        resolve();
      })
      .on("error", (error) => {
        console.error(
          "Add music error:",
          error
        );

        reject(error);
      })
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

  const imageFiles = [];
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
      const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
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

      imageFiles.push(imagePath);
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

    const silentVideoPath =
      path.join(
        tempDir,
        "silent-video.mp4"
      );

    await combineClips(
      clipFiles,
      silentVideoPath
    );

    /*
    |--------------------------------------------------------------------------
    | Calculate Duration
    |--------------------------------------------------------------------------
    */

    const duration =
      clipFiles.length * 3;

    /*
    |--------------------------------------------------------------------------
    | Generate Automatic Music
    |--------------------------------------------------------------------------
    */

    const audioPath = path.join(
      tempDir,
      "background-music.wav"
    );

    await createBackgroundAudio(
      audioPath,
      duration
    );

    /*
    |--------------------------------------------------------------------------
    | Final Reel
    |--------------------------------------------------------------------------
    */

    const finalReelPath =
      path.join(
        tempDir,
        "final-reel.mp4"
      );

    await addAudioToVideo(
      silentVideoPath,
      audioPath,
      finalReelPath
    );

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

    console.log(
      "Music: Automatic"
    );

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
