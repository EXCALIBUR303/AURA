import AuraCore
import SwiftUI

struct RootView: View {
    let model: AppModel

    var body: some View {
        switch model.state {
        case .starting:
            ProgressView().controlSize(.large)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .ready(let services):
            StudioWebView(services: services, model: model)
                .ignoresSafeArea()
        case .failed(let message):
            ContentUnavailableView {
                Label("AURA can’t start", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message).font(.callout.monospaced()).textSelection(.enabled)
            }
        }
    }
}
