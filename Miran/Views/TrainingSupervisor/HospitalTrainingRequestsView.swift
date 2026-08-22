import SwiftUI

struct HospitalTrainingRequestsView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var scheme

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background(for: scheme).ignoresSafeArea()

                if store.trainingRequestsLoading && store.trainingRequests.isEmpty {
                    ProgressView("Loading requests...")
                        .tint(MiranTheme.primary)
                } else if let error = store.trainingRequestsError, store.trainingRequests.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.title)
                            .foregroundColor(MiranTheme.warning)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(MiranTheme.secondaryText(for: scheme))
                            .multilineTextAlignment(.center)
                        Button("Retry") { Task { await store.fetchTrainingRequests() } }
                            .buttonStyle(.borderedProminent)
                    }
                    .padding()
                } else if store.trainingRequests.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "tray")
                            .font(.title)
                            .foregroundColor(MiranTheme.secondaryText(for: scheme))
                        Text("No incoming requests")
                            .font(.subheadline)
                            .foregroundColor(MiranTheme.secondaryText(for: scheme))
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(store.trainingRequests) { request in
                                NavigationLink(destination: TrainingRequestDetailView(requestID: request.id)) {
                                    TrainingRequestRowView(request: request)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding()
                    }
                    .refreshable { await store.fetchTrainingRequests() }
                }
            }
            .navigationTitle("Incoming requests")
            .navigationBarTitleDisplayMode(.inline)
            .task { await store.fetchTrainingRequests() }
        }
    }
}
