//
//  MiranStateViews.swift
//  Miran
//
//  Unified Loading / Empty / Error state components.
//  Use these in every screen that fetches from API.
//

import SwiftUI

// MARK: - Loading State

struct MiranLoadingView: View {
    var message: String = "جاري التحميل..."
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
                .scaleEffect(1.3)
                .tint(MiranTheme.emerald)
            Text(message)
                .font(.subheadline)
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
        }
        .frame(maxWidth: .infinity, minHeight: 120)
    }
}

// MARK: - Skeleton Card

struct MiranSkeletonCard: View {
    @State private var animate = false
    @Environment(\.colorScheme) var colorScheme

    var lines: Int = 3

    var body: some View {
        VStack(alignment: .trailing, spacing: 10) {
            ForEach(0..<lines, id: \.self) { i in
                RoundedRectangle(cornerRadius: 6)
                    .fill(shimmerGradient)
                    .frame(maxWidth: i == 0 ? .infinity : CGFloat.random(in: 0.4...0.8) * 300)
                    .frame(height: i == 0 ? 16 : 12)
            }
        }
        .padding()
        .background(MiranTheme.surface(for: colorScheme))
        .cornerRadius(14)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(MiranTheme.border(for: colorScheme), lineWidth: 1))
        .onAppear { withAnimation(.easeInOut(duration: 1.2).repeatForever()) { animate = true } }
    }

    private var shimmerGradient: LinearGradient {
        let base = colorScheme == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.06)
        let highlight = colorScheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.1)
        return LinearGradient(
            colors: animate ? [base, highlight, base] : [base, base, base],
            startPoint: .trailing, endPoint: .leading
        )
    }
}

struct MiranSkeletonList: View {
    var count: Int = 4
    var body: some View {
        VStack(spacing: 10) {
            ForEach(0..<count, id: \.self) { _ in
                MiranSkeletonCard(lines: 2)
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - Empty State

struct MiranEmptyView: View {
    var icon: String = "tray.fill"
    var title: String = "لا توجد بيانات"
    var subtitle: String? = nil
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 44))
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme).opacity(0.5))

            Text(title)
                .font(.headline)
                .foregroundColor(MiranTheme.primaryText(for: colorScheme))

            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .tint(MiranTheme.emerald)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 180)
        .padding()
    }
}

// MARK: - Error State

struct MiranErrorView: View {
    var message: String = "حدث خطأ في تحميل البيانات"
    var retryAction: (() -> Void)? = nil
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 40))
                .foregroundColor(MiranTheme.error)

            Text("تعذّر التحميل")
                .font(.headline)
                .foregroundColor(MiranTheme.primaryText(for: colorScheme))

            Text(message)
                .font(.caption)
                .foregroundColor(MiranTheme.secondaryText(for: colorScheme))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            if let retry = retryAction {
                Button("إعادة المحاولة") { retry() }
                    .buttonStyle(.borderedProminent)
                    .tint(MiranTheme.emerald)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .padding()
    }
}

// MARK: - Async Content Wrapper

enum LoadState<T> {
    case idle
    case loading
    case loaded(T)
    case empty
    case error(String)
}

struct AsyncContentView<T, Content: View, Empty: View>: View {
    let state: LoadState<T>
    let loadingMessage: String
    @ViewBuilder let content: (T) -> Content
    @ViewBuilder let emptyView: () -> Empty
    var retryAction: (() -> Void)? = nil

    init(
        state: LoadState<T>,
        loadingMessage: String = "جاري التحميل...",
        retryAction: (() -> Void)? = nil,
        @ViewBuilder content: @escaping (T) -> Content,
        @ViewBuilder empty: @escaping () -> Empty
    ) {
        self.state = state
        self.loadingMessage = loadingMessage
        self.retryAction = retryAction
        self.content = content
        self.emptyView = empty
    }

    var body: some View {
        switch state {
        case .idle, .loading:
            MiranLoadingView(message: loadingMessage)
        case .loaded(let value):
            content(value)
        case .empty:
            emptyView()
        case .error(let msg):
            MiranErrorView(message: msg, retryAction: retryAction)
        }
    }
}
