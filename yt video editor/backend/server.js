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

// Helper function to execute yt-dlp commands
const executeYtDlp = async (args, cwd) => {
	return new Promise((resolve, reject) => {
		// On Windows use spawn directly, on Unix-like systems use shell script wrapper
		const isWindows = process.platform === 'win32';
		
		let childProcess;
		if (isWindows) {
			childProcess = spawn(ytDlpPath, args, {
				cwd,
				shell: true,
				env: {
					...process.env,
					PATH: `${path.dirname(ytDlpPath)}${path.delimiter}${process.env.PATH}`
				}
			});
		} else {
			// Create a temporary shell script to handle the command
			const scriptPath = path.join(cwd, 'yt-dlp-wrapper.sh');
			const command = `"${ytDlpPath}" ${args.map(arg => `"${arg}"`).join(' ')}`;
			fs.writeFileSync(scriptPath, `#!/bin/bash\n${command}\n`, { mode: 0o755 });

			childProcess = spawn('/bin/bash', [scriptPath], {
				cwd,
				env: {
					...process.env,
					PATH: `${path.dirname(ytDlpPath)}${path.delimiter}${process.env.PATH}`
				}
			});

			// Clean up the script file after execution
			childProcess.on('exit', () => {
				try {
					fs.unlinkSync(scriptPath);
				} catch (err) {
					console.error('Error cleaning up wrapper script:', err);
				}
			});
		}

		let stdout = '';
		let stderr = '';

		childProcess.stdout.on('data', (data) => {
			stdout += data;
			console.log(`yt-dlp stdout: ${data}`);
		});

		childProcess.stderr.on('data', (data) => {
			stderr += data;
			console.error(`yt-dlp stderr: ${data}`);
		});

		childProcess.on('error', (err) => {
			console.error('Failed to start yt-dlp:', err);
			reject(err);
		});

		childProcess.on('close', (code) => {
			console.log(`yt-dlp process exited with code: ${code}`);
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`yt-dlp exited with code ${code}\nStderr: ${stderr}`));
			}
		});
	});
};

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
		const request = https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', response => {
			if (response.statusCode !== 200) {
				fs.unlinkSync(ytDlpPath);
				throw new Error(`Failed to download yt-dlp: ${response.statusCode}`);
			}
			
			response.pipe(file);
			
			file.on('finish', () => {
				file.close();
				try {
					fs.chmodSync(ytDlpPath, '755');
					console.log('yt-dlp downloaded and made executable');
					
					// Verify the download immediately
					exec(`"${ytDlpPath}" --version`, (error, stdout, stderr) => {
						if (error) {
							console.error('Error verifying yt-dlp:', error);
							if (fs.existsSync(ytDlpPath)) {
								fs.unlinkSync(ytDlpPath);
							}
						} else {
							console.log('yt-dlp verified, version:', stdout.trim());
						}
					});
				} catch (chmodError) {
					console.error('Error making yt-dlp executable:', chmodError);
					if (fs.existsSync(ytDlpPath)) {
						fs.unlinkSync(ytDlpPath);
					}
				}
			});
		});

		request.on('error', err => {
			console.error('Error downloading yt-dlp:', err);
			if (fs.existsSync(ytDlpPath)) {
				fs.unlinkSync(ytDlpPath);
			}
		});
	} catch (error) {
		console.error('Error setting up yt-dlp:', error);
		if (fs.existsSync(ytDlpPath)) {
			fs.unlinkSync(ytDlpPath);
		}
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
		const cookiesPath = path.join(tmpDir, "cookies.txt");

		// Create a more realistic cookies.txt file with proper Netscape format
		const cookieContent = `# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
# This is a generated file!  Do not edit.

youtube.com	TRUE	/	FALSE	2597573456	CONSENT	YES+cb.20240101-17-p0.en+FX+${Math.floor(Math.random() * 900) + 100}
youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 3600 * 24 * 365}	VISITOR_INFO1_LIVE	${Math.random().toString(36).substring(2, 15)}
youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 3600 * 24 * 365}	LOGIN_INFO	${Math.random().toString(36).substring(2, 15)}
youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 3600 * 24 * 365}	YSC	${Math.random().toString(36).substring(2, 15)}
youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 3600 * 24 * 365}	PREF	f4=${Math.floor(Math.random() * 10000)}
.youtube.com	TRUE	/	FALSE	${Math.floor(Date.now() / 1000) + 3600 * 24 * 365}	GPS	1`;

		fs.writeFileSync(cookiesPath, cookieContent, 'utf8');

		console.log("Downloading video using yt-dlp at:", ytDlpPath);

		// Download video with yt-dlp using the helper function
		await executeYtDlp([
			'--format', 'best[height<=720][ext=mp4]/worst[height>=360][ext=mp4]/worst[ext=mp4]/best',
			'--force-ipv4',
			'--cookies', cookiesPath,
			'--no-check-certificates',
			'--no-cache-dir',
			'--no-warnings',
			'--prefer-insecure',
			'--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'--referer', 'https://www.youtube.com/',
			'--add-header', 'Accept-Language:en-US,en;q=0.9',
			'--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
			'--add-header', 'Accept-Encoding:gzip, deflate',
			'--add-header', 'DNT:1',
			'--add-header', 'Connection:keep-alive',
			'--add-header', 'Upgrade-Insecure-Requests:1',
			'--add-header', 'Sec-Fetch-Site:same-origin',
			'--add-header', 'Sec-Fetch-Mode:navigate',
			'--add-header', 'Sec-Fetch-User:?1',
			'--add-header', 'Sec-Fetch-Dest:document',
			'--geo-bypass',
			'--no-playlist',
			'--extractor-args', 'youtube:player_client=android,web',
			'--output', videoPath,
			'--no-part',
			'--no-mtime',
			'--ignore-errors',
			'--abort-on-error',
			'--socket-timeout', '30',
			'--retries', '3',
			'--sleep-requests', '1',
			'--sleep-interval', '5',
			'--max-sleep-interval', '10',
			'--sleep-subtitles', '1',
			url
		], tmpDir);

		console.log("Starting to trim the video...");

		// Trim with ffmpeg
		await new Promise((resolve, reject) => {
			ffmpeg(videoPath)
				.seekInput(startSec)
				.duration(endSec - startSec)
				.output(outputPath)
				.on('end', resolve)
				.on('error', reject)
				.run();
		});

		console.log("Streaming the trimmed video...");
		res.setHeader("Content-Type", "video/mp4");
		res.setHeader("Content-Disposition", 'attachment; filename="trimmed.mp4"');
		const readStream = fs.createReadStream(outputPath);
		readStream.pipe(res);
		readStream.on("close", () => {
			console.log("Streaming finished, cleaning up...");
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
