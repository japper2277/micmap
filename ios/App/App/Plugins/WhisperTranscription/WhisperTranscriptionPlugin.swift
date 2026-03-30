import Capacitor
import UIKit

@objc(WhisperTranscriptionPlugin)
public class WhisperTranscriptionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WhisperTranscriptionPlugin"
    public let jsName = "WhisperTranscription"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentRecorder", returnType: CAPPluginReturnPromise)
    ]

    @objc func getStatus(_ call: CAPPluginCall) {
        let recorder = RecorderViewController()
        recorder.checkStatus { status in
            call.resolve([
                "available": status.available,
                "platform": status.platform,
                "modelReady": status.modelReady,
                "microphonePermission": status.microphonePermission
            ])
        }
    }

    @objc func presentRecorder(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let recorder = RecorderViewController()
            recorder.onComplete = { result in
                if let result = result {
                    call.resolve([
                        "id": result.id,
                        "createdAt": result.createdAt,
                        "durationSec": result.durationSec,
                        "transcript": result.transcript,
                        "language": result.language
                    ])
                } else {
                    call.resolve([:])
                }
            }
            recorder.modalPresentationStyle = .fullScreen
            self.bridge?.viewController?.present(recorder, animated: true)
        }
    }
}
