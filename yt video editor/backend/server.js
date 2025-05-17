const express = require("express");
const cors = require("cors");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

// Define yt-dlp path relative to current directory
const ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp');

const app = express();

// Create bin directory if it doesn't exist
try {
	if (!fs.existsSync(path.join(__dirname, 'bin'))) {
		fs.mkdirSync(path.join(__dirname, 'bin'));
	}
} catch (error) {
	console.error('Error creating bin directory:', error);
}

// Download yt-dlp if it doesn't exist
if (!fs.existsSync(ytDlpPath)) {
	console.log('Downloading yt-dlp...');
	try {
		const https = require('https');
		const file = fs.createWriteStream(ytDlpPath);
		https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', response => {
			response.pipe(file);
			file.on('finish', () => {
				file.close();
				fs.chmodSync(ytDlpPath, '755');
				console.log('yt-dlp downloaded and made executable');
			});
		}).on('error', err => {
			console.error('Error downloading yt-dlp:', err);
			fs.unlinkSync(ytDlpPath);
		});
	} catch (error) {
		console.error('Error setting up yt-dlp:', error);
	}
}

// Verify yt-dlp installation on startup
try {
	fs.accessSync(ytDlpPath, fs.constants.X_OK);
	console.log('yt-dlp is accessible at:', ytDlpPath);
	// Verify it works
	exec(`"${ytDlpPath}" --version`, (error, stdout, stderr) => {
		if (error) {
			console.error('Error running yt-dlp:', error);
		} else {
			console.log('yt-dlp version:', stdout.trim());
		}
	});
} catch (error) {
	console.error('Error accessing yt-dlp:', error);
}

// CORS fix for preflight
app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept"
	);
	if (req.method === "OPTIONS") {
		return res.sendStatus(200);
	}
	next();
});

app.use(cors());
app.use(express.json());
ffmpeg.setFfmpegPath(ffmpegPath);

// Helper to parse time
function parseTime(time) {
	if (typeof time === "number") return time;
	if (typeof time === "string") {
		const parts = time.split(":").map(Number);
		if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
		if (parts.length === 2) return parts[0] * 60 + parts[1];
		if (!isNaN(parts[0])) return parts[0];
	}
	return 0;
}

