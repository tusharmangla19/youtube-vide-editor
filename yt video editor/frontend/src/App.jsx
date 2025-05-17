import { useState, useEffect, useRef } from "react";
import axios from "axios";
import ReactPlayer from "react-player";
import config from './config';

function App() {
	const [activeTab, setActiveTab] = useState("trim");

	// Common states
	const [processing, setProcessing] = useState(false);

	// Preview states
	const [videoPreview, setVideoPreview] = useState(null);
	const [videoDuration, setVideoDuration] = useState(0);
	const [videoLoaded, setVideoLoaded] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const playerRef = useRef(null);

	// Trim states
	const [url, setUrl] = useState("");
	const [startTime, setStartTime] = useState(0);
	const [endTime, setEndTime] = useState(0);
	const [startTimeStr, setStartTimeStr] = useState("00:00:00");
	const [endTimeStr, setEndTimeStr] = useState("00:00:00");

	// Merge states
	const [url1, setUrl1] = useState("");
	const [url2, setUrl2] = useState("");
	const [preview1, setPreview1] = useState(null);
	const [preview2, setPreview2] = useState(null);

	// Extract Audio states
	const [audioUrl, setAudioUrl] = useState("");
	const [audioPreview, setAudioPreview] = useState(null);

	// Speed states
	const [speedUrl, setSpeedUrl] = useState("");
	const [speed, setSpeed] = useState(1);
	const [speedPreview, setSpeedPreview] = useState(null);

	// Add Music states
	const [videoUrl, setVideoUrl] = useState("");
	const [musicUrl, setMusicUrl] = useState("");
	const [videoMusicPreview, setVideoMusicPreview] = useState(null);
	const [musicPreview, setMusicPreview] = useState(null);

	// Helper functions
	const formatTime = (seconds) => {
		if (isNaN(seconds)) return "00:00:00";

		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);

		return [
			h.toString().padStart(2, "0"),
			m.toString().padStart(2, "0"),
			s.toString().padStart(2, "0"),
		].join(":");
	};

	const parseTimeString = (timeStr) => {
		const parts = timeStr.split(":").map(Number);
		if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
		if (parts.length === 2) return parts[0] * 60 + parts[1];
		return parts[0] || 0;
	};

	// Update time strings when slider values change
	useEffect(() => {
		setStartTimeStr(formatTime(startTime));
	}, [startTime]);

	useEffect(() => {
		setEndTimeStr(formatTime(endTime));
	}, [endTime]);

	// Handle URL changes for video previews
	useEffect(() => {
		if (url && ReactPlayer.canPlay(url)) {
			setVideoPreview(url);
		} else {
			setVideoPreview(null);
		}
	}, [url]);

	useEffect(() => {
		if (url1 && ReactPlayer.canPlay(url1)) {
			setPreview1(url1);
		} else {
			setPreview1(null);
		}
	}, [url1]);

	useEffect(() => {
		if (url2 && ReactPlayer.canPlay(url2)) {
			setPreview2(url2);
		} else {
			setPreview2(null);
		}
	}, [url2]);

	useEffect(() => {
		if (audioUrl && ReactPlayer.canPlay(audioUrl)) {
			setAudioPreview(audioUrl);
		} else {
			setAudioPreview(null);
		}
	}, [audioUrl]);

	useEffect(() => {
		if (speedUrl && ReactPlayer.canPlay(speedUrl)) {
			setSpeedPreview(speedUrl);
		} else {
			setSpeedPreview(null);
		}
	}, [speedUrl]);

	useEffect(() => {
		if (videoUrl && ReactPlayer.canPlay(videoUrl)) {
			setVideoMusicPreview(videoUrl);
		} else {
			setVideoMusicPreview(null);
		}
	}, [videoUrl]);

	useEffect(() => {
		if (musicUrl && ReactPlayer.canPlay(musicUrl)) {
			setMusicPreview(musicUrl);
		} else {
			setMusicPreview(null);
		}
	}, [musicUrl]);

	// Set end time when video duration is available
	useEffect(() => {
		if (videoDuration > 0) {
			setEndTime(videoDuration);
			setEndTimeStr(formatTime(videoDuration));
		}
	}, [videoDuration]);

	// Helper to download blob
	const downloadBlob = (blobData, filename, mimeType) => {
		const blob = new Blob([blobData], { type: mimeType });
		const link = document.createElement("a");
		link.href = window.URL.createObjectURL(blob);
		link.download = filename;
		link.click();
	};

	// Seek to specific time
	const seekTo = (time) => {
		if (playerRef.current) {
			playerRef.current.seekTo(time);
		}
	};

	// Handle time input changes
	const handleStartTimeInput = (e) => {
		const newStartTimeStr = e.target.value;
		setStartTimeStr(newStartTimeStr);
		const newStartTime = parseTimeString(newStartTimeStr);
		if (!isNaN(newStartTime) && newStartTime >= 0 && newStartTime < endTime) {
			setStartTime(newStartTime);
		}
	};

	const handleEndTimeInput = (e) => {
		const newEndTimeStr = e.target.value;
		setEndTimeStr(newEndTimeStr);
		const newEndTime = parseTimeString(newEndTimeStr);
		if (
			!isNaN(newEndTime) &&
			newEndTime > startTime &&
			newEndTime <= videoDuration
		) {
			setEndTime(newEndTime);
		}
	};

	// Player event handlers
	const handleDuration = (duration) => {
		setVideoDuration(duration);
	};

	const handleReady = () => {
		setVideoLoaded(true);
	};

	// Trim video function
	const handleTrim = async () => {
		if (!url || startTime === undefined || endTime === undefined) {
			alert("Please fill all fields for trimming!");
			return;
		}

		try {
			setProcessing(true);
			const response = await axios.post(
				`${config.apiUrl}/trim`,
				{ url, start: startTime, end: endTime },
				{ responseType: "blob" }
			);

			downloadBlob(response.data, "clip.mp4", "video/mp4");
		} catch (error) {
			console.error("Trim failed", error);
			alert("Failed to trim video");
		} finally {
			setProcessing(false);
		}
	};

	// Merge videos function
	const handleMerge = async () => {
		if (!url1 || !url2) {
			alert("Please enter both YouTube links for merging!");
			return;
		}

		try {
			setProcessing(true);
			const response = await axios.post(
				`${config.apiUrl}/merge`,
				{ url1, url2 },
				{ responseType: "blob" }
			);

			downloadBlob(response.data, "merged.mp4", "video/mp4");
		} catch (error) {
			console.error("Merge failed", error);
			alert("Failed to merge videos");
		} finally {
			setProcessing(false);
		}
	};

	// Extract Audio function
	const handleExtractAudio = async () => {
		if (!audioUrl) {
			alert("Please enter YouTube link to extract audio!");
			return;
		}

		try {
			setProcessing(true);
			const response = await axios.post(
				`${config.apiUrl}/extract-audio`,
				{ url: audioUrl },
				{ responseType: "blob" }
			);

			downloadBlob(response.data, "audio.mp3", "audio/mpeg");
		} catch (error) {
			console.error("Audio extraction failed", error);
			alert("Failed to extract audio");
		} finally {
			setProcessing(false);
		}
	};

	// Change Speed function
	const handleSpeedChange = async () => {
		if (!speedUrl || !speed) {
			alert("Please enter YouTube link and speed!");
			return;
		}

		try {
			setProcessing(true);
			const response = await axios.post(
				`${config.apiUrl}/speed`,
				{ url: speedUrl, speed: parseFloat(speed) },
				{ responseType: "blob" }
			);

			downloadBlob(response.data, "speed.mp4", "video/mp4");
		} catch (error) {
			console.error("Speed change failed", error);
			alert("Failed to change speed");
		} finally {
			setProcessing(false);
		}
	};

	// Add Music function
	const handleAddMusic = async () => {
		if (!videoUrl || !musicUrl) {
			alert("Please enter both video and music URLs!");
			return;
		}

		try {
			setProcessing(true);
			const response = await axios.post(
				`${config.apiUrl}/add-music`,
				{ url: videoUrl, musicUrl },
				{ responseType: "blob" }
			);

			downloadBlob(response.data, "with-music.mp4", "video/mp4");
		} catch (error) {
			console.error("Add music failed", error);
			alert("Failed to add background music");
		} finally {
			setProcessing(false);
		}
	};

	const playSelectedPortion = () => {
		if (playerRef.current) {
			playerRef.current.seekTo(startTime);
			setIsPlaying(true);
		}
	};

	return (
		<div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
			<h2>🎬 YouTube Video Editor</h2>

			{/* Tabs */}
			<div
				style={{ display: "flex", marginBottom: 20, flexWrap: "wrap", gap: 5 }}
			>
				{["trim", "merge", "extract-audio", "speed", "add-music"].map((tab) => (
					<button
						key={tab}
						onClick={() => setActiveTab(tab)}
						style={{
							flex: 1,
							padding: "10px",
							backgroundColor: activeTab === tab ? "#6200ea" : "#e0e0e0",
							color: activeTab === tab ? "white" : "black",
							border: "none",
							cursor: "pointer",
							borderRadius: "4px",
						}}
					>
						{tab.replace("-", " ").toUpperCase()}
					</button>
				))}
			</div>

			{/* TRIM */}
			{activeTab === "trim" && (
				<div>
					<input
						type="text"
						placeholder="YouTube Link"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						style={inputStyle}
					/>

					{/* Video Preview */}
					{videoPreview && (
						<div style={{ marginBottom: 15 }}>
							<div
								style={{
									position: "relative",
									paddingBottom: "56.25%",
									height: 0,
									marginBottom: 10,
								}}
							>
								<ReactPlayer
									ref={playerRef}
									url={videoPreview}
									width="100%"
									height="100%"
									style={{ position: "absolute", top: 0, left: 0 }}
									controls={true}
									playing={isPlaying}
									onDuration={handleDuration}
									onReady={handleReady}
									onPause={() => setIsPlaying(false)}
									onEnded={() => setIsPlaying(false)}
									config={{
										youtube: {
											playerVars: { disablekb: 1 },
										},
									}}
								/>
							</div>

							{videoLoaded && (
								<div>
									{/* Custom Seek Timeline */}
									<div style={{ margin: "20px 0" }}>
										<div style={{ position: "relative", height: "60px" }}>
											{/* Timeline container */}
											<div
												style={{
													position: "relative",
													height: "20px",
													backgroundColor: "#e0e0e0",
													borderRadius: "10px",
													marginTop: "20px",
												}}
											>
												{/* Selected timeline portion */}
												<div
													style={{
														position: "absolute",
														left: `${(startTime / videoDuration) * 100}%`,
														width: `${
															((endTime - startTime) / videoDuration) * 100
														}%`,
														height: "100%",
														backgroundColor: "#6200ea",
														borderRadius: "10px",
													}}
												/>

												{/* Start handle */}
												<input
													type="range"
													min={0}
													max={videoDuration}
													step={0.01}
													value={startTime}
													onChange={(e) => {
														const newStart = parseFloat(e.target.value);
														if (newStart < endTime) {
															setStartTime(newStart);
															seekTo(newStart);
														}
													}}
													style={{
														position: "absolute",
														width: "100%",
														top: "-10px",
														margin: 0,
														pointerEvents: "auto",
														opacity: 0.01,
														cursor: "pointer",
														zIndex: 2,
													}}
												/>

												{/* End handle */}
												<input
													type="range"
													min={0}
													max={videoDuration}
													step={0.01}
													value={endTime}
													onChange={(e) => {
														const newEnd = parseFloat(e.target.value);
														if (newEnd > startTime) {
															setEndTime(newEnd);
															seekTo(newEnd);
														}
													}}
													style={{
														position: "absolute",
														width: "100%",
														top: "-10px",
														margin: 0,
														pointerEvents: "auto",
														opacity: 0.01,
														cursor: "pointer",
														zIndex: 2,
													}}
												/>

												{/* Start handle visual indicator */}
												<div
													style={{
														position: "absolute",
														left: `calc(${
															(startTime / videoDuration) * 100
														}% - 10px)`,
														top: "-10px",
														width: "20px",
														height: "40px",
														backgroundColor: "#4caf50",
														borderRadius: "4px",
														cursor: "grab",
														zIndex: 3,
													}}
												/>

												{/* End handle visual indicator */}
												<div
													style={{
														position: "absolute",
														left: `calc(${
															(endTime / videoDuration) * 100
														}% - 10px)`,
														top: "-10px",
														width: "20px",
														height: "40px",
														backgroundColor: "#f44336",
														borderRadius: "4px",
														cursor: "grab",
														zIndex: 3,
													}}
												/>
											</div>
											<div
												style={{
													marginTop: 30,
													display: "flex",
													justifyContent: "space-between",
													alignItems: "center",
												}}
											>
												<div style={{ display: "flex", alignItems: "center" }}>
													<div
														style={{
															marginRight: 5,
															color: "#4caf50",
															fontWeight: "bold",
														}}
													>
														Start:
													</div>
													<input
														type="text"
														value={startTimeStr}
														onChange={handleStartTimeInput}
														style={{
															...inputStyle,
															width: "100px",
															marginBottom: 0,
															textAlign: "center",
														}}
													/>
												</div>
												<button
													onClick={playSelectedPortion}
													style={{
														padding: "8px 15px",
														backgroundColor: "#6200ea",
														color: "white",
														border: "none",
														borderRadius: "4px",
														cursor: "pointer",
													}}
												>
													Play Selection
												</button>
												<div style={{ display: "flex", alignItems: "center" }}>
													<div
														style={{
															marginRight: 5,
															color: "#f44336",
															fontWeight: "bold",
														}}
													>
														End:
													</div>
													<input
														type="text"
														value={endTimeStr}
														onChange={handleEndTimeInput}
														style={{
															...inputStyle,
															width: "100px",
															marginBottom: 0,
															textAlign: "center",
														}}
													/>
												</div>
											</div>
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					<button
						onClick={handleTrim}
						disabled={processing || !videoLoaded}
						style={buttonStyle("#4caf50", processing || !videoLoaded)}
					>
						{processing ? "Processing..." : "Download Clip"}
					</button>
				</div>
			)}

			{/* MERGE */}
			{activeTab === "merge" && (
				<div>
					<div style={{ marginBottom: 15 }}>
						<input
							type="text"
							placeholder="First YouTube Link"
							value={url1}
							onChange={(e) => setUrl1(e.target.value)}
							style={inputStyle}
						/>
						{preview1 && (
							<div
								style={{
									position: "relative",
									paddingBottom: "28.125%",
									height: 0,
									marginBottom: 15,
								}}
							>
								<ReactPlayer
									url={preview1}
									width="100%"
									height="100%"
									style={{ position: "absolute", top: 0, left: 0 }}
									controls={true}
									light={true}
									config={{
										youtube: {
											playerVars: { modestbranding: 1 },
										},
									}}
								/>
							</div>
						)}
					</div>

					<div style={{ marginBottom: 15 }}>
						<input
							type="text"
							placeholder="Second YouTube Link"
							value={url2}
							onChange={(e) => setUrl2(e.target.value)}
							style={inputStyle}
						/>
						{preview2 && (
							<div
								style={{
									position: "relative",
									paddingBottom: "28.125%",
									height: 0,
									marginBottom: 15,
								}}
							>
								<ReactPlayer
									url={preview2}
									width="100%"
									height="100%"
									style={{ position: "absolute", top: 0, left: 0 }}
									controls={true}
									light={true}
									config={{
										youtube: {
											playerVars: { modestbranding: 1 },
										},
									}}
								/>
							</div>
						)}
					</div>

					<button
						onClick={handleMerge}
						disabled={processing}
						style={buttonStyle("#2196f3", processing)}
					>
						{processing ? "Merging..." : "Merge Videos"}
					</button>
				</div>
			)}

			{/* EXTRACT AUDIO */}
			{activeTab === "extract-audio" && (
				<div>
					<input
						type="text"
						placeholder="YouTube Link"
						value={audioUrl}
						onChange={(e) => setAudioUrl(e.target.value)}
						style={inputStyle}
					/>

					{audioPreview && (
						<div style={{ marginBottom: 15 }}>
							<ReactPlayer
								url={audioPreview}
								width="100%"
								height="50px"
								controls={true}
								config={{
									youtube: {
										playerVars: { modestbranding: 1 },
									},
								}}
							/>
						</div>
					)}

					<button
						onClick={handleExtractAudio}
						disabled={processing}
						style={buttonStyle("#ff5722", processing)}
					>
						{processing ? "Extracting..." : "Extract Audio"}
					</button>
				</div>
			)}

			{/* SPEED CONTROL */}
			{activeTab === "speed" && (
				<div>
					<input
						type="text"
						placeholder="YouTube Link"
						value={speedUrl}
						onChange={(e) => setSpeedUrl(e.target.value)}
						style={inputStyle}
					/>

					{speedPreview && (
						<div style={{ marginBottom: 15 }}>
							<div
								style={{
									position: "relative",
									paddingBottom: "56.25%",
									height: 0,
								}}
							>
								<ReactPlayer
									url={speedPreview}
									width="100%"
									height="100%"
									style={{ position: "absolute", top: 0, left: 0 }}
									controls={true}
									playbackRate={parseFloat(speed) || 1}
									config={{
										youtube: {
											playerVars: { modestbranding: 1 },
										},
									}}
								/>
							</div>
						</div>
					)}

					<div style={{ marginBottom: 15 }}>
						<label
							style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}
						>
							Speed: {speed}x
						</label>
						<input
							type="range"
							min="0.25"
							max="4"
							step="0.25"
							value={speed}
							onChange={(e) => setSpeed(e.target.value)}
							style={{ width: "100%" }}
						/>
					</div>

					<button
						onClick={handleSpeedChange}
						disabled={processing}
						style={buttonStyle("#03a9f4", processing)}
					>
						{processing ? "Changing Speed..." : "Change Speed"}
					</button>
				</div>
			)}

			{/* ADD MUSIC */}
			{activeTab === "add-music" && (
				<div>
					<div style={{ marginBottom: 15 }}>
						<input
							type="text"
							placeholder="Video YouTube Link"
							value={videoUrl}
							onChange={(e) => setVideoUrl(e.target.value)}
							style={inputStyle}
						/>

						{videoMusicPreview && (
							<div
								style={{
									position: "relative",
									paddingBottom: "28.125%",
									height: 0,
									marginBottom: 15,
								}}
							>
								<ReactPlayer
									url={videoMusicPreview}
									width="100%"
									height="100%"
									style={{ position: "absolute", top: 0, left: 0 }}
									controls={true}
									config={{
										youtube: {
											playerVars: { modestbranding: 1 },
										},
									}}
								/>
							</div>
						)}
					</div>

					<div style={{ marginBottom: 15 }}>
						<input
							type="text"
							placeholder="Background Music YouTube Link"
							value={musicUrl}
							onChange={(e) => setMusicUrl(e.target.value)}
							style={inputStyle}
						/>

						{musicPreview && (
							<div style={{ marginBottom: 15 }}>
								<ReactPlayer
									url={musicPreview}
									width="100%"
									height="50px"
									controls={true}
									config={{
										youtube: {
											playerVars: { modestbranding: 1 },
										},
									}}
								/>
							</div>
						)}
					</div>

					<button
						onClick={handleAddMusic}
						disabled={processing}
						style={buttonStyle("#9c27b0", processing)}
					>
						{processing ? "Adding Music..." : "Add Background Music"}
					</button>
				</div>
			)}
		</div>
	);
}

const inputStyle = {
	width: "100%",
	padding: "10px",
	fontSize: "16px",
	marginBottom: "10px",
	borderRadius: "4px",
	border: "1px solid #ccc",
};

const buttonStyle = (color, disabled) => ({
	width: "100%",
	padding: "12px",
	fontSize: "16px",
	backgroundColor: color,
	color: "white",
	border: "none",
	borderRadius: "5px",
	cursor: disabled ? "not-allowed" : "pointer",
	opacity: disabled ? 0.6 : 1,
});

export default App;
