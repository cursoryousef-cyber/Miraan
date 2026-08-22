import SwiftUI

struct NotificationsView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.colorScheme) var scheme

    var body: some View {
        NavigationView {
            ZStack {
                MiranTheme.background(for: scheme).ignoresSafeArea()

                if store.apiNotifications.isEmpty {
                    emptyState(title: "No notifications", icon: "bell.slash")
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(store.apiNotifications) { notification in
                                notificationRow(notification)
                            }
                        }
                        .padding()
                    }
                    .refreshable { await store.refreshNotifications() }
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Read all") {
                        Task { try? await store.markAllNotificationsRead() }
                    }
                    .disabled(store.apiNotifications.allSatisfy(\.isRead))
                }
            }
            .task { await store.refreshNotifications() }
        }
    }

    private func emptyState(title: String, icon: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.title)
                .foregroundColor(MiranTheme.secondaryText(for: scheme))
            Text(title)
                .font(.subheadline)
                .foregroundColor(MiranTheme.secondaryText(for: scheme))
        }
    }

    @ViewBuilder
    private func notificationRow(_ notification: NotificationModel) -> some View {
        let content = HStack(alignment: .top, spacing: 12) {
            Image(systemName: notification.isRead ? "bell" : "bell.badge.fill")
                .foregroundColor(notification.isRead ? MiranTheme.secondaryText(for: scheme) : MiranTheme.primary)
            VStack(alignment: .leading, spacing: 5) {
                Text(notification.titleAr)
                    .font(.subheadline.bold())
                    .foregroundColor(MiranTheme.primaryText(for: scheme))
                if let body = notification.bodyAr, !body.isEmpty {
                    Text(body)
                        .font(.caption)
                        .foregroundColor(MiranTheme.secondaryText(for: scheme))
                }
                Text(notification.createdAt)
                    .font(.caption2)
                    .foregroundColor(MiranTheme.disabledText(for: scheme))
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(MiranTheme.surface(for: scheme))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(MiranTheme.border(for: scheme)))
        .cornerRadius(12)

        if let id = notification.referenceId, notification.referenceType == "TrainingRequest" {
            NavigationLink(destination: TrainingRequestDetailView(requestID: id)) {
                content
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded {
                Task { try? await store.markNotificationRead(id: notification.id) }
            })
        } else {
            Button {
                Task { try? await store.markNotificationRead(id: notification.id) }
            } label: {
                content
            }
            .buttonStyle(.plain)
        }
    }
}