app.post("/trim", async (req, res) => {
	let tmpDir;
	try {
		console.log("Trim request received:", req.body);
		
		const { url, start, end } = req.body;
		if (!url || start == null || end == null) {
			console.log("Missing parameters:", { url, start, end });
			return res.status(400).json({ error: "Missing url, start, or end" });
		}

		const startSec = parseTime(start);
		const endSec = parseTime(end);
		console.log("Parsed times:", { startSec, endSec });

		if (endSec <= startSec) {
			console.log("Invalid time range:", { startSec, endSec });
			return res
				.status(400)
				.json({ error: "End time must be greater than start time" });
		}

		console.log("Creating temp directory...");
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-clip-"));
		console.log("Temp directory created:", tmpDir);
		
		const videoPath = path.join(tmpDir, "video.mp4");
		const outputPath = path.join(tmpDir, "output.mp4");

		console.log("Downloading video using yt-dlp at:", ytDlpPath);

		// Download video with yt-dlp
		await new Promise((resolve, reject) => {
			const ytdlp = spawn(
				ytDlpPath,
				[
					'--format', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio',
					'--merge-output-format', 'mp4',
					'--ffmpeg-location', ffmpegPath,
					'--output', videoPath,
					url
				],
				{ 
					cwd: tmpDir,
					shell: false // Disable shell to avoid escaping issues
				}
			);

			ytdlp.stderr.on("data", (data) => {
				const message = data.toString();
				console.error(`yt-dlp stderr: ${message}`);
			});

			ytdlp.stdout.on("data", (data) => {
				const message = data.toString();
				console.log(`yt-dlp stdout: ${message}`);
			});

			ytdlp.on("error", (err) => {
				console.error("yt-dlp process error:", err);
				reject(err);
			});

			ytdlp.on("close", (code) => {
				console.log("yt-dlp process exited with code:", code);
				if (code === 0) {
					if (!fs.existsSync(videoPath)) {
						const error = new Error("Video file not found after download");
						console.error(error.message);
						reject(error);
					} else {
						console.log("Video downloaded successfully to:", videoPath);
						resolve();
					}
				} else {
					const error = new Error(`yt-dlp exited with code ${code}`);
					console.error(error.message);
					reject(error);
				}
			});
		});

		console.log("Starting to trim the video...");

		// Trim with ffmpeg
		await new Promise((resolve, reject) => {
			ffmpeg(videoPath)
				.seekInput(startSec)
				.duration(endSec - startSec)
				.videoCodec("libx264")
				.audioCodec("aac")
				.audioBitrate("192k")
				.outputOptions("-movflags", "+faststart")
				.outputOptions("-loglevel", "debug") // Enable verbose FFmpeg logging
				.on("end", () => {
					console.log("Trimming completed successfully.");
					resolve();
				})
				.on("stderr", (data) => {
					const stderrData = data.toString();
					// FFmpeg prints progress as "time=" in stderr
					if (stderrData.includes("time=")) {
						const match = stderrData.match(/time=(\d+:\d+:\d+.\d+)/);
						if (match) {
							console.log(`FFmpeg stderr progress: ${match[1]}`); // Log the time from stderr
						}
					}
				})
				.on("error", (err) => {
					console.error("ffmpeg error:", err);
					reject(err);
				})
				.save(outputPath);
		});

		console.log("Streaming the trimmed video...");
		// Stream back result
		res.setHeader("Content-Type", "video/mp4");
		res.setHeader("Content-Disposition", 'attachment; filename="trimmed.mp4"');
		const readStream = fs.createReadStream(outputPath);
		readStream.pipe(res);
		readStream.on("close", () => {
			console.log("Streaming finished, cleaning up...");
			// Clean up
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
	} catch (err) {
		// Clean up on error
		if (tmpDir) {
			try {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			} catch (cleanupErr) {
				console.error("Cleanup failed:", cleanupErr);
			}
		}
		console.error("Error processing /trim:", err);
		res.status(500).json({ error: err.message || "Unknown server error" });
	}
});

app.post("/merge", async (req, res) => {
	let tmpDir;
	try {
		const { url1, url2 } = req.body;
		if (!url1 || !url2) {
			return res.status(400).json({ error: "Missing url1 or url2" });
		}

		console.log(`Starting merge of:\n 1. ${url1}\n 2. ${url2}`);

		// Create temp directory
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-merge-"));
		const videoPath1 = path.join(tmpDir, "video1.mp4");
		const videoPath2 = path.join(tmpDir, "video2.mp4");
		const mergedPath = path.join(tmpDir, "merged.mp4");

		// Function to download a video
		const downloadVideo = (url, filename) => {
			return new Promise((resolve, reject) => {
				const outputPath = path.join(tmpDir, filename); // 👈 join properly
				const ytdlp = spawn(
					"yt-dlp",
					[
						"-f",
						"bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio",
						"--merge-output-format",
						"mp4",
						"--ffmpeg-location",
						ffmpegPath,
						"-o",
						outputPath, // 👈 proper absolute path
						url,
					],
					{ cwd: tmpDir }
				);

				ytdlp.stderr.on("data", (data) => {
					console.error(`yt-dlp stderr: ${data.toString()}`);
				});
				ytdlp.stdout.on("data", (data) => {
					console.log(`yt-dlp stdout: ${data.toString()}`);
				});
				ytdlp.on("error", (err) => {
					console.error("yt-dlp failed to start:", err);
					reject(err);
				});
				ytdlp.on("close", (code) => {
					if (code === 0) {
						if (!fs.existsSync(outputPath)) {
							reject(new Error(`Downloaded file not found: ${outputPath}`));
						} else {
							console.log(`Downloaded: ${outputPath}`);
							resolve();
						}
					} else {
						reject(new Error(`yt-dlp exited with code ${code}`));
					}
				});
			});
		};

		// Download both videos
		await Promise.all([
			downloadVideo(url1, "video1.mp4"),
			downloadVideo(url2, "video2.mp4"),
		]);
		console.log("Both videos downloaded. Starting merge...");

		// Merge using ffmpeg
		await new Promise((resolve, reject) => {
			const concatListPath = path.join(tmpDir, "concat.txt");

			// Create ffmpeg concat list file
			fs.writeFileSync(
				concatListPath,
				`file '${videoPath1}'\nfile '${videoPath2}'\n`
			);

			const ffmpegMerge = spawn(ffmpegPath, [
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				concatListPath,
				"-c",
				"copy",
				mergedPath,
			]);

			ffmpegMerge.stderr.on("data", (data) => {
				console.error(`ffmpeg stderr: ${data.toString()}`);
			});

			ffmpegMerge.stdout.on("data", (data) => {
				console.log(`ffmpeg stdout: ${data.toString()}`);
			});

			ffmpegMerge.on("error", (err) => {
				console.error("ffmpeg failed to start:", err);
				reject(err);
			});

			ffmpegMerge.on("close", (code) => {
				if (code === 0) {
					console.log("Merge completed.");
					resolve();
				} else {
					reject(new Error(`ffmpeg exited with code ${code}`));
				}
			});
		});

		console.log("Streaming merged file back...");
		// Stream back result
		res.setHeader("Content-Type", "video/mp4");
		res.setHeader("Content-Disposition", 'attachment; filename="merged.mp4"');
		const readStream = fs.createReadStream(mergedPath);
		readStream.pipe(res);
		readStream.on("close", () => {
			console.log("Streaming finished. Cleaning up...");
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
	} catch (err) {
		if (tmpDir) {
			try {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			} catch (cleanupErr) {
				console.error("Cleanup failed:", cleanupErr);
			}
		}
		console.error("Error processing /merge:", err);
		res.status(500).json({ error: err.message || "Unknown server error" });
	}
});

app.post("/extract-audio", async (req, res) => {
	let tmpDir;
	try {
		const { url } = req.body;
		if (!url) {
			return res.status(400).json({ error: "Missing url" });
		}

		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-audio-"));
		const videoPath = path.join(tmpDir, "video.mp4");
		const audioPath = path.join(tmpDir, "audio.mp3");

		// Download video
		await new Promise((resolve, reject) => {
			const ytdlp = spawn(
				"yt-dlp",
				[
					"-f",
					"bestaudio[ext=m4a]/bestaudio",
					"--merge-output-format",
					"mp4",
					"--ffmpeg-location",
					ffmpegPath,
					"-o",
					videoPath,
					url,
				],
				{ cwd: tmpDir }
			);

			ytdlp.stderr.on("data", (data) =>
				console.error(`yt-dlp stderr: ${data.toString()}`)
			);
			ytdlp.on("close", (code) =>
				code === 0
					? resolve()
					: reject(new Error(`yt-dlp exited with code ${code}`))
			);
		});

		// Extract audio
		await new Promise((resolve, reject) => {
			ffmpeg(videoPath)
				.noVideo()
				.audioCodec("libmp3lame")
				.audioBitrate("192k")
				.output(audioPath)
				.on("end", resolve)
				.on("error", reject)
				.run();
		});

		// Stream back
		res.setHeader("Content-Type", "audio/mpeg");
		res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');
		const readStream = fs.createReadStream(audioPath);
		readStream.pipe(res);
		readStream.on("close", () =>
			fs.rmSync(tmpDir, { recursive: true, force: true })
		);
	} catch (err) {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
		console.error("Error processing /extract-audio:", err);
		res.status(500).json({ error: err.message || "Unknown error" });
	}
});

app.post("/speed", async (req, res) => {
	let tmpDir;
	try {
		const { url, speed = 1.0 } = req.body;
		if (!url || typeof speed !== "number" || speed <= 0) {
			return res.status(400).json({ error: "Missing or invalid url/speed" });
		}

		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-speed-"));
		const videoPath = path.join(tmpDir, "video.mp4");
		const outputPath = path.join(tmpDir, "output.mp4");

		// Download video
		await new Promise((resolve, reject) => {
			const ytdlp = spawn(
				"yt-dlp",
				[
					"-f",
					"bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio",
					"--merge-output-format",
					"mp4",
					"--ffmpeg-location",
					ffmpegPath,
					"-o",
					videoPath,
					url,
				],
				{ cwd: tmpDir }
			);

			ytdlp.stderr.on("data", (data) =>
				console.error(`yt-dlp stderr: ${data.toString()}`)
			);
			ytdlp.on("close", (code) =>
				code === 0
					? resolve()
					: reject(new Error(`yt-dlp exited with code ${code}`))
			);
		});

		// Adjust speed
		await new Promise((resolve, reject) => {
			let atempoFilters = [];
			let tempo = speed;
			// ffmpeg only supports atempo between 0.5 and 2.0, chain if needed
			while (tempo > 2.0) {
				atempoFilters.push("atempo=2.0");
				tempo /= 2;
			}
			while (tempo < 0.5) {
				atempoFilters.push("atempo=0.5");
				tempo *= 2;
			}
			atempoFilters.push(`atempo=${tempo}`);

			const audioFilter = atempoFilters.join(",");

			ffmpeg(videoPath)
				.videoFilters(`setpts=${1 / speed}*PTS`)
				.audioFilters(audioFilter)
				.output(outputPath)
				.on("end", resolve)
				.on("error", reject)
				.run();
		});

		// Stream back
		res.setHeader("Content-Type", "video/mp4");
		res.setHeader("Content-Disposition", 'attachment; filename="speed.mp4"');
		const readStream = fs.createReadStream(outputPath);
		readStream.pipe(res);
		readStream.on("close", () =>
			fs.rmSync(tmpDir, { recursive: true, force: true })
		);
	} catch (err) {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
		console.error("Error processing /speed:", err);
		res.status(500).json({ error: err.message || "Unknown error" });
	}
});

app.post("/add-music", async (req, res) => {
	let tmpDir;
	try {
		const { url, musicUrl } = req.body;
		if (!url || !musicUrl) {
			return res.status(400).json({ error: "Missing url or musicUrl" });
		}

		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-music-"));
		const videoPath = path.join(tmpDir, "video.mp4");
		const musicPath = path.join(tmpDir, "music.mp3");
		const outputPath = path.join(tmpDir, "output.mp4");

		// Download video
		const download = (url, output) =>
			new Promise((resolve, reject) => {
				const ytdlp = spawn(
					"yt-dlp",
					[
						"-f",
						"bestaudio[ext=m4a]/bestaudio",
						"--merge-output-format",
						"mp4",
						"--ffmpeg-location",
						ffmpegPath,
						"-o",
						output,
						url,
					],
					{ cwd: tmpDir }
				);
				ytdlp.stderr.on("data", (data) =>
					console.error(`yt-dlp stderr: ${data.toString()}`)
				);
				ytdlp.on("close", (code) =>
					code === 0
						? resolve()
						: reject(new Error(`yt-dlp exited with code ${code}`))
				);
			});

		await download(url, videoPath);
		await download(musicUrl, musicPath);

		// Mix music
		await new Promise((resolve, reject) => {
			ffmpeg()
				.addInput(videoPath)
				.addInput(musicPath)
				.complexFilter([
					"[1:a]volume=0.3[a1]", // background music lower
					"[0:a][a1]amix=inputs=2:duration=shortest[aout]",
				])
				.map("0:v")
				.map("[aout]")
				.outputOptions("-c:v", "copy")
				.output(outputPath)
				.on("end", resolve)
				.on("error", reject)
				.run();
		});

		// Stream back
		res.setHeader("Content-Type", "video/mp4");
		res.setHeader("Content-Disposition", 'attachment; filename="music.mp4"');
		const readStream = fs.createReadStream(outputPath);
		readStream.pipe(res);
		readStream.on("close", () =>
			fs.rmSync(tmpDir, { recursive: true, force: true })
		);
	} catch (err) {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
		console.error("Error processing /add-music:", err);
		res.status(500).json({ error: err.message || "Unknown error" });
	}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
