import UIKit
import AVFoundation
import WhisperKit

struct TranscriptRecord {
    let id: String
    let createdAt: String
    let durationSec: Double
    let transcript: String
    let language: String
}

struct TranscriptionStatus {
    let available: Bool
    let platform: String
    let modelReady: Bool
    let microphonePermission: String
}

class RecorderViewController: UIViewController {

    var onComplete: ((TranscriptRecord?) -> Void)?

    private var audioRecorder: AVAudioRecorder?
    private var whisperKit: WhisperKit?
    private var recordingURL: URL?
    private var recordingStartTime: Date?
    private var displayLink: CADisplayLink?

    // UI elements
    private let statusLabel = UILabel()
    private let timerLabel = UILabel()
    private let recordButton = UIButton(type: .system)
    private let transcriptTextView = UITextView()
    private let closeButton = UIButton(type: .system)
    private let copyButton = UIButton(type: .system)
    private let activityIndicator = UIActivityIndicatorView(style: .large)
    private let progressBar = UIProgressView(progressViewStyle: .default)

    private enum RecorderState {
        case loading
        case ready
        case recording
        case transcribing
        case done
        case error(String)
    }

    private var state: RecorderState = .loading {
        didSet { updateUI() }
    }

    private var currentTranscript: String = ""

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadWhisperKit()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        displayLink?.invalidate()
        audioRecorder?.stop()
    }

    // MARK: - Status check (used by plugin without presenting)

    func checkStatus(completion: @escaping (TranscriptionStatus) -> Void) {
        let micStatus: String
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: micStatus = "granted"
        case .denied: micStatus = "denied"
        case .undetermined: micStatus = "prompt"
        @unknown default: micStatus = "prompt"
        }

        // Quick check if WhisperKit can initialize
        let status = TranscriptionStatus(
            available: true,
            platform: "ios",
            modelReady: whisperKit != nil,
            microphonePermission: micStatus
        )
        completion(status)
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = UIColor.systemBackground

        // Close button
        closeButton.setTitle("Cancel", for: .normal)
        closeButton.titleLabel?.font = .systemFont(ofSize: 17)
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(closeButton)

        // Title
        let titleLabel = UILabel()
        titleLabel.text = "Record Set"
        titleLabel.font = .systemFont(ofSize: 28, weight: .bold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        // Status label
        statusLabel.text = "Loading model..."
        statusLabel.font = .systemFont(ofSize: 15)
        statusLabel.textColor = .secondaryLabel
        statusLabel.textAlignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        // Timer
        timerLabel.text = "0:00"
        timerLabel.font = .monospacedDigitSystemFont(ofSize: 48, weight: .light)
        timerLabel.textAlignment = .center
        timerLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(timerLabel)

        // Record button
        recordButton.translatesAutoresizingMaskIntoConstraints = false
        recordButton.addTarget(self, action: #selector(recordTapped), for: .touchUpInside)
        styleRecordButton(recording: false)
        view.addSubview(recordButton)

        // Activity indicator
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.hidesWhenStopped = true
        view.addSubview(activityIndicator)

        // Progress bar
        progressBar.translatesAutoresizingMaskIntoConstraints = false
        progressBar.progressTintColor = .systemRed
        progressBar.trackTintColor = .systemGray5
        progressBar.isHidden = true
        progressBar.layer.cornerRadius = 4
        progressBar.clipsToBounds = true
        view.addSubview(progressBar)

        // Transcript text view
        transcriptTextView.font = .systemFont(ofSize: 16)
        transcriptTextView.isEditable = false
        transcriptTextView.isHidden = true
        transcriptTextView.layer.cornerRadius = 12
        transcriptTextView.backgroundColor = .secondarySystemBackground
        transcriptTextView.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
        transcriptTextView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(transcriptTextView)

        // Copy button
        copyButton.setTitle("Copy Transcript", for: .normal)
        copyButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        copyButton.backgroundColor = .systemBlue
        copyButton.setTitleColor(.white, for: .normal)
        copyButton.layer.cornerRadius = 12
        copyButton.isHidden = true
        copyButton.addTarget(self, action: #selector(copyTapped), for: .touchUpInside)
        copyButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(copyButton)

        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),

            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            statusLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            timerLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            timerLabel.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 40),

            recordButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            recordButton.topAnchor.constraint(equalTo: timerLabel.bottomAnchor, constant: 40),
            recordButton.widthAnchor.constraint(equalToConstant: 80),
            recordButton.heightAnchor.constraint(equalToConstant: 80),

            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.topAnchor.constraint(equalTo: recordButton.bottomAnchor, constant: 20),

            progressBar.topAnchor.constraint(equalTo: recordButton.bottomAnchor, constant: 24),
            progressBar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            progressBar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40),
            progressBar.heightAnchor.constraint(equalToConstant: 8),

            transcriptTextView.topAnchor.constraint(equalTo: recordButton.bottomAnchor, constant: 24),
            transcriptTextView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            transcriptTextView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            transcriptTextView.bottomAnchor.constraint(equalTo: copyButton.topAnchor, constant: -16),

            copyButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            copyButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            copyButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            copyButton.heightAnchor.constraint(equalToConstant: 50)
        ])
    }

    private func styleRecordButton(recording: Bool) {
        if recording {
            recordButton.setTitle(nil, for: .normal)
            recordButton.backgroundColor = .systemRed
            recordButton.layer.cornerRadius = 12
            // Stop square icon
            let config = UIImage.SymbolConfiguration(pointSize: 28, weight: .bold)
            recordButton.setImage(UIImage(systemName: "stop.fill", withConfiguration: config), for: .normal)
            recordButton.tintColor = .white
        } else {
            recordButton.setTitle(nil, for: .normal)
            recordButton.backgroundColor = .systemRed
            recordButton.layer.cornerRadius = 40
            let config = UIImage.SymbolConfiguration(pointSize: 28, weight: .bold)
            recordButton.setImage(UIImage(systemName: "mic.fill", withConfiguration: config), for: .normal)
            recordButton.tintColor = .white
        }
    }

    private func updateUI() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            switch self.state {
            case .loading:
                self.statusLabel.text = "Downloading transcription model..."
                self.recordButton.isEnabled = false
                self.recordButton.alpha = 0.5
                self.activityIndicator.startAnimating()
                self.progressBar.isHidden = false
                self.progressBar.progress = 0
                self.transcriptTextView.isHidden = true
                self.copyButton.isHidden = true

            case .ready:
                self.statusLabel.text = "Tap to record your set"
                self.recordButton.isEnabled = true
                self.recordButton.alpha = 1.0
                self.activityIndicator.stopAnimating()
                self.progressBar.isHidden = true
                self.styleRecordButton(recording: false)

            case .recording:
                self.statusLabel.text = "Recording..."
                self.styleRecordButton(recording: true)
                self.activityIndicator.stopAnimating()

            case .transcribing:
                self.statusLabel.text = "Transcribing..."
                self.recordButton.isEnabled = false
                self.recordButton.alpha = 0.5
                self.activityIndicator.startAnimating()
                self.styleRecordButton(recording: false)

            case .done:
                self.statusLabel.text = "Transcription complete"
                self.activityIndicator.stopAnimating()
                self.recordButton.isHidden = true
                self.timerLabel.isHidden = true
                self.transcriptTextView.isHidden = false
                self.transcriptTextView.text = self.currentTranscript
                self.copyButton.isHidden = false
                self.closeButton.setTitle("Done", for: .normal)

            case .error(let msg):
                self.statusLabel.text = msg
                self.recordButton.isEnabled = true
                self.recordButton.alpha = 1.0
                self.activityIndicator.stopAnimating()
                self.styleRecordButton(recording: false)
            }
        }
    }

    // MARK: - WhisperKit

    private func loadWhisperKit() {
        state = .loading
        Task {
            do {
                // Step 1: Download model with progress
                let modelFolder = try await WhisperKit.download(
                    variant: "openai_whisper-large-v3-v20240930_547MB",
                    progressCallback: { [weak self] progress in
                        let fraction = Float(progress.fractionCompleted)
                        DispatchQueue.main.async {
                            self?.progressBar.progress = fraction
                            let mb = Int(progress.completedUnitCount / 1_000_000)
                            let totalMb = Int(progress.totalUnitCount / 1_000_000)
                            if totalMb > 0 {
                                self?.statusLabel.text = "Downloading model... \(mb)/\(totalMb) MB"
                            }
                        }
                    }
                )

                DispatchQueue.main.async {
                    self.statusLabel.text = "Loading model..."
                    self.progressBar.isHidden = true
                }

                // Step 2: Init with downloaded folder
                let config = WhisperKitConfig(
                    modelFolder: modelFolder.path,
                    verbose: false,
                    prewarm: true,
                    load: true,
                    download: false
                )
                self.whisperKit = try await WhisperKit(config)
                self.state = .ready
            } catch {
                self.state = .error("Failed to load model: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Recording

    @objc private func recordTapped() {
        switch state {
        case .recording:
            stopRecording()
        case .ready, .error:
            requestMicAndRecord()
        default:
            break
        }
    }

    private func requestMicAndRecord() {
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                if granted {
                    self?.startRecording()
                } else {
                    self?.state = .error("Microphone access denied. Enable in Settings.")
                }
            }
        }
    }

    private func startRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            state = .error("Audio session error: \(error.localizedDescription)")
            return
        }

        let tempDir = FileManager.default.temporaryDirectory
        let filename = "set_\(UUID().uuidString).m4a"
        recordingURL = tempDir.appendingPathComponent(filename)

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: recordingURL!, settings: settings)
            audioRecorder?.record()
            recordingStartTime = Date()
            state = .recording
            startTimer()
        } catch {
            state = .error("Recording error: \(error.localizedDescription)")
        }
    }

    private func stopRecording() {
        audioRecorder?.stop()
        displayLink?.invalidate()
        displayLink = nil
        transcribe()
    }

    private func startTimer() {
        displayLink = CADisplayLink(target: self, selector: #selector(updateTimer))
        displayLink?.add(to: .main, forMode: .common)
    }

    @objc private func updateTimer() {
        guard let start = recordingStartTime else { return }
        let elapsed = Date().timeIntervalSince(start)
        let minutes = Int(elapsed) / 60
        let seconds = Int(elapsed) % 60
        timerLabel.text = String(format: "%d:%02d", minutes, seconds)
    }

    // MARK: - Transcription

    private func transcribe() {
        guard let url = recordingURL, let whisper = whisperKit else {
            state = .error("No recording or model not ready")
            return
        }

        state = .transcribing
        let duration = Date().timeIntervalSince(recordingStartTime ?? Date())

        Task {
            do {
                let results = try await whisper.transcribe(audioPath: url.path)
                let text = results.map { $0.text }.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)

                let record = TranscriptRecord(
                    id: UUID().uuidString,
                    createdAt: ISO8601DateFormatter().string(from: Date()),
                    durationSec: duration,
                    transcript: text,
                    language: "en"
                )

                self.currentTranscript = text
                self.state = .done

                // Save locally
                TranscriptStorage.save(record)
            } catch {
                self.state = .error("Transcription failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Actions

    @objc private func closeTapped() {
        if case .done = state {
            let record = TranscriptRecord(
                id: UUID().uuidString,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                durationSec: 0,
                transcript: currentTranscript,
                language: "en"
            )
            dismiss(animated: true) { [weak self] in
                self?.onComplete?(record)
            }
        } else {
            dismiss(animated: true) { [weak self] in
                self?.onComplete?(nil)
            }
        }
    }

    @objc private func copyTapped() {
        UIPasteboard.general.string = currentTranscript
        let originalTitle = copyButton.title(for: .normal)
        copyButton.setTitle("Copied!", for: .normal)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.copyButton.setTitle(originalTitle, for: .normal)
        }
    }
}
